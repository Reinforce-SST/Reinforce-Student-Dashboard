import sys
import types
import unittest
from unittest.mock import patch

from google.api_core.exceptions import AlreadyExists
from tests.firestore_fake import DB, Ref

sys.modules.setdefault('app.firebase', types.SimpleNamespace(db=None))
from app.api.v1.endpoints import auth


class ProfileCreationTests(unittest.IsolatedAsyncioTestCase):
    async def test_first_profile_request_cannot_overwrite_a_concurrent_link(self):
        user = {'email': 'member@sst.scaler.com', 'uid': 'uid-1', 'name': 'Member'}
        path = 'users/' + user['email']
        linked = {**user, 'full_name': 'Saved name', 'skills': ['Python'],
                  'discord_id': '123456789012345678', 'discord_link_version': 1}
        for handler in (auth.get_me, auth.sync_user):
            with self.subTest(handler=handler.__name__):
                db = DB()
                original_get = Ref.get

                def read_before_link(ref, transaction=None):
                    snapshot = original_get(ref, transaction)
                    if ref.path == path and not snapshot.exists:
                        # Another request completes /verify-discord after this read.
                        db.data[path] = dict(linked)
                    return snapshot

                def create(ref, data):
                    if ref.path in db.data:
                        raise AlreadyExists('Document already exists')
                    ref.set(data)

                with patch.object(auth, 'db', db), patch.object(Ref, 'get', read_before_link), patch.object(Ref, 'create', create, create=True):
                    result = await handler(user)
                self.assertEqual(db.data[path]['discord_id'], linked['discord_id'])
                self.assertEqual(result['user']['discord_link_version'], 1)
                self.assertEqual(result['user']['full_name'], 'Saved name')
