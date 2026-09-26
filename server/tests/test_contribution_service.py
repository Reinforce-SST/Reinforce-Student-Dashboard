"""Unit tests for the contribution service in app/services/contributions.py.

No Firebase, no network: persistence is the in-memory fake in tests/helpers.
Every identifier is synthetic.
"""

import copy
import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.contributions import (
    AdminAwardSPG,
    AdminAwardUser,
    ContributionCategory,
    ContributionRecord,
    ContributionStatus,
    ContributionTrack,
)
from app.services import contributions as service
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

OCCURRED_AT = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc)
ADMIN = "uid_admin"

# users/{uid}: identity is the Firebase UID everywhere.
USERS = {
    "uid_one": {"id": "uid_one", "email": "one@sst.scaler.com"},
    "uid_two": {"id": "uid_two", "email": "two@sst.scaler.com"},
    "uid_three": {"id": "uid_three", "email": "three@sst.scaler.com"},
}
SPG = {
    "id": "spg_001",
    "name": "Alpha",
    "type": "project",
    "member_ids": list(USERS),
    "lead_id": "uid_one",
    "status": "active",
}


def database(**collections) -> FakeFirestore:
    data = {"users": dict(USERS), "spgs": {"spg_001": dict(SPG)}}
    data.update(collections)
    return FakeFirestore(data)


def user_award(**overrides) -> AdminAwardUser:
    body = {
        "category": "achievement",
        "title": "First place, internal hackathon",
        "points": 50,
        "occurred_at": OCCURRED_AT,
    }
    body.update(overrides)
    return AdminAwardUser.model_validate(body)


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
    return service.award_user(
        db,
        user_id=overrides.pop("user_id", "uid_one"),
        award=overrides.pop("award", user_award()),
        admin_id=ADMIN,
        runner=run_transaction,
        now=overrides.pop("now", NOW),
    )


class IdentityTests(unittest.TestCase):
    """Identity is the Firebase UID: a `users/{uid}` document, nothing else."""

    def test_a_seeded_uid_exists(self):
        db = database()
        for uid in USERS:
            with self.subTest(uid=uid):
                self.assertTrue(service.user_exists(db, uid))

    def test_an_unknown_or_blank_uid_does_not_exist(self):
        db = database()
        for identifier in ("uid_nobody", "uid_missing", "", "   "):
            with self.subTest(identifier=identifier):
                self.assertFalse(service.user_exists(db, identifier))

    def test_an_email_is_not_an_identity(self):
        # Users are keyed by UID, so the email on the document is never a way
        # in. Passing one must not resolve to that member.
        db = database()
        self.assertFalse(service.user_exists(db, "one@sst.scaler.com"))
        self.assertFalse(service.user_exists(db, "  One@SST.scaler.com "))


