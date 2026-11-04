"""Tests verifying that admins can edit ideas both before and after they are published."""

import unittest
from fastapi import HTTPException
from app.api.v1.endpoints import ideas
from app.schemas.ideas import IdeaUpdate, IdeaTrack, IdeaDifficulty
from tests.helpers.nested_firestore import NestedFirestore

ADMIN = {"uid": "uid-admin", "email": "admin@sst.scaler.com", "is_admin": True}
MEMBER = {"uid": "uid-member", "email": "student@sst.scaler.com", "name": "Aryan Mishra", "is_admin": False}


class AdminIdeaEditTests(unittest.TestCase):
    def setUp(self):
        self.db = NestedFirestore()
        ideas.db = self.db

        # Seed admin and member users
        self.db.collection("users").document(ADMIN["uid"]).set({
            "id": ADMIN["uid"],
            "full_name": "Admin Lead",
            "email": ADMIN["email"],
            "is_admin": True,
        })
        self.db.collection("users").document(MEMBER["uid"]).set({
            "id": MEMBER["uid"],
            "full_name": "Aryan Mishra",
            "email": MEMBER["email"],
            "batch_year": 2027,
            "avatar_url": "https://example.com/avatar.png",
        })

    def test_admin_edit_before_publishing(self):
        """Admin can edit an idea while it is still pending in tickets collection."""
        ticket_id = "ticket-idea-1"
        self.db.collection("tickets").document(ticket_id).set({
            "id": ticket_id,
            "category": "idea_jar",
            "status": "open",
            "created_by_uid": MEMBER["uid"],
            "title": "Initial Draft Title",
            "description": "Initial draft description",
            "fields": {
                "track": "misc",
                "difficulty": "beginner",
            },
            "created_at": "2026-10-01T10:00:00Z",
        })

        # Admin edits the pending proposal before approval
        updated = ideas.update_idea(
            ticket_id,
            payload=IdeaUpdate(
                title="Refined Draft Title",
                description="Updated **markdown** description with details.",
                track=IdeaTrack.RESEARCH,
                difficulty=IdeaDifficulty.INTERMEDIATE,
                prerequisites=["Python", "PyTorch"],
                rough_roadmap=["Phase 1: Research", "Phase 2: Code"],
            ),
            admin=ADMIN,
        )

        self.assertEqual(updated.title, "Refined Draft Title")
        self.assertEqual(updated.description, "Updated **markdown** description with details.")
        self.assertEqual(updated.track, IdeaTrack.RESEARCH)
        self.assertEqual(updated.difficulty, IdeaDifficulty.INTERMEDIATE)
        self.assertEqual(updated.prerequisites, ["Python", "PyTorch"])
        self.assertEqual(len(updated.rough_roadmap), 2)
        # Verify creator_profile was attached
        self.assertIsNotNone(updated.creator_profile)
        self.assertEqual(updated.creator_profile.full_name, "Aryan Mishra")
        self.assertEqual(updated.creator_profile.avatar_url, "https://example.com/avatar.png")

    def test_admin_edit_after_publishing(self):
        """Admin can edit an idea after it has been approved and published to ideas collection."""
        idea_id = "idea-published-1"
        self.db.collection("ideas").document(idea_id).set({
            "id": idea_id,
            "title": "Live Published Idea",
            "description": "Old live description",
            "track": "product",
            "difficulty": "beginner",
            "is_verified": True,
            "is_approved": True,
            "created_by_uid": MEMBER["uid"],
            "approved_by_uid": ADMIN["uid"],
            "stats": {"upvote_count": 5, "views_count": 20, "claims_count": 1},
            "created_at": "2026-10-01T10:00:00Z",
            "approved_at": "2026-10-02T10:00:00Z",
        })

        # Admin edits the published idea
        updated = ideas.update_idea(
            idea_id,
            payload=IdeaUpdate(
                title="Updated Published Idea Title",
                description="Enhanced description with `# Markdown` and checklist.",
                difficulty=IdeaDifficulty.ADVANCED,
                learning_outcomes=["Outcome A", "Outcome B"],
            ),
            admin=ADMIN,
        )

        self.assertEqual(updated.title, "Updated Published Idea Title")
        self.assertIn("# Markdown", updated.description)
        self.assertEqual(updated.difficulty, IdeaDifficulty.ADVANCED)
        self.assertEqual(updated.learning_outcomes, ["Outcome A", "Outcome B"])
        self.assertEqual(updated.stats.upvote_count, 5)
        # Verify creator profile resolution
        self.assertIsNotNone(updated.creator_profile)
        self.assertEqual(updated.creator_profile.full_name, "Aryan Mishra")

    def test_list_ideas_populates_creator_profile(self):
        """Listing approved ideas resolves and attaches creator profile with avatar."""
        idea_id = "idea-list-1"
        self.db.collection("ideas").document(idea_id).set({
            "id": idea_id,
            "title": "Autonomous Coding Agent",
            "description": "Agent system for pairing.",
            "track": "research",
            "difficulty": "intermediate",
            "is_verified": True,
            "is_approved": True,
            "created_by_uid": MEMBER["uid"],
            "created_at": "2026-10-01T10:00:00Z",
            "approved_at": "2026-10-02T10:00:00Z",
            "stats": {"upvote_count": 10},
        })

        res = ideas.list_ideas()
        self.assertGreaterEqual(res.total, 1)
        found = next((i for i in res.items if i.id == idea_id), None)
        self.assertIsNotNone(found)
        self.assertIsNotNone(found.creator_profile)
        self.assertEqual(found.creator_profile.full_name, "Aryan Mishra")
        self.assertEqual(found.creator_profile.avatar_url, "https://example.com/avatar.png")


if __name__ == "__main__":
    unittest.main()
