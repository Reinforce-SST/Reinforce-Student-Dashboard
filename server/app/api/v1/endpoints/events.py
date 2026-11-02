"""Events System API endpoints.

Implements the specification in server/plan.md.
Connects event discovery, member RSVP (solo & team), eligibility checks,
event-specific SPGs, admin attendance roll-calls, competition awards,
and post-event feedback.
Strictly follows zero user denormalization (pure UID references).
"""

import csv
from datetime import datetime, timezone
import hashlib
import io
import secrets
from typing import Any, Dict, List, Optional, Set
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
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
    AssignAllColumnRequest,
    BatchUpdateMatrixRequest,
    CreateMatrixColumnRequest,
    CustomFieldSchema,
    EventCreate,
    EventDocument,
    EventEligibility,
    EventListResponse,
    EventMatrixResponse,
    EventParticipationConfig,
    EventRegisterRequest,
    EventResources,
    EventStats,
    EventStatus,
    EventStatusUpdate,
    EventSubmissionRequest,
    EventSummary,
    EventTrack,
    EventTrackSchema,
    EventUpdate,
    EventWinner,
    EventWinnersUpdateRequest,
    FeedbackDocument,
    FeedbackSubmitRequest,
    FeedbackSummaryResponse,
    MATRIX_ADAPTERS,
    MatrixAccessUpdateRequest,
    MatrixAttendanceUpdateRequest,
    MatrixCellUpdateItem,
    MatrixColumnDef,
    MatrixColumnType,
    MatrixRowHydrated,
    MatrixSchemaType,
    MatrixSettingsUpdateRequest,
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
    TeamSettingsSchema,
    TimelineItemSchema,
    UpdateMatrixCellRequest,
    UpdateMemberCustomResponsesRequest,
    UpdateRegistrationTrackRequest,
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
IDEAS_COLLECTION = "ideas"


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


def _check_matrix_access(
    event_data: Dict[str, Any],
    current_user: Optional[Dict[str, Any]],
    require_edit: bool = False,
) -> bool:
    is_admin = is_admin_user(current_user)
    if is_admin:
        return True
    if event_data.get("status") in {EventStatus.DRAFT.value, EventStatus.ARCHIVED.value}:
        return False
    if not current_user:
        return bool(event_data.get("matrix_is_public") and not require_edit)
    uid = get_user_uid(current_user)
    is_volunteer = bool(uid and uid in (event_data.get("matrix_access_uids") or []))
    if is_volunteer:
        return True
    if not require_edit and event_data.get("matrix_is_public"):
        return True
    return False


