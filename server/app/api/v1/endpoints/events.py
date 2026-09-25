"""Events System API endpoints.

Implements the specification in server/plan.md.
Connects event discovery, member RSVP (solo & team), eligibility checks,
event-specific SPGs, admin attendance roll-calls, competition awards,
and post-event feedback.
Strictly follows zero user denormalization (pure UID references).
"""

from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.cloud import firestore

from app.api.security import get_admin_user, get_current_user, get_optional_current_user
from app.services.firebase import db
from app.services import contributions as contribution_service
from app.services.contributions import ContributionError
from app.utils import get_user_uid, is_admin_user, now_iso, slugify
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
    PointsRewardConfig,
    RegistrationDocument,
    RegistrationStatus,
    RollCallRequest,
    RollCallResponse,
    SPGDecisionAction,
    SPGDecisionRequest,
    VenueInfo,
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
    default_years = {1, 2, 3, 4}
    batch_year = profile.get("batch_year")
    years_restricted = (
        bool(eligibility.allowed_years)
        and set(eligibility.allowed_years) != default_years
    )
    if (
        batch_year is not None
        and eligibility.allowed_years
        and batch_year not in eligibility.allowed_years
    ) or (batch_year is None and years_restricted):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User {user_uid} is not in an allowed academic year",
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


@router.post("", response_model=EventDocument, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Create a new event (Admin only)."""
    admin_uid = get_user_uid(current_user)
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

    update_dict["updated_at"] = now_iso()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)

    def update_with_slug(transaction):
        fresh_doc = event_ref.get(transaction=transaction)
        fresh = fresh_doc.to_dict() or {}
        old_slug = fresh.get("slug")
        new_slug = update_dict.get("slug", old_slug)
        old_reservation = None
        if old_slug and old_slug != new_slug:
            old_reservation = _slug_ref(old_slug).get(transaction=transaction)
        if new_slug:
            _claim_event_slug(transaction, new_slug, event_id)

        transaction.update(event_ref, update_dict)
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
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """View full list of registered attendees, teams, and waitlist (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    regs = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
        .stream()
    )

    results: List[RegistrationDocument] = []
    for r in regs:
        r_dict = r.to_dict() or {}
        r_dict["id"] = r.id
        results.append(RegistrationDocument.model_validate(r_dict))

    return results


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
