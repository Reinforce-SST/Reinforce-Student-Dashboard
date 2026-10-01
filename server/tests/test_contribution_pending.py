"""Pending contributions: an action records a request, an admin sets the points.

CONTRIBUTION_SCHEMA.md describes activity -> pending -> review -> approved, and
leaves open (decision #9) whether a reviewer may set points while pending. The
club decided they do: nothing an action records counts until a person has
reviewed it and chosen the points.
"""

import unittest
from datetime import datetime, timezone

from app.schemas.contributions import ContributionDetails, ContributionStatus
from app.services import contributions as service
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

OCCURRED_AT = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
ADMIN = "uid_admin"


def details(**overrides) -> ContributionDetails:
    body = {
        "category": "content",
        "title": "Published an article: Evaluating retrieval",
        "points": 0,
        "source": {"type": "blog", "id": "blog_1"},
        "occurred_at": OCCURRED_AT,
    }
    body.update(overrides)
    return ContributionDetails.model_validate(body)


class PendingContributionTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore({"users": {"uid_one": {"id": "uid_one"}}})

    def record(self, **overrides):
        args = {
            "user_id": "uid_one",
            "activity": "blog:blog_1",
            "details": details(),
            "recorder": "system",
            "runner": run_transaction,
            "now": NOW,
        }
        args.update(overrides)
        return service.record_pending(self.db, **args)

    def review(self, record_id, **overrides):
        args = {"record_id": record_id, "approve": True, "points": 20, "reason": None,
                "admin_id": ADMIN, "runner": run_transaction, "now": LATER}
        args.update(overrides)
        return service.review_contribution(self.db, **args)

    def test_an_action_records_a_pending_request_worth_nothing_yet(self):
        record, created = self.record()
        self.assertTrue(created)
        self.assertIs(record.status, ContributionStatus.PENDING)
        self.assertEqual(record.points, 0)
        self.assertIsNone(record.reviewed_by)
        self.assertFalse(record.counts_toward_leaderboard)
        self.assertEqual(record.recorded_by, "system")

    def test_the_same_activity_is_recorded_once(self):
        first, _ = self.record()
        # Re-publishing with a new title is the same activity, not a new one.
        again, created = self.record(details=details(title="Published an article: Retrieval, revised"))
        self.assertFalse(created)
        self.assertEqual(again.id, first.id)
        self.assertEqual(len(self.db.documents("contributions")), 1)

    def test_a_different_activity_is_a_different_request(self):
        self.record()
        self.record(activity="blog:blog_2", details=details(source={"type": "blog", "id": "blog_2"}))
        self.assertEqual(len(self.db.documents("contributions")), 2)

    def test_an_unknown_member_is_refused(self):
        with self.assertRaises(service.ContributionError) as error:
            self.record(user_id="uid_missing")
        self.assertEqual(error.exception.status_code, 404)

    def test_approving_sets_the_points_the_admin_chose(self):
        record, _ = self.record()
        approved = self.review(record.id, points=25)
        self.assertIs(approved.status, ContributionStatus.APPROVED)
        self.assertEqual(approved.points, 25)
        self.assertEqual((approved.reviewed_by, approved.reviewed_at), (ADMIN, LATER))
        self.assertTrue(approved.counts_toward_leaderboard)
        stored = self.db.documents("contributions")[record.id]
        self.assertEqual((stored["status"], stored["points"]), ("approved", 25))
        # The content the action recorded is untouched by review.
        self.assertEqual(stored["title"], "Published an article: Evaluating retrieval")

    def test_approving_requires_a_whole_number_of_points(self):
        record, _ = self.record()
        for points in (None, -1, 2.5, True):
            with self.subTest(points=points), self.assertRaises(service.ContributionError) as error:
                self.review(record.id, points=points)
            self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.db.documents("contributions")[record.id]["status"], "pending")

    def test_rejecting_needs_a_reason_and_awards_nothing(self):
        record, _ = self.record()
        with self.assertRaises(service.ContributionError) as error:
            self.review(record.id, approve=False, points=None, reason=None)
        self.assertEqual(error.exception.status_code, 400)
        rejected = self.review(record.id, approve=False, points=None, reason="Duplicate of an earlier article.")
        self.assertIs(rejected.status, ContributionStatus.REJECTED)
        self.assertEqual(rejected.status_reason, "Duplicate of an earlier article.")
        self.assertEqual(rejected.points, 0)
        self.assertFalse(rejected.counts_toward_leaderboard)

    def test_only_a_pending_request_can_be_reviewed(self):
        record, _ = self.record()
        self.review(record.id)
        with self.assertRaises(service.ContributionError) as error:
            self.review(record.id, points=99)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.db.documents("contributions")[record.id]["points"], 20)

    def test_reviewing_a_missing_record_is_not_found(self):
        with self.assertRaises(service.ContributionError) as error:
            self.review("nope")
        self.assertEqual(error.exception.status_code, 404)

    def test_a_pending_request_never_reaches_the_leaderboard(self):
        self.record()
        self.assertEqual(service.leaderboard(self.db), [])
        record_id = next(iter(self.db.documents("contributions")))
        self.review(record_id, points=30)
        [row] = service.leaderboard(self.db)
        self.assertEqual((row.user_id, row.points), ("uid_one", 30))


if __name__ == "__main__":
    unittest.main()
