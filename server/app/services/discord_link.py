"""Consume YUVI's private one-time proof against the canonical UID member record.

All user profile and Discord link data is stored under the canonical users/{uid} document.
All reads precede transaction writes; a raw numeric ID grants nothing.
"""

from datetime import datetime, timezone
from hashlib import sha256
import re

from fastapi import HTTPException


def _identity(user):
    uid = str(user["uid"])
    email = str(user.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "Your Google account did not provide an email address.")
    return uid, email


def linked_discord_id(db, uid, email):
    """Return only a link proven by the canonical UID record."""
    uid, email = str(uid), email.lower().strip()
    member = db.collection("users").document(uid).get().to_dict() or {}
    discord_id = str(member.get("discord_id") or "")
    if (member.get("email") != email or member.get("discord_link_version") != 1
            or not re.fullmatch(r"\d{5,25}", discord_id)):
        return None
    return discord_id


def consume_link(transaction, db, token, user, now=None):
    """Atomically bind a YUVI token to one Firebase UID record."""
    now = now or datetime.now(timezone.utc)
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise HTTPException(400, "Invalid verification link. Run /auth in Discord again.")
    uid, email = _identity(user)
    proof_ref = db.collection("discord_link_tokens").document(sha256(token.encode()).hexdigest())
    proof = proof_ref.get(transaction=transaction).to_dict() or {}
    expiry = proof.get("expires_at")
    if not isinstance(expiry, datetime) or expiry.tzinfo is None or expiry <= now:
        raise HTTPException(400, "This verification link has expired. Run /auth in Discord again.")
    discord_id = str(proof.get("discord_id") or "")
    if not re.fullmatch(r"\d{5,25}", discord_id):
        raise HTTPException(400, "Invalid verification link. Run /auth in Discord again.")
    if proof.get("consumed_by") and proof["consumed_by"] != uid:
        raise HTTPException(409, "This verification link has already been used.")

    member_ref = db.collection("users").document(uid)
    member = member_ref.get(transaction=transaction).to_dict() or {}
    if member.get("email") not in (None, email):
        raise HTTPException(409, "This member record belongs to another email address.")
    old_id = str(member.get("discord_id") or "") if member.get("discord_link_version") == 1 else ""
    if old_id and old_id != discord_id:
        raise HTTPException(409, "Your account is linked to another Discord account. Ask a club admin to unlink it first.")
    if proof.get("consumed_by"):
        if proof.get("email") != email or old_id != discord_id:
            raise HTTPException(409, "This link is no longer active. Run /auth in Discord again.")
        return member

    discord_username = proof.get("discord_username")
    social_links = dict(member.get("social_links") or {})
    if discord_username and isinstance(discord_username, str) and discord_username.strip():
        social_links["discord"] = discord_username.strip()

    now_text = now.isoformat()
    updated = {
        **member, "id": uid, "email": email,
        "full_name": member.get("full_name") or user.get("name") or "Club Member",
        "avatar_url": member.get("avatar_url") or user.get("picture"),
        "discord_id": discord_id, "discord_link_version": 1, "is_verified": True,
        "verified_at": now_text, "created_at": member.get("created_at") or now_text,
        "updated_at": now_text,
    }
    if social_links:
        updated["social_links"] = social_links
    transaction.set(member_ref, updated, merge=True)
    transaction.set(proof_ref, {"consumed_by": uid, "email": email, "consumed_at": now}, merge=True)
    return updated


def unlink_member(transaction, db, user, now=None):
    """Unlink Discord ID from the canonical UID record."""
    now = now or datetime.now(timezone.utc)
    uid, email = _identity(user)
    member_ref = db.collection("users").document(uid)
    member = member_ref.get(transaction=transaction).to_dict()
    if not member:
        raise HTTPException(404, "User profile not found.")
    social_links = dict(member.get("social_links") or {})
    if "discord" in social_links:
        social_links["discord"] = None
    updates = {"discord_id": None, "discord_link_version": None,
               "is_verified": False, "verified_at": None, "social_links": social_links,
               "updated_at": now.isoformat()}
    transaction.set(member_ref, updates, merge=True)
    return {**member, **updates}
