"""Student Project Group schemas.

An SPG is Reinforce's common team abstraction; its `type` says what the team
exists for and its `track` says which club domain it belongs to. The two are
different dimensions and both are stored.

Members are referenced by Firebase UID, never embedded. A response carries
`member_ids`; the frontend resolves display names through the member directory
(`GET /api/v1/users`), so a name or an email is never a membership identifier.

Members do not create SPGs directly. A registration raises an
`spg_registration` ticket and approving that ticket creates the SPG — see
docs/SPG_WORKFLOW.md. Fields the approval fills (`created_by`, timestamps,
`source_ticket_id`) are optional here so that documents written before this
workflow existed still validate on read.
"""

from datetime import timezone
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
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


class SPGType(str, Enum):
    """What the SPG exists for. Importance ("high value") is not a type; if it
    is ever needed it belongs in a separate field."""

    LEARNING = "learning"  # structured learning together
    PROJECT = "project"  # building a project or product
    EVENT = "event"  # an event hosted or managed by Reinforce
    EXTERNAL_EVENT = "external_event"  # an outside hackathon, competition or event
    MISCELLANEOUS = "miscellaneous"  # deliberate fallback; not free text


class SPGTrack(str, Enum):
    """Which club domain the SPG belongs to.

    Deliberately separate from `ContributionTrack`: that one ends in `misc`,
    while the club's SPG taxonomy ends in `general`. Reusing it would have
    forced one of the two to change meaning.
    """

    KAGGLE = "kaggle"
    PRODUCT = "product"
    RESEARCH = "research"
    GENERAL = "general"


class SPGVisibility(str, Enum):
    """Who may discover the SPG. Event SPGs are always public."""

    PUBLIC = "public"
    PRIVATE = "private"


class SPGStatus(str, Enum):
    """The one canonical SPG state.

    The dashboard prototype shows `on_track / at_risk / need_progress`. Those
    are presentation states derived from report recency, not a second stored
    field — the mapping is in docs/SPG_WORKFLOW.md.
    """

    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    DISBANDED = "disbanded"


def _default_visibility(type_value) -> str:
    """Event SPGs are public; everything else defaults to the closed option."""
    is_event = type_value == SPGType.EVENT or type_value == SPGType.EVENT.value
    return SPGVisibility.PUBLIC.value if is_event else SPGVisibility.PRIVATE.value


class SPGBase(BaseModel):
    """Fields that describe an SPG, shared by the record and its write models."""

    model_config = ConfigDict(extra="forbid")

    name: TitleStr
    description: Optional[DescriptionStr] = None
    type: SPGType
    track: SPGTrack = SPGTrack.GENERAL
    visibility: SPGVisibility = SPGVisibility.PRIVATE
    event_id: Optional[NonBlankStr] = Field(
        default=None,
        description="Linked event ID if derived from a competition/hackathon",
    )
    is_event_derived: bool = Field(default=False)
    idea_id: Optional[NonBlankStr] = Field(
        default=None, description="Linked idea ID if created from Idea Jar"
    )
    is_recruiting: bool = Field(
        default=False,
        description="Whether this SPG is looking for new collaborators",
    )
    recruiting_roles: List[str] = Field(
        default_factory=list,
        description="Roles/skills needed (e.g. ['PyTorch Developer', 'Frontend'])",
    )

    @model_validator(mode="before")
    @classmethod
    def _fill_visibility_from_type(cls, data):
        # A document written before visibility existed has none. Deriving it
        # from the type keeps those readable instead of failing the read, and
        # an explicitly wrong value is still rejected below.
        if isinstance(data, dict) and data.get("visibility") is None and "type" in data:
            data = {**data, "visibility": _default_visibility(data.get("type"))}
        return data

    @model_validator(mode="after")
    def _event_spgs_are_public(self):
        if self.type is SPGType.EVENT and self.visibility is not SPGVisibility.PUBLIC:
            raise ValueError("an event SPG is always public")
        return self


