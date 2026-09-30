"""Unified Tickets & Support API endpoints.

Implements the ticket pipeline connecting the Web Dashboard and Discord YUVI bot.
Maintains pure UID references with zero user denormalization.
"""

import hashlib
import json
import logging
import secrets
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from google.cloud import firestore
from pydantic import ValidationError


from app.api.security import (
    get_admin_user,
    get_current_user,
    verify_internal_bot_secret,
)
from app.utils import is_admin_user, iso_str, now_iso
from app.services.firebase import db
from app.services.discord_link import linked_discord_id
from app.services.config import get_settings
from app.services import spgs as spg_service, uploads
from app.schemas.spgs import SPGCreate, SPGTrack, SPGType, SPGVisibility
from app.schemas.tickets import (
    AdminAssignTicket,
    AdminUpdateTicketPriority,
    AdminUpdateTicketStatus,
    BotSyncMessageRequest,
    DiscordMeta,
    HIDDEN_CATEGORIES,
    MessageSource,
    SenderRole,
    TicketCategory,
    TicketCloseRequest,
    TicketCreate,
    TicketDetail,
    TicketListResponse,
    TicketMessage,
    TicketMessageCreate,
    TicketPriority,
    TicketStatus,
    TicketSummary,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])
settings = get_settings()
logger = logging.getLogger(__name__)

TICKETS_COLLECTION = "tickets"
MESSAGES_SUBCOLLECTION = "messages"
USERS_COLLECTION = "users"
MAX_MESSAGES = 300


def _bot_endpoint(path: str) -> str:
    base = settings.yuvi_bot_url.rstrip("/")
    legacy_verify_path = "/internal/verify-success"
    if base.endswith(legacy_verify_path):
        base = base[: -len(legacy_verify_path)]
    return f"{base}/{path.lstrip('/')}"


def _identity_keys(current_user: dict) -> set[str]:
    keys = {str(current_user["uid"])}
    discord_id = linked_discord_id(db, current_user["uid"], current_user.get("email") or "")
    if discord_id:
        keys.add(discord_id)
    return keys


def _extract_creator_uid(data: Dict[str, Any]) -> str:
    """Extract creator UID from either new format (created_by_uid) or legacy format (created_by.uid)."""
    if data.get("created_by_uid"):
        return str(data["created_by_uid"])
    created_by = data.get("created_by")
    if isinstance(created_by, dict):
        if created_by.get("uid"):
            return str(created_by["uid"])
        discord_id = created_by.get("discord_id")
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
    return str(created_by or "")


def _extract_assigned_uid(data: Dict[str, Any]) -> Optional[str]:
    if data.get("assigned_to_uid"):
        return str(data["assigned_to_uid"])
    assigned_to = data.get("assigned_to")
    if isinstance(assigned_to, dict):
        return str(assigned_to.get("uid") or assigned_to.get("discord_id") or "")
    return str(assigned_to) if assigned_to else None


def _to_discord_meta(data: Dict[str, Any]) -> Optional[DiscordMeta]:
    raw_meta = data.get("discord_meta") or {}
    guild_id = data.get("guild_id") or raw_meta.get("guild_id")
    channel_id = data.get("channel_id") or raw_meta.get("channel_id")
    thread_id = data.get("thread_id") or raw_meta.get("thread_id")
    thread_url = raw_meta.get("thread_url")
    if not thread_url and guild_id and thread_id:
        thread_url = f"https://discord.com/channels/{guild_id}/{thread_id}"

    if guild_id or thread_id or thread_url:
        return DiscordMeta(
            guild_id=guild_id,
            channel_id=channel_id,
            thread_id=thread_id,
            thread_url=thread_url,
        )
    return None


def _get_user_info(uid: Optional[str]) -> Dict[str, Optional[str]]:
    if not uid:
        return {"name": None, "email": None, "avatar_url": None}
    try:
        user_doc = db.collection(USERS_COLLECTION).document(uid).get()
        if user_doc and user_doc.exists:
            u_data = user_doc.to_dict() or {}
            return {
                "name": u_data.get("full_name") or u_data.get("name"),
                "email": u_data.get("email"),
                "avatar_url": u_data.get("avatar_url") or u_data.get("photo_url"),
            }
    except Exception as exc:
        logger.debug("Failed to fetch user info for uid %s: %s", uid, exc)
    return {"name": None, "email": None, "avatar_url": None}


