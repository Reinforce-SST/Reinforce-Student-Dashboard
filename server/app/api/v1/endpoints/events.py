"""Events System API endpoints.

Implements the specification in server/plan.md.
Connects event discovery, member RSVP (solo & team), eligibility checks,
event-specific SPGs, admin attendance roll-calls, competition awards,
and post-event feedback.
Strictly follows zero user denormalization (pure UID references).
"""

from datetime import datetime, timezone
import hashlib
import io
from typing import Any, Dict, List, Optional, Set
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from google.cloud import firestore

from app.api.security import get_admin_user, get_current_user, get_optional_current_user
from app.services.firebase import db, upload_file_to_storage
from app.services.images import ImageRejected, read_image
from app.services import contributions as contribution_service
from app.services.contributions import ContributionError
from app.utils import get_user_uid, is_admin_user, now_iso, resolve_batch_year, slugify
from app.schemas.contributions import (
    AdminAwardUser,
    ContributionCategory,
    ContributionTrack,
)
from app.schemas.events import (
    EventCreate,
    EventDocument,
    EventEligibility,
    EventListResponse,
    EventParticipationConfig,
    EventRegisterRequest,
    EventResources,
    EventStats,
    EventStatus,
    EventStatusUpdate,
    EventSummary,
    EventTrack,
    EventUpdate,
    EventWinner,
    EventWinnersUpdateRequest,
    FeedbackDocument,
    FeedbackSubmitRequest,
    FeedbackSummaryResponse,
    MyRegistrationResponse,
    ManualRegistrationRequest,
    PointsRewardConfig,
    RegistrationAttendanceUpdateRequest,
    RegistrationDocument,
    RegistrationStatus,
    RollCallRequest,
    RollCallResponse,
    SPGDecisionAction,
    SPGDecisionRequest,
    VenueInfo,
    current_graduation_batches,
    WinnerAwardRequest,
    WinnerAwardResponse,
)

router = APIRouter(prefix="/events", tags=["events"])

EVENTS_COLLECTION = "events"
EVENT_SLUGS_COLLECTION = "event_slugs"
REGISTRATIONS_SUBCOLLECTION = "registrations"
FEEDBACK_SUBCOLLECTION = "feedback"
SPGS_COLLECTION = "spgs"
USERS_COLLECTION = "users"
CONTRIBUTIONS_COLLECTION = "contributions"


# --- Helpers ---


def _get_event_doc_or_404(id_or_slug: str) -> firestore.DocumentSnapshot:
    """Retrieve event doc by ID or slug."""
    doc_ref = db.collection(EVENTS_COLLECTION).document(id_or_slug)
    doc = doc_ref.get()
    if doc.exists:
        return doc

    # Try matching by slug
    slug_query = (
        db.collection(EVENTS_COLLECTION).where("slug", "==", id_or_slug).limit(1).get()
    )
    if slug_query:
        return slug_query[0]

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Event '{id_or_slug}' not found",
    )


def _doc_to_event_document(doc: firestore.DocumentSnapshot) -> EventDocument:
    data = doc.to_dict() or {}
    data["id"] = doc.id
    return EventDocument.model_validate(data)


def _doc_to_event_summary(doc: firestore.DocumentSnapshot) -> EventSummary:
    data = doc.to_dict() or {}
    data["id"] = doc.id
    return EventSummary.model_validate(data)


def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event timestamps must include a timezone.",
        )
    return parsed.astimezone(timezone.utc)


def _active_registration(data: Dict[str, Any]) -> bool:
    return data.get("status") != RegistrationStatus.CANCELLED.value


def _registrations_for_user(
    regs_ref: Any, user_uid: str, transaction: Any = None
) -> List[Any]:
    """Return every registration involving a user, including legacy duplicates."""
    by_id = {}
    for query in (
        regs_ref.where("user_id", "==", user_uid),
        regs_ref.where("member_uids", "array_contains", user_uid),
    ):
        docs = transaction.get(query) if transaction is not None else query.stream()
        for doc in docs:
            by_id[doc.id] = doc
    return list(by_id.values())


def _slug_ref(slug: str):
    slug_id = hashlib.sha256(slug.encode("utf-8")).hexdigest()
    return db.collection(EVENT_SLUGS_COLLECTION).document(slug_id)


class SlugConflictError(Exception):
    pass


def _claim_event_slug(transaction: Any, slug: str, event_id: str) -> None:
    reservation_ref = _slug_ref(slug)
    reservation = reservation_ref.get(transaction=transaction)
    if reservation.exists and (reservation.to_dict() or {}).get("event_id") != event_id:
        raise SlugConflictError(slug)

    legacy_matches = list(
        transaction.get(db.collection(EVENTS_COLLECTION).where("slug", "==", slug))
    )
    if any(match.id != event_id for match in legacy_matches):
        raise SlugConflictError(slug)

    transaction.set(
        reservation_ref,
        {"slug": slug, "event_id": event_id, "updated_at": now_iso()},
    )


def _profile_tracks(profile: Dict[str, Any]) -> set[str]:
    explicit = profile.get("tracks") or profile.get("track") or []
    if isinstance(explicit, str):
        explicit = [explicit]
    tracks = {str(item) for item in explicit}
    points = profile.get("points") or {}
    tracks.update(
        track
        for track in ("kaggle", "product", "research", "misc")
        if int(points.get(track, 0) or 0) > 0
    )
    return tracks


