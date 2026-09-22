"""Unit tests for the contribution service in app/services/contributions.py.

No Firebase, no network: persistence is the in-memory fake in tests/helpers.
Every identifier is synthetic.
"""

import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.contributions import (
    AdminAwardSPG,
    AdminAwardStudent,
    ContributionRecord,
    ContributionStatus,
)
from app.services import contributions as service
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

OCCURRED_AT = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc)
ADMIN = "admin@sst.scaler.com"

STUDENTS = {
    "student.one@sst.scaler.com": {"email": "student.one@sst.scaler.com", "firebase_uid": "uid_one"},
    "student.two@sst.scaler.com": {"email": "student.two@sst.scaler.com", "firebase_uid": "uid_two"},
    "student.three@sst.scaler.com": {"email": "student.three@sst.scaler.com"},
}
SPG = {
    "id": "spg_001",
    "name": "Alpha",
    "type": "project",
    "member_ids": list(STUDENTS),
    "lead_id": "student.one@sst.scaler.com",
    "status": "active",
}


def database(**collections) -> FakeFirestore:
    data = {"users": dict(STUDENTS), "spgs": {"spg_001": dict(SPG)}}
    data.update(collections)
    return FakeFirestore(data)


def student_award(**overrides) -> AdminAwardStudent:
    body = {
        "category": "achievement",
        "title": "First place, internal hackathon",
        "points": 50,
        "occurred_at": OCCURRED_AT,
    }
    body.update(overrides)
    return AdminAwardStudent.model_validate(body)


def spg_award(**overrides) -> AdminAwardSPG:
    body = {
        "category": "project_work",
        "title": "Shipped the milestone",
        "points": 30,
        "occurred_at": OCCURRED_AT,
    }
    body.update(overrides)
    return AdminAwardSPG.model_validate(body)


def award(db, **overrides):
    return service.award_student(
        db,
        student_id=overrides.pop("student_id", "student.one@sst.scaler.com"),
        award=overrides.pop("award", student_award()),
        admin_id=ADMIN,
        runner=run_transaction,
        now=overrides.pop("now", NOW),
    )


class IdentityTests(unittest.TestCase):
    def test_email_resolves_to_itself_normalised(self):
        db = database()
        self.assertEqual(
            service.resolve_contributor_id(db, "  Student.One@SST.scaler.com "),
            "student.one@sst.scaler.com",
        )

    def test_firebase_uid_resolves_to_the_email(self):
        db = database()
        self.assertEqual(
            service.resolve_contributor_id(db, "uid_two"), "student.two@sst.scaler.com"
        )

    def test_unknown_identifier_resolves_to_nothing(self):
        for identifier in ("nobody@sst.scaler.com", "uid_missing", "", "   "):
            with self.subTest(identifier=identifier):
                self.assertIsNone(service.resolve_contributor_id(database(), identifier))


class DeduplicationKeyTests(unittest.TestCase):
    def key(self, **overrides):
        return service.deduplication_key(
            target_kind=overrides.pop("target_kind", "student"),
            contributor_id=overrides.pop("contributor_id", "student.one@sst.scaler.com"),
            details=student_award(**overrides.pop("details", {})),
            spg_id=overrides.pop("spg_id", None),
        )

    def test_same_award_gives_the_same_key(self):
        self.assertEqual(self.key(), self.key())

    def test_every_meaningful_field_changes_the_key(self):
        baseline = self.key()
        variations = {
            "contributor": {"contributor_id": "student.two@sst.scaler.com"},
            "event": {"details": {"event_id": "event_001"}},
            "spg": {"spg_id": "spg_001"},
            "occurred_at": {"details": {"occurred_at": OCCURRED_AT + timedelta(days=1)}},
            "points": {"details": {"points": 51}},
            "title": {"details": {"title": "Second place"}},
            "category": {"details": {"category": "participation"}},
            "source": {"details": {"source": {"type": "project", "id": "project_1"}}},
            "target kind": {"target_kind": "spg"},
        }
        for name, overrides in variations.items():
            with self.subTest(changed=name):
                self.assertNotEqual(baseline, self.key(**overrides))

    def test_key_is_a_sha256_digest(self):
        key = self.key()
        self.assertEqual(len(key), 64)
        self.assertTrue(all(character in "0123456789abcdef" for character in key))


