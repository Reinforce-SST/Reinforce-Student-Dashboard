"""Unit tests for the SPG and Event Team Invitations System."""

import unittest
from app.api.v1.endpoints import invitations, events
from app.schemas.invitations import CreateInvitationRequest, InvitationType, InvitationStatus
from app.schemas.events import EventRegisterRequest
from tests.helpers.nested_firestore import NestedFirestore

LEAD = {"uid": "uid-lead", "email": "lead@sst.scaler.com", "name": "Team Lead"}
INVITEE = {"uid": "uid-invitee", "email": "invitee@sst.scaler.com", "name": "Target Student"}
STRANGER = {"uid": "uid-stranger", "email": "stranger@sst.scaler.com"}


class InvitationsSystemTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        invitations.db = self.db
        events.db = self.db
        events.run_event_transaction = lambda work: work(self.db.transaction())

        # Seed Users
        for u in [LEAD, INVITEE, STRANGER]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": u.get("name", f"User {u['uid']}"),
                "email": u["email"],
                "batch_year": 2027,
            })

        # Seed SPG
        self.spg_id = "spg-drone-lab"
        self.db.collection("spgs").document(self.spg_id).set({
            "id": self.spg_id,
            "name": "Drone Lab",
            "lead_id": LEAD["uid"],
            "member_ids": [LEAD["uid"]],
            "status": "active",
        })

        # Seed Event and Team Registration
        self.event_id = "event-hack-1"
        self.db.collection("events").document(self.event_id).set({
            "id": self.event_id,
            "slug": "winter-hackathon",
            "title": "Winter Hackathon",
            "description": "48 hour club hackathon",
            "event_type": "Hackathon",
            "track": "misc",
            "format": "offline",
            "status": "published",
            "schedule": {
                "start_time": "2030-01-01T10:00:00+00:00",
                "registration_deadline": "2029-12-31T18:00:00+00:00",
            },
            "participation": {
                "mode": "team",
                "min_team_size": 2,
                "max_team_size": 4,
                "requires_event_spg": True,
            },
            "stats": {"registered_count": 0, "checked_in_count": 0},
        })
        self.reg_id = "reg-lead-1"
        self.db.collection("events").document(self.event_id).collection("registrations").document(self.reg_id).set({
            "id": self.reg_id,
            "user_id": LEAD["uid"],
            "team_name": "SkyWolves",
            "member_uids": [LEAD["uid"]],
            "status": "registered",
            "spg_id": self.spg_id,
        })

    def test_spg_invitation_lifecycle(self):
        # 1. Lead creates an SPG invitation
        req = CreateInvitationRequest(
            type=InvitationType.SPG,
            target_id=self.spg_id,
            invitee_uid=INVITEE["uid"],
        )
        inv = invitations.create_invitation(req, current_user=LEAD)
        self.assertEqual(inv.status, InvitationStatus.PENDING.value)
        self.assertEqual(inv.invitee_uid, INVITEE["uid"])
        self.assertEqual(inv.target_name, "Drone Lab")

        # 2. Invitee fetches invitations
        my_invs = invitations.get_my_invitations(current_user=INVITEE)
        self.assertEqual(len(my_invs), 1)
        self.assertEqual(my_invs[0].id, inv.id)

        # 3. SPG target query returns the pending invitation
        spg_invs = invitations.get_target_invitations(self.spg_id, current_user=LEAD)
        self.assertEqual(len(spg_invs), 1)
        self.assertEqual(spg_invs[0].id, inv.id)

        # 4. Invitee accepts the invitation
        accepted = invitations.accept_invitation(inv.id, current_user=INVITEE)
        self.assertEqual(accepted.status, InvitationStatus.ACCEPTED.value)

        # Verify SPG membership updated
        spg_doc = self.db.collection("spgs").document(self.spg_id).get().to_dict()
        self.assertIn(INVITEE["uid"], spg_doc["member_ids"])

    def test_event_team_invitation_lifecycle(self):
        # 1. Lead invites student to event team
        req = CreateInvitationRequest(
            type=InvitationType.EVENT_TEAM,
            target_id=self.event_id,
            invitee_uid=INVITEE["uid"],
        )
        inv = invitations.create_invitation(req, current_user=LEAD)
        self.assertEqual(inv.status, InvitationStatus.PENDING.value)
        self.assertEqual(inv.team_name, "SkyWolves")

        # 2. Event target query returns the invitation
        target_invs = invitations.get_target_invitations(self.event_id, current_user=LEAD)
        self.assertEqual(len(target_invs), 1)

        # 3. Invitee accepts the invitation
        accepted = invitations.accept_invitation(inv.id, current_user=INVITEE)
        self.assertEqual(accepted.status, InvitationStatus.ACCEPTED.value)

        # Verify event registration member_uids updated
        reg_doc = (
            self.db.collection("events")
            .document(self.event_id)
            .collection("registrations")
            .document(self.reg_id)
            .get()
            .to_dict()
        )
        self.assertIn(INVITEE["uid"], reg_doc["member_uids"])

    def test_event_registration_creates_invitations_and_syncs_both_surfaces(self):
        """Registering a team for an event must only register the lead and issue invitations for teammates."""
        # Clean existing reg
        self.db.collection("events").document(self.event_id).collection("registrations").document(self.reg_id).delete()

        # 1. Lead registers team with INVITEE in member_uids
        reg = events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(
                team_name="AlphaSquad",
                member_uids=[LEAD["uid"], INVITEE["uid"]],
            ),
            current_user=LEAD,
        )

        # 2. Verify registration only has LEAD as confirmed member
        self.assertEqual(reg.team_name, "AlphaSquad")
        self.assertEqual(reg.member_uids, [LEAD["uid"]])
        self.assertIsNotNone(reg.spg_id)

        # 3. Verify spawned SPG only has LEAD as confirmed member
        spg_doc = self.db.collection("spgs").document(reg.spg_id).get().to_dict()
        self.assertEqual(spg_doc["lead_id"], LEAD["uid"])
        self.assertEqual(spg_doc["member_ids"], [LEAD["uid"]])

        # 4. Verify pending invitation was created
        pending_invs = invitations.get_my_invitations(status="pending", current_user=INVITEE)
        self.assertEqual(len(pending_invs), 1)
        inv = pending_invs[0]
        self.assertEqual(inv.invitee_uid, INVITEE["uid"])
        self.assertEqual(inv.inviter_uid, LEAD["uid"])
        self.assertEqual(inv.event_id, self.event_id)
        self.assertEqual(inv.spg_id, reg.spg_id)

        # 5. Querying target with either spg_id OR event_id finds the invitation
        by_spg = invitations.get_target_invitations(reg.spg_id, current_user=LEAD)
        self.assertEqual(len(by_spg), 1)
        self.assertEqual(by_spg[0].id, inv.id)

        by_event = invitations.get_target_invitations(self.event_id, current_user=LEAD)
        self.assertEqual(len(by_event), 1)
        self.assertEqual(by_event[0].id, inv.id)

        # 6. INVITEE accepts the invitation
        accepted = invitations.accept_invitation(inv.id, current_user=INVITEE)
        self.assertEqual(accepted.status, InvitationStatus.ACCEPTED.value)

        # 7. Both Event Registration AND SPG have INVITEE joined!
        fresh_spg = self.db.collection("spgs").document(reg.spg_id).get().to_dict()
        self.assertIn(INVITEE["uid"], fresh_spg["member_ids"])

        fresh_reg = (
            self.db.collection("events")
            .document(self.event_id)
            .collection("registrations")
            .document(reg.id)
            .get()
            .to_dict()
        )
        self.assertIn(INVITEE["uid"], fresh_reg["member_uids"])

    def test_cancel_event_registration_disbands_spg_and_cancels_invitations(self):
        """Cancelling event registration must disband the SPG and cancel pending invites."""
        # Clean existing reg
        self.db.collection("events").document(self.event_id).collection("registrations").document(self.reg_id).delete()

        # Register team
        reg = events.register_for_event(
            self.event_id,
            payload=EventRegisterRequest(
                team_name="OmegaSquad",
                member_uids=[LEAD["uid"], INVITEE["uid"]],
            ),
            current_user=LEAD,
        )
        spg_id = reg.spg_id

        # Cancel registration
        cancel_resp = events.cancel_registration(self.event_id, current_user=LEAD)
        self.assertIn("Registration cancelled", cancel_resp["message"])

        # SPG is disbanded
        spg_doc = self.db.collection("spgs").document(spg_id).get().to_dict()
        self.assertEqual(spg_doc["status"], "disbanded")

        # Pending invitations are cancelled
        invs = invitations.get_target_invitations(self.event_id, status="cancelled", current_user=LEAD)
        self.assertEqual(len(invs), 1)
        self.assertEqual(invs[0].status, InvitationStatus.CANCELLED.value)

    def test_decline_and_cancel_invitation(self):
        # Create invitation
        req = CreateInvitationRequest(
            type=InvitationType.SPG,
            target_id=self.spg_id,
            invitee_uid=INVITEE["uid"],
        )
        inv = invitations.create_invitation(req, current_user=LEAD)

        # Invitee declines
        declined = invitations.decline_invitation(inv.id, current_user=INVITEE)
        self.assertEqual(declined.status, InvitationStatus.DECLINED.value)

        # Lead creates another invitation
        inv2 = invitations.create_invitation(req, current_user=LEAD)
        # Lead cancels it
        cancelled = invitations.cancel_invitation(inv2.id, current_user=LEAD)
        self.assertEqual(cancelled["status"], "cancelled")


if __name__ == "__main__":
    unittest.main()
