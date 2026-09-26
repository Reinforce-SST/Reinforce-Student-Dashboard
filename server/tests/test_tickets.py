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
        alias = {"firebase_uid": USER["uid"], "email": USER["email"],
                 "discord_id": DID, "discord_link_version": 1}
        self.db = NestedFirestore({
            "users/uid-1": {"email": USER["email"], "discord_id": DID, "discord_link_version": 1},
            "users/" + USER["email"]: alias,
            "users/" + DID: alias,
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
        for index in range(110): self.ticket(f"report-{index:03}", category="report")
        for index in range(105): self.ticket(f"own-{index:03}")
        self.ticket("newest", updated="2026-09-24T00:00:00+00:00")
        result = tickets.list_my_tickets(USER)
        self.assertEqual(len(result.items), 100)
        self.assertEqual(result.items[0].id, "newest")
        self.assertNotIn("report", [item.category for item in result.items])

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
        self.ticket("confidential", category="report")
        for ticket_id in ("foreign", "confidential"):
            with self.subTest(ticket_id=ticket_id), self.assertRaises(HTTPException) as error:
                tickets.get_ticket(ticket_id, USER)
            self.assertEqual(error.exception.status_code, 404)

    def test_one_sided_link_cannot_list_or_open_old_ticket(self):
        self.ticket("own")
        self.db.store["users/" + USER["email"]]["email"] = "other@sst.scaler.com"
        self.assertEqual(tickets.list_my_tickets(USER).items, [])
        with self.assertRaises(HTTPException) as error:
            tickets.get_ticket("own", USER)
        self.assertEqual(error.exception.status_code, 404)
