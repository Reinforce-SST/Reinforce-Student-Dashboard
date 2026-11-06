"""Unit tests for Event Squad Operations & SPG 2-Way Synchronization.

Covers:
- Squad Roster Lock & Unlock (leader-only, min team size, deadline enforcement, admin override)
- Squad Leaving Guards (blocked while roster locked)
- In-Event Team Pool (solo attendees looking for teams)
- Admin Squad Roster Edit Modal (admin override roster editing)
- Idea Attachment Synchronization across teammates
- SPG-to-Event and Event-to-SPG Bidirectional Membership Synchronization & Max Team Size Enforcement
"""

import unittest
from datetime import datetime, timezone
from fastapi import HTTPException

from app.api.v1.endpoints import events
from app.schemas.events import (
    AdminUpdateTeamRosterRequest,
    AttachRegistrationIdeaRequest,
    CreateOrUpdateTeamRequest,
    EventRegisterRequest,
    TeamMergeByCodeRequest,
)
from app.services import spgs
from tests.helpers.nested_firestore import NestedFirestore


ADMIN = {"uid": "uid-admin", "email": "admin@sst.scaler.com", "admin": True}
USER_LEAD = {"uid": "uid-lead", "email": "lead@sst.scaler.com"}
USER_MEMBER = {"uid": "uid-member", "email": "member@sst.scaler.com"}
USER_EXTRA = {"uid": "uid-extra", "email": "extra@sst.scaler.com"}
USER_SOLO = {"uid": "uid-solo", "email": "solo@sst.scaler.com"}


class EventSquadOperationsTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        events.db = self.db
        spgs.db = self.db
        events.run_event_transaction = lambda work: work(self.db.transaction())

        for u in [ADMIN, USER_LEAD, USER_MEMBER, USER_EXTRA, USER_SOLO]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": f"User {u['uid']}",
                "email": u["email"],
                "batch_year": 2027,
                "is_member": True,
            })

        self.event_id = "hackathon-squad-1"
        self.db.collection("events").document(self.event_id).set({
            "id": self.event_id,
            "slug": self.event_id,
            "title": "Winter Hackathon 2026",
            "description": "Hackathon squad testing",
            "event_type": "Hackathon",
            "track": "misc",
            "format": "offline",
            "venue_info": {},
            "status": "published",
            "schedule": {
                "start_time": "2030-01-01T10:00:00+00:00",
                "registration_deadline": "2029-12-31T18:00:00+00:00",
            },
            "team_settings": {
                "lock_rosters_at": "2029-12-30T12:00:00+00:00",
            },
            "participation": {
                "mode": "team",
                "min_team_size": 2,
                "max_team_size": 3,
                "max_participants": 50,
                "requires_event_spg": True,
            },
            "stats": {"registered_count": 0, "checked_in_count": 0},
        })

    def _register_and_form_squad(self):
        """Helper to register USER_LEAD and USER_MEMBER and merge them into a squad."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_LEAD,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_MEMBER,
        )
        team_doc = events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Hyperion"),
            current_user=USER_LEAD,
        )
        events.merge_team(
            self.event_id,
            payload=TeamMergeByCodeRequest(invite_code=team_doc.invite_code),
            current_user=USER_MEMBER,
        )
        return team_doc

    def test_leader_can_lock_roster_and_mints_spg(self):
        self._register_and_form_squad()

        # Leader locks squad roster
        locked_doc = events.lock_team_roster(self.event_id, current_user=USER_LEAD)
        self.assertTrue(locked_doc.roster_locked)
        self.assertIsNotNone(locked_doc.spg_id)
        self.assertFalse(locked_doc.looking_for_team)

        # Check teammate's registration document also has roster_locked: True and same spg_id
        member_reg = events.get_my_registration(self.event_id, current_user=USER_MEMBER).registration
        self.assertTrue(member_reg.roster_locked)
        self.assertEqual(member_reg.spg_id, locked_doc.spg_id)
        self.assertFalse(member_reg.looking_for_team)

        # Check minted SPG
        spg_doc = self.db.collection("spgs").document(locked_doc.spg_id).get().to_dict()
        self.assertEqual(spg_doc["name"], "Hyperion")
        self.assertEqual(spg_doc["lead_id"], USER_LEAD["uid"])
        self.assertEqual(set(spg_doc["member_ids"]), {USER_LEAD["uid"], USER_MEMBER["uid"]})
        self.assertEqual(spg_doc["status"], "active")

    def test_non_leader_cannot_lock_roster(self):
        self._register_and_form_squad()

        with self.assertRaises(HTTPException) as ctx:
            events.lock_team_roster(self.event_id, current_user=USER_MEMBER)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Only the squad leader or an admin", ctx.exception.detail)

    def test_locking_below_min_team_size_is_rejected(self):
        # Register solo and create team
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_LEAD,
        )
        events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Solo squad"),
            current_user=USER_LEAD,
        )

        # Min team size is 2, currently only 1 member
        with self.assertRaises(HTTPException) as ctx:
            events.lock_team_roster(self.event_id, current_user=USER_LEAD)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("at least 2 are required", ctx.exception.detail)

    def test_leaving_locked_squad_is_blocked_unless_admin(self):
        self._register_and_form_squad()
        events.lock_team_roster(self.event_id, current_user=USER_LEAD)

        # Member attempts to leave locked squad
        with self.assertRaises(HTTPException) as ctx:
            events.leave_team(self.event_id, current_user=USER_MEMBER)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("roster has been confirmed and locked", ctx.exception.detail)

        # Member with admin privileges can leave even if locked
        member_admin = dict(USER_MEMBER, admin=True)
        events.leave_team(self.event_id, current_user=member_admin)

    def test_unlock_team_roster_and_leave(self):
        self._register_and_form_squad()
        events.lock_team_roster(self.event_id, current_user=USER_LEAD)

        # Non-leader cannot unlock
        with self.assertRaises(HTTPException) as ctx:
            events.unlock_team_roster(self.event_id, current_user=USER_MEMBER)
        self.assertEqual(ctx.exception.status_code, 403)

        # Leader unlocks
        unlocked = events.unlock_team_roster(self.event_id, current_user=USER_LEAD)
        self.assertFalse(unlocked.roster_locked)
        self.assertTrue(unlocked.looking_for_team)

        # Member can now leave squad
        left = events.leave_team(self.event_id, current_user=USER_MEMBER)
        self.assertIsNone(left.team_id)
        self.assertEqual(left.member_uids, [USER_MEMBER["uid"]])

    def test_unlock_blocked_after_event_deadline_unless_admin(self):
        self._register_and_form_squad()
        events.lock_team_roster(self.event_id, current_user=USER_LEAD)

        # Set lock_rosters_at to the past
        self.db.collection("events").document(self.event_id).update({
            "team_settings.lock_rosters_at": "2020-01-01T00:00:00+00:00",
        })

        # Leader cannot unlock after deadline
        with self.assertRaises(HTTPException) as ctx:
            events.unlock_team_roster(self.event_id, current_user=USER_LEAD)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("lock deadline has passed", ctx.exception.detail)

        # Leader with admin privileges can unlock even after deadline
        lead_admin = dict(USER_LEAD, admin=True)
        admin_unlocked = events.unlock_team_roster(self.event_id, current_user=lead_admin)
        self.assertFalse(admin_unlocked.roster_locked)

    def test_admin_edit_squad_roster_override(self):
        team_doc = self._register_and_form_squad()
        events.lock_team_roster(self.event_id, current_user=USER_LEAD)

        # Register USER_EXTRA solo
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_EXTRA,
        )

        # Admin overrides squad roster to add USER_EXTRA
        res = events.admin_update_team_roster(
            self.event_id,
            team_id=team_doc.team_id,
            payload=AdminUpdateTeamRosterRequest(
                member_uids=[USER_LEAD["uid"], USER_MEMBER["uid"], USER_EXTRA["uid"]],
                leader_uid=USER_LEAD["uid"],
                team_name="Hyperion Extended",
            ),
            admin=ADMIN,
        )
        self.assertTrue(res["success"])
        self.assertIn("updated with", res["message"])

        # Check registrations updated
        lead_reg = events.get_my_registration(self.event_id, current_user=USER_LEAD).registration
        self.assertEqual(lead_reg.team_name, "Hyperion Extended")
        self.assertEqual(set(lead_reg.member_uids), {USER_LEAD["uid"], USER_MEMBER["uid"], USER_EXTRA["uid"]})

        extra_reg = events.get_my_registration(self.event_id, current_user=USER_EXTRA).registration
        self.assertEqual(extra_reg.team_id, team_doc.team_id)
        self.assertEqual(extra_reg.team_name, "Hyperion Extended")

    def test_team_pool_returns_only_solo_attendees(self):
        # Register Lead and Member in squad
        self._register_and_form_squad()

        # Register Solo user looking for team
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_SOLO,
        )

        pool = events.get_team_pool(self.event_id, current_user=USER_LEAD)
        self.assertEqual(pool.total, 1)
        self.assertEqual(pool.members[0].uid, USER_SOLO["uid"])

    def test_attach_registration_idea_syncs_across_teammates(self):
        self._register_and_form_squad()

        # Seed an approved idea
        self.db.collection("ideas").document("idea-brain").set({
            "id": "idea-brain",
            "title": "Neural Interface for Prosthetics",
            "is_verified": True,
        })

        # Leader attaches idea
        events.attach_registration_idea(
            self.event_id,
            payload=AttachRegistrationIdeaRequest(idea_id="idea-brain"),
            current_user=USER_LEAD,
        )

        # Verify both lead and teammate have idea_id attached
        lead_reg = events.get_my_registration(self.event_id, current_user=USER_LEAD).registration
        self.assertEqual(lead_reg.idea_id, "idea-brain")

        member_reg = events.get_my_registration(self.event_id, current_user=USER_MEMBER).registration
        self.assertEqual(member_reg.idea_id, "idea-brain")

    def test_spg_add_member_syncs_to_event_and_enforces_capacity(self):
        team_doc = self._register_and_form_squad()
        locked = events.lock_team_roster(self.event_id, current_user=USER_LEAD)
        spg_id = locked.spg_id

        # Register USER_EXTRA for event
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(),
            current_user=USER_EXTRA,
        )

        # Add member to SPG -> syncs to event registration
        updated_spg = spgs.add_member(self.db, spg_id=spg_id, user_id=USER_EXTRA["uid"])
        self.assertIn(USER_EXTRA["uid"], updated_spg.member_ids)

        lead_reg = events.get_my_registration(self.event_id, current_user=USER_LEAD).registration
        self.assertIn(USER_EXTRA["uid"], lead_reg.member_uids)

        # Try to add a 4th member: event max_team_size is 3!
        self.db.collection("users").document("uid-user-4").set({
            "id": "uid-user-4", "full_name": "Fourth User", "email": "four@sst.scaler.com", "batch_year": 2027, "is_member": True,
        })
        with self.assertRaises(spgs.SPGError) as ctx:
            spgs.add_member(self.db, spg_id=spg_id, user_id="uid-user-4")
        self.assertIn("maximum team size of 3", str(ctx.exception))

        # Remove member from SPG -> syncs removal to event registration
        after_remove = spgs.remove_member(self.db, spg_id=spg_id, user_id=USER_EXTRA["uid"])
        self.assertNotIn(USER_EXTRA["uid"], after_remove.member_ids)

        lead_after = events.get_my_registration(self.event_id, current_user=USER_LEAD).registration
        self.assertNotIn(USER_EXTRA["uid"], lead_after.member_uids)


if __name__ == "__main__":
    unittest.main()