class DeduplicationKeyTests(unittest.TestCase):
    def key(self, **overrides):
        return service.deduplication_key(
            target_kind=overrides.pop("target_kind", "user"),
            user_id=overrides.pop("user_id", "uid_one"),
            details=user_award(**overrides.pop("details", {})),
            spg_id=overrides.pop("spg_id", None),
        )

    def test_same_award_gives_the_same_key(self):
        self.assertEqual(self.key(), self.key())

    def test_every_meaningful_field_changes_the_key(self):
        baseline = self.key()
        variations = {
            "user": {"user_id": "uid_two"},
            "event": {"details": {"event_id": "event_001"}},
            "spg": {"spg_id": "spg_001"},
            "occurred_at": {"details": {"occurred_at": OCCURRED_AT + timedelta(days=1)}},
            "points": {"details": {"points": 51}},
            "title": {"details": {"title": "Second place"}},
            "track": {"details": {"track": "research"}},
            "category": {"details": {"category": "teaching"}},
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


class UserAwardTests(unittest.TestCase):
    def test_award_creates_an_approved_record(self):
        db = database()
        record, created = award(db)
        self.assertTrue(created)
        self.assertEqual(record.user_id, "uid_one")
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
            award=user_award(event_id="event_001", spg_id="spg_001"),
        )
        self.assertEqual(record.occurred_at, OCCURRED_AT)
        self.assertEqual(record.event_id, "event_001")
        self.assertEqual(record.spg_id, "spg_001")

    def test_the_track_defaults_to_misc_and_is_stored(self):
        db = database()
        default, _ = award(db)
        self.assertEqual(default.track.value, "misc")
        research, _ = award(db, award=user_award(track="research"))
        self.assertEqual(db.documents("contributions")[research.id]["track"], "research")

    def test_unknown_user_is_rejected(self):
        with self.assertRaises(service.ContributionError) as caught:
            award(database(), user_id="uid_nobody")
        self.assertEqual(caught.exception.status_code, 404)

    def test_an_email_is_rejected_as_a_recipient(self):
        # Identity is the UID. An email must not award anyone, even though a
        # user document carries that email.
        with self.assertRaises(service.ContributionError) as caught:
            award(database(), user_id="one@sst.scaler.com")
        self.assertEqual(caught.exception.status_code, 404)

    def test_awarding_never_writes_the_cached_user_total(self):
        # Contribution records are canonical. `users.points` is a projection the
        # users API owns; awarding must leave it exactly as it was.
        db = database()
        before = dict(db.documents("users")["uid_one"])
        award(db)
        self.assertEqual(db.documents("users")["uid_one"], before)
        self.assertNotIn("points", db.documents("users")["uid_one"])

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

        record, created = service.award_user(
            db,
            user_id="uid_one",
            award=user_award(),
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
        award(db, award=user_award(title="Second place", points=30))
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
        self.assertEqual(sorted(result.user_ids), sorted(USERS))
        self.assertEqual(len(db.documents("contributions")), 3)

    def test_membership_comes_from_the_spg_and_never_from_users_spg_ids(self):
        # `spgs.member_ids` is the only membership list. A user document
        # claiming the SPG is not a member, and the real members are awarded
        # although none of them carries an spg_ids field at all.
        db = database()
        db.store["users"]["uid_outsider"] = {
            "id": "uid_outsider",
            "email": "outsider@sst.scaler.com",
            "spg_ids": ["spg_001"],
        }
        result = self.spg_award_call(db)
        self.assertNotIn("uid_outsider", result.user_ids)
        self.assertEqual(sorted(result.user_ids), sorted(USERS))
        self.assertFalse(any("spg_ids" in USERS[uid] for uid in USERS))

    def test_awarding_an_spg_never_writes_the_cached_user_totals(self):
        db = database()
        before = copy.deepcopy(db.documents("users"))
        self.spg_award_call(db)
        self.assertEqual(db.documents("users"), before)

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
            "uid_one",
            "uid_ghost",
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
        members = [f"uid_bulk_{index}" for index in range(service.MAX_SPG_MEMBERS + 1)]
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

    def test_revoking_never_writes_the_cached_user_total(self):
        # The leaderboard stops counting the record because its status changed,
        # not because a stored total was decremented.
        before = copy.deepcopy(self.db.documents("users"))
        self.revoke()
        self.assertEqual(self.db.documents("users"), before)

    def test_revoking_removes_the_points_from_the_leaderboard(self):
        self.assertEqual(service.leaderboard(self.db)[0].points, 50)
        self.revoke()
        self.assertEqual(service.leaderboard(self.db), [])


class LeaderboardTests(unittest.TestCase):
    def build(self, *records) -> FakeFirestore:
        db = database()
        for index, (contributor, points, status) in enumerate(records):
            record = ContributionRecord(
                id=f"contribution_{index}",
                user_id=contributor,
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
            ("uid_one", 50, "approved"),
            ("uid_one", 10, "pending"),
            ("uid_one", 10, "rejected"),
            ("uid_one", 10, "revoked"),
        )
        entries = service.leaderboard(db)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].points, 50)
        self.assertEqual(entries[0].contribution_count, 1)

    def test_multiple_awards_sum(self):
        db = self.build(
            ("uid_one", 50, "approved"),
            ("uid_one", 25, "approved"),
        )
        entry = service.leaderboard(db)[0]
        self.assertEqual((entry.points, entry.contribution_count), (75, 2))

    def test_order_is_points_then_count_then_id(self):
        db = self.build(
            ("uid_b", 40, "approved"),
            ("uid_a", 20, "approved"),
            ("uid_a", 20, "approved"),
            ("uid_c", 40, "approved"),
            ("uid_d", 20, "approved"),
            ("uid_d", 10, "approved"),
            ("uid_d", 10, "approved"),
        )
        # All four total 40, so the count breaks the tie: d has 3 records, a has
        # 2, and b and c have 1 each and fall back to contributor id.
        self.assertEqual(
            [(entry.user_id, entry.contribution_count) for entry in service.leaderboard(db)],
            [("uid_d", 3), ("uid_a", 2),
             ("uid_b", 1), ("uid_c", 1)],
        )

    def test_limit_is_honoured(self):
        db = self.build(
            ("uid_a", 30, "approved"),
            ("uid_b", 20, "approved"),
            ("uid_c", 10, "approved"),
        )
        self.assertEqual(len(service.leaderboard(db, limit=2)), 2)

    def test_a_stored_running_total_is_never_consulted(self):
        db = self.build(("uid_one", 50, "approved"))
        db.store["users"]["uid_one"]["points"] = 9999
        self.assertEqual(service.leaderboard(db)[0].points, 50)


class ListTests(unittest.TestCase):
    def populate(self) -> FakeFirestore:
        db = database()
        for index in range(5):
            service.award_user(
                db,
                user_id="uid_one",
                award=user_award(title=f"Award {index}", points=index + 1),
                admin_id=ADMIN,
                runner=run_transaction,
                now=NOW + timedelta(minutes=index),
            )
        service.award_user(
            db,
            user_id="uid_two",
            award=user_award(),
            admin_id=ADMIN,
            runner=run_transaction,
            now=NOW,
        )
        return db

    def test_filter_by_user(self):
        items, _ = service.list_contributions(
            self.populate(), user_id="uid_two"
        )
        self.assertEqual([item.user_id for item in items], ["uid_two"])

    def test_filter_by_track_and_category(self):
        db = database()
        award(db, award=user_award(track="research", category="teaching"))
        award(db, award=user_award(track="product", title="Shipped it"))

        research, _ = service.list_contributions(db, track=ContributionTrack.RESEARCH)
        self.assertEqual([item.track for item in research], [ContributionTrack.RESEARCH])

        teaching, _ = service.list_contributions(db, category=ContributionCategory.TEACHING)
        self.assertEqual(
            [item.category for item in teaching], [ContributionCategory.TEACHING]
        )

        self.assertEqual(
            service.list_contributions(db, track=ContributionTrack.KAGGLE)[0], []
        )

    def test_pages_are_bounded_and_walk_with_the_cursor(self):
        db = self.populate()
        first, cursor = service.list_contributions(
            db, user_id="uid_one", limit=2
        )
        self.assertEqual(len(first), 2)
        self.assertIsNotNone(cursor)
        second, _ = service.list_contributions(
            db, user_id="uid_one", limit=2, cursor=cursor
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