@router.get("/{id_or_slug}", response_model=EventDocument)
def get_event_detail(
    id_or_slug: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
):
    """Get full event details, schedule, eligibility, and resource links."""
    doc = _get_event_doc_or_404(id_or_slug)
    raw_data = doc.to_dict() or {}
    raw_data["id"] = doc.id
    raw_data["can_access_matrix"] = _check_matrix_access(raw_data, current_user)
    if not is_admin_user(current_user):
        raw_data["matrix_access_uids"] = []

    event = EventDocument.model_validate(raw_data)
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
        if not (event.status == EventStatus.DRAFT.value and is_admin_user(current_user)):
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

    # 4. Validate custom intake fields (individual vs team applies_to)
    custom_fields = event.custom_registration_fields or []
    cleaned_custom_responses: Dict[str, Any] = dict(payload.custom_responses or {})
    cleaned_member_responses: Dict[str, Dict[str, Any]] = {
        m_uid: dict(res) for m_uid, res in (payload.member_responses or {}).items()
    }

    for cf in custom_fields:
        f_id = cf.field_id
        if cf.applies_to == "team":
            val = cleaned_custom_responses.get(f_id)
            if cf.required and (val is None or (isinstance(val, str) and not val.strip())):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{cf.label}' ({f_id}) is required.",
                )
            if val is not None and cf.field_type == "select" and cf.options:
                if str(val) not in cf.options:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Value for '{cf.label}' must be one of: {', '.join(cf.options)}",
                    )
        else:
            # Individual field
            if event.participation.mode.value == "solo":
                val = cleaned_custom_responses.get(f_id)
                if val is None:
                    val = cleaned_member_responses.get(user_uid, {}).get(f_id)
                if cf.required and (val is None or (isinstance(val, str) and not val.strip())):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{cf.label}' ({f_id}) is required.",
                    )
                if val is not None and cf.field_type == "select" and cf.options:
                    if str(val) not in cf.options:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Value for '{cf.label}' must be one of: {', '.join(cf.options)}",
                        )
                cleaned_custom_responses[f_id] = val
                cleaned_member_responses.setdefault(user_uid, {})[f_id] = val
            else:
                for m_uid in member_uids:
                    m_val = cleaned_member_responses.get(m_uid, {}).get(f_id)
                    if m_val is None:
                        m_val = cleaned_custom_responses.get(f_id)
                    if cf.required and (m_val is None or (isinstance(m_val, str) and not m_val.strip())):
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Individual field '{cf.label}' ({f_id}) is required for member {m_uid}.",
                        )
                    if m_val is not None and cf.field_type == "select" and cf.options:
                        if str(m_val) not in cf.options:
                            raise HTTPException(
                                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"Value for '{cf.label}' for member {m_uid} must be one of: {', '.join(cf.options)}",
                            )
                    cleaned_member_responses.setdefault(m_uid, {})[f_id] = m_val

    # 5. Validate track choice
    selected_track_id = payload.selected_track_id
    if selected_track_id:
        track_exists = any(t.track_id == selected_track_id for t in (event.event_tracks or []))
        if not track_exists:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Track '{selected_track_id}' is not a valid track for this event.",
            )

    # 6. Reserve capacity and create the registration/SPG in one transaction.
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
            if not (fresh_event.status == EventStatus.DRAFT.value and is_admin_user(current_user)):
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
            if fresh_event.team_settings and fresh_event.team_settings.lock_rosters_at:
                lock_dt = _parse_utc(str(fresh_event.team_settings.lock_rosters_at))
                if lock_dt <= datetime.now(timezone.utc) and not is_admin_user(current_user):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Team registrations are locked for this event.",
                    )

        if selected_track_id:
            fresh_track = next((t for t in (fresh_event.event_tracks or []) if t.track_id == selected_track_id), None)
            if fresh_track and fresh_track.max_teams:
                track_regs = list(
                    transaction.get(regs_ref.where("selected_track_id", "==", selected_track_id))
                )
                active_track_teams = sum(1 for d in track_regs if _active_registration(d.to_dict() or {}))
                if active_track_teams >= fresh_track.max_teams:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Track '{fresh_track.name}' has reached its maximum capacity of {fresh_track.max_teams} teams.",
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
        should_spawn_spg = (
            fresh_event.participation.requires_event_spg
            or (fresh_event.team_settings and fresh_event.team_settings.auto_convert_to_spg)
        ) and fits
        if should_spawn_spg and team_name:
            spg_id, spg_data = _event_spg_data(
                fresh_event, event_id, user_uid, member_uids, team_name
            )
            transaction.set(db.collection(SPGS_COLLECTION).document(spg_id), spg_data)

        invite_code = secrets.token_hex(3).upper() if team_name else None

        registration_data = {
            "id": reg_id,
            "event_id": event_id,
            "user_id": user_uid,
            "team_name": team_name,
            "member_uids": member_uids,
            "spg_id": spg_id,
            "spg_status": None,
            "custom_responses": cleaned_custom_responses,
            "member_responses": cleaned_member_responses,
            "selected_track_id": selected_track_id,
            "invite_code": invite_code,
            "submission": None,
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
        all_user_regs = _registrations_for_user(
            regs_ref, user_uid, transaction=transaction
        )
        active_leads = [
            doc for doc in all_user_regs if _active_registration(doc.to_dict() or {})
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
        event_snap = event_ref.get(transaction=transaction)
        fresh = event_snap.to_dict() or {}
        fresh_event = _doc_to_event_document(event_snap)

        if reg_data.get("team_name") and fresh_event.team_settings and fresh_event.team_settings.lock_rosters_at:
            lock_dt = _parse_utc(str(fresh_event.team_settings.lock_rosters_at))
            if lock_dt <= datetime.now(timezone.utc) and not is_admin_user(current_user):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Team rosters are locked for this event. Cancellations and modifications are not permitted.",
                )

        current_count = int((fresh.get("stats") or {}).get("registered_count", 0))

        waitlist = []
        if prev_status in {
            RegistrationStatus.REGISTERED.value,
            RegistrationStatus.CHECKED_IN.value,
        }:
            waitlist_docs = list(
                transaction.get(
                    regs_ref.where("status", "==", RegistrationStatus.WAITLISTED.value)
                )
            )
            waitlist = sorted(
                waitlist_docs,
                key=lambda d: (d.to_dict() or {}).get("registered_at") or "",
            )[:1]

        spg_ref = None
        spg_snap = None
        if reg_data.get("spg_id"):
            spg_ref = db.collection(SPGS_COLLECTION).document(reg_data["spg_id"])
            spg_snap = spg_ref.get(transaction=transaction)

        transaction.update(
            reg_doc.reference,
            {
                "status": RegistrationStatus.CANCELLED.value,
                "updated_at": now_timestamp,
            },
        )
        if spg_ref and spg_snap and spg_snap.exists:
            transaction.update(
                spg_ref,
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
                if (
                    fresh_event.participation.requires_event_spg
                    and next_data.get("team_name")
                    and not next_data.get("spg_id")
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
        "custom_registration_fields": [f.model_dump() for f in (payload.custom_registration_fields or [])],
        "event_tracks": [t.model_dump() for t in (payload.event_tracks or [])],
        "allow_open_track_change": bool(payload.allow_open_track_change),
        "team_settings": (payload.team_settings or TeamSettingsSchema()).model_dump(mode="json"),
        "timeline": [t.model_dump(mode="json") for t in sorted(payload.timeline or [], key=lambda x: x.start_time)],
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
        if "timeline" in event_update and isinstance(event_update["timeline"], list):
            event_update["timeline"] = sorted(event_update["timeline"], key=lambda x: x.get("start_time", ""))
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


@router.get(
    "/{id}/registrations/csv",
    summary="Download event attendee attendance roster as CSV (Admin only)",
)
def download_event_attendance_csv(
    id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Download CSV file of attendees/registrations with their attendance status and notes."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}
    event_slug = event_data.get("slug") or event_data.get("title") or event_id

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
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
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
                        "batch_year": udata.get("batch_year"),
                        "tier": udata.get("tier") or "beginner",
                        "role_label": udata.get("role_label"),
                    }

    filtered_regs = raw_regs
    if status_filter:
        sf = status_filter.strip().lower()
        if sf in ("present", "checked_in"):
            filtered_regs = [r for r in raw_regs if r.get("status") == "checked_in"]
        elif sf in ("absent", "disqualified", "excused", "registered", "waitlisted", "cancelled"):
            filtered_regs = [r for r in raw_regs if r.get("status") == sf]

    status_labels: Dict[str, str] = {
        "checked_in": "Present",
        "absent": "Absent",
        "disqualified": "Disqualified",
        "excused": "Excused",
        "registered": "Registered",
        "waitlisted": "Waitlisted",
        "cancelled": "Cancelled",
    }

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)

    writer.writerow([
        "S.No",
        "Name",
        "Email",
        "User ID",
        "Batch",
        "Registration Type",
        "Team Name",
        "Teammates",
        "SPG ID",
        "Attendance Status",
        "Status Code",
        "Attendance Note",
        "Checked In At",
        "Registered At",
    ])

    for idx, r in enumerate(filtered_regs):
        uid = r.get("user_id") or ""
        uprof = user_profiles.get(uid, {})
        lead_name = uprof.get("full_name") or uid
        email = uprof.get("email") or ""
        batch = f"Batch {uprof.get('batch_year')}" if uprof.get("batch_year") else ""
        is_team = bool(r.get("team_name") or (r.get("member_uids") and len(r["member_uids"]) > 1) or r.get("spg_id"))
        reg_type = "Team" if is_team else "Solo"
        team_name = r.get("team_name") or ""

        teammate_names: List[str] = []
        for mid in r.get("member_uids") or []:
            mprof = user_profiles.get(mid, {})
            mname = mprof.get("full_name") or mid
            memail = mprof.get("email")
            teammate_names.append(f"{mname} ({memail})" if memail else mname)
        teammates_str = "; ".join(teammate_names)

        st_code = r.get("status") or "registered"
        st_label = status_labels.get(st_code, st_code)
        note = r.get("attendance_note") or ""
        checked_in = r.get("checked_in_at") or ""
        registered_at = r.get("registered_at") or ""

        writer.writerow([
            str(idx + 1),
            lead_name,
            email,
            uid,
            batch,
            reg_type,
            team_name,
            teammates_str,
            r.get("spg_id") or "",
            st_label,
            st_code,
            note,
            checked_in,
            registered_at,
        ])

    csv_data = output.getvalue()
    clean_name = slugify(event_slug) or "event"
    suffix = status_filter.strip().lower() if status_filter else "all"
    filename = f"{clean_name}_attendance_{suffix}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


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


def _sync_user_points(db_client: Any, user_id: str) -> None:
    """Rebuild cached users.points projection for user_id after merit awards."""
    try:
        user_ref = db_client.collection(USERS_COLLECTION).document(user_id)
        if not getattr(user_ref.get(), "exists", False):
            return
        valid_tracks = ("research", "product", "kaggle", "misc")
        totals = {"total": 0, "research": 0, "product": 0, "kaggle": 0, "misc": 0}
        documents = (
            db_client.collection(CONTRIBUTIONS_COLLECTION)
            .where("user_id", "==", user_id)
            .where("status", "==", "approved")
            .stream()
        )
        for document in documents:
            data = document.to_dict() or {}
            points = data.get("points")
            if not isinstance(points, int):
                continue
            track = data.get("track") if data.get("track") in valid_tracks else "misc"
            totals["total"] += points
            totals[track] += points

        user_ref.update({"points": totals, "updated_at": now_iso()})
    except Exception:
        pass


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
            award_category = getattr(payload, "category", ContributionCategory.PARTICIPATION) or ContributionCategory.PARTICIPATION
            for target_uid in target_uids:
                try:
                    contribution_service.award_user(
                        db,
                        user_id=target_uid,
                        award=AdminAwardUser(
                            category=award_category,
                            track=_contribution_track(event.points_reward.track),
                            title=attendance_title,
                            points=pts,
                            event_id=event_id,
                            occurred_at=occurred_at,
                        ),
                        admin_id=admin_uid,
                    )
                    _sync_user_points(db, target_uid)
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
            award_category = getattr(payload, "category", ContributionCategory.PARTICIPATION) or ContributionCategory.PARTICIPATION
            try:
                contribution_service.award_user(
                    db,
                    user_id=target_uid,
                    award=AdminAwardUser(
                        category=award_category,
                        track=_contribution_track(event.points_reward.track),
                        title=attendance_title,
                        points=pts,
                        event_id=event_id,
                        occurred_at=occurred_at,
                    ),
                    admin_id=admin_uid,
                )
                _sync_user_points(db, target_uid)
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
    award_category = getattr(payload, "category", ContributionCategory.PARTICIPATION) or ContributionCategory.PARTICIPATION

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
                    category=award_category,
                    track=_contribution_track(event.points_reward.track),
                    title=attendance_title,
                    points=pts if payload.award_points else 0,
                    event_id=event_id,
                    occurred_at=occurred_at,
                ),
                admin_id=admin_uid,
            )
            _sync_user_points(db, attendee_uid)
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
            _sync_user_points(db, winner.user_uid)
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


