"""Unit tests for Register-First & Team Merging Architecture."""

import unittest
from fastapi import HTTPException

from app.api.v1.endpoints import events
from app.schemas.events import (
    CreateOrUpdateTeamRequest,
    CustomFieldSchema,
    EventRegisterRequest,
    EventSchedule,
    EventSubmissionRequest,
    EventTrackSchema,
    TeamMergeByCodeRequest,
    TeamInviteMemberRequest,
    TeamSettingsSchema,
)
from tests.helpers.nested_firestore import NestedFirestore


USER_A = {"uid": "uid-user-a", "email": "usera@sst.scaler.com"}
USER_B = {"uid": "uid-user-b", "email": "userb@sst.scaler.com"}
USER_C = {"uid": "uid-user-c", "email": "userc@sst.scaler.com"}
USER_D = {"uid": "uid-user-d", "email": "userd@sst.scaler.com"}


class TeamMergingArchitectureTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        events.db = self.db
        events.run_event_transaction = lambda work: work(self.db.transaction())

        for u in [USER_A, USER_B, USER_C, USER_D]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": f"Student {u['uid']}",
                "email": u["email"],
                "batch_year": 2027,
            })

        self.event_id = "hackathon-pool-1"
        self.db.collection("events").document(self.event_id).set({
            "id": self.event_id,
            "slug": self.event_id,
            "title": "Summer AI Challenge",
            "description": "48 hour club challenge",
            "event_type": "Hackathon",
            "track": "misc",
            "format": "offline",
            "venue_info": {},
            "status": "published",
            "access_scope": "open_to_all",
            "eligibility": {},
            "participation": {
                "mode": "team",
                "min_team_size": 2,
                "max_team_size": 2,
                "max_participants": 100,
                "requires_event_spg": False,
            },
            "schedule": {
                "start_time": "2030-11-20T10:00:00+00:00",
                "end_time": "2030-11-22T18:00:00+00:00",
                "registration_deadline": "2030-11-19T23:59:59+00:00",
            },
            "event_tracks": [
                {"track_id": "ai_agents", "name": "AI Agents"},
                {"track_id": "fintech", "name": "Fintech"},
            ],
            "custom_registration_fields": [
                {
                    "field_id": "mess_vendor",
                    "label": "Mess Vendor",
                    "field_type": "text",
                    "required": True,
                    "applies_to": "individual",
                },
                {
                    "field_id": "hardware_req",
                    "label": "Hardware Requirements",
                    "field_type": "text",
                    "required": False,
                    "applies_to": "team",
                },
            ],
            "stats": {"registered_count": 0},
        })

    def test_step1_individual_rsvp_registers_into_pool_without_team(self):
        """User A registers individually with individual custom fields and no team name."""
        reg = events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(
                custom_responses={"mess_vendor": "Vendor North"},
            ),
            current_user=USER_A,
        )
        self.assertEqual(reg.id, USER_A["uid"])
        self.assertEqual(reg.uid, USER_A["uid"])
        self.assertEqual(reg.status, "registered")
        self.assertIsNone(reg.team_id)
        self.assertIsNone(reg.team_name)
        self.assertFalse(reg.is_team_leader)
        self.assertTrue(reg.looking_for_team)
        self.assertEqual(reg.custom_responses["mess_vendor"], "Vendor North")

    def test_step2_team_pool_queries_only_registered_candidates(self):
        """Team pool returns registered User B and excludes unregistered User C and caller User A."""
        # User A and User B register
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor South"}),
            current_user=USER_B,
        )

        pool = events.get_team_pool(self.event_id, current_user=USER_A)
        # Should contain User B, should NOT contain User A (caller), and should NOT contain User C (unregistered)
        pool_uids = [m.uid for m in pool.members]
        self.assertIn(USER_B["uid"], pool_uids)
        self.assertNotIn(USER_A["uid"], pool_uids)
        self.assertNotIn(USER_C["uid"], pool_uids)

    def test_step3_create_squad_and_invite_code(self):
        """User A creates a squad, receiving team_id, 6-char invite_code, and leadership."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )

        team_res = events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(
                team_name="Cyber Wolves",
                selected_track_id="ai_agents",
                team_custom_responses={"hardware_req": "1x Jetson Nano"},
                looking_for_team=True,
            ),
            current_user=USER_A,
        )
        self.assertEqual(team_res.team_name, "Cyber Wolves")
        self.assertIsNotNone(team_res.team_id)
        self.assertEqual(len(team_res.invite_code), 6)
        self.assertTrue(team_res.is_team_leader)
        self.assertEqual(team_res.selected_track_id, "ai_agents")
        self.assertEqual(team_res.team_custom_responses["hardware_req"], "1x Jetson Nano")

    def test_step4_invite_routing_and_decline(self):
        """User A invites User B, and User B declines the invite."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor South"}),
            current_user=USER_B,
        )
        events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Alpha Squad"),
            current_user=USER_A,
        )

        # Invite User B
        inv_res = events.invite_team_member(
            self.event_id,
            payload=TeamInviteMemberRequest(target_uid=USER_B["uid"]),
            current_user=USER_A,
        )
        invite_id = inv_res["invite_id"]
        self.assertIsNotNone(invite_id)

        # User B inspects their registration and sees the invite
        reg_b = events.get_my_registration(self.event_id, current_user=USER_B).registration
        self.assertEqual(len(reg_b.pending_invites), 1)
        self.assertEqual(reg_b.pending_invites[0].invite_id, invite_id)

        # User B declines the invite
        events.decline_team_invite(self.event_id, invite_id=invite_id, current_user=USER_B)
        reg_b_after = events.get_my_registration(self.event_id, current_user=USER_B).registration
        self.assertEqual(len(reg_b_after.pending_invites), 0)

    def test_step5_atomic_merging_by_code_and_refinements(self):
        """User B joins User A's team via invite code, enforcing single leader and max_team_size invariants."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor South"}),
            current_user=USER_B,
        )
        team_a = events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Alpha Squad", selected_track_id="ai_agents"),
            current_user=USER_A,
        )

        # User B merges using User A's invite code
        merged_b = events.merge_team(
            self.event_id,
            payload=TeamMergeByCodeRequest(invite_code=team_a.invite_code),
            current_user=USER_B,
        )

        self.assertEqual(merged_b.team_id, team_a.team_id)
        self.assertEqual(merged_b.team_name, "Alpha Squad")
        self.assertEqual(merged_b.selected_track_id, "ai_agents")
        # Refinement 1: User A remains leader, User B is NOT leader
        self.assertFalse(merged_b.is_team_leader)

        reg_a = events.get_my_registration(self.event_id, current_user=USER_A).registration
        self.assertTrue(reg_a.is_team_leader)
        self.assertEqual(set(reg_a.member_uids), {USER_A["uid"], USER_B["uid"]})
        # Refinement 1: Max team size (2) is reached, so looking_for_team is automatically False
        self.assertFalse(reg_a.looking_for_team)
        self.assertFalse(merged_b.looking_for_team)

    def test_step6_leave_team_resets_solo_registered_state(self):
        """User B leaves squad; User B resets to solo registered, and User A's squad updates."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor South"}),
            current_user=USER_B,
        )
        team_a = events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Alpha Squad"),
            current_user=USER_A,
        )
        events.merge_team(
            self.event_id,
            payload=TeamMergeByCodeRequest(invite_code=team_a.invite_code),
            current_user=USER_B,
        )

        # User B leaves
        left_b = events.leave_team(self.event_id, current_user=USER_B)
        self.assertIsNone(left_b.team_id)
        self.assertIsNone(left_b.team_name)
        self.assertTrue(left_b.looking_for_team)
        self.assertEqual(left_b.member_uids, [USER_B["uid"]])

        # User A's team size should now be 1 and looking_for_team should be True again
        reg_a = events.get_my_registration(self.event_id, current_user=USER_A).registration
        self.assertEqual(reg_a.member_uids, [USER_A["uid"]])
        self.assertTrue(reg_a.looking_for_team)

    def test_step7_submission_sync_across_teammates(self):
        """When User B submits project deliverables, User A's registration document reflects it."""
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor North"}),
            current_user=USER_A,
        )
        events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(custom_responses={"mess_vendor": "Vendor South"}),
            current_user=USER_B,
        )
        team_a = events.create_or_update_team(
            self.event_id,
            payload=CreateOrUpdateTeamRequest(team_name="Alpha Squad"),
            current_user=USER_A,
        )
        events.merge_team(
            self.event_id,
            payload=TeamMergeByCodeRequest(invite_code=team_a.invite_code),
            current_user=USER_B,
        )

        # User B submits
        events.submit_event_project(
            self.event_id,
            payload=EventSubmissionRequest(
                repo_url="https://github.com/reinforce/alpha-project",
                demo_url="https://alpha-demo.sst.scaler.com",
            ),
            current_user=USER_B,
        )

        # Check User A's registration has the submission
        reg_a = events.get_my_registration(self.event_id, current_user=USER_A).registration
        self.assertIsNotNone(reg_a.submission)
        self.assertEqual(reg_a.submission["repo_url"], "https://github.com/reinforce/alpha-project")
