"""Contribution business rules.

The admin API and, later, the Discord bot both go through here, so awarding,
revoking and scoring behave the same whoever calls them.

Two rules shape everything below:

- A contribution record is the only source of truth for points. Nothing keeps a
  running total on a user, and the leaderboard is summed from approved records.
- The server owns identity, status, review metadata and the deduplication key.
  A request can never supply them.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.schemas.contributions import (
    AdminAwardSPG,
    AdminAwardUser,
    ContributionCategory,
    ContributionDetails,
    ContributionRecord,
    ContributionStatus,
    ContributionTrack,
    LeaderboardEntry,
    SPGAwardResponse,
)
from app.services.spgs import SPGRecordInvalid, get_spg

CONTRIBUTIONS_COLLECTION = "contributions"
USERS_COLLECTION = "users"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_LEADERBOARD_LIMIT = 20
MAX_LEADERBOARD_LIMIT = 100

# One transaction writes every member's record, and Firestore allows 500 writes
# in a transaction. A club SPG is far smaller; a larger one is rejected rather
# than split into batches, because a split cannot be all-or-nothing.
MAX_SPG_MEMBERS = 200

# The leaderboard reads approved records and sums them here. The cap keeps a
# single request bounded; passing it means it is time for stored aggregates.
MAX_LEADERBOARD_SCAN = 5000


class ContributionError(Exception):
    """A business rule failure, carrying the HTTP status the API should use."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def user_exists(db: Any, user_id: str) -> bool:
    """Is there a `users/{uid}` document for this Firebase UID?

    Identity is the Firebase UID throughout: the path parameter, `user_id` on a
    record, and every SPG member id. Nothing is resolved from an email.
    """
    candidate = (user_id or "").strip()
    if not candidate:
        return False
    snapshot = db.collection(USERS_COLLECTION).document(candidate).get()
    return bool(getattr(snapshot, "exists", False))


