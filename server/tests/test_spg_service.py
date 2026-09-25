"""Unit tests for the SPG service in app/services/spgs.py.

No Firebase, no network: persistence is the in-memory fake in tests/helpers.
Every identifier is synthetic.
"""

import copy
import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.spgs import SPGCreate, SPGStatus, SPGTrack, SPGType, SPGUpdate, SPGVisibility
from app.services import spgs as service
from tests.helpers.fake_firestore import FakeFirestore, run_transaction

NOW = datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc)
ADMIN = "uid_admin"

# users/{uid}: a canonical profile carries `id` equal to its own document ID.
USERS = {
    "uid_one": {"id": "uid_one", "email": "one@sst.scaler.com", "full_name": "One"},
    "uid_two": {"id": "uid_two", "email": "two@sst.scaler.com", "full_name": "Two"},
    "uid_three": {"id": "uid_three", "email": "three@sst.scaler.com", "full_name": "Three"},
}

# The same collection also holds documents keyed by email and by Discord ID.
# Neither is an identity, and neither carries `id`.
SHADOW_DOCS = {
    "one@sst.scaler.com": {"email": "one@sst.scaler.com", "firebase_uid": "uid_one"},
    "123456789012345678": {"discord_id": "123456789012345678", "firebase_uid": "uid_one"},
}


def database(**collections) -> FakeFirestore:
    data = {"users": {**copy.deepcopy(USERS), **copy.deepcopy(SHADOW_DOCS)}}
    data.update(collections)
    return FakeFirestore(data)


def create_payload(**overrides) -> SPGCreate:
    body = {
        "name": "Seismic Prediction",
        "description": "Ensemble model for earthquake detection.",
        "type": "project",
        "track": "research",
        "visibility": "private",
        "member_ids": ["uid_one", "uid_two"],
        "lead_id": "uid_one",
        "proposition_document_url": "https://storage.test/p.pdf",
        "source_ticket_id": "ticket_001",
    }
    body.update(overrides)
    return SPGCreate.model_validate(body)


def create(db, **overrides):
    # Pop the control arguments before the rest become payload overrides.
    payload = overrides.pop("create", None)
    moment = overrides.pop("now", NOW)
    return service.create_spg(
        db,
        create=payload if payload is not None else create_payload(**overrides),
        admin_id=ADMIN,
        runner=run_transaction,
        now=moment,
    )


class CanonicalIdentityTests(unittest.TestCase):
    """Membership is a Firebase UID, not whatever has a document."""

    def test_a_canonical_profile_is_accepted(self):
        db = database()
        for uid in USERS:
            with self.subTest(uid=uid):
                self.assertTrue(service.canonical_user_exists(db, uid))

    def test_an_email_keyed_document_is_not_an_identity(self):
        # The document exists, so a bare existence check would pass it.
        db = database()
        self.assertTrue(db.collection("users").document("one@sst.scaler.com").get().exists)
        self.assertFalse(service.canonical_user_exists(db, "one@sst.scaler.com"))

    def test_a_discord_keyed_document_is_not_an_identity(self):
        db = database()
        self.assertTrue(db.collection("users").document("123456789012345678").get().exists)
        self.assertFalse(service.canonical_user_exists(db, "123456789012345678"))

    def test_unknown_and_blank_are_rejected(self):
        db = database()
        for candidate in ("uid_nobody", "", "   "):
            with self.subTest(candidate=candidate):
                self.assertFalse(service.canonical_user_exists(db, candidate))


