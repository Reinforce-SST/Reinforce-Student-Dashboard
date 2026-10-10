"""Tests for SPG Milestones and Submilestones."""

import copy
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import spg as endpoints
from app.schemas.spgs import SPGCreate, SPGStatus
from app.services import spgs as service
from app.services.firebase import get_db
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

ADMIN = {"email": "admin@sst.scaler.com", "uid": "uid_admin", "admin": True}
MEMBER = {"email": "one@sst.scaler.com", "uid": "uid_one"}
OUTSIDER = {"email": "three@sst.scaler.com", "uid": "uid_three"}

USERS = {
    "uid_one": {"id": "uid_one", "email": "one@sst.scaler.com", "full_name": "One"},
    "uid_admin": {"id": "uid_admin", "email": "admin@sst.scaler.com", "full_name": "Admin"},
    "uid_three": {"id": "uid_three", "email": "three@sst.scaler.com", "full_name": "Three"},
}

REGISTRATION = {
    "name": "Seismic Prediction",
    "description": "Ensemble model for earthquake detection.",
    "type": "project",
    "track": "research",
    "visibility": "private",
    "member_ids": ["uid_one"],
    "lead_id": "uid_one",
    "proposition_document_url": "https://storage.test/p.pdf",
    "source_ticket_id": "ticket_001",
}


class SPGMilestonesTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore({"users": copy.deepcopy(USERS)})
        self.user = dict(MEMBER)

        real = service.run_in_transaction
        service.run_in_transaction = run_transaction
        self.addCleanup(setattr, service, "run_in_transaction", real)

        app = FastAPI()
        app.include_router(endpoints.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

        record, _ = service.create_spg(
            self.db,
            create=SPGCreate.model_validate(REGISTRATION),
            admin_id="uid_admin",
            runner=run_transaction,
        )
        self.spg_id = record.id

    def test_milestones_empty_initial(self):
        response = self.client.get(f"/api/v1/spgs/{self.spg_id}/milestones")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

        # Check parent SPG document has default references
        spg = service.get_spg(self.db, self.spg_id)
        self.assertEqual(spg.milestone_ids, [])
        self.assertEqual(spg.milestone_count, 0)

    def test_create_milestone_and_updates_parent_spg(self):
        response = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Design Model Architecture", "description": "ResNet + BiLSTM backbone", "order": 1},
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["title"], "Design Model Architecture")
        self.assertEqual(data["description"], "ResNet + BiLSTM backbone")
        self.assertFalse(data["is_completed"])
        self.assertEqual(data["order"], 1)
        self.assertEqual(data["submilestones"], [])

        # Verify parent SPG document updated
        spg = service.get_spg(self.db, self.spg_id)
        self.assertEqual(spg.milestone_ids, [data["id"]])
        self.assertEqual(spg.milestone_count, 1)

    def test_update_and_complete_milestone(self):
        create_res = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Data Pipeline"},
        )
        ms_id = create_res.json()["id"]

        patch_res = self.client.patch(
            f"/api/v1/spgs/{self.spg_id}/milestones/{ms_id}",
            json={"title": "Data Pipeline & Cleaning", "is_completed": True},
        )
        self.assertEqual(patch_res.status_code, 200)
        updated = patch_res.json()
        self.assertEqual(updated["title"], "Data Pipeline & Cleaning")
        self.assertTrue(updated["is_completed"])
        self.assertIsNotNone(updated["completed_at"])

    def test_delete_milestone_removes_from_parent(self):
        create_res = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Temporary Milestone"},
        )
        ms_id = create_res.json()["id"]
        self.assertEqual(service.get_spg(self.db, self.spg_id).milestone_count, 1)

        del_res = self.client.delete(f"/api/v1/spgs/{self.spg_id}/milestones/{ms_id}")
        self.assertEqual(del_res.status_code, 204)

        self.assertEqual(service.get_spg(self.db, self.spg_id).milestone_count, 0)
        self.assertEqual(service.get_spg(self.db, self.spg_id).milestone_ids, [])

    def test_submilestone_lifecycle(self):
        ms_id = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Frontend Interface"},
        ).json()["id"]

        # 1. Add submilestone
        sub_res = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones/{ms_id}/submilestones",
            json={"title": "Setup Next.js routing"},
        )
        self.assertEqual(sub_res.status_code, 201)
        subs = sub_res.json()["submilestones"]
        self.assertEqual(len(subs), 1)
        sub_id = subs[0]["id"]
        self.assertEqual(subs[0]["title"], "Setup Next.js routing")
        self.assertFalse(subs[0]["is_completed"])

        # 2. Toggle submilestone
        toggle_res = self.client.patch(
            f"/api/v1/spgs/{self.spg_id}/milestones/{ms_id}/submilestones/{sub_id}",
            json={"is_completed": True},
        )
        self.assertEqual(toggle_res.status_code, 200)
        self.assertTrue(toggle_res.json()["submilestones"][0]["is_completed"])
        self.assertIsNotNone(toggle_res.json()["submilestones"][0]["completed_at"])

        # 3. Delete submilestone
        del_sub = self.client.delete(
            f"/api/v1/spgs/{self.spg_id}/milestones/{ms_id}/submilestones/{sub_id}"
        )
        self.assertEqual(del_sub.status_code, 200)
        self.assertEqual(del_sub.json()["submilestones"], [])

    def test_outsider_cannot_modify_milestones(self):
        self.user = dict(OUTSIDER)
        res = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Unauthorized"},
        )
        self.assertEqual(res.status_code, 404)  # private SPG returns 404 to non-member

    def test_admin_can_modify_milestones(self):
        self.user = dict(ADMIN)
        res = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/milestones",
            json={"title": "Admin Created Milestone"},
        )
        self.assertEqual(res.status_code, 201)
