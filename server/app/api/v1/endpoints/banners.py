"""Dashboard Hero Banners API endpoints.

Dedicated collection 'banners' in Firestore.
Separate from events — banners manage top-level announcement slides on the dashboard.
"""
from datetime import datetime, timezone
import io
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from google.cloud import firestore

from app.api.security import get_admin_user, get_optional_current_user
from app.services.firebase import db, upload_file_to_storage
from app.services.images import ImageRejected, read_image
from app.utils import get_user_uid, is_admin_user, now_iso
from app.schemas.banners import (
    BannerCreate,
    BannerDocument,
    BannerListResponse,
    BannerSchedule,
    BannerStatus,
    BannerUpdate,
)

router = APIRouter(prefix="/banners", tags=["banners"])

BANNERS_COLLECTION = "banners"


def _doc_to_banner_document(doc: firestore.DocumentSnapshot) -> BannerDocument:
    data = doc.to_dict() or {}
    schedule_data = data.get("schedule") or {
        "start_time": data.get("created_at") or now_iso(),
        "end_time": None,
        "duration_minutes": None,
    }
    return BannerDocument(
        id=doc.id,
        title=data.get("title", ""),
        description=data.get("description", ""),
        banner_url=data.get("banner_url"),
        banner_badge_text=data.get("banner_badge_text"),
        banner_cta_text=data.get("banner_cta_text"),
        banner_cta_url=data.get("banner_cta_url"),
        schedule=BannerSchedule.model_validate(schedule_data),
        status=data.get("status", BannerStatus.PUBLISHED.value),
        created_by=data.get("created_by"),
        created_at=data.get("created_at") or now_iso(),
        updated_at=data.get("updated_at") or now_iso(),
    )


@router.get("", response_model=BannerListResponse)
def list_banners(
    status_filter: Optional[BannerStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """List dashboard hero banners."""
    is_admin = is_admin_user(current_user)
    query = db.collection(BANNERS_COLLECTION)

    if status_filter:
        if not is_admin and status_filter != BannerStatus.PUBLISHED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Non-admin users can only view published banners.",
            )
        query = query.where("status", "==", status_filter.value)
    elif not is_admin:
        query = query.where("status", "==", BannerStatus.PUBLISHED.value)

    docs = list(query.stream())
    banners: List[BannerDocument] = []
    now_str = now_iso()

    for doc in docs:
        b = _doc_to_banner_document(doc)
        # For non-admins, filter out expired banners if end_time is in the past
        if not is_admin:
            if b.schedule.end_time and b.schedule.end_time.isoformat() < now_str:
                continue
        banners.append(b)

    # Sort newest schedule start_time first
    banners.sort(key=lambda b: b.schedule.start_time, reverse=True)

    total = len(banners)
    paged = banners[:limit]

    return BannerListResponse(banners=paged, total=total)


@router.get("/{id}", response_model=BannerDocument)
def get_banner(
    id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """Get banner details by ID."""
    doc = db.collection(BANNERS_COLLECTION).document(id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Banner '{id}' not found",
        )
    banner = _doc_to_banner_document(doc)
    if banner.status != BannerStatus.PUBLISHED.value and not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Banner '{id}' not found",
        )
    return banner


@router.post("", response_model=BannerDocument, status_code=status.HTTP_201_CREATED)
def create_banner(
    payload: BannerCreate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Create a new dashboard hero banner (Admin only)."""
    admin_uid = get_user_uid(current_user)
    banner_id = f"bnr_{uuid.uuid4().hex[:10]}"
    now_timestamp = now_iso()

    data = {
        "id": banner_id,
        "title": payload.title,
        "description": payload.description,
        "banner_url": payload.banner_url,
        "banner_badge_text": payload.banner_badge_text,
        "banner_cta_text": payload.banner_cta_text,
        "banner_cta_url": payload.banner_cta_url,
        "schedule": payload.schedule.model_dump(mode="json"),
        "status": payload.status.value,
        "created_by": admin_uid,
        "created_at": now_timestamp,
        "updated_at": now_timestamp,
    }

    db.collection(BANNERS_COLLECTION).document(banner_id).set(data)
    doc = db.collection(BANNERS_COLLECTION).document(banner_id).get()
    return _doc_to_banner_document(doc)


@router.put("/{id}", response_model=BannerDocument)
def update_banner(
    id: str,
    payload: BannerUpdate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Update a dashboard hero banner (Admin only)."""
    doc_ref = db.collection(BANNERS_COLLECTION).document(id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Banner '{id}' not found",
        )

    update_dict = payload.model_dump(mode="json", exclude_unset=True)
    if "status" in update_dict and isinstance(update_dict["status"], BannerStatus):
        update_dict["status"] = update_dict["status"].value
    update_dict["updated_at"] = now_iso()

    doc_ref.update(update_dict)
    updated_doc = doc_ref.get()
    return _doc_to_banner_document(updated_doc)


@router.delete("/{id}")
def delete_banner(
    id: str,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Delete a dashboard hero banner (Admin only)."""
    doc_ref = db.collection(BANNERS_COLLECTION).document(id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Banner '{id}' not found",
        )
    doc_ref.delete()
    return {"message": f"Banner '{id}' deleted successfully"}


@router.post("/media", summary="Upload a hero banner image (Admin only)")
def upload_banner_media(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Upload banner image to Firebase Storage."""
    try:
        payload, extension = read_image(file.file, file.content_type)
    except ImageRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    destination_path = f"banners/media/{uuid.uuid4().hex}.{extension}"
    try:
        url = upload_file_to_storage(
            io.BytesIO(payload),
            destination_path,
            f"image/{'jpeg' if extension == 'jpg' else extension}",
            shareable=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Image storage is unavailable. Try again later.",
        ) from exc

    return {"url": url}
