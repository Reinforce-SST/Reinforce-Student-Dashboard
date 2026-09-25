"""Regression tests for the cross-service findings in PR #24."""

import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user, get_optional_current_user
from app.api.v1.endpoints import events, ideas, tickets
from app.utils import is_admin_user
from tests.helpers.nested_firestore import NestedFirestore


MEMBER = {"uid": "uid-member", "email": "member@sst.scaler.com"}
ADMIN = {**MEMBER, "admin": True}


def event(event_id, status="published"):
    return {
        "id": event_id,
        "slug": event_id,
        "title": "Event title",
        "description": "Event description",
        "event_type": "workshop",
        "track": "research",
        "format": "online",
        "venue_info": {},
        "schedule": {"start_time": "2030-01-01T10:00:00+00:00"},
        "stats": {},
        "status": status,
        "created_by": "uid-admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


class BackendHardeningTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore(
            {
                "events/public": event("public"),
                "events/draft": event("draft", "draft"),
                "ideas/canonical": {
                    "title": "Canonical",
                    "description": "Approved",
                    "track": "research",
                    "is_verified": True,
                    "created_by_uid": "uid-member",
                },
                "ideas/legacy": {
                    "title": "Legacy",
                    "description": "Approved by YUVI",
                    "track": "other",
                    "is_approved": True,
                    "roadmap": ["Build it"],
                    "created_by": {"uid": "uid-member"},
                },
                "ideas/pending-idea": {
                    "title": "Pending",
                    "description": "Private",
                    "track": "research",
                    "is_verified": False,
                    "created_by_uid": "someone-else",
                },
                "users/uid-member": {"email": "member@sst.scaler.com", "discord_id": "123456789", "discord_link_version": 1, "is_admin": True},
                "users/member@sst.scaler.com": {"firebase_uid": "uid-member", "email": "member@sst.scaler.com", "discord_id": "123456789", "discord_link_version": 1},
                "users/123456789": {"firebase_uid": "uid-member", "email": "member@sst.scaler.com", "discord_id": "123456789", "discord_link_version": 1},
                "tickets/legacy-ticket": {
                    "title": "Discord ticket",
                    "category": "support",
                    "status": "open",
                    "created_by": {"discord_id": "123456789"},
                },
            }
        )
        for module in (events, ideas, tickets):
            self.addCleanup(setattr, module, "db", module.db)
            module.db = self.db

        app = FastAPI()
        app.include_router(events.router, prefix="/api/v1")
        app.include_router(ideas.router, prefix="/api/v1")
        app.include_router(tickets.router, prefix="/api/v1")
        self.user = dict(MEMBER)
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def test_firestore_profile_cannot_grant_admin(self):
        self.assertFalse(is_admin_user({**MEMBER, "is_admin": True}))

    def test_event_list_is_public_and_hidden_status_filter_is_forbidden(self):
        self.client.app.dependency_overrides[get_optional_current_user] = lambda: None
        response = self.client.get("/api/v1/events")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["events"]], ["public"])
        self.assertEqual(
            self.client.get("/api/v1/events?status=draft").status_code, 403
        )

    def test_draft_event_detail_is_hidden_from_member_but_visible_to_admin(self):
        self.assertEqual(self.client.get("/api/v1/events/draft").status_code, 404)
        self.user = dict(ADMIN)
        self.assertEqual(self.client.get("/api/v1/events/draft").status_code, 200)

    def test_pending_idea_detail_is_not_public(self):
        self.assertEqual(self.client.get("/api/v1/ideas/pending-idea").status_code, 404)

    def test_legacy_yuvi_idea_is_normalized_and_listed(self):
        response = self.client.get("/api/v1/ideas")
        self.assertEqual(response.status_code, 200)
        by_id = {item["id"]: item for item in response.json()["items"]}
        self.assertIn("legacy", by_id)
        self.assertEqual(by_id["legacy"]["track"], "misc")
        detail = self.client.get("/api/v1/ideas/legacy").json()
        self.assertEqual(detail["rough_roadmap"], ["Build it"])
        self.assertEqual(detail["created_by_uid"], "uid-member")

    def test_linked_discord_ticket_is_owned_by_firebase_user(self):
        response = self.client.get("/api/v1/tickets/my")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.json()["items"]], ["legacy-ticket"]
        )
        self.assertEqual(response.json()["items"][0]["created_by_uid"], "uid-member")
        self.assertEqual(
            self.client.get("/api/v1/tickets/legacy-ticket").status_code, 200
        )

    def test_message_list_returns_newest_300_in_chronological_order(self):
        self.db.store["tickets/web-ticket"] = {
            "title": "Web ticket",
            "category": "support",
            "status": "open",
            "created_by_uid": "uid-member",
        }
        for index in range(305):
            self.db.store[f"tickets/web-ticket/messages/msg-{index:03}"] = {
                "content": str(index),
                "timestamp": f"2026-01-01T00:{index // 60:02}:{index % 60:02}+00:00",
            }
        body = self.client.get("/api/v1/tickets/web-ticket/messages").json()
        self.assertEqual(len(body), 300)
        self.assertEqual((body[0]["content"], body[-1]["content"]), ("5", "304"))

    def test_bot_sync_retry_uses_one_message_document(self):
        self.db.store["tickets/web-ticket"] = {
            "title": "Web ticket",
            "category": "support",
            "status": "open",
            "created_by_uid": "uid-member",
        }
        body = {
            "content": "hello",
            "discord_message_id": "discord-42",
            "timestamp": "2026-01-01T00:00:00+00:00",
        }
        with patch.object(tickets.settings, "bot_internal_secret", "secret"):
            first = self.client.post(
                "/api/v1/tickets/internal/bot-sync/web-ticket",
                headers={"X-Internal-Secret": "secret"},
                json=body,
            )
            second = self.client.post(
                "/api/v1/tickets/internal/bot-sync/web-ticket",
                headers={"X-Internal-Secret": "secret"},
                json=body,
            )
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        stored = [
            key
            for key in self.db.store
            if key.startswith("tickets/web-ticket/messages/")
        ]
        self.assertEqual(len(stored), 1)

    def test_legacy_verify_url_is_normalized_for_ticket_bridge(self):
        with patch.object(
            tickets.settings,
            "yuvi_bot_url",
            "https://yuvi.test/internal/verify-success",
        ):
            self.assertEqual(
                tickets._bot_endpoint("/tickets/create-thread"),
                "https://yuvi.test/tickets/create-thread",
            )

    def test_ticket_bridge_payload_matches_yuvi_contract(self):
        captured = {}

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b"{}"

        def open_request(request, timeout):
            captured.update(json.loads(request.data.decode("utf-8")))
            self.assertEqual(timeout, 5.0)
            return Response()

        with (
            patch.object(tickets.settings, "yuvi_bot_url", "https://yuvi.test"),
            patch.object(tickets.settings, "bot_internal_secret", "secret"),
            patch.object(tickets.urllib.request, "urlopen", side_effect=open_request),
        ):
            response = self.client.post(
                "/api/v1/tickets",
                json={"category": "support", "title": "Help", "fields": {}},
            )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("action", captured)
        self.assertEqual(captured["creator_uid"], "uid-member")


if __name__ == "__main__":
    unittest.main()
