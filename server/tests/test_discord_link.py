from datetime import datetime, timedelta, timezone
from hashlib import sha256
import unittest
from fastapi import HTTPException
from pydantic import ValidationError
from app.schemas.student import DiscordVerifyRequest
from app.services.discord_link import consume_link, linked_discord_id, unlink_member
from tests.firestore_fake import DB, Transaction

NOW = datetime(2026, 9, 24, tzinfo=timezone.utc)
TOKEN = 'A' * 43
TOKEN_PATH = 'discord_link_tokens/' + sha256(TOKEN.encode()).hexdigest()
USER = {'email': 'member@sst.scaler.com', 'uid': 'uid-1', 'name': 'Member'}
DID = '123456789012345678'

class LinkTests(unittest.TestCase):
    def setUp(self):
        self.db = DB({TOKEN_PATH: {'discord_id': DID, 'expires_at': NOW + timedelta(minutes=10), 'consumed_by': None}})
    def consume(self, user=USER):
        tx = Transaction()
        result = consume_link(tx, self.db, TOKEN, user, NOW)
        tx.commit()
        return result
    def test_numeric_id_alone_is_rejected(self):
        with self.assertRaises(ValidationError): DiscordVerifyRequest(discord_id=DID)
    def test_token_links_both_docs_and_is_retryable_only_by_same_identity(self):
        self.consume()
        self.assertEqual(self.db.data['users/' + USER['email']]['discord_id'], DID)
        self.assertEqual(self.db.data['users/' + DID]['discord_link_version'], 1)
        self.assertEqual(linked_discord_id(self.db, USER['email']), DID)
        self.consume()
        with self.assertRaises(HTTPException) as error:
            self.consume({'email': 'attacker@sst.scaler.com', 'uid': 'uid-2'})
        self.assertEqual(error.exception.status_code, 409)
    def test_expired_link_writes_nothing(self):
        self.db.data[TOKEN_PATH]['expires_at'] = NOW
        with self.assertRaises(HTTPException): self.consume()
        self.assertEqual(len(self.db.data), 1)
    def test_conflicting_email_cannot_take_existing_discord_link(self):
        self.db.data['users/' + DID] = {'email': 'other@sst.scaler.com', 'discord_id': DID, 'discord_link_version': 1}
        with self.assertRaises(HTTPException): self.consume()
        self.assertIsNone(self.db.data[TOKEN_PATH]['consumed_by'])
    def test_unproven_and_one_sided_links_do_not_authorize_tickets(self):
        self.db.data['users/' + USER['email']] = {'discord_id': DID, 'is_verified': True}
        self.assertIsNone(linked_discord_id(self.db, USER['email']))
        self.db.data['users/' + USER['email']]['discord_link_version'] = 1
        self.assertIsNone(linked_discord_id(self.db, USER['email']))
    def test_profile_fields_survive_linking(self):
        self.db.data['users/' + USER['email']] = {'full_name': 'Edited name', 'skills': ['Python']}
        self.consume()
        self.assertEqual(self.db.data['users/' + USER['email']]['full_name'], 'Edited name')
        self.assertEqual(self.db.data['users/' + USER['email']]['skills'], ['Python'])
    def test_unlink_does_not_delete_someone_elses_alias(self):
        self.db.data['users/' + USER['email']] = {'discord_id': DID}
        self.db.data['users/' + DID] = {'email': 'other@sst.scaler.com'}
        tx = Transaction()
        unlink_member(tx, self.db, USER['email'], NOW)
        tx.commit()
        self.assertEqual(self.db.data['users/' + DID]['email'], 'other@sst.scaler.com')
        self.assertIsNone(self.db.data['users/' + USER['email']]['discord_id'])
    def test_consumed_link_cannot_restore_unlinked_access(self):
        self.consume()
        tx = Transaction()
        unlink_member(tx, self.db, USER['email'], NOW)
        tx.commit()
        with self.assertRaises(HTTPException): self.consume()
