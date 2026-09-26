"""SPG report submission, listing and verification.

A report is either a filled-in form or an uploaded PDF, and the member chooses.
Both land in the same collection through `_persist`, so they share one sequence
per SPG and one set of rules rather than drifting apart.

A report is stored once and never rewritten: filing a correction means filing
another report, so the history of what a group claimed, and when, stays intact.

Verifying a report records who reviewed it and when. It awards nothing. No
contribution is created, no points move, and nothing here reads or writes the
contributions collection — awarding is a separate admin decision made through
the contribution workflow afterwards.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, List, Optional, Tuple

from pydantic import ValidationError

from app.schemas.spg_reports import (
    SPGFormReportSubmission,
    SPGReportFormat,
    SPGReportRecord,
    SPGReportStatus,
    SPGReportType,
)
from app.services import uploads

REPORTS_COLLECTION = "spg_reports"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class SPGReportError(Exception):
    """A failure with the HTTP status the API should answer with."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def run_in_transaction(db: Any, work: Callable[[Any], Any]) -> Any:
    """Run `work(transaction)` inside a Firestore transaction."""
    from google.cloud import firestore as google_firestore

    transaction = db.transaction()
    return google_firestore.transactional(work)(transaction)


def _load(snapshot: Any) -> SPGReportRecord:
    data = dict(snapshot.to_dict() or {})
    data.setdefault("id", snapshot.id)
    return SPGReportRecord.model_validate(data)


def _reports_of(db: Any, spg_id: str):
    return db.collection(REPORTS_COLLECTION).where("spg_id", "==", spg_id)


def next_sequence_number(db: Any, spg_id: str) -> int:
    """One past the highest sequence this SPG has used.

    Numbers are never reused and never renumbered, so a rejected or superseded
    report keeps the position it was filed in.
    """
    highest = 0
    for snapshot in _reports_of(db, spg_id).stream():
        value = (snapshot.to_dict() or {}).get("sequence_number")
        if isinstance(value, int) and value > highest:
            highest = value
    return highest + 1


def _persist(
    db: Any,
    *,
    record_fields: dict,
    runner: Callable[[Any, Callable[[Any], Any]], Any],
) -> SPGReportRecord:
    """Allocate the sequence number and write the report, in one transaction.

    Both formats come through here, so they share one sequence per SPG and one
    set of rules. Allocating inside the transaction is what stops two
    submissions racing each other onto the same number.
    """
    collection = db.collection(REPORTS_COLLECTION)

    def work(transaction: Any) -> SPGReportRecord:
        record = SPGReportRecord(
            sequence_number=next_sequence_number(db, record_fields["spg_id"]),
            status=SPGReportStatus.PENDING,
            **record_fields,
        )
        transaction.set(collection.document(record.id), record.model_dump())
        return record

    return runner(db, work)


def submit_pdf_report(
    db: Any,
    *,
    spg_id: str,
    heading: str,
    short_description: str,
    payload: bytes,
    submitted_by: str,
    report_type: SPGReportType = SPGReportType.PROGRESS,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
    store: Optional[Callable[[bytes, str], str]] = None,
) -> SPGReportRecord:
    """File a report as an uploaded PDF.

    The PDF is uploaded first and the document written second, inside a guard
    that removes the uploaded object if the write fails — otherwise a failed
    submission would leave a file nobody can reach through any record.

    Callers validate membership and SPG state before calling; this function
    owns storage, numbering and persistence.
    """
    runner = runner or run_in_transaction
    store = store or uploads.store_pdf
    report_id = f"rep_{uuid.uuid4().hex[:24]}"
    destination = uploads.report_path(spg_id, report_id)
    pdf_url = store(payload, destination)

    try:
        return _persist(
            db,
            record_fields={
                "id": report_id,
                "spg_id": spg_id,
                "report_type": report_type,
                "report_format": SPGReportFormat.PDF,
                "heading": heading,
                "short_description": short_description,
                "pdf_url": pdf_url,
                "submitted_by": submitted_by,
                "submitted_at": now or utcnow(),
            },
            runner=runner,
        )
    except Exception:
        _discard(destination)
        raise


