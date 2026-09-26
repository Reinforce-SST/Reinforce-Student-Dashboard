"""UID profile creation preserves legacy details and concurrent links."""

import unittest
from unittest.mock import patch

from app.api.v1.endpoints import users
from tests.firestore_fake import DB, Ref

USER = {"email": "member@sst.scaler.com", "uid": "uid-1", "name": "Member"}


class ProfileCreationTests(unittest.TestCase):
    def test_legacy_profile_fields_migrate_without_raw_discord_claim(self):
        db = DB({"users/member@sst.scaler.com": {
            "email": USER["email"], "full_name": "Saved name", "skills": ["Python"],
            "discord_id": "123456789012345678", "is_verified": True,
        }})
        with patch.object(users, "db", db):
            result = users.sync_user(USER)
        self.assertEqual(result.full_name, "Saved name")
        self.assertEqual(result.skills, ["Python"])
        self.assertIsNone(result.discord_id)
        self.assertFalse(result.is_verified)

    def test_owned_legacy_membership_and_reciprocal_link_survive_migration(self):
        discord_id = "123456789012345678"
        db = DB({
            "users/member@sst.scaler.com": {
                "email": USER["email"], "firebase_uid": USER["uid"],
                "full_name": "Saved member", "discord_id": discord_id,
                "discord_link_version": 1, "is_verified": True,
                "is_member": True, "tier": "advanced", "batch_year": 2,
                "points": {"total": 7, "kaggle": 7},
            },
            "users/" + discord_id: {
                "email": USER["email"], "firebase_uid": USER["uid"],
                "discord_id": discord_id, "discord_link_version": 1,
            },
        })
        with patch.object(users, "db", db):
            result = users.sync_user(USER)
        self.assertEqual(result.discord_id, discord_id)
        self.assertTrue(result.is_verified)
        self.assertTrue(result.is_member)
        self.assertEqual(result.tier.value, "advanced")
        self.assertEqual(result.batch_year, 2)
        self.assertEqual(result.points.total, 7)

    def test_concurrent_link_creation_is_not_overwritten(self):
        db = DB()
        path = "users/uid-1"
        linked = {"id": "uid-1", "email": USER["email"], "full_name": "Linked member",
                  "discord_id": "123456789012345678", "discord_link_version": 1, "is_verified": True}
        original_get = Ref.get

        def get_after_race(ref, transaction=None):
            snapshot = original_get(ref, transaction)
            if ref.path == path and not snapshot.exists:
                db.data[path] = dict(linked)
            return snapshot

        with patch.object(users, "db", db), patch.object(Ref, "get", get_after_race):
            result = users.sync_user(USER)
        self.assertEqual(db.data[path]["discord_id"], linked["discord_id"])
        self.assertEqual(result.full_name, "Linked member")
