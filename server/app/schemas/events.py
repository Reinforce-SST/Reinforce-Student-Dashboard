"""Events System Schemas.

Implements the event architecture specified in server/plan.md.
Includes schedule, eligibility, solo/team participation, event-specific SPGs,
attendance roll-call, competition awarding, and feedback collection.
Strictly follows zero user denormalization (pure UID references).
"""
# Validated Need Some Changes and Discussion along the Comemnted Points
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
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]

# Do Event Type Really Need to be Stored like This?
# If we are to Store them it should probably follow a model like this
# We Make an Event Type Model with a nameStr and any other details a event type needs Maybe some hardcoded color/ icons etc.
# any Event We Want to Add Later would ideally not affect the codebase or schema
# Keeping it as an ENUM is limiting
# The Question is not about if we need any more event idea but the system should be able to plan alongside it
class EventType(str, Enum):
    ORIENTATION = "orientation"
    WORKSHOP = "workshop"
    SUPER_MENTOR_SESSION = "super_mentor_session"
    BUILD_DAY = "build_day"
    PAPER_DISCUSSION = "paper_discussion"
    KAGGLE_WRITEUP_DISCUSSION = "kaggle_writeup_discussion"
    PRODUCT_TEARDOWN = "product_teardown"
    DEBATE = "debate"
    SPRINT_12H_24H = "sprint_12h_24h"
    HACKATHON_WEEK = "hackathon_week"
    DATATHON = "datathon"
    RE_THESIS = "re_thesis"
    PITCH_DECK_COMPETITION = "pitch_deck_competition"
    EXHIBITION = "exhibition"
    QUIZ_CONTEST = "quiz_contest"
    GENERAL_MEET = "general_meet"

# Having Event Track is Fine i guess
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
    CANCELLED = "cancelled"

# Umm Should Event SPGS need to be Defined Here Separately? I dont think so everything related to SPGs must be covered under SPGs
class EventSPGStatus(str, Enum):
    ACTIVE_COMPETITION = "active_competition"
    CONVERTED_PERMANENT = "converted_permanent"
    DISBANDED = "disbanded"


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


class EventEligibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_scope: AccessScope = AccessScope.OPEN_TO_ALL
    allowed_years: List[int] = Field(default_factory=lambda: [1, 2, 3, 4])
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


class PointsRewardConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attendance_points: int = Field(default=0, ge=0)
    winner_points: int = Field(default=0, ge=0)
    track: str = "general"


class EventResources(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recording_url: Optional[str] = None
    slides_url: Optional[str] = None
    writeup_url: Optional[str] = None
    discord_thread_id: Optional[str] = None


class EventStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registered_count: int = 0
    checked_in_count: int = 0
    feedback_count: int = 0
    average_rating: float = 0.0


# --- Event Main Schemas ---


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: TitleStr
    slug: Optional[NonBlankStr] = None
    description: DescriptionStr
    detailed_info: Optional[str] = None
    event_type: EventType
    track: EventTrack = EventTrack.MISC
    format: EventFormat = EventFormat.ONLINE
    venue_info: Optional[VenueInfo] = None
    schedule: EventSchedule
    eligibility: Optional[EventEligibility] = None
    participation: Optional[EventParticipationConfig] = None
    points_reward: Optional[PointsRewardConfig] = None
    resources: Optional[EventResources] = None
    status: EventStatus = EventStatus.DRAFT


class EventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[TitleStr] = None
    slug: Optional[NonBlankStr] = None
    description: Optional[DescriptionStr] = None
    detailed_info: Optional[str] = None
    event_type: Optional[EventType] = None
    track: Optional[EventTrack] = None
    format: Optional[EventFormat] = None
    venue_info: Optional[VenueInfo] = None
    schedule: Optional[EventSchedule] = None
    eligibility: Optional[EventEligibility] = None
    participation: Optional[EventParticipationConfig] = None
    points_reward: Optional[PointsRewardConfig] = None
    resources: Optional[EventResources] = None
    status: Optional[EventStatus] = None


class EventStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: EventStatus

# We Also Need Event Banner With a Firestore Link ideally
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
    status: str = EventStatus.DRAFT.value
    created_by: str
    created_at: str
    updated_at: str


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
    status: str


class EventListResponse(BaseModel):
    events: List[EventSummary]
    total: int


# --- Registration Schemas (Pure UIDs) ---


class EventRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_name: Optional[NonBlankStr] = None
    member_uids: List[NonBlankStr] = Field(default_factory=list)


class RegistrationDocument(BaseModel):
    """Registration record stored in events/{event_id}/registrations/{reg_id}."""

    model_config = ConfigDict(extra="ignore")

    id: str
    event_id: str
    user_id: str
    team_name: Optional[str] = None
    member_uids: List[str] = Field(default_factory=list)
    spg_id: Optional[str] = None
    spg_status: Optional[str] = None
    status: str = RegistrationStatus.REGISTERED.value
    checked_in_at: Optional[str] = None
    checked_in_by: Optional[str] = None
    registered_at: str


class MyRegistrationResponse(BaseModel):
    is_registered: bool
    registration: Optional[RegistrationDocument] = None


# --- Admin Actions Schemas ---


class RollCallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # List of user UIDs to check-in
    attendee_uids: List[NonBlankStr] = Field(min_length=1)
    award_points: bool = True


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
