"""Pydantic schemas and models for the Idea Jar system.

Adheres to server/plan.md, omitting user denormalization in favor of UIDs.
"""

from enum import Enum
from typing import List, Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

# Ideas should have 2 types
# First should be Open to All type (as the Name suggests) We can have it redirect to SPGs Already running this Idea or Create and SPG Button for it
# Second should be Recruitment Ideas, Say Someone wasnt to build something temselves but need i Team they can post it on the Idea Jar This Should be Affiliated with an SPG and needs to have an apply button
class IdeaTrack(str, Enum):
    RESEARCH = "research"
    PRODUCT = "product"
    KAGGLE = "kaggle"
    MISC = "misc"


class IdeaDifficulty(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


# ---------------------------------------------------------------------------
# Stats & Subcollection Documents
# ---------------------------------------------------------------------------

class IdeaStats(BaseModel):
    upvote_count: int = Field(default=0, ge=0)
    views_count: int = Field(default=0, ge=0)
    claims_count: int = Field(default=0, ge=0)


class IdeaUpvoteDocument(BaseModel):
    """Stored in `ideas/{idea_id}/upvotes/{user_uid}`."""
    model_config = ConfigDict(extra="ignore")

    user_uid: str
    created_at: Optional[str] = None


class IdeaUpvoteToggleResponse(BaseModel):
    upvoted: bool
    upvote_count: int


# ---------------------------------------------------------------------------
# Ingestion / Mutation Schemas
# ---------------------------------------------------------------------------
# Idea Prerequisites, Rough Roadmap and Learning outcomes should Ideally be Optional for the First Submit.
# Can be Edited Later though
class IdeaCreate(BaseModel):
    """Payload to submit a new idea."""
    model_config = ConfigDict(extra="forbid")

    title: TitleStr
    description: DescriptionStr
    track: IdeaTrack = IdeaTrack.MISC
    difficulty: Optional[IdeaDifficulty] = None
    prerequisites: List[str] = Field(default_factory=list, max_length=20)
    rough_roadmap: List[str] = Field(default_factory=list, max_length=20)
    learning_outcomes: List[str] = Field(default_factory=list, max_length=20)


class IdeaUpdate(BaseModel):
    """Payload to update an idea (Author or Admin)."""
    model_config = ConfigDict(extra="forbid")

    title: Optional[TitleStr] = None
    description: Optional[DescriptionStr] = None
    track: Optional[IdeaTrack] = None
    difficulty: Optional[IdeaDifficulty] = None
    prerequisites: Optional[List[str]] = Field(default=None, max_length=20)
    rough_roadmap: Optional[List[str]] = Field(default=None, max_length=20)
    learning_outcomes: Optional[List[str]] = Field(default=None, max_length=20)


# ---------------------------------------------------------------------------
# Stored Documents & Public Response Schemas
# ---------------------------------------------------------------------------

class IdeaDocument(BaseModel):
    """Raw Firestore stored document shape at `ideas/{idea_id}`."""
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    description: str
    track: IdeaTrack = IdeaTrack.MISC
    difficulty: Optional[IdeaDifficulty] = None
    prerequisites: List[str] = Field(default_factory=list)
    rough_roadmap: List[str] = Field(default_factory=list)
    learning_outcomes: List[str] = Field(default_factory=list)
    is_verified: bool = False
    created_by_uid: str
    approved_by_uid: Optional[str] = None
    stats: IdeaStats = Field(default_factory=IdeaStats)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    approved_at: Optional[str] = None


class IdeaSummary(BaseModel):
    """Idea card summary in discovery feeds and list views."""
    id: str
    title: str
    description: str
    track: IdeaTrack = IdeaTrack.MISC
    difficulty: Optional[IdeaDifficulty] = None
    is_verified: bool = False
    created_by_uid: str
    approved_by_uid: Optional[str] = None
    stats: IdeaStats = Field(default_factory=IdeaStats)
    created_at: Optional[str] = None
    approved_at: Optional[str] = None
    is_upvoted: Optional[bool] = None


class IdeaDetail(IdeaSummary):
    """Full detail view including roadmap, prerequisites, and learning outcomes."""
    prerequisites: List[str] = Field(default_factory=list)
    rough_roadmap: List[str] = Field(default_factory=list)
    learning_outcomes: List[str] = Field(default_factory=list)
    updated_at: Optional[str] = None


class IdeaListResponse(BaseModel):
    total: int
    items: List[IdeaSummary]
    page: int = 1
    page_size: int = 20
    has_more: bool = False