class CreationTests(unittest.TestCase):
    def test_creating_stores_an_active_spg(self):
        db = database()
        spg, created = create(db)
        self.assertTrue(created)
        self.assertIs(spg.status, SPGStatus.ACTIVE)
        self.assertEqual(spg.member_ids, ["uid_one", "uid_two"])
        self.assertEqual(spg.lead_id, "uid_one")
        self.assertEqual(len(db.documents("spgs")), 1)

    def test_the_server_owns_the_creation_metadata(self):
        spg, _ = create(database())
        self.assertEqual(spg.created_by, ADMIN)
        self.assertEqual(spg.created_at, NOW)
        self.assertEqual(spg.updated_at, NOW)
        self.assertIsNone(spg.completed_at)
        self.assertEqual(spg.source_ticket_id, "ticket_001")

    def test_type_track_and_visibility_are_stored(self):
        spg, _ = create(database())
        self.assertIs(spg.type, SPGType.PROJECT)
        self.assertIs(spg.track, SPGTrack.RESEARCH)
        self.assertIs(spg.visibility, SPGVisibility.PRIVATE)

    def test_approving_the_same_ticket_twice_creates_one_spg(self):
        db = database()
        first, created_first = create(db)
        second, created_second = create(db, now=NOW + timedelta(hours=1))
        self.assertTrue(created_first)
        self.assertFalse(created_second)
        self.assertEqual(first.id, second.id)
        self.assertEqual(second.created_at, NOW)  # the original, not the retry
        self.assertEqual(len(db.documents("spgs")), 1)

    def test_a_different_ticket_creates_a_different_spg(self):
        db = database()
        create(db)
        create(db, create=create_payload(source_ticket_id="ticket_002"))
        self.assertEqual(len(db.documents("spgs")), 2)

    def test_an_unknown_member_stops_creation(self):
        db = database()
        with self.assertRaises(service.SPGError) as caught:
            create(db, create=create_payload(member_ids=["uid_one", "uid_ghost"]))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(db.documents("spgs"), {})

    def test_an_email_cannot_be_a_member(self):
        db = database()
        with self.assertRaises(service.SPGError) as caught:
            create(db, create=create_payload(
                member_ids=["uid_one", "one@sst.scaler.com"]
            ))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(db.documents("spgs"), {})

    def test_a_discord_id_cannot_be_a_member(self):
        db = database()
        with self.assertRaises(service.SPGError) as caught:
            create(db, create=create_payload(
                member_ids=["uid_one", "123456789012345678"]
            ))
        self.assertEqual(caught.exception.status_code, 400)

    def test_only_uids_are_persisted(self):
        db = database()
        spg, _ = create(db)
        stored = db.documents("spgs")[spg.id]
        for member in stored["member_ids"]:
            self.assertIn(member, USERS)
            self.assertNotIn("@", member)


class VisibilityTests(unittest.TestCase):
    def test_a_public_spg_is_visible_to_anyone(self):
        spg, _ = create(database(), create=create_payload(visibility="public"))
        self.assertTrue(service.visible_to(spg, "uid_outsider", is_admin=False))

    def test_a_private_spg_is_visible_to_its_members(self):
        spg, _ = create(database())
        self.assertTrue(service.visible_to(spg, "uid_one", is_admin=False))
        self.assertTrue(service.visible_to(spg, "uid_two", is_admin=False))

    def test_a_private_spg_is_hidden_from_a_non_member(self):
        spg, _ = create(database())
        self.assertFalse(service.visible_to(spg, "uid_three", is_admin=False))

    def test_an_admin_sees_a_private_spg(self):
        spg, _ = create(database())
        self.assertTrue(service.visible_to(spg, "uid_admin", is_admin=True))


class MembershipTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.spg, _ = create(self.db)

    def test_adding_a_member(self):
        updated = service.add_member(self.db, spg_id=self.spg.id, user_id="uid_three", now=NOW)
        self.assertIn("uid_three", updated.member_ids)

    def test_adding_an_existing_member_changes_nothing(self):
        updated = service.add_member(self.db, spg_id=self.spg.id, user_id="uid_two", now=NOW)
        self.assertEqual(updated.member_ids, self.spg.member_ids)

    def test_adding_an_unknown_user_is_rejected(self):
        for candidate in ("uid_ghost", "one@sst.scaler.com", "123456789012345678"):
            with self.subTest(candidate=candidate):
                with self.assertRaises(service.SPGError) as caught:
                    service.add_member(self.db, spg_id=self.spg.id, user_id=candidate, now=NOW)
                self.assertEqual(caught.exception.status_code, 400)

    def test_removing_a_member(self):
        updated = service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_two", now=NOW)
        self.assertEqual(updated.member_ids, ["uid_one"])

    def test_removing_a_non_member_changes_nothing(self):
        updated = service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_three", now=NOW)
        self.assertEqual(updated.member_ids, self.spg.member_ids)

    def test_the_lead_cannot_be_removed(self):
        with self.assertRaises(service.SPGError) as caught:
            service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_one", now=NOW)
        self.assertEqual(caught.exception.status_code, 409)

    def test_the_last_member_cannot_be_removed(self):
        service.change_lead(self.db, spg_id=self.spg.id, new_lead_id="uid_two", now=NOW)
        service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_one", now=NOW)
        with self.assertRaises(service.SPGError) as caught:
            service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_two", now=NOW)
        self.assertEqual(caught.exception.status_code, 409)

    def test_membership_is_never_written_to_the_user_document(self):
        before = copy.deepcopy(self.db.documents("users"))
        service.add_member(self.db, spg_id=self.spg.id, user_id="uid_three", now=NOW)
        service.remove_member(self.db, spg_id=self.spg.id, user_id="uid_three", now=NOW)
        self.assertEqual(self.db.documents("users"), before)
        for document in self.db.documents("users").values():
            self.assertNotIn("spg_ids", document)


class LeadTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.spg, _ = create(self.db)

    def test_the_lead_can_be_handed_to_a_member(self):
        updated = service.change_lead(self.db, spg_id=self.spg.id, new_lead_id="uid_two", now=NOW)
        self.assertEqual(updated.lead_id, "uid_two")
        self.assertIn("uid_two", updated.member_ids)

    def test_a_non_member_cannot_become_lead(self):
        with self.assertRaises(service.SPGError) as caught:
            service.change_lead(self.db, spg_id=self.spg.id, new_lead_id="uid_three", now=NOW)
        self.assertEqual(caught.exception.status_code, 400)

    def test_an_unknown_user_cannot_become_lead(self):
        with self.assertRaises(service.SPGError):
            service.change_lead(self.db, spg_id=self.spg.id, new_lead_id="uid_ghost", now=NOW)


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.spg, _ = create(self.db)

    def move(self, target, spg_id=None):
        return service.set_status(self.db, spg_id=spg_id or self.spg.id, target=target, now=NOW)

    def test_active_to_paused_and_back(self):
        self.assertIs(self.move(SPGStatus.PAUSED).status, SPGStatus.PAUSED)
        self.assertIs(self.move(SPGStatus.ACTIVE).status, SPGStatus.ACTIVE)

    def test_pausing_twice_is_stable(self):
        self.move(SPGStatus.PAUSED)
        self.assertIs(self.move(SPGStatus.PAUSED).status, SPGStatus.PAUSED)

    def test_active_and_paused_can_disband(self):
        self.assertIs(self.move(SPGStatus.DISBANDED).status, SPGStatus.DISBANDED)

    def test_a_disbanded_spg_is_terminal(self):
        self.move(SPGStatus.DISBANDED)
        for target in (SPGStatus.ACTIVE, SPGStatus.PAUSED):
            with self.subTest(target=target):
                with self.assertRaises(service.SPGError) as caught:
                    self.move(target)
                self.assertEqual(caught.exception.status_code, 409)

    def test_a_disbanded_spg_is_kept_not_deleted(self):
        self.move(SPGStatus.DISBANDED)
        self.assertIn(self.spg.id, self.db.documents("spgs"))

    def test_nothing_here_can_mark_an_spg_completed(self):
        # Completion belongs to a reviewed completion request, which is not
        # built yet, so no route may finish a group today.
        with self.assertRaises(service.SPGError) as caught:
            self.move(SPGStatus.COMPLETED)
        self.assertEqual(caught.exception.status_code, 409)

    def test_a_terminal_spg_rejects_membership_changes(self):
        self.move(SPGStatus.DISBANDED)
        with self.assertRaises(service.SPGError) as caught:
            service.add_member(self.db, spg_id=self.spg.id, user_id="uid_three", now=NOW)
        self.assertEqual(caught.exception.status_code, 409)


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.spg, _ = create(self.db)

    def test_metadata_is_edited(self):
        updated = service.update_spg(
            self.db,
            spg_id=self.spg.id,
            update=SPGUpdate(name="Renamed", track=SPGTrack.PRODUCT),
            now=NOW,
        )
        self.assertEqual(updated.name, "Renamed")
        self.assertIs(updated.track, SPGTrack.PRODUCT)
        self.assertEqual(updated.member_ids, self.spg.member_ids)

    def test_an_event_cannot_be_made_private(self):
        event, _ = create(
            self.db,
            create=create_payload(
                type="event", visibility="public", source_ticket_id="ticket_event",
                proposition_document_url=None,
            ),
        )
        with self.assertRaises(service.SPGError) as caught:
            service.update_spg(
                self.db, spg_id=event.id,
                update=SPGUpdate(visibility=SPGVisibility.PRIVATE), now=NOW,
            )
        self.assertEqual(caught.exception.status_code, 400)


