"""Unit tests for Ticket Communication, Thread Messaging, and Admin Lifecycle Management.

Covers:
- Member creating general support, feedback, and reimbursement tickets (POST /tickets)
- Member & admin posting messages to ticket threads (POST /tickets/{id}/messages)
- Fetching thread history (GET /tickets/{id}/messages)
- Closing tickets with reason tracking (POST /tickets/{id}/close)
- Admin status updates (PATCH /tickets/{id}/status)
- Admin priority updates (PATCH /tickets/{id}/priority)
- Admin assignment to leads (PATCH /tickets/{id}/assign)
- Ticket metrics analytics (GET /tickets/metrics)
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_admin_user, get_current_user
from app.api.v1.endpoints import tickets
from tests.helpers.nested_firestore import NestedFirestore


MEMBER_A = {"uid": "uid-member-a", "email": "membera@sst.scaler.com", "name": "Member A"}
MEMBER_B = {"uid": "uid-member-b", "email": "memberb@sst.scaler.com", "name": "Member B"}
LEAD_USER = {"uid": "uid-lead-core", "email": "leadcore@sst.scaler.com", "name": "Core Lead"}
ADMIN_USER = {"uid": "uid-admin-lead", "email": "admin@sst.scaler.com", "admin": True, "name": "Club Admin"}


class TicketCommunicationTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        self.tickets_patch = patch.object(tickets, "db", self.db)
        self.tickets_patch.start()
        self.addCleanup(self.tickets_patch.stop)

        # Seed Users
        for u in [MEMBER_A, MEMBER_B, LEAD_USER, ADMIN_USER]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": u["name"],
                "email": u["email"],
                "is_member": True,
                "is_admin": u.get("admin", False),
            })

        self.user = dict(MEMBER_A)

        app = FastAPI()
        app.include_router(tickets.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_admin_user] = lambda: self.user if (self.user and self.user.get("admin")) else self._raise_forbidden()
        self.client = TestClient(app)

    def _raise_forbidden(self):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required.")

    def as_member_a(self):
        self.user = dict(MEMBER_A)

    def as_member_b(self):
        self.user = dict(MEMBER_B)

    def as_admin(self):
        self.user = dict(ADMIN_USER)

    def test_member_creates_support_ticket(self):
        self.as_member_a()
        payload = {
            "category": "support",
            "title": "Cannot access cluster GPU environment",
            "description": "Getting permission denied on node-04 when running torchrun.",
            "fields": {"cluster_node": "node-04", "urgency": "high"},
        }
        res = self.client.post("/api/v1/tickets", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        ticket_id = data["id"]
        self.assertTrue(ticket_id.startswith("tkt_"))
        self.assertEqual(data["title"], "Cannot access cluster GPU environment")
        self.assertEqual(data["category"], "support")
        self.assertEqual(data["status"], "open")
        self.assertEqual(data["priority"], "medium")

    def test_post_and_fetch_ticket_messages(self):
        self.as_member_a()
        # 1. Create ticket
        ticket_id = self.client.post("/api/v1/tickets", json={
            "category": "support",
            "title": "Need assistance with dataset download",
        }).json()["id"]

        # 2. Member posts first message
        msg1 = self.client.post(f"/api/v1/tickets/{ticket_id}/messages", json={
            "content": "The ImageNet mirror seems down from campus Wi-Fi.",
            "attachments": ["https://storage.googleapis.com/proof/error.png"],
        }).json()
        self.assertEqual(msg1["content"], "The ImageNet mirror seems down from campus Wi-Fi")
        self.assertEqual(msg1["sender_uid"], MEMBER_A["uid"])

        # 3. Admin posts response
        self.as_admin()
        msg2 = self.client.post(f"/api/v1/tickets/{ticket_id}/messages", json={
            "content": "Use the internal academic proxy at proxy.sst.scaler.com:8080.",
        }).json()
        self.assertEqual(msg2["sender_role"], "admin")

        # 4. Member fetches messages thread
        self.as_member_a()
        thread_res = self.client.get(f"/api/v1/tickets/{ticket_id}/messages")
        self.assertEqual(thread_res.status_code, 200)
        messages = thread_res.json()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["content"], "The ImageNet mirror seems down from campus Wi-Fi")
        self.assertEqual(messages[1]["content"], "Use the internal academic proxy at proxy.sst.scaler.com:8080.")

    def test_member_closes_own_ticket(self):
        self.as_member_a()
        ticket_id = self.client.post("/api/v1/tickets", json={
            "category": "support",
            "title": "Resolved issue myself",
        }).json()["id"]

        close_res = self.client.post(f"/api/v1/tickets/{ticket_id}/close", json={
            "close_reason": "Managed to solve it after rebooting cluster pod.",
        })
        self.assertEqual(close_res.status_code, 200)
        data = close_res.json()
        self.assertEqual(data["status"], "closed")

        # Verify in database
        ticket_doc = self.db.collection("tickets").document(ticket_id).get().to_dict()
        self.assertEqual(ticket_doc["status"], "closed")
        self.assertEqual(ticket_doc["closed_by_uid"], MEMBER_A["uid"])
        self.assertEqual(ticket_doc["close_reason"], "Managed to solve it after rebooting cluster pod.")

    def test_admin_updates_status_priority_and_assignment(self):
        self.as_member_a()
        ticket_id = self.client.post("/api/v1/tickets", json={
            "category": "compute_resource_request",
            "title": "Requesting 4x A100 for LLM fine-tuning",
        }).json()["id"]

        # Member cannot change priority or assignment
        self.assertEqual(
            self.client.patch(f"/api/v1/tickets/{ticket_id}/priority", json={"priority": "urgent"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(f"/api/v1/tickets/{ticket_id}/assign", json={"assigned_to_uid": LEAD_USER["uid"]}).status_code,
            403,
        )

        # Admin assigns lead and escalates priority
        self.as_admin()
        prio_res = self.client.patch(f"/api/v1/tickets/{ticket_id}/priority", json={"priority": "urgent"})
        self.assertEqual(prio_res.status_code, 200)
        self.assertEqual(prio_res.json()["priority"], "urgent")

        assign_res = self.client.patch(f"/api/v1/tickets/{ticket_id}/assign", json={"assigned_to_uid": LEAD_USER["uid"]})
        self.assertEqual(assign_res.status_code, 200)
        self.assertEqual(assign_res.json()["assigned_to_uid"], LEAD_USER["uid"])

        status_res = self.client.patch(f"/api/v1/tickets/{ticket_id}/status", json={"status": "in_progress"})
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "in_progress")

    def test_ticket_metrics_analytics(self):
        # Seed tickets with various statuses and categories
        self.db.collection("tickets").document("tkt_1").set({
            "id": "tkt_1", "status": "open", "category": "support", "priority": "medium", "created_at": "2026-01-01T00:00:00Z",
        })
        self.db.collection("tickets").document("tkt_2").set({
            "id": "tkt_2", "status": "resolved", "category": "support", "priority": "high", "created_at": "2026-01-01T00:00:00Z",
        })
        self.db.collection("tickets").document("tkt_3").set({
            "id": "tkt_3", "status": "in_progress", "category": "idea_jar", "priority": "low", "created_at": "2026-01-01T00:00:00Z",
        })

        self.as_admin()
        metrics_res = self.client.get("/api/v1/tickets/metrics")
        self.assertEqual(metrics_res.status_code, 200)
        data = metrics_res.json()
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["open"], 1)
        self.assertEqual(data["resolved"], 1)
        self.assertEqual(data["in_progress"], 1)


if __name__ == "__main__":
    unittest.main()
