"""Contributions API endpoints.

The auditable ledger behind member points. Thin handlers over
app/services/contributions.py, so the admin site and the Discord bot share one
set of rules.

Points live in contribution records, never in a counter. The leaderboard here
sums approved records. `users.points` is a separate cached projection owned by
the users API; awarding and revoking deliberately do not touch it, and
/recalculate rebuilds it on demand.

Handlers are sync `def` on purpose: the Firestore client blocks, so FastAPI runs
them in a threadpool instead of stalling the event loop.
"""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.security import get_current_user, require_admin
from app.schemas.contributions import (
    AdminAwardSPG,
    AdminAwardUser,
    AdminRevokeRecord,
    ContributionCategory,
    ContributionPage,
    ContributionRecord,
    ContributionStatus,
    ContributionTrack,
    LeaderboardEntry,
    SPGAwardResponse,
)
from app.services import contributions as service
from app.services.firebase import get_db

router = APIRouter(prefix="/contributions", tags=["Contributions"])

USERS_COLLECTION = "users"
VALID_TRACKS = tuple(track.value for track in ContributionTrack)


def _admin_id(admin: dict) -> str:
    """The Firebase UID of the acting admin."""
    return admin["uid"]


def _handle(error: service.ContributionError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


# ---------------------------------------------------------------------------
# Admin write endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/award/user/{user_id}",
    response_model=ContributionRecord,
    summary="Award points to a specific member",
)
def award_user_points(
    user_id: str,
    award: AdminAwardUser,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> ContributionRecord:
    """Record an approved contribution for one member.

    Repeating the same award returns the existing record instead of awarding
    the points twice.
    """
    try:
        record, _created = service.award_user(
            db, user_id=user_id, award=award, admin_id=_admin_id(admin)
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return record


@router.post(
    "/award/spg/{spg_id}",
    response_model=SPGAwardResponse,
    summary="Award every member of an existing SPG",
)
def award_spg_points(
    spg_id: str,
    award: AdminAwardSPG,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGAwardResponse:
    """Record one contribution per SPG member, all of them or none.

    Membership comes from the SPG record; the SPG must already exist, and this
    never creates or edits one.
    """
    try:
        return service.award_spg(
            db, spg_id=spg_id, award=award, admin_id=_admin_id(admin)
        )
    except service.ContributionError as error:
        raise _handle(error) from None


@router.patch(
    "/{record_id}/revoke",
    response_model=ContributionRecord,
    summary="Revoke an awarded contribution",
)
def revoke_contribution(
    record_id: str,
    revocation: AdminRevokeRecord,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> ContributionRecord:
    """Mark a contribution revoked, with a reason. The record is kept for audit
    and stops counting toward the leaderboard; nothing is deleted."""
    try:
        return service.revoke_contribution(
            db,
            record_id=record_id,
            status_reason=revocation.status_reason,
            admin_id=_admin_id(admin),
        )
    except service.ContributionError as error:
        raise _handle(error) from None


@router.post(
    "/recalculate/{user_id}",
    summary="Rebuild the cached users.points projection (maintenance)",
)
def recalculate_user_points(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Maintenance only, kept for compatibility with the users API.

    `users.points` is a cached projection of the approved records, not a source
    of truth. Awarding and revoking never write it, so it goes stale until this
    runs. Nothing in the contribution workflow depends on it.
    """
    user_ref = db.collection(USERS_COLLECTION).document(user_id)
    if not getattr(user_ref.get(), "exists", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    totals = {track: 0 for track in ("total",) + VALID_TRACKS}
    documents = (
        db.collection(service.CONTRIBUTIONS_COLLECTION)
        .where("user_id", "==", user_id)
        .where("status", "==", ContributionStatus.APPROVED.value)
        .stream()
    )
    for document in documents:
        data = document.to_dict() or {}
        points = data.get("points")
        if not isinstance(points, int):
            continue
        track = data.get("track") if data.get("track") in VALID_TRACKS else ContributionTrack.MISC.value
        totals["total"] += points
        totals[track] += points

    user_ref.update({"points": totals, "updated_at": service.utcnow().isoformat()})
    return {
        "message": f"Successfully recalculated points for user {user_id}",
        "user_id": user_id,
        "points": totals,
    }


# ---------------------------------------------------------------------------
# Read endpoints. Fixed paths are declared before /{record_id} so the path
# parameter cannot swallow them.
# ---------------------------------------------------------------------------

@router.get(
    "/leaderboard",
    response_model=List[LeaderboardEntry],
    summary="Points per member, from approved contributions",
)
def leaderboard(
    limit: int = Query(service.DEFAULT_LEADERBOARD_LIMIT, ge=1, le=service.MAX_LEADERBOARD_LIMIT),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> List[LeaderboardEntry]:
    """Summed from approved records only; `users.points` is never read."""
    return service.leaderboard(db, limit=limit)


@router.get(
    "/me",
    response_model=ContributionPage,
    summary="The signed-in member's own contributions",
)
def my_contributions(
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> ContributionPage:
    try:
        items, next_cursor = service.list_contributions(
            db, user_id=user["uid"], limit=limit, cursor=cursor
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return ContributionPage(items=items, next_cursor=next_cursor)


@router.get(
    "/user/{user_id}",
    response_model=ContributionPage,
    summary="One member's contributions",
)
def list_user_contributions(
    user_id: str,
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    status_filter: Optional[ContributionStatus] = Query(
        ContributionStatus.APPROVED, alias="status"
    ),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> ContributionPage:
    """A member's trophy case. Readable by that member or by an admin, so one
    member cannot read another's rejections and revocation reasons."""
    if user_id != user["uid"] and user.get("admin") is not True:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contributions not found.")
    try:
        items, next_cursor = service.list_contributions(
            db, user_id=user_id, status=status_filter, limit=limit, cursor=cursor
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return ContributionPage(items=items, next_cursor=next_cursor)


@router.get(
    "",
    response_model=ContributionPage,
    summary="Filter and list contributions (admin)",
)
def list_contributions(
    user_id: Optional[str] = Query(None, description="Filter by member UID"),
    track: Optional[ContributionTrack] = Query(None),
    category: Optional[ContributionCategory] = Query(None),
    status_filter: Optional[ContributionStatus] = Query(None, alias="status"),
    spg_id: Optional[str] = Query(None),
    event_id: Optional[str] = Query(None),
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> ContributionPage:
    """Every contribution, filtered. Admin only: a member's own history is
    /contributions/me."""
    try:
        items, next_cursor = service.list_contributions(
            db,
            user_id=user_id,
            track=track,
            category=category,
            status=status_filter,
            spg_id=spg_id,
            event_id=event_id,
            limit=limit,
            cursor=cursor,
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return ContributionPage(items=items, next_cursor=next_cursor)


@router.get(
    "/{record_id}",
    response_model=ContributionRecord,
    summary="One contribution",
)
def get_contribution(
    record_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> ContributionRecord:
    """Readable by the member it belongs to, or by an admin.

    Someone else's record answers 404 rather than 403, so the endpoint cannot
    be used to discover which contributions exist.
    """
    record = service.get_contribution(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found.")
    if record.user_id != user["uid"] and user.get("admin") is not True:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found.")
    return record
