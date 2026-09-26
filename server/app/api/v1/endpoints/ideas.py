"""Idea Jar API endpoints.

Implements the specification in server/plan.md.
Connects web discovery feed, member submissions, admin moderation, and Discord bot random jar.
"""

import random
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.cloud import firestore

from app.api.security import (
    get_admin_user,
    get_current_user,
    get_optional_current_user,
    get_user_or_bot,
)
from app.utils import is_admin_user, iso_str, now_iso
from app.services.firebase import db
from app.schemas.ideas import (
    IdeaCreate,
    IdeaDetail,
    IdeaDifficulty,
    IdeaListResponse,
    IdeaStats,
    IdeaSummary,
    IdeaTrack,
    IdeaUpdate,
    IdeaUpvoteToggleResponse,
)

router = APIRouter(prefix="/ideas", tags=["Idea Jar"])

IDEAS_COLLECTION = "ideas"
UPVOTES_SUBCOLLECTION = "upvotes"
USERS_COLLECTION = "users"


def _to_idea_summary(doc_id: str, data: Dict[str, Any]) -> IdeaSummary:
    stats_raw = data.get("stats") or {}
    stats = IdeaStats(
        upvote_count=int(stats_raw.get("upvote_count", 0)),
        views_count=int(stats_raw.get("views_count", 0)),
        claims_count=int(stats_raw.get("claims_count", 0)),
    )
    return IdeaSummary(
        id=doc_id,
        title=data.get("title") or "Untitled Idea",
        description=data.get("description") or "",
        track=_normalise_track(data.get("track")),
        difficulty=data.get("difficulty"),
        is_verified=_is_approved(data),
        created_by_uid=_creator_uid(data),
        approved_by_uid=data.get("approved_by_uid"),
        stats=stats,
        created_at=iso_str(data.get("created_at")),
        approved_at=iso_str(data.get("approved_at")),
    )


def _to_idea_detail(doc_id: str, data: Dict[str, Any]) -> IdeaDetail:
    summary = _to_idea_summary(doc_id, data)
    return IdeaDetail(
        **summary.model_dump(),
        prerequisites=data.get("prerequisites") or [],
        rough_roadmap=data.get("rough_roadmap") or data.get("roadmap") or [],
        learning_outcomes=data.get("learning_outcomes") or [],
        updated_at=iso_str(data.get("updated_at")),
    )


def _is_approved(data: Dict[str, Any]) -> bool:
    return data.get("is_verified") is True or data.get("is_approved") is True


def _creator_uid(data: Dict[str, Any]) -> str:
    if data.get("created_by_uid"):
        return str(data["created_by_uid"])
    creator = data.get("created_by")
    if isinstance(creator, dict):
        if creator.get("uid"):
            return str(creator["uid"])
        discord_id = creator.get("discord_id")
        if discord_id:
            profiles = (
                db.collection(USERS_COLLECTION)
                .where("discord_id", "==", str(discord_id))
                .limit(1)
                .get()
            )
            if profiles:
                profile = profiles[0].to_dict() or {}
                return str(
                    profile.get("id") or profile.get("firebase_uid") or profiles[0].id
                )
            return str(discord_id)
    return str(creator or "")


def _normalise_track(value: Any) -> IdeaTrack:
    if value in (None, "other", "general"):
        return IdeaTrack.MISC
    try:
        return IdeaTrack(value)
    except ValueError:
        return IdeaTrack.MISC


def _identity_keys(current_user: Optional[dict]) -> set[str]:
    if not current_user:
        return set()
    keys = {str(current_user["uid"])}
    profile = db.collection(USERS_COLLECTION).document(current_user["uid"]).get()
    if profile.exists:
        discord_id = (profile.to_dict() or {}).get("discord_id")
        if discord_id:
            keys.add(str(discord_id))
    return keys


def _approved_docs():
    """Read both dashboard and legacy YUVI approval fields without a migration."""
    by_id = {}
    for field in ("is_verified", "is_approved"):
        for doc in db.collection(IDEAS_COLLECTION).where(field, "==", True).stream():
            by_id[doc.id] = doc
    return list(by_id.values())


# ---------------------------------------------------------------------------
# Public Discovery Endpoints (Fixed paths first)
# ---------------------------------------------------------------------------


@router.get("/random", response_model=IdeaDetail, summary="Draw a random approved idea")
def get_random_idea(
    track: Optional[IdeaTrack] = Query(None, description="Optional track filter"),
) -> IdeaDetail:
    """Draw a random approved idea (used by Web 'Roll Idea' and YUVI Discord bot)."""
    docs = [
        doc
        for doc in _approved_docs()
        if track is None
        or _normalise_track((doc.to_dict() or {}).get("track")) == track
    ]
    if not docs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No verified ideas available for the selected criteria.",
        )

    chosen = random.choice(docs)
    data = chosen.to_dict() or {}

    # Atomically increment views count
    try:
        chosen.reference.update({"stats.views_count": firestore.Increment(1)})
        data_stats = data.get("stats") or {}
        data_stats["views_count"] = int(data_stats.get("views_count", 0)) + 1
        data["stats"] = data_stats
    except Exception:
        pass

    return _to_idea_detail(chosen.id, data)


