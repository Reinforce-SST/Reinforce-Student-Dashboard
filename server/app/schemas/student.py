from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_validator

class SocialLinks(BaseModel):
    github: Optional[str] = None
    kaggle: Optional[str] = None
    discord: Optional[str] = None
    linkedin: Optional[str] = None

class StudentBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    avatar_url: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    social_links: SocialLinks = Field(default_factory=SocialLinks)

class StudentProfile(StudentBase):
    firebase_uid: Optional[str] = None
    discord_id: Optional[str] = None
    discord_link_version: Optional[int] = None
    is_verified: bool = False
    verified_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    avatar_url: Optional[str] = None
    skills: Optional[List[str]] = Field(default=None, max_length=100)
    social_links: Optional[SocialLinks] = None

    @field_validator("full_name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value

class DiscordVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    link_token: str = Field(..., pattern=r"^[A-Za-z0-9_-]{43}$", description="One-time token issued privately by YUVI")
