"""Unit tests for Idea Jar schemas in app/schemas/ideas.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest
from pydantic import ValidationError

from app.schemas.ideas import (
    IdeaCreate,
    IdeaDetail,
    IdeaDifficulty,
    IdeaDocument,
    IdeaListResponse,
    IdeaStats,
    IdeaSummary,
    IdeaTrack,
    IdeaUpdate,
    IdeaUpvoteToggleResponse,
)


def sample_idea_create(**overrides):
    data = {
        "title": "Low-rank Adaptation on Edge Devices",
        "description": "Evaluate LoRA and QLoRA on Raspberry Pi 5 with quantization.",
        "difficulty": IdeaDifficulty.INTERMEDIATE,
        "track": IdeaTrack.RESEARCH,
        "prerequisites": ["Python", "PyTorch", "Quantization basics"],
        "rough_roadmap": ["Setup baseline", "Apply 4-bit quant", "Benchmark latency"],
        "learning_outcomes": ["Understand memory footprint of LLMs", "Profile on ARM hardware"],
    }
    data.update(overrides)
    return data


class IdeaCreateTests(unittest.TestCase):
    def test_valid_idea_create(self):
        idea = IdeaCreate.model_validate(sample_idea_create())
        self.assertEqual(idea.title, "Low-rank Adaptation on Edge Devices")
        self.assertEqual(idea.difficulty, IdeaDifficulty.INTERMEDIATE)
        self.assertEqual(len(idea.prerequisites), 3)

    def test_title_and_description_bounds(self):
        for bad_title in ("", "  ", "t" * 201):
            with self.subTest(title=bad_title):
                with self.assertRaises(ValidationError):
                    IdeaCreate.model_validate(sample_idea_create(title=bad_title))


class IdeaUpdateTests(unittest.TestCase):
    def test_partial_update(self):
        update = IdeaUpdate.model_validate({"difficulty": IdeaDifficulty.ADVANCED})
        self.assertEqual(update.model_dump(exclude_unset=True), {"difficulty": "advanced"})


class IdeaDocumentTests(unittest.TestCase):
    def test_stored_idea_document(self):
        doc = {
            "id": "idea_001",
            "title": "Low-rank Adaptation on Edge Devices",
            "description": "Evaluate LoRA on edge devices.",
            "difficulty": "intermediate",
            "track": "research",
            "prerequisites": ["Python"],
            "rough_roadmap": ["Benchmark"],
            "learning_outcomes": ["Profile LLMs"],
            "is_verified": True,
            "created_by_uid": "user_001",
            "approved_by_uid": "admin_001",
            "approved_at": "2026-09-24T10:00:00Z",
            "stats": {"upvote_count": 12, "views_count": 45, "claims_count": 0},
            "created_at": "2026-09-24T09:00:00Z",
            "updated_at": "2026-09-24T10:00:00Z",
        }
        idea = IdeaDocument.model_validate(doc)
        self.assertEqual(idea.id, "idea_001")
        self.assertTrue(idea.is_verified)
        self.assertEqual(idea.stats.upvote_count, 12)
        self.assertEqual(idea.created_by_uid, "user_001")
        self.assertEqual(idea.approved_by_uid, "admin_001")


if __name__ == "__main__":
    unittest.main()