@router.get(
    "/my",
    response_model=IdeaListResponse,
    summary="List ideas submitted by current user",
)
def list_my_ideas(
    current_user: dict = Depends(get_current_user),
) -> IdeaListResponse:
    """Fetch all ideas submitted by the authenticated member (including pending ones)."""
    uid = current_user["uid"]
    docs = list(
        db.collection(IDEAS_COLLECTION).where("created_by_uid", "==", uid).stream()
    )
    profile = db.collection(USERS_COLLECTION).document(uid).get()
    discord_id = (profile.to_dict() or {}).get("discord_id") if profile.exists else None
    if discord_id:
        legacy = (
            db.collection(IDEAS_COLLECTION)
            .where("created_by.discord_id", "==", str(discord_id))
            .stream()
        )
        docs = list({doc.id: doc for doc in [*docs, *legacy]}.values())

    items: List[IdeaSummary] = []
    for doc in docs:
        data = doc.to_dict() or {}
        items.append(_to_idea_summary(doc.id, data))

    items.sort(key=lambda x: x.created_at or "", reverse=True)
    return IdeaListResponse(
        total=len(items), items=items, page=1, page_size=len(items), has_more=False
    )


@router.get(
    "/pending",
    response_model=IdeaListResponse,
    summary="List pending ideas for moderation (Admin only)",
)
def list_pending_ideas(
    admin: dict = Depends(get_admin_user),
) -> IdeaListResponse:
    """Fetch all unverified ideas waiting for review in the admin queue."""
    by_id = {}
    for field in ("is_verified", "is_approved"):
        for doc in db.collection(IDEAS_COLLECTION).where(field, "==", False).stream():
            if not _is_approved(doc.to_dict() or {}):
                by_id[doc.id] = doc
    docs = list(by_id.values())

    items: List[IdeaSummary] = []
    for doc in docs:
        data = doc.to_dict() or {}
        items.append(_to_idea_summary(doc.id, data))

    items.sort(key=lambda x: x.created_at or "", reverse=True)
    return IdeaListResponse(
        total=len(items), items=items, page=1, page_size=len(items), has_more=False
    )


@router.get(
    "", response_model=IdeaListResponse, summary="List verified ideas with filters"
)
def list_ideas(
    track: Optional[IdeaTrack] = Query(None, description="Filter by track"),
    difficulty: Optional[IdeaDifficulty] = Query(
        None, description="Filter by difficulty"
    ),
    search: Optional[str] = Query(
        None, description="Search term in title or description"
    ),
    sort_by: str = Query("upvotes", description="'upvotes' or 'newest'"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=50, description="Items per page"),
) -> IdeaListResponse:
    """List verified ideas with filtering and sorting."""
    docs = _approved_docs()
    all_ideas: List[IdeaSummary] = []

    for doc in docs:
        data = doc.to_dict() or {}
        summary = _to_idea_summary(doc.id, data)

        if track and summary.track != track:
            continue
        if difficulty and summary.difficulty != difficulty:
            continue

        if search:
            s = search.lower().strip()
            title_match = s in summary.title.lower()
            desc_match = s in summary.description.lower()
            if not (title_match or desc_match):
                continue

        all_ideas.append(summary)

    # Sort
    if sort_by == "newest":
        all_ideas.sort(key=lambda x: x.approved_at or x.created_at or "", reverse=True)
    else:
        # Default by upvotes
        all_ideas.sort(key=lambda x: x.stats.upvote_count, reverse=True)

    total = len(all_ideas)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_ideas[start:end]

    return IdeaListResponse(
        total=total,
        items=items,
        page=page,
        page_size=page_size,
        has_more=end < total,
    )


# ---------------------------------------------------------------------------
# Individual Idea Endpoints
# ---------------------------------------------------------------------------


@router.get("/{idea_id}", response_model=IdeaDetail, summary="Get single idea details")
def get_idea(
    idea_id: str,
    current_user: Optional[dict] = Depends(get_optional_current_user),
) -> IdeaDetail:
    """Fetch full details for an idea and increment views count."""
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    data = doc.to_dict() or {}
    if not _is_approved(data):
        owner = _creator_uid(data) in _identity_keys(current_user)
        if not owner and not is_admin_user(current_user):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
            )

    # Atomically increment views count
    try:
        doc_ref.update({"stats.views_count": firestore.Increment(1)})
        data_stats = data.get("stats") or {}
        data_stats["views_count"] = int(data_stats.get("views_count", 0)) + 1
        data["stats"] = data_stats
    except Exception:
        pass

    return _to_idea_detail(doc.id, data)


