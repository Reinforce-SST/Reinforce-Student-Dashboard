"""Endpoint tests for the SPG routes.

The real router runs under FastAPI's TestClient; only the boundaries are
replaced — the Firestore client, the verified token and Firebase Storage — so
no Firebase, no network and no real user data is involved.
"""

import copy
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user
from app.api.v1.endpoints import spg as endpoints
from app.schemas.spgs import SPGCreate, SPGStatus
from app.services import spg_reports as reports_service
from app.services import spgs as service
from app.services import uploads
from app.services.firebase import get_db
from tests.helpers.fake_firestore import FakeFirestore, run_transaction
from tests.helpers.fake_storage import NOT_PDF_BYTES, PDF_BYTES, FakeStorage

ADMIN = {"email": "admin@sst.scaler.com", "uid": "uid_admin", "admin": True}
MEMBER = {"email": "one@sst.scaler.com", "uid": "uid_one"}
OTHER_MEMBER = {"email": "two@sst.scaler.com", "uid": "uid_two"}
OUTSIDER = {"email": "three@sst.scaler.com", "uid": "uid_three"}

HEADING = "Week two progress"
DESCRIPTION = "Baseline model trained and benchmarked."

USERS = {
    "uid_one": {"id": "uid_one", "email": "one@sst.scaler.com", "full_name": "One"},
    "uid_two": {"id": "uid_two", "email": "two@sst.scaler.com", "full_name": "Two"},
    "uid_three": {"id": "uid_three", "email": "three@sst.scaler.com", "full_name": "Three"},
    "uid_admin": {"id": "uid_admin", "email": "admin@sst.scaler.com", "full_name": "Admin"},
}

REGISTRATION = {
    "name": "Seismic Prediction",
    "description": "Ensemble model for earthquake detection.",
    "type": "project",
    "track": "research",
    "visibility": "private",
    "member_ids": ["uid_one", "uid_two"],
    "lead_id": "uid_one",
    "proposition_document_url": "https://storage.test/p.pdf",
    "source_ticket_id": "ticket_001",
}


class SPGAPITestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeFirestore({"users": copy.deepcopy(USERS)})
        self.user = dict(ADMIN)
        self.storage = FakeStorage()

        # Production runs one transaction per write; the fake runs the same
        # code path in memory.
        for module in (service, reports_service):
            real = module.run_in_transaction
            module.run_in_transaction = run_transaction
            self.addCleanup(setattr, module, "run_in_transaction", real)

        real_store = uploads.store_pdf
        uploads.store_pdf = self.storage.store
        self.addCleanup(setattr, uploads, "store_pdf", real_store)
        real_report_store = reports_service.uploads.store_pdf
        reports_service.uploads.store_pdf = self.storage.store
        self.addCleanup(setattr, reports_service.uploads, "store_pdf", real_report_store)

        app = FastAPI()
        app.include_router(endpoints.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def sign_in_as(self, user: dict) -> None:
        self.user = dict(user)

    def create_spg(self, **overrides) -> str:
        """Seed an SPG through the service.

        No HTTP route creates one: creation belongs to registration approval,
        and the ticket domain that would drive it does not exist yet.
        """
        record, _created = service.create_spg(
            self.db,
            create=SPGCreate.model_validate({**REGISTRATION, **overrides}),
            admin_id="uid_admin",
            runner=run_transaction,
        )
        return record.id

    def upload_report(self, spg_id, payload=PDF_BYTES, content_type="application/pdf", **data):
        body = {"heading": HEADING, "short_description": DESCRIPTION, **data}
        return self.client.post(
            f"/api/v1/spgs/{spg_id}/reports/pdf",
            files={"file": ("report.pdf", payload, content_type)},
            data=body,
        )

    def submit_form(self, spg_id, **overrides):
        body = {
            "heading": HEADING,
            "short_description": DESCRIPTION,
            "summary": "Trained the baseline and benchmarked it.",
            "milestones": ["Cleaned the dataset"],
            "blockers": "Not enough GPU credits.",
            "next_steps": "Implement the spatial encoder.",
        }
        body.update(overrides)
        return self.client.post(f"/api/v1/spgs/{spg_id}/reports/form", json=body)


class AdminAuthTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()

    def rename(self):
        return self.client.patch(f"/api/v1/spgs/{self.spg_id}", json={"name": "Renamed"})

    def test_admin_claim_is_accepted(self):
        self.assertEqual(self.rename().status_code, 200)

    def test_false_and_truthy_claims_are_forbidden(self):
        # The rule is `token.get("admin") is True`, so it fails closed.
        for claim in (False, "true", 1, None, []):
            with self.subTest(claim=claim):
                self.sign_in_as({**MEMBER, "admin": claim})
                self.assertEqual(self.rename().status_code, 403)

    def test_every_management_route_is_closed_to_members(self):
        self.sign_in_as(MEMBER)
        responses = [
            self.client.patch(f"/api/v1/spgs/{self.spg_id}", json={"name": "Renamed"}),
            self.client.post(f"/api/v1/spgs/{self.spg_id}/members/uid_three"),
            self.client.delete(f"/api/v1/spgs/{self.spg_id}/members/uid_two"),
            self.client.patch(f"/api/v1/spgs/{self.spg_id}/lead", json={"new_lead_id": "uid_two"}),
            self.client.post(f"/api/v1/spgs/{self.spg_id}/pause"),
            self.client.post(f"/api/v1/spgs/{self.spg_id}/resume"),
            self.client.post(f"/api/v1/spgs/{self.spg_id}/disband"),
            self.client.post("/api/v1/spgs/reports/rep_x/verify"),
        ]
        self.assertEqual([r.status_code for r in responses], [403] * 8)


class NoCreationRouteTests(SPGAPITestCase):
    """No HTTP route creates an SPG.

    The approval endpoint that used to sit here accepted any `source_ticket_id`
    without ever reading the tickets collection, which made it a second
    creation path in a workflow that is supposed to have one. It was removed
    rather than left to look like an approval it could not perform.
    """

    def paths(self):
        return self.client.app.openapi()["paths"]

    def test_the_removed_endpoints_are_gone(self):
        for path in ("/api/v1/spgs/approvals", "/api/v1/spgs/propositions"):
            with self.subTest(path=path):
                self.assertNotIn(path, self.paths())

    def test_posting_to_them_creates_nothing(self):
        # 405 rather than 404: `GET /spgs/{spg_id}` still matches the path, so
        # the route exists for reading and simply has no POST. Either way
        # nothing is written.
        for path in ("/api/v1/spgs/approvals", "/api/v1/spgs/propositions"):
            with self.subTest(path=path):
                response = self.client.post(path, json=REGISTRATION)
                self.assertEqual(response.status_code, 405)
        self.assertEqual(self.db.documents("spgs"), {})

    def test_nothing_posts_to_the_collection_root(self):
        self.assertNotIn("post", self.paths().get("/api/v1/spgs", {}))

    def test_no_route_writes_the_spgs_collection_except_management(self):
        # Every remaining write route needs an SPG that already exists, so
        # none of them can bring one into being.
        creating = [
            p for p, ops in self.paths().items()
            if "post" in ops and "{spg_id}" not in p and "{report_id}" not in p
        ]
        self.assertEqual(creating, [])


class VisibilityTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.private_id = self.create_spg()
        self.public_id = self.create_spg(
            visibility="public", source_ticket_id="ticket_public", name="Open Group"
        )

    def test_a_member_reads_their_private_spg(self):
        self.sign_in_as(MEMBER)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.private_id}").status_code, 200)

    def test_a_non_member_cannot_read_a_private_spg(self):
        # 404 rather than 403, so the route cannot confirm what exists.
        self.sign_in_as(OUTSIDER)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.private_id}").status_code, 404)

    def test_anyone_reads_a_public_spg(self):
        self.sign_in_as(OUTSIDER)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.public_id}").status_code, 200)

    def test_an_admin_reads_any_spg(self):
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.private_id}").status_code, 200)

    def test_listing_hides_private_groups_from_non_members(self):
        self.sign_in_as(OUTSIDER)
        body = self.client.get("/api/v1/spgs").json()
        self.assertEqual([item["id"] for item in body["items"]], [self.public_id])

    def test_listing_shows_a_member_their_own_private_group(self):
        self.sign_in_as(MEMBER)
        body = self.client.get("/api/v1/spgs").json()
        self.assertEqual(
            {item["id"] for item in body["items"]}, {self.private_id, self.public_id}
        )

    def test_a_private_spg_leaks_nothing_to_a_non_member(self):
        # Not even its name or ID appears in a listing an outsider requests.
        self.sign_in_as(OUTSIDER)
        body = self.client.get("/api/v1/spgs").text
        self.assertNotIn(self.private_id, body)
        self.assertNotIn("Seismic Prediction", body)
        self.assertNotIn("ticket_001", body)

    def test_listing_is_bounded(self):
        self.assertEqual(self.client.get("/api/v1/spgs", params={"limit": 1000}).status_code, 422)


class ManagementTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()

    def test_metadata_is_editable(self):
        body = self.client.patch(
            f"/api/v1/spgs/{self.spg_id}", json={"name": "Renamed", "track": "product"}
        ).json()
        self.assertEqual(body["name"], "Renamed")
        self.assertEqual(body["track"], "product")

    def test_membership_cannot_be_changed_through_patch(self):
        for field, value in {
            "member_ids": ["uid_one"], "lead_id": "uid_two", "status": "completed",
        }.items():
            with self.subTest(field=field):
                response = self.client.patch(f"/api/v1/spgs/{self.spg_id}", json={field: value})
                self.assertEqual(response.status_code, 422)

    def test_members_are_added_and_removed(self):
        added = self.client.post(f"/api/v1/spgs/{self.spg_id}/members/uid_three").json()
        self.assertIn("uid_three", added["member_ids"])
        removed = self.client.delete(f"/api/v1/spgs/{self.spg_id}/members/uid_three").json()
        self.assertNotIn("uid_three", removed["member_ids"])

    def test_the_lead_cannot_be_removed(self):
        self.assertEqual(
            self.client.delete(f"/api/v1/spgs/{self.spg_id}/members/uid_one").status_code, 409
        )

    def test_the_lead_changes_to_a_member(self):
        body = self.client.patch(
            f"/api/v1/spgs/{self.spg_id}/lead", json={"new_lead_id": "uid_two"}
        ).json()
        self.assertEqual(body["lead_id"], "uid_two")

    def test_a_non_member_cannot_become_lead(self):
        self.assertEqual(
            self.client.patch(
                f"/api/v1/spgs/{self.spg_id}/lead", json={"new_lead_id": "uid_three"}
            ).status_code,
            400,
        )

    def test_pause_resume_and_disband(self):
        self.assertEqual(self.client.post(f"/api/v1/spgs/{self.spg_id}/pause").json()["status"], "paused")
        self.assertEqual(self.client.post(f"/api/v1/spgs/{self.spg_id}/resume").json()["status"], "active")
        self.assertEqual(self.client.post(f"/api/v1/spgs/{self.spg_id}/disband").json()["status"], "disbanded")

    def test_a_disbanded_spg_is_immutable_and_kept(self):
        self.client.post(f"/api/v1/spgs/{self.spg_id}/disband")
        self.assertEqual(self.client.post(f"/api/v1/spgs/{self.spg_id}/resume").status_code, 409)
        self.assertEqual(self.client.post(f"/api/v1/spgs/{self.spg_id}/members/uid_three").status_code, 409)
        self.assertIn(self.spg_id, self.db.documents("spgs"))

    def test_no_route_can_mark_an_spg_completed(self):
        # Completion belongs to a reviewed completion request, not built yet.
        self.assertNotIn(
            "completed",
            {doc.get("status") for doc in self.db.documents("spgs").values()},
        )
        self.assertEqual(
            self.client.patch(f"/api/v1/spgs/{self.spg_id}", json={"status": "completed"}).status_code,
            422,
        )


class ReportEndpointTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()
        self.sign_in_as(MEMBER)

    def test_a_member_submits_a_pdf(self):
        body = self.upload_report(self.spg_id).json()
        self.assertEqual(body["spg_id"], self.spg_id)
        self.assertEqual(body["submitted_by"], "uid_one")
        self.assertEqual(body["sequence_number"], 1)
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["report_type"], "progress")

    def test_multiple_reports_increment_the_sequence(self):
        numbers = [self.upload_report(self.spg_id).json()["sequence_number"] for _ in range(3)]
        self.assertEqual(numbers, [1, 2, 3])
        self.assertEqual(len(self.db.documents("spg_reports")), 3)

    def test_a_non_member_cannot_submit(self):
        self.sign_in_as(OUTSIDER)
        # The SPG is private, so it is not even discoverable.
        self.assertEqual(self.upload_report(self.spg_id).status_code, 404)

    def test_a_non_member_cannot_submit_to_a_public_spg(self):
        public_id = None
        self.sign_in_as(ADMIN)
        public_id = self.create_spg(
            visibility="public", source_ticket_id="ticket_pub", name="Open"
        )
        self.sign_in_as(OUTSIDER)
        self.assertEqual(self.upload_report(public_id).status_code, 403)

    def test_a_non_pdf_is_rejected(self):
        response = self.upload_report(self.spg_id, payload=NOT_PDF_BYTES)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.db.documents("spg_reports"), {})

    def test_a_wrong_content_type_is_rejected(self):
        response = self.upload_report(self.spg_id, content_type="text/plain")
        self.assertEqual(response.status_code, 400)

    def test_an_empty_file_is_rejected(self):
        self.assertEqual(self.upload_report(self.spg_id, payload=b"").status_code, 400)

    def test_an_oversized_pdf_is_rejected(self):
        oversized = PDF_BYTES + b"0" * uploads.MAX_PDF_BYTES
        self.assertEqual(self.upload_report(self.spg_id, payload=oversized).status_code, 400)

    def test_the_storage_path_is_server_generated(self):
        body = self.upload_report(self.spg_id).json()
        path = self.storage.paths()[0]
        self.assertEqual(path, f"spgs/{self.spg_id}/reports/{body['id']}.pdf")
        self.assertNotIn("report.pdf", path)

    def test_a_disbanded_spg_rejects_new_reports(self):
        self.sign_in_as(ADMIN)
        self.client.post(f"/api/v1/spgs/{self.spg_id}/disband")
        self.sign_in_as(MEMBER)
        self.assertEqual(self.upload_report(self.spg_id).status_code, 409)

    def test_history_is_listed_oldest_first(self):
        for _ in range(3):
            self.upload_report(self.spg_id)
        body = self.client.get(f"/api/v1/spgs/{self.spg_id}/reports").json()
        self.assertEqual([item["sequence_number"] for item in body["items"]], [1, 2, 3])

    def test_a_non_member_cannot_read_history(self):
        self.upload_report(self.spg_id)
        self.sign_in_as(OUTSIDER)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.spg_id}/reports").status_code, 404)

    def test_the_spg_reports_its_report_count(self):
        self.upload_report(self.spg_id)
        self.upload_report(self.spg_id)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.spg_id}").json()["report_count"], 2)


class VerificationEndpointTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()
        self.sign_in_as(MEMBER)
        self.report_id = self.upload_report(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)

    def test_an_admin_verifies_a_report(self):
        body = self.client.post(f"/api/v1/spgs/reports/{self.report_id}/verify").json()
        self.assertEqual(body["status"], "verified")
        self.assertEqual(body["verified_by"], "uid_admin")
        self.assertIsNotNone(body["verified_at"])

    def test_a_member_cannot_verify(self):
        self.sign_in_as(MEMBER)
        self.assertEqual(
            self.client.post(f"/api/v1/spgs/reports/{self.report_id}/verify").status_code, 403
        )

    def test_a_missing_report_is_not_found(self):
        self.assertEqual(
            self.client.post("/api/v1/spgs/reports/does_not_exist/verify").status_code, 404
        )

    def test_verifying_twice_is_stable(self):
        first = self.client.post(f"/api/v1/spgs/reports/{self.report_id}/verify").json()
        second = self.client.post(f"/api/v1/spgs/reports/{self.report_id}/verify").json()
        self.assertEqual(first["verified_at"], second["verified_at"])