def _check_member_eligibility(
    event: EventDocument, user_uid: str, profile: Dict[str, Any]
) -> None:
    eligibility = event.eligibility
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_uid} was not found",
        )
    if eligibility.access_scope.value == "members_only" and not profile.get(
        "is_member", False
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User {user_uid} is not an eligible club member",
        )
    legacy_default_years = {1, 2, 3, 4}
    batch_year = profile.get("batch_year")
    if any(year >= 2000 for year in eligibility.allowed_years):
        batch_year = resolve_batch_year(batch_year, profile.get("email") or "")
    allowed_years = set(eligibility.allowed_years)
    if allowed_years == legacy_default_years:
        # Existing events used 1–4 as the default before profiles stored
        # graduation years. Keep those events open to the confirmed batches.
        allowed_years.update(current_graduation_batches())
    years_restricted = (
        bool(eligibility.allowed_years)
        and set(eligibility.allowed_years) != legacy_default_years
    )
    if (
        batch_year is not None
        and allowed_years
        and batch_year not in allowed_years
    ) or (batch_year is None and years_restricted):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User {user_uid} is not in an allowed graduation batch",
        )
    allowed_tiers = set(eligibility.allowed_tiers)
    if (
        allowed_tiers
        and "all" not in allowed_tiers
        and profile.get("tier", "beginner") not in allowed_tiers
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User {user_uid} is not in an allowed member tier",
        )
    allowed_tracks = set(eligibility.allowed_tracks)
    if (
        allowed_tracks
        and "all" not in allowed_tracks
        and not (_profile_tracks(profile) & allowed_tracks)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User {user_uid} is not active in an allowed track",
        )


def _spg_track(event_track: str) -> str:
    return (
        event_track if event_track in {"research", "product", "kaggle"} else "general"
    )


def _contribution_track(track: str) -> ContributionTrack:
    return (
        ContributionTrack(track)
        if track in {"research", "product", "kaggle", "misc"}
        else ContributionTrack.MISC
    )


def _validate_learning_resource_ids(resource_ids: List[str]) -> None:
    """Ensure event links point at resources that exist in the shared pool."""
    for resource_id in resource_ids:
        if not db.collection("learning_resources").document(resource_id).get().exists:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Learning resource '{resource_id}' does not exist.",
            )


def _event_spg_data(
    event: EventDocument,
    event_id: str,
    user_uid: str,
    member_uids: List[str],
    team_name: Optional[str],
) -> tuple[str, Dict[str, Any]]:
    spg_id = f"spg_{event.slug}_{uuid.uuid4().hex[:12]}"
    now = now_iso()
    return spg_id, {
        "name": (team_name or f"Event Team - {user_uid[:6]}")[:200],
        "description": f"Event-specific SPG for {event.title}",
        "type": "event",
        "track": _spg_track(event.track),
        "visibility": "public",
        "status": "active",
        "lead_id": user_uid,
        "member_ids": member_uids,
        "created_by": user_uid,
        "created_at": now,
        "updated_at": now,
        "source_ticket_id": None,
        "event_id": event_id,
        "is_event_derived": True,
    }


def run_event_transaction(work):
    transaction = db.transaction()
    return firestore.transactional(work)(transaction)


# --- Public & Member Discovery Endpoints ---