class StudentAwardTests(unittest.TestCase):
    def test_award_creates_an_approved_record(self):
        db = database()
        record, created = award(db)
        self.assertTrue(created)
        self.assertEqual(record.contributor_id, "student.one@sst.scaler.com")
        self.assertIs(record.status, ContributionStatus.APPROVED)
        self.assertTrue(record.counts_toward_leaderboard)

    def test_server_owns_review_metadata_and_the_key(self):
        record, _ = award(database())
        self.assertEqual(record.recorded_by, ADMIN)
        self.assertEqual(record.reviewed_by, ADMIN)
        self.assertEqual(record.reviewed_at, NOW)
        self.assertEqual(record.created_at, NOW)
        self.assertEqual(record.deduplication_key, record.id)

    def test_request_details_are_preserved(self):
        record, _ = award(
            database(),
            award=student_award(event_id="event_001", spg_id="spg_001"),
        )
        self.assertEqual(record.occurred_at, OCCURRED_AT)
        self.assertEqual(record.event_id, "event_001")
        self.assertEqual(record.spg_id, "spg_001")

    def test_unknown_student_is_rejected(self):
        with self.assertRaises(service.ContributionError) as caught:
            award(database(), student_id="nobody@sst.scaler.com")
        self.assertEqual(caught.exception.status_code, 404)

    def test_repeating_the_award_returns_the_existing_record(self):
        db = database()
        first, created_first = award(db)
        second, created_second = award(db, now=NOW + timedelta(hours=1))
        self.assertTrue(created_first)
        self.assertFalse(created_second)
        self.assertEqual(first.id, second.id)
        self.assertEqual(second.created_at, NOW)  # the original, not the retry
        self.assertEqual(len(db.documents("contributions")), 1)

    def test_a_concurrent_writer_does_not_produce_a_second_record(self):
        db = database()

        def racing_runner(database_, work):
            # Another request commits the same award between our read and write.
            award(db)
            return run_transaction(database_, work)

        record, created = service.award_student(
            db,
            student_id="student.one@sst.scaler.com",
            award=student_award(),
            admin_id=ADMIN,
            runner=racing_runner,
            now=NOW,
        )
        self.assertFalse(created)
        self.assertEqual(len(db.documents("contributions")), 1)
        self.assertEqual(record.id, next(iter(db.documents("contributions"))))

    def test_a_different_award_creates_a_second_record(self):
        db = database()
        award(db)
        award(db, award=student_award(title="Second place", points=30))
        self.assertEqual(len(db.documents("contributions")), 2)


class SPGAwardTests(unittest.TestCase):
    def spg_award_call(self, db, **overrides):
        return service.award_spg(
            db,
            spg_id=overrides.pop("spg_id", "spg_001"),
            award=overrides.pop("award", spg_award()),
            admin_id=ADMIN,
            runner=overrides.pop("runner", run_transaction),
            now=NOW,
        )

    def test_every_member_gets_one_record(self):
        db = database()
        result = self.spg_award_call(db)
        self.assertEqual(result.awarded_count, 3)
        self.assertEqual(sorted(result.contributor_ids), sorted(STUDENTS))
        self.assertEqual(len(db.documents("contributions")), 3)

    def test_members_come_from_the_spg_not_from_users(self):
        # A user carrying a stale spg_ids field must not affect membership.
        db = database()
        db.store["users"]["outsider@sst.scaler.com"] = {
            "email": "outsider@sst.scaler.com",
            "spg_ids": ["spg_001"],
        }
        result = self.spg_award_call(db)
        self.assertNotIn("outsider@sst.scaler.com", result.contributor_ids)

    def test_every_record_carries_the_spg_and_the_event(self):
        db = database()
        self.spg_award_call(db, award=spg_award(event_id="event_001"))
        for stored in db.documents("contributions").values():
            self.assertEqual(stored["spg_id"], "spg_001")
            self.assertEqual(stored["event_id"], "event_001")

    def test_members_get_different_keys_and_equal_points(self):
        db = database()
        result = self.spg_award_call(db)
        self.assertEqual(len(set(result.contribution_ids)), 3)
        self.assertEqual(
            {stored["points"] for stored in db.documents("contributions").values()}, {30}
        )

    def test_repeating_the_award_does_not_duplicate_anyone(self):
        db = database()
        first = self.spg_award_call(db)
        second = self.spg_award_call(db)
        self.assertEqual(first.contribution_ids, second.contribution_ids)
        self.assertEqual(len(db.documents("contributions")), 3)

    def test_a_failure_awards_nobody(self):
        db = database()

        def failing_runner(database_, work):
            from tests.helpers.fake_firestore import FakeTransaction

            transaction = FakeTransaction()
            work(transaction)
            raise RuntimeError("write failed")  # before commit

        with self.assertRaises(RuntimeError):
            self.spg_award_call(db, runner=failing_runner)
        self.assertEqual(db.documents("contributions"), {})

    def test_unknown_member_stops_the_whole_award(self):
        db = database()
        db.store["spgs"]["spg_001"]["member_ids"] = [
            "student.one@sst.scaler.com",
            "ghost@sst.scaler.com",
        ]
        with self.assertRaises(service.ContributionError) as caught:
            self.spg_award_call(db)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(db.documents("contributions"), {})

    def test_missing_spg_is_rejected(self):
        with self.assertRaises(service.ContributionError) as caught:
            self.spg_award_call(database(), spg_id="spg_missing")
        self.assertEqual(caught.exception.status_code, 404)

    def test_invalid_stored_spg_is_rejected(self):
        db = database()
        db.store["spgs"]["spg_001"] = {"id": "spg_001", "name": "Broken"}
        with self.assertRaises(service.ContributionError) as caught:
            self.spg_award_call(db)
        self.assertEqual(caught.exception.status_code, 409)

    def test_too_many_members_is_rejected(self):
        db = database()
        members = [f"student{index}@sst.scaler.com" for index in range(service.MAX_SPG_MEMBERS + 1)]
        db.store["spgs"]["spg_001"]["member_ids"] = members
        db.store["spgs"]["spg_001"]["lead_id"] = members[0]
        with self.assertRaises(service.ContributionError) as caught:
            self.spg_award_call(db)
        self.assertEqual(caught.exception.status_code, 400)


class RevokeTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.record, _ = award(self.db)

    def revoke(self, record_id=None, reason="Recorded twice"):
        return service.revoke_contribution(
            self.db,
            record_id=record_id or self.record.id,
            status_reason=reason,
            admin_id=ADMIN,
            runner=run_transaction,
            now=NOW + timedelta(days=1),
        )

    def test_approved_becomes_revoked_and_is_kept(self):
        revoked = self.revoke()
        self.assertIs(revoked.status, ContributionStatus.REVOKED)
        self.assertFalse(revoked.counts_toward_leaderboard)
        self.assertIn(self.record.id, self.db.documents("contributions"))

    def test_server_sets_revoker_time_and_reason(self):
        revoked = self.revoke(reason="Awarded in error")
        self.assertEqual(revoked.revoked_by, ADMIN)
        self.assertEqual(revoked.revoked_at, NOW + timedelta(days=1))
        self.assertEqual(revoked.status_reason, "Awarded in error")

    def test_original_details_and_review_metadata_survive(self):
        revoked = self.revoke()
        self.assertEqual(revoked.reviewed_by, self.record.reviewed_by)
        self.assertEqual(revoked.reviewed_at, self.record.reviewed_at)
        self.assertEqual(revoked.created_at, self.record.created_at)
        self.assertEqual(revoked.occurred_at, self.record.occurred_at)
        self.assertEqual(revoked.points, self.record.points)

    def test_stored_document_is_a_valid_record(self):
        self.revoke()
        stored = self.db.documents("contributions")[self.record.id]
        ContributionRecord.model_validate({**stored, "id": self.record.id})

    def test_revoking_twice_is_stable(self):
        first = self.revoke()
        second = self.revoke(reason="Something else")
        self.assertEqual(second.revoked_at, first.revoked_at)
        self.assertEqual(second.status_reason, first.status_reason)

    def test_missing_record_is_rejected(self):
        with self.assertRaises(service.ContributionError) as caught:
            self.revoke(record_id="does_not_exist")
        self.assertEqual(caught.exception.status_code, 404)


