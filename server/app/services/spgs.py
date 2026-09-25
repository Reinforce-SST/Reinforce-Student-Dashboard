"""Student Project Group persistence and lifecycle.

Members do not create SPGs. A registration raises an `spg_registration` ticket,
and approving that ticket calls `create_spg` — the one creation path, so the
rules cannot drift between the reviewer's route and anything added later.

Identity is the Firebase UID. Because the `users` collection is still keyed
three ways (by UID, by email and by Discord ID), membership is checked with
`canonical_user_exists` rather than a bare document lookup; see that function.

This module never touches contributions or `users.points`. Points are awarded
by an admin through the contribution workflow, separately and afterwards.
"""

import hashlib
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from pydantic import ValidationError

from app.schemas.spgs import (
    SPGCreate,
    SPGRecord,
    SPGStatus,
    SPGTrack,
    SPGType,
    SPGUpdate,
    SPGVisibility,
)

SPGS_COLLECTION = "spgs"
USERS_COLLECTION = "users"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# An SPG award writes one contribution per member in a single transaction, and
# Firestore bounds a transaction. The same ceiling applies to membership.
MAX_MEMBERS = 200


class SPGError(Exception):
    """A failure with the HTTP status the API should answer with."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class SPGRecordInvalid(Exception):
    """A stored SPG document does not match the SPG schema."""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def run_in_transaction(db: Any, work: Callable[[Any], Any]) -> Any:
    """Run `work(transaction)` inside a Firestore transaction.

    Injected so tests can supply their own runner; production always uses this.
    Matches the contribution service, so both domains commit the same way.
    """
    from google.cloud import firestore as google_firestore

    transaction = db.transaction()
    return google_firestore.transactional(work)(transaction)


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

def canonical_user_exists(db: Any, user_id: str) -> bool:
    """Is `user_id` a Firebase UID with a canonical user document?

    The `users` collection holds three kinds of document: the profile written
    at `users/{uid}`, an email-keyed document written by the older auth route,
    and a Discord-keyed lookup stub. Only the first carries `id` equal to its
    own document ID, because only the profile writer sets it.

    Checking that pins membership to real UIDs: an email or a Discord snowflake
    may well have a document, but it is not an identity, so it cannot become a
    member. This reads the collection and changes nothing — consolidating those
    documents is a separate piece of work.
    """
    candidate = (user_id or "").strip()
    if not candidate:
        return False
    snapshot = db.collection(USERS_COLLECTION).document(candidate).get()
    if not getattr(snapshot, "exists", False):
        return False
    data = snapshot.to_dict() or {}
    return data.get("id") == candidate


def assert_members_exist(db: Any, member_ids: List[str]) -> None:
    """Every member must be a known UID, or nobody is added."""
    for member_id in member_ids:
        if not canonical_user_exists(db, member_id):
            raise SPGError(
                400,
                f"{member_id} is not a known member UID. "
                "Members are chosen from existing users.",
            )


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def _load(snapshot: Any) -> SPGRecord:
    data = dict(snapshot.to_dict() or {})
    data.setdefault("id", snapshot.id)
    try:
        return SPGRecord.model_validate(data)
    except ValidationError as error:
        raise SPGRecordInvalid(str(error)) from None


def get_spg(db: Any, spg_id: str) -> Optional[SPGRecord]:
    """Return the SPG, or None when it does not exist.

    The contribution SPG award reads through here too, so the signature and the
    `SPGRecordInvalid` behaviour are a contract with that workflow.
    """
    snapshot = db.collection(SPGS_COLLECTION).document(spg_id).get()
    if not getattr(snapshot, "exists", False):
        return None
    return _load(snapshot)


def require_spg(db: Any, spg_id: str) -> SPGRecord:
    try:
        spg = get_spg(db, spg_id)
    except SPGRecordInvalid:
        raise SPGError(409, "The stored SPG record does not match the SPG schema.") from None
    if spg is None:
        raise SPGError(404, "SPG not found.")
    return spg


def list_spgs(
    db: Any,
    *,
    status: Optional[SPGStatus] = None,
    type: Optional[SPGType] = None,
    track: Optional[SPGTrack] = None,
    visibility: Optional[SPGVisibility] = None,
    member_id: Optional[str] = None,
    limit: int = DEFAULT_PAGE_SIZE,
    cursor: Optional[str] = None,
) -> Tuple[List[SPGRecord], Optional[str]]:
    """A bounded page of SPGs, ordered by document ID so paging is stable."""
    size = max(1, min(limit, MAX_PAGE_SIZE))
    query = db.collection(SPGS_COLLECTION)
    for field, value in (
        ("status", status),
        ("type", type),
        ("track", track),
        ("visibility", visibility),
    ):
        if value is not None:
            query = query.where(field, "==", getattr(value, "value", value))

    if cursor is not None:
        anchor = db.collection(SPGS_COLLECTION).document(cursor).get()
        if not getattr(anchor, "exists", False):
            raise SPGError(400, "Unknown pagination cursor.")
        query = query.start_after(anchor)

    # One extra row answers "is there another page?" without a second query.
    # `member_id` is filtered in Python: an array-contains filter combined with
    # the others would need a composite index per combination.
    fetch = size + 1 if member_id is None else MAX_PAGE_SIZE + 1
    rows = list(query.limit(fetch).stream())

    items: List[SPGRecord] = []
    for snapshot in rows:
        try:
            record = _load(snapshot)
        except SPGRecordInvalid:
            continue  # one malformed document must not break the whole listing
        if member_id is not None and member_id not in record.member_ids:
            continue
        items.append(record)
        if len(items) > size:
            break

    next_cursor = items[size - 1].id if len(items) > size else None
    return items[:size], next_cursor


def visible_to(spg: SPGRecord, user_id: str, is_admin: bool) -> bool:
    """A private SPG is readable by its members and by admins only."""
    if spg.visibility is SPGVisibility.PUBLIC or is_admin:
        return True
    return user_id in spg.member_ids


# ---------------------------------------------------------------------------
# Creation — reached only through registration approval
# ---------------------------------------------------------------------------

def spg_id_for_ticket(ticket_id: str) -> str:
    """A deterministic document ID for the SPG a ticket approves.

    Approving the same ticket twice lands on the same document, so a double
    click or a retried request cannot create two groups for one registration.
    """
    digest = hashlib.sha256(f"spg_registration:{ticket_id}".encode("utf-8")).hexdigest()
    return f"spg_{digest[:24]}"


def create_spg(
    db: Any,
    *,
    create: SPGCreate,
    admin_id: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> Tuple[SPGRecord, bool]:
    """Create the SPG an approved registration describes.

    The single creation path. Returns the record and whether this call created
    it, so approving an already-approved ticket succeeds without duplicating.

    Everything is re-validated here rather than trusted from registration time:
    a member may have been removed between submitting and approving.
    """
    runner = runner or run_in_transaction
    moment = now or utcnow()

    if len(create.member_ids) > MAX_MEMBERS:
        raise SPGError(400, f"An SPG has at most {MAX_MEMBERS} members.")
    assert_members_exist(db, create.member_ids)
    if not canonical_user_exists(db, create.lead_id):
        raise SPGError(400, "The lead must be an existing member UID.")

    # Always derived from the approving ticket: SPGCreate requires one, so a
    # retried approval lands on this same document rather than a new group.
    record_id = spg_id_for_ticket(create.source_ticket_id)
    record = SPGRecord(
        id=record_id,
        name=create.name,
        description=create.description,
        type=create.type,
        track=create.track,
        visibility=create.visibility,
        member_ids=list(create.member_ids),
        lead_id=create.lead_id,
        status=SPGStatus.ACTIVE,
        created_by=admin_id,
        created_at=moment,
        updated_at=moment,
        proposition_document_url=create.proposition_document_url,
        source_ticket_id=create.source_ticket_id,
    )

    collection = db.collection(SPGS_COLLECTION)

    def work(transaction: Any) -> Tuple[SPGRecord, bool]:
        reference = collection.document(record.id)
        snapshot = reference.get(transaction=transaction)
        if getattr(snapshot, "exists", False):
            # This registration was already approved. Reading and writing in
            # one transaction is what makes two concurrent approvals safe.
            return _load(snapshot), False
        transaction.set(reference, record.model_dump())
        return record, True

    return runner(db, work)


# ---------------------------------------------------------------------------
# Lifecycle and membership
# ---------------------------------------------------------------------------

MUTABLE_STATUSES = (SPGStatus.ACTIVE, SPGStatus.PAUSED)


def _assert_mutable(spg: SPGRecord) -> None:
    if spg.status not in MUTABLE_STATUSES:
        raise SPGError(
            409,
            f"A {spg.status.value} SPG is immutable: its final team and history are kept as they were.",
        )


def _save(db: Any, record: SPGRecord, now: datetime) -> SPGRecord:
    updated = record.model_copy(update={"updated_at": now})
    db.collection(SPGS_COLLECTION).document(updated.id).set(updated.model_dump())
    return updated


def update_spg(db: Any, *, spg_id: str, update: SPGUpdate, now: Optional[datetime] = None) -> SPGRecord:
    """Edit metadata. Membership, lead and status have their own operations."""
    spg = require_spg(db, spg_id)
    _assert_mutable(spg)
    changes = update.model_dump(exclude_none=True)
    if not changes:
        return spg
    try:
        edited = spg.model_copy(update=changes)
        SPGRecord.model_validate(edited.model_dump())
    except ValidationError as error:
        raise SPGError(400, str(error)) from None
    return _save(db, edited, now or utcnow())


def add_member(db: Any, *, spg_id: str, user_id: str, now: Optional[datetime] = None) -> SPGRecord:
    """Add a member. Adding somebody already in the group changes nothing."""
    spg = require_spg(db, spg_id)
    _assert_mutable(spg)
    if user_id in spg.member_ids:
        return spg
    if not canonical_user_exists(db, user_id):
        raise SPGError(400, f"{user_id} is not a known member UID.")
    if len(spg.member_ids) >= MAX_MEMBERS:
        raise SPGError(400, f"An SPG has at most {MAX_MEMBERS} members.")
    return _save(db, spg.model_copy(update={"member_ids": spg.member_ids + [user_id]}), now or utcnow())


def remove_member(db: Any, *, spg_id: str, user_id: str, now: Optional[datetime] = None) -> SPGRecord:
    """Remove a member. The lead and the last member cannot be removed."""
    spg = require_spg(db, spg_id)
    _assert_mutable(spg)
    if user_id not in spg.member_ids:
        return spg
    if user_id == spg.lead_id:
        raise SPGError(409, "Change the lead before removing them from the SPG.")
    if len(spg.member_ids) == 1:
        raise SPGError(409, "An SPG keeps at least one member.")
    remaining = [member for member in spg.member_ids if member != user_id]
    return _save(db, spg.model_copy(update={"member_ids": remaining}), now or utcnow())


def change_lead(db: Any, *, spg_id: str, new_lead_id: str, now: Optional[datetime] = None) -> SPGRecord:
    """Hand the lead to somebody already in the group."""
    spg = require_spg(db, spg_id)
    _assert_mutable(spg)
    if new_lead_id not in spg.member_ids:
        raise SPGError(400, "The new lead must already be a member of this SPG.")
    if new_lead_id == spg.lead_id:
        return spg
    return _save(db, spg.model_copy(update={"lead_id": new_lead_id}), now or utcnow())


_ALLOWED_TRANSITIONS: Dict[SPGStatus, Tuple[SPGStatus, ...]] = {
    SPGStatus.ACTIVE: (SPGStatus.PAUSED, SPGStatus.DISBANDED),
    SPGStatus.PAUSED: (SPGStatus.ACTIVE, SPGStatus.DISBANDED),
    SPGStatus.COMPLETED: (),
    SPGStatus.DISBANDED: (),
}


def set_status(db: Any, *, spg_id: str, target: SPGStatus, now: Optional[datetime] = None) -> SPGRecord:
    """Move an SPG between active, paused and disbanded.

    `completed` is not reachable here. Completing an SPG is meant to go through
    a reviewed completion request, which is not built yet, so nothing in this
    release can mark a group finished.
    """
    spg = require_spg(db, spg_id)
    if target is spg.status:
        return spg  # already there; asking again is not an error
    if target is SPGStatus.COMPLETED:
        raise SPGError(409, "An SPG is completed through a reviewed completion request.")
    if target not in _ALLOWED_TRANSITIONS[spg.status]:
        raise SPGError(409, f"An SPG cannot go from {spg.status.value} to {target.value}.")
    return _save(db, spg.model_copy(update={"status": target}), now or utcnow())
