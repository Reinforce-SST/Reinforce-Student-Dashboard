"""Student Project Group API.

Thin handlers over app/services/spgs.py and app/services/spg_reports.py.

**No route here creates an SPG.** A registration raises an `spg_registration`
ticket, a reviewer approves it, and that approval calls `create_spg`. The
ticket domain does not exist in this repository yet — tickets are written by
the Discord bot and mirrored read-only — so creation stays an internal service
rather than being fronted by an endpoint that would take a ticket ID it could
not check. See docs/SPG_WORKFLOW.md.

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
    SPGPage,
    SPGResponse,
    SPGStatus,
    SPGTrack,
    SPGType,
    SPGUpdate,
    SPGVisibility,
)
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


# ---------------------------------------------------------------------------
# There is deliberately no creation route here.
#
# An SPG is created by approving an `spg_registration` ticket, and this
# repository has no writable ticket domain yet. An endpoint that took a ticket
# ID it never checked would be a second creation path wearing the name of the
# first, so `create_spg` stays an internal service until the ticket approval
# handler can call it with a ticket it has actually read. The proposition
# upload helpers stay in app/services/uploads.py for that handler to use.
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
    the admin makes through the contribution workflow.
    """
    try:
        return reports_service.verify_report(db, report_id=report_id, admin_id=_uid(admin))
    except reports_service.SPGReportError as error:
        raise _handle(error) from None


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

@router.get("", response_model=SPGPage, summary="Browse SPGs")
def list_spgs(
    status_filter: Optional[SPGStatus] = Query(None, alias="status"),
    type_filter: Optional[SPGType] = Query(None, alias="type"),
    track: Optional[SPGTrack] = Query(None),
    member_id: Optional[str] = Query(None, description="Only SPGs this member UID belongs to"),
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
            member_id=member_id,
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
