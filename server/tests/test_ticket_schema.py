"""Unit tests for Ticket schemas in app/schemas/tickets.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest
from pydantic import ValidationError

from app.schemas.tickets import (
    AdminAssignTicket,
    AdminUpdateTicketPriority,
    AdminUpdateTicketStatus,
    BotSyncMessageRequest,
    DiscordMeta,
    MessageSource,
    SenderRole,
    TicketCategory,
    TicketCloseRequest,
    TicketCreate,
    TicketDetail,
    TicketDocument,
    TicketMessage,
    TicketMessageCreate,
    TicketPriority,
    TicketStatus,
    TicketSummary,
)


def sample_ticket_create(**overrides):
    data = {
        "title": "Bug in model training submission pipeline",
        "category": TicketCategory.REPORT,
        "description": "The checkpoint uploading script fails on chunk size 5MB.",
    }
    data.update(overrides)
    return data


class TicketCreateTests(unittest.TestCase):
    def test_valid_ticket_create(self):
        created = TicketCreate.model_validate(sample_ticket_create())
        self.assertEqual(created.title, "Bug in model training submission pipeline")
        self.assertEqual(created.category, TicketCategory.REPORT)

    def test_priority_cannot_be_set_by_user(self):
        # Regular users cannot set priority at creation
        with self.assertRaises(ValidationError):
            TicketCreate.model_validate({
                **sample_ticket_create(),
                "priority": "critical",
            })


class TicketAdminActionTests(unittest.TestCase):
    def test_admin_priority_update(self):
        req = AdminUpdateTicketPriority.model_validate({"priority": TicketPriority.URGENT})
        self.assertEqual(req.priority, TicketPriority.URGENT)

    def test_admin_status_update(self):
        req = AdminUpdateTicketStatus.model_validate({
            "status": TicketStatus.IN_PROGRESS,
            "close_reason": None,
        })
        self.assertEqual(req.status, TicketStatus.IN_PROGRESS)

    def test_admin_assignment(self):
        assign = AdminAssignTicket.model_validate({"assigned_to_uid": "admin_uid_999"})
        self.assertEqual(assign.assigned_to_uid, "admin_uid_999")


class TicketMessageTests(unittest.TestCase):
    def test_ticket_message_validation(self):
        msg = TicketMessage(
            id="msg_001",
            ticket_id="tkt_001",
            sender_uid="user_001",
            sender_role=SenderRole.USER,
            content="Here are the error logs.",
            source=MessageSource.WEB,
            created_at="2026-09-24T10:00:00Z",
        )
        self.assertEqual(msg.sender_uid, "user_001")
        self.assertEqual(msg.source, MessageSource.WEB)

    def test_bot_sync_message_request(self):
        sync = BotSyncMessageRequest.model_validate({
            "sender_uid": "user_001",
            "content": "Message from Discord channel",
            "discord_message_id": "999888777666555444",
            "source": "discord",
        })
        self.assertEqual(sync.sender_uid, "user_001")
        self.assertEqual(sync.discord_message_id, "999888777666555444")
        self.assertEqual(sync.source, MessageSource.DISCORD)


if __name__ == "__main__":
    unittest.main()
