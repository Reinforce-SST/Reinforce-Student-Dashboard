"""Regression coverage for admin roles, directory, and image uploads."""

import io
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import events, users
from app.services.firebase import upload_file_to_storage
from app.services.images import ImageRejected, read_image
from tests.helpers.nested_firestore import NestedFirestore

ADMIN = {"uid": "admin-uid", "email": "admin@sst.scaler.com", "admin": True}
MEMBER = {"uid": "member-uid", "email": "member@sst.scaler.com"}
PNG = b"\x89PNG\r\n\x1a\n" + b"test image"


class ImageUploadTests(unittest.TestCase):
    def test_image_validation_checks_real_size_and_signature(self):
        self.assertEqual(read_image(io.BytesIO(PNG), "image/png"), (PNG, "png"))
        for payload, media_type in ((b"", "image/png"), (b"not png", "image/png"), (PNG, "image/svg+xml"), (PNG + b"x" * (5 * 1024 * 1024), "image/png")):
            with self.subTest(media_type=media_type, length=len(payload)):
                with self.assertRaises(ImageRejected):
                    read_image(io.BytesIO(payload), media_type)

    def test_storage_url_has_token_for_private_bucket(self):
        blob = Mock(metadata=None)
        bucket = Mock(name="club.appspot.com")
        bucket.blob.return_value = blob
        with patch("app.services.firebase.get_bucket", return_value=bucket):
            url = upload_file_to_storage(io.BytesIO(PNG), "events/media/test image.png", "image/png", shareable=True)
        self.assertIn("events%2Fmedia%2Ftest%20image.png?alt=media&token=", url)
        self.assertEqual(blob.metadata["firebaseStorageDownloadTokens"], url.split("token=")[1])
        blob.upload_from_file.assert_called_once()

    def test_private_upload_does_not_issue_public_token(self):
        blob = Mock(metadata=None)
        bucket = Mock(name="club.appspot.com")
        bucket.blob.return_value = blob
        with patch("app.services.firebase.get_bucket", return_value=bucket):
            url = upload_file_to_storage(io.BytesIO(b"%PDF-test"), "spgs/private.pdf", "application/pdf")
        self.assertNotIn("token=", url)
        self.assertIsNone(blob.metadata)


class AdminWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({
            "users/admin-uid": {"id": "admin-uid", "email": ADMIN["email"], "full_name": "Admin", "is_admin": True},
            "users/member-uid": {"id": "member-uid", "email": MEMBER["email"], "full_name": "Member", "is_admin": False},
            "users/member@sst.scaler.com": {"email": MEMBER["email"], "full_name": "Member alias", "firebase_uid": "member-uid"},
        })
        self.user = dict(ADMIN)
        app = FastAPI()
        app.include_router(users.router, prefix="/api/v1")
        app.include_router(events.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        patcher = patch.object(users, "db", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_directory_is_admin_only_and_canonical(self):
        result = self.client.get("/api/v1/users/admin-directory?search=member")
        self.assertEqual(result.status_code, 200)
        self.assertEqual([item["id"] for item in result.json()["items"]], ["member-uid"])
        self.user = dict(MEMBER)
        self.assertEqual(self.client.get("/api/v1/users/admin-directory").status_code, 403)

    def test_public_directory_and_leaderboard_skip_compatibility_alias(self):
        directory = self.client.get("/api/v1/users?search=member").json()
        leaderboard = self.client.get("/api/v1/users/leaderboard").json()
        self.assertEqual([item["id"] for item in directory["items"]], ["member-uid"])
        self.assertNotIn("member@sst.scaler.com", [item["id"] for item in leaderboard["entries"]])

    def test_role_label_is_only_display_metadata(self):
        with patch.object(users.auth, "get_user", return_value=SimpleNamespace(custom_claims={"editor": True})) as get_user, patch.object(users.auth, "set_custom_user_claims") as set_claims:
            result = self.client.patch("/api/v1/users/member-uid/status", json={"is_member": True, "is_admin": False, "role_label": "core"})
        self.assertEqual(result.status_code, 200)
        get_user.assert_called_once_with("member-uid")
        set_claims.assert_called_once_with("member-uid", {"editor": True})
        self.assertEqual(result.json()["role_label"], "core")
        self.user = {**MEMBER, "is_admin": True, "role_label": "core"}
        self.assertEqual(self.client.get("/api/v1/users/admin-directory").status_code, 403)

    def test_grant_admin_preserves_other_claims_and_self_demote_is_rejected(self):
        with patch.object(users.auth, "get_user", return_value=SimpleNamespace(custom_claims={"editor": True})), patch.object(users.auth, "set_custom_user_claims") as set_claims:
            result = self.client.patch("/api/v1/users/member-uid/status", json={"is_admin": True})
        self.assertEqual(result.status_code, 200)
        set_claims.assert_called_once_with("member-uid", {"editor": True, "admin": True})
        self.assertTrue(result.json()["is_admin"])
        self.assertEqual(self.client.patch("/api/v1/users/admin-uid/status", json={"is_admin": False}).status_code, 400)
        self.assertEqual(self.client.patch("/api/v1/users/member@sst.scaler.com/status", json={"is_admin": True}).status_code, 404)

    def test_profile_admin_display_follows_verified_claim(self):
        self.user = {**MEMBER, "admin": True}
        result = self.client.get("/api/v1/users/me")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["is_admin"])
        self.assertTrue(self.db.store["users/member-uid"]["is_admin"])

    def test_member_can_clear_avatar_but_not_store_inline_image(self):
        self.user = dict(MEMBER)
        self.db.store["users/member-uid"]["avatar_url"] = "https://storage.example/old.png"
        self.assertEqual(self.client.patch("/api/v1/users/me", json={"avatar_url": None}).status_code, 200)
        self.assertIsNone(self.db.store["users/member-uid"]["avatar_url"])
        self.assertEqual(self.client.patch("/api/v1/users/me", json={"avatar_url": "data:image/png;base64,AAAA"}).status_code, 422)

    def test_event_upload_rejects_non_admin_and_stores_valid_image(self):
        self.user = dict(MEMBER)
        self.assertEqual(self.client.post("/api/v1/events/media", files={"file": ("poster.png", PNG, "image/png")}).status_code, 403)
        self.user = dict(ADMIN)
        with patch.object(events, "upload_file_to_storage", return_value="https://storage.example/poster.png") as store:
            result = self.client.post("/api/v1/events/media", files={"file": ("poster.png", PNG, "image/png")})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["url"], "https://storage.example/poster.png")
        self.assertTrue(store.call_args.args[1].startswith("events/media/"))
        self.assertEqual(self.client.post("/api/v1/events/media", files={"file": ("poster.png", b"invalid", "image/png")}).status_code, 400)

    def test_avatar_upload_does_not_persist_data_uri_on_storage_failure(self):
        self.user = dict(MEMBER)
        with patch.object(users, "upload_file_to_storage", side_effect=RuntimeError("bucket unavailable")):
            result = self.client.post("/api/v1/users/me/avatar", files={"file": ("avatar.png", PNG, "image/png")})
        self.assertEqual(result.status_code, 503)
        self.assertIsNone(self.db.store["users/member-uid"].get("avatar_url"))


if __name__ == "__main__":
    unittest.main()
