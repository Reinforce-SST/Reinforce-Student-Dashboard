"""Pydantic models and schemas for Contributions.

A contribution is the auditable ledger record behind member points.
"""

from datetime import timezone
from enum import Enum
from typing import Annotated, List, Literal, Optional
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    model_validator,
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]


def _exact_int(value):
    if type(value) is not int:
        raise ValueError("must be an integer")
    return value


class ContributionTrack(str, Enum):
    KAGGLE = "kaggle"
    PRODUCT = "product"
    RESEARCH = "research"
    MISC = "misc"


class ContributionCategory(str, Enum):
    # Frozen pending a team decision: `participation` existed before and is not
    # in this list. Do not add or remove a value without that decision.
    ACHIEVEMENT = "achievement"
    PROJECT_WORK = "project_work"
    TEACHING = "teaching"
    MENTORSHIP = "mentorship"
    CONTENT = "content"
    ORGANIZING = "organizing"
    SERVICE = "service"
    OTHER = "other"


class ContributionSourceType(str, Enum):
    PROJECT = "project"
    BLOG = "blog"
    TROPHY = "trophy_item"


class ContributionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"


class ContributionSource(BaseModel):
    """The entity a contribution relates to."""
    model_config = ConfigDict(extra="forbid")

    type: ContributionSourceType
    id: NonBlankStr


class ContributionDetails(BaseModel):
    """Shared fields for awarding and recording contributions."""
    model_config = ConfigDict(extra="forbid")

    track: ContributionTrack = ContributionTrack.MISC
    category: ContributionCategory
    title: TitleStr
    description: Optional[DescriptionStr] = None
    points: int = Field(strict=True, ge=0)
    source: Optional[ContributionSource] = None
    event_id: Optional[NonBlankStr] = None
    occurred_at: UtcDatetime

    @model_validator(mode="after")
    def _other_requires_description(self):
        if self.category is ContributionCategory.OTHER and self.description is None:
            raise ValueError("description is required when category is 'other'")
        return self


class AdminAwardUser(ContributionDetails):
    """Payload for POST /contributions/award/user/{user_id}.

    The recipient comes from the path. Every server-owned field — including
    `deduplication_key`, which the server derives — is rejected, not ignored.
    An optional `spg_id` records the SPG the work was done as.
    """

    spg_id: Optional[NonBlankStr] = None


class AdminAwardSPG(ContributionDetails):
    """Payload for POST /contributions/award/spg/{spg_id}.

    The SPG comes from the path; the server resolves its members and writes one
    record each, so `spg_id` in the body is rejected too.
    """


class AdminRevokeRecord(BaseModel):
    """Payload for PATCH /contributions/{record_id}/revoke."""
    model_config = ConfigDict(extra="forbid")

    status_reason: NonBlankStr


class ContributionBase(ContributionDetails):
    # The Firebase UID of the member credited with the contribution.
    user_id: NonBlankStr
    spg_id: Optional[NonBlankStr] = None


class ContributionCreate(ContributionBase):
    """Input from a trusted recorder (admin/bot)."""


_LIFECYCLE_FIELDS = ("reviewed_by", "reviewed_at", "revoked_by", "revoked_at", "status_reason")
_REQUIRED_LIFECYCLE_FIELDS = {
    ContributionStatus.PENDING: frozenset(),
    ContributionStatus.APPROVED: frozenset({"reviewed_by", "reviewed_at"}),
    ContributionStatus.REJECTED: frozenset({"reviewed_by", "reviewed_at", "status_reason"}),
    ContributionStatus.REVOKED: frozenset(_LIFECYCLE_FIELDS),
}


class ContributionRecord(ContributionBase):
    """A recorded contribution with its server-owned lifecycle metadata.

    `status` is explicit: a record is never approved by default. Unknown fields
    are rejected rather than dropped, so drift fails loudly.
    """

    id: NonBlankStr
    schema_version: Annotated[Literal[1], BeforeValidator(_exact_int)] = 1
    status: ContributionStatus
    recorded_by: NonBlankStr
    created_at: UtcDatetime
    reviewed_by: Optional[NonBlankStr] = None
    reviewed_at: Optional[UtcDatetime] = None
    revoked_by: Optional[NonBlankStr] = None
    revoked_at: Optional[UtcDatetime] = None
    status_reason: Optional[NonBlankStr] = None
    deduplication_key: Optional[NonBlankStr] = None

    @model_validator(mode="after")
    def _lifecycle_matches_status(self):
        required = _REQUIRED_LIFECYCLE_FIELDS[self.status]
        for field in _LIFECYCLE_FIELDS:
            if (getattr(self, field) is not None) != (field in required):
                rule = "required" if field in required else "not allowed"
                raise ValueError(f"{field} is {rule} when status is '{self.status.value}'")
        if self.reviewed_at is not None and self.reviewed_at < self.created_at:
            raise ValueError("reviewed_at cannot be earlier than created_at")
        if self.revoked_at is not None and self.revoked_at < self.reviewed_at:
            raise ValueError("revoked_at cannot be earlier than reviewed_at")
        return self

    # Derived from `status` and never stored, so neither can drift from it.

    @property
    def counts_toward_leaderboard(self) -> bool:
        return self.status is ContributionStatus.APPROVED

    @property
    def is_verified(self) -> bool:
        """Reviewed and approved by the club — not a judgement on the content
        itself, which a blog or other entity would own."""
        return self.status is ContributionStatus.APPROVED


class ContributionPage(BaseModel):
    """A bounded page of contributions. `next_cursor` is null on the last page."""

    model_config = ConfigDict(extra="forbid")

    items: List[ContributionRecord] = Field(default_factory=list)
    next_cursor: Optional[NonBlankStr] = None


class SPGAwardResponse(BaseModel):
    """Result of awarding every member of one SPG."""

    model_config = ConfigDict(extra="forbid")

    spg_id: NonBlankStr
    points_per_member: int = Field(strict=True, ge=0)
    awarded_count: int = Field(strict=True, ge=0)
    user_ids: List[NonBlankStr] = Field(default_factory=list)
    contribution_ids: List[NonBlankStr] = Field(default_factory=list)


class LeaderboardEntry(BaseModel):
    """One row of the contribution leaderboard, summed from approved records."""

    model_config = ConfigDict(extra="forbid")

    user_id: NonBlankStr
    points: int = Field(strict=True, ge=0)
    contribution_count: int = Field(strict=True, ge=0)


# Backwards compatibility aliases. `ContributionListResponse` was a second page
# model for the same resource; `ContributionPage` is the one the API returns.
AdminAwardStudent = AdminAwardUser
ContributionListResponse = ContributionPage
