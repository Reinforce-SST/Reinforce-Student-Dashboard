"""Unit tests for Event Matrix endpoints and validation."""

import unittest
from fastapi import HTTPException

from app.api.v1.endpoints import events
from app.schemas.events import (
    AssignAllColumnRequest,
    BatchUpdateMatrixRequest,
    CreateMatrixColumnRequest,
    MatrixAccessUpdateRequest,
    MatrixAttendanceUpdateRequest,
    MatrixCellUpdateItem,
    MatrixColumnType,
    MatrixSchemaType,
    MatrixSettingsUpdateRequest,
    RegistrationStatus,
    UpdateMatrixCellRequest,
)
from tests.helpers.nested_firestore import NestedFirestore


ADMIN = {"uid": "uid-admin", "email": "admin@sst.scaler.com", "admin": True}
VOLUNTEER = {"uid": "uid-volunteer", "email": "volunteer@sst.scaler.com"}
MEMBER = {"uid": "uid-member", "email": "member@sst.scaler.com"}


def sample_event(**overrides):
    data = {
        "id": "event-matrix-1",
        "slug": "event-matrix-1",
        "title": "Matrix Sprint Event",
        "description": "An event with dynamic matrix",
        "event_type": "Workshop",
        "track": "misc",
        "format": "online",
        "venue_info": {},
        "schedule": {
            "start_time": "2030-01-01T10:00:00+00:00",
            "registration_deadline": "2029-12-31T18:00:00+00:00",
        },
        "eligibility": {},
        "participation": {"mode": "solo"},
        "points_reward": {"attendance_points": 5, "track": "general"},
        "resources": {},
        "stats": {"registered_count": 1, "checked_in_count": 0},
        "status": "published",
        "matrix_columns": [],
        "matrix_cells": {},
        "matrix_access_uids": ["uid-volunteer"],
        "created_by": "uid-admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    data.update(overrides)
    return data


def sample_user(uid: str, name: str, email: str):
    return {
        "id": uid,
        "full_name": name,
        "email": email,
        "avatar_url": None,
        "batch_year": 2028,
        "is_member": True,
    }


def sample_registration(reg_id: str, event_id: str, user_id: str):
    return {
        "id": reg_id,
        "event_id": event_id,
        "user_id": user_id,
        "member_uids": [user_id],
        "status": "registered",
        "registered_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


class EventMatrixTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore(
            {
                "events/event-matrix-1": sample_event(),
                "events/event-matrix-1/registrations/reg-1": sample_registration(
                    "reg-1", "event-matrix-1", "uid-member"
                ),
                "users/uid-admin": sample_user("uid-admin", "Admin User", "admin@sst.scaler.com"),
                "users/uid-volunteer": sample_user("uid-volunteer", "Volunteer User", "volunteer@sst.scaler.com"),
                "users/uid-member": sample_user("uid-member", "Regular Member", "member@sst.scaler.com"),
            }
        )
        self.real_db = events.db
        events.db = self.db
        self.addCleanup(setattr, events, "db", self.real_db)

    def test_permission_guard(self):
        # Admin can access
        res = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        self.assertTrue(res.is_admin)
        self.assertEqual(len(res.rows), 1)
        self.assertEqual(res.rows[0].user_id, "uid-member")
        self.assertEqual(res.rows[0].user_name, "Regular Member")

        # Volunteer in matrix_access_uids can access
        vol_res = events.get_event_matrix("event-matrix-1", current_user=VOLUNTEER)
        self.assertFalse(vol_res.is_admin)
        self.assertTrue(vol_res.has_edit_access)

        # Unauthorized member gets 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            events.get_event_matrix("event-matrix-1", current_user=MEMBER)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_column_crud_and_cell_updates(self):
        # 1. Add text column
        text_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Table Notes", column_type=MatrixColumnType.TEXT),
            current_user=ADMIN,
        )
        text_col_id = text_col.column_id

        # 2. Add object column (feedback)
        obj_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(
                title="Evaluator Feedback",
                column_type=MatrixColumnType.OBJECT,
                object_schema_type=MatrixSchemaType.FEEDBACK,
            ),
            current_user=ADMIN,
        )
        obj_col_id = obj_col.column_id

        # 3. Update text cell
        cell_res = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(
                user_id="uid-member",
                column_id=text_col_id,
                value="Excellent participation",
            ),
            current_user=VOLUNTEER,  # Volunteer can edit cells
        )
        self.assertEqual(cell_res["value"], "Excellent participation")

        # 4. Update object cell with valid FeedbackObject
        obj_cell_res = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(
                user_id="uid-member",
                column_id=obj_col_id,
                value={"schema_type": "feedback", "rating": 5, "notes": "Solid prototype delivered"},
            ),
            current_user=VOLUNTEER,
        )
        self.assertEqual(obj_cell_res["value"]["rating"], 5)

        # 5. Object cell validation error (invalid rating > 5 raises 422)
        with self.assertRaises(HTTPException) as ctx:
            events.update_matrix_cell(
                "event-matrix-1",
                payload=UpdateMatrixCellRequest(
                    user_id="uid-member",
                    column_id=obj_col_id,
                    value={"schema_type": "feedback", "rating": 10},
                ),
                current_user=VOLUNTEER,
            )
        self.assertEqual(ctx.exception.status_code, 422)

        # 6. Nullable cell reset (clearing cell)
        clear_res = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(
                user_id="uid-member",
                column_id=text_col_id,
                value=None,
            ),
            current_user=ADMIN,
        )
        self.assertIsNone(clear_res["value"])

        # 7. Check matrix hydration reflects cells (2 custom columns + 1 default attendance points column = 3)
        matrix_data = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        self.assertEqual(len(matrix_data.columns), 3)
        row = matrix_data.rows[0]
        self.assertIsNone(row.cells[text_col_id])
        self.assertEqual(row.cells[obj_col_id]["rating"], 5)

        # 8. Delete column
        del_res = events.delete_matrix_column("event-matrix-1", column_id=text_col_id, current_user=ADMIN)
        self.assertTrue(del_res["success"])

        # Check column is removed (1 custom + 1 default attendance column = 2)
        matrix_after_del = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        self.assertEqual(len(matrix_after_del.columns), 2)

    def test_attendance_mutation(self):
        att_res = events.update_matrix_attendance(
            "event-matrix-1",
            payload=MatrixAttendanceUpdateRequest(
                user_id="uid-member",
                status=RegistrationStatus.CHECKED_IN,
                attendance_note="Checked in by volunteer",
            ),
            current_user=VOLUNTEER,
        )
        self.assertEqual(att_res["status"], "checked_in")
        reg_data = self.db.store["events/event-matrix-1/registrations/reg-1"]
        self.assertEqual(reg_data["status"], "checked_in")
        self.assertEqual(reg_data["attendance_note"], "Checked in by volunteer")

    def test_event_detail_can_access_matrix_flag(self):
        # Admin gets can_access_matrix: True and unmasked uids
        admin_doc = events.get_event_detail("event-matrix-1", current_user=ADMIN)
        self.assertTrue(admin_doc.can_access_matrix)
        self.assertEqual(admin_doc.matrix_access_uids, ["uid-volunteer"])

        # Volunteer gets can_access_matrix: True, but matrix_access_uids is masked
        vol_doc = events.get_event_detail("event-matrix-1", current_user=VOLUNTEER)
        self.assertTrue(vol_doc.can_access_matrix)
        self.assertEqual(vol_doc.matrix_access_uids, [])

        # Regular member gets can_access_matrix: False and masked uids
        mem_doc = events.get_event_detail("event-matrix-1", current_user=MEMBER)
        self.assertFalse(mem_doc.can_access_matrix)
        self.assertEqual(mem_doc.matrix_access_uids, [])

    def test_access_update(self):
        # Admin grants access to another volunteer
        acc_res = events.update_matrix_access(
            "event-matrix-1",
            payload=MatrixAccessUpdateRequest(volunteer_uids=["uid-volunteer", "uid-volunteer-2"]),
            current_user=ADMIN,
        )
        self.assertEqual(acc_res["volunteer_uids"], ["uid-volunteer", "uid-volunteer-2"])
        ev_data = self.db.store["events/event-matrix-1"]
        self.assertEqual(ev_data["matrix_access_uids"], ["uid-volunteer", "uid-volunteer-2"])

    def test_number_column_and_contribution_assignment(self):
        # 1. Create a Number column
        num_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Score", column_type=MatrixColumnType.NUMBER),
            current_user=ADMIN,
        )
        self.assertEqual(num_col.column_type, MatrixColumnType.NUMBER)

        # 2. Update cell with valid number
        res = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(user_id="uid-member", column_id=num_col.column_id, value=95),
            current_user=ADMIN,
        )
        self.assertEqual(res["value"], 95)

        # 3. Update cell with numeric string (e.g. "42.5") -> parses float
        res_float = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(user_id="uid-member", column_id=num_col.column_id, value="42.5"),
            current_user=ADMIN,
        )
        self.assertEqual(res_float["value"], 42.5)

        # 4. Reject invalid number string
        with self.assertRaises(HTTPException) as ctx:
            events.update_matrix_cell(
                "event-matrix-1",
                payload=UpdateMatrixCellRequest(user_id="uid-member", column_id=num_col.column_id, value="not-a-number"),
                current_user=ADMIN,
            )
        self.assertEqual(ctx.exception.status_code, 422)

        # 5. Create Contribution Assignment column
        contrib_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(
                title="Bounty Points",
                column_type=MatrixColumnType.OBJECT,
                object_schema_type=MatrixSchemaType.CONTRIBUTION_ASSIGNMENT,
            ),
            current_user=ADMIN,
        )
        self.assertEqual(contrib_col.object_schema_type, MatrixSchemaType.CONTRIBUTION_ASSIGNMENT)

        # 6. Set valid ContributionAssignmentObject
        contrib_res = events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(
                user_id="uid-member",
                column_id=contrib_col.column_id,
                value={
                    "schema_type": "contribution_assignment",
                    "category": "project_work",
                    "track": "research",
                    "points": 50,
                    "title": "Top Matrix Submission",
                },
            ),
            current_user=ADMIN,
        )
        self.assertEqual(contrib_res["value"]["points"], 50)
        self.assertEqual(contrib_res["value"]["category"], "project_work")

    def test_camel_case_column_id_support(self):
        # Create text column
        txt_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Notes", column_type=MatrixColumnType.TEXT),
            current_user=ADMIN,
        )
        # Update using columnId camelCase
        req = UpdateMatrixCellRequest.model_validate(
            {"user_id": "uid-member", "columnId": txt_col.column_id, "value": "Saved with camelCase"}
        )
        res = events.update_matrix_cell("event-matrix-1", payload=req, current_user=ADMIN)
        self.assertEqual(res["value"], "Saved with camelCase")

    def test_batch_update_matrix(self):
        # Create 2 columns
        col1 = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Col 1", column_type=MatrixColumnType.TEXT),
            current_user=ADMIN,
        )
        col2 = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Col 2", column_type=MatrixColumnType.NUMBER),
            current_user=ADMIN,
        )

        batch_req = BatchUpdateMatrixRequest(
            cells=[
                MatrixCellUpdateItem(user_id="uid-member", column_id=col1.column_id, value="Batch Text"),
                MatrixCellUpdateItem(user_id="uid-member", column_id=col2.column_id, value=88),
            ],
            attendance=[
                MatrixAttendanceUpdateRequest(
                    user_id="uid-member",
                    status=RegistrationStatus.CHECKED_IN,
                    attendance_note="Checked in via Batch",
                )
            ],
        )

        batch_res = events.batch_update_matrix("event-matrix-1", payload=batch_req, current_user=ADMIN)
        self.assertTrue(batch_res["success"])
        self.assertEqual(batch_res["updated_cells"], 2)
        self.assertEqual(batch_res["updated_attendance"], 1)

        # Hydrate matrix and assert
        mat = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        row = mat.rows[0]
        self.assertEqual(row.cells[col1.column_id], "Batch Text")
        self.assertEqual(row.cells[col2.column_id], 88)
        self.assertEqual(row.attendance, "checked_in")

    def test_assign_all_column(self):
        # Create a text column
        txt_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(title="Room", column_type=MatrixColumnType.TEXT),
            current_user=ADMIN,
        )

        assign_res = events.assign_all_matrix_column(
            "event-matrix-1",
            column_id=txt_col.column_id,
            payload=AssignAllColumnRequest(value="Auditorium B"),
            current_user=ADMIN,
        )
        self.assertTrue(assign_res["success"])
        self.assertEqual(assign_res["updated_count"], 1)

        mat = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        self.assertEqual(mat.rows[0].cells[txt_col.column_id], "Auditorium B")

    def test_matrix_settings_public_and_pin(self):
        # 1. Update settings: make matrix public and pinned
        res = events.update_matrix_settings(
            "event-matrix-1",
            payload=MatrixSettingsUpdateRequest(matrix_is_public=True, matrix_is_pinned=True),
            current_user=ADMIN,
        )
        self.assertTrue(res["matrix_is_public"])
        self.assertTrue(res["matrix_is_pinned"])

        # 2. Regular member can now read matrix because matrix_is_public=True
        mem_mat = events.get_event_matrix("event-matrix-1", current_user=MEMBER)
        self.assertFalse(mem_mat.has_edit_access)
        self.assertTrue(mem_mat.matrix_is_public)
        self.assertTrue(mem_mat.matrix_is_pinned)

        # 3. Regular member can see can_access_matrix=True on event detail
        ev_detail = events.get_event_detail("event-matrix-1", current_user=MEMBER)
        self.assertTrue(ev_detail.can_access_matrix)

    def test_spg_and_idea_jar_matrix_columns(self):
        # 1. Seed SPG and Idea Jar documents
        self.db.collection("spgs").document("spg-1").set({
            "id": "spg-1",
            "name": "Alpha Squad",
            "event_id": "event-matrix-1",
            "lead_id": "uid-member",
            "member_ids": ["uid-member"],
            "status": "active",
            "idea_id": "idea-123",
        })
        self.db.collection("ideas").document("idea-123").set({
            "id": "idea-123",
            "title": "AI Code Reviewer",
            "track": "technical",
            "description": "Automated code reviewer for PRs",
            "is_verified": True,
        })

        # 2. Create SPG column
        spg_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(
                title="Assigned SPG",
                column_type=MatrixColumnType.OBJECT,
                object_schema_type=MatrixSchemaType.SPG_ASSIGNMENT,
            ),
            current_user=ADMIN,
        )

        # 3. Create Idea Jar column
        idea_col = events.create_matrix_column(
            "event-matrix-1",
            payload=CreateMatrixColumnRequest(
                title="Linked Idea",
                column_type=MatrixColumnType.OBJECT,
                object_schema_type=MatrixSchemaType.IDEA_JAR_ASSIGNMENT,
            ),
            current_user=ADMIN,
        )

        # 4. Fetch matrix - verify lazy auto-hydration of SPG and Idea
        mat = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        self.assertEqual(len(mat.event_spgs), 1)
        self.assertEqual(mat.event_spgs[0]["name"], "Alpha Squad")
        self.assertEqual(len(mat.approved_ideas), 1)
        self.assertEqual(mat.approved_ideas[0]["title"], "AI Code Reviewer")

        member_row = next(r for r in mat.rows if r.user_id == "uid-member")
        spg_cell = member_row.cells[spg_col.column_id]
        self.assertIsNotNone(spg_cell)
        self.assertEqual(spg_cell["schema_type"], "spg_assignment")
        self.assertEqual(spg_cell["spg_name"], "Alpha Squad")
        self.assertEqual(spg_cell["role"], "lead")

        idea_cell = member_row.cells[idea_col.column_id]
        self.assertIsNotNone(idea_cell)
        self.assertEqual(idea_cell["schema_type"], "idea_jar_assignment")
        self.assertEqual(idea_cell["idea_title"], "AI Code Reviewer")

        # 5. Test manual cell update on SPG column
        events.update_matrix_cell(
            "event-matrix-1",
            payload=UpdateMatrixCellRequest(
                user_id="uid-member",
                column_id=spg_col.column_id,
                value={
                    "schema_type": "spg_assignment",
                    "spg_id": "spg-1",
                    "spg_name": "Alpha Squad Pro",
                    "spg_status": "in_progress",
                    "role": "lead",
                },
            ),
            current_user=ADMIN,
        )

        mat_updated = events.get_event_matrix("event-matrix-1", current_user=ADMIN)
        updated_member_row = next(r for r in mat_updated.rows if r.user_id == "uid-member")
        self.assertEqual(
            updated_member_row.cells[spg_col.column_id]["spg_name"],
            "Alpha Squad Pro",
        )


if __name__ == "__main__":
    unittest.main()
