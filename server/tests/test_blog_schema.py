"""Unit tests for the Blog schemas in app/schemas/blogs.py.

No Firebase, no network. Every identifier is synthetic.
"""

import unittest
from pydantic import ValidationError

from app.schemas.blogs import (
    BlogCreate,
    BlogDocument,
    BlogStatus,
    BlogSummary,
    BlogUpdate,
    CommentCreate,
    UpvoteToggleResponse,
    calculate_reading_time,
)


def sample_blog(**overrides):
    data = {
        "title": "An Introduction to Reinforcement Learning with PPO",
        "summary": "A comprehensive walkthrough of Proximal Policy Optimization with PyTorch baselines.",
        "content": "# Intro to PPO\n\nPolicy gradient algorithms are foundational to RL...",
        "tags": ["machine-learning", "reinforcement-learning", "pytorch"],
        "cover_image_url": "https://example.com/cover.png",
        "status": BlogStatus.DRAFT,
    }
    data.update(overrides)
    return data


class BlogCreateTests(unittest.TestCase):
    def test_valid_create(self):
        created = BlogCreate.model_validate(sample_blog())
        self.assertEqual(created.title, "An Introduction to Reinforcement Learning with PPO")
        self.assertEqual(created.tags, ["machine-learning", "reinforcement-learning", "pytorch"])
        self.assertEqual(created.status, BlogStatus.DRAFT)

    def test_title_must_be_3_to_200_characters(self):
        for bad in ("", "  ", "ab", "t" * 201):
            with self.subTest(length=len(bad)):
                with self.assertRaises(ValidationError):
                    BlogCreate.model_validate(sample_blog(title=bad))

    def test_summary_must_be_10_to_500_characters(self):
        for bad in ("", "   ", "too short", "s" * 501):
            with self.subTest(length=len(bad)):
                with self.assertRaises(ValidationError):
                    BlogCreate.model_validate(sample_blog(summary=bad))

    def test_empty_content_rejected(self):
        for bad in ("", "   "):
            with self.subTest(content=bad):
                with self.assertRaises(ValidationError):
                    BlogCreate.model_validate(sample_blog(content=bad))


class BlogUpdateTests(unittest.TestCase):
    def test_partial_update_keeps_only_sent_fields(self):
        update = BlogUpdate.model_validate({"title": "A Better Guide to Deep Q-Networks"})
        self.assertEqual(update.model_dump(exclude_unset=True), {"title": "A Better Guide to Deep Q-Networks"})

    def test_empty_update_is_valid(self):
        self.assertEqual(BlogUpdate.model_validate({}).model_dump(exclude_unset=True), {})


class BlogCommentTests(unittest.TestCase):
    def test_valid_comment_create(self):
        comment = CommentCreate.model_validate({
            "content": "Great post! Could you explain the clipping ratio epsilon further?",
            "parent_id": None,
        })
        self.assertIsNone(comment.parent_id)
        self.assertTrue(len(comment.content) > 10)

    def test_empty_comment_rejected(self):
        with self.assertRaises(ValidationError):
            CommentCreate.model_validate({"content": "   "})


class ReadingTimeCalculationTests(unittest.TestCase):
    def test_reading_time_calculation(self):
        # 400 words should be ~2 minutes at 200 WPM
        text = "word " * 400
        self.assertEqual(calculate_reading_time(text), 2)

        # Minimum 1 minute
        self.assertEqual(calculate_reading_time("A short note."), 1)


if __name__ == "__main__":
    unittest.main()
