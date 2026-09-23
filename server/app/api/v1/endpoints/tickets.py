"""Read-only mirror of what members file through the YUVI Discord bot.

This API never writes to the tickets collection. Discord is the only intake
path; the website reflects it. See docs/DATA_CONTRACT.md.

Route handlers here are deliberately sync `def` rather than `async def`: the
Firestore client is blocking, so FastAPI runs these in a threadpool instead of
stalling the event loop.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.security import get_current_user
from app.firebase import db
from app.services.discord_link import linked_discord_id
from app.schemas.tickets import (
    HIDDEN_CATEGORIES,
    TicketAuthor,
    TicketDetail,
    TicketListResponse,
    TicketMessage,
    TicketSummary,
    TicketThread,
    order_fields,
)

router = APIRouter(prefix="/tickets", tags=["Discord mirror"])

TICKETS = "tickets"
MESSAGES = "messages"
USERS = "users"
MAX_TICKETS = 100
MAX_MESSAGES = 300


def _iso(value: Any) -> Optional[str]:
    """Normalise a Firestore value to an ISO-8601 string.

    The users collection stores ISO strings while tickets store native server
    timestamps, so the wire format is unified here rather than leaving the
    frontend to branch on which collection a date came from.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value
    isoformat = getattr(value, "isoformat", None)
    return isoformat() if callable(isoformat) else str(value)


def _author(raw: Optional[Dict[str, Any]]) -> Optional[TicketAuthor]:
    if not raw:
        return None
    return TicketAuthor(
        discord_id=str(raw["discord_id"]) if raw.get("discord_id") else None,
        username=raw.get("username") or "Unknown",
        avatar_url=raw.get("avatar_url"),
    )


def _thread_url(data: Dict[str, Any]) -> Optional[str]:
    meta = data.get("discord_meta") or {}
    guild = data.get("guild_id") or meta.get("guild_id")
    thread = data.get("thread_id") or meta.get("thread_id")
    if not guild or not thread:
        return None
    return f"https://discord.com/channels/{guild}/{thread}"


def _summary(doc_id: str, data: Dict[str, Any]) -> TicketSummary:
    return TicketSummary(
        id=doc_id,
        category=data.get("category") or "misc",
        title=data.get("title") or "Untitled",
        status=data.get("status") or "open",
        created_by=_author(data.get("created_by")),
        assigned_to=_author(data.get("assigned_to")),
        created_at=_iso(data.get("created_at")),
        updated_at=_iso(data.get("updated_at")),
        thread_url=_thread_url(data),
    )


@router.get("", response_model=TicketListResponse, summary="List the caller's own tickets")
def list_my_tickets(current_user: dict = Depends(get_current_user)) -> TicketListResponse:
    """Everything the signed-in member has filed through Discord.

    Scoped to the caller: a member only ever sees tickets whose `created_by`
    matches their own linked Discord account. Misconduct reports are excluded
    unconditionally.
    """
    email = (current_user.get("email") or "").lower().strip()
    discord_id = linked_discord_id(db, email)
    if not discord_id:
        # Not an error. The member simply has not linked Discord yet, and the
        # frontend needs to tell those two cases apart.
        return TicketListResponse(linked=False, tickets=[])

    query = (
        db.collection(TICKETS)
        .where("created_by.discord_id", "==", discord_id)
    )

    tickets: List[TicketSummary] = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        if (data.get("category") or "misc") in HIDDEN_CATEGORIES:
            continue
        tickets.append(_summary(doc.id, data))

    # Filter and sort the complete owned set before capping. Applying limit
    # first selects arbitrary document IDs and lets reports displace real tickets.
    tickets.sort(key=lambda t: t.updated_at or t.created_at or "", reverse=True)
    return TicketListResponse(linked=True, tickets=tickets[:MAX_TICKETS])


@router.get("/{ticket_id}", response_model=TicketThread, summary="One ticket and its conversation")
def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)) -> TicketThread:
    email = (current_user.get("email") or "").lower().strip()
    discord_id = linked_discord_id(db, email)

    doc = db.collection(TICKETS).document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    data = doc.to_dict() or {}
    category = data.get("category") or "misc"
    owner = str((data.get("created_by") or {}).get("discord_id") or "")

    # A missing link, a foreign ticket and a hidden category all answer 404
    # rather than 403, so the response cannot be used to probe for the
    # existence of other members' tickets.
    if category in HIDDEN_CATEGORIES or not discord_id or owner != discord_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    summary = _summary(doc.id, data)
    detail = TicketDetail(
        **summary.model_dump(),
        description=data.get("description") or "",
        fields=order_fields(category, data.get("fields")),
        close_reason=data.get("close_reason"),
        closed_at=_iso(data.get("closed_at")),
    )

    messages: List[TicketMessage] = []
    stream = (
        db.collection(TICKETS).document(ticket_id).collection(MESSAGES)
        .order_by("timestamp", direction="DESCENDING")
        .limit(MAX_MESSAGES)
        .stream()
    )
    for msg in stream:
        raw = msg.to_dict() or {}
        messages.append(
            TicketMessage(
                id=msg.id,
                sender_name=raw.get("sender_name") or "Unknown",
                sender_avatar=raw.get("sender_avatar"),
                sender_role=raw.get("sender_role") or "user",
                source=raw.get("source") or "discord",
                content=raw.get("content") or "",
                attachments=raw.get("attachments") or [],
                timestamp=_iso(raw.get("timestamp")),
            )
        )

    messages.reverse()
    return TicketThread(ticket=detail, messages=messages)