def _to_ticket_summary(doc_id: str, data: Dict[str, Any]) -> TicketSummary:
    discord_meta = _to_discord_meta(data)
    legacy_creator = data.get("created_by") if isinstance(data.get("created_by"), dict) else {}
    created_by_name = (
        data.get("created_by_name")
        or legacy_creator.get("username")
        or legacy_creator.get("name")
    )
    return TicketSummary(
        id=doc_id,
        category=data.get("category") or TicketCategory.MISC,
        title=data.get("title") or "Untitled Ticket",
        status=data.get("status") or TicketStatus.OPEN,
        priority=data.get("priority") or TicketPriority.MEDIUM,
        created_by_uid=_extract_creator_uid(data),
        assigned_to_uid=_extract_assigned_uid(data),
        spg_id=data.get("spg_id"),
        created_at=iso_str(data.get("created_at")),
        updated_at=iso_str(data.get("updated_at")),
        thread_url=discord_meta.thread_url if discord_meta else None,
        created_by_name=created_by_name,
        assigned_to_name=data.get("assigned_to_name"),
    )


def _to_ticket_detail(doc_id: str, data: Dict[str, Any]) -> TicketDetail:
    summary = _to_ticket_summary(doc_id, data)
    creator_info = _get_user_info(summary.created_by_uid)
    assigned_info = _get_user_info(summary.assigned_to_uid)
    detail_data = summary.model_dump()
    detail_data.update({
        "description": data.get("description"),
        "fields": data.get("fields") or {},
        "closed_by_uid": data.get("closed_by_uid"),
        "close_reason": data.get("close_reason"),
        "closed_at": iso_str(data.get("closed_at")),
        "discord_meta": _to_discord_meta(data),
        "created_by_name": summary.created_by_name or creator_info["name"],
        "created_by_email": data.get("created_by_email") or creator_info["email"],
        "created_by_avatar": data.get("created_by_avatar") or creator_info["avatar_url"],
        "assigned_to_name": summary.assigned_to_name or assigned_info["name"],
        "assigned_to_email": data.get("assigned_to_email") or assigned_info["email"],
        "assigned_to_avatar": data.get("assigned_to_avatar") or assigned_info["avatar_url"],
    })
    return TicketDetail(**detail_data)


def _to_ticket_message(msg_id: str, data: Dict[str, Any]) -> TicketMessage:
    return TicketMessage(
        id=msg_id,
        sender_uid=data.get("sender_uid") or data.get("sender_id"),
        sender_name=data.get("sender_name"),
        sender_role=data.get("sender_role") or SenderRole.USER,
        source=data.get("source") or MessageSource.WEB,
        content=data.get("content") or "",
        attachments=data.get("attachments") or [],
        discord_message_id=data.get("discord_message_id"),
        timestamp=iso_str(data.get("timestamp")),
    )


def _verify_ticket_access(
    ticket_data: Dict[str, Any], current_user: dict, is_admin: bool
) -> None:
    if is_admin:
        return
    category = ticket_data.get("category") or TicketCategory.MISC.value
    creator_uid = _extract_creator_uid(ticket_data)
    identities = _identity_keys(current_user)

    # Confidential reports are visible only to core admins and the creator.
    if category in HIDDEN_CATEGORIES:
        if not is_admin and creator_uid not in identities:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
            )
        return

    # A legacy Discord ticket needs a proven reciprocal link. Resolving its
    # creator ID through an old alias alone is not ownership proof.
    if not ticket_data.get("created_by_uid"):
        raw_creator = ticket_data.get("created_by") or {}
        legacy_id = raw_creator.get("discord_id") if isinstance(raw_creator, dict) else None
        proven_id = linked_discord_id(db, current_user["uid"], current_user.get("email") or "")
        if not legacy_id or str(legacy_id) != proven_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    # Regular tickets can be read by owner or admins
    if not is_admin and creator_uid not in identities:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )


# ---------------------------------------------------------------------------
# Member & General Ticket Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/my",
    response_model=TicketListResponse,
    summary="List tickets filed by the current member",
)
def list_my_tickets(
    current_user: dict = Depends(get_current_user),
) -> TicketListResponse:
    """Fetch all tickets created by the authenticated member."""
    uid = current_user["uid"]

    docs = list(
        db.collection(TICKETS_COLLECTION).where("created_by_uid", "==", uid).stream()
    )
    discord_id = linked_discord_id(db, uid, current_user.get("email") or "")
    if discord_id:
        legacy_docs = (
            db.collection(TICKETS_COLLECTION)
            .where("created_by.discord_id", "==", str(discord_id))
            .stream()
        )
        docs = list({doc.id: doc for doc in [*docs, *legacy_docs]}.values())

    tickets: List[TicketSummary] = []
    for doc in docs:
        data = doc.to_dict() or {}
        tickets.append(_to_ticket_summary(doc.id, data))

    # Sort newest first
    tickets.sort(key=lambda t: t.updated_at or t.created_at or "", reverse=True)
    visible = tickets[:100]
    return TicketListResponse(total=len(tickets), items=visible)


@router.get("/{ticket_id}", response_model=TicketDetail, summary="Get ticket details")
def get_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
) -> TicketDetail:
    """Get single ticket details. Restricted to owner or club admins."""
    doc = db.collection(TICKETS_COLLECTION).document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    is_admin = is_admin_user(current_user)
    _verify_ticket_access(data, current_user, is_admin)

    return _to_ticket_detail(doc.id, data)


def _positive_days(value: Any, label: str) -> int:
    if isinstance(value, bool) or not (
        isinstance(value, int)
        or (isinstance(value, str) and value.strip().isdigit())
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} must be a positive integer in days.",
        )
    days = int(value)
    if days <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} must be a positive integer in days.",
        )
    return days


def _validate_spg_registration_fields(fields: Dict[str, Any], creator_uid: str) -> Dict[str, Any]:
    """Validate SPG registration fields with strict checks:
    - Leader must be mandatory, single UID, and an active club member (is_member == True)
    - Team members optional, list of UIDs, max 6
    - Duration and frequency must be separate fields, entered as positive integers in days
    """
    fields_copy = dict(fields or {})

    # 1. Leader UID
    raw_leader = (
        fields_copy.get("leader_uid")
        or fields_copy.get("Team Leader UID")
        or fields_copy.get("team_leader")
        or fields_copy.get("Team Leader")
    )
    leader_uid = str(raw_leader).strip() if raw_leader else creator_uid
    if "(" in leader_uid and leader_uid.endswith(")"):
        leader_uid = leader_uid.split("(")[-1].rstrip(")")

    if not leader_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A team leader UID is mandatory for SPG registration.",
        )

    leader_doc = db.collection(USERS_COLLECTION).document(leader_uid).get()
    leader_data = leader_doc.to_dict() or {} if leader_doc.exists else {}
    if leader_data.get("id") != leader_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Team leader '{leader_uid}' must be a canonical member UID.",
        )
    if not leader_data.get("is_member", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Team leader '{leader_data.get('full_name', leader_uid)}' must be an active club member (is_member: true).",
        )

    # 2. Team Members
    raw_members = (
        fields_copy.get("member_uids")
        or fields_copy.get("Team Member UIDs")
        or fields_copy.get("team_members")
        or fields_copy.get("Team Members")
    )
    member_uids: List[str] = []
    if isinstance(raw_members, list):
        member_uids = [str(m).strip() for m in raw_members if str(m).strip()]
    elif isinstance(raw_members, str) and raw_members.strip():
        for line in raw_members.replace(",", "\n").splitlines():
            item = line.strip()
            if "(" in item and item.endswith(")"):
                item = item.split("(")[-1].rstrip(")")
            if item and item.lower() != "none":
                member_uids.append(item)

    # Deduplicate and exclude leader
    deduped_members: List[str] = []
    for m in member_uids:
        if m != leader_uid and m not in deduped_members:
            deduped_members.append(m)

    if len(deduped_members) > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An SPG may have at most 6 team members (excluding the team leader).",
        )

    # Validate that members exist
    member_names: List[str] = []
    for m_uid in deduped_members:
        m_doc = db.collection(USERS_COLLECTION).document(m_uid).get()
        m_data = m_doc.to_dict() or {} if m_doc.exists else {}
        if m_data.get("id") != m_uid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team member '{m_uid}' must be a canonical member UID.",
            )
        m_name = m_data.get("full_name") or m_uid
        member_names.append(f"{m_name} ({m_uid})")

    # 3. Duration & Frequency
    raw_duration = (
        fields_copy.get("duration_days")
        or fields_copy.get("Duration (Days)")
        or fields_copy.get("duration")
    )
    if raw_duration is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estimated duration in days is required.",
        )
    duration_days = _positive_days(raw_duration, "Estimated duration")

    raw_frequency = (
        fields_copy.get("frequency_days")
        or fields_copy.get("Report Frequency (Days)")
        or fields_copy.get("frequency")
    )
    if raw_frequency is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report frequency in days is required.",
        )
    frequency_days = _positive_days(raw_frequency, "Report frequency")

    # 4. Standardize fields
    fields_copy["leader_uid"] = leader_uid
    fields_copy["Team Leader UID"] = leader_uid
    leader_name = leader_data.get("full_name") or leader_uid
    fields_copy["Team Leader"] = f"{leader_name} ({leader_uid})"
    fields_copy["member_uids"] = deduped_members
    fields_copy["Team Member UIDs"] = deduped_members
    fields_copy["Team Members"] = ", ".join(member_names) if member_names else "None"
    fields_copy["duration_days"] = duration_days
    fields_copy["Duration (Days)"] = duration_days
    fields_copy["frequency_days"] = frequency_days
    fields_copy["Report Frequency (Days)"] = frequency_days

    return fields_copy


