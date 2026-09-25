"""Unit tests for the Event schemas in app/schemas/events.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest
from pydantic import ValidationError

from app.schemas.events import (
    AccessScope,
    EventCreate,
    EventDocument,
    EventEligibility,
    EventFormat,
    EventParticipationConfig,
    EventRegisterRequest,
    EventSchedule,
    EventStatus,
    EventTrack,
    EventType,
    EventUpdate,
    FeedbackDocument,
    FeedbackSubmitRequest,
    ParticipationMode,
    PointsRewardConfig,
    RegistrationDocument,
    RegistrationStatus,
    RollCallRequest,
    VenueInfo,
    WinnerAwardEntry,
    WinnerAwardRequest,
)


def sample_event_create(**overrides):
    data = {
        "title": "RE:Thesis — Research Paper Sprint",
        "description": "Reproduce baseline results from top machine learning papers.",
        "detailed_info": "# RE:Thesis\nDetailed markdown instructions...",
        "event_type": EventType.RE_THESIS,
        "track": EventTrack.RESEARCH,
        "format": EventFormat.HYBRID,
        "venue_info": {"venue_name": "Scaler Auditorium", "room": "Room 402", "meeting_url": "https://meet.google.com/abc-def"},
        "schedule": {
            "start_time": "2026-10-01T10:00:00Z",
            "end_time": "2026-10-15T18:00:00Z",
            "duration_minutes": 20160,
            "registration_deadline": "2026-09-30T23:59:59Z",
        },
        "eligibility": {
            "access_scope": AccessScope.OPEN_TO_ALL,
            "allowed_years": [1, 2, 3, 4],
            "allowed_tiers": ["beginner", "advanced", "all"],
            "allowed_tracks": ["research", "all"],
            "custom_note": "Basic PyTorch knowledge required",
            "is_mandatory": False,
        },
        "participation": {
            "mode": ParticipationMode.TEAM,
            "min_team_size": 2,
            "max_team_size": 4,
            "max_participants": 60,
            "requires_event_spg": True,
        },
        "points_reward": {
            "attendance_points": 25,
            "winner_points": 100,
            "track": "research",
        },
        "status": EventStatus.PUBLISHED,
    }
    data.update(overrides)
    return data


class EventCreateTests(unittest.TestCase):
    def test_valid_event_creation(self):
        created = EventCreate.model_validate(sample_event_create())
        self.assertEqual(created.title, "RE:Thesis — Research Paper Sprint")
        self.assertEqual(created.event_type, EventType.RE_THESIS)
        self.assertEqual(created.participation.mode, ParticipationMode.TEAM)
        self.assertTrue(created.participation.requires_event_spg)

    def test_title_and_description_length_enforced(self):
        for bad_title in ("", "   ", "t" * 201):
            with self.subTest(title=bad_title):
                with self.assertRaises(ValidationError):
                    EventCreate.model_validate(sample_event_create(title=bad_title))

        for bad_desc in ("", "   ", "d" * 2001):
            with self.subTest(desc=bad_desc):
                with self.assertRaises(ValidationError):
                    EventCreate.model_validate(sample_event_create(description=bad_desc))


class EventRegistrationTests(unittest.TestCase):
    def test_solo_registration_payload(self):
        reg = EventRegisterRequest.model_validate({"member_uids": []})
        self.assertEqual(reg.member_uids, [])
        self.assertIsNone(reg.team_name)

    def test_team_registration_payload(self):
        reg = EventRegisterRequest.model_validate({
            "team_name": "Attention Heads",
            "member_uids": ["user_001", "user_002", "user_003"],
        })
        self.assertEqual(reg.team_name, "Attention Heads")
        self.assertEqual(len(reg.member_uids), 3)


class RollCallTests(unittest.TestCase):
    def test_roll_call_request_validation(self):
        rc = RollCallRequest.model_validate({
            "attendee_uids": ["user_001", "user_002"],
            "award_points": True,
        })
        self.assertEqual(len(rc.attendee_uids), 2)
        self.assertTrue(rc.award_points)

    def test_empty_attendees_rejected(self):
        with self.assertRaises(ValidationError):
            RollCallRequest.model_validate({"attendee_uids": []})


class WinnerAwardTests(unittest.TestCase):
    def test_winner_award_request(self):
        req = WinnerAwardRequest.model_validate({
            "winners": [
                {"user_uid": "user_001", "rank": 1, "points": 100, "note": "1st place baseline reproduction"},
                {"user_uid": "user_002", "rank": 2, "points": 50, "note": "2nd place runner up"},
            ]
        })
        self.assertEqual(len(req.winners), 2)
        self.assertEqual(req.winners[0].rank, 1)


class FeedbackTests(unittest.TestCase):
    def test_feedback_submit_valid(self):
        fb = FeedbackSubmitRequest.model_validate({
            "rating_content": 5,
            "rating_organization": 4,
            "rating_overall": 5,
            "takeaways": "Great paper reproduction sprint!",
            "improvements": "More GPU compute credits would be helpful.",
            "is_anonymous": False,
        })
        self.assertEqual(fb.rating_overall, 5)

    def test_invalid_rating_bounds_rejected(self):
        for bad_rating in (0, 6, -1):
            with self.subTest(rating=bad_rating):
                with self.assertRaises(ValidationError):
                    FeedbackSubmitRequest.model_validate({
                        "rating_content": bad_rating,
                        "rating_organization": 5,
                        "rating_overall": 5,
                    })


if __name__ == "__main__":
    unittest.main()
