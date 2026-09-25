"""Unified Tickets & Support API endpoints.

Implements the ticket pipeline connecting the Web Dashboard and Discord YUVI bot.
Maintains pure UID references with zero user denormalization.
"""

import hashlib
import json
import secrets
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from google.cloud import firestore

from app.api.security import get_admin_user, get_current_user
from app.utils import is_admin_user, iso_str, now_iso
from app.services.firebase import db
from app.services.discord_link import linked_discord_id
from app.services.config import get_settings
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


def _to_ticket_summary(doc_id: str, data: Dict[str, Any]) -> TicketSummary:
    discord_meta = _to_discord_meta(data)
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
    )


def _to_ticket_detail(doc_id: str, data: Dict[str, Any]) -> TicketDetail:
    summary = _to_ticket_summary(doc_id, data)
    return TicketDetail(
        **summary.model_dump(),
        description=data.get("description"),
        fields=data.get("fields") or {},
        closed_by_uid=data.get("closed_by_uid"),
        close_reason=data.get("close_reason"),
        closed_at=iso_str(data.get("closed_at")),
        discord_meta=_to_discord_meta(data),
    )


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

    # Confidential reports stay off the member website. The admin API is the
    # only route that may inspect one.
    if category in HIDDEN_CATEGORIES:
        if not is_admin:
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
        if (data.get("category") or TicketCategory.MISC.value) in HIDDEN_CATEGORIES:
            continue
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

    ticket_doc: Dict[str, Any] = {
        "id": ticket_id,
        "category": ticket_in.category.value,
        "title": ticket_in.title,
        "description": ticket_in.description,
        "status": TicketStatus.OPEN.value,
        "priority": TicketPriority.MEDIUM.value,  # System default: cannot be set by user
        "spg_id": ticket_in.spg_id,
        "fields": ticket_in.fields,
        "created_by_uid": uid,
        "assigned_to_uid": None,
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
            "fields": ticket_in.fields,
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
        except Exception:
            # Ticket creation continues even if Discord bot is temporarily unreachable
            pass

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
        except Exception:
            pass

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

    doc_ref.update(updates)
    refreshed = doc_ref.get().to_dict() or {}
    return _to_ticket_detail(ticket_id, refreshed)


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
    updates: Dict[str, Any] = {
        "assigned_to_uid": payload.assigned_to_uid,
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
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
):
    """Internal webhook called by YUVI bot when a Discord thread message is created."""
    if (
        not settings.bot_internal_secret
        or not x_internal_secret
        or not secrets.compare_digest(x_internal_secret, settings.bot_internal_secret)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal sync secret.",
        )

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