# --- Event Matrix Endpoints ---


@router.get("/{id}/matrix", response_model=EventMatrixResponse)
def get_event_matrix(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve hydrated Event Matrix (RSVP attendees, columns, and matrix cells)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this event's matrix.",
        )

    is_admin = is_admin_user(current_user)
    volunteer_uids: List[str] = event_data.get("matrix_access_uids") or []
    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    matrix_cells: Dict[str, Dict[str, Any]] = event_data.get("matrix_cells") or {}

    has_edit_access = is_admin or (bool(current_user) and get_user_uid(current_user) in volunteer_uids)
    matrix_is_public = bool(event_data.get("matrix_is_public", False))
    matrix_is_pinned = bool(event_data.get("matrix_is_pinned", False))

    # Automatic Default Column for Event Attendance Contribution
    reward_config = event_data.get("points_reward") or {}
    attendance_pts = reward_config.get("attendance_points", 0)
    track = reward_config.get("track", "general")
    event_title = event_data.get("title") or "Event"

    has_attendance_col = any(c.get("column_id") == "col_attendance_points" for c in raw_columns)
    if not has_attendance_col:
        raw_columns.insert(
            0,
            {
                "column_id": "col_attendance_points",
                "title": "Attendance Points",
                "column_type": MatrixColumnType.OBJECT.value,
                "object_schema_type": MatrixSchemaType.CONTRIBUTION_ASSIGNMENT.value,
            },
        )

    # Automatic Track Column
    event_tracks = event_data.get("event_tracks") or []
    track_name_map = {t.get("track_id"): t.get("name") for t in event_tracks if t.get("track_id")}
    if event_tracks and not any(c.get("column_id") == "col_event_track" for c in raw_columns):
        raw_columns.append(
            {
                "column_id": "col_event_track",
                "title": "Track",
                "column_type": MatrixColumnType.TEXT.value,
            }
        )

    # Automatic Custom Intake Columns
    custom_fields = event_data.get("custom_registration_fields") or []
    for f in custom_fields:
        f_id = f.get("field_id")
        if f.get("sync_to_matrix", True) and f_id:
            col_id = f"col_custom_{f_id}"
            if not any(c.get("column_id") == col_id for c in raw_columns):
                raw_columns.append(
                    {
                        "column_id": col_id,
                        "title": f.get("label") or f_id,
                        "column_type": MatrixColumnType.TEXT.value,
                    }
                )

    columns = [MatrixColumnDef.model_validate(c) for c in raw_columns]

    # Query all registrations for this event
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

    for v in volunteer_uids:
        if v:
            all_uids.add(v)

    # Batch-fetch user profiles to eliminate N+1 reads
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
                    }

    # Fetch SPGs linked to this event
    event_spgs_raw: List[Dict[str, Any]] = []
    user_to_spg_map: Dict[str, Dict[str, Any]] = {}
    try:
        spg_docs = db.collection(SPGS_COLLECTION).where("event_id", "==", event_id).stream()
        for doc in spg_docs:
            s_data = doc.to_dict() or {}
            s_data["id"] = doc.id
            event_spgs_raw.append(s_data)
            spg_id = doc.id
            spg_name = s_data.get("name") or "SPG"
            spg_status = s_data.get("status") or "active"
            idea_id = s_data.get("idea_id")

            lead_id = s_data.get("lead_id")
            if lead_id:
                user_to_spg_map[lead_id] = {
                    "spg_id": spg_id,
                    "spg_name": spg_name,
                    "spg_status": spg_status,
                    "role": "lead",
                    "idea_id": idea_id,
                }
            for m_id in s_data.get("member_ids") or []:
                if m_id and m_id not in user_to_spg_map:
                    user_to_spg_map[m_id] = {
                        "spg_id": spg_id,
                        "spg_name": spg_name,
                        "spg_status": spg_status,
                        "role": "member",
                        "idea_id": idea_id,
                    }
    except Exception:
        pass

    # Fetch Approved Ideas for Idea Jar assignments
    approved_ideas_raw: List[Dict[str, Any]] = []
    idea_by_id_map: Dict[str, Dict[str, Any]] = {}
    try:
        ideas_by_id: Dict[str, Any] = {}
        for field in ("is_verified", "is_approved"):
            for doc in db.collection(IDEAS_COLLECTION).where(field, "==", True).stream():
                ideas_by_id[doc.id] = doc
        if not ideas_by_id:
            for doc in db.collection(IDEAS_COLLECTION).limit(50).stream():
                ideas_by_id[doc.id] = doc
        for i_id, doc in ideas_by_id.items():
            idata = doc.to_dict() or {}
            idea_obj = {
                "id": i_id,
                "title": idata.get("title") or "Idea",
                "track": str(idata.get("track") or "misc"),
                "description": idata.get("description") or "",
            }
            approved_ideas_raw.append(idea_obj)
            idea_by_id_map[i_id] = idea_obj
    except Exception:
        pass

    # Hydrate attendee rows
    rows: List[MatrixRowHydrated] = []
    seen_uids: Set[str] = set()

    for r_dict in raw_regs:
        if r_dict.get("status") == RegistrationStatus.CANCELLED.value:
            continue
        reg_status = r_dict.get("status", RegistrationStatus.REGISTERED.value)
        team_name = r_dict.get("team_name")
        member_list = r_dict.get("member_uids") or []
        if r_dict.get("user_id") and r_dict["user_id"] not in member_list:
            member_list = [r_dict["user_id"]] + member_list
        if not member_list and r_dict.get("user_id"):
            member_list = [r_dict["user_id"]]

        for uid in member_list:
            if not uid or uid in seen_uids:
                continue
            seen_uids.add(uid)
            prof = user_profiles.get(uid, {})
            u_cells = matrix_cells.get(uid) or {}
            hydrated_cells: Dict[str, Any] = {}
            for col in columns:
                val = u_cells.get(col.column_id, None)
                if col.column_id == "col_attendance_points" and val is None:
                    if reg_status == RegistrationStatus.CHECKED_IN.value and attendance_pts > 0:
                        val = {
                            "schema_type": MatrixSchemaType.CONTRIBUTION_ASSIGNMENT.value,
                            "category": ContributionCategory.PARTICIPATION.value,
                            "track": track,
                            "points": attendance_pts,
                            "title": f"Event Attendance: {event_title}"[:200],
                            "description": f"Standard attendance contribution for {event_title}",
                        }
                elif col.object_schema_type == MatrixSchemaType.SPG_ASSIGNMENT.value and val is None:
                    spg_info = user_to_spg_map.get(uid)
                    if not spg_info and team_name:
                        matching = next((s for s in event_spgs_raw if (s.get("name") or "").lower() == team_name.lower()), None)
                        if matching:
                            spg_info = {
                                "spg_id": matching["id"],
                                "spg_name": matching.get("name") or team_name,
                                "spg_status": matching.get("status") or "active",
                                "role": "member",
                                "idea_id": matching.get("idea_id"),
                            }
                        else:
                            spg_info = {
                                "spg_id": None,
                                "spg_name": team_name,
                                "spg_status": "registered",
                                "role": "member",
                                "idea_id": None,
                            }
                    if spg_info:
                        val = {
                            "schema_type": MatrixSchemaType.SPG_ASSIGNMENT.value,
                            "spg_id": spg_info.get("spg_id"),
                            "spg_name": spg_info.get("spg_name") or team_name or "Event SPG",
                            "spg_status": spg_info.get("spg_status", "active"),
                            "role": spg_info.get("role", "member"),
                        }
                elif col.object_schema_type == MatrixSchemaType.IDEA_JAR_ASSIGNMENT.value and val is None:
                    spg_info = user_to_spg_map.get(uid)
                    if spg_info and spg_info.get("idea_id"):
                        idea = idea_by_id_map.get(spg_info["idea_id"])
                        if idea:
                            val = {
                                "schema_type": MatrixSchemaType.IDEA_JAR_ASSIGNMENT.value,
                                "idea_id": idea["id"],
                                "idea_title": idea["title"],
                                "track": idea.get("track", "general"),
                                "spg_id": spg_info.get("spg_id"),
                                "spg_name": spg_info.get("spg_name"),
                            }
                elif col.column_id == "col_event_track" and val is None:
                    sel_id = r_dict.get("selected_track_id")
                    val = track_name_map.get(sel_id, sel_id)
                elif col.column_id.startswith("col_custom_") and val is None:
                    target_f_id = col.column_id.replace("col_custom_", "", 1)
                    f_def = next((cf for cf in custom_fields if cf.get("field_id") == target_f_id), None)
                    if f_def and f_def.get("applies_to") == "individual":
                        val = (r_dict.get("member_responses") or {}).get(uid, {}).get(target_f_id)
                        if val is None:
                            val = (r_dict.get("custom_responses") or {}).get(target_f_id)
                    else:
                        val = (r_dict.get("custom_responses") or {}).get(target_f_id)
                elif col.object_schema_type == MatrixSchemaType.SUBMISSION.value and val is None:
                    sub_data = r_dict.get("submission")
                    if sub_data:
                        val = {
                            "schema_type": MatrixSchemaType.SUBMISSION.value,
                            "repo_url": sub_data.get("repo_url"),
                            "paper_link": sub_data.get("paper_link") or sub_data.get("demo_url") or sub_data.get("slides_url"),
                            "score": None,
                        }
                hydrated_cells[col.column_id] = val

            rows.append(
                MatrixRowHydrated(
                    user_id=uid,
                    user_name=prof.get("full_name") or f"Member {uid[:6]}",
                    email=prof.get("email") or "",
                    avatar_url=prof.get("avatar_url"),
                    batch_year=prof.get("batch_year"),
                    team_name=team_name,
                    rsvp_status=reg_status,
                    attendance=reg_status,
                    cells=hydrated_cells,
                )
            )

    rows.sort(key=lambda r: r.user_name.lower())

    volunteer_profiles = [
        user_profiles[v] for v in volunteer_uids if v in user_profiles
    ]

    return EventMatrixResponse(
        event_id=event_id,
        event_title=event_data.get("title") or "Event",
        is_admin=is_admin,
        has_edit_access=has_edit_access,
        matrix_is_public=matrix_is_public,
        matrix_is_pinned=matrix_is_pinned,
        volunteer_uids=volunteer_uids,
        volunteer_profiles=volunteer_profiles,
        event_spgs=event_spgs_raw,
        approved_ideas=approved_ideas_raw,
        columns=columns,
        rows=rows,
    )


