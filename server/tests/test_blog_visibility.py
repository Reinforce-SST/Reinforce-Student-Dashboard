"""Unpublished articles stay private.

GET /blogs took ?status= from anyone, unauthenticated, so ?status=draft listed
every author's drafts. GET /blogs/{slug} returned a blog whatever its status, so
a draft was readable by anyone who guessed its slug, which is derived from the
title. Drafts and archived articles are now visible to their author and admins
only; unlisted articles stay reachable by link but are never listed to others.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user, get_optional_current_user
from app.api.v1.endpoints import blogs
from tests.helpers.nested_firestore import NestedFirestore

AUTHOR = {"uid": "uid_author", "email": "author@sst.scaler.com"}
OTHER = {"uid": "uid_other", "email": "other@sst.scaler.com"}
ADMIN = {"uid": "uid_admin", "email": "admin@sst.scaler.com", "admin": True}


def blog(blog_id, status, author="uid_author"):
    return {
        "id": blog_id, "slug": blog_id, "title": blog_id.title(), "summary": "Summary.",
        "content": "Body.", "author_uid": author, "tags": [], "reading_time_minutes": 1,
        "status": status, "created_at": "2026-09-20T10:00:00+00:00",
        "published_at": "2026-09-20T10:00:00+00:00" if status == "published" else None,
        "stats": {"upvote_count": 0, "comment_count": 0, "view_count": 0},
    }


class BlogVisibilityTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore({
            "blogs/live": blog("live", "published"),
            "blogs/draft-mine": blog("draft-mine", "draft"),
            "blogs/draft-theirs": blog("draft-theirs", "draft", author="uid_other"),
            "blogs/old": blog("old", "archived"),
            "blogs/by-link": blog("by-link", "unlisted"),
        })
        target = patch.object(blogs, "db", self.db)
        target.start()
        self.addCleanup(target.stop)
        self.user = None
        app = FastAPI()
        app.include_router(blogs.router, prefix="/api/v1")
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def listed(self, **params):
        response = self.client.get("/api/v1/blogs", params=params)
        return response.status_code, sorted(item["id"] for item in response.json().get("items", [])) if response.status_code == 200 else None

    def test_the_public_feed_is_published_articles_only(self):
        self.assertEqual(self.listed(), (200, ["live"]))

    def test_anonymous_callers_cannot_list_unpublished_articles(self):
        for status in ("draft", "archived", "unlisted"):
            with self.subTest(status=status):
                self.assertEqual(self.listed(status=status)[0], 401)

    def test_a_member_lists_only_their_own_unpublished_articles(self):
        self.user = dict(AUTHOR)
        self.assertEqual(self.listed(status="draft"), (200, ["draft-mine"]))

    def test_an_admin_lists_every_draft(self):
        self.user = dict(ADMIN)
        self.assertEqual(self.listed(status="draft"), (200, ["draft-mine", "draft-theirs"]))

    def test_a_draft_is_not_found_for_anyone_but_its_author_or_an_admin(self):
        for who, expected in ((None, 404), (OTHER, 404), (AUTHOR, 200), (ADMIN, 200)):
            with self.subTest(who=who and who["uid"]):
                self.user = dict(who) if who else None
                self.assertEqual(self.client.get("/api/v1/blogs/draft-mine").status_code, expected)

    def test_an_archived_article_is_private_too(self):
        self.assertEqual(self.client.get("/api/v1/blogs/old").status_code, 404)

    def test_an_unlisted_article_is_reachable_by_link(self):
        self.assertEqual(self.client.get("/api/v1/blogs/by-link").status_code, 200)

    def test_a_refused_read_does_not_count_a_view(self):
        self.client.get("/api/v1/blogs/draft-theirs")
        self.assertEqual(self.db.store["blogs/draft-theirs"]["stats"]["view_count"], 0)


if __name__ == "__main__":
    unittest.main()
