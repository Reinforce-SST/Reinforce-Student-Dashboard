"""YUVI proof must bind a Discord account to one Firebase UID."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.users import DiscordVerifyRequest
from app.services.discord_link import consume_link, linked_discord_id, unlink_member
from tests.firestore_fake import DB, Transaction

NOW = datetime(2026, 9, 24, tzinfo=timezone.utc)
TOKEN = "A" * 43
TOKEN_PATH = "discord_link_tokens/" + sha256(TOKEN.encode()).hexdigest()
USER = {"email": "member@sst.scaler.com", "uid": "uid-1", "name": "Member"}
DID = "123456789012345678"


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.db = DB({TOKEN_PATH: {
            "discord_id": DID, "expires_at": NOW + timedelta(minutes=10), "consumed_by": None,
        }})

    def consume(self, user=USER):
        transaction = Transaction()
        result = consume_link(transaction, self.db, TOKEN, user, NOW)
        transaction.commit()
        return result

    def test_numeric_id_alone_is_rejected(self):
        with self.assertRaises(ValidationError):
            DiscordVerifyRequest(discord_id=DID)

    def test_token_links_canonical_user_and_both_bot_aliases(self):
        self.consume()
        self.assertEqual(self.db.data["users/uid-1"]["discord_id"], DID)
        self.assertEqual(self.db.data["users/" + USER["email"]]["firebase_uid"], "uid-1")
        self.assertEqual(self.db.data["users/" + DID]["discord_link_version"], 1)
        self.assertEqual(linked_discord_id(self.db, "uid-1", USER["email"]), DID)
        self.consume()
        with self.assertRaises(HTTPException) as error:
            self.consume({"email": "attacker@sst.scaler.com", "uid": "uid-2"})
        self.assertEqual(error.exception.status_code, 409)

    def test_expired_link_writes_nothing(self):
        self.db.data[TOKEN_PATH]["expires_at"] = NOW
        with self.assertRaises(HTTPException):
            self.consume()
        self.assertEqual(len(self.db.data), 1)

    def test_conflicting_alias_blocks_link(self):
        self.db.data["users/" + DID] = {"email": "other@sst.scaler.com"}
        with self.assertRaises(HTTPException):
            self.consume()
        self.assertIsNone(self.db.data[TOKEN_PATH]["consumed_by"])

    def test_existing_verified_email_alias_cannot_be_overwritten(self):
        self.db.data["users/" + USER["email"]] = {
            "email": USER["email"], "firebase_uid": USER["uid"],
            "discord_id": "999999999999999999", "discord_link_version": 1,
        }
        with self.assertRaises(HTTPException) as error:
            self.consume()
        self.assertEqual(error.exception.status_code, 409)
        self.assertIsNone(self.db.data[TOKEN_PATH]["consumed_by"])

    def test_unproven_and_one_sided_links_do_not_authorize_tickets(self):
        self.db.data["users/uid-1"] = {"email": USER["email"], "discord_id": DID, "is_verified": True}
        self.assertIsNone(linked_discord_id(self.db, "uid-1", USER["email"]))
        self.db.data["users/uid-1"]["discord_link_version"] = 1
        self.assertIsNone(linked_discord_id(self.db, "uid-1", USER["email"]))

    def test_profile_fields_survive_linking_and_unlinking_invalidates_retry(self):
        self.db.data["users/uid-1"] = {"email": USER["email"], "full_name": "Saved", "skills": ["Python"]}
        self.consume()
        self.assertEqual(self.db.data["users/uid-1"]["skills"], ["Python"])
        transaction = Transaction()
        unlink_member(transaction, self.db, USER, NOW)
        transaction.commit()
        self.assertIsNone(linked_discord_id(self.db, "uid-1", USER["email"]))
        with self.assertRaises(HTTPException):
            self.consume()

    def test_unlink_does_not_delete_someone_elses_alias(self):
        self.db.data["users/uid-1"] = {"email": USER["email"], "discord_id": DID}
        self.db.data["users/" + DID] = {"email": "other@sst.scaler.com"}
        transaction = Transaction()
        unlink_member(transaction, self.db, USER, NOW)
        transaction.commit()
        self.assertEqual(self.db.data["users/" + DID]["email"], "other@sst.scaler.com")