@router.get("", response_model=EventListResponse)
def list_events(
    status_filter: Optional[EventStatus] = Query(None, alias="status"),
    track: Optional[EventTrack] = None,
    event_type: Optional[str] = Query(None, description="Filter by event type string"),
    timeline: Optional[str] = Query(None, pattern="^(upcoming|past)$"),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """List events with rich filtering for status, track, type, and timeline."""
    is_admin = is_admin_user(current_user)
    query = db.collection(EVENTS_COLLECTION)

    if (
        status_filter
        and not is_admin
        and status_filter in {EventStatus.DRAFT, EventStatus.ARCHIVED}
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That event status is private.",
        )
    if status_filter:
        query = query.where("status", "==", status_filter.value)
    elif not is_admin:
        # Public visitors and non-admins only see published, registration_closed, ongoing, completed
        query = query.where(
            "status",
            "in",
            [
                EventStatus.PUBLISHED.value,
                EventStatus.REGISTRATION_CLOSED.value,
                EventStatus.ONGOING.value,
                EventStatus.COMPLETED.value,
            ],
        )

    if track:
        query = query.where("track", "==", track.value)
    if event_type:
        query = query.where("event_type", "==", event_type)

    docs = list(query.stream())
    events: List[EventSummary] = []
    now_str = now_iso()

    for d in docs:
        item = _doc_to_event_summary(d)

        # Timeline filter
        if timeline == "upcoming":
            if (
                item.schedule.start_time < now_str
                and item.status == EventStatus.COMPLETED.value
            ):
                continue
        elif timeline == "past":
            if (
                item.status != EventStatus.COMPLETED.value
                and item.schedule.start_time >= now_str
            ):
                continue

        # Search query filter (title or description)
        if search:
            q = search.lower()
            if q not in item.title.lower() and q not in item.description.lower():
                continue

        events.append(item)

    # Sort: upcoming first, then by schedule.start_time
    events.sort(key=lambda e: e.schedule.start_time, reverse=(timeline == "past"))

    total = len(events)
    start_idx = (page - 1) * limit
    paged = events[start_idx : start_idx + limit]

    return EventListResponse(events=paged, total=total)


@router.get("/{id_or_slug}", response_model=EventDocument)
def get_event_detail(
    id_or_slug: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """Get full event details, schedule, eligibility, and resource links."""
    doc = _get_event_doc_or_404(id_or_slug)
    event = _doc_to_event_document(doc)
    if event.status in {
        EventStatus.DRAFT.value,
        EventStatus.ARCHIVED.value,
    } and not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )
    return event


@router.get("/{id}/my-registration", response_model=MyRegistrationResponse)
def get_my_registration(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get the current authenticated user's registration status for this event."""
    user_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )

    matches = [
        doc
        for doc in _registrations_for_user(regs_ref, user_uid)
        if _active_registration(doc.to_dict() or {})
    ]
    if matches:
        reg_dict = matches[0].to_dict() or {}
        reg_dict["id"] = matches[0].id
        return MyRegistrationResponse(
            is_registered=True,
            registration=RegistrationDocument.model_validate(reg_dict),
        )

    return MyRegistrationResponse(is_registered=False, registration=None)


# --- RSVP / Registration Endpoints ---


@router.post(
    "/{id}/register",
    response_model=RegistrationDocument,
    status_code=status.HTTP_201_CREATED,
)
def register_for_event(
    id: str,
    payload: EventRegisterRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """RSVP solo or register a team for an event.

    Enforces eligibility checks, capacity/waitlist limits, and event SPG spawning.
    """
    user_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event = _doc_to_event_document(event_doc)

    # 1. Check Event Status & Deadline
    if (
        event.status != EventStatus.PUBLISHED.value
        and event.status != EventStatus.ONGOING.value
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration is not open for this event (status: {event.status})",
        )
    if event.schedule.registration_deadline and _parse_utc(
        event.schedule.registration_deadline
    ) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration deadline for this event has passed",
        )

    # 2. Check Team vs Solo Participation Rules
    member_uids = list(set(payload.member_uids))
    if user_uid not in member_uids:
        member_uids.append(user_uid)

    if event.participation.mode.value == "solo":
        member_uids = [user_uid]
        team_name = None
    else:
        # Team mode
        team_name = payload.team_name
        if not team_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Team name is required for team events",
            )
        if len(member_uids) < event.participation.min_team_size:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Minimum team size is {event.participation.min_team_size}",
            )
        if len(member_uids) > event.participation.max_team_size:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Maximum team size is {event.participation.max_team_size}",
            )

    # 3. Check every participant's profile and event eligibility.
    member_profiles = {}
    for member_uid in member_uids:
        user_doc = db.collection(USERS_COLLECTION).document(member_uid).get()
        profile = user_doc.to_dict() if user_doc.exists else {}
        member_profiles[member_uid] = profile
        _check_member_eligibility(
            event,
            member_uid,
            profile,
        )

    # 4. Reserve capacity and create the registration/SPG in one transaction.
    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    reg_id = f"reg_{uuid.uuid4().hex[:10]}"
    now_timestamp = now_iso()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    reg_ref = regs_ref.document(reg_id)

    def reserve(transaction):
        fresh = event_ref.get(transaction=transaction).to_dict() or {}
        fresh_event = EventDocument.model_validate({**fresh, "id": event_id})
        if fresh_event.status not in {
            EventStatus.PUBLISHED.value,
            EventStatus.ONGOING.value,
        }:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Registration is not open for this event (status: {fresh_event.status})",
            )
        if fresh_event.schedule.registration_deadline and _parse_utc(
            fresh_event.schedule.registration_deadline
        ) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration deadline for this event has passed",
            )
        if fresh_event.participation.mode.value == "solo" and member_uids != [user_uid]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Event participation changed; submit a solo registration.",
            )
        if fresh_event.participation.mode.value == "team":
            if not team_name:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Team name is required for team events",
                )
            if not (
                fresh_event.participation.min_team_size
                <= len(member_uids)
                <= fresh_event.participation.max_team_size
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Event team-size rules changed; review the registration.",
                )
        for member_uid in member_uids:
            _check_member_eligibility(
                fresh_event, member_uid, member_profiles[member_uid]
            )
        for member_uid in member_uids:
            if any(
                _active_registration(doc.to_dict() or {})
                for doc in _registrations_for_user(
                    regs_ref, member_uid, transaction=transaction
                )
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"User {member_uid} is already registered for this event",
                )

        registered = int((fresh.get("stats") or {}).get("registered_count", 0))
        maximum = fresh_event.participation.max_participants
        fits = maximum is None or registered + len(member_uids) <= maximum
        reg_status = (
            RegistrationStatus.REGISTERED.value
            if fits
            else RegistrationStatus.WAITLISTED.value
        )
        spg_id = None
        if fresh_event.participation.requires_event_spg and fits:
            spg_id, spg_data = _event_spg_data(
                fresh_event, event_id, user_uid, member_uids, team_name
            )
            transaction.set(db.collection(SPGS_COLLECTION).document(spg_id), spg_data)
        registration_data = {
            "id": reg_id,
            "event_id": event_id,
            "user_id": user_uid,
            "team_name": team_name,
            "member_uids": member_uids,
            "spg_id": spg_id,
            "spg_status": None,
            "status": reg_status,
            "checked_in_at": None,
            "checked_in_by": None,
            "registered_at": now_timestamp,
        }
        transaction.set(reg_ref, registration_data)
        if fits:
            transaction.update(
                event_ref,
                {
                    "stats.registered_count": registered + len(member_uids),
                    "updated_at": now_timestamp,
                },
            )
        return registration_data

    registration_data = run_event_transaction(reserve)

    return RegistrationDocument.model_validate(registration_data)


