"""Unit tests for Blog Community Features: Upvotes, Threaded Comments & Moderation.

Covers:
- Toggle upvote on a blog with counter persistence (POST /blogs/{id}/upvote)
- Posting top-level comments (POST /blogs/{id}/comments)
- Posting 1-level nested replies (parent_id)
- Fetching comment tree (GET /blogs/{id}/comments)
- Soft deleting comments with content masking (DELETE /blogs/{id}/comments/{comment_id})
- Permission checks: non-author non-admin cannot delete someone else's comment
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.security import get_current_user, get_optional_current_user
from app.api.v1.endpoints import blogs
from tests.helpers.nested_firestore import NestedFirestore


AUTHOR = {"uid": "author-uid", "email": "author@sst.scaler.com", "name": "Author User"}
COMMENTER_A = {"uid": "commenter-a-uid", "email": "ca@sst.scaler.com", "name": "Commenter A"}
COMMENTER_B = {"uid": "commenter-b-uid", "email": "cb@sst.scaler.com", "name": "Commenter B"}
ADMIN = {"uid": "admin-uid", "email": "admin@sst.scaler.com", "admin": True, "name": "Lead Admin"}


class BlogCommunityTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        self.blog_patch = patch.object(blogs, "db", self.db)
        self.blog_patch.start()
        self.addCleanup(self.blog_patch.stop)

        self.txn_patch = patch("google.cloud.firestore.transactional", lambda func: func)
        self.txn_patch.start()
        self.addCleanup(self.txn_patch.stop)

        self.db.transaction = lambda: NestedFirestoreTransaction(self.db)

        # Seed Users
        for u in [AUTHOR, COMMENTER_A, COMMENTER_B, ADMIN]:
            self.db.collection("users").document(u["uid"]).set({
                "id": u["uid"],
                "full_name": u["name"],
                "email": u["email"],
                "is_member": True,
            })

        # Seed a published blog post
        self.blog_id = "blog_transformer_interpretability"
        self.db.collection("blogs").document(self.blog_id).set({
            "id": self.blog_id,
            "slug": "transformer-interpretability",
            "title": "Interpreting Attention Heads",
            "summary": "A deep dive into induction heads in transformers.",
            "content": "## Introduction\nTransformer models rely heavily on attention...",
            "author_uid": AUTHOR["uid"],
            "status": "published",
            "stats": {"upvote_count": 0, "comment_count": 0, "view_count": 0},
            "created_at": "2026-01-01T10:00:00Z",
        })

        self.user = dict(COMMENTER_A)

        app = FastAPI()
        app.include_router(blogs.router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def as_commenter_a(self):
        self.user = dict(COMMENTER_A)

    def as_commenter_b(self):
        self.user = dict(COMMENTER_B)

    def as_admin(self):
        self.user = dict(ADMIN)

    def test_blog_upvote_toggle_and_counter(self):
        # Commenter A upvotes
        self.as_commenter_a()
        res1 = self.client.post(f"/api/v1/blogs/{self.blog_id}/upvote").json()
        self.assertTrue(res1["upvoted"])
        self.assertEqual(res1["upvote_count"], 1)

        # Commenter B upvotes
        self.as_commenter_b()
        res2 = self.client.post(f"/api/v1/blogs/{self.blog_id}/upvote").json()
        self.assertTrue(res2["upvoted"])
        self.assertEqual(res2["upvote_count"], 2)

        # Commenter A toggles again -> removes upvote
        self.as_commenter_a()
        res3 = self.client.post(f"/api/v1/blogs/{self.blog_id}/upvote").json()
        self.assertFalse(res3["upvoted"])
        self.assertEqual(res3["upvote_count"], 1)

    def test_post_root_comment_and_tree_retrieval(self):
        self.as_commenter_a()
        payload = {"content": "Fascinating writeup on induction heads!"}
        res = self.client.post(f"/api/v1/blogs/{self.blog_id}/comments", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        comment_data = res.json()
        comment_id = comment_data["id"]
        self.assertEqual(comment_data["content"], "Fascinating writeup on induction heads!")
        self.assertEqual(comment_data["author_uid"], COMMENTER_A["uid"])
        self.assertIsNone(comment_data["parent_id"])

        # Fetch comments tree
        tree_res = self.client.get(f"/api/v1/blogs/{self.blog_id}/comments")
        self.assertEqual(tree_res.status_code, 200)
        tree = tree_res.json()
        self.assertEqual(tree["total_comments"], 1)
        self.assertEqual(tree["comments"][0]["id"], comment_id)

    def test_nested_comment_reply(self):
        # 1. Post root comment by A
        self.as_commenter_a()
        root = self.client.post(f"/api/v1/blogs/{self.blog_id}/comments", json={
            "content": "Does this generalize to larger language models?",
        }).json()
        root_id = root["id"]

        # 2. Post reply by B with parent_id
        self.as_commenter_b()
        reply = self.client.post(f"/api/v1/blogs/{self.blog_id}/comments", json={
            "content": "Yes, Anthropic demonstrated induction heads up to 52B parameters.",
            "parent_id": root_id,
            "reply_to_user": "@Commenter A",
        }).json()
        reply_id = reply["id"]
        self.assertEqual(reply["parent_id"], root_id)

        # 3. Fetch tree: reply should nest inside root's replies list
        tree = self.client.get(f"/api/v1/blogs/{self.blog_id}/comments").json()
        self.assertEqual(tree["total_comments"], 2)
        root_node = tree["comments"][0]
        self.assertEqual(root_node["id"], root_id)
        self.assertEqual(len(root_node["replies"]), 1)
        self.assertEqual(root_node["replies"][0]["id"], reply_id)

    def test_soft_delete_comment_masks_content(self):
        self.as_commenter_a()
        root = self.client.post(f"/api/v1/blogs/{self.blog_id}/comments", json={
            "content": "Typo in this comment, deleting now.",
        }).json()
        comment_id = root["id"]

        # Author deletes own comment
        del_res = self.client.delete(f"/api/v1/blogs/{self.blog_id}/comments/{comment_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertIn("deleted successfully", del_res.json()["message"])

        # Fetch tree: comment is marked deleted and content is masked
        tree = self.client.get(f"/api/v1/blogs/{self.blog_id}/comments").json()
        comment_node = tree["comments"][0]
        self.assertTrue(comment_node["is_deleted"])
        self.assertEqual(comment_node["content"], "[This comment was deleted]")
        self.assertIsNone(comment_node["author_uid"])

    def test_non_author_cannot_delete_comment_unless_admin(self):
        self.as_commenter_a()
        root = self.client.post(f"/api/v1/blogs/{self.blog_id}/comments", json={
            "content": "Commenter A's opinion.",
        }).json()
        comment_id = root["id"]

        # Commenter B tries to delete Commenter A's comment
        self.as_commenter_b()
        fail_res = self.client.delete(f"/api/v1/blogs/{self.blog_id}/comments/{comment_id}")
        self.assertEqual(fail_res.status_code, 403)

        # Admin can delete comment
        self.as_admin()
        ok_res = self.client.delete(f"/api/v1/blogs/{self.blog_id}/comments/{comment_id}")
        self.assertEqual(ok_res.status_code, 200)


class NestedFirestoreTransaction:
    """Mock transaction wrapper for NestedFirestore."""
    def __init__(self, db):
        self.db = db
        self._read_only = False
        self._id = b"fake-transaction"
        self._max_attempts = 1

    def _begin(self, *args, **kwargs):
        self._id = b"fake-transaction"

    def _commit(self, *args, **kwargs):
        pass

    def _rollback(self, *args, **kwargs):
        pass

    def _clean_up(self, *args, **kwargs):
        pass

    def get(self, ref):
        return ref.get()

    def set(self, ref, data):
        ref.set(data)

    def update(self, ref, data):
        ref.update(data)

    def delete(self, ref):
        ref.delete()


if __name__ == "__main__":
    unittest.main()
