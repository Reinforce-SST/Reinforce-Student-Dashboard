"""Actions that earn points queue a pending contribution for review.

Publishing an article, having a progress report verified and having an idea
accepted into the jar each record a pending contribution, worth nothing until
an admin reviews it and sets the points. Recording is idempotent per activity,
and a failure to record never fails the action that has already happened.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import blogs, ideas, spg
from app.services import contributions as contribution_service
from app.services import spg_reports as reports_service
from app.services.firebase import get_db
from tests.helpers.fake_firestore import run_transaction
from tests.helpers.nested_firestore import NestedFirestore

AUTHOR = {"uid": "uid_author", "email": "author@sst.scaler.com"}
ADMIN = {"uid": "uid_admin", "email": "admin@sst.scaler.com", "admin": True}


class ContributionHookTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({
            "users/uid_author": {"id": "uid_author", "full_name": "Author"},
            "users/uid_admin": {"id": "uid_admin", "full_name": "Admin"},
        })
        for target in (
            patch.object(blogs, "db", self.db),
            patch.object(ideas, "db", self.db),
            patch.object(contribution_service, "run_in_transaction", run_transaction),
            patch.object(reports_service, "run_in_transaction", run_transaction),
        ):
            target.start()
            self.addCleanup(target.stop)
        self.user = dict(AUTHOR)
        app = FastAPI()
        for module in (blogs, ideas, spg):
            app.include_router(module.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def contributions(self):
        return [doc for path, doc in self.db.store.items() if path.startswith("contributions/")]

    # ------------------------------------------------------------------ blogs

    def publish(self, status="published", title="Evaluating retrieval"):
        response = self.client.post("/api/v1/blogs", json={
            "title": title, "summary": "How we scored a retriever.", "content": "## Method",
            "tags": ["research"], "status": status,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_publishing_an_article_queues_a_pending_contribution(self):
        blog = self.publish()
        [record] = self.contributions()
        self.assertEqual((record["user_id"], record["status"], record["points"]), ("uid_author", "pending", 0))
        self.assertEqual(record["category"], "content")
        self.assertEqual(record["source"], {"type": "blog", "id": blog["id"]})

    def test_a_draft_queues_nothing_until_it_is_published_once(self):
        blog = self.publish(status="draft")
        self.assertEqual(self.contributions(), [])
        for _ in range(2):  # publishing, then saving again
            response = self.client.put(f"/api/v1/blogs/{blog['id']}", json={"status": "published"})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(self.contributions()), 1)

    def test_an_article_is_published_even_if_crediting_fails(self):
        with patch.object(contribution_service, "record_pending", side_effect=RuntimeError("Firestore down")):
            with self.assertLogs("app.services.contributions", level="ERROR"):
                blog = self.publish()
        self.assertEqual(blog["status"], "published")
        self.assertEqual(self.contributions(), [])

    # ---------------------------------------------------------- SPG reports

    def test_verifying_a_report_queues_project_work_for_its_author(self):
        self.db.store["spgs/spg_1"] = {
            "id": "spg_1", "name": "Retrieval", "type": "project", "track": "research",
            "visibility": "public", "status": "active", "lead_id": "uid_author",
            "member_ids": ["uid_author"], "is_recruiting": False, "recruiting_roles": [],
        }
        self.db.store["spg_reports/rep_1"] = {
            "id": "rep_1", "spg_id": "spg_1", "report_type": "progress", "report_format": "form",
            "heading": "Week 9 progress", "short_description": "Guidelines finished.",
            "sequence_number": 1, "summary": "We annotated 200 queries.", "milestones": [],
            "submitted_by": "uid_author", "submitted_at": "2026-09-20T10:00:00+00:00",
            "status": "pending",
        }
        self.user = dict(ADMIN)
        for _ in range(2):  # verifying twice is one activity
            response = self.client.post("/api/v1/spgs/reports/rep_1/verify")
            self.assertEqual(response.status_code, 200, response.text)
        [record] = self.contributions()
        self.assertEqual((record["user_id"], record["status"]), ("uid_author", "pending"))
        self.assertEqual((record["category"], record["spg_id"], record["track"]), ("project_work", "spg_1", "research"))

    # ---------------------------------------------------------------- ideas

    def test_approving_an_idea_queues_content_for_its_author(self):
        self.db.store["ideas/idea_1"] = {
            "id": "idea_1", "title": "Course-feedback clustering", "description": "Cluster feedback.",
            "track": "research", "is_verified": False, "created_by_uid": "uid_author",
            "created_at": "2026-09-20T10:00:00+00:00",
            "stats": {"upvote_count": 0, "views_count": 0, "claims_count": 0},
        }
        self.user = dict(ADMIN)
        for _ in range(2):
            self.assertEqual(self.client.post("/api/v1/ideas/idea_1/approve").status_code, 200)
        [record] = self.contributions()
        self.assertEqual((record["user_id"], record["status"], record["category"]), ("uid_author", "pending", "content"))
        self.assertIsNone(record.get("source"))

    def test_approving_a_ticket_idea_credits_the_member_who_filed_it(self):
        self.db.store["tickets/tkt_idea"] = {
            "id": "tkt_idea", "title": "Mess-queue forecasting", "description": "Forecast peaks.",
            "category": "idea_jar", "status": "open", "created_by_uid": "uid_author",
            "fields": {"track": "product"}, "created_at": "2026-09-20T10:00:00+00:00",
        }
        self.user = dict(ADMIN)
        self.assertEqual(self.client.post("/api/v1/ideas/tkt_idea/approve").status_code, 200)
        [record] = self.contributions()
        self.assertEqual((record["user_id"], record["track"]), ("uid_author", "product"))

    def test_an_idea_with_no_firebase_author_credits_no_one(self):
        # Legacy YUVI ideas carry only a Discord id.
        self.db.store["ideas/idea_bot"] = {
            "id": "idea_bot", "title": "From Discord", "description": "Old idea.", "track": "misc",
            "is_verified": False, "created_by": {"discord_id": "123"},
            "stats": {"upvote_count": 0, "views_count": 0, "claims_count": 0},
        }
        self.user = dict(ADMIN)
        self.assertEqual(self.client.post("/api/v1/ideas/idea_bot/approve").status_code, 200)
        self.assertEqual(self.contributions(), [])


if __name__ == "__main__":
    unittest.main()
