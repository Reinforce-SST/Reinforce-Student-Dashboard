"""Proposed contribution schema — the auditable record behind points.

Not yet part of the Firestore data contract: nothing stores these records, and
nothing here reads or writes Firestore. See docs/CONTRIBUTION_SCHEMA.md.

A contribution is one piece of credited activity. Points are never kept as a
running total; a leaderboard is the sum of `points` over APPROVED records,
grouped by `contributor_id`, so it can always be recalculated from the records.

Events and SPGs are workflow context, referenced by `event_id` and `spg_id`.
`source` is only for the thing a contribution is about or produced, so each
relationship has exactly one representation.
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

# Timezone required and normalised to UTC. JSON uses isoformat(), "+00:00",
# matching the ISO strings the users collection already holds; Pydantic's
# default would emit "Z" instead.
UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]


def _exact_int(value):
    # Literal[1] alone accepts True and 1.0, because both compare equal to 1.
    if type(value) is not int:
        raise ValueError("must be an integer")
    return value


class ContributionCategory(str, Enum):
    """What the contributor did. What it relates to is `source`."""

    PARTICIPATION = "participation"  # attended or took part
    ACHIEVEMENT = "achievement"  # placed, won or was recognised
    ORGANIZING = "organizing"  # organised or helped run an event or initiative
    TEACHING = "teaching"  # delivered a workshop, talk or tutorial
    MENTORSHIP = "mentorship"  # ongoing guidance of students or an SPG
    PROJECT_WORK = "project_work"  # contributed to an SPG or project
    CONTENT = "content"  # wrote or added material such as blogs or papers
    SERVICE = "service"  # club operations and community help
    OTHER = "other"  # anything else; requires a description


class ContributionSourceType(str, Enum):
    """What a contribution is about or produced. Never an event or SPG: those
    are `event_id` and `spg_id`."""

    PROJECT = "project"
    BLOG = "blog"
    TROPHY = "trophy_item" # Changed Library to Trophy because Prez said so


class ContributionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"


class ContributionSource(BaseModel):
    """The entity a contribution relates to. Its existence is not checked here."""

    model_config = ConfigDict(extra="forbid")

    type: ContributionSourceType
    id: NonBlankStr


class ContributionDetails(BaseModel):
    """What was contributed, as an admin or recorder describes it.

    Shared by the award requests and the record itself. Who received it and
    everything the server owns are deliberately absent.
    """

    # Unknown fields are rejected, not dropped, in every contribution model:
    # this is a new contract, so drift should fail loudly.
    model_config = ConfigDict(extra="forbid")

    category: ContributionCategory
    title: TitleStr
    description: Optional[DescriptionStr] = None
    points: int = Field(strict=True, ge=0)
    source: Optional[ContributionSource] = None
    event_id: Optional[NonBlankStr] = None
    occurred_at: UtcDatetime

    @model_validator(mode="after")
    def _other_requires_description(self):
        # "other" says nothing about what was done, so the description must.
        if self.category is ContributionCategory.OTHER and self.description is None:
            raise ValueError("description is required when category is 'other'")
        return self


class AdminAwardStudent(ContributionDetails):
    """Body of POST /contributions/award/student/{student_id}.

    The student comes from the path. The server sets the status, reviewer,
    timestamps and deduplication key.
    """

    spg_id: Optional[NonBlankStr] = None


class AdminAwardSPG(ContributionDetails):
    """Body of POST /contributions/award/spg/{spg_id}.

    The SPG comes from the path; the server resolves its members and creates
    one record per member, each carrying that `spg_id`.
    """


class AdminRevokeRecord(BaseModel):
    """Body of PATCH /contributions/{record_id}/revoke. The server sets the
    status, revoker and time."""

    model_config = ConfigDict(extra="forbid")

    status_reason: NonBlankStr


class ContributionBase(ContributionDetails):
    """What was contributed and by whom. Treated as immutable once recorded."""

    contributor_id: NonBlankStr
    spg_id: Optional[NonBlankStr] = None


class ContributionCreate(ContributionBase):
    """Input from a trusted recorder — an admin or the bot.

    Every server-owned field of `ContributionRecord` is rejected here rather
    than ignored, so a caller cannot choose its own status, reviewer or ID.
    """


# The lifecycle fields each status requires. Every other lifecycle field must be
# None for that status.
_LIFECYCLE_FIELDS = ("reviewed_by", "reviewed_at", "revoked_by", "revoked_at", "status_reason")
_REQUIRED_LIFECYCLE_FIELDS = {
    ContributionStatus.PENDING: frozenset(),
    ContributionStatus.APPROVED: frozenset({"reviewed_by", "reviewed_at"}),
    ContributionStatus.REJECTED: frozenset({"reviewed_by", "reviewed_at", "status_reason"}),
    ContributionStatus.REVOKED: frozenset(_LIFECYCLE_FIELDS),
}


class ContributionRecord(ContributionBase):
    """A recorded contribution with its server-owned lifecycle metadata.

    Validates one record on its own. Transitions — pending to approved or
    rejected, approved to revoked — need the previous record, so the caller
    enforces them. `deduplication_key` is an optional idempotency aid the server
    sets when the activity has a deterministic identity, such as
    "attendance:<event>:<contributor>". It is not the record ID, and nothing
    here enforces its uniqueness.
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

    # Derived from `status` and never stored, so neither can drift from it. They
    # are separate names because they answer different questions.

    @property
    def counts_toward_leaderboard(self) -> bool:
        return self.status is ContributionStatus.APPROVED

    @property
    def is_verified(self) -> bool:
        """Reviewed and approved by the club — not a certification of the
        underlying content, which a blog or other entity would own itself."""
        return self.status is ContributionStatus.APPROVED


# --- API response models ---


class SPGAwardResponse(BaseModel):
    """Result of awarding every member of one SPG."""

    model_config = ConfigDict(extra="forbid")

    spg_id: NonBlankStr
    points_per_member: int = Field(strict=True, ge=0)
    awarded_count: int = Field(strict=True, ge=0)
    contributor_ids: List[NonBlankStr] = Field(default_factory=list)
    contribution_ids: List[NonBlankStr] = Field(default_factory=list)


class LeaderboardEntry(BaseModel):
    """One row of the leaderboard, summed from approved contributions."""

    model_config = ConfigDict(extra="forbid")

    contributor_id: NonBlankStr
    points: int = Field(strict=True, ge=0)
    contribution_count: int = Field(strict=True, ge=0)


class ContributionPage(BaseModel):
    """A bounded page of contributions. `next_cursor` is null on the last page."""

    model_config = ConfigDict(extra="forbid")

    items: List[ContributionRecord] = Field(default_factory=list)
    next_cursor: Optional[NonBlankStr] = None
