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
from app.services import contributions as contribution_service
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
from app.schemas.tickets import TicketCategory, TicketStatus

router = APIRouter(prefix="/ideas", tags=["Idea Jar"])

IDEAS_COLLECTION = "ideas"
TICKETS_COLLECTION = "tickets"
UPVOTES_SUBCOLLECTION = "upvotes"
USERS_COLLECTION = "users"


def _clean_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str) and raw.strip():
        items: List[str] = []
        for line in raw.replace("\r", "").split("\n"):
            line = line.strip()
            if line.startswith("• "):
                line = line[2:].strip()
            elif line.startswith("- "):
                line = line[2:].strip()
            elif len(line) > 2 and line[0].isdigit() and line[1] in (".", ")"):
                line = line[2:].strip()
            elif len(line) > 3 and line[:2].isdigit() and line[2] in (".", ")"):
                line = line[3:].strip()
            if line and line.lower() not in ("none specified", "none", "n/a"):
                items.append(line)
        return items
    return []


def _parse_track(raw: Any) -> IdeaTrack:
    if not raw:
        return IdeaTrack.MISC
    s = str(raw).strip().lower()
    if s.endswith(" track"):
        s = s[:-6].strip()
    return _normalise_track(s)


def _parse_difficulty(raw: Any) -> Optional[IdeaDifficulty]:
    if not raw:
        return None
    s = str(raw).strip().lower()
    try:
        return IdeaDifficulty(s)
    except ValueError:
        if "begin" in s:
            return IdeaDifficulty.BEGINNER
        if "adv" in s:
            return IdeaDifficulty.ADVANCED
        if "inter" in s:
            return IdeaDifficulty.INTERMEDIATE
        return None


def _ticket_to_idea_summary(ticket_id: str, tdata: Dict[str, Any]) -> IdeaSummary:
    fields = tdata.get("fields") or {}
    title = (
        tdata.get("title")
        or fields.get("Idea Title")
        or fields.get("title")
        or "Untitled Idea"
    )
    desc = (
        tdata.get("description")
        or fields.get("Overview")
        or fields.get("description")
        or fields.get("Details")
        or ""
    )
    track_val = fields.get("track") or fields.get("Track") or tdata.get("track")
    diff_val = (
        fields.get("difficulty")
        or fields.get("Difficulty")
        or tdata.get("difficulty")
    )
    st = tdata.get("status")
    status = (
        "closed"
        if st in (TicketStatus.CLOSED.value, "closed")
        else (
            "approved"
            if st in (TicketStatus.RESOLVED.value, "resolved")
            else "pending"
        )
    )
    return IdeaSummary(
        id=ticket_id,
        title=title,
        description=desc,
        track=_parse_track(track_val),
        difficulty=_parse_difficulty(diff_val),
        is_verified=(status == "approved"),
        created_by_uid=_creator_uid(tdata),
        approved_by_uid=None,
        stats=IdeaStats(upvote_count=0, views_count=0, claims_count=0),
        created_at=iso_str(tdata.get("created_at")),
        approved_at=None,
        status=status,
    )


def _ticket_to_idea_detail(ticket_id: str, tdata: Dict[str, Any]) -> IdeaDetail:
    summary = _ticket_to_idea_summary(ticket_id, tdata)
    fields = tdata.get("fields") or {}
    prereqs = _clean_list(fields.get("prerequisites") or fields.get("Prerequisites"))
    roadmap = _clean_list(
        fields.get("rough_roadmap")
        or fields.get("Rough Roadmap")
        or fields.get("roadmap")
    )
    outcomes = _clean_list(
        fields.get("learning_outcomes") or fields.get("Learning Outcomes")
    )
    return IdeaDetail(
        **summary.model_dump(),
        prerequisites=prereqs,
        rough_roadmap=roadmap,
        learning_outcomes=outcomes,
        updated_at=iso_str(tdata.get("updated_at") or tdata.get("created_at")),
    )


