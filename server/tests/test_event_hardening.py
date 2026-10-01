"""Regression coverage for event invariants repaired after PR #24 review."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import events
from app.services import contributions as contribution_service
from tests.helpers.fake_firestore import run_transaction as run_contribution_transaction
from tests.helpers.nested_firestore import NestedFirestore, Transaction


ADMIN = {"uid": "uid-admin", "email": "admin@sst.scaler.com", "admin": True}
MEMBER = {"uid": "uid-one", "email": "one@sst.scaler.com"}


def event_doc(**overrides):
    data = {
        "id": "event-one",
        "slug": "event-one",
        "title": "Event One",
        "description": "A test event",
        "event_type": "workshop",
        "track": "misc",
        "format": "online",
        "venue_info": {},
        "schedule": {
            "start_time": "2030-01-01T10:00:00+00:00",
            "registration_deadline": "2029-12-31T18:00:00-05:00",
        },
        "eligibility": {
            "access_scope": "members_only",
            "allowed_years": [1],
            "allowed_tiers": ["beginner"],
            "allowed_tracks": ["research"],
        },
        "participation": {
            "mode": "solo",
            "min_team_size": 1,
            "max_team_size": 1,
            "max_participants": 1,
            "requires_event_spg": False,
        },
        "points_reward": {
            "attendance_points": 5,
            "track": "general",
        },
        "resources": {},
        "stats": {"registered_count": 0, "checked_in_count": 0},
        "status": "published",
        "created_by": "uid-admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    data.update(overrides)
    return data


def user(**overrides):
    data = {
        "is_member": True,
        "batch_year": 1,
        "tier": "beginner",
        "points": {"research": 1},
    }
    data.update(overrides)
    return data


class EventHardeningTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore(
            {
                "events/event-one": event_doc(),
                "users/uid-one": user(id="uid-one"),
                "users/uid-two": user(id="uid-two"),
                "users/uid-admin": user(id="uid-admin"),
            }
        )
        self.real_db = events.db
        events.db = self.db
        self.addCleanup(setattr, events, "db", self.real_db)

        self.real_event_runner = events.run_event_transaction
        events.run_event_transaction = lambda work: work(Transaction())
        self.addCleanup(
            setattr, events, "run_event_transaction", self.real_event_runner
        )

        self.real_contribution_runner = contribution_service.run_in_transaction
        contribution_service.run_in_transaction = run_contribution_transaction
        self.addCleanup(
            setattr,
            contribution_service,
            "run_in_transaction",
            self.real_contribution_runner,
        )

        self.current_user = dict(MEMBER)
        app = FastAPI()
        app.include_router(events.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def sign_in_admin(self):
        self.current_user = dict(ADMIN)

    def test_offset_deadline_is_compared_as_an_instant(self):
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201)

    def test_current_graduation_batch_can_register(self):
        self.db.store["events/event-one"]["eligibility"]["allowed_years"] = [
            2027, 2028, 2029, 2030
        ]
        self.db.store["users/uid-one"]["batch_year"] = 2029
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201)

    def test_legacy_study_year_uses_email_batch_for_new_event(self):
        self.db.store["events/event-one"]["eligibility"]["allowed_years"] = [
            2027, 2028, 2029, 2030
        ]
        self.db.store["users/uid-one"].update({
            "batch_year": 2, "email": "review.25bcs00000@sst.scaler.com"
        })
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201)

    def test_legacy_study_year_without_batch_email_cannot_join_new_event(self):
        self.db.store["events/event-one"]["eligibility"]["allowed_years"] = [2029]
        self.db.store["users/uid-one"]["batch_year"] = 2
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 403)

    def test_outside_graduation_batch_cannot_register(self):
        self.db.store["events/event-one"]["eligibility"]["allowed_years"] = [
            2027, 2028, 2029, 2030
        ]
        self.db.store["users/uid-one"]["batch_year"] = 2031
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 403)

    def test_legacy_all_years_event_accepts_current_graduation_batch(self):
        self.db.store["events/event-one"]["eligibility"]["allowed_years"] = [
            1, 2, 3, 4
        ]
        self.db.store["users/uid-one"]["batch_year"] = 2029
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201)

    def test_every_teammate_must_exist_and_be_eligible(self):
        self.db.store["events/event-one"]["participation"].update(
            {
                "mode": "team",
                "min_team_size": 2,
                "max_team_size": 2,
                "max_participants": 5,
            }
        )
        self.db.store["users/uid-two"]["batch_year"] = 4
        response = self.client.post(
            "/api/v1/events/event-one/register",
            json={"team_name": "Team", "member_uids": ["uid-two"]},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/v1/events/event-one/register",
                json={"team_name": "Team", "member_uids": ["missing"]},
            ).status_code,
            404,
        )

    def test_cancelled_record_does_not_hide_active_registration(self):
        self.db.store.update(
            {
                "events/event-one/registrations/a-cancelled": {
                    "id": "a-cancelled",
                    "event_id": "event-one",
                    "user_id": "uid-one",
                    "member_uids": ["uid-one"],
                    "status": "cancelled",
                    "registered_at": "2026-01-01T00:00:00+00:00",
                },
                "events/event-one/registrations/b-active": {
                    "id": "b-active",
                    "event_id": "event-one",
                    "user_id": "uid-one",
                    "member_uids": ["uid-one"],
                    "status": "registered",
                    "registered_at": "2026-01-02T00:00:00+00:00",
                },
            }
        )
        self.assertEqual(
            self.client.post("/api/v1/events/event-one/register", json={}).status_code,
            409,
        )
        response = self.client.delete("/api/v1/events/event-one/register")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.db.store["events/event-one/registrations/b-active"]["status"],
            "cancelled",
        )

    def test_capacity_is_read_inside_the_registration_transaction(self):
        self.db.store["events/event-one"]["stats"]["registered_count"] = 1
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "waitlisted")
        self.assertEqual(
            self.db.store["events/event-one"]["stats"]["registered_count"], 1
        )

    def test_registration_revalidates_fresh_event_state(self):
        def close_before_transaction(work):
            self.db.store["events/event-one"]["status"] = "completed"
            return work(Transaction())

        events.run_event_transaction = close_before_transaction
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            any(
                path.startswith("events/event-one/registrations/")
                for path in self.db.store
            )
        )

    def test_oversized_waitlist_team_is_not_promoted(self):
        self.db.store["events/event-one"]["participation"].update(
            {
                "mode": "team",
                "min_team_size": 1,
                "max_team_size": 3,
                "max_participants": 2,
            }
        )
        self.db.store["events/event-one"]["stats"]["registered_count"] = 2
        self.db.store["events/event-one/registrations/active"] = {
            "id": "active",
            "event_id": "event-one",
            "user_id": "uid-one",
            "member_uids": ["uid-one"],
            "status": "registered",
            "registered_at": "2026-01-01T00:00:00+00:00",
        }
        self.db.store["events/event-one/registrations/waiting"] = {
            "id": "waiting",
            "event_id": "event-one",
            "user_id": "uid-two",
            "team_name": "Large",
            "member_uids": ["uid-two", "uid-three"],
            "status": "waitlisted",
            "registered_at": "2026-01-02T00:00:00+00:00",
        }
        response = self.client.delete("/api/v1/events/event-one/register")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.db.store["events/event-one/registrations/waiting"]["status"],
            "waitlisted",
        )
        self.assertEqual(
            self.db.store["events/event-one"]["stats"]["registered_count"], 1
        )

    def _participation(self, **values):
        self.db.store["events/event-one"]["participation"].update(values)

    def _event_spgs(self):
        return {path: doc for path, doc in self.db.store.items() if path.startswith("spgs/")}

    def test_team_registration_forms_an_spg_under_that_event(self):
        self._participation(mode="team", min_team_size=2, max_team_size=3, max_participants=10, requires_event_spg=True)
        response = self.client.post(
            "/api/v1/events/event-one/register",
            json={"team_name": "Gradient Descenders", "member_uids": ["uid-two"]},
        )
        self.assertEqual(response.status_code, 201, response.text)
        spg_id = response.json()["spg_id"]
        self.assertIsNotNone(spg_id)
        spg = self.db.store[f"spgs/{spg_id}"]
        self.assertEqual(spg["event_id"], "event-one")
        self.assertTrue(spg["is_event_derived"])
        self.assertEqual(spg["type"], "event")
        self.assertEqual(spg["name"], "Gradient Descenders")
        self.assertEqual(spg["lead_id"], "uid-one")
        self.assertEqual(set(spg["member_ids"]), {"uid-one", "uid-two"})

    def test_an_individual_event_never_forms_an_spg(self):
        """A one-person "team" group is noise, even if the flag was set."""
        self._participation(mode="solo", requires_event_spg=True, max_participants=10)
        response = self.client.post("/api/v1/events/event-one/register", json={})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertIsNone(response.json()["spg_id"])
        self.assertEqual(self._event_spgs(), {})

    def test_an_individual_event_reads_back_as_not_requiring_an_spg(self):
        self._participation(mode="solo", requires_event_spg=True)
        event = self.client.get("/api/v1/events/event-one").json()
        self.assertFalse(event["participation"]["requires_event_spg"])

    def test_a_promoted_solo_registrant_never_gets_an_spg(self):
        self._participation(mode="solo", max_participants=1, requires_event_spg=True)
        self.db.store["events/event-one"]["stats"]["registered_count"] = 1
        self.db.store["events/event-one/registrations/active"] = {
            "id": "active", "event_id": "event-one", "user_id": "uid-one",
            "member_uids": ["uid-one"], "status": "registered",
            "registered_at": "2026-01-01T00:00:00+00:00",
        }
        self.db.store["events/event-one/registrations/waiting"] = {
            "id": "waiting", "event_id": "event-one", "user_id": "uid-two",
            "member_uids": ["uid-two"], "status": "waitlisted",
            "registered_at": "2026-01-02T00:00:00+00:00",
        }
        self.client.delete("/api/v1/events/event-one/register")
        promoted = self.db.store["events/event-one/registrations/waiting"]
        self.assertEqual(promoted["status"], "registered")
        self.assertIsNone(promoted.get("spg_id"))
        self.assertEqual(self._event_spgs(), {})

    def _attended(self):
        self.db.store["events/event-one/registrations/reg-one"] = {
            "id": "reg-one", "event_id": "event-one", "user_id": "uid-two",
            "member_uids": ["uid-two"], "status": "disqualified",
            "attendance_note": "Submitted another team's notebook as their own.",
            "checked_in_by": "uid-admin",
            "registered_at": "2026-01-01T00:00:00+00:00",
        }

    def test_members_never_receive_admin_attendance_notes(self):
        """The member attendee list never shows these; they must not be sent."""
        self._attended()
        response = self.client.get("/api/v1/events/event-one/registrations")
        self.assertEqual(response.status_code, 200, response.text)
        [registration] = response.json()
        self.assertIsNone(registration.get("attendance_note"))
        self.assertIsNone(registration.get("checked_in_by"))

    def test_admins_still_receive_attendance_notes(self):
        self._attended()
        self.sign_in_admin()
        [registration] = self.client.get("/api/v1/events/event-one/registrations").json()
        self.assertEqual(registration["attendance_note"], "Submitted another team's notebook as their own.")
        self.assertEqual(registration["checked_in_by"], "uid-admin")

    def test_promoted_team_gets_required_spg_with_general_track(self):
        self.db.store["events/event-one"]["participation"].update(
            {
                "mode": "team",
                "min_team_size": 1,
                "max_team_size": 2,
                "max_participants": 2,
                "requires_event_spg": True,
            }
        )
        self.db.store["events/event-one"]["stats"]["registered_count"] = 1
        self.db.store["events/event-one/registrations/active"] = {
            "id": "active",
            "event_id": "event-one",
            "user_id": "uid-one",
            "member_uids": ["uid-one"],
            "status": "registered",
            "registered_at": "2026-01-01T00:00:00+00:00",
        }
        self.db.store["events/event-one/registrations/waiting"] = {
            "id": "waiting",
            "event_id": "event-one",
            "user_id": "uid-two",
            "team_name": "Next",
            "member_uids": ["uid-two"],
            "status": "waitlisted",
            "registered_at": "2026-01-02T00:00:00+00:00",
        }
        self.client.delete("/api/v1/events/event-one/register")
        promoted = self.db.store["events/event-one/registrations/waiting"]
        self.assertEqual(promoted["status"], "registered")
        self.assertIsNotNone(promoted["spg_id"])
        self.assertEqual(
            self.db.store[f"spgs/{promoted['spg_id']}"]["track"], "general"
        )

    def test_update_rejects_null_schedule_and_duplicate_slug(self):
        self.sign_in_admin()
        self.db.store["events/other"] = event_doc(id="other", slug="taken")
        self.assertEqual(
            self.client.put(
                "/api/v1/events/event-one", json={"schedule": None}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.put(
                "/api/v1/events/event-one", json={"slug": "taken"}
            ).status_code,
            409,
        )
        self.assertIsInstance(self.db.store["events/event-one"]["schedule"], dict)

    def test_banner_content_round_trips_through_create_list_and_update(self):
        self.sign_in_admin()
        response = self.client.post("/api/v1/events", json={
            "title": "New club announcement",
            "description": "Join the opening session.",
            "event_type": "Featured Banner",
            "schedule": {"start_time": "2030-01-01T10:00:00+00:00"},
            "status": "published",
            "banner_badge_text": "Orientation",
            "banner_cta_text": "See the schedule →",
            "banner_cta_url": "/dashboard/events",
        })
        self.assertEqual(response.status_code, 201, response.text)
        event_id = response.json()["id"]
        self.assertEqual(response.json()["banner_badge_text"], "Orientation")
        self.assertEqual(self.db.store[f"events/{event_id}"]["banner_badge_text"], "Orientation")
        listed = self.client.get("/api/v1/events").json()["events"]
        self.assertEqual(next(item for item in listed if item["id"] == event_id)["banner_cta_url"], "/dashboard/events")
        self.assertIsNone(next(item for item in listed if item["id"] == "event-one")["banner_cta_text"])

        updated = self.client.put(f"/api/v1/events/{event_id}", json={
            "banner_cta_text": "Register now",
            "banner_cta_url": "https://reinforce-sst.com/events",
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["banner_cta_text"], "Register now")
        self.assertEqual(self.db.store[f"events/{event_id}"]["banner_cta_url"], "https://reinforce-sst.com/events")

    def test_banner_destination_rejects_unsafe_links(self):
        self.sign_in_admin()
        for destination in ("javascript:alert(1)", "//other.example/path", "http://other.example", "https://other.example:bad", "/\\other.example", "  "):
            with self.subTest(destination=destination):
                result = self.client.put("/api/v1/events/event-one", json={"banner_cta_url": destination})
                self.assertEqual(result.status_code, 422)
        self.assertNotIn("banner_cta_url", self.db.store["events/event-one"])

    def test_roll_calls_are_cumulative_valid_and_idempotent(self):
        self.sign_in_admin()
        for uid in ("uid-one", "uid-two"):
            self.db.store[f"events/event-one/registrations/{uid}"] = {
                "id": uid,
                "event_id": "event-one",
                "user_id": uid,
                "member_uids": [uid],
                "status": "registered",
                "registered_at": "2026-01-01T00:00:00+00:00",
            }
        first = self.client.post(
            "/api/v1/events/event-one/attendance/roll-call",
            json={"attendee_uids": ["uid-one"]},
        )
        second = self.client.post(
            "/api/v1/events/event-one/attendance/roll-call",
            json={"attendee_uids": ["uid-one", "uid-two"]},
        )
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        self.assertEqual(second.json()["checked_in_count"], 2)
        contributions = [
            data
            for path, data in self.db.store.items()
            if path.startswith("contributions/")
        ]
        self.assertEqual(len(contributions), 2)
        self.assertTrue(
            all(item["category"].value == "achievement" for item in contributions)
        )
        self.assertTrue(all(item["track"].value == "misc" for item in contributions))

    def test_winner_ids_do_not_collide_and_retries_are_idempotent(self):
        self.sign_in_admin()
        payload = {
            "winners": [
                {"user_uid": "uid-one", "rank": 1, "points": 10},
                {"user_uid": "uid-two", "rank": 1, "points": 10},
            ]
        }
        first = self.client.post("/api/v1/events/event-one/award-winners", json=payload)
        second = self.client.post(
            "/api/v1/events/event-one/award-winners", json=payload
        )
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        stored = [path for path in self.db.store if path.startswith("contributions/")]
        self.assertEqual(len(stored), 2)
        self.assertNotEqual(stored[0], stored[1])


if __name__ == "__main__":
    unittest.main()