@router.post("/{id}/matrix/columns", response_model=MatrixColumnDef)
def create_matrix_column(
    id: str,
    payload: CreateMatrixColumnRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Add a new custom column to the event matrix (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if payload.column_type == MatrixColumnType.OBJECT and not payload.object_schema_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Object columns must specify an object_schema_type.",
        )

    column_id = f"col_{uuid.uuid4().hex[:8]}"
    new_col = MatrixColumnDef(
        column_id=column_id,
        title=payload.title,
        column_type=payload.column_type,
        object_schema_type=payload.object_schema_type,
    )

    raw_columns = event_data.get("matrix_columns") or []
    raw_columns.append(new_col.model_dump())

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "matrix_columns": raw_columns,
            "updated_at": now_iso(),
        }
    )

    return new_col


@router.delete("/{id}/matrix/columns/{column_id}")
def delete_matrix_column(
    id: str,
    column_id: str,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Remove a custom column and clean up associated cell values (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    updated_columns = [c for c in raw_columns if c.get("column_id") != column_id]
    if len(updated_columns) == len(raw_columns):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Column '{column_id}' not found",
        )

    # Safely clean cell keys across all users in matrix_cells
    raw_cells: Dict[str, Dict[str, Any]] = event_data.get("matrix_cells") or {}
    cleaned_cells: Dict[str, Dict[str, Any]] = {}
    for uid, ucells in raw_cells.items():
        if isinstance(ucells, dict):
            cleaned_cells[uid] = {k: v for k, v in ucells.items() if k != column_id}

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "matrix_columns": updated_columns,
            "matrix_cells": cleaned_cells,
            "updated_at": now_iso(),
        }
    )

    return {"success": True, "deleted_column_id": column_id}


