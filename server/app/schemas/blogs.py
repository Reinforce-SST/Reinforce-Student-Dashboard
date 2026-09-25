"""Pydantic models and schemas for Blogs, Upvotes, and Comments."""

from datetime import timezone
from enum import Enum
import math
import re
from typing import Annotated, List, Optional
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    model_validator,
)

# ---------------------------------------------------------------------------
# Common Type Constraints & Helpers
# ---------------------------------------------------------------------------

NonBlankStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
BlogTitleStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
BlogSummaryStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)]
CommentContentStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
SlugStr = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]


def calculate_reading_time(content: str, words_per_minute: int = 200) -> int:
    """Estimate reading time in minutes based on markdown word count."""
    words = len(re.findall(r"\w+", content))
    return max(1, math.ceil(words / words_per_minute))


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class BlogStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    UNLISTED = "unlisted"


# ---------------------------------------------------------------------------
# 1. Blog Post Schemas
# ---------------------------------------------------------------------------

class BlogStats(BaseModel):
    upvote_count: int = Field(default=0, ge=0)
    comment_count: int = Field(default=0, ge=0)
    view_count: int = Field(default=0, ge=0)


class BlogBase(BaseModel):
    title: BlogTitleStr
    summary: BlogSummaryStr
    cover_image_url: Optional[str] = None
    tags: List[str] = Field(default_factory=list, max_length=10)
    status: BlogStatus = BlogStatus.DRAFT


class BlogCreate(BlogBase):
    """Payload when creating a new blog post."""
    model_config = ConfigDict(extra="forbid")

    slug: Optional[SlugStr] = None  # Auto-derived from title if omitted
    content: NonBlankStr            # Full Markdown content


class BlogUpdate(BaseModel):
    """Payload for updating an existing blog post."""
    model_config = ConfigDict(extra="forbid")

    title: Optional[BlogTitleStr] = None
    slug: Optional[SlugStr] = None
    summary: Optional[BlogSummaryStr] = None
    cover_image_url: Optional[str] = None
    content: Optional[NonBlankStr] = None
    tags: Optional[List[str]] = Field(default=None, max_length=10)
    status: Optional[BlogStatus] = None


class BlogDocument(BaseModel):
    """The raw document shape stored in Firestore at `blogs/{blog_id}`."""
    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    title: str
    summary: str
    content: str
    cover_image_url: Optional[str] = None
    author_uid: str
    tags: List[str] = Field(default_factory=list)
    reading_time_minutes: int = 1
    status: BlogStatus = BlogStatus.DRAFT
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    published_at: Optional[str] = None
    stats: BlogStats = Field(default_factory=BlogStats)


class BlogSummary(BaseModel):
    """Public feed card representation (omits markdown content to save bandwidth)."""
    id: str
    slug: str
    title: str
    summary: str
    cover_image_url: Optional[str] = None
    author_uid: str
    tags: List[str] = Field(default_factory=list)
    reading_time_minutes: int
    status: BlogStatus
    created_at: Optional[str] = None
    published_at: Optional[str] = None
    stats: BlogStats
    is_upvoted: Optional[bool] = None  # Contextual to requesting authenticated user


class BlogDetail(BlogSummary):
    """Full blog detail view including Markdown content."""
    content: str
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# 2. Upvote Schemas
# ---------------------------------------------------------------------------

class BlogUpvoteDocument(BaseModel):
    """Stored in `blogs/{blog_id}/upvotes/{user_uid}`."""
    model_config = ConfigDict(extra="ignore")

    user_uid: str
    created_at: Optional[str] = None


class UpvoteToggleResponse(BaseModel):
    """Response returned when toggling an upvote."""
    upvoted: bool
    upvote_count: int


# ---------------------------------------------------------------------------
# 3. Comment Schemas (1-Layer Threading)
# ---------------------------------------------------------------------------

class CommentCreate(BaseModel):
    """Payload to post a top-level comment or a 1-level reply."""
    model_config = ConfigDict(extra="forbid")

    content: CommentContentStr
    parent_id: Optional[str] = Field(
        default=None,
        description="null for root comments, or the ID of the root comment for replies."
    )
    reply_to_user: Optional[str] = Field(
        default=None,
        description="Username/handle mention if replying within a thread (e.g. '@Jane')."
    )


class CommentUpdate(BaseModel):
    """Payload to edit comment content."""
    model_config = ConfigDict(extra="forbid")

    content: CommentContentStr


class CommentDocument(BaseModel):
    """Stored in `blogs/{blog_id}/comments/{comment_id}`."""
    model_config = ConfigDict(extra="ignore")

    id: str
    blog_id: str
    parent_id: Optional[str] = None
    reply_to_user: Optional[str] = None
    content: str
    author_uid: str
    reply_count: int = 0
    is_edited: bool = False
    is_deleted: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CommentResponse(BaseModel):
    """Public comment representation with masked content on soft delete."""
    id: str
    blog_id: str
    parent_id: Optional[str] = None
    reply_to_user: Optional[str] = None
    content: str
    author_uid: Optional[str] = None
    reply_count: int = 0
    is_edited: bool = False
    is_deleted: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    replies: List["CommentResponse"] = Field(default_factory=list)

    @model_validator(mode="after")
    def _mask_deleted_content(self):
        if self.is_deleted:
            self.content = "[This comment was deleted]"
            self.author_uid = None
        return self


# ---------------------------------------------------------------------------
# 4. List / Pagination Responses
# ---------------------------------------------------------------------------

class BlogListResponse(BaseModel):
    items: List[BlogSummary]
    total: int
    page: int = 1
    page_size: int = 10
    has_more: bool = False


class CommentTreeResponse(BaseModel):
    blog_id: str
    total_comments: int
    comments: List[CommentResponse]