class ContributionSeparationTests(SPGAPITestCase):
    """Nothing in the SPG API awards points."""

    def setUp(self):
        super().setUp()
        self.db.store["users"]["uid_one"]["points"] = {"total": 0, "misc": 0}
        self.spg_id = self.create_spg()

    def test_the_whole_flow_creates_no_contribution(self):
        self.sign_in_as(MEMBER)
        report_id = self.upload_report(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        self.client.post(f"/api/v1/spgs/reports/{report_id}/verify")
        self.assertEqual(self.db.documents("contributions"), {})

    def test_the_whole_flow_leaves_user_points_untouched(self):
        before = copy.deepcopy(self.db.documents("users"))
        self.sign_in_as(MEMBER)
        report_id = self.upload_report(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        self.client.post(f"/api/v1/spgs/reports/{report_id}/verify")
        self.assertEqual(self.db.documents("users"), before)

    def test_no_spg_route_writes_users_spg_ids(self):
        self.client.post(f"/api/v1/spgs/{self.spg_id}/members/uid_three")
        for document in self.db.documents("users").values():
            self.assertNotIn("spg_ids", document)

    def test_a_verified_report_carries_no_points_field(self):
        self.sign_in_as(MEMBER)
        report_id = self.upload_report(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        body = self.client.post(f"/api/v1/spgs/reports/{report_id}/verify").json()
        for forbidden in ("points", "contribution_id", "reputation"):
            self.assertNotIn(forbidden, body)


class RoutingTests(SPGAPITestCase):
    def test_fixed_paths_are_not_swallowed_by_the_id_parameter(self):
        paths = set()
        for path, operations in self.client.app.openapi()["paths"].items():
            for method in operations:
                paths.add((method.upper(), path))
        for expected in (
            ("POST", "/api/v1/spgs/reports/{report_id}/verify"),
            ("GET", "/api/v1/spgs"),
            ("GET", "/api/v1/spgs/{spg_id}"),
            ("POST", "/api/v1/spgs/{spg_id}/reports/pdf"),
            ("POST", "/api/v1/spgs/{spg_id}/reports/form"),
            ("GET", "/api/v1/spgs/{spg_id}/reports"),
        ):
            with self.subTest(route=expected):
                self.assertIn(expected, paths)

    def test_verify_resolves_to_its_own_handler(self):
        # Declared before /{spg_id}; if that ordering broke, this would be read
        # as a lookup for an SPG called "reports".
        spg_id = self.create_spg()
        self.sign_in_as(MEMBER)
        report_id = self.upload_report(spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        response = self.client.post(f"/api/v1/spgs/reports/{report_id}/verify")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "verified")

    def test_the_form_route_is_not_read_as_a_report_id(self):
        spg_id = self.create_spg()
        self.sign_in_as(MEMBER)
        self.assertEqual(self.submit_form(spg_id).status_code, 200)


class FormReportEndpointTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()
        self.sign_in_as(MEMBER)

    def test_a_member_submits_a_form_report(self):
        body = self.submit_form(self.spg_id).json()
        self.assertEqual(body["report_format"], "form")
        self.assertEqual(body["heading"], HEADING)
        self.assertEqual(body["short_description"], DESCRIPTION)
        self.assertEqual(body["submitted_by"], "uid_one")
        self.assertEqual(body["status"], "pending")
        self.assertIsNone(body["pdf_url"])

    def test_the_structured_content_comes_back(self):
        body = self.submit_form(self.spg_id).json()
        self.assertEqual(body["summary"], "Trained the baseline and benchmarked it.")
        self.assertEqual(body["milestones"], ["Cleaned the dataset"])
        self.assertEqual(body["blockers"], "Not enough GPU credits.")
        self.assertEqual(body["next_steps"], "Implement the spatial encoder.")

    def test_heading_and_short_description_are_required(self):
        for field in ("heading", "short_description", "summary"):
            with self.subTest(field=field):
                body = {
                    "heading": HEADING, "short_description": DESCRIPTION,
                    "summary": "Something happened.",
                }
                del body[field]
                response = self.client.post(
                    f"/api/v1/spgs/{self.spg_id}/reports/form", json=body
                )
                self.assertEqual(response.status_code, 422)

    def test_a_form_report_may_omit_blockers_and_next_steps(self):
        response = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/reports/form",
            json={"heading": HEADING, "short_description": DESCRIPTION,
                  "summary": "Quiet week, no blockers."},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["milestones"], [])

    def test_a_pdf_url_cannot_be_forged_in_the_body(self):
        self.assertEqual(
            self.submit_form(self.spg_id, pdf_url="https://evil.test/x.pdf").status_code, 422
        )

    def test_server_owned_fields_are_rejected(self):
        for field, value in {
            "sequence_number": 99, "submitted_by": "uid_two",
            "status": "verified", "report_format": "pdf", "id": "rep_forged",
        }.items():
            with self.subTest(field=field):
                self.assertEqual(self.submit_form(self.spg_id, **{field: value}).status_code, 422)

    def test_a_non_member_cannot_submit_a_form_report(self):
        self.sign_in_as(OUTSIDER)
        # Private SPG: not even discoverable.
        self.assertEqual(self.submit_form(self.spg_id).status_code, 404)

    def test_a_non_member_cannot_submit_to_a_public_spg(self):
        self.sign_in_as(ADMIN)
        public_id = self.create_spg(
            visibility="public", source_ticket_id="ticket_pub", name="Open"
        )
        self.sign_in_as(OUTSIDER)
        self.assertEqual(self.submit_form(public_id).status_code, 403)

    def test_a_disbanded_spg_rejects_form_reports(self):
        self.sign_in_as(ADMIN)
        self.client.post(f"/api/v1/spgs/{self.spg_id}/disband")
        self.sign_in_as(MEMBER)
        self.assertEqual(self.submit_form(self.spg_id).status_code, 409)


class MixedReportHistoryEndpointTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()
        self.sign_in_as(MEMBER)

    def test_form_and_pdf_share_one_sequence(self):
        first = self.upload_report(self.spg_id).json()
        second = self.submit_form(self.spg_id).json()
        third = self.upload_report(self.spg_id).json()
        self.assertEqual(
            [first["sequence_number"], second["sequence_number"], third["sequence_number"]],
            [1, 2, 3],
        )

    def test_the_history_lists_both_formats(self):
        self.submit_form(self.spg_id)
        self.upload_report(self.spg_id)
        self.submit_form(self.spg_id)
        body = self.client.get(f"/api/v1/spgs/{self.spg_id}/reports").json()
        self.assertEqual([i["sequence_number"] for i in body["items"]], [1, 2, 3])
        self.assertEqual(
            [i["report_format"] for i in body["items"]], ["form", "pdf", "form"]
        )

    def test_the_report_count_covers_both(self):
        self.submit_form(self.spg_id)
        self.upload_report(self.spg_id)
        self.sign_in_as(ADMIN)
        self.assertEqual(self.client.get(f"/api/v1/spgs/{self.spg_id}").json()["report_count"], 2)

    def test_an_admin_verifies_either_format(self):
        pdf_id = self.upload_report(self.spg_id).json()["id"]
        form_id = self.submit_form(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        for report_id in (pdf_id, form_id):
            with self.subTest(report=report_id):
                body = self.client.post(f"/api/v1/spgs/reports/{report_id}/verify").json()
                self.assertEqual(body["status"], "verified")
                self.assertEqual(body["verified_by"], "uid_admin")

    def test_a_member_cannot_verify_either_format(self):
        pdf_id = self.upload_report(self.spg_id).json()["id"]
        form_id = self.submit_form(self.spg_id).json()["id"]
        for report_id in (pdf_id, form_id):
            with self.subTest(report=report_id):
                self.assertEqual(
                    self.client.post(f"/api/v1/spgs/reports/{report_id}/verify").status_code, 403
                )

    def test_neither_format_awards_anything(self):
        self.db.store["users"]["uid_one"]["points"] = {"total": 0}
        before = copy.deepcopy(self.db.documents("users"))
        pdf_id = self.upload_report(self.spg_id).json()["id"]
        form_id = self.submit_form(self.spg_id).json()["id"]
        self.sign_in_as(ADMIN)
        self.client.post(f"/api/v1/spgs/reports/{pdf_id}/verify")
        self.client.post(f"/api/v1/spgs/reports/{form_id}/verify")
        self.assertEqual(self.db.documents("contributions"), {})
        self.assertEqual(self.db.documents("users"), before)


class PDFReportListingFieldTests(SPGAPITestCase):
    def setUp(self):
        super().setUp()
        self.spg_id = self.create_spg()
        self.sign_in_as(MEMBER)

    def test_a_pdf_report_carries_the_listing_fields(self):
        body = self.upload_report(self.spg_id).json()
        self.assertEqual(body["report_format"], "pdf")
        self.assertEqual(body["heading"], HEADING)
        self.assertEqual(body["short_description"], DESCRIPTION)
        self.assertIsNotNone(body["pdf_url"])

    def test_heading_and_short_description_are_required(self):
        for field in ("heading", "short_description"):
            with self.subTest(field=field):
                data = {"heading": HEADING, "short_description": DESCRIPTION}
                del data[field]
                response = self.client.post(
                    f"/api/v1/spgs/{self.spg_id}/reports/pdf",
                    files={"file": ("report.pdf", PDF_BYTES, "application/pdf")},
                    data=data,
                )
                self.assertEqual(response.status_code, 422)

    def test_a_pdf_report_carries_no_form_content(self):
        body = self.upload_report(self.spg_id).json()
        self.assertIsNone(body["summary"])
        self.assertIsNone(body["blockers"])
        self.assertIsNone(body["next_steps"])
        self.assertEqual(body["milestones"], [])

    def test_a_blank_heading_is_rejected_and_stores_nothing(self):
        response = self.client.post(
            f"/api/v1/spgs/{self.spg_id}/reports/pdf",
            files={"file": ("report.pdf", PDF_BYTES, "application/pdf")},
            data={"heading": "   ", "short_description": DESCRIPTION},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.documents("spg_reports"), {})


if __name__ == "__main__":
    unittest.main()