def _validate_cell_value(col: Dict[str, Any], raw_value: Any) -> Any:
    """Validate cell value according to column type (text, number, object)."""
    if raw_value is None or raw_value == "":
        return None
    col_type = col.get("column_type")
    if col_type == MatrixColumnType.TEXT.value:
        return str(raw_value).strip()
    elif col_type == MatrixColumnType.NUMBER.value:
        try:
            num = float(raw_value)
            return int(num) if num.is_integer() else num
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Column '{col.get('title')}' requires a valid numeric value.",
            ) from exc
    elif col_type == MatrixColumnType.OBJECT.value:
        schema_type = col.get("object_schema_type")
        try:
            st_enum = MatrixSchemaType(schema_type)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown object schema type '{schema_type}'",
            )
        adapter = MATRIX_ADAPTERS.get(st_enum)
        if not adapter:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No validator for schema '{schema_type}'",
            )
        try:
            validated_obj = adapter.validate_python(raw_value)
            return validated_obj.model_dump()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Validation failed for schema '{schema_type}': {exc}",
            ) from exc
    return raw_value


def _apply_matrix_attendance(
    event_id: str,
    event_data: Dict[str, Any],
    payload: MatrixAttendanceUpdateRequest,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )

    matched_doc = None
    for q in (
        regs_ref.where("user_id", "==", payload.user_id).limit(1),
        regs_ref.where("member_uids", "array_contains", payload.user_id).limit(1),
    ):
        res = q.get()
        if res:
            matched_doc = res[0]
            break

    now_timestamp = now_iso()
    admin_uid = get_user_uid(current_user)

    if matched_doc:
        update_fields: Dict[str, Any] = {
            "status": payload.status.value,
            "updated_at": now_timestamp,
        }
        if payload.attendance_note is not None:
            update_fields["attendance_note"] = payload.attendance_note
        if payload.status == RegistrationStatus.CHECKED_IN:
            update_fields["checked_in_at"] = now_timestamp
            update_fields["checked_in_by"] = admin_uid

        regs_ref.document(matched_doc.id).update(update_fields)
    else:
        reg_id = f"reg_{uuid.uuid4().hex[:12]}"
        new_reg = {
            "id": reg_id,
            "event_id": event_id,
            "user_id": payload.user_id,
            "member_uids": [payload.user_id],
            "status": payload.status.value,
            "registered_at": now_timestamp,
            "updated_at": now_timestamp,
            "checked_in_at": now_timestamp if payload.status == RegistrationStatus.CHECKED_IN else None,
            "checked_in_by": admin_uid if payload.status == RegistrationStatus.CHECKED_IN else None,
            "attendance_note": payload.attendance_note,
        }
        regs_ref.document(reg_id).set(new_reg)

    if payload.award_points and payload.status == RegistrationStatus.CHECKED_IN:
        reward_config = event_data.get("points_reward") or {}
        attendance_pts = reward_config.get("attendance_points", 0)
        track = reward_config.get("track", "general")
        event_title = event_data.get("title", "Club Event")

        if attendance_pts > 0:
            try:
                contribution_service.admin_award_points(
                    user_uid=payload.user_id,
                    award=AdminAwardUser(
                        category=payload.category,
                        track=_contribution_track(track),
                        title=f"Event Attendance: {event_title}"[:200],
                        description=f"Attended {event_title} on {now_timestamp[:10]}",
                        points=attendance_pts,
                        event_id=event_id,
                        occurred_at=now_timestamp,
                    ),
                    admin_id=admin_uid,
                )
                _sync_user_points(db, payload.user_id)
            except ContributionError:
                pass

    return {
        "success": True,
        "user_id": payload.user_id,
        "status": payload.status.value,
    }


