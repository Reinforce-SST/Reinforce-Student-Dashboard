"""Learning Resources API: admin-curated links for members to learn from.

Collection 'learning_resources' in Firestore. Admins create, edit, hide and
delete resources; anyone can read the published ones. An admin can also save
an event's recording, slides and write-up into the list in one step.
"""
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.api_core.exceptions import AlreadyExists
from google.cloud import firestore
from pydantic import ValidationError

from app.api.security import get_admin_user, get_optional_current_user
from app.services.firebase import db
from app.utils import get_user_uid, is_admin_user, now_iso
from app.schemas.learning_resources import (
    EventResourceImport,
    LearningResourceCreate,
    LearningResourceDocument,
    LearningResourceListResponse,
    LearningResourceUpdate,
    ResourceStatus,
    ResourceTrack,
    ResourceType,
)

router = APIRouter(prefix="/learning-resources", tags=["learning-resources"])

RESOURCES_COLLECTION = "learning_resources"
EVENTS_COLLECTION = "events"

# Which event links are saved, and as what. discord_thread_id is not a link.
EVENT_LINKS = (
    ("recording_url", ResourceType.RECORDING, "recording"),
    ("slides_url", ResourceType.SLIDES, "slides"),
    ("writeup_url", ResourceType.ARTICLE, "write-up"),
)


def _to_document(doc: firestore.DocumentSnapshot) -> LearningResourceDocument:
    return LearningResourceDocument.model_validate({**(doc.to_dict() or {}), "id": doc.id})


def _not_found(resource_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Learning resource '{resource_id}' not found",
    )


def _event_title(event_id: str) -> str:
    """The event's title, or 422 if the event does not exist."""
    doc = db.collection(EVENTS_COLLECTION).document(event_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Event '{event_id}' not found",
        )
    return (doc.to_dict() or {}).get("title") or event_id


def _resource_track(event_track: Optional[str]) -> ResourceTrack:
    """Events also use `misc` and `all`; both mean no one track."""
    try:
        return ResourceTrack(event_track)
    except ValueError:
        return ResourceTrack.GENERAL


@router.get("", response_model=LearningResourceListResponse)
def list_resources(
    track: Optional[ResourceTrack] = None,
    type: Optional[ResourceType] = None,
    event_id: Optional[str] = None,
    q: Optional[str] = Query(None, max_length=100),
    status_filter: Optional[ResourceStatus] = Query(None, alias="status"),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """List resources, newest first. Members only ever see published ones.

    The list is curated by hand and stays small, so filtering happens here
    rather than in Firestore, which would need an index per combination.
    """
    is_admin = is_admin_user(current_user)
    if status_filter == ResourceStatus.HIDDEN and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can list hidden resources.",
        )
    wanted_status = status_filter or (None if is_admin else ResourceStatus.PUBLISHED)
    needle = (q or "").strip().lower()

    resources: List[LearningResourceDocument] = []
    for doc in db.collection(RESOURCES_COLLECTION).stream():
        item = _to_document(doc)
        if wanted_status and item.status != wanted_status:
            continue
        if track and item.track != track:
            continue
        if type and item.type != type:
            continue
        if event_id and item.event_id != event_id:
            continue
        if needle and needle not in " ".join([item.title, item.description, *item.tags]).lower():
            continue
        resources.append(item)

    resources.sort(key=lambda item: item.created_at or "", reverse=True)
    return LearningResourceListResponse(resources=resources, total=len(resources))


@router.get("/{resource_id}", response_model=LearningResourceDocument)
def get_resource(
    resource_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    doc = db.collection(RESOURCES_COLLECTION).document(resource_id).get()
    if not doc.exists:
        raise _not_found(resource_id)
    item = _to_document(doc)
    if item.status != ResourceStatus.PUBLISHED and not is_admin_user(current_user):
        raise _not_found(resource_id)
    return item


@router.post("", response_model=LearningResourceDocument, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: LearningResourceCreate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Add a resource (admin only)."""
    resource_id = f"lr_{uuid.uuid4().hex[:12]}"
    now = now_iso()
    data = {
        **payload.model_dump(mode="json"),
        "id": resource_id,
        "event_title": _event_title(payload.event_id) if payload.event_id else None,
        "created_by": get_user_uid(current_user),
        "created_at": now,
        "updated_at": now,
    }
    ref = db.collection(RESOURCES_COLLECTION).document(resource_id)
    ref.set(data)
    return _to_document(ref.get())


@router.put("/{resource_id}", response_model=LearningResourceDocument)
def update_resource(
    resource_id: str,
    payload: LearningResourceUpdate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Change a resource (admin only). Sending event_id: null unlinks it."""
    ref = db.collection(RESOURCES_COLLECTION).document(resource_id)
    if not ref.get().exists:
        raise _not_found(resource_id)

    updates = payload.model_dump(mode="json", exclude_unset=True)
    for field in ("title", "url", "track", "type", "status"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be empty.",
            )
    if "tags" in updates and updates["tags"] is None:
        updates["tags"] = []
    if "description" in updates and updates["description"] is None:
        updates["description"] = ""
    if "event_id" in updates:
        updates["event_title"] = _event_title(updates["event_id"]) if updates["event_id"] else None
    updates["updated_at"] = now_iso()

    ref.set(updates, merge=True)
    return _to_document(ref.get())


@router.delete("/{resource_id}")
def delete_resource(
    resource_id: str,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Delete a resource (admin only)."""
    ref = db.collection(RESOURCES_COLLECTION).document(resource_id)
    if not ref.get().exists:
        raise _not_found(resource_id)
    ref.delete()
    return {"message": f"Learning resource '{resource_id}' deleted"}


@router.post("/from-event/{event_id}", response_model=EventResourceImport)
def save_event_resources(
    event_id: str,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Save an event's recording, slides and write-up as resources (admin only).

    Each link gets a fixed document id, so saving the same event twice does not
    duplicate anything. A link already saved is left as it is, including any
    edits an admin made to it since. A resource that was deleted is recreated.
    """
    doc = db.collection(EVENTS_COLLECTION).document(event_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found",
        )
    event = doc.to_dict() or {}
    title = event.get("title") or event_id
    links = event.get("resources") or {}
    track = _resource_track(event.get("track"))
    result = EventResourceImport()

    for field, resource_type, label in EVENT_LINKS:
        url = (links.get(field) or "").strip()
        if not url:
            continue
        resource_id = f"lr_evt_{event_id}_{resource_type.value}"
        now = now_iso()
        try:
            data = LearningResourceCreate(
                title=f"{title}: {label}"[:200],
                url=url,
                track=track,
                type=resource_type,
                event_id=event_id,
            ).model_dump(mode="json")
        except ValidationError:
            # Event links are not validated when an event is saved, and a
            # resource is rendered as a link, so one that is not an http(s)
            # address is skipped rather than saved.
            result.skipped.append(field)
            continue
        data.update({
            "id": resource_id,
            "event_title": title,
            "created_by": get_user_uid(current_user),
            "created_at": now,
            "updated_at": now,
        })
        ref = db.collection(RESOURCES_COLLECTION).document(resource_id)
        try:
            ref.create(data)
        except AlreadyExists:
            result.already_saved.append(field)
            continue
        result.created.append(_to_document(ref.get()))

    return result
