"""Pydantic schemas for unified Users & Students in Firestore."""

from enum import Enum
from typing import List, Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from app.schemas.common import NonBlankStr

ALLOWED_EMAIL_DOMAINS = ("@sst.scaler.com", "@scaler.com")


class MemberTier(str, Enum):
    BEGINNER = "beginner"
    ADVANCED = "advanced"


class SocialLinks(BaseModel):
    github: Optional[str] = None
    kaggle: Optional[str] = None
    linkedin: Optional[str] = None
    discord: Optional[str] = None


class TrackPoints(BaseModel):
    total: int = Field(default=0, ge=0)
    kaggle: int = Field(default=0, ge=0)
    product: int = Field(default=0, ge=0)
    research: int = Field(default=0, ge=0)
    misc: int = Field(default=0, ge=0)


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=1000)
    batch_year: Optional[int] = Field(default=None, ge=1, le=2100)
    skills: List[str] = Field(default_factory=list, max_length=30)
    social_links: SocialLinks = Field(default_factory=SocialLinks)

    @field_validator("email")
    @classmethod
    def validate_scaler_domain(cls, v: str) -> str:
        lowered = v.lower().strip()
        if not any(lowered.endswith(domain) for domain in ALLOWED_EMAIL_DOMAINS):
            raise ValueError("Email must end with @sst.scaler.com or @scaler.com")
        return lowered


class UserUpdateRequest(BaseModel):
    """Payload when a user updates their own profile."""
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=1000)
    batch_year: Optional[int] = Field(default=None, ge=1, le=2100)
    skills: Optional[List[str]] = Field(default=None, max_length=30)
    social_links: Optional[SocialLinks] = None

    @field_validator("full_name")
    @classmethod
    def reject_blank_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("Full name cannot be blank")
        return value


class AdminUserUpdateRequest(BaseModel):
    """Payload for admins to update membership status, admin role, or club tier."""
    model_config = ConfigDict(extra="forbid")

    is_member: Optional[bool] = None
    is_admin: Optional[bool] = None
    tier: Optional[MemberTier] = None


class DiscordVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_token: str = Field(
        ...,
        description="Private one-time proof issued by YUVI's /auth command",
        pattern=r"^[A-Za-z0-9_-]{43}$",
    )


class UserDocument(BaseModel):
    """The raw document shape stored in Firestore at `users/{uid}`."""
    model_config = ConfigDict(extra="ignore")

    id: str
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    discord_id: Optional[str] = None
    is_admin: bool = False
    is_member: bool = False
    tier: MemberTier = MemberTier.BEGINNER
    batch_year: Optional[int] = None
    is_verified: bool = False
    verified_at: Optional[str] = None
    points: TrackPoints = Field(default_factory=TrackPoints)
    bio: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    social_links: SocialLinks = Field(default_factory=SocialLinks)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_login: Optional[str] = None


class UserPublicResponse(BaseModel):
    """Publicly viewable member profile card / directory listing."""
    id: str
    full_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    is_member: bool = False
    tier: MemberTier = MemberTier.BEGINNER
    batch_year: Optional[int] = None
    is_verified: bool = False
    skills: List[str] = Field(default_factory=list)
    social_links: SocialLinks = Field(default_factory=SocialLinks)
    points: TrackPoints = Field(default_factory=TrackPoints)


class UserMeResponse(BaseModel):
    """Full authenticated profile returned to the owner."""
    id: str
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    discord_id: Optional[str] = None
    discord_link_version: Optional[int] = None
    is_admin: bool = False
    is_member: bool = False
    tier: MemberTier = MemberTier.BEGINNER
    batch_year: Optional[int] = None
    is_verified: bool = False
    verified_at: Optional[str] = None
    points: TrackPoints = Field(default_factory=TrackPoints)
    bio: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    social_links: SocialLinks = Field(default_factory=SocialLinks)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_login: Optional[str] = None


class LeaderboardEntry(BaseModel):
    id: str
    full_name: str
    avatar_url: Optional[str] = None
    is_member: bool = False
    tier: MemberTier = MemberTier.BEGINNER
    points: TrackPoints
    rank: int = 1


class LeaderboardResponse(BaseModel):
    track: str
    total: int
    entries: List[LeaderboardEntry]


class UserListResponse(BaseModel):
    items: List[UserPublicResponse]
    total: int
    page: int = 1
    page_size: int = 20
    has_more: bool = False