class ListTests(unittest.TestCase):
    def populate(self) -> FakeFirestore:
        db = database()
        create(db, create=create_payload(source_ticket_id="t1", visibility="public"))
        create(db, create=create_payload(source_ticket_id="t2", track="kaggle"))
        create(db, create=create_payload(
            source_ticket_id="t3", type="learning", proposition_document_url=None,
            member_ids=["uid_three"], lead_id="uid_three",
        ))
        return db

    def test_listing_returns_every_spg(self):
        items, _ = service.list_spgs(self.populate())
        self.assertEqual(len(items), 3)

    def test_filter_by_track(self):
        items, _ = service.list_spgs(self.populate(), track=SPGTrack.KAGGLE)
        self.assertEqual([item.track for item in items], [SPGTrack.KAGGLE])

    def test_filter_by_type(self):
        items, _ = service.list_spgs(self.populate(), type=SPGType.LEARNING)
        self.assertEqual([item.type for item in items], [SPGType.LEARNING])

    def test_filter_by_member(self):
        items, _ = service.list_spgs(self.populate(), member_id="uid_three")
        self.assertEqual(len(items), 1)
        self.assertIn("uid_three", items[0].member_ids)

    def test_pages_are_bounded(self):
        db = self.populate()
        items, cursor = service.list_spgs(db, limit=2)
        self.assertEqual(len(items), 2)
        self.assertIsNotNone(cursor)

    def test_limit_cannot_exceed_the_maximum(self):
        items, _ = service.list_spgs(self.populate(), limit=10_000)
        self.assertLessEqual(len(items), service.MAX_PAGE_SIZE)

    def test_unknown_cursor_is_rejected(self):
        with self.assertRaises(service.SPGError) as caught:
            service.list_spgs(self.populate(), cursor="nonsense")
        self.assertEqual(caught.exception.status_code, 400)


class ContributionSeparationTests(unittest.TestCase):
    """Nothing in the SPG service touches points or contributions."""

    def test_creating_an_spg_writes_no_contribution(self):
        db = database()
        create(db)
        self.assertEqual(db.documents("contributions"), {})

    def test_creating_an_spg_does_not_touch_user_points(self):
        db = database()
        before = copy.deepcopy(db.documents("users"))
        create(db)
        self.assertEqual(db.documents("users"), before)


class CreationRequiresATicketTests(unittest.TestCase):
    """Creation exists only as the tail of an approved registration."""

    def test_a_source_ticket_id_is_required_to_build_the_input(self):
        body = {
            "name": "Alpha", "type": "learning", "track": "general",
            "visibility": "private", "member_ids": ["uid_one"], "lead_id": "uid_one",
        }
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(body)

    def test_the_document_id_is_always_derived_from_the_ticket(self):
        db = database()
        spg, _ = create(db, create=create_payload(source_ticket_id="ticket_abc"))
        self.assertEqual(spg.id, service.spg_id_for_ticket("ticket_abc"))

    def test_the_same_ticket_always_maps_to_the_same_id(self):
        self.assertEqual(
            service.spg_id_for_ticket("ticket_abc"), service.spg_id_for_ticket("ticket_abc")
        )
        self.assertNotEqual(
            service.spg_id_for_ticket("ticket_abc"), service.spg_id_for_ticket("ticket_abd")
        )

    def test_no_http_route_can_create_an_spg(self):
        # The approval endpoint was removed: it accepted any ticket ID without
        # ever reading the tickets collection, which made it a second creation
        # path. Creation is service-only until a real ticket handler calls it.
        from fastapi import FastAPI
        from app.api.v1.endpoints import spg as endpoints

        app = FastAPI()
        app.include_router(endpoints.router, prefix="/api/v1")
        paths = set(app.openapi()["paths"])
        self.assertNotIn("/api/v1/spgs/approvals", paths)
        self.assertNotIn("/api/v1/spgs/propositions", paths)
        # and nothing else POSTs to the collection root either
        self.assertNotIn("post", app.openapi()["paths"].get("/api/v1/spgs", {}))

    def test_the_spg_service_never_reads_the_tickets_collection(self):
        # If creation ever starts checking tickets, it must do so through a
        # real ticket integration rather than a lookup invented here.
        with open(service.__file__, encoding="utf-8") as handle:
            source = handle.read()
        self.assertNotIn('collection("tickets")', source)


if __name__ == "__main__":
    unittest.main()
