"""Unit tests for Advanced Hackathon & Event Operations (Modules 1-5)."""

import json
import unittest
from datetime import datetime, timezone
from fastapi import HTTPException

from app.api.v1.endpoints import events
from app.schemas.events import (
    CustomFieldSchema,
    EventCreate,
    EventRegisterRequest,
    EventSchedule,
    EventSubmissionRequest,
    EventTrackSchema,
    TeamSettingsSchema,
    TimelineItemSchema,
    UpdateMemberCustomResponsesRequest,
    UpdateRegistrationTrackRequest,
)
from tests.helpers.nested_firestore import NestedFirestore


ADMIN = {"uid": "uid-admin", "email": "admin@sst.scaler.com", "admin": True}
LEAD = {"uid": "uid-lead", "email": "lead@sst.scaler.com"}
MEMBER_2 = {"uid": "uid-mem2", "email": "mem2@sst.scaler.com"}
SOLO_USER = {"uid": "uid-solo", "email": "solo@sst.scaler.com"}


class AdvancedHackathonOpsTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        events.db = self.db
        events.run_event_transaction = lambda work: work(self.db.transaction())

        # Seed Users
        for u in [ADMIN, LEAD, MEMBER_2, SOLO_USER]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": f"User {u['uid']}",
                "email": u["email"],
                "batch_year": 2027,
            })

        # Create Hackathon Event
        self.event_data = {
            "id": "hackathon-1",
            "slug": "hackathon-1",
            "title": "Winter Hackathon 2026",
            "description": "48 hour club hackathon",
            "event_type": "Hackathon",
            "track": "misc",
            "format": "offline",
            "venue_info": {},
            "schedule": {
                "start_time": "2030-01-01T10:00:00+00:00",
                "registration_deadline": "2029-12-31T18:00:00+00:00",
            },
            "eligibility": {},
            "participation": {
                "mode": "team",
                "min_team_size": 2,
                "max_team_size": 4,
            },
            "points_reward": {"attendance_points": 20, "track": "general"},
            "resources": {},
            "stats": {"registered_count": 0, "checked_in_count": 0},
            "status": "published",
            "custom_registration_fields": [
                {
                    "field_id": "mess_vendor",
                    "label": "Mess Vendor",
                    "field_type": "select",
                    "options": ["Vendor A", "Vendor B", "Vendor C"],
                    "required": True,
                    "applies_to": "individual",
                    "sync_to_matrix": True,
                },
                {
                    "field_id": "hardware_req",
                    "label": "Hardware Requirements",
                    "field_type": "text",
                    "required": False,
                    "applies_to": "team",
                    "sync_to_matrix": True,
                },
            ],
            "event_tracks": [
                {
                    "track_id": "fintech",
                    "name": "FinTech Track",
                    "max_teams": 1,
                },
                {
                    "track_id": "ai_agents",
                    "name": "AI Agents Track",
                    "max_teams": 5,
                },
            ],
            "allow_open_track_change": True,
            "team_settings": {
                "allow_team_creation": True,
                "require_join_approval": True,
                "allow_solo_pool": True,
                "lock_rosters_at": "2030-01-01T09:00:00+00:00",
                "auto_convert_to_spg": True,
            },
            "timeline": [
                {
                    "id": "m1",
                    "title": "Opening Ceremony",
                    "start_time": "2030-01-01T10:00:00+00:00",
                    "is_submission_deadline": False,
                },
                {
                    "id": "m2",
                    "title": "Final Project Submission",
                    "start_time": "2030-01-02T18:00:00+00:00",
                    "end_time": "2030-01-02T18:00:00+00:00",
                    "is_submission_deadline": True,
                },
            ],
            "matrix_columns": [
                {
                    "column_id": "col_submission",
                    "title": "Project Submission",
                    "column_type": "object",
                    "object_schema_type": "submission",
                }
            ],
            "matrix_cells": {},
            "matrix_access_uids": [],
            "created_by": "uid-admin",
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        self.db.collection("events").document("hackathon-1").set(self.event_data)

    def test_custom_intake_validation_and_team_registration(self):
        # 1. Missing required individual field for a member should fail (Edge Case 1)
        with self.assertRaises(HTTPException) as ctx:
            events.register_for_event(
                "hackathon-1",
                payload=EventRegisterRequest(
                    team_name="Cyber Knights",
                    member_uids=["uid-lead", "uid-mem2"],
                    custom_responses={"hardware_req": "2x Raspberry Pi"},
                    member_responses={"uid-lead": {"mess_vendor": "Vendor A"}},  # uid-mem2 missing
                    selected_track_id="ai_agents",
                ),
                current_user=LEAD,
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("mess_vendor", ctx.exception.detail.lower())

        # 2. Complete registration succeeds
        reg = events.register_for_event(
            "hackathon-1",
            payload=EventRegisterRequest(
                team_name="Cyber Knights",
                member_uids=["uid-lead", "uid-mem2"],
                custom_responses={"hardware_req": "2x Raspberry Pi"},
                member_responses={
                    "uid-lead": {"mess_vendor": "Vendor A"},
                    "uid-mem2": {"mess_vendor": "Vendor B"},
                },
                selected_track_id="fintech",
            ),
            current_user=LEAD,
        )
        self.assertEqual(reg.team_name, "Cyber Knights")
        self.assertIsNotNone(reg.invite_code)
        self.assertEqual(len(reg.invite_code), 6)
        self.assertEqual(reg.selected_track_id, "fintech")
        self.assertEqual(reg.member_responses["uid-mem2"]["mess_vendor"], "Vendor B")

    def test_track_capacity_cap_in_transaction(self):
        # Fintech track max_teams is 1
        events.register_for_event(
            "hackathon-1",
            payload=EventRegisterRequest(
                team_name="Team One",
                member_uids=["uid-lead", "uid-mem2"],
                member_responses={
                    "uid-lead": {"mess_vendor": "Vendor A"},
                    "uid-mem2": {"mess_vendor": "Vendor B"},
                },
                selected_track_id="fintech",
            ),
            current_user=LEAD,
        )

        # Second team trying to register for Fintech track should fail (Edge Case 2)
        another_lead = {"uid": "uid-another", "email": "another@sst.scaler.com"}
        self.db.collection("users").document("uid-another").set({
            "id": "uid-another",
            "full_name": "Another User",
            "email": "another@sst.scaler.com",
            "batch_year": 2027,
        })
        with self.assertRaises(HTTPException) as ctx:
            events.register_for_event(
                "hackathon-1",
                payload=EventRegisterRequest(
                    team_name="Team Two",
                    member_uids=["uid-another", "uid-solo"],
                    member_responses={
                        "uid-another": {"mess_vendor": "Vendor A"},
                        "uid-solo": {"mess_vendor": "Vendor C"},
                    },
                    selected_track_id="fintech",
                ),
                current_user=another_lead,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("capacity", ctx.exception.detail.lower())

    def test_member_project_submission_and_matrix_sync(self):
        # 1. Register team
        reg = events.register_for_event(
            "hackathon-1",
            payload=EventRegisterRequest(
                team_name="Innovators",
                member_uids=["uid-lead", "uid-mem2"],
                member_responses={
                    "uid-lead": {"mess_vendor": "Vendor A"},
                    "uid-mem2": {"mess_vendor": "Vendor B"},
                },
                selected_track_id="ai_agents",
            ),
            current_user=LEAD,
        )

        # 2. Submit project deliverables (Edge Case 3)
        sub_res = events.submit_event_project(
            "hackathon-1",
            payload=EventSubmissionRequest(
                repo_url="https://github.com/reinforce/project-x",
                slides_url="https://docs.google.com/presentation/d/123",
                demo_url="https://project-x.vercel.app",
                notes="Autonomous agent system",
            ),
            current_user=LEAD,
        )
        self.assertTrue(sub_res["success"])
        self.assertEqual(sub_res["submission"]["repo_url"], "https://github.com/reinforce/project-x")

        # 3. Check matrix reflects submission and custom fields auto-hydration
        mat = events.get_event_matrix("hackathon-1", current_user=ADMIN)
        col_ids = [c.column_id for c in mat.columns]
        self.assertIn("col_event_track", col_ids)
        self.assertIn("col_custom_mess_vendor", col_ids)
        self.assertIn("col_custom_hardware_req", col_ids)

        lead_row = next(r for r in mat.rows if r.user_id == "uid-lead")
        mem2_row = next(r for r in mat.rows if r.user_id == "uid-mem2")

        # Individual mess vendor hydrated correctly per member row
        self.assertEqual(lead_row.cells["col_custom_mess_vendor"], "Vendor A")
        self.assertEqual(mem2_row.cells["col_custom_mess_vendor"], "Vendor B")

        # Track hydrated
        self.assertEqual(lead_row.cells["col_event_track"], "AI Agents Track")

        # Submission synced to matrix cell
        self.assertEqual(lead_row.cells["col_submission"]["repo_url"], "https://github.com/reinforce/project-x")

    def test_comprehensive_export_and_csv_sanitization(self):
        # Register attendee with formula string injection attempts (Edge Case 4)
        events.register_for_event(
            "hackathon-1",
            payload=EventRegisterRequest(
                team_name="=HYPERLINK(\"http://attacker.com\")",
                member_uids=["uid-lead", "uid-mem2"],
                custom_responses={"hardware_req": "@calc.exe"},
                member_responses={
                    "uid-lead": {"mess_vendor": "Vendor A"},
                    "uid-mem2": {"mess_vendor": "Vendor B"},
                },
                selected_track_id="ai_agents",
            ),
            current_user=LEAD,
        )

        # Export CSV
        csv_resp = events.export_comprehensive_event_data(
            "hackathon-1",
            format="csv",
            current_user=ADMIN,
        )
        body = csv_resp.body.decode("utf-8")
        self.assertIn("reg_id,team_name,user_id", body)
        # Verify sanitization: leading =, @ are prepended with single-quote
        self.assertIn("'@calc.exe", body)
        self.assertIn("'=HYPERLINK", body)

        # Export JSON
        json_resp = events.export_comprehensive_event_data(
            "hackathon-1",
            format="json",
            current_user=ADMIN,
        )
        json_data = json.loads(json_resp.body.decode())
        self.assertEqual(json_data["event_id"], "hackathon-1")
        self.assertEqual(len(json_data["rows"]), 2)
        self.assertEqual(json_data["rows"][0]["selected_track"], "AI Agents Track")

    def test_event_draft_mode_admin_only_access_and_workflow_testing(self):
        """Verify Draft Mode: restricted to admins, but allows admins to test registration and matrix workflows."""
        draft_event = dict(self.event_data)
        draft_event["id"] = "draft-hackathon"
        draft_event["slug"] = "draft-hackathon"
        draft_event["title"] = "Internal Draft Hackathon"
        draft_event["status"] = "draft"
        self.db.collection("events").document("draft-hackathon").set(draft_event)

        # 1. Non-admin cannot view details of draft event (404)
        with self.assertRaises(HTTPException) as cm:
            events.get_event_detail("draft-hackathon", current_user=LEAD)
        self.assertEqual(cm.exception.status_code, 404)

        # 2. Admin CAN view details of draft event
        admin_doc = events.get_event_detail("draft-hackathon", current_user=ADMIN)
        self.assertEqual(admin_doc.id, "draft-hackathon")
        self.assertEqual(admin_doc.status, "draft")

        # 3. Non-admin cannot register for draft event
        with self.assertRaises(HTTPException) as cm:
            events.register_for_event(
                "draft-hackathon",
                payload=EventRegisterRequest(
                    team_name="Team Rogue",
                    member_uids=["uid-lead", "uid-mem2"],
                ),
                current_user=LEAD,
            )
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("Registration is not open for this event", cm.exception.detail)

        # 4. Admin CAN test register for draft event
        admin_reg = events.register_for_event(
            "draft-hackathon",
            payload=EventRegisterRequest(
                team_name="Admin Test Squad",
                member_uids=["uid-admin", "uid-solo"],
                custom_responses={"hardware_req": "Test Rig"},
                member_responses={
                    "uid-admin": {"mess_vendor": "Vendor A"},
                    "uid-solo": {"mess_vendor": "Vendor B"},
                },
            ),
            current_user=ADMIN,
        )
        self.assertEqual(admin_reg.status, "registered")
        self.assertEqual(admin_reg.team_name, "Admin Test Squad")

        # 5. Non-admin cannot access matrix of draft event
        with self.assertRaises(HTTPException) as cm:
            events.get_event_matrix("draft-hackathon", current_user=LEAD)
        self.assertEqual(cm.exception.status_code, 403)

        # 6. Admin CAN access matrix of draft event
        matrix = events.get_event_matrix("draft-hackathon", current_user=ADMIN)
        self.assertTrue(matrix.is_admin)
        self.assertEqual(len(matrix.rows), 2)
        self.assertEqual(matrix.rows[0].team_name, "Admin Test Squad")
        self.assertEqual(matrix.rows[1].team_name, "Admin Test Squad")


if __name__ == "__main__":
    unittest.main()
