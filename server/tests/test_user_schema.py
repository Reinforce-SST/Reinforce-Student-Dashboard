"""Unit tests for User models in app/schemas/users.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest

from pydantic import ValidationError

from app.schemas.users import (
    AdminUserUpdateRequest,
    DiscordVerifyRequest,
    LeaderboardEntry,
    LeaderboardResponse,
    MemberTier,
    SocialLinks,
    TrackPoints,
    UserBase,
    UserDocument,
    UserMeResponse,
    UserPublicResponse,
    UserUpdateRequest,
)

PROTECTED_FIELDS = {
    "is_admin": True,
    "is_member": True,
    "tier": "advanced",
    "points": {"total": 500, "kaggle": 200, "product": 100, "research": 200, "misc": 0},
    "id": "user_001",
    "email": "hacker@sst.scaler.com",
    "is_verified": True,
    "verified_at": "2026-01-01T00:00:00Z",
}


def sample_user(**overrides):
    data = {
        "full_name": "Julian Chen",
        "email": "julian.chen@sst.scaler.com",
        "avatar_url": "https://example.com/avatar.png",
        "bio": "Machine learning enthusiast & research track member.",
        "batch_year": 2,
        "skills": ["python", "pytorch"],
        "social_links": {"github": "https://github.com/julian", "kaggle": None},
    }
    data.update(overrides)
    return data


class UserBaseTests(unittest.TestCase):
    def test_valid_user_base(self):
        user = UserBase.model_validate(sample_user())
        self.assertEqual(user.full_name, "Julian Chen")
        self.assertEqual(user.email, "julian.chen@sst.scaler.com")
        self.assertEqual(user.batch_year, 2)
        self.assertEqual(user.skills, ["python", "pytorch"])

    def test_scaler_email_domain_enforced(self):
        valid_emails = [
            "student@sst.scaler.com",
            "instructor@scaler.com",
            "STUDENT@SST.SCALER.COM",
        ]
        for email in valid_emails:
            with self.subTest(email=email):
                user = UserBase.model_validate(sample_user(email=email))
                self.assertTrue(user.email.endswith(("@sst.scaler.com", "@scaler.com")))

        invalid_emails = [
            "user@gmail.com",
            "student@yahoo.com",
            "hacker@scaler.com.evil.com",
            "test@other.edu",
        ]
        for email in invalid_emails:
            with self.subTest(email=email):
                with self.assertRaises(ValidationError):
                    UserBase.model_validate(sample_user(email=email))

    def test_batch_year_bounds(self):
        for year in (1, 2, 3, 4, 5):
            with self.subTest(year=year):
                user = UserBase.model_validate(sample_user(batch_year=year))
                self.assertEqual(user.batch_year, year)

        for bad in (0, 6, -1):
            with self.subTest(year=bad):
                with self.assertRaises(ValidationError):
                    UserBase.model_validate(sample_user(batch_year=bad))


class UserUpdateRequestTests(unittest.TestCase):
    def test_partial_update_keeps_only_sent_fields(self):
        update = UserUpdateRequest.model_validate({"skills": ["rust", "cuda"]})
        self.assertEqual(update.model_dump(exclude_unset=True), {"skills": ["rust", "cuda"]})

    def test_empty_update_is_valid(self):
        self.assertEqual(UserUpdateRequest.model_validate({}).model_dump(exclude_unset=True), {})

    def test_protected_fields_are_rejected(self):
        for field, value in PROTECTED_FIELDS.items():
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    UserUpdateRequest.model_validate({field: value})


class AdminUserUpdateRequestTests(unittest.TestCase):
    def test_admin_update_fields(self):
        update = AdminUserUpdateRequest.model_validate({
            "is_member": True,
            "is_admin": True,
            "tier": MemberTier.ADVANCED,
        })
        self.assertTrue(update.is_member)
        self.assertTrue(update.is_admin)
        self.assertEqual(update.tier, MemberTier.ADVANCED)


class DiscordVerifyRequestTests(unittest.TestCase):
    def test_valid_private_token(self):
        valid = DiscordVerifyRequest.model_validate({"link_token": "A" * 43})
        self.assertEqual(valid.link_token, "A" * 43)

    def test_raw_discord_id_and_invalid_tokens_rejected(self):
        with self.assertRaises(ValidationError):
            DiscordVerifyRequest.model_validate({"discord_id": "1549547403819090011"})
        for bad in ("12345", "not_a_number", "", "A" * 44):
            with self.subTest(bad=bad):
                with self.assertRaises(ValidationError):
                    DiscordVerifyRequest.model_validate({"link_token": bad})


class UserDocumentTests(unittest.TestCase):
    STORED = {
        "id": "user_001",
        "email": "julian.chen@sst.scaler.com",
        "full_name": "Julian Chen",
        "avatar_url": "https://example.com/avatar.png",
        "discord_id": "1549547403819090011",
        "is_admin": False,
        "is_member": True,
        "tier": "beginner",
        "batch_year": 2,
        "is_verified": True,
        "verified_at": "2026-01-02T10:00:00Z",
        "points": {"total": 125, "kaggle": 50, "product": 25, "research": 50, "misc": 0},
        "bio": "Research enthusiast",
        "skills": ["python", "pytorch"],
        "social_links": {"github": "https://github.com/julian", "kaggle": None, "linkedin": None, "discord": None},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T10:00:00Z",
        "last_login": "2026-01-02T10:00:00Z",
    }

    def test_valid_stored_user(self):
        user = UserDocument.model_validate(self.STORED)
        self.assertEqual(user.id, "user_001")
        self.assertEqual(user.points.total, 125)
        self.assertTrue(user.is_member)
        self.assertEqual(user.batch_year, 2)

    def test_user_me_response(self):
        me = UserMeResponse.model_validate(self.STORED)
        self.assertEqual(me.id, "user_001")
        self.assertEqual(me.points.research, 50)
        self.assertTrue(me.is_member)

    def test_user_public_response_hides_private_fields(self):
        public = UserPublicResponse.model_validate(self.STORED)
        dumped = public.model_dump()
        # id is public, email/discord_id/timestamps are private
        self.assertEqual(public.id, "user_001")
        self.assertNotIn("email", dumped)
        self.assertNotIn("discord_id", dumped)
        self.assertNotIn("last_login", dumped)


class LeaderboardResponseTests(unittest.TestCase):
    def test_leaderboard_response(self):
        entry = LeaderboardEntry(
            id="user_001",
            full_name="Julian Chen",
            avatar_url=None,
            is_member=True,
            tier=MemberTier.ADVANCED,
            points=TrackPoints(total=300, research=300),
            rank=1,
        )
        lb = LeaderboardResponse(track="research", total=1, entries=[entry])
        self.assertEqual(lb.total, 1)
        self.assertEqual(lb.entries[0].rank, 1)
        self.assertEqual(lb.entries[0].points.total, 300)


if __name__ == "__main__":
    unittest.main()
