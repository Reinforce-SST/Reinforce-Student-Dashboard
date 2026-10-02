"""Learning Resources: admin-curated links, and saving an event's links.

Admins curate the list; members only ever see published resources. Saving an
event's recording, slides and write-up turns each link into a resource that
points back at the event, and saving twice must not duplicate anything.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user, get_optional_current_user
from app.api.v1.endpoints import learning_resources
from tests.helpers.nested_firestore import NestedFirestore

ADMIN = {"uid": "uid_admin", "email": "admin@sst.scaler.com", "admin": True}
MEMBER = {"uid": "uid_member", "email": "member@sst.scaler.com"}

EVENT = {
    "slug": "intro-to-diffusion",
    "title": "Intro to Diffusion",
    "track": "research",
    "status": "published",
    "resources": {
        "recording_url": "https://youtu.be/abc123",
        "slides_url": "https://slides.com/reinforce/diffusion",
        "writeup_url": None,
        "discord_thread_id": "123456789",
    },
}


def resource(**overrides):
    body = {"title": "Fast.ai Practical Deep Learning", "url": "https://course.fast.ai",
            "description": "Top-down deep learning course.", "track": "research",
            "type": "course", "tags": ["deep-learning"]}
    body.update(overrides)
    return body


class LearningResourceTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({"events/evt_diffusion": EVENT})
        target = patch.object(learning_resources, "db", self.db)
        target.start()
        self.addCleanup(target.stop)
        self.user = dict(ADMIN)
        app = FastAPI()
        app.include_router(learning_resources.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def as_member(self):
        self.user = dict(MEMBER)

    def as_visitor(self):
        self.user = None

    def create(self, **overrides):
        response = self.client.post("/api/v1/learning-resources", json=resource(**overrides))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def listed(self, query=""):
        response = self.client.get(f"/api/v1/learning-resources{query}")
        self.assertEqual(response.status_code, 200, response.text)
        return [item["title"] for item in response.json()["resources"]]

    # --- curating -----------------------------------------------------------

    def test_an_admin_adds_a_resource(self):
        body = self.create()
        self.assertTrue(body["id"].startswith("lr_"))
        self.assertEqual((body["track"], body["type"], body["status"]), ("research", "course", "published"))
        self.assertEqual(body["category_id"], "theory")
        self.assertEqual(body["created_by"], "uid_admin")
        self.assertEqual(self.client.get(f"/api/v1/learning-resources/{body['id']}").json()["url"], "https://course.fast.ai")

    def test_members_cannot_curate(self):
        body = self.create()
        self.as_member()
        self.assertEqual(self.client.post("/api/v1/learning-resources", json=resource()).status_code, 403)
        self.assertEqual(self.client.put(f"/api/v1/learning-resources/{body['id']}", json={"title": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/learning-resources/{body['id']}").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/learning-resources/from-event/evt_diffusion").status_code, 403)

    def test_a_link_must_be_a_web_address(self):
        # It is rendered as an href; anything but http(s) could run script.
        for url in ("javascript:alert(1)", "data:text/html,<script>", "ftp://example.com/a", "course.fast.ai", ""):
            with self.subTest(url=url):
                response = self.client.post("/api/v1/learning-resources", json=resource(url=url))
                self.assertEqual(response.status_code, 422)

    def test_unknown_tracks_types_and_unsafe_category_paths_are_refused(self):
        for overrides in ({"track": "misc"}, {"type": "podcast"}, {"category_id": "../outside"}, {"category_id": "theory//cml"}, {"owner": "uid_x"}, {"title": " "}):
            with self.subTest(overrides=overrides):
                response = self.client.post("/api/v1/learning-resources", json=resource(**overrides))
                self.assertEqual(response.status_code, 422)

    def test_a_resource_can_be_placed_in_a_nested_category_path(self):
        body = self.create(category_id="theory/cml/mnist/digit-recognition")
        self.assertEqual(body["category_id"], "theory/cml/mnist/digit-recognition")
        self.assertEqual(body["track"], "research")

    def test_existing_resources_get_a_track_based_folder_when_read(self):
        self.db.store["learning_resources/legacy-research"] = {
            **resource(title="Old research resource"),
            "id": "legacy-research",
        }
        self.db.store["learning_resources/legacy-general"] = {
            **resource(title="Old general resource", track="general"),
            "id": "legacy-general",
        }
        response = self.client.get("/api/v1/learning-resources")
        self.assertEqual(response.status_code, 200)
        by_id = {item["id"]: item for item in response.json()["resources"]}
        self.assertEqual(by_id["legacy-research"]["category_id"], "theory")
        self.assertIsNone(by_id["legacy-general"]["category_id"])

    def test_moving_a_resource_to_the_root_clears_its_folder(self):
        body = self.create(category_id="theory/cml")
        moved = self.client.put(f"/api/v1/learning-resources/{body['id']}", json={"category_id": None})
        self.assertEqual(moved.status_code, 200, moved.text)
        self.assertIsNone(moved.json()["category_id"])

    def test_linking_an_event_records_its_title_and_needs_the_event(self):
        body = self.create(event_id="evt_diffusion")
        self.assertEqual(body["event_title"], "Intro to Diffusion")
        response = self.client.post("/api/v1/learning-resources", json=resource(event_id="evt_missing"))
        self.assertEqual(response.status_code, 422)

    def test_an_admin_edits_only_what_is_sent(self):
        body = self.create(event_id="evt_diffusion")
        response = self.client.put(f"/api/v1/learning-resources/{body['id']}", json={"title": "Fast.ai, part 1"})
        self.assertEqual(response.status_code, 200, response.text)
        edited = response.json()
        self.assertEqual(edited["title"], "Fast.ai, part 1")
        self.assertEqual((edited["url"], edited["event_id"]), ("https://course.fast.ai", "evt_diffusion"))

        unlinked = self.client.put(f"/api/v1/learning-resources/{body['id']}", json={"event_id": None}).json()
        self.assertEqual((unlinked["event_id"], unlinked["event_title"]), (None, None))

    def test_an_edit_cannot_blank_a_required_field(self):
        body = self.create()
        for field in ("title", "url", "track", "type", "status"):
            with self.subTest(field=field):
                response = self.client.put(f"/api/v1/learning-resources/{body['id']}", json={field: None})
                self.assertEqual(response.status_code, 422)
        bad = self.client.put(f"/api/v1/learning-resources/{body['id']}", json={"url": "javascript:alert(1)"})
        self.assertEqual(bad.status_code, 422)

    def test_an_admin_deletes_a_resource(self):
        body = self.create()
        self.assertEqual(self.client.delete(f"/api/v1/learning-resources/{body['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/learning-resources/{body['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/learning-resources/{body['id']}").status_code, 404)

    # --- reading ------------------------------------------------------------

    def test_members_and_visitors_see_only_published_resources(self):
        self.create(title="Published one")
        hidden = self.create(title="Hidden one", status="hidden")
        self.assertEqual(sorted(self.listed()), ["Hidden one", "Published one"])
        for switch in (self.as_member, self.as_visitor):
            with self.subTest(viewer=switch.__name__):
                switch()
                self.assertEqual(self.listed(), ["Published one"])
                self.assertEqual(self.client.get(f"/api/v1/learning-resources/{hidden['id']}").status_code, 404)
                self.assertEqual(self.client.get("/api/v1/learning-resources?status=hidden").status_code, 403)

    def test_event_resource_reads_preserve_link_order_and_hide_hidden_links_from_members(self):
        self.db.store["learning_resources/lr-first"] = {
            **resource(title="First link"), "id": "lr-first", "status": "published"
        }
        self.db.store["learning_resources/lr-hidden"] = {
            **resource(title="Hidden link"), "id": "lr-hidden", "status": "hidden"
        }
        self.db.store["learning_resources/lr-last"] = {
            **resource(title="Last link"), "id": "lr-last", "status": "published"
        }
        self.db.store["events/evt_diffusion"]["resources"]["learning_resource_ids"] = [
            "lr-first", "lr-hidden", "lr-last", "lr-deleted"
        ]

        response = self.client.get("/api/v1/learning-resources/for-event/evt_diffusion")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["id"] for item in response.json()["resources"]],
                         ["lr-first", "lr-hidden", "lr-last"])
        self.db.store["events/evt_other"] = {
            **EVENT,
            "resources": {"learning_resource_ids": ["lr-first"]},
        }
        reused = self.client.get("/api/v1/learning-resources/for-event/evt_other")
        self.assertEqual([item["id"] for item in reused.json()["resources"]], ["lr-first"])

        self.as_visitor()
        response = self.client.get("/api/v1/learning-resources/for-event/evt_diffusion")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["id"] for item in response.json()["resources"]],
                         ["lr-first", "lr-last"])

    def test_event_resource_reads_respect_event_visibility(self):
        self.db.store["events/evt_draft"] = {"title": "Draft", "status": "draft"}
        self.as_visitor()
        self.assertEqual(
            self.client.get("/api/v1/learning-resources/for-event/evt_draft").status_code,
            404,
        )
        self.assertEqual(
            self.client.get("/api/v1/learning-resources/for-event/evt_missing").status_code,
            404,
        )

    def test_the_list_filters_by_track_type_event_and_search(self):
        self.create(title="Kaggle tabular playbook", track="kaggle", type="article", tags=["tabular"])
        self.create(title="Diffusion recording", track="research", type="recording", event_id="evt_diffusion")
        self.create(title="Product teardown", track="product", type="video", description="How Linear ships.")
        self.as_member()
        self.assertEqual(self.listed("?track=kaggle"), ["Kaggle tabular playbook"])
        self.assertEqual(self.listed("?type=recording"), ["Diffusion recording"])
        self.assertEqual(self.listed("?event_id=evt_diffusion"), ["Diffusion recording"])
        self.assertEqual(self.listed("?q=linear"), ["Product teardown"])
        self.assertEqual(self.listed("?q=TABULAR"), ["Kaggle tabular playbook"])
        self.assertEqual(self.listed("?track=kaggle&type=video"), [])

    # --- saving an event's links ---------------------------------------------

    def save_event(self, event_id="evt_diffusion"):
        response = self.client.post(f"/api/v1/learning-resources/from-event/{event_id}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_saving_an_event_creates_one_resource_per_link(self):
        result = self.save_event()
        created = {item["type"]: item for item in result["created"]}
        self.assertEqual(set(created), {"recording", "slides"})
        self.assertEqual(created["recording"]["url"], "https://youtu.be/abc123")
        self.assertEqual(created["slides"]["title"], "Intro to Diffusion: slides")
        for item in created.values():
            self.assertEqual((item["event_id"], item["event_title"], item["track"]),
                             ("evt_diffusion", "Intro to Diffusion", "general"))
            self.assertEqual(item["category_id"], "events/intro-to-diffusion")
        # The Discord thread id is not a link and the empty write-up is not saved.
        self.assertEqual((result["already_saved"], result["skipped"]), ([], []))
        self.as_member()
        self.assertEqual(len(self.listed("?event_id=evt_diffusion")), 2)

    def test_saving_an_event_twice_does_not_duplicate_or_overwrite(self):
        first = self.save_event()
        slides_id = next(item["id"] for item in first["created"] if item["type"] == "slides")
        self.client.put(f"/api/v1/learning-resources/{slides_id}", json={"title": "Diffusion deck"})

        second = self.save_event()
        self.assertEqual(second["created"], [])
        self.assertEqual(sorted(second["already_saved"]), ["recording_url", "slides_url"])
        self.assertEqual(len(self.listed()), 2)
        self.assertEqual(self.client.get(f"/api/v1/learning-resources/{slides_id}").json()["title"], "Diffusion deck")

    def test_a_deleted_event_resource_comes_back_when_saved_again(self):
        first = self.save_event()
        recording_id = next(item["id"] for item in first["created"] if item["type"] == "recording")
        self.client.delete(f"/api/v1/learning-resources/{recording_id}")
        again = self.save_event()
        self.assertEqual([item["type"] for item in again["created"]], ["recording"])

    def test_an_unsafe_event_link_is_skipped(self):
        self.db.store["events/evt_bad"] = {
            "title": "Bad links", "track": "misc",
            "resources": {"recording_url": "javascript:alert(1)", "slides_url": "https://example.com/deck"},
        }
        result = self.save_event("evt_bad")
        self.assertEqual(result["skipped"], ["recording_url"])
        self.assertEqual([item["type"] for item in result["created"]], ["slides"])
        # Events use misc and all; a resource files them under general.
        self.assertEqual(result["created"][0]["track"], "general")

    def test_an_event_with_no_links_saves_nothing(self):
        self.db.store["events/evt_bare"] = {"title": "Bare", "track": "product"}
        self.assertEqual(self.save_event("evt_bare"), {"created": [], "already_saved": [], "skipped": []})

    def test_saving_a_missing_event_is_404(self):
        response = self.client.post("/api/v1/learning-resources/from-event/evt_missing")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
