"""Unified Users & Students API endpoints.

Implements the specification in server/plan.md (Single Source of Truth: users/{uid}).
"""

import io
import json
import uuid
from typing import Any, Dict, List, Optional
import logging
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from firebase_admin import auth, firestore
from google.api_core.exceptions import AlreadyExists

from app.api.security import get_admin_user, get_current_user
from app.services.discord_link import consume_link, unlink_member
from app.services.firebase import db, upload_file_to_storage
from app.services.images import ImageRejected, read_image
from app.services.config import get_settings
from app.schemas.users import (
    AdminUserUpdateRequest,
    AdminMemberListResponse,
    DiscordVerifyRequest,
    LeaderboardEntry,
    LeaderboardResponse,
    MemberTier,
    SocialLinks,
    TrackPoints,
    UserDocument,
    UserListResponse,
    UserMeResponse,
    UserPublicResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/users", tags=["Users"])
settings = get_settings()

USERS_COLLECTION = "users"
VALID_TRACKS = {"total", "kaggle", "product", "research", "misc"}

logger = logging.getLogger(__name__)


from app.utils import now_iso, resolve_batch_year


def _normalize_tier(raw_tier: Any) -> MemberTier:
    if isinstance(raw_tier, MemberTier):
        return raw_tier
    if str(raw_tier or "").lower().strip() == "advanced":
        return MemberTier.ADVANCED
    return MemberTier.BEGINNER


def _normalize_points(points_raw: Any) -> TrackPoints:
    if not isinstance(points_raw, dict):
        return TrackPoints()

    def _safe_int(val: Any) -> int:
        try:
            return max(0, int(val or 0))
        except (ValueError, TypeError):
            return 0

    return TrackPoints(
        total=_safe_int(points_raw.get("total")),
        kaggle=_safe_int(points_raw.get("kaggle")),
        product=_safe_int(points_raw.get("product")),
        research=_safe_int(points_raw.get("research")),
        misc=_safe_int(points_raw.get("misc")),
    )


def _get_user_live_points(uid: str) -> Optional[TrackPoints]:
    try:
        docs = (
            db.collection("contributions")
            .where("user_id", "==", uid)
            .where("status", "==", "approved")
            .stream()
        )
        totals = {"total": 0, "research": 0, "product": 0, "kaggle": 0, "misc": 0}
        valid_tracks = ("research", "product", "kaggle", "misc")
        has_contrib = False
        for doc in docs:
            d = doc.to_dict() or {}
            pts = d.get("points")
            if isinstance(pts, int):
                has_contrib = True
                trk = d.get("track") if d.get("track") in valid_tracks else "misc"
                totals["total"] += pts
                totals[trk] += pts
        if has_contrib and totals["total"] > 0:
            return TrackPoints(**totals)
    except Exception as exc:
        logger.warning("Could not fetch user live points: %s", exc)
    return None


import time

_CACHE_TTL_SECONDS = 30.0

_live_points_cache: Dict[str, Any] = {"timestamp": 0.0, "data": {}}
_users_list_cache: Dict[str, Any] = {"timestamp": 0.0, "data": []}


def invalidate_users_cache():
    _live_points_cache["timestamp"] = 0.0
    _users_list_cache["timestamp"] = 0.0


def _get_live_contributions_points_map() -> Dict[str, Dict[str, int]]:
    now = time.time()
    if now - _live_points_cache["timestamp"] < _CACHE_TTL_SECONDS and _live_points_cache["data"]:
        return _live_points_cache["data"]

    totals: Dict[str, Dict[str, int]] = {}
    valid_tracks = ("research", "product", "kaggle", "misc")
    try:
        docs = (
            db.collection("contributions")
            .where("status", "==", "approved")
            .stream()
        )
        for doc in docs:
            d = doc.to_dict() or {}
            uid = d.get("user_id")
            pts = d.get("points")
            if not isinstance(uid, str) or not isinstance(pts, int):
                continue
            trk = d.get("track") if d.get("track") in valid_tracks else "misc"
            if uid not in totals:
                totals[uid] = {"total": 0, "research": 0, "product": 0, "kaggle": 0, "misc": 0}
            totals[uid]["total"] += pts
            totals[uid][trk] += pts
        _live_points_cache["timestamp"] = now
        _live_points_cache["data"] = totals
    except Exception as exc:
        logger.warning("Could not fetch live contribution points: %s", exc)
        return _live_points_cache.get("data") or {}
    return totals


def _get_all_users_raw() -> List[Dict[str, Any]]:
    now = time.time()
    if now - _users_list_cache["timestamp"] < _CACHE_TTL_SECONDS and _users_list_cache["data"]:
        return _users_list_cache["data"]

    items: List[Dict[str, Any]] = []
    try:
        docs = db.collection(USERS_COLLECTION).stream()
        for doc in docs:
            d = doc.to_dict() or {}
            d["_id"] = doc.id
            items.append(d)
        _users_list_cache["timestamp"] = now
        _users_list_cache["data"] = items
    except Exception as exc:
        logger.warning("Could not fetch users list: %s", exc)
        return _users_list_cache.get("data") or []
    return items


def _to_user_me(uid: str, data: Dict[str, Any]) -> UserMeResponse:
    live = _get_user_live_points(uid)
    points = live if live is not None else _normalize_points(data.get("points"))
    social_raw = data.get("social_links") or {}
    social_links = SocialLinks(**social_raw) if isinstance(social_raw, dict) else SocialLinks()

    raw_tier = data.get("tier")
    tier = _normalize_tier(raw_tier)

    role_label = data.get("role_label")
    if not role_label and str(raw_tier or "").lower().strip() in {"core", "custom"}:
        role_label = str(raw_tier).strip().lower()

    raw_skills = data.get("skills")
    if isinstance(raw_skills, list):
        skills = [str(s).strip() for s in raw_skills if str(s).strip()]
    elif isinstance(raw_skills, str) and raw_skills.strip():
        skills = [s.strip() for s in raw_skills.split(",") if s.strip()]
    else:
        skills = []

    return UserMeResponse(
        id=uid,
        email=data.get("email") or "",
        full_name=data.get("full_name") or "Club Member",
        avatar_url=data.get("avatar_url"),
        discord_id=data.get("discord_id"),
        discord_link_version=data.get("discord_link_version"),
        is_admin=bool(data.get("is_admin", False)),
        is_member=bool(data.get("is_member", False)),
        tier=tier,
        role_label=role_label,
        batch_year=resolve_batch_year(data.get("batch_year"), data.get("email") or ""),
        is_verified=bool(data.get("is_verified") and data.get("discord_link_version") == 1),
        verified_at=data.get("verified_at"),
        points=points,
        bio=data.get("bio"),
        skills=skills,
        social_links=social_links,
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        last_login=data.get("last_login"),
    )


def _to_user_public(
    uid: str,
    data: Dict[str, Any],
    live_points: Optional[TrackPoints] = None,
    allow_fetch: bool = False,
) -> UserPublicResponse:
    if live_points is not None:
        points = live_points
    elif allow_fetch:
        live = _get_user_live_points(uid)
        points = live if live is not None else _normalize_points(data.get("points"))
    else:
        points = _normalize_points(data.get("points"))
    social_raw = data.get("social_links") or {}
    social_links = SocialLinks(**social_raw) if isinstance(social_raw, dict) else SocialLinks()

    raw_tier = data.get("tier")
    tier = _normalize_tier(raw_tier)

    role_label = data.get("role_label")
    if not role_label and str(raw_tier or "").lower().strip() in {"core", "custom"}:
        role_label = str(raw_tier).strip().lower()

    raw_skills = data.get("skills")
    if isinstance(raw_skills, list):
        skills = [str(s).strip() for s in raw_skills if str(s).strip()]
    elif isinstance(raw_skills, str) and raw_skills.strip():
        skills = [s.strip() for s in raw_skills.split(",") if s.strip()]
    else:
        skills = []

    return UserPublicResponse(
        id=uid,
        full_name=data.get("full_name") or "Club Member",
        avatar_url=data.get("avatar_url"),
        bio=data.get("bio"),
        is_member=bool(data.get("is_member", False)),
        tier=tier,
        role_label=role_label,
        batch_year=resolve_batch_year(data.get("batch_year"), data.get("email") or ""),
        is_verified=bool(data.get("is_verified") and data.get("discord_link_version") == 1),
        skills=skills,
        social_links=social_links,
        points=points,
    )


def _get_or_create_user(user_token: dict) -> UserMeResponse:
    uid = user_token["uid"]
    email = (user_token.get("email") or "").lower().strip()
    name = user_token.get("name") or (email.split("@")[0] if email else "Club Member")
    picture = user_token.get("picture")
    has_admin_claim = user_token.get("admin") is True

    doc_ref = db.collection(USERS_COLLECTION).document(uid)
    doc = doc_ref.get()

    now = now_iso()
    if doc.exists:
        data = doc.to_dict() or {}
        # Keep last login fresh and backfill missing or legacy batch values.
        updates: Dict[str, Any] = {"last_login": now, "updated_at": now}
        if bool(data.get("is_admin")) != has_admin_claim:
            updates["is_admin"] = has_admin_claim
            data["is_admin"] = has_admin_claim
        resolved_batch = resolve_batch_year(data.get("batch_year"), email)
        if resolved_batch is not None and resolved_batch != data.get("batch_year"):
            updates["batch_year"] = resolved_batch
            data["batch_year"] = resolved_batch
        doc_ref.set(updates, merge=True)
        data["last_login"] = now
        data["updated_at"] = now
        return _to_user_me(uid, data)
    else:
        # Keep an existing member's profile when the site moves from
        # email-keyed records to UID-keyed records. A raw legacy Discord ID is
        # never copied as proof of ownership.
        legacy = db.collection(USERS_COLLECTION).document(email).get().to_dict() or {}
        owned_legacy = legacy if legacy.get("email") == email and legacy.get("firebase_uid") in (None, uid) else {}
        discord_id = str(owned_legacy.get("discord_id") or "")
        proven_link = False
        if owned_legacy.get("discord_link_version") == 1 and discord_id.isdecimal():
            alias = db.collection(USERS_COLLECTION).document(discord_id).get().to_dict() or {}
            proven_link = (alias.get("firebase_uid") == uid and alias.get("email") == email
                           and str(alias.get("discord_id")) == discord_id
                           and alias.get("discord_link_version") == 1)
        new_user = {
            "id": uid,
            "email": email,
            "full_name": owned_legacy.get("full_name") or name,
            "avatar_url": owned_legacy.get("avatar_url") or picture,
            "discord_id": discord_id if proven_link else None,
            "discord_link_version": 1 if proven_link else None,
            "is_admin": has_admin_claim,
            "is_member": bool(owned_legacy.get("is_member", False)),
            "tier": owned_legacy.get("tier") or MemberTier.BEGINNER.value,
            "role_label": owned_legacy.get("role_label"),
            "batch_year": resolve_batch_year(owned_legacy.get("batch_year"), email),
            "is_verified": bool(proven_link and owned_legacy.get("is_verified")),
            "verified_at": owned_legacy.get("verified_at") if proven_link else None,
            "points": owned_legacy.get("points") or {"total": 0, "kaggle": 0, "product": 0, "research": 0, "misc": 0},
            "bio": owned_legacy.get("bio"),
            "skills": owned_legacy.get("skills") or [],
            "social_links": owned_legacy.get("social_links") or {"github": None, "kaggle": None, "linkedin": None, "discord": None},
            "created_at": owned_legacy.get("created_at") or now,
            "updated_at": now,
            "last_login": now,
        }
        try:
            doc_ref.create(new_user)
        except AlreadyExists:
            # A concurrent Discord-link transaction may have created it.
            return _to_user_me(uid, doc_ref.get().to_dict() or {})
        return _to_user_me(uid, new_user)


# ---------------------------------------------------------------------------
# Current Authenticated User Endpoints
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserMeResponse, summary="Get current authenticated user profile")
def get_me(current_user: dict = Depends(get_current_user)) -> UserMeResponse:
    """Returns the authenticated member's complete profile and cached points."""
    return _get_or_create_user(current_user)


