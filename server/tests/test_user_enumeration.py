"""Regression tests for the anonymous email-enumeration finding on /users.

GET /users/{id_or_email} and GET /users?search= hide the email field in their
response bodies, but both still let an anonymous caller confirm a *guessed*
email exists: the list endpoint matched `search` against the raw email field,
and the single-lookup endpoint fell through to a `.where("email", ...)` query
(and, for a member who has linked Discord, straight through the plain UID doc
lookup via the `users/{email}` alias doc) and returned 200 vs 404. Both paths
are now gated behind authentication.
"""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_optional_current_user
from app.api.v1.endpoints import users
from tests.helpers.nested_firestore import NestedFirestore

MEMBER = {"uid": "uid-caller", "email": "caller@sst.scaler.com"}


class UserEnumerationTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore(
            {
                "users/uid-target": {
                    "email": "target@sst.scaler.com",
                    "full_name": "Target Member",
                    "discord_id": "999888777",
                    "is_member": True,
                },
                # Discord linking writes these two alias docs for any linked
                # member (see AGENTS.md) - both must resist anonymous lookup.
                "users/target@sst.scaler.com": {
                    "firebase_uid": "uid-target",
                    "email": "target@sst.scaler.com",
                },
                "users/999888777": {
                    "firebase_uid": "uid-target",
                    "email": "target@sst.scaler.com",
                },
            }
        )
        self.addCleanup(setattr, users, "db", users.db)
        users.db = self.db
        users.invalidate_users_cache()

        app = FastAPI()
        app.include_router(users.router, prefix="/api/v1")
        app.dependency_overrides[get_optional_current_user] = lambda: None
        self.client = TestClient(app)

    def authenticated(self):
        self.client.app.dependency_overrides[get_optional_current_user] = lambda: MEMBER

    # --- GET /users/{id_or_email} -------------------------------------

    def test_anonymous_uid_lookup_still_works(self):
        response = self.client.get("/api/v1/users/uid-target")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], "uid-target")

    def test_anonymous_email_lookup_is_rejected(self):
        response = self.client.get("/api/v1/users/target@sst.scaler.com")
        self.assertEqual(response.status_code, 404)

    def test_anonymous_discord_id_lookup_is_rejected(self):
        response = self.client.get("/api/v1/users/999888777")
        self.assertEqual(response.status_code, 404)

    def test_authenticated_email_lookup_still_resolves(self):
        self.authenticated()
        response = self.client.get("/api/v1/users/target@sst.scaler.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], "uid-target")

    def test_authenticated_discord_id_lookup_still_resolves(self):
        self.authenticated()
        response = self.client.get("/api/v1/users/999888777")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], "uid-target")

    def test_unknown_email_still_404s_when_authenticated(self):
        self.authenticated()
        response = self.client.get("/api/v1/users/nobody@sst.scaler.com")
        self.assertEqual(response.status_code, 404)

    def test_response_body_never_includes_email(self):
        self.authenticated()
        response = self.client.get("/api/v1/users/uid-target")
        self.assertNotIn("email", response.json())

    # --- GET /users?search= ---------------------------------------------

    def test_anonymous_search_does_not_match_email(self):
        response = self.client.get("/api/v1/users", params={"search": "target@sst.scaler.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"], [])

    def test_authenticated_search_matches_email(self):
        self.authenticated()
        response = self.client.get("/api/v1/users", params={"search": "target@sst.scaler.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["items"]], ["uid-target"])

    def test_anonymous_search_still_matches_name(self):
        response = self.client.get("/api/v1/users", params={"search": "Target Member"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["items"]], ["uid-target"])


if __name__ == "__main__":
    unittest.main()