def submit_form_report(
    db: Any,
    *,
    spg_id: str,
    submission: SPGFormReportSubmission,
    submitted_by: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> SPGReportRecord:
    """File a report as the structured update typed into the dashboard.

    Nothing is uploaded: the content is the record, so there is no storage
    object to clean up if the write fails.
    """
    runner = runner or run_in_transaction
    return _persist(
        db,
        record_fields={
            "id": f"rep_{uuid.uuid4().hex[:24]}",
            "spg_id": spg_id,
            "report_type": submission.report_type,
            "report_format": SPGReportFormat.FORM,
            "heading": submission.heading,
            "short_description": submission.short_description,
            "summary": submission.summary,
            "milestones": list(submission.milestones),
            "blockers": submission.blockers,
            "next_steps": submission.next_steps,
            "submitted_by": submitted_by,
            "submitted_at": now or utcnow(),
        },
        runner=runner,
    )


def _discard(destination_path: str) -> None:
    """Best effort removal of an object whose record was never written."""
    try:
        from app.services.firebase import get_bucket

        get_bucket().blob(destination_path).delete()
    except Exception:
        # The upload is orphaned rather than the request failing twice; the
        # caller is already raising the real error.
        pass


def get_report(db: Any, report_id: str) -> Optional[SPGReportRecord]:
    snapshot = db.collection(REPORTS_COLLECTION).document(report_id).get()
    if not getattr(snapshot, "exists", False):
        return None
    try:
        return _load(snapshot)
    except ValidationError:
        raise SPGReportError(409, "The stored report does not match the report schema.") from None


def list_reports(
    db: Any,
    *,
    spg_id: str,
    report_type: Optional[SPGReportType] = None,
    limit: int = DEFAULT_PAGE_SIZE,
    cursor: Optional[str] = None,
) -> Tuple[List[SPGReportRecord], Optional[str]]:
    """A bounded page of one SPG's reports, oldest first."""
    size = max(1, min(limit, MAX_PAGE_SIZE))
    query = _reports_of(db, spg_id)
    if report_type is not None:
        query = query.where("report_type", "==", report_type.value)
    query = query.order_by("sequence_number")

    if cursor is not None:
        anchor = db.collection(REPORTS_COLLECTION).document(cursor).get()
        if not getattr(anchor, "exists", False):
            raise SPGReportError(400, "Unknown pagination cursor.")
        query = query.start_after(anchor)

    rows = list(query.limit(size + 1).stream())
    items = [_load(snapshot) for snapshot in rows[:size]]
    next_cursor = items[-1].id if len(rows) > size and items else None
    return items, next_cursor


def count_reports(db: Any, spg_id: str) -> int:
    return sum(1 for _ in _reports_of(db, spg_id).stream())


def verify_report(
    db: Any,
    *,
    report_id: str,
    admin_id: str,
    runner: Optional[Callable[[Any, Callable[[Any], Any]], Any]] = None,
    now: Optional[datetime] = None,
) -> SPGReportRecord:
    """Mark a report reviewed.

    This records who verified it and when, and nothing else. It creates no
    contribution and moves no points: whether the work earns points is a
    separate decision an admin makes in the contribution workflow.

    Verifying an already verified report returns it unchanged, so a retry is
    harmless.
    """
    runner = runner or run_in_transaction
    moment = now or utcnow()
    collection = db.collection(REPORTS_COLLECTION)

    def work(transaction: Any) -> SPGReportRecord:
        reference = collection.document(report_id)
        snapshot = reference.get(transaction=transaction)
        if not getattr(snapshot, "exists", False):
            raise SPGReportError(404, "Report not found.")
        existing = _load(snapshot)
        if existing.status is SPGReportStatus.VERIFIED:
            return existing
        verified = existing.model_copy(
            update={
                "status": SPGReportStatus.VERIFIED,
                "verified_by": admin_id,
                "verified_at": moment,
            }
        )
        transaction.set(reference, verified.model_dump())
        return verified

    return runner(db, work)