@router.patch("/{id}/matrix/cell")
def update_matrix_cell(
    id: str,
    payload: UpdateMatrixCellRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Upsert a single cell value with schema validation (Admin & Volunteers)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this event's matrix.",
        )

    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    col = next((c for c in raw_columns if c.get("column_id") == payload.column_id), None)
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Column '{payload.column_id}' not found on event",
        )

    validated_val = _validate_cell_value(col, payload.value)

    matrix_cells = event_data.get("matrix_cells") or {}
    user_cells = matrix_cells.setdefault(payload.user_id, {})
    user_cells[payload.column_id] = validated_val

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "matrix_cells": matrix_cells,
            "updated_at": now_iso(),
        }
    )

    return {
        "success": True,
        "user_id": payload.user_id,
        "column_id": payload.column_id,
        "value": validated_val,
    }


@router.post("/{id}/matrix/batch")
def batch_update_matrix(
    id: str,
    payload: BatchUpdateMatrixRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Batch apply matrix cell updates and attendance updates in one atomic request."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this event's matrix.",
        )

    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    col_map = {c.get("column_id"): c for c in raw_columns}

    matrix_cells = event_data.get("matrix_cells") or {}
    updated_cells_count = 0

    for cell in payload.cells:
        col = col_map.get(cell.column_id)
        if not col:
            continue
        validated_val = _validate_cell_value(col, cell.value)
        user_cells = matrix_cells.setdefault(cell.user_id, {})
        user_cells[cell.column_id] = validated_val
        updated_cells_count += 1

    if updated_cells_count > 0:
        db.collection(EVENTS_COLLECTION).document(event_id).update(
            {
                "matrix_cells": matrix_cells,
                "updated_at": now_iso(),
            }
        )

    updated_attendance_count = 0
    for att in payload.attendance:
        _apply_matrix_attendance(event_id, event_data, att, current_user)
        updated_attendance_count += 1

    return {
        "success": True,
        "updated_cells": updated_cells_count,
        "updated_attendance": updated_attendance_count,
    }


@router.post("/{id}/matrix/columns/{column_id}/assign-all")
def assign_all_matrix_column(
    id: str,
    column_id: str,
    payload: AssignAllColumnRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Assign a value to all registered attendees for a specific column."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this event's matrix.",
        )

    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    col = next((c for c in raw_columns if c.get("column_id") == column_id), None)
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Column '{column_id}' not found on event",
        )

    validated_val = _validate_cell_value(col, payload.value)

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    reg_docs = regs_ref.stream()

    attendee_uids: Set[str] = set()
    for doc in reg_docs:
        d = doc.to_dict() or {}
        uid = d.get("user_id")
        if uid:
            attendee_uids.add(uid)
        for m_uid in d.get("member_uids") or []:
            if m_uid:
                attendee_uids.add(m_uid)

    matrix_cells = event_data.get("matrix_cells") or {}
    for uid in attendee_uids:
        user_cells = matrix_cells.setdefault(uid, {})
        user_cells[column_id] = validated_val

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "matrix_cells": matrix_cells,
            "updated_at": now_iso(),
        }
    )

    return {
        "success": True,
        "column_id": column_id,
        "updated_count": len(attendee_uids),
        "value": validated_val,
    }


@router.patch("/{id}/matrix/attendance")
def update_matrix_attendance(
    id: str,
    payload: MatrixAttendanceUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Directly update attendee registration/attendance status from the matrix table."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this event's attendance.",
        )

    return _apply_matrix_attendance(event_id, event_data, payload, current_user)