def _to_idea_summary(doc_id: str, data: Dict[str, Any]) -> IdeaSummary:
    stats_raw = data.get("stats") or {}
    stats = IdeaStats(
        upvote_count=int(stats_raw.get("upvote_count", 0)),
        views_count=int(stats_raw.get("views_count", 0)),
        claims_count=int(stats_raw.get("claims_count", 0)),
    )
    is_appr = _is_approved(data)
    return IdeaSummary(
        id=doc_id,
        title=data.get("title") or "Untitled Idea",
        description=data.get("description") or "",
        track=_normalise_track(data.get("track")),
        difficulty=data.get("difficulty"),
        is_verified=is_appr,
        created_by_uid=_creator_uid(data),
        approved_by_uid=data.get("approved_by_uid"),
        stats=stats,
        created_at=iso_str(data.get("created_at")),
        approved_at=iso_str(data.get("approved_at")),
        status="approved" if is_appr else "pending",
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

    by_id: Dict[str, IdeaSummary] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        by_id[doc.id] = _to_idea_summary(doc.id, data)

    # Also include tickets submitted by current user with category "idea_jar"
    user_tickets = (
        db.collection(TICKETS_COLLECTION)
        .where("created_by_uid", "==", uid)
        .where("category", "==", TicketCategory.IDEA_JAR.value)
        .stream()
    )
    for doc in user_tickets:
        tdata = doc.to_dict() or {}
        st = tdata.get("status")
        if st not in (
            TicketStatus.RESOLVED.value,
            TicketStatus.CLOSED.value,
            "resolved",
            "closed",
        ):
            by_id[doc.id] = _ticket_to_idea_summary(doc.id, tdata)

    items = list(by_id.values())
    items.sort(key=lambda x: x.created_at or "", reverse=True)
    return IdeaListResponse(
        total=len(items), items=items, page=1, page_size=len(items), has_more=False
    )


@router.get(
    "/admin",
    response_model=IdeaListResponse,
    summary="List all ideas with admin filtering (Admin only)",
)
def admin_list_ideas(
    status: Optional[str] = Query(
        "all", description="'all', 'pending', 'approved', 'closed'"
    ),
    track: Optional[str] = Query(None, description="Filter by track"),
    difficulty: Optional[str] = Query(None, description="Filter by difficulty"),
    search: Optional[str] = Query(
        None, description="Search term in title or description"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: dict = Depends(get_admin_user),
) -> IdeaListResponse:
    """Fetch all ideas (approved, pending, ticket proposals, closed) with search, filter, and pagination."""
    by_id: Dict[str, IdeaSummary] = {}
    seen_ticket_ids = set()

    # 1. All documents from IDEAS_COLLECTION
    for doc in db.collection(IDEAS_COLLECTION).stream():
        data = doc.to_dict() or {}
        by_id[doc.id] = _to_idea_summary(doc.id, data)
        if data.get("ticket_id"):
            seen_ticket_ids.add(data["ticket_id"])

    # 2. All Idea Jar proposals from TICKETS_COLLECTION
    for doc in (
        db.collection(TICKETS_COLLECTION)
        .where("category", "==", TicketCategory.IDEA_JAR.value)
        .stream()
    ):
        if doc.id in seen_ticket_ids:
            continue
        tdata = doc.to_dict() or {}
        approved_idea_id = tdata.get("approved_idea_id")
        if approved_idea_id and approved_idea_id in by_id:
            continue
        by_id[doc.id] = _ticket_to_idea_summary(doc.id, tdata)

    all_items = list(by_id.values())

    # Filtering
    filtered: List[IdeaSummary] = []
    status_lower = status.lower().strip() if status else "all"
    track_lower = track.lower().strip() if track and track != "all" else None
    diff_lower = (
        difficulty.lower().strip() if difficulty and difficulty != "all" else None
    )
    search_lower = search.lower().strip() if search else None

    for item in all_items:
        # Status filter
        if status_lower != "all":
            item_status = (
                item.status or ("approved" if item.is_verified else "pending")
            ).lower()
            if status_lower == "pending" and item_status != "pending":
                continue
            elif status_lower == "approved" and item_status != "approved":
                continue
            elif status_lower in ("closed", "rejected") and item_status not in (
                "closed",
                "rejected",
            ):
                continue

        # Track filter
        if track_lower:
            item_track = (
                item.track.value
                if hasattr(item.track, "value")
                else str(item.track)
            ).lower()
            if item_track != track_lower:
                continue

        # Difficulty filter
        if diff_lower:
            if not item.difficulty:
                continue
            item_diff = (
                item.difficulty.value
                if hasattr(item.difficulty, "value")
                else str(item.difficulty)
            ).lower()
            if item_diff != diff_lower:
                continue

        # Search filter
        if search_lower:
            title_match = search_lower in (item.title or "").lower()
            desc_match = search_lower in (item.description or "").lower()
            if not (title_match or desc_match):
                continue

        filtered.append(item)

    filtered.sort(key=lambda x: x.created_at or "", reverse=True)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = filtered[start:end]

    return IdeaListResponse(
        total=total,
        items=page_items,
        page=page,
        page_size=page_size,
        has_more=end < total,
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
    by_id: Dict[str, IdeaSummary] = {}

    # 1. Unverified ideas from IDEAS_COLLECTION
    for field in ("is_verified", "is_approved"):
        for doc in db.collection(IDEAS_COLLECTION).where(field, "==", False).stream():
            data = doc.to_dict() or {}
            if not _is_approved(data):
                by_id[doc.id] = _to_idea_summary(doc.id, data)

    for doc in db.collection(IDEAS_COLLECTION).stream():
        data = doc.to_dict() or {}
        if not _is_approved(data):
            by_id[doc.id] = _to_idea_summary(doc.id, data)

    # 2. Idea Jar proposals from TICKETS_COLLECTION
    for doc in (
        db.collection(TICKETS_COLLECTION)
        .where("category", "==", TicketCategory.IDEA_JAR.value)
        .stream()
    ):
        tdata = doc.to_dict() or {}
        st = tdata.get("status")
        if st not in (
            TicketStatus.RESOLVED.value,
            TicketStatus.CLOSED.value,
            "resolved",
            "closed",
        ):
            by_id[doc.id] = _ticket_to_idea_summary(doc.id, tdata)

    items = list(by_id.values())
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
        ticket_ref = db.collection(TICKETS_COLLECTION).document(idea_id)
        ticket_doc = ticket_ref.get()
        if ticket_doc.exists:
            tdata = ticket_doc.to_dict() or {}
            if tdata.get("category") == TicketCategory.IDEA_JAR.value:
                is_admin = is_admin_user(current_user) if current_user else False
                creator = _creator_uid(tdata)
                is_owner = current_user and creator in _identity_keys(current_user)
                if not is_admin and not is_owner:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
                    )
                return _ticket_to_idea_detail(idea_id, tdata)

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
    now = now_iso()
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if doc.exists:
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

    ticket_ref = db.collection(TICKETS_COLLECTION).document(idea_id)
    ticket_doc = ticket_ref.get()
    if not ticket_doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    tdata = ticket_doc.to_dict() or {}
    if tdata.get("category") != TicketCategory.IDEA_JAR.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not an Idea Jar proposal.",
        )

    fields = dict(tdata.get("fields") or {})
    ticket_updates: Dict[str, Any] = {"updated_at": now}
    if payload.title is not None:
        ticket_updates["title"] = payload.title
        fields["Idea Title"] = payload.title
        fields["title"] = payload.title
    if payload.description is not None:
        ticket_updates["description"] = payload.description
        fields["Overview"] = payload.description
        fields["description"] = payload.description
    if payload.track is not None:
        fields["track"] = payload.track.value
        fields["Track"] = f"{payload.track.value.upper()} Track"
    if payload.difficulty is not None:
        fields["difficulty"] = payload.difficulty.value
        fields["Difficulty"] = payload.difficulty.value.capitalize()
    if payload.prerequisites is not None:
        fields["prerequisites"] = payload.prerequisites
        fields["Prerequisites"] = "\n".join(f"• {p}" for p in payload.prerequisites)
    if payload.rough_roadmap is not None:
        fields["rough_roadmap"] = payload.rough_roadmap
        fields["Rough Roadmap"] = "\n".join(
            f"{i+1}. {r}" for i, r in enumerate(payload.rough_roadmap)
        )
    if payload.learning_outcomes is not None:
        fields["learning_outcomes"] = payload.learning_outcomes
        fields["Learning Outcomes"] = "\n".join(
            f"• {o}" for o in payload.learning_outcomes
        )

    ticket_updates["fields"] = fields
    ticket_ref.update(ticket_updates)
    refreshed_tdata = ticket_ref.get().to_dict() or {}
    return _ticket_to_idea_detail(idea_id, refreshed_tdata)


def _credit_approved_idea(activity: str, author_uid: Any, title: str, track: Any, occurred_at: Any) -> None:
    """Ask for points for an idea accepted into the jar. An idea is not one of
    the contribution source types, so it is recorded as content with no source,
    and the activity key keeps it from being asked for twice."""
    contribution_service.credit_activity(
        db,
        user_id=author_uid,
        activity=activity,
        details={
            "category": "content",
            # Ideas and contributions share these track names, except YUVI's
            # legacy "other", which the ideas API already maps to "misc".
            "track": track if track in ("kaggle", "product", "research") else "misc",
            "title": f"Idea approved for the Idea Jar: {title}"[:200],
            "occurred_at": occurred_at,
        },
    )


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
    now = now_iso()
    doc_ref = db.collection(IDEAS_COLLECTION).document(idea_id)
    doc = doc_ref.get()

    if doc.exists:
        updates = {
            "is_verified": True,
            "is_approved": True,
            "approved_by_uid": admin["uid"],
            "approved_at": now,
            "updated_at": now,
        }
        doc_ref.update(updates)
        refreshed = doc_ref.get().to_dict() or {}
        _credit_approved_idea(
            f"idea:{idea_id}", refreshed.get("created_by_uid"), refreshed.get("title") or "",
            refreshed.get("track"), refreshed.get("created_at") or now,
        )
        return _to_idea_detail(idea_id, refreshed)

    ticket_ref = db.collection(TICKETS_COLLECTION).document(idea_id)
    ticket_doc = ticket_ref.get()
    if not ticket_doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
        )

    ticket_data = ticket_doc.to_dict() or {}
    if ticket_data.get("category") != TicketCategory.IDEA_JAR.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not an Idea Jar proposal.",
        )

    detail = _ticket_to_idea_detail(idea_id, ticket_data)
    new_idea_id = f"idea_{uuid.uuid4().hex[:8]}"

    new_idea_doc: Dict[str, Any] = {
        "id": new_idea_id,
        "title": detail.title,
        "description": detail.description,
        "track": detail.track.value,
        "difficulty": detail.difficulty.value if detail.difficulty else None,
        "prerequisites": detail.prerequisites,
        "rough_roadmap": detail.rough_roadmap,
        "learning_outcomes": detail.learning_outcomes,
        "is_verified": True,
        "is_approved": True,
        "created_by_uid": ticket_data.get("created_by_uid"),
        "approved_by_uid": admin["uid"],
        "approved_at": now,
        "stats": {
            "upvote_count": 0,
            "views_count": 0,
            "claims_count": 0,
        },
        "ticket_id": idea_id,
        "created_at": ticket_data.get("created_at") or now,
        "updated_at": now,
    }

    db.collection(IDEAS_COLLECTION).document(new_idea_id).set(new_idea_doc)
    # Keyed on the ticket, which is stable if the approval is retried.
    _credit_approved_idea(
        f"idea:{idea_id}", ticket_data.get("created_by_uid"), detail.title,
        new_idea_doc["track"], new_idea_doc["created_at"],
    )

    ticket_ref.update({
        "status": TicketStatus.RESOLVED.value,
        "closed_by_uid": admin["uid"],
        "close_reason": "Idea approved and published to Idea Jar.",
        "approved_idea_id": new_idea_id,
        "updated_at": now,
        "closed_at": now,
    })

    try:
        admin_name = admin.get("full_name") or admin.get("name") or "Admin"
        ticket_ref.collection("messages").document().set({
            "sender_uid": admin["uid"],
            "sender_name": admin_name,
            "sender_role": "admin",
            "source": "web",
            "content": f"🎉 Your Idea Jar proposal '{detail.title}' has been approved and published to the public Idea Jar!",
            "attachments": [],
            "timestamp": now,
        })
    except Exception:
        pass

    return _to_idea_detail(new_idea_id, new_idea_doc)


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

    if doc.exists:
        doc_ref.delete()
        return {"message": "Idea deleted successfully", "id": idea_id}

    ticket_ref = db.collection(TICKETS_COLLECTION).document(idea_id)
    ticket_doc = ticket_ref.get()
    if ticket_doc.exists:
        now = now_iso()
        ticket_ref.update({
            "status": TicketStatus.CLOSED.value,
            "closed_by_uid": admin["uid"],
            "close_reason": "Idea proposal was rejected by admin.",
            "closed_at": now,
            "updated_at": now,
        })
        try:
            admin_name = admin.get("full_name") or admin.get("name") or "Admin"
            ticket_ref.collection("messages").document().set({
                "sender_uid": admin["uid"],
                "sender_name": admin_name,
                "sender_role": "admin",
                "source": "web",
                "content": "This Idea Jar proposal was reviewed and closed.",
                "attachments": [],
                "timestamp": now,
            })
        except Exception:
            pass
        return {"message": "Idea proposal closed", "id": idea_id}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found."
    )
