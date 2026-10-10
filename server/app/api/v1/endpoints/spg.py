"""Student Project Group API.

Thin handlers over app/services/spgs.py and app/services/spg_reports.py.

**No route here creates an SPG.** A registration raises an `spg_registration`
ticket. An admin approves that ticket through the ticket API, which validates
the stored request and calls `create_spg` in the same transaction as resolving
the ticket. See docs/SPG_WORKFLOW.md.

A report is either a filled-in form or an uploaded PDF. Both are the same
record in the same collection, share one sequence per SPG, and carry a heading
and a short description for the dashboard listing.

Handlers are sync `def` on purpose: the Firestore client blocks, so FastAPI
runs them in a threadpool instead of stalling the event loop.
"""

from typing import Any, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from pydantic import ValidationError

from app.api.security import get_current_user, require_admin
from app.schemas.spg_reports import (
    SPGFormReportSubmission,
    SPGReportPage,
    SPGReportRecord,
    SPGReportType,
)
from app.schemas.spgs import (
    SPGLeadUpdate,
    SPGMilestone,
    SPGMilestoneCreate,
    SPGMilestoneUpdate,
    SPGPage,
    SPGRecruitingUpdateRequest,
    SPGResponse,
    SPGStatus,
    SPGSubmilestone,
    SPGSubmilestoneCreate,
    SPGSubmilestoneUpdate,
    SPGTeamUpdateRequest,
    SPGTrack,
    SPGType,
    SPGUpdate,
    SPGVisibility,
)
from app.services import contributions as contribution_service
from app.services import spg_reports as reports_service
from app.services import spgs as service
from app.services import uploads
from app.services.firebase import get_db

router = APIRouter(prefix="/spgs", tags=["SPGs"])


def _uid(user: dict) -> str:
    return user["uid"]


def _is_admin(user: dict) -> bool:
    return user.get("admin") is True


def _handle(error) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


def _respond(db: Any, record) -> SPGResponse:
    return SPGResponse(
        **record.model_dump(),
        report_count=reports_service.count_reports(db, record.id),
    )


def _readable_or_404(db: Any, spg_id: str, user: dict):
    """Fetch an SPG the caller may see.

    A private SPG answers 404 rather than 403 to a non-member, so the endpoint
    cannot be used to discover which private groups exist.
    """
    try:
        spg = service.require_spg(db, spg_id)
    except service.SPGError as error:
        raise _handle(error) from None
    if not service.visible_to(spg, _uid(user), _is_admin(user)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SPG not found.")
    return spg


def _member_or_403(spg, user: dict) -> None:
    if _uid(user) not in spg.member_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a member of this SPG can do that.",
        )


def _can_edit_milestones(spg, user: dict) -> None:
    if not _is_admin(user):
        _member_or_403(spg, user)
    if spg.status not in service.MUTABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {spg.status.value} SPG does not accept milestone modifications.",
        )




# ---------------------------------------------------------------------------
# There is deliberately no creation route here.
#
# An SPG is created by the ticket approval handler after it has read the
# registration. Keeping that route with tickets preserves one creation path.
#
# Fixed segments below are declared before /{spg_id} so the path parameter
# cannot swallow them.
# ---------------------------------------------------------------------------

