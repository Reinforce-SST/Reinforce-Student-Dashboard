"""Research papers are articles with kind=research_paper and paper details.

The club decided a paper is a kind of article rather than a separate model, so
it shares the feed, detail page, search, upvotes and comments. A paper needs
authors and a link to the paper; an article must not carry paper details.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user, get_optional_current_user
from app.api.v1.endpoints import blogs
from app.services import contributions as contribution_service
from tests.helpers.fake_firestore import run_transaction
from tests.helpers.nested_firestore import NestedFirestore

AUTHOR = {"uid": "uid_author", "email": "author@sst.scaler.com"}

PAPER = {
    "authors": ["Ada Rao", "Vik Iyer"],
    "venue": "NeurIPS 2025 Workshop",
    "paper_url": "https://arxiv.org/abs/2509.01234",
}


def article(**overrides):
    body = {"title": "Evaluating retrieval", "summary": "How we scored a retriever.",
            "content": "## Method", "tags": ["research"], "status": "published"}
    body.update(overrides)
    return body


class ResearchPaperTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({"users/uid_author": {"id": "uid_author"}})
        for target in (patch.object(blogs, "db", self.db),
                       patch.object(contribution_service, "run_in_transaction", run_transaction)):
            target.start()
            self.addCleanup(target.stop)
        self.user = dict(AUTHOR)
        app = FastAPI()
        app.include_router(blogs.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def create(self, **overrides):
        return self.client.post("/api/v1/blogs", json=article(**overrides))

    def test_an_article_is_the_default_kind(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual((response.json()["kind"], response.json()["paper"]), ("article", None))

    def test_a_research_paper_keeps_its_details(self):
        response = self.create(kind="research_paper", paper=PAPER)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["kind"], "research_paper")
        self.assertEqual(body["paper"], PAPER)
        fetched = self.client.get(f"/api/v1/blogs/{body['slug']}").json()
        self.assertEqual(fetched["paper"], PAPER)

    def test_a_research_paper_needs_its_details(self):
        self.assertEqual(self.create(kind="research_paper").status_code, 422)
        self.assertEqual(self.create(kind="research_paper", paper={**PAPER, "authors": []}).status_code, 422)

    def test_an_article_cannot_carry_paper_details(self):
        self.assertEqual(self.create(kind="article", paper=PAPER).status_code, 422)

    def test_a_paper_link_must_be_a_web_address(self):
        # It is rendered as a link; anything but http(s) could run script.
        for url in ("javascript:alert(1)", "data:text/html,<script>", "ftp://example.com/p.pdf", "arxiv.org/abs/1", ""):
            with self.subTest(url=url):
                self.assertEqual(self.create(kind="research_paper", paper={**PAPER, "paper_url": url}).status_code, 422)

    def test_the_feed_filters_by_kind(self):
        self.create(title="An ordinary article")
        self.create(title="A real paper", kind="research_paper", paper=PAPER)
        kinds = lambda **params: sorted(item["title"] for item in self.client.get("/api/v1/blogs", params=params).json()["items"])
        self.assertEqual(kinds(), ["A real paper", "An ordinary article"])
        self.assertEqual(kinds(kind="research_paper"), ["A real paper"])
        self.assertEqual(kinds(kind="article"), ["An ordinary article"])

    def test_an_article_stored_before_kinds_existed_reads_as_an_article(self):
        self.db.store["blogs/legacy"] = {
            "id": "legacy", "slug": "legacy", "title": "Legacy post", "summary": "Written earlier.",
            "content": "Body.", "author_uid": "uid_author", "tags": [], "status": "published",
            "stats": {"upvote_count": 0, "comment_count": 0, "view_count": 0},
        }
        body = self.client.get("/api/v1/blogs/legacy").json()
        self.assertEqual((body["kind"], body["paper"]), ("article", None))
        self.assertEqual([item["id"] for item in self.client.get("/api/v1/blogs", params={"kind": "article"}).json()["items"]], ["legacy"])

    def test_an_update_can_turn_an_article_into_a_paper(self):
        blog_id = self.create().json()["id"]
        self.assertEqual(self.client.put(f"/api/v1/blogs/{blog_id}", json={"kind": "research_paper"}).status_code, 422)
        updated = self.client.put(f"/api/v1/blogs/{blog_id}", json={"kind": "research_paper", "paper": PAPER})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["paper"], PAPER)
        # Back to an article drops the paper details rather than leaving them stale.
        reverted = self.client.put(f"/api/v1/blogs/{blog_id}", json={"kind": "article"})
        self.assertEqual((reverted.json()["kind"], reverted.json()["paper"]), ("article", None))


if __name__ == "__main__":
    unittest.main()
