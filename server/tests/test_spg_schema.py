"""Unit tests for the minimal SPG schema in app/schemas/spgs.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest

from pydantic import ValidationError

from app.schemas.spgs import (
    SPGCreate,
    SPGRecord,
    SPGStatus,
    SPGTrack,
    SPGType,
    SPGUpdate,
    SPGVisibility,
)


def spg(**overrides):
    data = {
        "id": "spg_001",
        "name": "Alpha",
        "type": "learning",
        "member_ids": ["student_001", "student_002", "student_003"],
        "lead_id": "student_001",
        "status": "active",
    }
    data.update(overrides)
    return data


class SPGRecordTests(unittest.TestCase):
    def test_minimal_spg_is_valid(self):
        group = SPGRecord.model_validate(spg())
        self.assertEqual(group.member_ids, ["student_001", "student_002", "student_003"])
        self.assertEqual(group.status, SPGStatus.ACTIVE)

    def test_single_member_who_leads_is_valid(self):
        group = SPGRecord.model_validate(spg(member_ids=["student_001"]))
        self.assertEqual(group.member_ids, ["student_001"])

    def test_member_ids_are_references_not_objects(self):
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(member_ids=[{"id": "student_001", "full_name": "Test"}]))

    def test_empty_member_list_is_rejected(self):
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(member_ids=[]))

    def test_blank_member_id_is_rejected(self):
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(member_ids=["student_001", "   "]))

    def test_duplicate_members_are_rejected(self):
        # Also after trimming: a member listed twice would be awarded twice.
        for members in (["student_001", "student_001"], ["student_001", " student_001 "]):
            with self.subTest(members=members):
                with self.assertRaises(ValidationError):
                    SPGRecord.model_validate(spg(member_ids=members))

    def test_lead_must_be_a_member(self):
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(lead_id="student_999"))

    def test_status_values(self):
        # Provisional; see docs/BACKEND_DATA_MODEL_PROPOSAL.md.
        self.assertEqual(
            {s.value for s in SPGStatus}, {"active", "paused", "completed", "disbanded"}
        )
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(status="archived"))

    def test_unknown_fields_are_rejected(self):
        # Importance ("high value") has no field: it is not a type, and no tier
        # or priority field exists yet.
        for field, value in {"tier": "high_value", "priority": "high", "points": 100, "members": []}.items():
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    SPGRecord.model_validate(spg(**{field: value}))


class SPGTypeTests(unittest.TestCase):
    def test_type_values(self):
        # A contract shared with endpoints; changing one is a coordinated change.
        self.assertEqual(
            [t.value for t in SPGType],
            ["learning", "project", "event", "external_event", "miscellaneous"],
        )

    def test_each_type_is_accepted(self):
        for spg_type in SPGType:
            with self.subTest(type=spg_type.value):
                self.assertIs(SPGRecord.model_validate(spg(type=spg_type.value)).type, spg_type)

    def test_other_values_are_rejected(self):
        # No free text, no importance tier, and event types stay distinct.
        for bad in ("high_value", "HIGH_VALUE", "Learning", "external event", "other", "", "competition"):
            with self.subTest(type=bad):
                with self.assertRaises(ValidationError):
                    SPGRecord.model_validate(spg(type=bad))

    def test_type_is_required(self):
        body = spg()
        del body["type"]
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(body)

    def test_type_serializes_as_its_lowercase_value(self):
        group = SPGRecord.model_validate(spg(type="external_event"))
        self.assertEqual(group.model_dump(mode="json")["type"], "external_event")
        self.assertEqual(group.model_dump()["type"], "external_event")


class SPGTrackTests(unittest.TestCase):
    def test_track_values(self):
        # Deliberately not ContributionTrack: that one ends in `misc`, the club
        # SPG taxonomy ends in `general`.
        self.assertEqual(
            [t.value for t in SPGTrack], ["kaggle", "product", "research", "general"]
        )

    def test_track_defaults_to_general(self):
        self.assertIs(SPGRecord.model_validate(spg()).track, SPGTrack.GENERAL)

    def test_each_track_is_accepted(self):
        for track in SPGTrack:
            with self.subTest(track=track):
                self.assertIs(SPGRecord.model_validate(spg(track=track.value)).track, track)

    def test_unknown_track_is_rejected(self):
        for bad in ("Kaggle", "misc", "general ", ""):
            with self.subTest(track=bad):
                with self.assertRaises(ValidationError):
                    SPGRecord.model_validate(spg(track=bad))


class SPGVisibilityTests(unittest.TestCase):
    def test_visibility_values(self):
        self.assertEqual({v.value for v in SPGVisibility}, {"public", "private"})

    def test_an_event_spg_is_always_public(self):
        self.assertIs(
            SPGRecord.model_validate(spg(type="event")).visibility, SPGVisibility.PUBLIC
        )

    def test_an_explicitly_private_event_is_rejected(self):
        with self.assertRaises(ValidationError):
            SPGRecord.model_validate(spg(type="event", visibility="private"))

    def test_a_project_may_be_public_or_private(self):
        for visibility in ("public", "private"):
            with self.subTest(visibility=visibility):
                group = SPGRecord.model_validate(spg(type="project", visibility=visibility))
                self.assertEqual(group.visibility.value, visibility)

    def test_visibility_defaults_closed_for_non_events(self):
        # Fail closed: a document written before visibility existed must not
        # become publicly discoverable by default.
        self.assertIs(
            SPGRecord.model_validate(spg(type="project")).visibility, SPGVisibility.PRIVATE
        )


class LegacyDocumentTests(unittest.TestCase):
    """Documents written before this workflow existed must still read back."""

    def test_a_document_without_the_new_fields_validates(self):
        group = SPGRecord.model_validate(spg())
        self.assertIsNone(group.created_by)
        self.assertIsNone(group.created_at)
        self.assertIsNone(group.proposition_document_url)
        self.assertIsNone(group.source_ticket_id)
        self.assertIsNone(group.completed_at)

    def test_the_contribution_award_fixture_still_validates(self):
        # The contribution SPG award reads SPGRecord. This is the exact shape
        # its tests store, and it must keep working.
        SPGRecord.model_validate({
            "id": "spg_001", "name": "Alpha", "type": "project",
            "member_ids": ["uid_one", "uid_two"], "lead_id": "uid_one",
            "status": "active",
        })


class SPGCreateTests(unittest.TestCase):
    def payload(self, **overrides):
        data = {
            "name": "Alpha",
            "type": "project",
            "track": "research",
            "visibility": "private",
            "member_ids": ["uid_one", "uid_two"],
            "lead_id": "uid_one",
            "proposition_document_url": "https://storage.test/p.pdf",
            "source_ticket_id": "ticket_001",
        }
        data.update(overrides)
        return data

    def test_a_project_requires_a_proposition_document(self):
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(self.payload(proposition_document_url=None))

    def test_a_non_project_does_not_require_one(self):
        for spg_type in ("learning", "event", "external_event", "miscellaneous"):
            with self.subTest(type=spg_type):
                body = self.payload(proposition_document_url=None, type=spg_type)
                if spg_type == "event":
                    body["visibility"] = "public"
                SPGCreate.model_validate(body)

    def test_the_lead_must_be_a_member(self):
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(self.payload(lead_id="uid_outsider"))

    def test_duplicate_members_are_rejected(self):
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(self.payload(member_ids=["uid_one", "uid_one"]))

    def test_a_source_ticket_id_is_required(self):
        # Creation happens only after a ticket is approved, and the ticket ID
        # is what makes a retried approval idempotent. Without one there is
        # neither an approval behind the group nor a stable document ID.
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(self.payload(source_ticket_id=None))
        body = self.payload()
        del body["source_ticket_id"]
        with self.assertRaises(ValidationError):
            SPGCreate.model_validate(body)
        for blank in ("", "   "):
            with self.subTest(value=blank):
                with self.assertRaises(ValidationError):
                    SPGCreate.model_validate(self.payload(source_ticket_id=blank))

    def test_the_record_keeps_source_ticket_id_optional_for_legacy_documents(self):
        # Documents written before this workflow have no ticket and must still
        # read back, which is why the requirement lives on SPGCreate only.
        group = SPGRecord.model_validate(spg())
        self.assertIsNone(group.source_ticket_id)

    def test_server_owned_fields_are_rejected(self):
        for field, value in {
            "id": "spg_forged",
            "status": "completed",
            "created_by": "uid_admin",
            "created_at": "2026-09-01T10:00:00+00:00",
            "completed_at": "2026-09-01T10:00:00+00:00",
        }.items():
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    SPGCreate.model_validate(self.payload(**{field: value}))


class SPGUpdateTests(unittest.TestCase):
    def test_only_metadata_is_editable(self):
        SPGUpdate.model_validate({"name": "Renamed", "track": "product", "visibility": "public"})

    def test_team_and_lifecycle_fields_are_rejected(self):
        # Membership, lead and status have dedicated operations so a general
        # PATCH cannot quietly change who is in a group or finish it.
        for field, value in {
            "member_ids": ["uid_one"],
            "lead_id": "uid_two",
            "status": "completed",
            "type": "event",
            "created_by": "uid_admin",
        }.items():
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    SPGUpdate.model_validate({field: value})


if __name__ == "__main__":
    unittest.main()
