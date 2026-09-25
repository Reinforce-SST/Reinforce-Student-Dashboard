"""Endpoint tests for the contribution routes.

The real router runs under FastAPI's TestClient; only the two boundaries are
replaced — the Firestore client and the verified token — so no Firebase, no
network and no real user data is involved.

Identity is the Firebase UID: `users/{uid}` documents, `uid` on the token, and
the UID in every path. Every identifier here is synthetic.
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

# Verified-token payloads. `admin` is the Firebase custom claim, and it is the
# only thing that grants admin access.
ADMIN = {"email": "admin@sst.scaler.com", "uid": "uid_admin", "admin": True}
MEMBER = {"email": "one@sst.scaler.com", "uid": "uid_one"}
OTHER_MEMBER = {"email": "two@sst.scaler.com", "uid": "uid_two"}

USERS = {
    "uid_one": {"id": "uid_one", "email": "one@sst.scaler.com"},
    "uid_two": {"id": "uid_two", "email": "two@sst.scaler.com"},
    "uid_admin": {"id": "uid_admin", "email": "admin@sst.scaler.com"},
}
SPG = {
    "id": "spg_001",
    "name": "Alpha",
    "type": "project",
    "member_ids": ["uid_one", "uid_two"],
    "lead_id": "uid_one",
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

    def award_user(self, user_id="uid_one", **body):
        return self.client.post(
            f"/api/v1/contributions/award/user/{user_id}", json={**AWARD, **body}
        )

    def award_spg(self, spg_id="spg_001", **body):
        return self.client.post(
            f"/api/v1/contributions/award/spg/{spg_id}", json={**AWARD, **body}
        )


class AdminAuthTests(ContributionAPITestCase):
    def test_admin_claim_is_accepted(self):
        self.assertEqual(self.award_user().status_code, 200)

    def test_missing_claim_is_forbidden(self):
        self.sign_in_as(MEMBER)
        self.assertEqual(self.award_user().status_code, 403)

    def test_false_and_truthy_claims_are_forbidden(self):
        # The rule is `token.get("admin") is True`, so it fails closed: a
        # truthy string or a 1 is not an admin.
        for claim in (False, "true", "True", 1, 0, None, [], {}):
            with self.subTest(claim=claim):
                self.sign_in_as({**MEMBER, "admin": claim})
                self.assertEqual(self.award_user().status_code, 403)

    def test_every_admin_route_is_closed_to_members(self):
        self.sign_in_as(MEMBER)
        routes = [
            self.client.post("/api/v1/contributions/award/user/uid_one", json=AWARD),
            self.client.post("/api/v1/contributions/award/spg/spg_001", json=AWARD),
            self.client.patch("/api/v1/contributions/abc/revoke", json={"status_reason": "no"}),
            self.client.post("/api/v1/contributions/recalculate/uid_one"),
            self.client.get("/api/v1/contributions"),
        ]
        self.assertEqual([response.status_code for response in routes], [403] * 5)

    def test_the_admin_decision_never_reads_firestore(self):
        # Authorization comes from the custom claim alone, so a rejected
        # request must not have touched the database at all. `users.is_admin`
        # can exist for display without granting anything.
        class ExplodingFirestore:
            def collection(self, name):  # pragma: no cover - must never run
                raise AssertionError(f"the admin check read Firestore: {name}")

        self.client.app.dependency_overrides[get_db] = ExplodingFirestore
        self.sign_in_as({**MEMBER, "is_admin": True, "admin": "true"})
        self.assertEqual(self.award_user().status_code, 403)


class UserAwardEndpointTests(ContributionAPITestCase):
    def test_award_returns_an_approved_record(self):
        body = self.award_user().json()
        self.assertEqual(body["user_id"], "uid_one")
        self.assertEqual(body["status"], "approved")
        self.assertEqual(body["points"], 50)
        self.assertEqual(body["track"], "misc")

    def test_request_context_is_preserved(self):
        body = self.award_user(event_id="event_001", spg_id="spg_001", track="research").json()
        self.assertEqual(body["occurred_at"], OCCURRED_AT)
        self.assertEqual(body["event_id"], "event_001")
        self.assertEqual(body["spg_id"], "spg_001")
        self.assertEqual(body["track"], "research")

    def test_server_metadata_is_not_client_controlled(self):
        body = self.award_user().json()
        self.assertEqual(body["recorded_by"], "uid_admin")
        self.assertEqual(body["reviewed_by"], "uid_admin")
        self.assertIsNotNone(body["reviewed_at"])
        self.assertEqual(body["deduplication_key"], body["id"])

    def test_server_owned_fields_in_the_body_are_rejected(self):
        # Posted directly: `award_user` would read a `user_id` keyword as the
        # path, and the point here is what the body may not carry.
        for field, value in {
            "status": "approved",
            "recorded_by": "someone",
            "reviewed_by": "someone",
            "deduplication_key": "forged",
            "schema_version": 1,
            "user_id": "uid_two",
            "id": "forged",
        }.items():
            with self.subTest(field=field):
                response = self.client.post(
                    "/api/v1/contributions/award/user/uid_one",
                    json={**AWARD, field: value},
                )
                self.assertEqual(response.status_code, 422)

    def test_an_unknown_track_or_category_is_rejected(self):
        for field, value in (("track", "kaggel"), ("category", "participation")):
            with self.subTest(field=field):
                self.assertEqual(self.award_user(**{field: value}).status_code, 422)

    def test_occurred_at_is_required(self):
        response = self.client.post(
            "/api/v1/contributions/award/user/uid_one",
            json={key: value for key, value in AWARD.items() if key != "occurred_at"},
        )
        self.assertEqual(response.status_code, 422)

    def test_unknown_user_is_not_found(self):
        self.assertEqual(self.award_user("uid_ghost").status_code, 404)

    def test_an_email_in_the_path_is_not_found(self):
        self.assertEqual(self.award_user("one@sst.scaler.com").status_code, 404)

    def test_retrying_returns_the_same_record(self):
        first = self.award_user().json()
        second = self.award_user().json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.db.documents("contributions")), 1)

    def test_awarding_does_not_touch_the_cached_user_total(self):
        self.award_user()
        self.assertEqual(self.db.documents("users")["uid_one"], USERS["uid_one"])


class SPGAwardEndpointTests(ContributionAPITestCase):
    def test_every_member_is_awarded_once(self):
        body = self.award_spg().json()
        self.assertEqual(body["awarded_count"], 2)
        self.assertEqual(sorted(body["user_ids"]), SPG["member_ids"])
        self.assertEqual(body["points_per_member"], 50)

    def test_records_carry_the_spg_and_event(self):
        self.award_spg(event_id="event_001")
        for stored in self.db.documents("contributions").values():
            self.assertEqual((stored["spg_id"], stored["event_id"]), ("spg_001", "event_001"))

    def test_spg_id_in_the_body_is_rejected(self):
        # The SPG comes from the path; the body cannot name a second one.
        # Posted directly, because `award_spg` reads `spg_id` as the path.
        response = self.client.post(
            "/api/v1/contributions/award/spg/spg_001",
            json={**AWARD, "spg_id": "spg_002"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.documents("contributions"), {})

    def test_missing_spg_is_not_found(self):
        self.assertEqual(self.award_spg("spg_missing").status_code, 404)

    def test_retrying_does_not_duplicate_members(self):
        first = self.award_spg().json()
        second = self.award_spg().json()
        self.assertEqual(first["contribution_ids"], second["contribution_ids"])
        self.assertEqual(len(self.db.documents("contributions")), 2)

    def test_awarding_does_not_touch_the_cached_user_totals(self):
        self.award_spg()
        self.assertEqual(self.db.documents("users"), USERS)


class RevokeEndpointTests(ContributionAPITestCase):
    def setUp(self):
        super().setUp()
        self.record_id = self.award_user().json()["id"]

    def revoke(self, record_id=None, **body):
        return self.client.patch(
            f"/api/v1/contributions/{record_id or self.record_id}/revoke",
            json={"status_reason": "Recorded twice", **body},
        )

    def test_revoking_keeps_the_record_and_the_reason(self):
        body = self.revoke().json()
        self.assertEqual(body["status"], "revoked")
        self.assertEqual(body["status_reason"], "Recorded twice")
        self.assertEqual(body["revoked_by"], "uid_admin")
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

    def test_revoking_does_not_touch_the_cached_user_total(self):
        self.revoke()
        self.assertEqual(self.db.documents("users")["uid_one"], USERS["uid_one"])


class HistoryAccessTests(ContributionAPITestCase):
    def setUp(self):
        super().setUp()
        self.own = self.award_user("uid_one").json()["id"]
        self.other = self.award_user("uid_two").json()["id"]

    def test_a_member_sees_only_their_own_history(self):
        self.sign_in_as(MEMBER)
        body = self.client.get("/api/v1/contributions/me").json()
        self.assertEqual({item["user_id"] for item in body["items"]}, {"uid_one"})

    def test_a_member_cannot_read_another_members_record(self):
        self.sign_in_as(MEMBER)
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.other}").status_code, 404)

    def test_a_member_can_read_their_own_record(self):
        self.sign_in_as(MEMBER)
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.own}").status_code, 200)

    def test_an_admin_can_read_any_record(self):
        self.assertEqual(self.client.get(f"/api/v1/contributions/{self.other}").status_code, 200)

    def test_a_member_may_read_their_own_history_by_uid(self):
        self.sign_in_as(MEMBER)
        body = self.client.get("/api/v1/contributions/user/uid_one").json()
        self.assertEqual({item["user_id"] for item in body["items"]}, {"uid_one"})

    def test_another_members_history_is_not_found(self):
        # 404 rather than 403, so the route cannot confirm what exists.
        self.sign_in_as(MEMBER)
        self.assertEqual(
            self.client.get("/api/v1/contributions/user/uid_two").status_code, 404
        )

    def test_an_admin_may_read_any_history_by_uid(self):
        self.assertEqual(
            self.client.get("/api/v1/contributions/user/uid_two").status_code, 200
        )

    def test_admin_listing_filters_by_uid(self):
        body = self.client.get(
            "/api/v1/contributions", params={"user_id": "uid_two"}
        ).json()
        self.assertEqual({item["user_id"] for item in body["items"]}, {"uid_two"})

    def test_admin_listing_filters_by_track_and_category(self):
        self.award_user("uid_one", track="research", title="Paper", points=10)
        research = self.client.get(
            "/api/v1/contributions", params={"track": "research"}
        ).json()
        self.assertEqual({item["track"] for item in research["items"]}, {"research"})

        achievements = self.client.get(
            "/api/v1/contributions", params={"category": "achievement"}
        ).json()
        self.assertEqual(
            {item["category"] for item in achievements["items"]}, {"achievement"}
        )

    def test_an_unknown_filter_value_is_rejected(self):
        for params in ({"track": "kaggel"}, {"category": "participation"}):
            with self.subTest(params=params):
                self.assertEqual(
                    self.client.get("/api/v1/contributions", params=params).status_code, 422
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
        self.award_user("uid_one")
        self.award_user("uid_one", title="Second", points=20)
        revoked = self.award_user("uid_two").json()["id"]
        self.client.patch(
            f"/api/v1/contributions/{revoked}/revoke", json={"status_reason": "Error"}
        )

        board = self.client.get("/api/v1/contributions/leaderboard").json()
        self.assertEqual(len(board), 1)
        self.assertEqual(board[0]["user_id"], "uid_one")
        self.assertEqual(board[0]["points"], 70)
        self.assertEqual(board[0]["contribution_count"], 2)

    def test_a_stored_user_total_is_never_used(self):
        self.award_user("uid_one")
        self.db.store["users"]["uid_one"]["points"] = {"total": 9999}
        board = self.client.get("/api/v1/contributions/leaderboard").json()
        self.assertEqual(board[0]["points"], 50)

    def test_a_member_may_read_the_leaderboard(self):
        self.award_user()
        self.sign_in_as(MEMBER)
        self.assertEqual(self.client.get("/api/v1/contributions/leaderboard").status_code, 200)

    def test_limit_is_bounded(self):
        self.assertEqual(
            self.client.get("/api/v1/contributions/leaderboard", params={"limit": 0}).status_code,
            422,
        )


class RecalculateEndpointTests(ContributionAPITestCase):
    """`users.points` is a cached projection, rebuilt only by this route."""

    def test_awarding_leaves_the_cache_stale_until_recalculate_runs(self):
        self.award_user("uid_one")
        self.assertNotIn("points", self.db.documents("users")["uid_one"])

        body = self.client.post("/api/v1/contributions/recalculate/uid_one").json()
        self.assertEqual(body["points"]["total"], 50)
        self.assertEqual(body["points"]["misc"], 50)
        self.assertEqual(self.db.documents("users")["uid_one"]["points"]["total"], 50)

    def test_the_rebuild_splits_points_by_track(self):
        self.award_user("uid_one", track="research", title="Paper", points=10)
        self.award_user("uid_one", track="product", title="Shipped", points=5)
        points = self.client.post("/api/v1/contributions/recalculate/uid_one").json()["points"]
        self.assertEqual(points["total"], 15)
        self.assertEqual(points["research"], 10)
        self.assertEqual(points["product"], 5)
        self.assertEqual(points["kaggle"], 0)

    def test_revoked_points_are_dropped_by_the_rebuild(self):
        record_id = self.award_user("uid_one").json()["id"]
        self.client.patch(
            f"/api/v1/contributions/{record_id}/revoke", json={"status_reason": "Error"}
        )
        points = self.client.post("/api/v1/contributions/recalculate/uid_one").json()["points"]
        self.assertEqual(points["total"], 0)

    def test_an_unknown_user_is_not_found(self):
        self.assertEqual(
            self.client.post("/api/v1/contributions/recalculate/uid_ghost").status_code, 404
        )

    def test_the_rebuild_never_changes_a_contribution(self):
        self.award_user("uid_one")
        before = dict(self.db.documents("contributions"))
        self.client.post("/api/v1/contributions/recalculate/uid_one")
        self.assertEqual(self.db.documents("contributions"), before)


if __name__ == "__main__":
    unittest.main()