@router.post(
    "",
    response_model=IdeaDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a new idea",
)
def create_idea(
    payload: IdeaCreate,
    current_user: dict = Depends(get_user_or_bot),
) -> IdeaDetail:
    """Submit an idea. Automatically verified if submitted by an admin, else queued for review."""
    uid = payload.creator_uid or current_user["uid"]
    # If submitted directly by a human admin or bot on behalf of an admin
    is_admin = is_admin_user(current_user) and not payload.creator_uid
    now = now_iso()
    idea_id = f"idea_{uuid.uuid4().hex[:8]}"

    idea_doc: Dict[str, Any] = {
        "id": idea_id,
        "title": payload.title,
        "description": payload.description,
        "track": payload.track.value,
        "difficulty": payload.difficulty.value if payload.difficulty else None,
        "prerequisites": payload.prerequisites,
        "rough_roadmap": payload.rough_roadmap,
        "learning_outcomes": payload.learning_outcomes,
        "is_verified": is_admin,  # Direct approval for admin submissions
        "is_approved": is_admin,
        "created_by_uid": uid,
        "approved_by_uid": uid if is_admin else None,
        "approved_at": now if is_admin else None,
        "stats": {
            "upvote_count": 0,
            "views_count": 0,
            "claims_count": 0,
        },
        "created_at": now,
        "updated_at": now,
    }

    db.collection(IDEAS_COLLECTION).document(idea_id).set(idea_doc)
    return _to_idea_detail(idea_id, idea_doc)


@router.patch(
    "/{idea_id}", response_model=IdeaDetail, summary="Edit idea metadata (Admin only)"
)
def update_idea(
    idea_id: str,
    payload: IdeaUpdate,
    admin: dict = Depends(get_admin_user),
) -> IdeaDetail:
    """Admin endpoint to refine roadmap, difficulty, prerequisites, and description."""
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    now = now_iso()
    updates: Dict[str, Any] = {"updated_at": now}

    if payload.title is not None:
        updates["title"] = payload.title
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.track is not None:
        updates["track"] = payload.track.value
    if payload.difficulty is not None:
        updates["difficulty"] = payload.difficulty.value
    if payload.prerequisites is not None:
        updates["prerequisites"] = payload.prerequisites
    if payload.rough_roadmap is not None:
        updates["rough_roadmap"] = payload.rough_roadmap
    if payload.learning_outcomes is not None:
        updates["learning_outcomes"] = payload.learning_outcomes

    doc_ref.update(updates)
    refreshed = doc_ref.get().to_dict() or {}
    return _to_idea_detail(idea_id, refreshed)


@router.post(
    "/{idea_id}/approve",
    response_model=IdeaDetail,
    summary="Approve an idea (Admin only)",
)
def approve_idea(
    idea_id: str,
    admin: dict = Depends(get_admin_user),
) -> IdeaDetail:
    """Approve an idea from the moderation queue, making it live for discovery and random jar."""
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    now = now_iso()
    updates = {
        "is_verified": True,
        "is_approved": True,
        "approved_by_uid": admin["uid"],
        "approved_at": now,
        "updated_at": now,
    }

    doc_ref.update(updates)
    refreshed = doc_ref.get().to_dict() or {}
    return _to_idea_detail(idea_id, refreshed)


@router.post(
    "/{idea_id}/upvote",
    response_model=IdeaUpvoteToggleResponse,
    summary="Toggle upvote on an idea",
)
def toggle_idea_upvote(
    idea_id: str,
    current_user: dict = Depends(get_current_user),
) -> IdeaUpvoteToggleResponse:
    """Toggle upvote state on an approved idea using a Firestore transaction."""
    user_uid = current_user["uid"]
    idea_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    upvote_ref = idea_ref.collection(UPVOTES_SUBCOLLECTION).document(user_uid)

    transaction = db.transaction()

    @firestore.transactional
    def _toggle(txn: firestore.Transaction):
        idea_snap = idea_ref.get(transaction=txn)
        if not idea_snap.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
            )

        upvote_snap = upvote_ref.get(transaction=txn)
        idea_data = idea_snap.to_dict() or {}
        current_upvotes = int((idea_data.get("stats") or {}).get("upvote_count", 0))

        if upvote_snap.exists:
            # Remove upvote
            txn.delete(upvote_ref)
            new_count = max(0, current_upvotes - 1)
            txn.update(idea_ref, {"stats.upvote_count": new_count})
            return False, new_count
        else:
            # Add upvote
            txn.set(
                upvote_ref,
                {
                    "user_uid": user_uid,
                    "created_at": now_iso(),
                },
            )
            new_count = current_upvotes + 1
            txn.update(idea_ref, {"stats.upvote_count": new_count})
            return True, new_count

    upvoted, count = _toggle(transaction)
    return IdeaUpvoteToggleResponse(upvoted=upvoted, upvote_count=count)


@router.delete("/{idea_id}", summary="Delete an idea (Admin only)")
def delete_idea(
    idea_id: str,
    admin: dict = Depends(get_admin_user),
):
    """Delete an inappropriate or outdated idea."""
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    doc_ref.delete()
    return {"message": "Idea deleted successfully", "id": idea_id}
