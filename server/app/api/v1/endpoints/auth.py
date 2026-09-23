import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.security import get_current_user
from app.firebase import db
from firebase_admin import firestore
from app.services.discord_link import consume_link, unlink_member
from app.config import get_settings
from app.schemas.student import (
    StudentProfile, 
    ProfileUpdateRequest, 
    DiscordVerifyRequest
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


def _get_user_doc_ref(email: str, uid: Optional[str] = None):
    """
    Returns the Firestore DocumentReference for a user, prioritized by normalized email.
    """
    normalized_email = email.lower().strip()
    return db.collection("users").document(normalized_email)


def _format_user_doc(doc_data: Dict[str, Any], default_email: str = "", default_name: str = "") -> Dict[str, Any]:
    return {
        "email": doc_data.get("email", default_email),
        "full_name": doc_data.get("full_name", default_name),
        "avatar_url": doc_data.get("avatar_url") or doc_data.get("picture"),
        "firebase_uid": doc_data.get("firebase_uid"),
        "discord_id": doc_data.get("discord_id"),
        "is_verified": doc_data.get("discord_link_version") == 1 and bool(doc_data.get("discord_id")),
        "discord_link_version": doc_data.get("discord_link_version"),
        "verified_at": doc_data.get("verified_at"),
        "created_at": doc_data.get("created_at"),
        "updated_at": doc_data.get("updated_at"),
        "skills": doc_data.get("skills", []),
        "social_links": doc_data.get("social_links", {})
    }


@router.post("/sync-user")
async def sync_user(current_user: dict = Depends(get_current_user)):
    """
    Called upon direct Google SSO login on the website.
    Registers or updates the student's record in Firestore without requiring a Discord ID.
    Returns the full student profile.
    """
    email = current_user.get("email", "").lower().strip()
    name = current_user.get("name") or current_user.get("displayName") or "SST Member"
    picture = current_user.get("picture") or current_user.get("avatar_url")
    uid = current_user.get("uid")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email not present in token."
        )

    user_ref = _get_user_doc_ref(email, uid)
    now_iso = datetime.now(timezone.utc).isoformat()

    existing_doc = user_ref.get()
    
    if existing_doc.exists:
        doc_data = existing_doc.to_dict() or {}
        # Merge latest sign-in details while preserving profile fields
        update_payload = {
            "last_login": now_iso,
            "updated_at": now_iso,
            "firebase_uid": uid
        }
        if not doc_data.get("avatar_url") and picture:
            update_payload["avatar_url"] = picture
        if not doc_data.get("full_name") and name:
            update_payload["full_name"] = name

        user_ref.set(update_payload, merge=True)
        doc_data.update(update_payload)
        return {
            "success": True,
            "user": _format_user_doc(doc_data, default_email=email, default_name=name)
        }
    else:
        # Create brand new student document
        new_user_data = {
            "email": email,
            "full_name": name,
            "avatar_url": picture,
            "firebase_uid": uid,
            "discord_id": None,
            "is_verified": False,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login": now_iso,
            "skills": [],
            "social_links": {
                "github": None,
                "linkedin": None,
                "kaggle": None,
                "discord": None
            }
        }
        user_ref.set(new_user_data)
        return {
            "success": True,
            "user": _format_user_doc(new_user_data, default_email=email, default_name=name)
        }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Returns the authenticated student's profile from Firestore.
    """
    email = current_user.get("email", "").lower().strip()
    name = current_user.get("name") or current_user.get("displayName") or "SST Member"
    picture = current_user.get("picture")
    uid = current_user.get("uid")

    user_ref = _get_user_doc_ref(email, uid)
    doc = user_ref.get()

    if not doc.exists:
        # If not found yet, auto-sync and return
        now_iso = datetime.now(timezone.utc).isoformat()
        new_user_data = {
            "email": email,
            "full_name": name,
            "avatar_url": picture,
            "firebase_uid": uid,
            "discord_id": None,
            "is_verified": False,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login": now_iso,
            "skills": [],
            "social_links": {}
        }
        user_ref.set(new_user_data)
        return {"success": True, "user": _format_user_doc(new_user_data, default_email=email, default_name=name)}

    doc_data = doc.to_dict() or {}
    return {"success": True, "user": _format_user_doc(doc_data, default_email=email, default_name=name)}


@router.post("/verify-discord")
def verify_discord(payload: DiscordVerifyRequest, current_user: dict = Depends(get_current_user)):
    # Firestore retries conflicting transactions; failures propagate, never claim
    # success after a failed write. A repeated request by the same user is safe.
    member = firestore.transactional(consume_link)(db.transaction(), db, payload.link_token, current_user)
    discord_id = member["discord_id"]
    bot_response = {"status": "bot_warning", "detail": "Discord role assignment is not configured. Contact a club admin."}
    if settings.bot_internal_secret:
        try:
            req = urllib.request.Request(
                settings.yuvi_bot_url,
                data=json.dumps({"discord_id": discord_id, "email": member["email"], "name": member["full_name"]}).encode(),
                headers={"Content-Type": "application/json", "X-Internal-Secret": settings.bot_internal_secret},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                bot_response = json.loads(response.read())
            if not bot_response.get("role_assigned"):
                bot_response = {"status": "bot_warning", "detail": "Your account is linked, but the Discord role is pending. Run /auth again or contact a club admin."}
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            bot_response = {"status": "bot_unreachable", "detail": "The bot could not confirm your role. Run /auth in Discord again to retry."}
    return {
        "success": True,
        "user": _format_user_doc(member),
        "role_granted": bot_response.get("role_granted") if bot_response.get("role_assigned") else None,
        "bot_response": bot_response,
    }


@router.post("/unlink-discord")
def unlink_discord(current_user: dict = Depends(get_current_user)):
    member = firestore.transactional(unlink_member)(db.transaction(), db, current_user["email"])
    return {"success": True, "message": "Discord link removed. Ask a club admin to remove any remaining Discord role.", "user": _format_user_doc(member)}


@router.put("/profile")
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update student profile details such as skills, bio, or social links.
    """
    email = current_user.get("email", "").lower().strip()
    user_ref = _get_user_doc_ref(email)

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if payload.full_name is not None:
        updates["full_name"] = payload.full_name.strip()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url.strip()
    if payload.skills is not None:
        updates["skills"] = [s.strip() for s in payload.skills if s.strip()]
    if payload.social_links is not None:
        updates["social_links"] = payload.social_links.model_dump()

    user_ref.set(updates, merge=True)
    doc = user_ref.get()
    return {
        "success": True,
        "message": "Profile updated successfully.",
        "user": _format_user_doc(doc.to_dict() or updates, default_email=email)
    }