def deduplication_key(
    *,
    target_kind: str,
    user_id: str,
    details: ContributionDetails,
    spg_id: Optional[str] = None,
) -> str:
    """A deterministic key for one logical award.

    The same award described the same way always produces the same key, and
    changing the student, event, SPG, date, points, title, category or source
    produces a different one. Nothing random goes in, so a retry — a double
    click, a lost response, a bot redelivery — lands on the same key.
    """
    payload = {
        "target_kind": target_kind,
        "user_id": user_id,
        "track": details.track.value,
        "category": details.category.value,
        "title": details.title,
        "points": details.points,
        "occurred_at": details.occurred_at.astimezone(timezone.utc).isoformat(),
        "event_id": details.event_id,
        "spg_id": spg_id,
        "source": None
        if details.source is None
        else {"type": details.source.type.value, "id": details.source.id},
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def run_in_transaction(db: Any, work: Callable[[Any], Any]) -> Any:
    """Run `work(transaction)` inside a Firestore transaction.

    Injected so tests can supply their own runner; production always uses this.
    """
    from google.cloud import firestore as google_firestore

    transaction = db.transaction()
    return google_firestore.transactional(work)(transaction)


def _load(snapshot: Any) -> ContributionRecord:
    """Validate a stored document back into a record."""
    data = dict(snapshot.to_dict() or {})
    data["id"] = snapshot.id
    return ContributionRecord.model_validate(data)


def _build_record(
    *,
    record_id: str,
    user_id: str,
    details: ContributionDetails,
    spg_id: Optional[str],
    admin_id: str,
    now: datetime,
) -> ContributionRecord:
    """A complete approved record. Every server-owned field is set here."""
    return ContributionRecord(
        id=record_id,
        user_id=user_id,
        track=details.track,
        category=details.category,
        title=details.title,
        description=details.description,
        points=details.points,
        source=details.source,
        event_id=details.event_id,
        spg_id=spg_id,
        occurred_at=details.occurred_at,
        status=ContributionStatus.APPROVED,
        recorded_by=admin_id,
        created_at=now,
        reviewed_by=admin_id,
        reviewed_at=now,
        deduplication_key=record_id,
    )


def award_user(
    db: Any,
    *,
    user_id: str,
    award: AdminAwardUser,
    admin_id: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> Tuple[ContributionRecord, bool]:
    """Award one member. Returns the record and whether it was just created."""
    runner = runner or run_in_transaction
    if not user_exists(db, user_id):
        raise ContributionError(404, "Recipient user not found.")
    user_id = user_id.strip()

    key = deduplication_key(
        target_kind="user",
        user_id=user_id,
        details=award,
        spg_id=award.spg_id,
    )
    record = _build_record(
        record_id=key,
        user_id=user_id,
        details=award,
        spg_id=award.spg_id,
        admin_id=admin_id,
        now=now or utcnow(),
    )

    collection = db.collection(CONTRIBUTIONS_COLLECTION)

    def work(transaction: Any) -> Tuple[ContributionRecord, bool]:
        reference = collection.document(record.id)
        snapshot = reference.get(transaction=transaction)
        if getattr(snapshot, "exists", False):
            # The same award already exists: idempotent success, not a second
            # record. Reading and writing in one transaction is what makes two
            # concurrent retries safe.
            return _load(snapshot), False
        transaction.set(reference, record.model_dump())
        return record, True

    return runner(db, work)


def award_spg(
    db: Any,
    *,
    spg_id: str,
    award: AdminAwardSPG,
    admin_id: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> SPGAwardResponse:
    """Award every member of an existing SPG, all together or not at all."""
    runner = runner or run_in_transaction
    try:
        spg = get_spg(db, spg_id)
    except SPGRecordInvalid:
        raise ContributionError(409, "The stored SPG record does not match the SPG schema.")
    if spg is None:
        raise ContributionError(404, "SPG not found.")
    if len(spg.member_ids) > MAX_SPG_MEMBERS:
        raise ContributionError(
            400, f"An SPG award covers at most {MAX_SPG_MEMBERS} members."
        )

    moment = now or utcnow()
    planned: List[ContributionRecord] = []
    for user_id in spg.member_ids:
        # member_ids hold Firebase UIDs. Membership comes from the SPG record
        # only; `users.spg_ids` is never consulted.
        if not user_exists(db, user_id):
            # No partial award: one unknown member stops the whole award.
            raise ContributionError(400, f"SPG member {user_id} has no user record.")
        key = deduplication_key(
            target_kind="spg",
            user_id=user_id,
            details=award,
            spg_id=spg.id,
        )
        planned.append(
            _build_record(
                record_id=key,
                user_id=user_id,
                details=award,
                spg_id=spg.id,
                admin_id=admin_id,
                now=moment,
            )
        )

    if not planned:
        raise ContributionError(400, "This SPG has no members to award.")

    collection = db.collection(CONTRIBUTIONS_COLLECTION)

    def work(transaction: Any) -> List[ContributionRecord]:
        references = [collection.document(record.id) for record in planned]
        # Every read happens before any write, as Firestore requires.
        snapshots = [
            reference.get(transaction=transaction) for reference in references
        ]
        settled: List[ContributionRecord] = []
        for record, reference, snapshot in zip(planned, references, snapshots):
            if getattr(snapshot, "exists", False):
                settled.append(_load(snapshot))
                continue
            transaction.set(reference, record.model_dump())
            settled.append(record)
        return settled

    stored = runner(db, work)
    return SPGAwardResponse(
        spg_id=spg.id,
        points_per_member=award.points,
        awarded_count=len(stored),
        user_ids=[record.user_id for record in stored],
        contribution_ids=[record.id for record in stored],
    )


def revoke_contribution(
    db: Any,
    *,
    record_id: str,
    status_reason: str,
    admin_id: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> ContributionRecord:
    """Revoke an approved contribution, keeping the record for audit."""
    runner = runner or run_in_transaction
    moment = now or utcnow()
    collection = db.collection(CONTRIBUTIONS_COLLECTION)

    def work(transaction: Any) -> ContributionRecord:
        reference = collection.document(record_id)
        snapshot = reference.get(transaction=transaction)
        if not getattr(snapshot, "exists", False):
            raise ContributionError(404, "Contribution not found.")

        current = _load(snapshot)
        if current.status is ContributionStatus.REVOKED:
            return current  # already revoked: nothing further to change
        if current.status is not ContributionStatus.APPROVED:
            raise ContributionError(
                409, "Only an approved contribution can be revoked."
            )

        # Rebuilt and validated as a whole record before anything is written,
        # so the stored document can never land in an invalid state.
        revoked = ContributionRecord.model_validate(
            {
                **current.model_dump(),
                "status": ContributionStatus.REVOKED,
                "revoked_by": admin_id,
                "revoked_at": moment,
                "status_reason": status_reason,
            }
        )
        transaction.set(reference, revoked.model_dump())
        return revoked

    return runner(db, work)


def get_contribution(db: Any, record_id: str) -> Optional[ContributionRecord]:
    snapshot = db.collection(CONTRIBUTIONS_COLLECTION).document(record_id).get()
    if not getattr(snapshot, "exists", False):
        return None
    return _load(snapshot)


def list_contributions(
    db: Any,
    *,
    user_id: Optional[str] = None,
    spg_id: Optional[str] = None,
    event_id: Optional[str] = None,
    status: Optional[ContributionStatus] = None,
    track: Optional[ContributionTrack] = None,
    category: Optional[ContributionCategory] = None,
    limit: int = DEFAULT_PAGE_SIZE,
    cursor: Optional[str] = None,
) -> Tuple[List[ContributionRecord], Optional[str]]:
    """A bounded page of contributions, newest first, with the next cursor."""
    size = max(1, min(limit, MAX_PAGE_SIZE))
    collection = db.collection(CONTRIBUTIONS_COLLECTION)

    query = collection
    if user_id:
        query = query.where("user_id", "==", user_id)
    if spg_id:
        query = query.where("spg_id", "==", spg_id)
    if event_id:
        query = query.where("event_id", "==", event_id)
    if status:
        query = query.where("status", "==", status.value)
    if track:
        query = query.where("track", "==", track.value)
    if category:
        query = query.where("category", "==", category.value)

    query = query.order_by("created_at", direction="DESCENDING")

    if cursor:
        start_at = collection.document(cursor).get()
        if not getattr(start_at, "exists", False):
            raise ContributionError(400, "Unknown pagination cursor.")
        query = query.start_after(start_at)

    # One extra row tells us whether another page exists.
    found = [_load(snapshot) for snapshot in query.limit(size + 1).stream()]
    if len(found) > size:
        return found[:size], found[size - 1].id
    return found, None


def leaderboard(
    db: Any,
    *,
    limit: int = DEFAULT_LEADERBOARD_LIMIT,
    scan_limit: int = MAX_LEADERBOARD_SCAN,
) -> List[LeaderboardEntry]:
    """Points per contributor, summed from approved contributions only.

    Ordered by points, then contribution count, then user id, so equal scores
    always come back in the same order. `users.points` is never read: the
    cached projection there is maintained separately by /recalculate.
    """
    size = max(1, min(limit, MAX_LEADERBOARD_LIMIT))
    query = (
        db.collection(CONTRIBUTIONS_COLLECTION)
        .where("status", "==", ContributionStatus.APPROVED.value)
        .limit(scan_limit)
    )

    totals: Dict[str, List[int]] = {}
    for snapshot in query.stream():
        data = snapshot.to_dict() or {}
        user_id = data.get("user_id")
        points = data.get("points")
        if not isinstance(user_id, str) or not isinstance(points, int):
            continue  # a malformed document must not break the whole board
        running = totals.setdefault(user_id, [0, 0])
        running[0] += points
        running[1] += 1

    ranked = sorted(
        totals.items(), key=lambda item: (-item[1][0], -item[1][1], item[0])
    )
    return [
        LeaderboardEntry(
            user_id=user_id,
            points=points,
            contribution_count=count,
        )
        for user_id, (points, count) in ranked[:size]
    ]