@router.delete("/{id}/register")
def cancel_registration(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Cancel current user's registration and promote next waitlisted team if any."""
    user_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    now_timestamp = now_iso()

    def cancel_and_promote(transaction):
        lead_docs = list(transaction.get(regs_ref.where("user_id", "==", user_uid)))
        active_leads = [
            doc for doc in lead_docs if _active_registration(doc.to_dict() or {})
        ]
        if not active_leads:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No registration found where you are the lead/registrant",
            )

        reg_doc = active_leads[0]
        reg_data = reg_doc.to_dict() or {}
        prev_status = reg_data.get("status")
        event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
        fresh = event_ref.get(transaction=transaction).to_dict() or {}
        fresh_event = EventDocument.model_validate({**fresh, "id": event_id})
        current_count = int((fresh.get("stats") or {}).get("registered_count", 0))

        waitlist = []
        if prev_status in {
            RegistrationStatus.REGISTERED.value,
            RegistrationStatus.CHECKED_IN.value,
        }:
            waitlist = list(
                transaction.get(
                    regs_ref.where("status", "==", RegistrationStatus.WAITLISTED.value)
                    .order_by("registered_at")
                    .limit(1)
                )
            )

        transaction.update(
            reg_doc.reference,
            {
                "status": RegistrationStatus.CANCELLED.value,
                "updated_at": now_timestamp,
            },
        )
        if reg_data.get("spg_id"):
            transaction.update(
                db.collection(SPGS_COLLECTION).document(reg_data["spg_id"]),
                {"status": "disbanded", "updated_at": now_timestamp},
            )

        if prev_status not in {
            RegistrationStatus.REGISTERED.value,
            RegistrationStatus.CHECKED_IN.value,
        }:
            return

        member_count = len(reg_data.get("member_uids") or [user_uid])
        updated_count = max(0, current_count - member_count)
        if waitlist:
            next_reg = waitlist[0]
            next_data = next_reg.to_dict() or {}
            next_member_uids = next_data.get("member_uids") or [
                next_data.get("user_id")
            ]
            next_members = len(next_member_uids)
            maximum = fresh_event.participation.max_participants
            if maximum is None or updated_count + next_members <= maximum:
                promotion = {
                    "status": RegistrationStatus.REGISTERED.value,
                    "updated_at": now_timestamp,
                }
                if fresh_event.participation.requires_event_spg and not next_data.get(
                    "spg_id"
                ):
                    spg_id, spg_data = _event_spg_data(
                        fresh_event,
                        event_id,
                        next_data.get("user_id") or "",
                        next_member_uids,
                        next_data.get("team_name"),
                    )
                    transaction.set(
                        db.collection(SPGS_COLLECTION).document(spg_id), spg_data
                    )
                    promotion.update(
                        {
                            "spg_id": spg_id,
                        }
                    )
                transaction.update(next_reg.reference, promotion)
                updated_count += next_members

        transaction.update(
            event_ref,
            {
                "stats.registered_count": updated_count,
                "updated_at": now_timestamp,
            },
        )

    run_event_transaction(cancel_and_promote)

    return {"message": "Registration cancelled successfully"}


# --- Feedback Endpoints ---


@router.post(
    "/{id}/feedback",
    response_model=FeedbackDocument,
    status_code=status.HTTP_201_CREATED,
)
def submit_event_feedback(
    id: str,
    payload: FeedbackSubmitRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Submit rating and feedback for an event."""
    user_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    now_timestamp = now_iso()
    feedback_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(FEEDBACK_SUBCOLLECTION)
        .document(user_uid)
    )

    feedback_data = {
        "user_uid": user_uid,
        "rating_content": payload.rating_content,
        "rating_organization": payload.rating_organization,
        "rating_overall": payload.rating_overall,
        "takeaways": payload.takeaways,
        "improvements": payload.improvements,
        "is_anonymous": payload.is_anonymous,
        "created_at": now_timestamp,
    }

    feedback_ref.set(feedback_data)

    # Recalculate average rating and feedback count
    all_feedbacks = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(FEEDBACK_SUBCOLLECTION)
        .get()
    )
    fb_list = [f.to_dict() for f in all_feedbacks if f.exists]
    count = len(fb_list)
    avg = sum(f.get("rating_overall", 0) for f in fb_list) / count if count > 0 else 0.0

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "stats.feedback_count": count,
            "stats.average_rating": round(avg, 2),
            "updated_at": now_timestamp,
        }
    )

    return FeedbackDocument.model_validate(feedback_data)


# --- SPG Decision Endpoint ---


@router.post("/{id}/spg-decision")
def event_spg_decision(
    id: str,
    payload: SPGDecisionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Team leader decides whether to convert the event SPG to a permanent project or disband."""
    user_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    lead_query = regs_ref.where("user_id", "==", user_uid).limit(1).get()
    if not lead_query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registration found where you are the leader",
        )

    reg_doc = lead_query[0]
    reg_data = reg_doc.to_dict() or {}
    spg_id = reg_data.get("spg_id")

    if not spg_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No event-specific SPG is linked to this registration",
        )

    now_timestamp = now_iso()
    if payload.action == SPGDecisionAction.CONVERT_PERMANENT:
        db.collection(SPGS_COLLECTION).document(spg_id).update(
            {
                "type": "project",
                "visibility": "public",
                "updated_at": now_timestamp,
            }
        )
        return {
            "message": "Event SPG successfully converted to a permanent Project SPG"
        }
    else:
        db.collection(SPGS_COLLECTION).document(spg_id).update(
            {
                "status": "disbanded",
                "updated_at": now_timestamp,
            }
        )
        return {"message": "Event SPG successfully disbanded"}


# --- Admin Management Endpoints ---


