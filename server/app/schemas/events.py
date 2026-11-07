"""Events System Schemas.

Implements the event architecture specified in server/plan.md.
Includes schedule, eligibility, solo/team participation, event-specific SPGs,
attendance roll-call, competition awarding, and feedback collection.
Strictly follows zero user denormalization (pure UID references).
"""
# Validated Need Some Changes and Discussion along the Comemnted Points
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Any, Dict, List, Literal, Optional, Union
from urllib.parse import urlsplit
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr
from app.schemas.contributions import ContributionCategory

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]

# Do Event Type Really Need to be Stored like This?
# Freeform event type string instead of rigid enum
# EventTrack is kept as standard track categories
class EventTrack(str, Enum):
    RESEARCH = "research"
    PRODUCT = "product"
    KAGGLE = "kaggle"
    MISC = "misc"
    ALL = "all"


class EventFormat(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    HYBRID = "hybrid"


class EventStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    REGISTRATION_CLOSED = "registration_closed"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class AccessScope(str, Enum):
    OPEN_TO_ALL = "open_to_all"
    MEMBERS_ONLY = "members_only"


class ParticipationMode(str, Enum):
    SOLO = "solo"
    TEAM = "team"


class RegistrationStatus(str, Enum):
    REGISTERED = "registered"
    WAITLISTED = "waitlisted"
    CHECKED_IN = "checked_in"
    ABSENT = "absent"
    DISQUALIFIED = "disqualified"
    EXCUSED = "excused"
    CANCELLED = "cancelled"


# --- Nested Config Models ---


class VenueInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    venue_name: Optional[str] = None
    room: Optional[str] = None
    meeting_url: Optional[str] = None


class EventSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_time: str
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1)
    registration_deadline: Optional[str] = None


