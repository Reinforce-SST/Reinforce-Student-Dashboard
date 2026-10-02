"""Learning Resources: admin-curated links to things worth learning from.

A resource is a link out (a course, a repo, a talk recording, a slide deck)
with a title, a track and a type. Admins curate the list; members read it.

An event's recording, slides and write-up can be saved into the list. Those
entries carry the event's id so the hub can link back to the event.
"""
from enum import Enum
import re
from typing import Annotated, List, Optional
from urllib.parse import urlparse

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import TitleStr


class ResourceTrack(str, Enum):
    """The club's domains, with `general` for anything that spans them."""

    RESEARCH = "research"
    PRODUCT = "product"
    KAGGLE = "kaggle"
    GENERAL = "general"


def resource_category_path(value: str) -> str:
    """Allow safe slash-separated folder paths, up to eight levels deep."""
    segments = value.split("/")
    if len(segments) > 8 or any(
        not segment
        or len(segment) > 48
        or not re.fullmatch(r"[\w]+(?:-[\w]+)*", segment, re.UNICODE)
        for segment in segments
    ):
        raise ValueError("must be a slash-separated category path with up to 8 safe folder names")
    return value


ResourceCategoryId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=240),
    AfterValidator(resource_category_path),
]


def default_category_for_track(track: ResourceTrack) -> Optional[ResourceCategoryId]:
    """Place legacy resources in the closest matching fixed folder."""
    return {
        ResourceTrack.RESEARCH: "theory",
        ResourceTrack.PRODUCT: "product",
        ResourceTrack.KAGGLE: "kaggle",
        ResourceTrack.GENERAL: None,
    }[track]


def track_for_category(category_id: Optional[ResourceCategoryId]) -> ResourceTrack:
    """Keep the old track field aligned with the top-level folder."""
    if category_id is None:
        return ResourceTrack.GENERAL
    root = category_id.split("/", 1)[0]
    if root == "theory":
        return ResourceTrack.RESEARCH
    if root == "kaggle":
        return ResourceTrack.KAGGLE
    if root == "product":
        return ResourceTrack.PRODUCT
    return ResourceTrack.GENERAL


class ResourceType(str, Enum):
    ARTICLE = "article"
    VIDEO = "video"
    COURSE = "course"
    DOCS = "docs"
    REPO = "repo"
    SLIDES = "slides"
    RECORDING = "recording"
    OTHER = "other"


class ResourceStatus(str, Enum):
    """Hidden resources stay in the admin list but not in the members' hub."""

    PUBLISHED = "published"
    HIDDEN = "hidden"


def web_address(value: str) -> str:
    """A resource is rendered as an href. Only http(s) may pass; a
    javascript: or data: address would run in the reader's browser."""
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("must be an http or https web address")
    return value


ResourceUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2048),
    AfterValidator(web_address),
]
ResourceDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class LearningResourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: TitleStr
    url: ResourceUrl
    description: ResourceDescription = ""
    track: ResourceTrack = ResourceTrack.GENERAL
    category_id: Optional[ResourceCategoryId] = None
    type: ResourceType = ResourceType.OTHER
    tags: List[Tag] = Field(default_factory=list, max_length=10)
    event_id: Optional[str] = None
    status: ResourceStatus = ResourceStatus.PUBLISHED


class LearningResourceUpdate(BaseModel):
    """Every field is optional; only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    title: Optional[TitleStr] = None
    url: Optional[ResourceUrl] = None
    description: Optional[ResourceDescription] = None
    track: Optional[ResourceTrack] = None
    category_id: Optional[ResourceCategoryId] = None
    type: Optional[ResourceType] = None
    tags: Optional[List[Tag]] = Field(default=None, max_length=10)
    event_id: Optional[str] = None
    status: Optional[ResourceStatus] = None


class LearningResourceDocument(BaseModel):
    id: str
    title: str
    url: str
    description: str = ""
    track: ResourceTrack = ResourceTrack.GENERAL
    category_id: Optional[ResourceCategoryId] = None
    type: ResourceType = ResourceType.OTHER
    tags: List[str] = Field(default_factory=list)
    event_id: Optional[str] = None
    event_title: Optional[str] = None
    status: ResourceStatus = ResourceStatus.PUBLISHED
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LearningResourceListResponse(BaseModel):
    resources: List[LearningResourceDocument]
    total: int


class EventResourceImport(BaseModel):
    """What saving an event's resources did, one entry per event link."""

    created: List[LearningResourceDocument] = Field(default_factory=list)
    already_saved: List[str] = Field(default_factory=list)
    skipped: List[str] = Field(default_factory=list)
