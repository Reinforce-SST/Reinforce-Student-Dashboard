"""Endpoint tests for the contribution routes.

The real router runs under FastAPI's TestClient; only the two boundaries are
replaced — the Firestore client and the verified token — so no Firebase, no
network and no real user data is involved.
"""

import unittest
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import contributions as endpoints
from app.services import contributions as service
from app.services.firebase import get_db
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

OCCURRED_AT = "2026-09-01T10:00:00+00:00"
ADMIN = {"email": "Admin@sst.scaler.com", "uid": "uid_admin", "admin": True}
STUDENT = {"email": "student.one@sst.scaler.com", "uid": "uid_one"}
OTHER_STUDENT = {"email": "student.two@sst.scaler.com", "uid": "uid_two"}

USERS = {
    "student.one@sst.scaler.com": {"email": "student.one@sst.scaler.com", "firebase_uid": "uid_one"},
    "student.two@sst.scaler.com": {"email": "student.two@sst.scaler.com", "firebase_uid": "uid_two"},
    "admin@sst.scaler.com": {"email": "admin@sst.scaler.com", "firebase_uid": "uid_admin"},
}
SPG = {
    "id": "spg_001",
    "name": "Alpha",
    "type": "project",
    "member_ids": ["student.one@sst.scaler.com", "student.two@sst.scaler.com"],
    "lead_id": "student.one@sst.scaler.com",
    "status": "active",
}

AWARD = {
    "category": "achievement",
    "title": "First place, internal hackathon",
    "points": 50,
    "occurred_at": OCCURRED_AT,
}


class ContributionAPITestCase(unittest.TestCase):
    """A client wired to a fresh fake database, signed in as `self.user`."""

    def setUp(self):
        self.db = FakeFirestore({"users": dict(USERS), "spgs": {"spg_001": dict(SPG)}})
        self.user = dict(ADMIN)

        # Production runs one transaction per write; the fake runs the same
        # code path in memory.
        self._real_runner = service.run_in_transaction
        service.run_in_transaction = run_transaction
        self.addCleanup(setattr, service, "run_in_transaction", self._real_runner)

        app = FastAPI()
        app.include_router(endpoints.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def sign_in_as(self, user: dict) -> None:
        self.user = dict(user)

    def award_student(self, student_id="student.one@sst.scaler.com", **body):
        return self.client.post(
            f"/api/v1/contributions/award/student/{student_id}", json={**AWARD, **body}
        )

    def award_spg(self, spg_id="spg_001", **body):
        return self.client.post(
            f"/api/v1/contributions/award/spg/{spg_id}", json={**AWARD, **body}
        )


class AdminAuthTests(ContributionAPITestCase):
    def test_admin_claim_is_accepted(self):
        self.assertEqual(self.award_student().status_code, 200)

    def test_missing_claim_is_forbidden(self):
        self.sign_in_as(STUDENT)
        self.assertEqual(self.award_student().status_code, 403)

    def test_false_and_truthy_claims_are_forbidden(self):
        for claim in (False, "true", 1, None):
            with self.subTest(claim=claim):
                self.sign_in_as({**STUDENT, "admin": claim})
                self.assertEqual(self.award_student().status_code, 403)

    def test_every_admin_route_is_closed_to_students(self):
        self.sign_in_as(STUDENT)
        routes = [
            self.client.post("/api/v1/contributions/award/student/student.one@sst.scaler.com", json=AWARD),
            self.client.post("/api/v1/contributions/award/spg/spg_001", json=AWARD),
            self.client.patch("/api/v1/contributions/abc/revoke", json={"status_reason": "no"}),
            self.client.get("/api/v1/contributions"),
        ]
        self.assertEqual([response.status_code for response in routes], [403] * 4)


class StudentAwardEndpointTests(ContributionAPITestCase):
    def test_award_returns_an_approved_record(self):
        body = self.award_student().json()
        self.assertEqual(body["contributor_id"], "student.one@sst.scaler.com")
        self.assertEqual(body["status"], "approved")
        self.assertEqual(body["points"], 50)

    def test_request_context_is_preserved(self):
        body = self.award_student(event_id="event_001", spg_id="spg_001").json()
        self.assertEqual(body["occurred_at"], OCCURRED_AT)
        self.assertEqual(body["event_id"], "event_001")
        self.assertEqual(body["spg_id"], "spg_001")

    def test_server_metadata_is_not_client_controlled(self):
        body = self.award_student().json()
        self.assertEqual(body["recorded_by"], "admin@sst.scaler.com")  # normalised
        self.assertEqual(body["reviewed_by"], "admin@sst.scaler.com")
        self.assertIsNotNone(body["reviewed_at"])
        self.assertEqual(body["deduplication_key"], body["id"])

    def test_server_owned_fields_in_the_body_are_rejected(self):
        for field, value in {
            "status": "approved",
            "recorded_by": "someone",
            "reviewed_by": "someone",
            "deduplication_key": "forged",
            "schema_version": 1,
            "contributor_id": "student.two@sst.scaler.com",
        }.items():
            with self.subTest(field=field):
                self.assertEqual(self.award_student(**{field: value}).status_code, 422)

    def test_occurred_at_is_required(self):
        response = self.client.post(
            "/api/v1/contributions/award/student/student.one@sst.scaler.com",
            json={k: v for k, v in AWARD.items() if k != "occurred_at"},
        )
        self.assertEqual(response.status_code, 422)

    def test_unknown_student_is_not_found(self):
        self.assertEqual(self.award_student("ghost@sst.scaler.com").status_code, 404)

    def test_retrying_returns_the_same_record(self):
        first = self.award_student().json()
        second = self.award_student().json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.db.documents("contributions")), 1)