@router.put("/{id}/matrix/access")
def update_matrix_access(
    id: str,
    payload: MatrixAccessUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Grant or revoke volunteer access to this event's matrix (Admin only)."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id

    deduped_uids = list(dict.fromkeys(payload.volunteer_uids))

    db.collection(EVENTS_COLLECTION).document(event_id).update(
        {
            "matrix_access_uids": deduped_uids,
            "updated_at": now_iso(),
        }
    )

    return {
        "success": True,
        "volunteer_uids": deduped_uids,
    }


@router.patch("/{id}/matrix/settings")
def update_matrix_settings(
    id: str,
    payload: MatrixSettingsUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update matrix settings such as public visibility and pinned status."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user, require_edit=True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to change this event's matrix settings.",
        )

    update_fields: Dict[str, Any] = {"updated_at": now_iso()}
    if payload.matrix_is_public is not None:
        update_fields["matrix_is_public"] = payload.matrix_is_public
    if payload.matrix_is_pinned is not None:
        update_fields["matrix_is_pinned"] = payload.matrix_is_pinned

    db.collection(EVENTS_COLLECTION).document(event_id).update(update_fields)

    return {
        "success": True,
        "matrix_is_public": update_fields.get("matrix_is_public", event_data.get("matrix_is_public", False)),
        "matrix_is_pinned": update_fields.get("matrix_is_pinned", event_data.get("matrix_is_pinned", False)),
    }


# --- Advanced Hackathon Operations Endpoints ---


@router.patch("/{id}/registrations/{reg_id}/track")
def update_registration_track(
    id: str,
    reg_id: str,
    payload: UpdateRegistrationTrackRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Switch track for a registration (Team lead or Admin only, enforcing max_teams in transaction)."""
    user_uid = get_user_uid(current_user)
    is_admin = is_admin_user(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}
    event = EventDocument.model_validate({**event_data, "id": event_id})

    if event.status in {EventStatus.DRAFT.value, EventStatus.ARCHIVED.value} and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    clean_track_id = payload.selected_track_id.strip() if payload.selected_track_id else None
    target_track = None
    if clean_track_id:
        target_track = next((t for t in (event.event_tracks or []) if t.track_id == clean_track_id), None)
        if not target_track:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Track '{clean_track_id}' not found in event tracks.",
            )

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    reg_ref = regs_ref.document(reg_id)
    now_timestamp = now_iso()

    def switch_track(transaction):
        r_snap = reg_ref.get(transaction=transaction)
        if not r_snap.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
        r_data = r_snap.to_dict() or {}
        
        is_member = (
            user_uid == r_data.get("user_id")
            or user_uid in (r_data.get("member_uids") or [])
        )
        if not is_admin and not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a registered team member or an admin can switch tracks.",
            )

        # Disallow track change only if the event explicitly blocks changes AND a track was already previously chosen
        if not is_admin and not event.allow_open_track_change and r_data.get("selected_track_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Track changes are not permitted for this event.",
            )

        # Check deadline if not admin
        if not is_admin and event.schedule.registration_deadline:
            dl = _parse_utc(event.schedule.registration_deadline)
            if datetime.now(timezone.utc) > dl:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Registration deadline has passed; tracks can no longer be changed.",
                )

        if target_track and target_track.max_teams:
            track_regs = list(transaction.get(regs_ref.where("selected_track_id", "==", clean_track_id)))
            active_track_teams = sum(1 for d in track_regs if d.id != reg_id and _active_registration(d.to_dict() or {}))
            if active_track_teams >= target_track.max_teams:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Track '{target_track.name}' has reached its maximum capacity of {target_track.max_teams} teams.",
                )

        transaction.update(reg_ref, {"selected_track_id": clean_track_id, "updated_at": now_timestamp})

    run_event_transaction(switch_track)
    return {"success": True, "selected_track_id": clean_track_id or ""}


@router.post("/{id}/my-registration/submission")
def submit_event_project(
    id: str,
    payload: EventSubmissionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Submit project deliverables (GitHub repo, slides, demo link, paper link, notes)."""
    user_uid = get_user_uid(current_user)
    is_admin = is_admin_user(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}
    event = EventDocument.model_validate({**event_data, "id": event_id})

    if event.status in {EventStatus.DRAFT.value, EventStatus.ARCHIVED.value} and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Check timeline for submission deadlines
    now_dt = datetime.now(timezone.utc)
    if not is_admin and event.timeline:
        for t in event.timeline:
            if t.is_submission_deadline:
                deadline_dt = _parse_utc(t.end_time or t.start_time)
                if now_dt > deadline_dt:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Submission deadline for '{t.title}' has expired.",
                    )

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    my_regs = list(regs_ref.where("user_id", "==", user_uid).get())
    if not my_regs:
        my_regs = list(regs_ref.where("member_uids", "array_contains", user_uid).get())

    active_regs = [r for r in my_regs if _active_registration(r.to_dict() or {})]
    if not active_regs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You do not have an active registration for this event.",
        )

    reg_doc = active_regs[0]
    reg_data = reg_doc.to_dict() or {}
    now_timestamp = now_iso()

    sub_dict = {
        "repo_url": payload.repo_url,
        "slides_url": payload.slides_url,
        "demo_url": payload.demo_url,
        "paper_link": payload.paper_link,
        "notes": payload.notes,
        "submitted_at": now_timestamp,
        "submitted_by": user_uid,
    }

    reg_doc.reference.update({
        "submission": sub_dict,
        "updated_at": now_timestamp,
    })

    # Auto-update matrix cell for submission column if one exists
    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []
    sub_col = next((c for c in raw_columns if c.get("object_schema_type") == MatrixSchemaType.SUBMISSION.value), None)
    if sub_col:
        sub_col_id = sub_col.get("column_id")
        cell_val = {
            "schema_type": MatrixSchemaType.SUBMISSION.value,
            "repo_url": payload.repo_url,
            "paper_link": payload.paper_link or payload.demo_url or payload.slides_url,
            "score": None,
        }
        all_member_uids = reg_data.get("member_uids") or [reg_data.get("user_id")]
        matrix_cells = event_data.get("matrix_cells") or {}
        for m_uid in all_member_uids:
            if m_uid:
                matrix_cells.setdefault(m_uid, {})[sub_col_id] = cell_val
        db.collection(EVENTS_COLLECTION).document(event_id).update({
            "matrix_cells": matrix_cells,
            "updated_at": now_timestamp,
        })

    return {"success": True, "submission": sub_dict}