@router.post(
    "/reports/{report_id}/verify",
    response_model=SPGReportRecord,
    summary="Verify a submitted report (admin)",
)
def verify_report(
    report_id: str,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGReportRecord:
    """Record that a reviewer has checked the report.

    This awards nothing. Whether the work earns points is a separate decision
    the admin makes through the contribution workflow — so verifying puts that
    decision in the queue as a pending contribution worth nothing until it is
    reviewed. Verifying again changes nothing.
    """
    try:
        report = reports_service.verify_report(db, report_id=report_id, admin_id=_uid(admin))
    except reports_service.SPGReportError as error:
        raise _handle(error) from None
    # The report is already verified; nothing below may fail this request.
    try:
        group = service.get_spg(db, report.spg_id)
    except Exception:
        group = None
    # SPGs call the catch-all track "general"; contributions call it "misc".
    track = getattr(getattr(group, "track", None), "value", None) or "misc"
    contribution_service.credit_activity(
        db,
        user_id=report.submitted_by,
        activity=f"spg_report:{report.id}",
        spg_id=report.spg_id,
        details={
            "category": "project_work",
            "track": "misc" if track == "general" else track,
            "title": f"Progress report verified: {report.heading}"[:200],
            "occurred_at": report.submitted_at,
        },
    )
    return report


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

@router.get("", response_model=SPGPage, summary="Browse SPGs")
def list_spgs(
    status_filter: Optional[SPGStatus] = Query(None, alias="status"),
    type_filter: Optional[SPGType] = Query(None, alias="type"),
    track: Optional[SPGTrack] = Query(None),
    event_id: Optional[str] = Query(None, description="Filter SPGs created for a specific event"),
    idea_id: Optional[str] = Query(None, description="Filter SPGs derived from a specific Idea Jar idea"),
    member_id: Optional[str] = Query(None, description="Only SPGs this member UID belongs to"),
    recruiting: Optional[bool] = Query(None, description="Filter open/recruiting SPGs"),
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGPage:
    """Public SPGs, plus the caller's own private ones. An admin sees all."""
    try:
        records, next_cursor = service.list_spgs(
            db,
            status=status_filter,
            type=type_filter,
            track=track,
            event_id=event_id,
            idea_id=idea_id,
            member_id=member_id,
            recruiting=recruiting,
            limit=limit,
            cursor=cursor,
        )
    except service.SPGError as error:
        raise _handle(error) from None
    visible = [
        record
        for record in records
        if service.visible_to(record, _uid(user), _is_admin(user))
    ]
    return SPGPage(
        items=[_respond(db, record) for record in visible],
        next_cursor=next_cursor,
    )


@router.get("/{spg_id}", response_model=SPGResponse, summary="One SPG")
def get_spg(
    spg_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGResponse:
    return _respond(db, _readable_or_404(db, spg_id, user))


# ---------------------------------------------------------------------------
# Admin management
# ---------------------------------------------------------------------------

@router.patch("/{spg_id}", response_model=SPGResponse, summary="Edit SPG metadata (admin)")
def update_spg(
    spg_id: str,
    update: SPGUpdate,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    """Name, description, track and visibility. Membership, lead and status
    have their own operations, so this cannot quietly change the team."""
    try:
        return _respond(db, service.update_spg(db, spg_id=spg_id, update=update))
    except service.SPGError as error:
        raise _handle(error) from None


@router.post(
    "/{spg_id}/members/{user_id}",
    response_model=SPGResponse,
    summary="Add a member (admin)",
)
def add_member(
    spg_id: str,
    user_id: str,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    """Adding somebody already in the group succeeds and changes nothing."""
    try:
        return _respond(db, service.add_member(db, spg_id=spg_id, user_id=user_id))
    except service.SPGError as error:
        raise _handle(error) from None


@router.delete(
    "/{spg_id}/members/{user_id}",
    response_model=SPGResponse,
    summary="Remove a member (admin)",
)
def remove_member(
    spg_id: str,
    user_id: str,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    try:
        return _respond(db, service.remove_member(db, spg_id=spg_id, user_id=user_id))
    except service.SPGError as error:
        raise _handle(error) from None


@router.patch("/{spg_id}/lead", response_model=SPGResponse, summary="Change the lead (admin)")
def change_lead(
    spg_id: str,
    payload: SPGLeadUpdate,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    try:
        return _respond(db, service.change_lead(db, spg_id=spg_id, new_lead_id=payload.new_lead_id))
    except service.SPGError as error:
        raise _handle(error) from None


@router.patch("/{spg_id}/team", response_model=SPGResponse, summary="Update team members and lead (admin)")
def update_team(
    spg_id: str,
    payload: SPGTeamUpdateRequest,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    """Admin updates full list of SPG team members and optionally assigns a new lead (via ticket approval)."""
    try:
        return _respond(
            db,
            service.update_team(
                db,
                spg_id=spg_id,
                member_ids=[str(m) for m in payload.member_ids],
                lead_id=str(payload.lead_id) if payload.lead_id else None,
            ),
        )
    except service.SPGError as error:
        raise _handle(error) from None


@router.patch("/{spg_id}/recruiting", response_model=SPGResponse, summary="Update recruitment status (admin)")
def update_recruiting(
    spg_id: str,
    payload: SPGRecruitingUpdateRequest,
    admin: dict = Depends(require_admin),
    db: Any = Depends(get_db),
) -> SPGResponse:
    """Admin toggles whether the SPG is actively recruiting new collaborators and lists roles (via ticket request)."""
    try:
        return _respond(
            db,
            service.update_recruiting(
                db,
                spg_id=spg_id,
                is_recruiting=payload.is_recruiting,
                recruiting_roles=[str(r) for r in (payload.recruiting_roles or [])],
            ),
        )
    except service.SPGError as error:
        raise _handle(error) from None


def _transition(db: Any, spg_id: str, target: SPGStatus) -> SPGResponse:
    try:
        return _respond(db, service.set_status(db, spg_id=spg_id, target=target))
    except service.SPGError as error:
        raise _handle(error) from None


@router.post("/{spg_id}/pause", response_model=SPGResponse, summary="Pause an SPG (admin)")
def pause_spg(spg_id: str, admin: dict = Depends(require_admin), db: Any = Depends(get_db)) -> SPGResponse:
    return _transition(db, spg_id, SPGStatus.PAUSED)


@router.post("/{spg_id}/resume", response_model=SPGResponse, summary="Resume an SPG (admin)")
def resume_spg(spg_id: str, admin: dict = Depends(require_admin), db: Any = Depends(get_db)) -> SPGResponse:
    return _transition(db, spg_id, SPGStatus.ACTIVE)


@router.post("/{spg_id}/disband", response_model=SPGResponse, summary="Disband an SPG (admin)")
def disband_spg(spg_id: str, admin: dict = Depends(require_admin), db: Any = Depends(get_db)) -> SPGResponse:
    """The SPG is kept, not deleted: its members and report history stay
    readable. Disbanding is final."""
    return _transition(db, spg_id, SPGStatus.DISBANDED)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _reportable_or_error(db: Any, spg_id: str, user: dict):
    """The SPG a caller may file a report against.

    Identical for both formats: the caller must be able to see the group, be a
    member of it, and the group must still be running.
    """
    spg = _readable_or_404(db, spg_id, user)
    _member_or_403(spg, user)
    if spg.status not in service.MUTABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"A {spg.status.value} SPG does not accept new reports.",
        )
    return spg


@router.post(
    "/{spg_id}/reports/pdf",
    response_model=SPGReportRecord,
    summary="Submit a report as a PDF",
)
def submit_pdf_report(
    spg_id: str,
    file: UploadFile = File(..., description="The report PDF"),
    heading: str = Form(..., description="Shown as the report's title in the listing"),
    short_description: str = Form(..., description="One or two lines shown under the heading"),
    report_type: SPGReportType = Form(SPGReportType.PROGRESS),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGReportRecord:
    """File a report as a document.

    The heading and the short description are what the dashboard lists; the
    PDF is what opens when somebody wants the detail.

    Submitting awards no points and creates no contribution.
    """
    _reportable_or_error(db, spg_id, user)
    try:
        payload = uploads.read_pdf(file.file, file.content_type)
    except uploads.UploadRejected as rejected:
        raise HTTPException(status_code=400, detail=rejected.detail) from None

    try:
        return reports_service.submit_pdf_report(
            db,
            spg_id=spg_id,
            heading=heading,
            short_description=short_description,
            payload=payload,
            submitted_by=_uid(user),
            report_type=report_type,
        )
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors()) from None
    except reports_service.SPGReportError as error:
        raise _handle(error) from None
    except Exception as error:
        # If Cloud Storage is unavailable or billing disabled, fail gracefully rather than unhandled 500
        msg = str(error)
        if "billing account" in msg.lower() or "403" in msg or "accountdisabled" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Cloud Storage is temporarily unavailable due to disabled project billing. Please submit your progress report using the Form format instead.",
            ) from None
        raise


@router.post(
    "/{spg_id}/reports/form",
    response_model=SPGReportRecord,
    summary="Submit a report as a structured form",
)
def submit_form_report(
    spg_id: str,
    submission: SPGFormReportSubmission,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGReportRecord:
    """File a report by filling in the dashboard form.

    Nothing is uploaded: the content is stored in Firestore and the dashboard
    renders it directly. Same permissions, same sequence and same review path
    as a PDF report.

    Submitting awards no points and creates no contribution.
    """
    _reportable_or_error(db, spg_id, user)
    try:
        return reports_service.submit_form_report(
            db, spg_id=spg_id, submission=submission, submitted_by=_uid(user)
        )
    except reports_service.SPGReportError as error:
        raise _handle(error) from None


@router.get(
    "/{spg_id}/reports",
    response_model=SPGReportPage,
    summary="One SPG's report history",
)
def list_reports(
    spg_id: str,
    report_type: Optional[SPGReportType] = Query(None),
    limit: int = Query(reports_service.DEFAULT_PAGE_SIZE, ge=1, le=reports_service.MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGReportPage:
    """Oldest first, so the history reads in the order it happened. Readable by
    a member of the SPG or by an admin."""
    spg = _readable_or_404(db, spg_id, user)
    if not _is_admin(user):
        _member_or_403(spg, user)
    try:
        items, next_cursor = reports_service.list_reports(
            db, spg_id=spg_id, report_type=report_type, limit=limit, cursor=cursor
        )
    except reports_service.SPGReportError as error:
        raise _handle(error) from None
    return SPGReportPage(items=items, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Milestones and Submilestones
# ---------------------------------------------------------------------------

@router.get(
    "/{spg_id}/milestones",
    response_model=List[SPGMilestone],
    summary="List SPG milestones and submilestones",
)
def list_milestones(
    spg_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> List[SPGMilestone]:
    """Retrieve all milestones and nested submilestones for an SPG."""
    spg = _readable_or_404(db, spg_id, user)
    try:
        return service.list_milestones(db, spg_id=spg.id)
    except service.SPGError as error:
        raise _handle(error) from None


@router.post(
    "/{spg_id}/milestones",
    response_model=SPGMilestone,
    status_code=status.HTTP_201_CREATED,
    summary="Create an SPG milestone",
)
def create_milestone(
    spg_id: str,
    payload: SPGMilestoneCreate,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGMilestone:
    """Create a new milestone under this SPG."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        return service.create_milestone(db, spg_id=spg.id, payload=payload)
    except service.SPGError as error:
        raise _handle(error) from None


@router.patch(
    "/{spg_id}/milestones/{milestone_id}",
    response_model=SPGMilestone,
    summary="Update an SPG milestone",
)
def update_milestone(
    spg_id: str,
    milestone_id: str,
    payload: SPGMilestoneUpdate,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGMilestone:
    """Update title, description, order, or completion status of an SPG milestone."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        return service.update_milestone(db, spg_id=spg.id, milestone_id=milestone_id, payload=payload)
    except service.SPGError as error:
        raise _handle(error) from None


@router.delete(
    "/{spg_id}/milestones/{milestone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an SPG milestone",
)
def delete_milestone(
    spg_id: str,
    milestone_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> None:
    """Delete a milestone and remove reference from the SPG."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        service.delete_milestone(db, spg_id=spg.id, milestone_id=milestone_id)
    except service.SPGError as error:
        raise _handle(error) from None


@router.post(
    "/{spg_id}/milestones/{milestone_id}/submilestones",
    response_model=SPGMilestone,
    status_code=status.HTTP_201_CREATED,
    summary="Add a submilestone to a milestone",
)
def add_submilestone(
    spg_id: str,
    milestone_id: str,
    payload: SPGSubmilestoneCreate,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGMilestone:
    """Add a nested submilestone item to an existing milestone."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        return service.add_submilestone(db, spg_id=spg.id, milestone_id=milestone_id, payload=payload)
    except service.SPGError as error:
        raise _handle(error) from None


@router.patch(
    "/{spg_id}/milestones/{milestone_id}/submilestones/{sub_id}",
    response_model=SPGMilestone,
    summary="Update or toggle a submilestone",
)
def update_submilestone(
    spg_id: str,
    milestone_id: str,
    sub_id: str,
    payload: SPGSubmilestoneUpdate,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGMilestone:
    """Update title or toggle completion status of a submilestone item."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        if payload.is_completed is not None:
            return service.toggle_submilestone(
                db, spg_id=spg.id, milestone_id=milestone_id, sub_id=sub_id, is_completed=payload.is_completed
            )
        milestone = service.get_milestone(db, spg.id, milestone_id)
        if not milestone:
            raise HTTPException(status_code=404, detail="Milestone not found.")
        new_subs = []
        found = False
        for s in milestone.submilestones:
            if s.id == sub_id:
                found = True
                new_subs.append(s.model_copy(update={"title": payload.title or s.title}))
            else:
                new_subs.append(s)
        if not found:
            raise HTTPException(status_code=404, detail="Submilestone not found.")
        updated = milestone.model_copy(update={"submilestones": new_subs, "updated_at": service.utcnow()})
        service._milestones_ref(db, spg.id).document(milestone_id).set(updated.model_dump())
        return updated
    except service.SPGError as error:
        raise _handle(error) from None


@router.delete(
    "/{spg_id}/milestones/{milestone_id}/submilestones/{sub_id}",
    response_model=SPGMilestone,
    summary="Delete a submilestone from a milestone",
)
def delete_submilestone(
    spg_id: str,
    milestone_id: str,
    sub_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> SPGMilestone:
    """Delete a submilestone item from a milestone."""
    spg = _readable_or_404(db, spg_id, user)
    _can_edit_milestones(spg, user)
    try:
        return service.delete_submilestone(db, spg_id=spg.id, milestone_id=milestone_id, sub_id=sub_id)
    except service.SPGError as error:
        raise _handle(error) from None