class SPGAwardEndpointTests(ContributionAPITestCase):
    def test_every_member_is_awarded_once(self):
        body = self.award_spg().json()
        self.assertEqual(body["awarded_count"], 2)
        self.assertEqual(sorted(body["contributor_ids"]), SPG["member_ids"])
        self.assertEqual(body["points_per_member"], 50)

    def test_records_carry_the_spg_and_event(self):
        self.award_spg(event_id="event_001")
        for stored in self.db.documents("contributions").values():
            self.assertEqual((stored["spg_id"], stored["event_id"]), ("spg_001", "event_001"))

    def test_spg_id_in_the_body_is_rejected(self):
        self.assertEqual(self.award_spg(spg_id_in_body="spg_002").status_code, 422)

    def test_missing_spg_is_not_found(self):
        self.assertEqual(self.award_spg("spg_missing").status_code, 404)

    def test_retrying_does_not_duplicate_members(self):
        first = self.award_spg().json()
        second = self.award_spg().json()
        self.assertEqual(first["contribution_ids"], second["contribution_ids"])
        self.assertEqual(len(self.db.documents("contributions")), 2)


class RevokeEndpointTests(ContributionAPITestCase):
    def setUp(self):
        super().setUp()
        self.record_id = self.award_student().json()["id"]

    def revoke(self, record_id=None, **body):
        return self.client.patch(
            f"/api/v1/contributions/{record_id or self.record_id}/revoke",
            json={"status_reason": "Recorded twice", **body},
        )

    def test_revoking_keeps_the_record_and_the_reason(self):
        body = self.revoke().json()
        self.assertEqual(body["status"], "revoked")
        self.assertEqual(body["status_reason"], "Recorded twice")
        self.assertEqual(body["revoked_by"], "admin@sst.scaler.com")
        self.assertIsNotNone(body["revoked_at"])
        self.assertIn(self.record_id, self.db.documents("contributions"))

    def test_reason_is_required(self):
        response = self.client.patch(
            f"/api/v1/contributions/{self.record_id}/revoke", json={}
        )
        self.assertEqual(response.status_code, 422)

    def test_server_owned_revocation_fields_are_rejected(self):
        for field in ("revoked_by", "revoked_at", "status", "record_id"):
            with self.subTest(field=field):
                response = self.client.patch(
                    f"/api/v1/contributions/{self.record_id}/revoke",
                    json={"status_reason": "Recorded twice", field: "forged"},
                )
                self.assertEqual(response.status_code, 422)

    def test_missing_record_is_not_found(self):
        self.assertEqual(self.revoke("does_not_exist").status_code, 404)

    def test_revoked_points_leave_the_leaderboard(self):
        before = self.client.get("/api/v1/contributions/leaderboard").json()
        self.assertEqual(before[0]["points"], 50)
        self.revoke()
        self.assertEqual(self.client.get("/api/v1/contributions/leaderboard").json(), [])


class HistoryAccessTests(ContributionAPITestCase):
    def setUp(self):
        super().setUp()
        self.own = self.award_student("student.one@sst.scaler.com").json()["id"]
        self.other = self.award_student("student.two@sst.scaler.com").json()["id"]

    def test_a_student_sees_only_their_own_history(self):
        self.sign_in_as(STUDENT)
        body = self.client.get("/api/v1/contributions/me").json()
        self.assertEqual(
            {item["contributor_id"] for item in body["items"]}, {"student.one@sst.scaler.com"}
        )

    def test_a_student_cannot_read_another_students_record(self):
        self.sign_in_as(STUDENT)
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.other}").status_code, 404)

    def test_a_student_can_read_their_own_record(self):
        self.sign_in_as(STUDENT)
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.own}").status_code, 200)

    def test_an_admin_can_read_any_record(self):
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.other}").status_code, 200)

    def test_admin_listing_filters(self):
        body = self.client.get(
            "/api/v1/contributions", params={"contributor_id": "Student.Two@sst.scaler.com"}
        ).json()
        self.assertEqual(
            {item["contributor_id"] for item in body["items"]}, {"student.two@sst.scaler.com"}
        )

    def test_listing_is_bounded(self):
        self.assertEqual(
            self.client.get("/api/v1/contributions", params={"limit": 1000}).status_code, 422
        )
        body = self.client.get("/api/v1/contributions", params={"limit": 1}).json()
        self.assertEqual(len(body["items"]), 1)
        self.assertIsNotNone(body["next_cursor"])


class LeaderboardEndpointTests(ContributionAPITestCase):
    def test_only_approved_points_are_counted(self):
        self.award_student("student.one@sst.scaler.com")
        self.award_student("student.one@sst.scaler.com", title="Second", points=20)
        revoked = self.award_student("student.two@sst.scaler.com").json()["id"]
        self.client.patch(
            f"/api/v1/contributions/{revoked}/revoke", json={"status_reason": "Error"}
        )

        board = self.client.get("/api/v1/contributions/leaderboard").json()
        self.assertEqual(len(board), 1)
        self.assertEqual(board[0]["contributor_id"], "student.one@sst.scaler.com")
        self.assertEqual(board[0]["points"], 70)
        self.assertEqual(board[0]["contribution_count"], 2)

    def test_a_student_may_read_the_leaderboard(self):
        self.award_student()
        self.sign_in_as(STUDENT)
        self.assertEqual(self.client.get("/api/v1/contributions/leaderboard").status_code, 200)

    def test_limit_is_bounded(self):
        self.assertEqual(
            self.client.get("/api/v1/contributions/leaderboard", params={"limit": 0}).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