@router.patch("/{id}/my-registration/custom-responses")
def update_member_custom_responses(
    id: str,
    payload: UpdateMemberCustomResponsesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update individual custom intake responses (e.g. Mess Vendor, T-Shirt) for the authenticated member."""
    user_uid = get_user_uid(current_user)
    is_admin = is_admin_user(current_user)
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}
    event = EventDocument.model_validate({**event_data, "id": event_id})

    if event.status in {EventStatus.DRAFT.value, EventStatus.ARCHIVED.value} and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    regs_ref = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
    )
    my_regs = list(regs_ref.where("user_id", "==", user_uid).get())
    if not my_regs:
        my_regs = list(regs_ref.where("member_uids", "array_contains", user_uid).get())

    active_regs = [r for r in my_regs if _active_registration(r.to_dict() or {})]
    if not active_regs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You do not have an active registration for this event.",
        )

    reg_doc = active_regs[0]
    reg_data = reg_doc.to_dict() or {}
    now_timestamp = now_iso()

    custom_fields = event.custom_registration_fields or []
    custom_responses = reg_data.get("custom_responses") or {}
    member_responses = reg_data.get("member_responses") or {}
    user_responses = member_responses.get(user_uid) or {}

    for k, v in payload.responses.items():
        f_def = next((f for f in custom_fields if f.field_id == k), None)
        if f_def and f_def.field_type == "select" and f_def.options:
            if v is not None and str(v) not in f_def.options:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Value for '{f_def.label}' must be one of: {', '.join(f_def.options)}",
                )
        user_responses[k] = v
        # If field applies to team or this is a solo registration, also sync into custom_responses
        if (f_def and f_def.applies_to == "team") or event.participation.mode.value == "solo":
            custom_responses[k] = v

    member_responses[user_uid] = user_responses
    reg_doc.reference.update({
        "member_responses": member_responses,
        "custom_responses": custom_responses,
        "updated_at": now_timestamp,
    })

    return {"success": True, "responses": user_responses, "custom_responses": custom_responses}


def _sanitize_csv_cell(value: Any) -> str:
    """Escape leading formula symbols to protect against CSV formula injection."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        import json
        s = json.dumps(value)
    else:
        s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


@router.get("/{id}/export/comprehensive")
def export_comprehensive_event_data(
    id: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
    include_matrix: bool = True,
    only_checked_in: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Export complete participant rosters, custom intake responses, submissions, tracks, and matrix scores."""
    event_doc = _get_event_doc_or_404(id)
    event_id = event_doc.id
    event_data = event_doc.to_dict() or {}

    if not _check_matrix_access(event_data, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to export this event's operational data.",
        )

    event_title = event_data.get("title") or "Event"
    event_tracks = event_data.get("event_tracks") or []
    track_name_map = {t.get("track_id"): t.get("name") for t in event_tracks if t.get("track_id")}
    custom_fields = event_data.get("custom_registration_fields") or []
    matrix_cells = event_data.get("matrix_cells") or {}
    raw_columns: List[Dict[str, Any]] = event_data.get("matrix_columns") or []

    # Query registrations
    regs = (
        db.collection(EVENTS_COLLECTION)
        .document(event_id)
        .collection(REGISTRATIONS_SUBCOLLECTION)
        .stream()
    )

    all_uids: Set[str] = set()
    raw_regs: List[Dict[str, Any]] = []
    for r in regs:
        d = r.to_dict() or {}
        d["id"] = r.id
        if d.get("status") == RegistrationStatus.CANCELLED.value:
            continue
        if only_checked_in and d.get("status") != RegistrationStatus.CHECKED_IN.value:
            continue
        raw_regs.append(d)
        if d.get("user_id"):
            all_uids.add(d["user_id"])
        for m in d.get("member_uids") or []:
            if m:
                all_uids.add(m)

    # Batch resolve profiles
    user_profiles: Dict[str, Dict[str, Any]] = {}
    if all_uids:
        user_refs = [db.collection(USERS_COLLECTION).document(uid) for uid in all_uids]
        try:
            for snap in db.get_all(user_refs):
                if snap.exists:
                    udata = snap.to_dict() or {}
                    user_profiles[snap.id] = {
                        "full_name": udata.get("full_name") or "Member",
                        "email": udata.get("email") or "",
                        "batch_year": udata.get("batch_year"),
                    }
        except Exception:
            for uid in all_uids:
                snap = db.collection(USERS_COLLECTION).document(uid).get()
                if snap.exists:
                    udata = snap.to_dict() or {}
                    user_profiles[uid] = {
                        "full_name": udata.get("full_name") or "Member",
                        "email": udata.get("email") or "",
                        "batch_year": udata.get("batch_year"),
                    }

    rows: List[Dict[str, Any]] = []
    for r_dict in raw_regs:
        reg_id = r_dict.get("id")
        team_name = r_dict.get("team_name")
        selected_track = track_name_map.get(r_dict.get("selected_track_id"), r_dict.get("selected_track_id") or "")
        reg_status = r_dict.get("status") or "registered"
        invite_code = r_dict.get("invite_code") or ""
        sub = r_dict.get("submission") or {}
        spg_id = r_dict.get("spg_id") or ""
        custom_responses = r_dict.get("custom_responses") or {}
        member_responses = r_dict.get("member_responses") or {}

        member_list = r_dict.get("member_uids") or []
        if r_dict.get("user_id") and r_dict["user_id"] not in member_list:
            member_list = [r_dict["user_id"]] + member_list
        if not member_list and r_dict.get("user_id"):
            member_list = [r_dict["user_id"]]

        for uid in member_list:
            prof = user_profiles.get(uid, {})
            u_cells = matrix_cells.get(uid) or {}

            row: Dict[str, Any] = {
                "reg_id": reg_id,
                "team_name": team_name or "Solo",
                "user_id": uid,
                "user_name": prof.get("full_name") or f"Member {uid[:6]}",
                "email": prof.get("email") or "",
                "batch_year": prof.get("batch_year") or "",
                "status": reg_status,
                "selected_track": selected_track,
                "invite_code": invite_code,
                "spg_id": spg_id,
                "submission_repo_url": sub.get("repo_url") or "",
                "submission_slides_url": sub.get("slides_url") or "",
                "submission_demo_url": sub.get("demo_url") or "",
                "submission_paper_link": sub.get("paper_link") or "",
                "submission_notes": sub.get("notes") or "",
            }

            for f in custom_fields:
                f_id = f.get("field_id")
                if f.get("applies_to") == "individual":
                    f_val = member_responses.get(uid, {}).get(f_id)
                    if f_val is None:
                        f_val = custom_responses.get(f_id)
                else:
                    f_val = custom_responses.get(f_id)
                row[f"custom_{f_id}"] = f_val if f_val is not None else ""

            if include_matrix:
                for col in raw_columns:
                    c_id = col.get("column_id")
                    c_val = u_cells.get(c_id)
                    if isinstance(c_val, dict):
                        if c_val.get("schema_type") == "submission":
                            c_val = c_val.get("score")
                        elif c_val.get("schema_type") == "feedback":
                            c_val = f"{c_val.get('rating')} stars - {c_val.get('notes') or ''}"
                        elif c_val.get("schema_type") == "role_assignment":
                            c_val = c_val.get("role_title")
                        elif c_val.get("schema_type") == "contribution_assignment":
                            c_val = f"{c_val.get('points')} pts"
                    row[f"matrix_{c_id}"] = c_val if c_val is not None else ""

            rows.append(row)

    if format == "json":
        return JSONResponse(content={"event_id": event_id, "event_title": event_title, "rows": rows, "total": len(rows)})

    output = io.StringIO()
    if rows:
        headers = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for r in rows:
            sanitized = {k: _sanitize_csv_cell(v) for k, v in r.items()}
            writer.writerow(sanitized)
    else:
        writer = csv.writer(output)
        writer.writerow(["reg_id", "team_name", "user_id", "user_name", "email", "status"])

    output.seek(0)
    filename = f"event-{event_id}-comprehensive.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
