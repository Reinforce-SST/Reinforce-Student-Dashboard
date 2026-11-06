"""Unit tests for Dashboard Hero Banners API (app/api/v1/endpoints/banners.py)."""

import io
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_admin_user, get_optional_current_user
from app.api.v1.endpoints import banners
from app.schemas.banners import BannerStatus
from tests.helpers.nested_firestore import NestedFirestore

ADMIN = {"uid": "admin-uid", "email": "admin@sst.scaler.com", "admin": True}
MEMBER = {"uid": "member-uid", "email": "member@sst.scaler.com"}
PNG = b"\x89PNG\r\n\x1a\n" + b"fake-banner-image"


class BannerApiTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        self.banner_patch = patch.object(banners, "db", self.db)
        self.banner_patch.start()
        self.addCleanup(self.banner_patch.stop)

        self.user = dict(ADMIN)

        app = FastAPI()
        app.include_router(banners.router, prefix="/api/v1")
        app.dependency_overrides[get_admin_user] = lambda: self.user if (self.user and self.user.get("admin")) else self._raise_forbidden()
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def _raise_forbidden(self):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required.")

    def as_admin(self):
        self.user = dict(ADMIN)

    def as_member(self):
        self.user = dict(MEMBER)

    def as_visitor(self):
        self.user = None

    def sample_banner_payload(self, **overrides):
        data = {
            "title": "Summer AI Challenge 2026",
            "description": "Join our premier 48-hour club hackathon.",
            "banner_url": "https://storage.googleapis.com/banners/summer.png",
            "banner_badge_text": "Hackathon",
            "banner_cta_text": "Register Now",
            "banner_cta_url": "/dashboard/events/summer-ai-2026",
            "schedule": {
                "start_time": "2026-06-01T10:00:00Z",
                "end_time": "2026-06-30T18:00:00Z",
                "duration_minutes": 42240,
            },
            "status": "published",
        }
        data.update(overrides)
        return data

    def test_admin_can_create_and_retrieve_banner(self):
        self.as_admin()
        payload = self.sample_banner_payload()
        res = self.client.post("/api/v1/banners", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        banner_id = data["id"]
        self.assertTrue(banner_id.startswith("bnr_"))
        self.assertEqual(data["title"], "Summer AI Challenge 2026")
        self.assertEqual(data["banner_cta_url"], "/dashboard/events/summer-ai-2026")
        self.assertEqual(data["status"], "published")

        # Retrieve single banner
        get_res = self.client.get(f"/api/v1/banners/{banner_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["title"], "Summer AI Challenge 2026")

    def test_non_admin_cannot_create_or_delete_banner(self):
        self.as_member()
        payload = self.sample_banner_payload()
        res = self.client.post("/api/v1/banners", json=payload)
        self.assertEqual(res.status_code, 403)

        # Seed existing banner
        self.db.store["banners/bnr_test1"] = {
            "id": "bnr_test1",
            "title": "Existing Banner",
            "description": "Test",
            "status": "published",
            "schedule": {"start_time": "2026-01-01T00:00:00Z"},
        }
        del_res = self.client.delete("/api/v1/banners/bnr_test1")
        self.assertEqual(del_res.status_code, 403)

    def test_draft_banner_is_hidden_from_public_and_members(self):
        self.as_admin()
        payload = self.sample_banner_payload(title="Draft Announcement", status="draft")
        create_res = self.client.post("/api/v1/banners", json=payload)
        self.assertEqual(create_res.status_code, 201)
        draft_id = create_res.json()["id"]

        # Admin can view it
        self.assertEqual(self.client.get(f"/api/v1/banners/{draft_id}").status_code, 200)

        # Member gets 404
        self.as_member()
        self.assertEqual(self.client.get(f"/api/v1/banners/{draft_id}").status_code, 404)

        # Visitor gets 404
        self.as_visitor()
        self.assertEqual(self.client.get(f"/api/v1/banners/{draft_id}").status_code, 404)

    def test_list_banners_visibility_and_sorting(self):
        # Seed 3 banners with different start times and statuses
        self.db.store["banners/bnr_1"] = {
            "id": "bnr_1",
            "title": "Older Published",
            "description": "Description 1",
            "status": "published",
            "schedule": {"start_time": "2026-01-01T10:00:00Z"},
            "created_at": "2026-01-01T10:00:00Z",
        }
        self.db.store["banners/bnr_2"] = {
            "id": "bnr_2",
            "title": "Newer Published",
            "description": "Description 2",
            "status": "published",
            "schedule": {"start_time": "2026-05-01T10:00:00Z"},
            "created_at": "2026-05-01T10:00:00Z",
        }
        self.db.store["banners/bnr_draft"] = {
            "id": "bnr_draft",
            "title": "Future Draft",
            "description": "Description Draft",
            "status": "draft",
            "schedule": {"start_time": "2026-09-01T10:00:00Z"},
            "created_at": "2026-09-01T10:00:00Z",
        }

        # Public user: sees only published banners, sorted newest start_time first
        self.as_visitor()
        res = self.client.get("/api/v1/banners")
        self.assertEqual(res.status_code, 200)
        items = res.json()["banners"]
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["id"], "bnr_2")
        self.assertEqual(items[1]["id"], "bnr_1")

        # Non-admin cannot request status=draft
        self.as_member()
        err_res = self.client.get("/api/v1/banners?status=draft")
        self.assertEqual(err_res.status_code, 403)

        # Admin can view all or filter by status
        self.as_admin()
        admin_drafts = self.client.get("/api/v1/banners?status=draft").json()
        self.assertEqual(admin_drafts["total"], 1)
        self.assertEqual(admin_drafts["banners"][0]["id"], "bnr_draft")

    def test_update_banner_fields_and_status(self):
        self.as_admin()
        create_res = self.client.post("/api/v1/banners", json=self.sample_banner_payload())
        banner_id = create_res.json()["id"]

        update_payload = {
            "title": "Updated Hackathon Name",
            "banner_cta_url": "https://reinforce-sst.com/events/new-url",
            "status": "archived",
        }
        put_res = self.client.put(f"/api/v1/banners/{banner_id}", json=update_payload)
        self.assertEqual(put_res.status_code, 200)
        updated = put_res.json()
        self.assertEqual(updated["title"], "Updated Hackathon Name")
        self.assertEqual(updated["banner_cta_url"], "https://reinforce-sst.com/events/new-url")
        self.assertEqual(updated["status"], "archived")

    def test_delete_banner_success(self):
        self.as_admin()
        create_res = self.client.post("/api/v1/banners", json=self.sample_banner_payload())
        banner_id = create_res.json()["id"]

        del_res = self.client.delete(f"/api/v1/banners/{banner_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertNotIn(f"banners/{banner_id}", self.db.store)

        # Trying to fetch now returns 404
        get_res = self.client.get(f"/api/v1/banners/{banner_id}")
        self.assertEqual(get_res.status_code, 404)

    def test_upload_banner_media(self):
        self.as_admin()
        blob = Mock(metadata=None)
        bucket = Mock(name="club.appspot.com")
        bucket.blob.return_value = blob

        with patch("app.services.firebase.get_bucket", return_value=bucket):
            response = self.client.post(
                "/api/v1/banners/media",
                files={"file": ("test.png", io.BytesIO(PNG), "image/png")},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("url", response.json())
        self.assertIn("banners%2Fmedia%2F", response.json()["url"])


if __name__ == "__main__":
    unittest.main()