@router.post("/media", summary="Upload a public event banner or poster (Admin only)")
def upload_event_media(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    try:
        payload, extension = read_image(file.file, file.content_type)
    except ImageRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    destination_path = f"events/media/{uuid.uuid4().hex}.{extension}"
    try:
        url = upload_file_to_storage(
            io.BytesIO(payload), destination_path, f"image/{'jpeg' if extension == 'jpg' else extension}", shareable=True
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Image storage is unavailable. Try again later.") from exc
    return {"url": url}


@router.post("", response_model=EventDocument, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Create a new event (Admin only)."""
    admin_uid = get_user_uid(current_user)
    resource_ids = (payload.resources or EventResources()).learning_resource_ids
    _validate_learning_resource_ids(resource_ids)
    now_timestamp = now_iso()
    event_id = f"evt_{uuid.uuid4().hex[:10]}"
    requested_slug = payload.slug or slugify(payload.title)
    slug = requested_slug

    event_data = {
        "id": event_id,
        "slug": slug,
        "title": payload.title,
        "description": payload.description,
        "detailed_info": payload.detailed_info,
        "event_type": payload.event_type,
        "track": payload.track.value,
        "format": payload.format.value,
        "venue_info": (payload.venue_info or VenueInfo()).model_dump(),
        "schedule": payload.schedule.model_dump(),
        "eligibility": (payload.eligibility or EventEligibility()).model_dump(),
        "participation": (
            payload.participation or EventParticipationConfig()
        ).model_dump(),
        "points_reward": (payload.points_reward or PointsRewardConfig()).model_dump(),
        "resources": (payload.resources or EventResources()).model_dump(),
        "stats": EventStats().model_dump(),
        "banner_url": payload.banner_url,
        "banner_badge_text": payload.banner_badge_text,
        "banner_cta_text": payload.banner_cta_text,
        "banner_cta_url": payload.banner_cta_url,
        "winners": None,
        "status": payload.status.value,
        "created_by": admin_uid,
        "created_at": now_timestamp,
        "updated_at": now_timestamp,
    }

    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    for attempt in range(5):
        event_data["slug"] = slug

        def create_with_slug(transaction):
            _claim_event_slug(transaction, slug, event_id)
            transaction.set(event_ref, event_data)

        try:
            run_event_transaction(create_with_slug)
            break
        except SlugConflictError:
            if payload.slug is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another event already uses that slug.",
                )
            slug = f"{requested_slug}-{uuid.uuid4().hex[:4]}"
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not reserve a unique event slug.",
        )

    return EventDocument.model_validate(event_data)


@router.put("/{id}", response_model=EventDocument)
def update_event(
    id: str,
    payload: EventUpdate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Update event configuration, schedule, or details (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    if "schedule" in payload.model_fields_set and payload.schedule is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="schedule cannot be null",
        )

    update_dict = payload.model_dump(mode="json", exclude_unset=True)
    if not update_dict:
        return _doc_to_event_document(event_doc)

    incoming_resources = update_dict.get("resources")
    if incoming_resources is not None:
        resource_ids = incoming_resources.get("learning_resource_ids")
        if resource_ids is not None:
            _validate_learning_resource_ids(resource_ids)

    update_dict["updated_at"] = now_iso()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)

    def update_with_slug(transaction):
        fresh_doc = event_ref.get(transaction=transaction)
        fresh = fresh_doc.to_dict() or {}
        event_update = dict(update_dict)
        if "resources" in event_update and event_update["resources"] is not None:
            # Keep old URL fields and resource references when an older client
            # only sends the fields it knows about.
            event_update["resources"] = {
                **(fresh.get("resources") or {}),
                **event_update["resources"],
            }
        old_slug = fresh.get("slug")
        new_slug = event_update.get("slug", old_slug)
        old_reservation = None
        if old_slug and old_slug != new_slug:
            old_reservation = _slug_ref(old_slug).get(transaction=transaction)
        if new_slug:
            _claim_event_slug(transaction, new_slug, event_id)

        transaction.update(event_ref, event_update)
        if (
            old_reservation is not None
            and old_reservation.exists
            and (old_reservation.to_dict() or {}).get("event_id") == event_id
        ):
            transaction.delete(old_reservation.reference)

    try:
        run_event_transaction(update_with_slug)
    except SlugConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another event already uses that slug.",
        )

    updated_doc = db.collection(EVENTS_COLLECTION).document(event_id).get()
    return _doc_to_event_document(updated_doc)


@router.patch("/{id}/status", response_model=EventDocument)
def update_event_status(
    id: str,
    payload: EventStatusUpdate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Update event lifecycle status (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    now_timestamp = now_iso()
    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "status": payload.status.value,
            "updated_at": now_timestamp,
        }
    )

    updated_doc = db.collection(EVENTS_COLLECTION).document(event_id).get()
    return _doc_to_event_document(updated_doc)


@router.get("/{id}/registrations", response_model=List[RegistrationDocument])
def list_event_registrations(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """View list of registered attendees, teams, and waitlist for the event with resolved user profiles."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    regs = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
        .stream()
    )

    raw_regs: List[Dict[str, Any]] = []
    all_uids: Set[str] = set()

    for r in regs:
        r_dict = r.to_dict() or {}
        r_dict["id"] = r.id
        raw_regs.append(r_dict)
        if r_dict.get("user_id"):
            all_uids.add(r_dict["user_id"])
        for m in r_dict.get("member_uids") or []:
            if m:
                all_uids.add(m)

    user_profiles: Dict[str, Dict[str, Any]] = {}
    if all_uids:
        user_refs = [db.collection(USERS_COLLECTION).document(uid) for uid in all_uids]
        try:
            user_snaps = db.get_all(user_refs)
            for snap in user_snaps:
                if snap.exists:
                    udata = snap.to_dict() or {}
                    user_profiles[snap.id] = {
                        "id": snap.id,
                        "full_name": udata.get("full_name") or "Club Member",
                        "email": udata.get("email") or "",
                        "avatar_url": udata.get("avatar_url"),
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
                        "bio": udata.get("bio"),
                        "points": (udata.get("points") or {}).get("total", 0),
                    }
        except Exception:
            for uid in all_uids:
                snap = db.collection(USERS_COLLECTION).document(uid).get()
                if snap.exists:
                    udata = snap.to_dict() or {}
                    user_profiles[uid] = {
                        "id": uid,
                        "full_name": udata.get("full_name") or "Club Member",
                        "email": udata.get("email") or "",
                        "avatar_url": udata.get("avatar_url"),
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
                        "bio": udata.get("bio"),
                        "points": (udata.get("points") or {}).get("total", 0),
                    }

    # The attendee list is open to every member, but an attendance note is the
    # admin's own record — often the reason for a disqualification — and the
    # member view never shows it. Strip what only the attendance console needs.
    viewer_is_admin = is_admin_user(current_user)
    results: List[RegistrationDocument] = []
    for r_dict in raw_regs:
        if not viewer_is_admin:
            r_dict.pop("attendance_note", None)
            r_dict.pop("checked_in_by", None)
        uid = r_dict.get("user_id") or ""
        r_dict["user_profile"] = user_profiles.get(uid)
        r_dict["member_profiles"] = [
            user_profiles.get(m, {"id": m, "full_name": m})
            for m in (r_dict.get("member_uids") or ([uid] if uid else []))
            if m
        ]
        results.append(RegistrationDocument.model_validate(r_dict))

    return results


def _hydrate_single_registration_profiles(r_dict: Dict[str, Any]) -> Dict[str, Any]:
    uid = r_dict.get("user_id") or ""
    member_uids = r_dict.get("member_uids") or ([uid] if uid else [])
    target_uids = list({uid, *member_uids} - {""})

    profiles: Dict[str, Any] = {}
    if target_uids:
        try:
            refs = [db.collection(USERS_COLLECTION).document(u) for u in target_uids]
            snaps = db.get_all(refs)
            for snap in snaps:
                if snap.exists:
                    udata = snap.to_dict() or {}
                    u = snap.id
                    profiles[u] = {
                        "id": u,
                        "full_name": udata.get("full_name") or "Club Member",
                        "email": udata.get("email") or "",
                        "avatar_url": udata.get("avatar_url"),
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
                        "bio": udata.get("bio"),
                        "points": (udata.get("points") or {}).get("total", 0),
                    }
        except Exception:
            for u in target_uids:
                snap = db.collection(USERS_COLLECTION).document(u).get()
                if snap.exists:
                    udata = snap.to_dict() or {}
                    profiles[u] = {
                        "id": u,
                        "full_name": udata.get("full_name") or "Club Member",
                        "email": udata.get("email") or "",
                        "avatar_url": udata.get("avatar_url"),
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
                        "bio": udata.get("bio"),
                        "points": (udata.get("points") or {}).get("total", 0),
                    }

    r_dict["user_profile"] = profiles.get(uid)
    r_dict["member_profiles"] = [
        profiles.get(m, {"id": m, "full_name": m})
        for m in member_uids
        if m
    ]
    return r_dict


@router.patch(
    "/{id}/registrations/{reg_id}/attendance",
    response_model=RegistrationDocument,
    summary="Update attendee/SPG attendance status (Admin only)",
)
def update_registration_attendance(
    id: str,
    reg_id: str,
    payload: RegistrationAttendanceUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Update attendee/SPG attendance status (Admin only).
    Supports: checked_in (present), absent, disqualified, excused, registered, waitlisted, cancelled.
    If status is changed to checked_in and award_points is True, awards attendance merit points.
    """
    admin_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event = _doc_to_event_document(event_doc)

    reg_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
        .document(reg_id)
    )
    reg_snap = reg_ref.get()
    if not reg_snap.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registration '{reg_id}' not found for this event",
        )

    reg_data = reg_snap.to_dict() or {}
    now_timestamp = now_iso()
    new_status = payload.status.value

    updates: Dict[str, Any] = {
        "status": new_status,
        "updated_at": now_timestamp,
    }
    if payload.attendance_note is not None:
        updates["attendance_note"] = payload.attendance_note

    if new_status == RegistrationStatus.CHECKED_IN.value:
        updates["checked_in_at"] = now_timestamp
        updates["checked_in_by"] = admin_uid

        if payload.award_points:
            pts = event.points_reward.attendance_points
            attendance_title = f"Event attendance: {event_id}"[:200]
            occurred_at = _parse_utc(event.schedule.start_time)
            target_uids = reg_data.get("member_uids") or (
                [reg_data.get("user_id")] if reg_data.get("user_id") else []
            )
            for target_uid in target_uids:
                try:
                    contribution_service.award_user(
                        db,
                        user_id=target_uid,
                        award=AdminAwardUser(
                            category=ContributionCategory.ACHIEVEMENT,
                            track=_contribution_track(event.points_reward.track),
                            title=attendance_title,
                            points=pts,
                            event_id=event_id,
                            occurred_at=occurred_at,
                        ),
                        admin_id=admin_uid,
                    )
                except ContributionError:
                    pass

    reg_ref.update(updates)

    attendance_records = (
        db.collection(CONTRIBUTIONS_COLLECTION)
        .where("event_id", "==", event_id)
        .stream()
    )
    attendance_title = f"Event attendance: {event_id}"[:200]
    checked_in_count = len(
        {
            (record.to_dict() or {}).get("user_id")
            for record in attendance_records
            if (record.to_dict() or {}).get("title") == attendance_title
            and (record.to_dict() or {}).get("status") == "approved"
        }
    )
    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "stats.checked_in_count": checked_in_count,
            "updated_at": now_timestamp,
        }
    )

    fresh_reg = reg_ref.get().to_dict() or {}
    fresh_reg["id"] = reg_id
    _hydrate_single_registration_profiles(fresh_reg)
    return RegistrationDocument.model_validate(fresh_reg)


@router.post(
    "/{id}/registrations/manual",
    response_model=RegistrationDocument,
    summary="Add a participant manually / walk-in to attendance (Admin only)",
)
def add_manual_event_registration(
    id: str,
    payload: ManualRegistrationRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Add a student to attendance directly even if they haven't RSVPed (Admin only)."""
    admin_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event = _doc_to_event_document(event_doc)

    # 1. Resolve user by UID or email
    target_id = payload.user_id.strip()
    user_doc = db.collection("users").document(target_id).get()
    if not user_doc.exists:
        # Try search by email
        by_email = list(db.collection("users").where("email", "==", target_id.lower()).limit(1).stream())
        if by_email:
            user_doc = by_email[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student '{target_id}' not found in user directory.",
            )

    udata = user_doc.to_dict() or {}
    target_uid = udata.get("id") or user_doc.id

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )

    # Check if already registered
    existing_regs = list(regs_ref.where("user_id", "==", target_uid).stream())
    if not existing_regs:
        existing_regs = list(regs_ref.where("member_uids", "array_contains", target_uid).stream())

    now_timestamp = now_iso()
    new_status = payload.status.value

    if existing_regs:
        reg_doc = existing_regs[0]
        reg_id = reg_doc.id
        reg_ref = regs_ref.document(reg_id)
        reg_data = reg_doc.to_dict() or {}
        reg_data["status"] = new_status
        reg_data["updated_at"] = now_timestamp
        if payload.attendance_note is not None:
            reg_data["attendance_note"] = payload.attendance_note
        if new_status == RegistrationStatus.CHECKED_IN.value:
            reg_data["checked_in_at"] = now_timestamp
            reg_data["checked_in_by"] = admin_uid
        reg_ref.update({
            "status": new_status,
            "updated_at": now_timestamp,
            "attendance_note": reg_data.get("attendance_note"),
            "checked_in_at": reg_data.get("checked_in_at"),
            "checked_in_by": reg_data.get("checked_in_by"),
        })
    else:
        reg_id = f"reg_{uuid.uuid4().hex[:10]}"
        reg_data = {
            "id": reg_id,
            "event_id": event_id,
            "user_id": target_uid,
            "team_name": None,
            "member_uids": [target_uid],
            "spg_id": None,
            "spg_status": None,
            "status": new_status,
            "checked_in_at": now_timestamp if new_status == RegistrationStatus.CHECKED_IN.value else None,
            "checked_in_by": admin_uid if new_status == RegistrationStatus.CHECKED_IN.value else None,
            "attendance_note": payload.attendance_note or "Walk-in registration",
            "registered_at": now_timestamp,
            "updated_at": now_timestamp,
        }
        regs_ref.document(reg_id).set(reg_data)

        # Update event registered_count
        event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
        event_snap = event_ref.get()
        fresh_stats = (event_snap.to_dict() or {}).get("stats", {})
        current_reg_count = int(fresh_stats.get("registered_count", 0))
        event_ref.update({
            "stats.registered_count": current_reg_count + 1,
            "updated_at": now_timestamp,
        })

    # Award points if checked_in and requested
    if new_status == RegistrationStatus.CHECKED_IN.value and payload.award_points:
        pts = event.points_reward.attendance_points
        if pts:
            attendance_title = f"Event attendance: {event_id}"[:200]
            occurred_at = _parse_utc(event.schedule.start_time)
            try:
                contribution_service.award_user(
                    db,
                    user_id=target_uid,
                    award=AdminAwardUser(
                        category=ContributionCategory.ACHIEVEMENT,
                        track=_contribution_track(event.points_reward.track),
                        title=attendance_title,
                        points=pts,
                        event_id=event_id,
                        occurred_at=occurred_at,
                    ),
                    admin_id=admin_uid,
                )
            except ContributionError:
                pass

    # Recalculate checked-in count
    attendance_records = (
        db.collection(CONTRIBUTIONS_COLLECTION)
        .where("event_id", "==", event_id)
        .stream()
    )
    attendance_title = f"Event attendance: {event_id}"[:200]
    checked_in_count = len(
        {
            (record.to_dict() or {}).get("user_id")
            for record in attendance_records
            if (record.to_dict() or {}).get("title") == attendance_title
            and (record.to_dict() or {}).get("status") == "approved"
        }
    )
    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "stats.checked_in_count": checked_in_count,
            "updated_at": now_timestamp,
        }
    )

    prof = {
        "id": target_uid,
        "full_name": udata.get("full_name") or "Club Member",
        "email": udata.get("email") or "",
        "avatar_url": udata.get("avatar_url"),
        "batch_year": udata.get("batch_year"),
        "tier": udata.get("tier") or "beginner",
        "role_label": udata.get("role_label"),
        "bio": udata.get("bio"),
        "points": (udata.get("points") or {}).get("total", 0),
    }
    reg_data["id"] = reg_id
    reg_data["user_profile"] = prof
    reg_data["member_profiles"] = [prof]
    return RegistrationDocument.model_validate(reg_data)


