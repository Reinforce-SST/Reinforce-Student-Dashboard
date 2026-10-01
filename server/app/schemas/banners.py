"""Banner Schemas.

Dedicated schema for Dashboard Hero Banners stored in the 'banners' Firestore collection.
Independent from events.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Dict, List, Optional
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
)
from app.schemas.common import NonBlankStr, TitleStr

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]


class BannerStatus(str, Enum):
    PUBLISHED = "published"
    DRAFT = "draft"
    ARCHIVED = "archived"


class BannerSchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start_time: UtcDatetime
    end_time: Optional[UtcDatetime] = None
    duration_minutes: Optional[int] = None


class BannerCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: TitleStr
    description: str = Field(..., max_length=2000)
    banner_url: Optional[str] = None
    banner_badge_text: Optional[str] = Field(None, max_length=50)
    banner_cta_text: Optional[str] = Field(None, max_length=50)
    banner_cta_url: Optional[str] = None
    schedule: BannerSchedule
    status: BannerStatus = BannerStatus.PUBLISHED


class BannerUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[TitleStr] = None
    description: Optional[str] = Field(None, max_length=2000)
    banner_url: Optional[str] = None
    banner_badge_text: Optional[str] = Field(None, max_length=50)
    banner_cta_text: Optional[str] = Field(None, max_length=50)
    banner_cta_url: Optional[str] = None
    schedule: Optional[BannerSchedule] = None
    status: Optional[BannerStatus] = None


class BannerDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: str
    banner_url: Optional[str] = None
    banner_badge_text: Optional[str] = None
    banner_cta_text: Optional[str] = None
    banner_cta_url: Optional[str] = None
    schedule: BannerSchedule
    status: str = BannerStatus.PUBLISHED.value
    created_by: Optional[str] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class BannerListResponse(BaseModel):
    banners: List[BannerDocument]
    total: int