class MandatorySubgroups(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tiers: List[str] = Field(default_factory=list)
    years: List[int] = Field(default_factory=list)
    tracks: List[str] = Field(default_factory=list)


def current_graduation_batches(today: Optional[date] = None) -> List[int]:
    """Four graduation cohorts for the July–June SST academic year."""
    try:
        kolkata = ZoneInfo("Asia/Kolkata") if ZoneInfo else timezone(timedelta(hours=5, minutes=30))
    except Exception:
        kolkata = timezone(timedelta(hours=5, minutes=30))
    local_day = today or datetime.now(kolkata).date()
    first_batch = local_day.year + (1 if local_day.month >= 7 else 0)
    return list(range(first_batch, first_batch + 4))


class EventEligibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_scope: AccessScope = AccessScope.OPEN_TO_ALL
    allowed_years: List[int] = Field(default_factory=current_graduation_batches)
    allowed_tiers: List[str] = Field(
        default_factory=lambda: ["beginner", "advanced", "all"]
    )
    allowed_tracks: List[str] = Field(default_factory=lambda: ["all"])
    custom_note: Optional[str] = None
    is_mandatory: bool = False
    mandatory_for: MandatorySubgroups = Field(default_factory=MandatorySubgroups)


class EventParticipationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: ParticipationMode = ParticipationMode.SOLO
    min_team_size: int = Field(default=1, ge=1)
    max_team_size: int = Field(default=1, ge=1)
    max_participants: Optional[int] = Field(default=None, ge=1)
    requires_event_spg: bool = False
    spg_auto_disband_days: int = Field(default=3, ge=1)

    @model_validator(mode="after")
    def _individual_events_form_no_group(self) -> "EventParticipationConfig":
        # A group needs more than one person. Normalising here, rather than
        # rejecting, keeps any stored solo event readable while guaranteeing
        # that neither registration nor waitlist promotion spawns a
        # one-person "team" SPG.
        if self.mode is ParticipationMode.SOLO:
            self.requires_event_spg = False
        return self


class PointsRewardConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attendance_points: int = Field(default=0, ge=0)
    track: str = "general"


class EventWinner(BaseModel):
    model_config = ConfigDict(extra="forbid")

    placement: str  # e.g. "1st Place", "Runner Up", "Best Innovation"
    title: str  # Team or project title
    user_ids: List[str] = Field(default_factory=list)  # Member UIDs
    spg_id: Optional[str] = None
    project_url: Optional[str] = None
    notes: Optional[str] = None


class EventResources(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recording_url: Optional[str] = None
    slides_url: Optional[str] = None
    writeup_url: Optional[str] = None
    discord_thread_id: Optional[str] = None
    learning_resource_ids: List[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
    ] = Field(default_factory=list, max_length=50)

    @field_validator("learning_resource_ids")
    @classmethod
    def resource_ids_are_unique(cls, values: List[str]) -> List[str]:
        if len(values) != len(set(values)):
            raise ValueError("Learning resource ids must be unique.")
        return values


class EventStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registered_count: int = 0
    checked_in_count: int = 0
    feedback_count: int = 0
    average_rating: float = 0.0


# --- Event Main Schemas ---


def _banner_label(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 40:
        raise ValueError("Banner text must be 1–40 characters.")
    return value


def _banner_destination(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 2048 or "\\" in value or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError("Banner destination must be a valid path or HTTPS URL.")
    if value.startswith("/") and not value.startswith("//"):
        return value
    try:
        parsed = urlsplit(value)
        if parsed.scheme == "https" and parsed.hostname and parsed.username is None and parsed.password is None:
            parsed.port  # Reject malformed ports.
            return value
    except ValueError:
        pass
    raise ValueError("Banner destination must be a relative path or HTTPS URL.")


BannerLabel = Annotated[str, AfterValidator(_banner_label)]
BannerDestination = Annotated[str, AfterValidator(_banner_destination)]


# --- Advanced Hackathon & Operations Schemas ---


class CustomFieldSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    field_id: str = Field(..., description="Slugified field ID, e.g. mess_vendor")
    label: str
    field_type: str = "text"  # "text" | "select" | "boolean" | "url"
    options: Optional[List[str]] = None
    required: bool = True
    applies_to: str = "individual"  # "individual" | "team"
    sync_to_matrix: bool = True


class EventTrackSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    track_id: str
    name: str
    description: Optional[str] = None
    max_teams: Optional[int] = None


class TeamSettingsSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    allow_team_creation: bool = True
    require_join_approval: bool = True
    allow_solo_pool: bool = False
    lock_rosters_at: Optional[UtcDatetime] = None
    auto_convert_to_spg: bool = False


class TimelineItemSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    description: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    location_or_link: Optional[str] = None
    is_submission_deadline: bool = False
    status_override: Optional[str] = None  # "upcoming" | "live" | "completed"


class SubmissionCustomField(BaseModel):
    model_config = ConfigDict(extra="ignore")

    field_id: str
    label: str
    field_type: str = "url"  # "url" | "text"
    placeholder: Optional[str] = None
    required: bool = False


class SubmissionConfigSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enable_repo_url: bool = True
    require_repo_url: bool = False
    enable_slides_url: bool = True
    require_slides_url: bool = False
    enable_demo_url: bool = True
    require_demo_url: bool = False
    enable_paper_link: bool = True
    require_paper_link: bool = False
    enable_notes: bool = True
    require_notes: bool = False
    allow_problem_statement_selection: bool = True
    require_problem_statement: bool = False
    custom_fields: List[SubmissionCustomField] = Field(default_factory=list)


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: TitleStr
    slug: Optional[NonBlankStr] = None
    description: DescriptionStr
    detailed_info: Optional[str] = None
    event_type: NonBlankStr = Field(
        ...,
        description="Freeform event type string (e.g. 'Workshop', 'Hackathon', 'AMA')",
    )
    track: EventTrack = EventTrack.MISC
    format: EventFormat = EventFormat.ONLINE
    venue_info: Optional[VenueInfo] = None
    schedule: EventSchedule
    eligibility: Optional[EventEligibility] = None
    participation: Optional[EventParticipationConfig] = None
    points_reward: Optional[PointsRewardConfig] = None
    resources: Optional[EventResources] = None
    banner_url: Optional[str] = None
    banner_badge_text: Optional[BannerLabel] = None
    banner_cta_text: Optional[BannerLabel] = None
    banner_cta_url: Optional[BannerDestination] = None
    custom_registration_fields: List[CustomFieldSchema] = Field(default_factory=list)
    event_tracks: List[EventTrackSchema] = Field(default_factory=list)
    allow_open_track_change: bool = False
    team_settings: Optional[TeamSettingsSchema] = None
    timeline: List[TimelineItemSchema] = Field(default_factory=list)
    submission_config: Optional[SubmissionConfigSchema] = None
    status: EventStatus = EventStatus.DRAFT


class EventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[TitleStr] = None
    slug: Optional[NonBlankStr] = None
    description: Optional[DescriptionStr] = None
    detailed_info: Optional[str] = None
    event_type: Optional[NonBlankStr] = None
    track: Optional[EventTrack] = None
    format: Optional[EventFormat] = None
    venue_info: Optional[VenueInfo] = None
    schedule: Optional[EventSchedule] = None
    eligibility: Optional[EventEligibility] = None
    participation: Optional[EventParticipationConfig] = None
    points_reward: Optional[PointsRewardConfig] = None
    resources: Optional[EventResources] = None
    banner_url: Optional[str] = None
    banner_badge_text: Optional[BannerLabel] = None
    banner_cta_text: Optional[BannerLabel] = None
    banner_cta_url: Optional[BannerDestination] = None
    custom_registration_fields: Optional[List[CustomFieldSchema]] = None
    event_tracks: Optional[List[EventTrackSchema]] = None
    allow_open_track_change: Optional[bool] = None
    team_settings: Optional[TeamSettingsSchema] = None
    timeline: Optional[List[TimelineItemSchema]] = None
    submission_config: Optional[SubmissionConfigSchema] = None
    winners: Optional[List[EventWinner]] = None
    status: Optional[EventStatus] = None


class EventStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: EventStatus


# --- Event Matrix Schemas ---


class MatrixColumnType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    OBJECT = "object"


class MatrixSchemaType(str, Enum):
    SUBMISSION = "submission"
    ROLE_ASSIGNMENT = "role_assignment"
    FEEDBACK = "feedback"
    CONTRIBUTION_ASSIGNMENT = "contribution_assignment"
    SPG_ASSIGNMENT = "spg_assignment"
    IDEA_JAR_ASSIGNMENT = "idea_jar_assignment"


class MatrixColumnDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column_id: str
    title: str
    column_type: MatrixColumnType
    object_schema_type: Optional[MatrixSchemaType] = None


class SubmissionObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.SUBMISSION] = MatrixSchemaType.SUBMISSION
    repo_url: Optional[str] = None
    paper_link: Optional[str] = None
    score: Optional[float] = None


class RoleAssignmentObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.ROLE_ASSIGNMENT] = MatrixSchemaType.ROLE_ASSIGNMENT
    role_title: str
    team_name: Optional[str] = None
    is_lead: bool = False


class FeedbackObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.FEEDBACK] = MatrixSchemaType.FEEDBACK
    rating: int = Field(ge=1, le=5)
    notes: Optional[str] = None


class ContributionAssignmentObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.CONTRIBUTION_ASSIGNMENT] = MatrixSchemaType.CONTRIBUTION_ASSIGNMENT
    category: ContributionCategory = ContributionCategory.PARTICIPATION
    track: str = "general"
    points: int = Field(default=10, ge=0, le=1000)
    title: Optional[str] = None
    description: Optional[str] = None


class SPGAssignmentObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.SPG_ASSIGNMENT] = MatrixSchemaType.SPG_ASSIGNMENT
    spg_id: Optional[str] = None
    spg_name: str
    spg_status: Optional[str] = "active"
    role: Optional[str] = None


class IdeaJarAssignmentObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: Literal[MatrixSchemaType.IDEA_JAR_ASSIGNMENT] = MatrixSchemaType.IDEA_JAR_ASSIGNMENT
    idea_id: Optional[str] = None
    idea_title: str
    track: Optional[str] = "general"
    spg_id: Optional[str] = None
    spg_name: Optional[str] = None


MatrixObjectPayload = Annotated[
    Union[
        SubmissionObject,
        RoleAssignmentObject,
        FeedbackObject,
        ContributionAssignmentObject,
        SPGAssignmentObject,
        IdeaJarAssignmentObject,
    ],
    Field(discriminator="schema_type"),
]

SUBMISSION_ADAPTER = TypeAdapter(SubmissionObject)
ROLE_ASSIGNMENT_ADAPTER = TypeAdapter(RoleAssignmentObject)
FEEDBACK_ADAPTER = TypeAdapter(FeedbackObject)
CONTRIBUTION_ASSIGNMENT_ADAPTER = TypeAdapter(ContributionAssignmentObject)
SPG_ASSIGNMENT_ADAPTER = TypeAdapter(SPGAssignmentObject)
IDEA_JAR_ASSIGNMENT_ADAPTER = TypeAdapter(IdeaJarAssignmentObject)

