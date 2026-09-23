import sys
import types
import unittest
from unittest.mock import patch
from pydantic import ValidationError
from fastapi import HTTPException
from app.schemas.student import ProfileUpdateRequest
sys.modules.setdefault('app.firebase', types.SimpleNamespace(db=None))
from app.api.security import get_current_user

class ProfileSecurityTests(unittest.TestCase):
    def test_whitespace_only_name_is_rejected(self):
        with self.assertRaises(ValidationError): ProfileUpdateRequest(full_name='   ')
    def test_excessive_skill_list_is_rejected(self):
        with self.assertRaises(ValidationError): ProfileUpdateRequest(skills=['Python'] * 101)
    def test_unverified_college_email_cannot_access_member_api(self):
        with patch('app.api.security.auth.verify_id_token', return_value={'email': 'member@sst.scaler.com', 'email_verified': False}):
            with self.assertRaises(HTTPException) as error: get_current_user(types.SimpleNamespace(credentials='test-token'))
        self.assertEqual(error.exception.status_code, 403)