class LeaderboardTests(unittest.TestCase):
    def build(self, *records) -> FakeFirestore:
        db = database()
        for index, (contributor, points, status) in enumerate(records):
            record = ContributionRecord(
                id=f"contribution_{index}",
                contributor_id=contributor,
                category="achievement",
                title="Award",
                points=points,
                occurred_at=OCCURRED_AT,
                status=status,
                recorded_by=ADMIN,
                created_at=NOW,
                reviewed_by=ADMIN if status != "pending" else None,
                reviewed_at=NOW if status != "pending" else None,
                revoked_by=ADMIN if status == "revoked" else None,
                revoked_at=NOW if status == "revoked" else None,
                status_reason="reason" if status in ("rejected", "revoked") else None,
            )
            db.collection("contributions").document(record.id).set(record.model_dump())
        return db

    def test_only_approved_records_count(self):
        db = self.build(
            ("student.one@sst.scaler.com", 50, "approved"),
            ("student.one@sst.scaler.com", 10, "pending"),
            ("student.one@sst.scaler.com", 10, "rejected"),
            ("student.one@sst.scaler.com", 10, "revoked"),
        )
        entries = service.leaderboard(db)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].points, 50)
        self.assertEqual(entries[0].contribution_count, 1)

    def test_multiple_awards_sum(self):
        db = self.build(
            ("student.one@sst.scaler.com", 50, "approved"),
            ("student.one@sst.scaler.com", 25, "approved"),
        )
        entry = service.leaderboard(db)[0]
        self.assertEqual((entry.points, entry.contribution_count), (75, 2))

    def test_order_is_points_then_count_then_id(self):
        db = self.build(
            ("b@sst.scaler.com", 40, "approved"),
            ("a@sst.scaler.com", 20, "approved"),
            ("a@sst.scaler.com", 20, "approved"),
            ("c@sst.scaler.com", 40, "approved"),
            ("d@sst.scaler.com", 20, "approved"),
            ("d@sst.scaler.com", 10, "approved"),
            ("d@sst.scaler.com", 10, "approved"),
        )
        # All four total 40, so the count breaks the tie: d has 3 records, a has
        # 2, and b and c have 1 each and fall back to contributor id.
        self.assertEqual(
            [(entry.contributor_id, entry.contribution_count) for entry in service.leaderboard(db)],
            [("d@sst.scaler.com", 3), ("a@sst.scaler.com", 2),
             ("b@sst.scaler.com", 1), ("c@sst.scaler.com", 1)],
        )

    def test_limit_is_honoured(self):
        db = self.build(
            ("a@sst.scaler.com", 30, "approved"),
            ("b@sst.scaler.com", 20, "approved"),
            ("c@sst.scaler.com", 10, "approved"),
        )
        self.assertEqual(len(service.leaderboard(db, limit=2)), 2)

    def test_a_stored_running_total_is_never_consulted(self):
        db = self.build(("student.one@sst.scaler.com", 50, "approved"))
        db.store["users"]["student.one@sst.scaler.com"]["points"] = 9999
        self.assertEqual(service.leaderboard(db)[0].points, 50)


class ListTests(unittest.TestCase):
    def populate(self) -> FakeFirestore:
        db = database()
        for index in range(5):
            service.award_student(
                db,
                student_id="student.one@sst.scaler.com",
                award=student_award(title=f"Award {index}", points=index + 1),
                admin_id=ADMIN,
                runner=run_transaction,
                now=NOW + timedelta(minutes=index),
            )
        service.award_student(
            db,
            student_id="student.two@sst.scaler.com",
            award=student_award(),
            admin_id=ADMIN,
            runner=run_transaction,
            now=NOW,
        )
        return db

    def test_filter_by_contributor(self):
        items, _ = service.list_contributions(
            self.populate(), contributor_id="student.two@sst.scaler.com"
        )
        self.assertEqual([item.contributor_id for item in items], ["student.two@sst.scaler.com"])

    def test_pages_are_bounded_and_walk_with_the_cursor(self):
        db = self.populate()
        first, cursor = service.list_contributions(
            db, contributor_id="student.one@sst.scaler.com", limit=2
        )
        self.assertEqual(len(first), 2)
        self.assertIsNotNone(cursor)
        second, _ = service.list_contributions(
            db, contributor_id="student.one@sst.scaler.com", limit=2, cursor=cursor
        )
        self.assertEqual(len(second), 2)
        self.assertFalse({item.id for item in first} & {item.id for item in second})

    def test_limit_cannot_exceed_the_maximum(self):
        db = self.populate()
        items, _ = service.list_contributions(db, limit=10_000)
        self.assertLessEqual(len(items), service.MAX_PAGE_SIZE)

    def test_unknown_cursor_is_rejected(self):
        with self.assertRaises(service.ContributionError) as caught:
            service.list_contributions(self.populate(), cursor="nonsense")
        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
