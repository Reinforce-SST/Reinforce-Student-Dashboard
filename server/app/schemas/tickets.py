"""Pydantic schemas and models for the Unified Ticket & Support System.

Adheres to server/plan.md, omitting denormalized user objects in favor of UIDs.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

# Ohk to Resource Request is a Bit Ambiguous here
# It can mean GPU Resource Rest or HArdware Requests
# It can also mean Learning Resource Request
# Can we have a Categorization for both of these
# Also Maybe add a Suggestion Box
class TicketCategory(str, Enum):
    SPG_REGISTRATION = "spg_registration"
    RESOURCE_REQUEST = "resource_request"
    SUPPORT = "support"
    IDEA_JAR = "idea_jar"
    FEEDBACK = "feedback"
    REPORT = "report"
    MISC = "misc"


class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class MessageSource(str, Enum):
    WEB = "web"
    DISCORD = "discord"


class SenderRole(str, Enum):
    USER = "user"
    ADMIN = "admin"
    LEAD = "lead"
    BOT = "bot"


# Confidential by design. Misconduct reports are visible only to core admins and the creator.
HIDDEN_CATEGORIES = frozenset({TicketCategory.REPORT.value})


# ---------------------------------------------------------------------------
# Discord Bridge Metadata
# ---------------------------------------------------------------------------

class DiscordMeta(BaseModel):
    guild_id: Optional[str] = None
    channel_id: Optional[str] = None
    thread_id: Optional[str] = None
    thread_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Ticket Mutation Request Schemas
# ---------------------------------------------------------------------------

class TicketCreate(BaseModel):
    """Member creation payload. Note: priority is system-assigned to 'medium' and cannot be set here."""
    model_config = ConfigDict(extra="forbid")

    category: TicketCategory
    title: TitleStr
    description: Optional[DescriptionStr] = None
    fields: Dict[str, Any] = Field(
        default_factory=dict,
        description="Category-specific structured form fields (e.g. spg_id, resources_needed, etc.)"
    )
    spg_id: Optional[NonBlankStr] = None


class TicketCloseRequest(BaseModel):
    """Payload to close a ticket."""
    model_config = ConfigDict(extra="forbid")

    close_reason: Optional[DescriptionStr] = None


class AdminUpdateTicketPriority(BaseModel):
    """Admin-only payload to update ticket priority."""
    model_config = ConfigDict(extra="forbid")

    priority: TicketPriority


class AdminUpdateTicketStatus(BaseModel):
    """Admin-only payload to transition ticket status."""
    model_config = ConfigDict(extra="forbid")

    status: TicketStatus
    close_reason: Optional[DescriptionStr] = None


class AdminAssignTicket(BaseModel):
    """Admin-only payload to assign ticket to a core lead."""
    model_config = ConfigDict(extra="forbid")

    assigned_to_uid: NonBlankStr


# ---------------------------------------------------------------------------
# Message Schemas
# ---------------------------------------------------------------------------

class TicketMessageCreate(BaseModel):
    """Payload to post a message from the web dashboard."""
    model_config = ConfigDict(extra="forbid")

    content: NonBlankStr
    attachments: List[str] = Field(default_factory=list, max_length=10)


class BotSyncMessageRequest(BaseModel):
    """Payload sent by the YUVI Discord bot webhook to sync messages to Firestore."""
    model_config = ConfigDict(extra="ignore")

    sender_uid: Optional[str] = None
    sender_name: Optional[str] = None
    sender_role: SenderRole = SenderRole.USER
    source: MessageSource = MessageSource.DISCORD
    content: str
    attachments: List[str] = Field(default_factory=list)
    discord_message_id: Optional[str] = None
    timestamp: Optional[str] = None


class TicketMessage(BaseModel):
    """Message representation in a ticket thread."""
    id: str
    sender_uid: Optional[str] = None
    sender_name: Optional[str] = None
    sender_role: SenderRole = SenderRole.USER
    source: MessageSource = MessageSource.WEB
    content: str
    attachments: List[str] = Field(default_factory=list)
    discord_message_id: Optional[str] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Response Models & Document Shapes
# ---------------------------------------------------------------------------

class TicketDocument(BaseModel):
    """Raw Firestore stored document in `tickets/{ticket_id}`."""
    model_config = ConfigDict(extra="ignore")

    id: str
    category: TicketCategory
    title: str
    description: Optional[str] = None
    status: TicketStatus = TicketStatus.OPEN
    priority: TicketPriority = TicketPriority.MEDIUM
    spg_id: Optional[str] = None
    fields: Dict[str, Any] = Field(default_factory=dict)
    created_by_uid: str
    assigned_to_uid: Optional[str] = None
    closed_by_uid: Optional[str] = None
    close_reason: Optional[str] = None
    closed_at: Optional[str] = None
    discord_meta: Optional[DiscordMeta] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TicketSummary(BaseModel):
    """Ticket card summary in feeds and list views."""
    id: str
    category: TicketCategory
    title: str
    status: TicketStatus
    priority: TicketPriority
    created_by_uid: str
    assigned_to_uid: Optional[str] = None
    spg_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    thread_url: Optional[str] = None


class TicketDetail(TicketSummary):
    """Full ticket detail view."""
    description: Optional[str] = None
    fields: Dict[str, Any] = Field(default_factory=dict)
    closed_by_uid: Optional[str] = None
    close_reason: Optional[str] = None
    closed_at: Optional[str] = None
    discord_meta: Optional[DiscordMeta] = None


class TicketThread(BaseModel):
    """Full ticket detail with its conversation messages."""
    ticket: TicketDetail
    messages: List[TicketMessage] = Field(default_factory=list)


class TicketListResponse(BaseModel):
    total: int
    items: List[TicketSummary]
