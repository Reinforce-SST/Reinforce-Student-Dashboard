"""Unit tests for the stored Firestore shapes in app/schemas.

Run from server/:  python -m unittest discover -s tests
"""

import sys
import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from app.schemas.users import UserDocument

# The `users/{doc_id}` keys matching the current UserDocument contract (keyed by `id`).
CONTRACT_USER_KEYS = {
    "id", "email", "full_name", "avatar_url", "discord_id", "is_admin", "is_member",
    "tier", "batch_year", "is_verified", "verified_at", "points", "bio", "skills",
    "social_links", "created_at", "updated_at", "last_login",
}
CONTRACT_SOCIAL_LINK_KEYS = {"github", "kaggle", "discord", "linkedin"}

PRIMARY_DOC = {
    "id": "test-user-id",
    "email": "student@sst.scaler.com",
    "full_name": "Test Student",
    "avatar_url": "https://example.com/avatar.png",
    "discord_id": "100000000000000001",
    "is_admin": False,
    "is_member": True,
    "tier": "beginner",
    "batch_year": 2,
    "is_verified": True,
    "verified_at": "2026-01-02T10:00:00+00:00",
    "created_at": "2026-01-01T09:30:00+00:00",
    "updated_at": "2026-01-02T10:00:00+00:00",
    "last_login": "2026-01-02T09:59:00+00:00",
    "points": {"total": 0, "kaggle": 0, "product": 0, "research": 0, "misc": 0},
    "bio": "ML Enthusiast",
    "skills": ["python", "pytorch"],
    "social_links": {"github": None, "linkedin": None, "kaggle": None, "discord": None},
}


class UserDocumentTests(unittest.TestCase):
    def test_schemas_do_not_initialise_firebase(self):
        import subprocess
        result = subprocess.run(
            [sys.executable, "-c", "import sys; import app.schemas.users; assert 'app.services.firebase' not in sys.modules"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_fields_match_data_contract(self):
        self.assertEqual(set(UserDocument.model_fields), CONTRACT_USER_KEYS)
        social_links = UserDocument.model_validate(PRIMARY_DOC).model_dump()["social_links"]
        self.assertEqual(set(social_links), CONTRACT_SOCIAL_LINK_KEYS)

    def test_primary_document_parses(self):
        user = UserDocument.model_validate(PRIMARY_DOC)
        self.assertEqual(user.id, "test-user-id")
        self.assertEqual(user.email, "student@sst.scaler.com")
        self.assertEqual(user.discord_id, "100000000000000001")
        self.assertTrue(user.is_verified)
        self.assertTrue(user.is_member)
        self.assertEqual(user.batch_year, 2)
        self.assertEqual(user.skills, ["python", "pytorch"])
        self.assertIsNone(user.social_links.github)

    def test_timestamps_stay_iso_strings(self):
        dumped = UserDocument.model_validate(PRIMARY_DOC).model_dump(mode="json")
        for key in ("verified_at", "created_at", "updated_at", "last_login"):
            with self.subTest(key=key):
                self.assertIsInstance(dumped[key], str)
                self.assertEqual(dumped[key], PRIMARY_DOC[key])

    def test_unknown_keys_are_ignored(self):
        doc = {**PRIMARY_DOC, "legacy_field": "some_value"}
        user = UserDocument.model_validate(doc)
        self.assertNotIn("legacy_field", user.model_dump())

    def test_required_fields_are_enforced(self):
        for key in ("id", "email", "full_name"):
            with self.subTest(key=key):
                doc = {k: v for k, v in PRIMARY_DOC.items() if k != key}
                with self.assertRaises(ValidationError):
                    UserDocument.model_validate(doc)


if __name__ == "__main__":
    unittest.main()