@router.patch("/me", response_model=UserMeResponse, summary="Update own profile details")
def update_me(
    payload: UserUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> UserMeResponse:
    """Allows a member to update their bio, skills, full_name, avatar, and social links."""
    uid = current_user["uid"]
    doc_ref = db.collection(USERS_COLLECTION).document(uid)
    doc = doc_ref.get()

    if not doc.exists:
        _get_or_create_user(current_user)

    now = now_iso()
    updates: Dict[str, Any] = {"updated_at": now}

    if payload.full_name is not None:
        updates["full_name"] = payload.full_name.strip()
    if "avatar_url" in payload.model_fields_set:
        updates["avatar_url"] = payload.avatar_url.strip() if payload.avatar_url else None
    if payload.bio is not None:
        updates["bio"] = payload.bio.strip()
    if payload.skills is not None:
        updates["skills"] = [s.strip() for s in payload.skills if s.strip()]
    if payload.social_links is not None:
        updates["social_links"] = payload.social_links.model_dump()

    doc_ref.set(updates, merge=True)
    invalidate_users_cache()
    updated = doc_ref.get().to_dict() or {}
    return _to_user_me(uid, updated)


@router.post("/sync", response_model=UserMeResponse, summary="Synchronize OAuth token with Firestore")
def sync_user(current_user: dict = Depends(get_current_user)) -> UserMeResponse:
    """Triggered on login to ensure the student's record is initialized or refreshed."""
    return _get_or_create_user(current_user)


@router.post("/verify-discord", summary="Link Discord ID and notify YUVI bot")
def verify_discord(
    payload: DiscordVerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Consume YUVI's private proof, then ask the bot to grant the role."""
    uid = current_user["uid"]
    member = firestore.transactional(consume_link)(db.transaction(), db, payload.link_token, current_user)
    discord_id = member["discord_id"]
    email = member["email"]
    name = member["full_name"]

    # Call YUVI Bot Server to assign Discord role & send DM
    bot_payload = {"discord_id": discord_id, "email": email, "name": name}
    bot_response_data = {"status": "bot_warning", "detail": "Discord role assignment is not configured. Contact a club admin."}

    if settings.bot_internal_secret:
        try:
            req = urllib.request.Request(
                settings.yuvi_bot_url,
                data=json.dumps(bot_payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Secret": settings.bot_internal_secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                bot_res_body = response.read().decode("utf-8")
                bot_response_data = json.loads(bot_res_body)
            if not bot_response_data.get("role_assigned"):
                bot_response_data = {"status": "bot_warning", "detail": "Your account is linked, but the Discord role is pending. Run /auth again to retry."}

            bot_discord_user = bot_response_data.get("discord_username")
            if bot_discord_user and isinstance(bot_discord_user, str) and bot_discord_user.strip():
                clean_bot_user = bot_discord_user.strip()
                current_socials = dict(member.get("social_links") or {})
                if current_socials.get("discord") != clean_bot_user:
                    current_socials["discord"] = clean_bot_user
                    db.collection(USERS_COLLECTION).document(uid).set({
                        "social_links": current_socials,
                        "updated_at": now_iso(),
                    }, merge=True)
                    member["social_links"] = current_socials
        except urllib.error.HTTPError as e:
            error_detail = e.read().decode("utf-8")
            try:
                parsed = json.loads(error_detail)
                detail = parsed.get("detail", error_detail)
            except Exception:
                detail = error_detail
            bot_response_data = {"status": "bot_warning", "detail": str(detail)}
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            bot_response_data = {"status": "bot_unreachable", "detail": "The bot could not confirm your role. Run /auth in Discord again to retry."}

    invalidate_users_cache()
    return {
        "success": True,
        "message": "Discord account successfully linked & verified!",
        "discord_id": discord_id,
        "email": email,
        "role_granted": bot_response_data.get("role_granted") if bot_response_data.get("role_assigned") else None,
        "bot_response": bot_response_data,
        "user": _to_user_me(uid, member),
    }


@router.post("/unlink-discord", summary="Unlink Discord account")
def unlink_discord(current_user: dict = Depends(get_current_user)):
    """Unlink Discord ID from the current member profile."""
    uid = current_user["uid"]
    updated_doc = firestore.transactional(unlink_member)(db.transaction(), db, current_user)
    invalidate_users_cache()
    return {
        "success": True,
        "message": "Discord account successfully unlinked.",
        "user": _to_user_me(uid, updated_doc),
    }


@router.post("/me/avatar", summary="Upload avatar image")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload custom avatar image to storage and update profile."""
    uid = current_user["uid"]
    try:
        payload, extension = read_image(file.file, file.content_type)
    except ImageRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    destination_path = f"users/{uid}/avatars/{uuid.uuid4().hex}.{extension}"
    try:
        avatar_url = upload_file_to_storage(io.BytesIO(payload), destination_path, file.content_type, shareable=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Image storage is unavailable. Try again later.") from exc

    db.collection(USERS_COLLECTION).document(uid).set({
        "avatar_url": avatar_url,
        "updated_at": now_iso(),
    }, merge=True)
    invalidate_users_cache()

    return {"message": "Avatar updated successfully", "avatar_url": avatar_url}


# ---------------------------------------------------------------------------
# Admin Management Endpoints
# ---------------------------------------------------------------------------

@router.patch("/{user_id}/status", response_model=UserMeResponse, summary="Update member status, admin role, or tier (Admin only)")
def update_user_status(
    user_id: str,
    payload: AdminUserUpdateRequest,
    admin: dict = Depends(get_admin_user),
) -> UserMeResponse:
    """Allows admins to update is_member, is_admin, and tier for any user."""
    doc_ref = db.collection(USERS_COLLECTION).document(user_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    data = doc.to_dict() or {}
    if data.get("id") != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = now_iso()
    updates: Dict[str, Any] = {"updated_at": now}

    if payload.is_member is not None:
        updates["is_member"] = payload.is_member
    if payload.is_admin is not None:
        if user_id == admin.get("uid") and not payload.is_admin:
            raise HTTPException(status_code=400, detail="You cannot remove your own admin access.")
        try:
            firebase_user = auth.get_user(user_id)
            claims = dict(firebase_user.custom_claims or {})
            if payload.is_admin:
                claims["admin"] = True
            else:
                claims.pop("admin", None)
            auth.set_custom_user_claims(user_id, claims)
        except auth.UserNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Firebase account not found") from exc
        updates["is_admin"] = payload.is_admin
    if payload.tier is not None:
        updates["tier"] = payload.tier.value
    if "role_label" in payload.model_fields_set:
        updates["role_label"] = payload.role_label

    doc_ref.set(updates, merge=True)
    invalidate_users_cache()
    updated = doc_ref.get().to_dict() or {}
    return _to_user_me(user_id, updated)


@router.get("/admin-directory", response_model=AdminMemberListResponse, summary="Search members for role management (Admin only)")
def admin_directory(
    search: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: dict = Depends(get_admin_user),
) -> AdminMemberListResponse:
    query = search.strip().lower()
    members = []
    for data in _get_all_users_raw():
        doc_id = data.get("_id", "")
        if data.get("id") != doc_id:
            continue
        if query and query not in (data.get("full_name") or "").lower() and query not in (data.get("email") or "").lower():
            continue
        try:
            members.append(_to_user_me(doc_id, data))
        except Exception as exc:
            logger.warning("Skipping invalid member document %s: %s", doc_id, exc)
            continue
    members.sort(key=lambda member: ((member.full_name or "").lower(), member.id or ""))
    start = (page - 1) * page_size
    return AdminMemberListResponse(
        items=members[start:start + page_size], total=len(members), page=page,
        page_size=page_size, has_more=start + page_size < len(members),
    )


# ---------------------------------------------------------------------------
# Public Member & Leaderboard Endpoints
# ---------------------------------------------------------------------------

@router.get("/leaderboard", response_model=LeaderboardResponse, summary="Get fast cached leaderboard")
def get_leaderboard(
    track: str = Query("total", description="total, kaggle, product, research, misc"),
    is_member: Optional[bool] = Query(None, description="Filter by club member status"),
    limit: int = Query(50, ge=1, le=100, description="Top N members"),
) -> LeaderboardResponse:
    """Fetch leaderboard sorted by cached points for the selected track."""
    track_clean = track.lower().strip()
    if track_clean not in VALID_TRACKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid track '{track}'. Must be one of: {', '.join(sorted(VALID_TRACKS))}",
        )

    docs = _get_all_users_raw()
    candidates: List[LeaderboardEntry] = []
    live_points_map = _get_live_contributions_points_map()

    for data in docs:
        doc_id = data.get("_id", "")
        if data.get("firebase_uid") and data["firebase_uid"] != doc_id:
            continue
        if doc_id.isdigit() and not data.get("full_name"):
            continue

        doc_is_member = bool(data.get("is_member", False))
        if is_member is not None and doc_is_member != is_member:
            continue

        points_raw = data.get("points") or {}
        points = TrackPoints(
            total=int(points_raw.get("total", 0)),
            kaggle=int(points_raw.get("kaggle", 0)),
            product=int(points_raw.get("product", 0)),
            research=int(points_raw.get("research", 0)),
            misc=int(points_raw.get("misc", 0)),
        )

        live_pts = live_points_map.get(doc_id) or (live_points_map.get(data.get("email")) if data.get("email") else None)
        if live_pts is not None:
            points = TrackPoints(**live_pts)
        elif live_points_map:
            points = TrackPoints(total=0, kaggle=0, product=0, research=0, misc=0)

        track_score = getattr(points, track_clean, 0)
        if track_score > 0 or track_clean == "total":
            candidates.append(
                LeaderboardEntry(
                    id=doc_id,
                    full_name=data.get("full_name") or "Club Member",
                    avatar_url=data.get("avatar_url"),
                    is_member=doc_is_member,
                    tier=data.get("tier") or MemberTier.BEGINNER,
                    points=points,
                    rank=1,
                )
            )

    candidates.sort(key=lambda x: getattr(x.points, track_clean, 0), reverse=True)

    for idx, entry in enumerate(candidates[:limit], start=1):
        entry.rank = idx

    entries = candidates[:limit]
    return LeaderboardResponse(
        track=track_clean,
        total=len(entries),
        entries=entries,
    )


@router.get("/{id_or_email}", response_model=UserPublicResponse, summary="Get public member profile")
def get_user_profile(id_or_email: str) -> UserPublicResponse:
    """Fetch public member profile by UID, email, or linked Discord ID."""
    clean_target = id_or_email.strip()

    # 1. Try UID direct lookup or compatibility alias
    doc = db.collection(USERS_COLLECTION).document(clean_target).get()
    if doc.exists:
        data = doc.to_dict() or {}
        # If it's a legacy or alias doc pointing to a canonical UID
        if data.get("firebase_uid"):
            canonical = db.collection(USERS_COLLECTION).document(data["firebase_uid"]).get()
            if canonical.exists:
                return _to_user_public(canonical.id, canonical.to_dict() or {}, allow_fetch=True)
        return _to_user_public(doc.id, data, allow_fetch=True)

    # 2. Try email query
    query_email = (
        db.collection(USERS_COLLECTION)
        .where("email", "==", clean_target.lower())
        .limit(1)
        .stream()
    )
    for match in query_email:
        data = match.to_dict() or {}
        if data.get("firebase_uid"):
            canonical = db.collection(USERS_COLLECTION).document(data["firebase_uid"]).get()
            if canonical.exists:
                return _to_user_public(canonical.id, canonical.to_dict() or {}, allow_fetch=True)
        return _to_user_public(match.id, data, allow_fetch=True)

    # 3. Try discord_id query if numeric
    if clean_target.isdigit():
        query_discord = (
            db.collection(USERS_COLLECTION)
            .where("discord_id", "==", clean_target)
            .limit(1)
            .stream()
        )
        for match in query_discord:
            data = match.to_dict() or {}
            if data.get("firebase_uid"):
                canonical = db.collection(USERS_COLLECTION).document(data["firebase_uid"]).get()
                if canonical.exists:
                    return _to_user_public(canonical.id, canonical.to_dict() or {}, allow_fetch=True)
            return _to_user_public(match.id, data, allow_fetch=True)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member profile not found")


@router.get("", response_model=UserListResponse, summary="Browse member directory")
def list_users(
    discord_id: Optional[str] = Query(None, description="Lookup user by linked Discord ID"),
    search: Optional[str] = Query(None, description="Search by name, email, or skill"),
    track: Optional[str] = Query(None, description="Filter by active track points > 0"),
    tier: Optional[MemberTier] = Query(None, description="Filter by tier"),
    is_member: Optional[bool] = Query(None, description="Filter by club member status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> UserListResponse:
    """Search and browse member directory with filters."""
    docs = _get_all_users_raw()
    all_users: List[UserPublicResponse] = []
    live_points_map = _get_live_contributions_points_map()

    for data in docs:
        doc_id = data.get("_id", "")
        if data.get("firebase_uid") and data["firebase_uid"] != doc_id:
            continue
        if doc_id.isdigit() and not data.get("full_name"):
            continue

        if discord_id and str(data.get("discord_id")) != str(discord_id).strip():
            continue

        live_pts_dict = live_points_map.get(doc_id) or (live_points_map.get(data.get("email")) if data.get("email") else None)
        live_pts = TrackPoints(**live_pts_dict) if live_pts_dict is not None else (TrackPoints(total=0, kaggle=0, product=0, research=0, misc=0) if live_points_map else None)
        public_user = _to_user_public(doc_id, data, live_points=live_pts, allow_fetch=False)

        if is_member is not None and public_user.is_member != is_member:
            continue

        if tier and public_user.tier != tier:
            continue

        if track and track.lower().strip() in VALID_TRACKS:
            track_val = getattr(public_user.points, track.lower().strip(), 0)
            if track_val <= 0:
                continue

        if search:
            s = search.lower().strip()
            name_match = s in public_user.full_name.lower()
            email_match = s in (data.get("email") or "").lower()
            id_match = s in public_user.id.lower()
            skill_match = any(s in sk.lower() for sk in public_user.skills)
            bio_match = s in (public_user.bio or "").lower()
            if not (name_match or email_match or id_match or skill_match or bio_match):
                continue

        all_users.append(public_user)

    if track and track.lower().strip() in VALID_TRACKS:
        t_key = track.lower().strip()
        all_users.sort(key=lambda u: getattr(u.points, t_key, 0), reverse=True)
    else:
        all_users.sort(key=lambda u: u.points.total, reverse=True)

    total = len(all_users)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_users[start:end]

    return UserListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=end < total,
    )
