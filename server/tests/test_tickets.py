"""The unified ticket API also reads old YUVI tickets without leaking reports."""

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.v1.endpoints import tickets
from tests.helpers.nested_firestore import NestedFirestore

USER = {"uid": "uid-1", "email": "member@sst.scaler.com"}
DID = "123456789012345678"


class TicketTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({
            "users/uid-1": {"email": USER["email"], "discord_id": DID, "discord_link_version": 1},
        })
        patcher = patch.object(tickets, "db", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    def ticket(self, ticket_id, category="support", owner=DID, updated="2026-09-01T00:00:00+00:00"):
        self.db.store["tickets/" + ticket_id] = {
            "category": category, "title": ticket_id, "status": "open",
            "created_by": {"discord_id": owner, "username": "Member"}, "updated_at": updated,
        }

    def test_newest_visible_tickets_are_selected_after_filtering(self):
        for index in range(105): self.ticket(f"own-{index:03}")
        self.ticket("newest", updated="2026-09-24T00:00:00+00:00")
        result = tickets.list_my_tickets(USER)
        self.assertEqual(len(result.items), 100)
        self.assertEqual(result.items[0].id, "newest")

    def test_thread_shows_latest_messages_in_chronological_order(self):
        self.ticket("own")
        for index in range(305):
            self.db.store[f"tickets/own/messages/{index:03}"] = {
                "content": str(index), "timestamp": f"{index:04}",
            }
        messages = tickets.get_ticket_messages("own", USER)
        self.assertEqual(len(messages), 300)
        self.assertEqual((messages[0].content, messages[-1].content), ("5", "304"))

    def test_foreign_and_confidential_tickets_return_404(self):
        self.ticket("foreign", owner="999999999999999999")
        self.ticket("foreign_confidential", category="report", owner="999999999999999999")
        for ticket_id in ("foreign", "foreign_confidential"):
            with self.subTest(ticket_id=ticket_id), self.assertRaises(HTTPException) as error:
                tickets.get_ticket(ticket_id, USER)
            self.assertEqual(error.exception.status_code, 404)

    def test_own_confidential_ticket_is_accessible_to_creator(self):
        self.ticket("own_report", category="report", owner=DID)
        detail = tickets.get_ticket("own_report", USER)
        self.assertEqual(detail.id, "own_report")
        self.assertEqual(detail.category, "report")
        my_tickets = tickets.list_my_tickets(USER)
        self.assertIn("own_report", [item.id for item in my_tickets.items])

    def test_one_sided_link_cannot_list_or_open_old_ticket(self):
        self.ticket("own")
        self.db.store["users/" + USER["uid"]]["email"] = "other@sst.scaler.com"
        self.assertEqual(tickets.list_my_tickets(USER).items, [])
        with self.assertRaises(HTTPException) as error:
            tickets.get_ticket("own", USER)
        self.assertEqual(error.exception.status_code, 404)

    def test_spg_registration_requires_canonical_uids(self):
        self.db.store["users/uid-1"].update({"id": "uid-1", "is_member": True, "full_name": "Leader"})
        self.db.store["users/uid-2"] = {"id": "uid-2", "full_name": "Member"}
        self.db.store["users/member@sst.scaler.com"] = {
            "firebase_uid": "uid-2", "full_name": "Member", "is_member": True,
        }
        fields = {"leader_uid": "uid-1", "member_uids": ["uid-2"], "duration_days": 60, "frequency_days": 14}
        result = tickets._validate_spg_registration_fields(fields, "uid-1")
        self.assertEqual(result["member_uids"], ["uid-2"])

        for changed in (
            {**fields, "leader_uid": "member@sst.scaler.com"},
            {**fields, "member_uids": ["member@sst.scaler.com"]},
        ):
            with self.subTest(changed=changed), self.assertRaises(HTTPException) as error:
                tickets._validate_spg_registration_fields(changed, "uid-1")
            self.assertEqual(error.exception.status_code, 400)

    def test_spg_registration_rejects_fractional_and_boolean_days(self):
        self.db.store["users/uid-1"].update({"id": "uid-1", "is_member": True})
        fields = {"leader_uid": "uid-1", "member_uids": [], "duration_days": 60, "frequency_days": 14}
        for bad in (1.5, True, "2.5"):
            with self.subTest(value=bad), self.assertRaises(HTTPException) as error:
                tickets._validate_spg_registration_fields({**fields, "duration_days": bad}, "uid-1")
            self.assertEqual(error.exception.status_code, 400)

    def _member_registration(self, **extra):
        self.db.store["users/uid-1"].update({"id": "uid-1", "is_member": True, "full_name": "Leader"})
        return {"leader_uid": "uid-1", "member_uids": [], "duration_days": 60, "frequency_days": 14, **extra}

    def test_spg_registration_names_the_approved_idea_it_starts_from(self):
        self.db.store["ideas/idea_live"] = {"title": "Course-feedback clustering", "is_verified": True}
        result = tickets._validate_spg_registration_fields(self._member_registration(idea_id=" idea_live "), "uid-1")
        self.assertEqual(result["idea_id"], "idea_live")
        # Display key, derived on the server so a member cannot claim another title.
        self.assertEqual(result["Based on Idea"], "Course-feedback clustering")

    def test_spg_registration_accepts_yuvis_legacy_approval_flag(self):
        self.db.store["ideas/idea_bot"] = {"title": "From Discord", "is_approved": True}
        result = tickets._validate_spg_registration_fields(self._member_registration(idea_id="idea_bot"), "uid-1")
        self.assertEqual(result["Based on Idea"], "From Discord")

    def test_spg_registration_rejects_an_unknown_or_unapproved_idea(self):
        self.db.store["ideas/idea_pending"] = {"title": "Pending", "is_verified": False}
        for idea_id in ("idea_missing", "idea_pending", "", 42):
            with self.subTest(idea_id=idea_id), self.assertRaises(HTTPException) as error:
                tickets._validate_spg_registration_fields(self._member_registration(idea_id=idea_id), "uid-1")
            self.assertEqual(error.exception.status_code, 400)

    def test_spg_registration_without_an_idea_has_no_idea_keys(self):
        result = tickets._validate_spg_registration_fields(self._member_registration(), "uid-1")
        self.assertNotIn("idea_id", result)
        self.assertNotIn("Based on Idea", result)