@router.post("/{id}/attendance/roll-call", response_model=RollCallResponse)
def submit_attendance_roll_call(
    id: str,
    payload: RollCallRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Roll Call Check-in: marks attendance and awards attendance points via contributions ledger (Admin only)."""
    admin_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event = _doc_to_event_document(event_doc)

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    all_regs = list(regs_ref.stream())

    awarded_uids: List[str] = []
    failed_uids: List[str] = []
    now_timestamp = now_iso()
    pts = event.points_reward.attendance_points
    attendance_title = f"Event attendance: {event_id}"[:200]
    occurred_at = _parse_utc(event.schedule.start_time)

    for attendee_uid in payload.attendee_uids:
        matched_reg = None
        for r in all_regs:
            r_data = r.to_dict() or {}
            if r_data.get("status") in {
                RegistrationStatus.REGISTERED.value,
                RegistrationStatus.CHECKED_IN.value,
            } and (
                r_data.get("user_id") == attendee_uid
                or attendee_uid in r_data.get("member_uids", [])
            ):
                matched_reg = r
                break

        if not matched_reg:
            failed_uids.append(attendee_uid)
            continue

        awarded_uids.append(attendee_uid)

        # A zero-point record still provides an idempotent attendance audit trail.
        try:
            contribution_service.award_user(
                db,
                user_id=attendee_uid,
                award=AdminAwardUser(
                    category=ContributionCategory.ACHIEVEMENT,
                    track=_contribution_track(event.points_reward.track),
                    title=attendance_title,
                    points=pts if payload.award_points else 0,
                    event_id=event_id,
                    occurred_at=occurred_at,
                ),
                admin_id=admin_uid,
            )
        except ContributionError:
            failed_uids.append(attendee_uid)
            awarded_uids.remove(attendee_uid)
            continue

        matched_reg.reference.update(
            {
                "status": RegistrationStatus.CHECKED_IN.value,
                "checked_in_at": now_timestamp,
                "checked_in_by": admin_uid,
            }
        )

    attendance_records = (
        db.collection(CONTRIBUTIONS_COLLECTION)
        .where("event_id", "==", event_id)
        .stream()
    )
    checked_in_count = len(
        {
            (record.to_dict() or {}).get("user_id")
            for record in attendance_records
            if (record.to_dict() or {}).get("title") == attendance_title
            and (record.to_dict() or {}).get("status") == "approved"
        }
    )
    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "stats.checked_in_count": checked_in_count,
            "updated_at": now_timestamp,
        }
    )

    return RollCallResponse(
        event_id=event_id,
        checked_in_count=checked_in_count,
        points_awarded_per_user=pts if payload.award_points else 0,
        awarded_uids=awarded_uids,
        failed_uids=failed_uids,
    )


@router.post("/{id}/winners", response_model=EventDocument)
def set_event_winners(
    id: str,
    payload: EventWinnersUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Set or update post-event winners list on the event document (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    now_timestamp = now_iso()
    winners_data = [w.model_dump() for w in payload.winners]
    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "winners": winners_data,
            "updated_at": now_timestamp,
        }
    )

    updated_doc = db.collection(EVENTS_COLLECTION).document(event_id).get()
    return _doc_to_event_document(updated_doc)


@router.post("/{id}/award-winners", response_model=WinnerAwardResponse)
def award_event_winners(
    id: str,
    payload: WinnerAwardRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Award competition winner points and recognition via contributions ledger (Admin only)."""
    admin_uid = get_user_uid(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event = _doc_to_event_document(event_doc)

    total_points = 0
    occurred_at = _parse_utc(event.schedule.start_time)

    for winner in payload.winners:
        try:
            contribution_service.award_user(
                db,
                user_id=winner.user_uid,
                award=AdminAwardUser(
                    category=ContributionCategory.ACHIEVEMENT,
                    track=_contribution_track(event.points_reward.track),
                    title=f"Event winner rank {winner.rank}: {event_id}"[:200],
                    description=(
                        f"{event.title}: {winner.note}" if winner.note else event.title
                    )[:2000],
                    points=winner.points,
                    event_id=event_id,
                    occurred_at=occurred_at,
                ),
                admin_id=admin_uid,
            )
            total_points += winner.points
        except ContributionError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return WinnerAwardResponse(
        event_id=event_id,
        awarded_count=len(payload.winners),
        total_points=total_points,
    )


@router.get("/{id}/feedback", response_model=FeedbackSummaryResponse)
def get_event_feedback_summary(
    id: str,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """View all feedback records and calculated ratings breakdown (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    feedbacks_stream = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(FEEDBACK_SUBCOLLECTION)
        .stream()
    )

    fb_list: List[FeedbackDocument] = []
    for f in feedbacks_stream:
        f_data = f.to_dict() or {}
        fb_list.append(FeedbackDocument.model_validate(f_data))

    total = len(fb_list)
    avg_overall = sum(f.rating_overall for f in fb_list) / total if total > 0 else 0.0
    avg_content = sum(f.rating_content for f in fb_list) / total if total > 0 else 0.0
    avg_org = sum(f.rating_organization for f in fb_list) / total if total > 0 else 0.0

    return FeedbackSummaryResponse(
        event_id=event_id,
        total_feedbacks=total,
        average_overall=round(avg_overall, 2),
        average_content=round(avg_content, 2),
        average_organization=round(avg_org, 2),
        feedbacks=fb_list,
    )
