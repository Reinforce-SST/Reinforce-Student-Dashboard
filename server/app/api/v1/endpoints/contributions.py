"""Contribution endpoints: awarding, revoking, history and the leaderboard.

Thin handlers over app/services/contributions.py, so the admin site and the
Discord bot share one set of rules. Every route is authenticated; awarding and
revoking additionally require the admin claim.

Handlers are sync `def` on purpose: the Firestore client blocks, so FastAPI
runs them in a threadpool instead of stalling the event loop.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.security import get_current_user, require_admin
from app.schemas.contributions import (
    AdminAwardSPG,
    AdminAwardStudent,
    AdminRevokeRecord,
    ContributionPage,
    ContributionRecord,
    ContributionStatus,
    LeaderboardEntry,
    SPGAwardResponse,
)
from app.services import contributions as service
from app.services.firebase import get_db

router = APIRouter(prefix="/contributions", tags=["Contributions"])


def _caller_id(user: dict) -> str:
    """The canonical contributor id of the signed-in caller."""
    return service.normalise_email(user.get("email", ""))


def _handle(error: service.ContributionError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    "/award/student/{student_id}",
    response_model=ContributionRecord,
    summary="Award one student",
)
def award_student(
    student_id: str,
    award: AdminAwardStudent,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> ContributionRecord:
    """Record an approved contribution for one student.

    Repeating the same award returns the existing record instead of awarding
    the points twice.
    """
    try:
        record, _created = service.award_student(
            db, student_id=student_id, award=award, admin_id=_caller_id(admin)
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return record


@router.post(
    "/award/spg/{spg_id}",
    response_model=SPGAwardResponse,
    summary="Award every member of an existing SPG",
)
def award_spg(
    spg_id: str,
    award: AdminAwardSPG,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGAwardResponse:
    """Record one contribution per SPG member, all of them or none.

    The SPG must already exist; this never creates or edits one.
    """
    try:
        return service.award_spg(
            db, spg_id=spg_id, award=award, admin_id=_caller_id(admin)
        )
    except service.ContributionError as error:
        raise _handle(error) from None


@router.get(
    "/leaderboard",
    response_model=list[LeaderboardEntry],
    summary="Points per contributor, from approved contributions",
)
def leaderboard(
    limit: int = Query(service.DEFAULT_LEADERBOARD_LIMIT, ge=1, le=service.MAX_LEADERBOARD_LIMIT),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[LeaderboardEntry]:
    return service.leaderboard(db, limit=limit)


@router.get(
    "/me",
    response_model=ContributionPage,
    summary="The signed-in student's own contributions",
)
def my_contributions(
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> ContributionPage:
    try:
        items, next_cursor = service.list_contributions(
            db, contributor_id=_caller_id(user), limit=limit, cursor=cursor
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return ContributionPage(items=items, next_cursor=next_cursor)


@router.get(
    "",
    response_model=ContributionPage,
    summary="List contributions (admin)",
)
def list_contributions(
    contributor_id: Optional[str] = Query(None),
    spg_id: Optional[str] = Query(None),
    event_id: Optional[str] = Query(None),
    status: Optional[ContributionStatus] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> ContributionPage:
    """Every contribution, filtered. Admin only: a student's own history is
    /contributions/me, so one member cannot read another's revocation reasons."""
    try:
        items, next_cursor = service.list_contributions(
            db,
            contributor_id=service.normalise_email(contributor_id) if contributor_id else None,
            spg_id=spg_id,
            event_id=event_id,
            status=status,
            category=category,
            limit=limit,
            cursor=cursor,
        )
    except service.ContributionError as error:
        raise _handle(error) from None
    return ContributionPage(items=items, next_cursor=next_cursor)


@router.patch(
    "/{record_id}/revoke",
    response_model=ContributionRecord,
    summary="Revoke a contribution",
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
            admin_id=_caller_id(admin),
        )
    except service.ContributionError as error:
        raise _handle(error) from None


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
    """Readable by the contributor it belongs to, or by an admin.

    Someone else's record answers 404 rather than 403, so the endpoint cannot
    be used to discover which contributions exist.
    """
    record = service.get_contribution(db, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Contribution not found.")
    if record.contributor_id != _caller_id(user) and user.get("admin") is not True:
        raise HTTPException(status_code=404, detail="Contribution not found.")
    return record
