"""Unit tests for the Idea Jar Student Lifecycle & Discovery (app/api/v1/endpoints/ideas.py).

Covers:
- Student submitting an idea proposal (POST /ideas)
- Student viewing own submitted proposals (GET /ideas/my)
- Drawing a random verified idea (GET /ideas/random)
- Upvoting / un-upvoting an idea with count tracking (POST /ideas/{id}/upvote)
- Admin approval and publication to public discovery (POST /ideas/{id}/approve)
- Admin deletion / closing of idea proposals (DELETE /ideas/{id})
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_admin_user, get_current_user, get_optional_current_user
from app.api.v1.endpoints import ideas
from app.schemas.ideas import IdeaDifficulty, IdeaTrack
from tests.helpers.fake_firestore import run_transaction
from tests.helpers.nested_firestore import NestedFirestore


ADMIN = {"uid": "admin-uid", "email": "admin@sst.scaler.com", "admin": True, "name": "Lead Admin"}
STUDENT_A = {"uid": "student-a-uid", "email": "studenta@sst.scaler.com", "name": "Student A"}
STUDENT_B = {"uid": "student-b-uid", "email": "studentb@sst.scaler.com", "name": "Student B"}


class IdeaStudentLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        self.ideas_patch = patch.object(ideas, "db", self.db)
        self.ideas_patch.start()
        self.addCleanup(self.ideas_patch.stop)

        self.txn_patch = patch("google.cloud.firestore.transactional", lambda func: func)
        self.txn_patch.start()
        self.addCleanup(self.txn_patch.stop)

        # Ensure run_in_transaction functions with NestedFirestore mock
        self.db.transaction = lambda: NestedFirestoreTransaction(self.db)

        # Seed Users
        for u in [ADMIN, STUDENT_A, STUDENT_B]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": u["name"],
                "email": u["email"],
                "batch_year": 2027,
                "is_member": True,
            })

        self.user = dict(STUDENT_A)

        app = FastAPI()
        app.include_router(ideas.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        app.dependency_overrides[get_admin_user] = lambda: self.user if (self.user and self.user.get("admin")) else self._raise_forbidden()
        self.client = TestClient(app)

    def _raise_forbidden(self):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required.")

    def as_admin(self):
        self.user = dict(ADMIN)

    def as_student_a(self):
        self.user = dict(STUDENT_A)

    def as_student_b(self):
        self.user = dict(STUDENT_B)

    def as_visitor(self):
        self.user = None

    def test_student_submit_idea_proposal(self):
        self.as_student_a()
        payload = {
            "title": "Automated Code Review Agent",
            "description": "An agent that checks PR diffs against security standards.",
            "track": "product",
            "difficulty": "intermediate",
            "prerequisites": ["Python", "FastAPI"],
            "rough_roadmap": ["1. Parse diffs", "2. Run LLM evaluations"],
            "learning_outcomes": ["Agentic AI workflows", "CI/CD integration"],
            "spg_creation_type": "project",
        }
        res = self.client.post("/api/v1/ideas", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        idea_id = data["id"]
        self.assertTrue(idea_id.startswith("idea_"))
        self.assertEqual(data["title"], "Automated Code Review Agent")
        self.assertFalse(data["is_verified"])

        # Check saved idea document in database
        idea_doc = self.db.collection("ideas").document(idea_id).get().to_dict()
        self.assertEqual(idea_doc["created_by_uid"], STUDENT_A["uid"])
        self.assertFalse(idea_doc["is_verified"])

    def test_student_lists_own_ideas(self):
        self.as_student_a()
        # Submit an idea
        res1 = self.client.post("/api/v1/ideas", json={
            "title": "AI Math Tutor",
            "description": "Interactive step by step math helper.",
            "track": "research",
        })
        self.assertEqual(res1.status_code, 201)

        # Also seed an approved idea directly in ideas collection
        self.db.collection("ideas").document("idea_existing").set({
            "id": "idea_existing",
            "title": "Quantum Simulator",
            "description": "Classical sim of quantum circuits.",
            "track": "research",
            "is_verified": True,
            "created_by_uid": STUDENT_A["uid"],
        })

        # Query /ideas/my
        my_ideas_res = self.client.get("/api/v1/ideas/my")
        self.assertEqual(my_ideas_res.status_code, 200)
        items = my_ideas_res.json()["items"]
        titles = [i["title"] for i in items]
        self.assertIn("AI Math Tutor", titles)
        self.assertIn("Quantum Simulator", titles)

    def test_draw_random_idea_returns_only_verified_ideas(self):
        # Seed an unverified ticket proposal and an approved idea
        self.db.collection("tickets").document("tkt_unapproved").set({
            "id": "tkt_unapproved",
            "category": "idea_jar",
            "title": "Unapproved Draft Idea",
            "status": "open",
        })
        self.db.collection("ideas").document("idea_approved").set({
            "id": "idea_approved",
            "title": "Distributed Key-Value Store",
            "description": "Raft-based consensus store.",
            "track": "product",
            "is_verified": True,
            "stats": {"upvote_count": 5},
        })

        self.as_visitor()
        res = self.client.get("/api/v1/ideas/random")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], "idea_approved")
        self.assertEqual(res.json()["title"], "Distributed Key-Value Store")

    def test_toggle_idea_upvote_and_count_tracking(self):
        self.db.collection("ideas").document("idea_upvote_me").set({
            "id": "idea_upvote_me",
            "title": "Autonomous Drone Pathfinding",
            "description": "A* search on voxel grids.",
            "track": "research",
            "is_verified": True,
            "stats": {"upvote_count": 0},
        })

        # Student A upvotes
        self.as_student_a()
        first_toggle = self.client.post("/api/v1/ideas/idea_upvote_me/upvote").json()
        self.assertTrue(first_toggle["upvoted"])
        self.assertEqual(first_toggle["upvote_count"], 1)

        # Student B upvotes
        self.as_student_b()
        second_toggle = self.client.post("/api/v1/ideas/idea_upvote_me/upvote").json()
        self.assertTrue(second_toggle["upvoted"])
        self.assertEqual(second_toggle["upvote_count"], 2)

        # Student A toggles again -> removes upvote
        self.as_student_a()
        untoggle = self.client.post("/api/v1/ideas/idea_upvote_me/upvote").json()
        self.assertFalse(untoggle["upvoted"])
        self.assertEqual(untoggle["upvote_count"], 1)

    def test_admin_approval_and_deletion_lifecycle(self):
        # 1. Student A submits proposal
        self.as_student_a()
        submit_res = self.client.post("/api/v1/ideas", json={
            "title": "Deep RL for Traffic Signals",
            "description": "Multi-agent RL environment for city grid signals.",
            "track": "research",
        })
        ticket_id = submit_res.json()["id"]

        # 2. Student cannot approve
        approve_fail = self.client.post(f"/api/v1/ideas/{ticket_id}/approve")
        self.assertEqual(approve_fail.status_code, 403)

        # 3. Admin approves proposal
        self.as_admin()
        approve_res = self.client.post(f"/api/v1/ideas/{ticket_id}/approve")
        self.assertEqual(approve_res.status_code, 200, approve_res.text)
        approved_data = approve_res.json()
        self.assertTrue(approved_data["is_verified"])
        live_idea_id = approved_data["id"]

        # 4. Student cannot delete approved idea
        self.as_student_a()
        del_fail = self.client.delete(f"/api/v1/ideas/{live_idea_id}")
        self.assertEqual(del_fail.status_code, 403)

        # 5. Admin deletes approved idea
        self.as_admin()
        del_ok = self.client.delete(f"/api/v1/ideas/{live_idea_id}")
        self.assertEqual(del_ok.status_code, 200)
        self.assertNotIn(f"ideas/{live_idea_id}", self.db.store)


class NestedFirestoreTransaction:
    """Mock transaction wrapper for NestedFirestore."""
    def __init__(self, db):
        self.db = db
        self._read_only = False
        self._id = b"fake-transaction"
        self._max_attempts = 1

    def _begin(self, *args, **kwargs):
        self._id = b"fake-transaction"

    def _commit(self, *args, **kwargs):
        pass

    def _rollback(self, *args, **kwargs):
        pass

    def _clean_up(self, *args, **kwargs):
        pass

    def get(self, ref):
        return ref.get()

    def set(self, ref, data):
        ref.set(data)

    def update(self, ref, data):
        ref.update(data)

    def delete(self, ref):
        ref.delete()


if __name__ == "__main__":
    unittest.main()
