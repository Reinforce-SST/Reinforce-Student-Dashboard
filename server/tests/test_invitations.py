"""Unit tests for the SPG and Event Team Invitations System."""

import unittest
from app.api.v1.endpoints import invitations, events
from app.schemas.invitations import CreateInvitationRequest, InvitationType, InvitationStatus
from tests.helpers.nested_firestore import NestedFirestore

LEAD = {"uid": "uid-lead", "email": "lead@sst.scaler.com", "name": "Team Lead"}
INVITEE = {"uid": "uid-invitee", "email": "invitee@sst.scaler.com", "name": "Target Student"}
STRANGER = {"uid": "uid-stranger", "email": "stranger@sst.scaler.com"}


class InvitationsSystemTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        invitations.db = self.db
        events.db = self.db

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
            "title": "Winter Hackathon",
            "participation": {
                "mode": "team",
                "max_team_size": 4,
            },
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

        # 3. Invitee accepts the invitation
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

        # 2. Invitee accepts the invitation
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