MATRIX_ADAPTERS: Dict[MatrixSchemaType, TypeAdapter[Any]] = {
    MatrixSchemaType.SUBMISSION: SUBMISSION_ADAPTER,
    MatrixSchemaType.ROLE_ASSIGNMENT: ROLE_ASSIGNMENT_ADAPTER,
    MatrixSchemaType.FEEDBACK: FEEDBACK_ADAPTER,
    MatrixSchemaType.CONTRIBUTION_ASSIGNMENT: CONTRIBUTION_ASSIGNMENT_ADAPTER,
    MatrixSchemaType.SPG_ASSIGNMENT: SPG_ASSIGNMENT_ADAPTER,
    MatrixSchemaType.IDEA_JAR_ASSIGNMENT: IDEA_JAR_ASSIGNMENT_ADAPTER,
}


class CreateMatrixColumnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonBlankStr
    column_type: MatrixColumnType
    object_schema_type: Optional[MatrixSchemaType] = None


class UpdateMatrixCellRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: NonBlankStr
    column_id: NonBlankStr
    value: Optional[Any] = None

    @model_validator(mode="before")
    @classmethod
    def support_camel_case(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "columnId" in data and "column_id" not in data:
                data["column_id"] = data["columnId"]
        return data


class MatrixCellUpdateItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: NonBlankStr
    column_id: NonBlankStr
    value: Optional[Any] = None

    @model_validator(mode="before")
    @classmethod
    def support_camel_case(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "columnId" in data and "column_id" not in data:
                data["column_id"] = data["columnId"]
        return data


class MatrixAttendanceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: NonBlankStr
    status: RegistrationStatus
    attendance_note: Optional[str] = None
    award_points: bool = False
    category: ContributionCategory = ContributionCategory.PARTICIPATION


class BatchUpdateMatrixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cells: List[MatrixCellUpdateItem] = Field(default_factory=list)
    attendance: List[MatrixAttendanceUpdateRequest] = Field(default_factory=list)


class AssignAllColumnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Optional[Any] = None


class MatrixAccessUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    volunteer_uids: List[NonBlankStr] = Field(default_factory=list)


class MatrixSettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matrix_is_public: Optional[bool] = None
    matrix_is_pinned: Optional[bool] = None


class MatrixRowHydrated(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str
    user_name: str
    email: str
    avatar_url: Optional[str] = None
    batch_year: Optional[int] = None
    team_name: Optional[str] = None
    rsvp_status: str
    attendance: str
    cells: Dict[str, Any] = Field(default_factory=dict)


class EventMatrixResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str
    event_title: str
    is_admin: bool
    has_edit_access: bool
    matrix_is_public: bool = False
    matrix_is_pinned: bool = False
    volunteer_uids: List[str] = Field(default_factory=list)
    volunteer_profiles: List[Dict[str, Any]] = Field(default_factory=list)
    event_spgs: List[Dict[str, Any]] = Field(default_factory=list)
    approved_ideas: List[Dict[str, Any]] = Field(default_factory=list)
    columns: List[MatrixColumnDef] = Field(default_factory=list)
    rows: List[MatrixRowHydrated] = Field(default_factory=list)


class EventDocument(BaseModel):
    """Full Event document schema stored in Firestore."""

    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    title: str
    description: str
    detailed_info: Optional[str] = None
    event_type: str
    track: str
    format: str
    venue_info: VenueInfo = Field(default_factory=VenueInfo)
    schedule: EventSchedule
    eligibility: EventEligibility = Field(default_factory=EventEligibility)
    participation: EventParticipationConfig = Field(
        default_factory=EventParticipationConfig
    )
    points_reward: PointsRewardConfig = Field(default_factory=PointsRewardConfig)
    resources: EventResources = Field(default_factory=EventResources)
    stats: EventStats = Field(default_factory=EventStats)
    banner_url: Optional[str] = None
    banner_badge_text: Optional[str] = None
    banner_cta_text: Optional[str] = None
    banner_cta_url: Optional[str] = None
    winners: Optional[List[EventWinner]] = None
    custom_registration_fields: List[CustomFieldSchema] = Field(default_factory=list)
    event_tracks: List[EventTrackSchema] = Field(default_factory=list)
    allow_open_track_change: bool = False
    team_settings: TeamSettingsSchema = Field(default_factory=TeamSettingsSchema)
    timeline: List[TimelineItemSchema] = Field(default_factory=list)
    submission_config: SubmissionConfigSchema = Field(default_factory=SubmissionConfigSchema)
    matrix_columns: List[MatrixColumnDef] = Field(default_factory=list)
    matrix_cells: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    matrix_access_uids: List[str] = Field(default_factory=list)
    matrix_is_public: bool = False
    matrix_is_pinned: bool = False
    can_access_matrix: Optional[bool] = None
    status: str = EventStatus.DRAFT.value
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class EventSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    title: str
    description: str
    event_type: str
    track: str
    format: str
    schedule: EventSchedule
    venue_info: VenueInfo
    stats: EventStats
    banner_url: Optional[str] = None
    banner_badge_text: Optional[str] = None
    banner_cta_text: Optional[str] = None
    banner_cta_url: Optional[str] = None
    status: str


class EventWinnersUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    winners: List[EventWinner] = Field(default_factory=list)


class EventListResponse(BaseModel):
    events: List[EventSummary]
    total: int


# --- Registration Schemas (Pure UIDs) ---


class TeamInviteInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    invite_id: str
    from_team_id: str
    from_team_name: str
    from_leader_uid: str
    from_leader_name: str
    created_at: str


class EventRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    team_name: Optional[NonBlankStr] = None
    custom_responses: Dict[str, Any] = Field(default_factory=dict)
    selected_track_id: Optional[str] = None
    # Kept for backward compatibility with existing tests
    member_uids: List[NonBlankStr] = Field(default_factory=list)
    member_responses: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class RegistrationDocument(BaseModel):
    """Registration record stored in events/{event_id}/registrations/{uid}."""

    model_config = ConfigDict(extra="ignore")

    id: str
    event_id: str
    user_id: str
    uid: Optional[str] = None
    status: str = RegistrationStatus.REGISTERED.value

    # Individual Intake (applies_to: "individual")
    custom_responses: Dict[str, Any] = Field(default_factory=dict)

    # Team & Merge State
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    is_team_leader: bool = False
    member_uids: List[str] = Field(default_factory=list)
    invite_code: Optional[str] = None
    looking_for_team: bool = True

    # Team-Level Intake & Track
    selected_track_id: Optional[str] = None
    team_custom_responses: Dict[str, Any] = Field(default_factory=dict)

    # Pending Merge/Invite Requests received
    pending_invites: List[TeamInviteInfo] = Field(default_factory=list)

    # Legacy field backward compatibility
    member_responses: Optional[Dict[str, Dict[str, Any]]] = None

    # Attendance & Submission Metadata
    spg_id: Optional[str] = None
    spg_status: Optional[str] = None
    idea_id: Optional[str] = None
    problem_statement_id: Optional[str] = None
    roster_locked: bool = False
    locked_at: Optional[str] = None
    submission: Optional[Dict[str, Any]] = None
    checked_in_at: Optional[str] = None
    checked_in_by: Optional[str] = None
    attendance_note: Optional[str] = None
    registered_at: str
    user_profile: Optional[Dict[str, Any]] = None
    member_profiles: Optional[List[Dict[str, Any]]] = None


class CreateOrUpdateTeamRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_name: str = Field(..., min_length=2, max_length=60)
    selected_track_id: Optional[str] = None
    team_custom_responses: Dict[str, Any] = Field(default_factory=dict)
    looking_for_team: bool = True


class TeamMergeByCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invite_code: Optional[str] = None
    invite_id: Optional[str] = None


class TeamInviteMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_uid: str


class AdminUpdateTeamRosterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    team_name: Optional[str] = None
    member_uids: List[str]
    leader_uid: str


class AttachRegistrationIdeaRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    idea_id: Optional[str] = None


class TeamPoolMemberSummary(BaseModel):
    uid: str
    full_name: str
    email: str
    avatar_url: Optional[str] = None
    batch_year: Optional[int] = None
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    current_team_size: int = 1
    is_team_leader: bool = False
    looking_for_team: bool = True


class TeamPoolResponse(BaseModel):
    members: List[TeamPoolMemberSummary]
    total: int


class UpdateRegistrationTrackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selected_track_id: Optional[str] = None


class EventSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    repo_url: Optional[str] = None
    slides_url: Optional[str] = None
    demo_url: Optional[str] = None
    paper_link: Optional[str] = None
    notes: Optional[str] = None
    problem_statement_id: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None


class UpdateMemberCustomResponsesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    responses: Dict[str, Any]


class RegistrationAttendanceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: RegistrationStatus
    attendance_note: Optional[str] = None
    award_points: bool = True
    category: ContributionCategory = ContributionCategory.PARTICIPATION


class ManualRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: NonBlankStr
    status: RegistrationStatus = RegistrationStatus.CHECKED_IN
    attendance_note: Optional[str] = None
    award_points: bool = True
    category: ContributionCategory = ContributionCategory.PARTICIPATION


class MyRegistrationResponse(BaseModel):
    is_registered: bool
    registration: Optional[RegistrationDocument] = None


# --- Admin Actions Schemas ---


class RollCallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # List of user UIDs to check-in
    attendee_uids: List[NonBlankStr] = Field(min_length=1)
    award_points: bool = True
    category: ContributionCategory = ContributionCategory.PARTICIPATION


class RollCallResponse(BaseModel):
    event_id: str
    checked_in_count: int
    points_awarded_per_user: int
    awarded_uids: List[str]
    failed_uids: List[str] = Field(default_factory=list)

# What are these Points About?
# Are they Related to Contribution Scores?
# Actaully What Is this about Winners Actually
# Will these Be Used for Automated Contribution points? Probably right
class WinnerAwardEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_uid: NonBlankStr
    rank: int = Field(ge=1, le=100)
    points: int = Field(ge=1)
    note: Optional[DescriptionStr] = None


class WinnerAwardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    winners: List[WinnerAwardEntry] = Field(min_length=1)


class WinnerAwardResponse(BaseModel):
    event_id: str
    awarded_count: int
    total_points: int


# --- SPG Decision Schema ---


class SPGDecisionAction(str, Enum):
    CONVERT_PERMANENT = "convert_permanent"
    DISBAND = "disband"


class SPGDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: SPGDecisionAction


# --- Feedback Schemas ---


class FeedbackSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating_content: int = Field(ge=1, le=5)
    rating_organization: int = Field(ge=1, le=5)
    rating_overall: int = Field(ge=1, le=5)
    takeaways: Optional[str] = None
    improvements: Optional[str] = None
    is_anonymous: bool = False


class FeedbackDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_uid: str
    rating_content: int
    rating_organization: int
    rating_overall: int
    takeaways: Optional[str] = None
    improvements: Optional[str] = None
    is_anonymous: bool
    created_at: str


class FeedbackSummaryResponse(BaseModel):
    event_id: str
    total_feedbacks: int
    average_overall: float
    average_content: float
    average_organization: float
    feedbacks: List[FeedbackDocument]


class EventRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: NonBlankStr
    name: TitleStr
