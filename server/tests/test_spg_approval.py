"""Registration approval creates one group and resolves only its ticket."""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import tickets
from app.services import spgs, uploads
from tests.helpers.fake_firestore import FakeFirestore, FakeTransaction, run_transaction


class SPGApprovalTests(unittest.TestCase):
    def setUp(self):
        self.user = {"uid": "admin", "admin": True, "email": "admin@sst.scaler.com"}
        self.db = FakeFirestore({
            "users": {
                "lead": {"id": "lead", "is_member": True},
                "member": {"id": "member", "is_member": True},
                "admin": {"id": "admin", "is_member": True},
            },
            "tickets": {
                "tkt_1": {
                    "id": "tkt_1", "category": "spg_registration", "title": "SPG: Aurora",
                    "status": "open", "priority": "medium", "created_by_uid": "lead",
                    "fields": {"Project Name": "Aurora", "track": "kaggle", "leader_uid": "lead", "member_uids": ["member"]},
                },
                "tkt_2": {"id": "tkt_2", "category": "support", "title": "Help", "status": "open", "priority": "medium", "created_by_uid": "lead"},
            },
        })
        patchers = [
            patch.object(tickets, "db", self.db),
            patch.object(spgs, "run_in_transaction", run_transaction),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(tickets.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def approve(self, ticket_id="tkt_1", **data):
        return self.client.post(f"/api/v1/tickets/{ticket_id}/approve-spg", data={
            "spg_type": "learning", "track": "kaggle", "visibility": "private", **data,
        })

    def test_approval_is_admin_only_and_idempotent(self):
        self.user = {"uid": "lead", "email": "lead@sst.scaler.com"}
        self.assertEqual(self.approve().status_code, 403)
        self.user = {"uid": "admin", "admin": True}
        first = self.approve()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "resolved")
        spg_id = first.json()["spg_id"]
        self.assertEqual(self.db.documents("spgs")[spg_id]["member_ids"], ["lead", "member"])
        self.assertEqual(self.db.documents("spgs")[spg_id]["source_ticket_id"], "tkt_1")
        second = self.approve()
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json()["spg_id"], spg_id)
        self.assertEqual(len(self.db.documents("spgs")), 1)
        self.assertEqual(self.client.patch("/api/v1/tickets/tkt_1/status", json={"status": "open"}).status_code, 409)

    def _link_idea(self, idea_id="idea_live", **idea):
        self.db.documents("tickets")["tkt_1"]["fields"]["idea_id"] = idea_id
        if idea is not None:
            self.db.store.setdefault("ideas", {})[idea_id] = {
                "id": idea_id, "title": "Course-feedback clustering", "is_verified": True,
                "stats": {"upvote_count": 9, "views_count": 60, "claims_count": 2}, **idea,
            }

    def test_a_group_started_from_an_idea_links_to_it_and_counts_once(self):
        self._link_idea()
        first = self.approve()
        self.assertEqual(first.status_code, 200, first.text)
        spg_id = first.json()["spg_id"]
        self.assertEqual(self.db.documents("spgs")[spg_id]["idea_id"], "idea_live")
        stats = self.db.documents("ideas")["idea_live"]["stats"]
        self.assertEqual(stats["claims_count"], 3)
        # The other counters are untouched: a nested update, not a map replace.
        self.assertEqual((stats["upvote_count"], stats["views_count"]), (9, 60))

        # Approval is idempotent, so a repeat must not count the group twice.
        self.assertEqual(self.approve().status_code, 200)
        self.assertEqual(self.db.documents("ideas")["idea_live"]["stats"]["claims_count"], 3)

    def test_a_group_whose_idea_was_deleted_is_still_created_unlinked(self):
        self.db.documents("tickets")["tkt_1"]["fields"]["idea_id"] = "idea_gone"
        approved = self.approve()
        self.assertEqual(approved.status_code, 200, approved.text)
        spg = self.db.documents("spgs")[approved.json()["spg_id"]]
        self.assertIsNone(spg.get("idea_id"))
        self.assertNotIn("idea_gone", self.db.documents("ideas"))

    def test_a_group_never_links_to_an_unapproved_idea(self):
        self._link_idea("idea_pending", is_verified=False)
        approved = self.approve()
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertIsNone(self.db.documents("spgs")[approved.json()["spg_id"]].get("idea_id"))
        self.assertEqual(self.db.documents("ideas")["idea_pending"]["stats"]["claims_count"], 2)

    def test_a_group_without_an_idea_is_unchanged(self):
        approved = self.approve()
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertIsNone(self.db.documents("spgs")[approved.json()["spg_id"]].get("idea_id"))

    def test_wrong_category_track_or_closed_ticket_never_creates_group(self):
        self.assertEqual(self.approve("tkt_2").status_code, 400)
        self.assertEqual(self.approve(track="research").status_code, 400)
        self.db.documents("tickets")["tkt_1"]["status"] = "closed"
        self.assertEqual(self.approve().status_code, 409)
        self.assertEqual(self.db.documents("spgs"), {})

    def test_resolve_requires_approval_and_rejection_requires_reason(self):
        resolved = self.client.patch("/api/v1/tickets/tkt_1/status", json={"status": "resolved"})
        closed = self.client.patch("/api/v1/tickets/tkt_1/status", json={"status": "closed"})
        self.assertEqual((resolved.status_code, closed.status_code), (409, 400))
        rejected = self.client.patch("/api/v1/tickets/tkt_1/status", json={"status": "closed", "close_reason": "Incomplete charter"})
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["close_reason"], "Incomplete charter")
        self.assertEqual(self.client.patch("/api/v1/tickets/tkt_1/status", json={"status": "open"}).status_code, 409)

    def test_project_requires_valid_pdf_and_cleans_up_failed_write(self):
        missing = self.approve(spg_type="project")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(self.db.documents("spgs"), {})
        stored, deleted = [], []
        with patch.object(uploads, "store_pdf", side_effect=lambda payload, path: (stored.append(path), "https://storage.test/proposition.pdf")[1]), patch.object(uploads, "delete_file", side_effect=deleted.append):
            bad = self.client.post("/api/v1/tickets/tkt_1/approve-spg", data={"spg_type": "project", "track": "kaggle", "visibility": "private"}, files={"proposition": ("bad.pdf", b"not a pdf", "application/pdf")})
            self.assertEqual(bad.status_code, 400)
            good = self.client.post("/api/v1/tickets/tkt_1/approve-spg", data={"spg_type": "project", "track": "kaggle", "visibility": "private"}, files={"proposition": ("proposal.pdf", b"%PDF-1.4\nfixture", "application/pdf")})
            self.assertEqual(good.status_code, 200, good.text)
            self.assertEqual(len(stored), 1)
            self.assertEqual(deleted, [])
            spg = self.db.documents("spgs")[good.json()["spg_id"]]
            self.assertEqual(spg["proposition_document_url"], "https://storage.test/proposition.pdf")

    def test_ticket_write_failure_does_not_leave_a_created_spg(self):
        with patch.object(FakeTransaction, "update", side_effect=RuntimeError("write failed")):
            with self.assertRaisesRegex(RuntimeError, "write failed"):
                self.approve()
        self.assertEqual(self.db.documents("spgs"), {})
        self.assertEqual(self.db.documents("tickets")["tkt_1"]["status"], "open")

    def test_project_with_proposal_fields_approved_without_admin_upload(self):
        self.db.documents("tickets")["tkt_proposal"] = {
            "id": "tkt_proposal", "category": "spg_registration", "title": "SPG: Project Proposal",
            "status": "open", "priority": "medium", "created_by_uid": "lead",
            "fields": {
                "Project Name": "Project Orion", "track": "kaggle", "leader_uid": "lead", "member_uids": ["member"],
                "Vision": "Build end-to-end kaggle pipeline",
                "First Steps": "Dataset exploratory data analysis",
                "Initial Milestones": "M1 Baseline, M2 Ensemble",
            },
        }
        res = self.client.post("/api/v1/tickets/tkt_proposal/approve-spg", data={"spg_type": "project", "track": "kaggle", "visibility": "private"})
        self.assertEqual(res.status_code, 200, res.text)
        spg = self.db.documents("spgs")[res.json()["spg_id"]]
        self.assertEqual(spg["type"], "project")
        self.assertEqual(spg["proposition_document_url"], "/dashboard/tickets/tkt_proposal")


if __name__ == "__main__":
    unittest.main()
