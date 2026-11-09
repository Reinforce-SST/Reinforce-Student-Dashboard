from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict


class InvitationType(str, Enum):
    SPG = "spg"
    EVENT_TEAM = "event_team"
    EVENT_SPG = "event_spg"


class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class CreateInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: InvitationType
    target_id: str
    invitee_uid: str
    team_name: Optional[str] = None
    event_id: Optional[str] = None
    spg_id: Optional[str] = None


class InvitationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: str
    target_id: str
    target_name: str
    event_id: Optional[str] = None
    spg_id: Optional[str] = None
    team_name: Optional[str] = None
    inviter_uid: str
    inviter_name: str
    inviter_email: Optional[str] = None
    invitee_uid: str
    invitee_name: str
    invitee_email: Optional[str] = None
    status: str
    role: str = "member"
    created_at: str
    updated_at: str
    expires_at: Optional[str] = None