class SPGRecord(SPGBase):
    """A stored SPG document.

    Everything the server owns is optional so a document written before this
    workflow existed still validates on read; the creation path fills them.
    """

    id: NonBlankStr
    member_ids: List[NonBlankStr] = Field(min_length=1)
    lead_id: NonBlankStr
    status: SPGStatus
    created_by: Optional[NonBlankStr] = None
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None
    completed_at: Optional[UtcDatetime] = None
    proposition_document_url: Optional[NonBlankStr] = None
    source_ticket_id: Optional[NonBlankStr] = None

    @model_validator(mode="after")
    def _members_are_unique_and_include_the_lead(self):
        # A member listed twice would be awarded twice in an SPG award.
        if len(set(self.member_ids)) != len(self.member_ids):
            raise ValueError("member_ids must not contain duplicates")
        if self.lead_id not in self.member_ids:
            raise ValueError("lead_id must be one of member_ids")
        return self


class SPGRegistrationRequest(SPGBase):
    """What a member submits to register an SPG.

    This does not create an SPG. It carries everything the approval needs, so
    the reviewer approves a ticket rather than retyping the group.

    A project SPG must arrive with its proposition document; the file is
    uploaded alongside this payload and the server stores the resulting URL.
    """

    lead_id: NonBlankStr
    member_ids: List[NonBlankStr] = Field(min_length=1)

    @model_validator(mode="after")
    def _members_are_unique_and_include_the_lead(self):
        if len(set(self.member_ids)) != len(self.member_ids):
            raise ValueError("member_ids must not contain duplicates")
        if self.lead_id not in self.member_ids:
            raise ValueError("lead_id must be one of member_ids")
        return self


class SPGCreate(SPGRegistrationRequest):
    """What the approval path hands to `create_spg`.

    Only reached after a reviewer approves a registration, so
    `source_ticket_id` is required: it names the ticket that authorised this
    group, and it is what makes approving the same ticket twice land on the
    same document instead of creating a second group. Creation without one has
    no approval behind it and no idempotency, so it is not allowed.

    `SPGRecord` keeps the field optional, because documents written before this
    workflow existed have no ticket and must still read back.
    """

    source_ticket_id: NonBlankStr
    proposition_document_url: Optional[NonBlankStr] = None

    @model_validator(mode="after")
    def _projects_need_a_proposition(self):
        # A project SPG begins with its proposition document. Older stored
        # records predate the rule, which is why SPGRecord does not repeat it.
        if self.type is SPGType.PROJECT and self.proposition_document_url is None:
            raise ValueError("a project SPG requires a proposition document")
        return self


class SPGUpdate(BaseModel):
    """Metadata an admin may edit in place.

    Membership, lead and status have their own operations, so a general PATCH
    cannot quietly change who is in a group or whether it is finished.
    """

    model_config = ConfigDict(extra="forbid")

    name: Optional[TitleStr] = None
    description: Optional[DescriptionStr] = None
    track: Optional[SPGTrack] = None
    visibility: Optional[SPGVisibility] = None
    is_recruiting: Optional[bool] = None
    recruiting_roles: Optional[List[str]] = None


class SPGLeadUpdate(BaseModel):
    """Payload for PATCH /spgs/{spg_id}/lead."""

    model_config = ConfigDict(extra="forbid")

    new_lead_id: NonBlankStr


class SPGTeamUpdateRequest(BaseModel):
    """Payload for PATCH /spgs/{spg_id}/team."""

    model_config = ConfigDict(extra="forbid")

    member_ids: List[NonBlankStr] = Field(
        ..., min_length=1, description="Full updated list of member Firebase UIDs"
    )
    lead_id: Optional[NonBlankStr] = Field(
        None, description="Designated project lead UID (must be in member_ids)"
    )


class SPGRecruitingUpdateRequest(BaseModel):
    """Payload for PATCH /spgs/{spg_id}/recruiting."""

    model_config = ConfigDict(extra="forbid")

    is_recruiting: bool = Field(
        ..., description="Whether this SPG is looking for new collaborators"
    )
    recruiting_roles: Optional[List[str]] = Field(
        default_factory=list, description="Roles/skills needed"
    )


class SPGResponse(SPGRecord):
    """An SPG as the API returns it.

    Identifiers only. `progress` and the dashboard's health wording are derived
    for display and deliberately not stored — see docs/SPG_WORKFLOW.md.
    """

    report_count: int = Field(default=0, ge=0)


class SPGPage(BaseModel):
    """A bounded page of SPGs. `next_cursor` is null on the last page."""

    model_config = ConfigDict(extra="forbid")

    items: List[SPGResponse] = Field(default_factory=list)
    next_cursor: Optional[NonBlankStr] = None
