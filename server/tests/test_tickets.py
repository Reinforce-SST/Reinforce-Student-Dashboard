import sys
import types
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from tests.firestore_fake import DB

# Only the external database boundary is replaced; routes and serializers run.
sys.modules.setdefault('app.firebase', types.SimpleNamespace(db=None))
from app.api.v1.endpoints import tickets

EMAIL = 'member@sst.scaler.com'
DID = '123456789012345678'

class TicketTests(unittest.TestCase):
    def setUp(self):
        member = {'email': EMAIL, 'discord_id': DID, 'discord_link_version': 1}
        self.db = DB({'users/' + EMAIL: member, 'users/' + DID: dict(member)})
        self.patcher = patch.object(tickets, 'db', self.db)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
    def ticket(self, id, category='support', owner=DID, updated='2026-09-01T00:00:00+00:00'):
        self.db.data['tickets/' + id] = {'category': category, 'title': id, 'status': 'open', 'created_by': {'discord_id': owner, 'username': 'Member'}, 'updated_at': updated}
    def test_newest_visible_tickets_are_selected_after_filtering(self):
        for i in range(110): self.ticket(f'a{i:03}', category='report')
        for i in range(105): self.ticket(f'b{i:03}')
        self.ticket('z-newest', updated='2026-09-24T00:00:00+00:00')
        result = tickets.list_my_tickets({'email': EMAIL})
        self.assertEqual(len(result.tickets), 100)
        self.assertEqual(result.tickets[0].id, 'z-newest')
        self.assertNotIn('report', [t.category for t in result.tickets])
    def test_thread_shows_latest_messages_in_chronological_order(self):
        self.ticket('own')
        for i in range(305):
            self.db.data[f'tickets/own/messages/{i:03}'] = {'content': str(i), 'timestamp': f'{i:04}'}
        result = tickets.get_ticket('own', {'email': EMAIL})
        self.assertEqual(len(result.messages), 300)
        self.assertEqual(result.messages[0].content, '5')
        self.assertEqual(result.messages[-1].content, '304')
    def test_foreign_and_confidential_tickets_return_404(self):
        self.ticket('foreign', owner='999999999999999999')
        self.ticket('confidential', category='report')
        for id in ('foreign', 'confidential'):
            with self.assertRaises(HTTPException) as error: tickets.get_ticket(id, {'email': EMAIL})
            self.assertEqual(error.exception.status_code, 404)
    def test_legacy_link_does_not_return_tickets(self):
        self.db.data['users/' + EMAIL].pop('discord_link_version')
        self.ticket('own')
        result = tickets.list_my_tickets({'email': EMAIL})
        self.assertFalse(result.linked)
        self.assertEqual(result.tickets, [])

    def test_inconsistent_primary_email_cannot_list_or_open_tickets(self):
        self.ticket('own')
        for email in (None, 'different@sst.scaler.com'):
            with self.subTest(email=email):
                self.db.data['users/' + EMAIL]['email'] = email
                self.assertFalse(tickets.list_my_tickets({'email': EMAIL}).linked)
                with self.assertRaises(HTTPException) as error:
                    tickets.get_ticket('own', {'email': EMAIL})
                self.assertEqual(error.exception.status_code, 404)