@router.post(
    "",
    response_model=TicketDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new ticket",
)
def create_ticket(
    ticket_in: TicketCreate,
    current_user: dict = Depends(get_current_user),
) -> TicketDetail:
    """Create a ticket from the web dashboard. Priority is assigned to 'medium' automatically."""
    uid = current_user["uid"]
    now = now_iso()
    ticket_id = f"tkt_{uuid.uuid4().hex[:8]}"

    if ticket_in.category == TicketCategory.SPG_REGISTRATION:
        validated_fields = _validate_spg_registration_fields(ticket_in.fields, uid)
    else:
        validated_fields = ticket_in.fields

    creator_info = _get_user_info(uid)
    creator_name = creator_info["name"] or current_user.get("name") or current_user.get("full_name")
    creator_email = creator_info["email"] or current_user.get("email")

    ticket_doc: Dict[str, Any] = {
        "id": ticket_id,
        "category": ticket_in.category.value,
        "title": ticket_in.title,
        "description": ticket_in.description,
        "status": TicketStatus.OPEN.value,
        "priority": TicketPriority.MEDIUM.value,  # System default: cannot be set by user
        "spg_id": ticket_in.spg_id,
        "fields": validated_fields,
        "created_by_uid": uid,
        "created_by_name": creator_name,
        "created_by_email": creator_email,
        "assigned_to_uid": None,
        "assigned_to_name": None,
        "closed_by_uid": None,
        "close_reason": None,
        "closed_at": None,
        "discord_meta": None,
        "created_at": now,
        "updated_at": now,
    }

    ticket_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    ticket_ref.set(ticket_doc)

    # Dispatch to YUVI Discord bot if configured to open a private Discord thread
    if settings.yuvi_bot_url and settings.bot_internal_secret:
        bot_payload = {
            "ticket_id": ticket_id,
            "category": ticket_in.category.value,
            "title": ticket_in.title,
            "creator_uid": uid,
            "fields": validated_fields,
        }
        try:
            req = urllib.request.Request(
                _bot_endpoint("/tickets/create-thread"),
                data=json.dumps(bot_payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Secret": settings.bot_internal_secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if res_data.get("discord_meta"):
                    ticket_doc["discord_meta"] = res_data["discord_meta"]
                    ticket_ref.update({"discord_meta": res_data["discord_meta"]})
        except Exception as exc:
            # Keep the dashboard ticket, but make Discord delivery failures visible.
            logger.warning("Discord thread creation failed for ticket %s: %s", ticket_id, type(exc).__name__)

    return _to_ticket_detail(ticket_id, ticket_doc)


@router.get(
    "/{ticket_id}/messages",
    response_model=List[TicketMessage],
    summary="Fetch messages for a ticket thread",
)
def get_ticket_messages(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
) -> List[TicketMessage]:
    """Fetch chronological message thread for a ticket."""
    doc = db.collection(TICKETS_COLLECTION).document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    is_admin = is_admin_user(current_user)
    _verify_ticket_access(data, current_user, is_admin)

    stream = (
        db.collection(TICKETS_COLLECTION)
        .document(ticket_id)
        .collection(MESSAGES_SUBCOLLECTION)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(MAX_MESSAGES)
        .stream()
    )

    messages: List[TicketMessage] = []
    for msg in stream:
        messages.append(_to_ticket_message(msg.id, msg.to_dict() or {}))

    messages.reverse()
    return messages


@router.post(
    "/{ticket_id}/messages",
    response_model=TicketMessage,
    status_code=status.HTTP_201_CREATED,
    summary="Post a message to a ticket",
)
def post_ticket_message(
    ticket_id: str,
    message_in: TicketMessageCreate,
    current_user: dict = Depends(get_current_user),
) -> TicketMessage:
    """Post a message from the web dashboard. Relayed to Discord thread if active."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    is_admin = is_admin_user(current_user)
    _verify_ticket_access(data, current_user, is_admin)

    now = now_iso()
    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    role = SenderRole.ADMIN if is_admin else SenderRole.USER

    msg_doc = {
        "id": msg_id,
        "sender_uid": current_user["uid"],
        "sender_role": role.value,
        "source": MessageSource.WEB.value,
        "content": message_in.content,
        "attachments": message_in.attachments,
        "discord_message_id": None,
        "timestamp": now,
    }

    # Save to subcollection and bump ticket updated_at
    doc_ref.collection(MESSAGES_SUBCOLLECTION).document(msg_id).set(msg_doc)
    doc_ref.update({"updated_at": now})

    # Relay to Discord thread via bot if bridged
    discord_meta = data.get("discord_meta") or {}
    thread_id = discord_meta.get("thread_id") or data.get("thread_id")

    if thread_id and settings.yuvi_bot_url and settings.bot_internal_secret:
        relay_payload = {
            "ticket_id": ticket_id,
            "thread_id": thread_id,
            "sender_uid": current_user["uid"],
            "content": message_in.content,
            "attachments": message_in.attachments,
        }
        try:
            req = urllib.request.Request(
                _bot_endpoint("/tickets/relay-message"),
                data=json.dumps(relay_payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Secret": settings.bot_internal_secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0):
                pass
        except Exception as exc:
            logger.warning("Discord message relay failed for ticket %s: %s", ticket_id, type(exc).__name__)

    return _to_ticket_message(msg_id, msg_doc)


@router.post(
    "/{ticket_id}/close", response_model=TicketDetail, summary="Close a ticket"
)
def close_ticket(
    ticket_id: str,
    payload: TicketCloseRequest,
    current_user: dict = Depends(get_current_user),
) -> TicketDetail:
    """Close an open ticket with an optional close reason."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    is_admin = is_admin_user(current_user)
    _verify_ticket_access(data, current_user, is_admin)

    now = now_iso()
    updates = {
        "status": TicketStatus.CLOSED.value,
        "closed_by_uid": current_user["uid"],
        "close_reason": payload.close_reason,
        "closed_at": now,
        "updated_at": now,
    }
    doc_ref.update(updates)

    refreshed = doc_ref.get().to_dict() or {}
    return _to_ticket_detail(ticket_id, refreshed)


# ---------------------------------------------------------------------------
# Admin & Staff Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=TicketListResponse,
    summary="Search and filter all tickets (Admin only)",
)
def list_all_tickets(
    category: Optional[TicketCategory] = Query(None, description="Filter by category"),
    status_filter: Optional[TicketStatus] = Query(
        None, alias="status", description="Filter by status"
    ),
    priority: Optional[TicketPriority] = Query(None, description="Filter by priority"),
    assigned_to_uid: Optional[str] = Query(
        None, description="Filter by assigned lead UID"
    ),
    spg_id: Optional[str] = Query(None, description="Filter by linked SPG ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: dict = Depends(get_admin_user),
) -> TicketListResponse:
    """Search and browse all tickets with administrative filters."""
    query = db.collection(TICKETS_COLLECTION)

    if category:
        query = query.where("category", "==", category.value)
    if status_filter:
        query = query.where("status", "==", status_filter.value)
    if priority:
        query = query.where("priority", "==", priority.value)
    if assigned_to_uid:
        query = query.where("assigned_to_uid", "==", assigned_to_uid)
    if spg_id:
        query = query.where("spg_id", "==", spg_id)

    docs = query.stream()
    all_tickets: List[TicketSummary] = []

    for doc in docs:
        data = doc.to_dict() or {}
        all_tickets.append(_to_ticket_summary(doc.id, data))

    # Sort newest first
    all_tickets.sort(key=lambda t: t.updated_at or t.created_at or "", reverse=True)

    total = len(all_tickets)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_tickets[start:end]

    return TicketListResponse(total=total, items=items)


@router.patch(
    "/{ticket_id}/priority",
    response_model=TicketDetail,
    summary="Change ticket priority (Admin only)",
)
def update_ticket_priority(
    ticket_id: str,
    payload: AdminUpdateTicketPriority,
    admin: dict = Depends(get_admin_user),
) -> TicketDetail:
    """Admin-only endpoint to change ticket priority (low, medium, high, urgent)."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    now = now_iso()
    doc_ref.update(
        {
            "priority": payload.priority.value,
            "updated_at": now,
        }
    )

    refreshed = doc_ref.get().to_dict() or {}
    return _to_ticket_detail(ticket_id, refreshed)


@router.patch(
    "/{ticket_id}/status",
    response_model=TicketDetail,
    summary="Update ticket status (Admin only)",
)
def update_ticket_status(
    ticket_id: str,
    payload: AdminUpdateTicketStatus,
    admin: dict = Depends(get_admin_user),
) -> TicketDetail:
    """Admin-only endpoint to transition ticket status."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    now = now_iso()
    updates: Dict[str, Any] = {
        "status": payload.status.value,
        "updated_at": now,
    }

    if payload.status in (TicketStatus.CLOSED, TicketStatus.RESOLVED):
        updates["closed_by_uid"] = admin["uid"]
        updates["closed_at"] = now
        if payload.close_reason:
            updates["close_reason"] = payload.close_reason

    if data.get("category") == TicketCategory.SPG_REGISTRATION.value:
        def update_registration(transaction):
            current = doc_ref.get(transaction=transaction)
            if not current.exists:
                raise HTTPException(status_code=404, detail="Ticket not found.")
            current_data = current.to_dict() or {}
            if current_data.get("spg_id"):
                raise HTTPException(status_code=409, detail="An approved SPG registration cannot be changed through ticket status.")
            if current_data.get("status") in (TicketStatus.CLOSED.value, TicketStatus.RESOLVED.value):
                raise HTTPException(status_code=409, detail="This registration is already closed.")
            if payload.status == TicketStatus.RESOLVED:
                raise HTTPException(status_code=409, detail="Approve the SPG registration to resolve it and create the group.")
            if payload.status == TicketStatus.CLOSED and not payload.close_reason:
                raise HTTPException(status_code=400, detail="A reason is required when rejecting an SPG registration.")
            transaction.update(doc_ref, updates)

        spg_service.run_in_transaction(db, update_registration)
    else:
        doc_ref.update(updates)
    refreshed = doc_ref.get().to_dict() or {}
    return _to_ticket_detail(ticket_id, refreshed)


@router.post(
    "/{ticket_id}/approve-spg",
    response_model=TicketDetail,
    summary="Approve a registration and create its SPG (Admin only)",
)
def approve_spg_ticket(
    ticket_id: str,
    spg_type: SPGType = Form(...),
    track: SPGTrack = Form(...),
    visibility: SPGVisibility = Form(...),
    proposition: Optional[UploadFile] = File(None),
    admin: dict = Depends(get_admin_user),
) -> TicketDetail:
    ticket_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    snapshot = ticket_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    data = snapshot.to_dict() or {}
    if data.get("category") != TicketCategory.SPG_REGISTRATION.value:
        raise HTTPException(status_code=400, detail="Only SPG registration tickets can be approved here.")
    if data.get("spg_id"):
        return _to_ticket_detail(ticket_id, data)
    if data.get("status") in (TicketStatus.CLOSED.value, TicketStatus.RESOLVED.value):
        raise HTTPException(status_code=409, detail="This registration is already closed.")

    fields = data.get("fields") or {}
    raw_name = fields.get("Project Name") or fields.get("project_name") or fields.get("name")
    if not isinstance(raw_name, str) or not raw_name.strip():
        raise HTTPException(status_code=400, detail="The registration has no project name.")
    lead = fields.get("leader_uid") or fields.get("Team Leader UID")
    raw_members = fields.get("member_uids") or fields.get("Team Member UIDs") or []
    if not isinstance(lead, str) or not lead.strip() or not isinstance(raw_members, list):
        raise HTTPException(status_code=400, detail="The registration needs canonical leader and member UIDs.")
    members = [lead.strip()] + [str(uid).strip() for uid in raw_members if str(uid).strip() != lead.strip()]
    if len(members) != len(set(members)) or len(members) > 7:
        raise HTTPException(status_code=400, detail="The registration has duplicate or too many members.")
    stored_track = fields.get("track")
    if stored_track and stored_track != track.value:
        raise HTTPException(status_code=400, detail="The selected track differs from the submitted registration.")
    leader_snapshot = db.collection(USERS_COLLECTION).document(lead.strip()).get()
    if not leader_snapshot.exists or not (leader_snapshot.to_dict() or {}).get("is_member"):
        raise HTTPException(status_code=400, detail="The team leader must still be an active club member.")

    destination = None
    proposition_url = None
    if spg_type is SPGType.PROJECT:
        if proposition is None:
            raise HTTPException(status_code=400, detail="A project SPG needs a proposition PDF.")
        try:
            payload = uploads.read_pdf(proposition.file, proposition.content_type)
        except uploads.UploadRejected as error:
            raise HTTPException(status_code=400, detail=error.detail) from None
        upload_id = hashlib.sha256(f"{ticket_id}:{uuid.uuid4().hex}".encode("utf-8")).hexdigest()[:32]
        destination = uploads.proposition_path(upload_id)
        proposition_url = uploads.store_pdf(payload, destination)
    elif proposition is not None:
        raise HTTPException(status_code=400, detail="Only project SPGs use a proposition PDF.")

    try:
        create = SPGCreate(
            name=raw_name.strip(),
            description=fields.get("Summary & Goals") or data.get("description"),
            type=spg_type,
            track=track,
            visibility=visibility,
            lead_id=lead.strip(),
            member_ids=members,
            source_ticket_id=ticket_id,
            proposition_document_url=proposition_url,
        )

        def approve_in_one_transaction(_db, create_spg_work):
            def work(transaction):
                current = ticket_ref.get(transaction=transaction)
                current_data = current.to_dict() or {}
                if current_data.get("category") != TicketCategory.SPG_REGISTRATION.value or current_data.get("fields") != fields:
                    raise HTTPException(status_code=409, detail="Registration changed while approving.")
                if current_data.get("status") in (TicketStatus.CLOSED.value, TicketStatus.RESOLVED.value) and not current_data.get("spg_id"):
                    raise HTTPException(status_code=409, detail="Registration was closed while approving.")
                record, created = create_spg_work(transaction)
                if current_data.get("spg_id") and current_data["spg_id"] != record.id:
                    raise HTTPException(status_code=409, detail="Registration already links to another SPG.")
                if not current_data.get("spg_id"):
                    now = now_iso()
                    transaction.update(ticket_ref, {
                        "spg_id": record.id,
                        "status": TicketStatus.RESOLVED.value,
                        "closed_by_uid": admin["uid"],
                        "closed_at": now,
                        "updated_at": now,
                    })
                return record, created
            return spg_service.run_in_transaction(_db, work)

        _, created = spg_service.create_spg(db, create=create, admin_id=admin["uid"], runner=approve_in_one_transaction)
        if destination and not created:
            uploads.delete_file(destination)
    except ValidationError as error:
        if destination:
            uploads.delete_file(destination)
        raise HTTPException(status_code=400, detail=str(error)) from None
    except spg_service.SPGError as error:
        if destination:
            uploads.delete_file(destination)
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    except Exception:
        if destination:
            uploads.delete_file(destination)
        raise

    return _to_ticket_detail(ticket_id, ticket_ref.get().to_dict() or {})


@router.patch(
    "/{ticket_id}/assign",
    response_model=TicketDetail,
    summary="Assign ticket to a staff lead (Admin only)",
)
def assign_ticket(
    ticket_id: str,
    payload: AdminAssignTicket,
    admin: dict = Depends(get_admin_user),
) -> TicketDetail:
    """Claim or assign a ticket to a staff lead."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    now = now_iso()
    admin_info = _get_user_info(payload.assigned_to_uid)
    updates: Dict[str, Any] = {
        "assigned_to_uid": payload.assigned_to_uid,
        "assigned_to_name": admin_info["name"],
        "assigned_to_email": admin_info["email"],
        "updated_at": now,
    }
    # Auto-transition open tickets to in_progress
    if data.get("status") == TicketStatus.OPEN.value:
        updates["status"] = TicketStatus.IN_PROGRESS.value

    doc_ref.update(updates)
    refreshed = doc_ref.get().to_dict() or {}
    return _to_ticket_detail(ticket_id, refreshed)


@router.get(
    "/{ticket_id}/transcript", summary="Export markdown chat transcript (Admin only)"
)
def export_ticket_transcript(
    ticket_id: str,
    admin: dict = Depends(get_admin_user),
):
    """Export complete markdown transcript of ticket details and chat conversation."""
    doc = db.collection(TICKETS_COLLECTION).document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    data = doc.to_dict() or {}
    stream = (
        db.collection(TICKETS_COLLECTION)
        .document(ticket_id)
        .collection(MESSAGES_SUBCOLLECTION)
        .order_by("timestamp")
        .stream()
    )

    lines = [
        f"# Ticket Transcript: {data.get('title', 'Untitled')}",
        f"- **Ticket ID:** {ticket_id}",
        f"- **Category:** {data.get('category')}",
        f"- **Priority:** {data.get('priority')}",
        f"- **Status:** {data.get('status')}",
        f"- **Created By (UID):** {_extract_creator_uid(data)}",
        f"- **Created At:** {iso_str(data.get('created_at'))}",
        f"- **Assigned To (UID):** {_extract_assigned_uid(data) or 'Unassigned'}",
        "",
        "## Form Fields",
    ]

    fields = data.get("fields") or {}
    for k, v in fields.items():
        lines.append(f"- **{k}:** {v}")

    lines.extend(["", "## Conversation", ""])

    for msg in stream:
        m = msg.to_dict() or {}
        sender = m.get("sender_uid") or m.get("sender_role") or "Unknown"
        ts = iso_str(m.get("timestamp"))
        source = m.get("source", "web")
        content = m.get("content", "")
        lines.append(f"**[{ts}] {sender} ({source}):**\n{content}\n")

    transcript_md = "\n".join(lines)
    return {"ticket_id": ticket_id, "transcript": transcript_md}


# ---------------------------------------------------------------------------
# Discord Bot Real-Time Sync Webhook
# ---------------------------------------------------------------------------


@router.post(
    "/internal/bot-sync/{ticket_id}",
    summary="Webhook for YUVI bot to sync messages in real time",
)
def bot_sync_message(
    ticket_id: str,
    payload: BotSyncMessageRequest,
    _authorized: bool = Depends(verify_internal_bot_secret),
):
    """Internal webhook called by YUVI bot when a Discord thread message is created."""
    doc_ref = db.collection(TICKETS_COLLECTION).document(ticket_id)
    if not doc_ref.get().exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )

    now = payload.timestamp or now_iso()
    if payload.discord_message_id:
        digest = hashlib.sha256(payload.discord_message_id.encode("utf-8")).hexdigest()
        msg_id = f"msg_discord_{digest[:24]}"
    else:
        msg_id = f"msg_{uuid.uuid4().hex[:10]}"

    msg_doc = {
        "id": msg_id,
        "sender_uid": payload.sender_uid,
        "sender_name": payload.sender_name,
        "sender_role": payload.sender_role.value,
        "source": MessageSource.DISCORD.value,
        "content": payload.content,
        "attachments": payload.attachments,
        "discord_message_id": payload.discord_message_id,
        "timestamp": now,
    }

    doc_ref.collection(MESSAGES_SUBCOLLECTION).document(msg_id).set(msg_doc)
    doc_ref.update({"updated_at": now})

    return {"success": True, "message_id": msg_id}
