"""Consume YUVI's private one-time proof against the canonical UID member record.

Email and Discord-ID documents are compatibility aliases for YUVI. All reads
precede transaction writes; a raw numeric ID grants nothing.
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
    """Return only a link proven by the UID record and both YUVI aliases."""
    uid, email = str(uid), email.lower().strip()
    member = db.collection("users").document(uid).get().to_dict() or {}
    discord_id = str(member.get("discord_id") or "")
    if (member.get("email") != email or member.get("discord_link_version") != 1
            or not re.fullmatch(r"\d{5,25}", discord_id)):
        return None
    email_alias = db.collection("users").document(email).get().to_dict() or {}
    discord_alias = db.collection("users").document(discord_id).get().to_dict() or {}
    for alias in (email_alias, discord_alias):
        if (alias.get("firebase_uid") != uid or alias.get("email") != email
                or str(alias.get("discord_id")) != discord_id
                or alias.get("discord_link_version") != 1):
            return None
    return discord_id


def consume_link(transaction, db, token, user, now=None):
    """Atomically bind a YUVI token to one Firebase UID and its bot aliases."""
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
    email_ref = db.collection("users").document(email)
    discord_ref = db.collection("users").document(discord_id)
    member = member_ref.get(transaction=transaction).to_dict() or {}
    email_alias = email_ref.get(transaction=transaction).to_dict() or {}
    discord_alias = discord_ref.get(transaction=transaction).to_dict() or {}
    if member.get("email") not in (None, email):
        raise HTTPException(409, "This member record belongs to another email address.")
    for alias in (email_alias, discord_alias):
        if alias.get("email") not in (None, email) or alias.get("firebase_uid") not in (None, uid):
            raise HTTPException(409, "This Discord account is linked to another member. Ask a club admin to review it.")
    if (email_alias.get("discord_link_version") == 1
            and str(email_alias.get("discord_id")) != discord_id):
        raise HTTPException(409, "Your account is linked to another Discord account. Ask a club admin to unlink it first.")
    old_id = str(member.get("discord_id") or "") if member.get("discord_link_version") == 1 else ""
    if old_id and old_id != discord_id:
        raise HTTPException(409, "Your account is linked to another Discord account. Ask a club admin to unlink it first.")
    if proof.get("consumed_by"):
        if (proof.get("email") != email or old_id != discord_id
                or any(alias.get("discord_link_version") != 1 or str(alias.get("discord_id")) != discord_id
                       for alias in (email_alias, discord_alias))):
            raise HTTPException(409, "This link is no longer active. Run /auth in Discord again.")
        return member

    now_text = now.isoformat()
    updated = {
        **member, "id": uid, "email": email,
        "full_name": member.get("full_name") or email_alias.get("full_name") or user.get("name") or "Club Member",
        "avatar_url": member.get("avatar_url") or email_alias.get("avatar_url") or user.get("picture"),
        "discord_id": discord_id, "discord_link_version": 1, "is_verified": True,
        "verified_at": now_text, "created_at": member.get("created_at") or now_text,
        "updated_at": now_text,
    }
    alias = {
        "firebase_uid": uid, "email": email, "discord_id": discord_id,
        "discord_link_version": 1, "is_verified": True,
        "full_name": updated["full_name"], "verified_at": now_text,
        "updated_at": now_text,
    }
    transaction.set(member_ref, updated, merge=True)
    transaction.set(email_ref, alias, merge=True)
    transaction.set(discord_ref, alias, merge=True)
    transaction.set(proof_ref, {"consumed_by": uid, "email": email, "consumed_at": now}, merge=True)
    return updated


def unlink_member(transaction, db, user, now=None):
    now = now or datetime.now(timezone.utc)
    uid, email = _identity(user)
    member_ref = db.collection("users").document(uid)
    email_ref = db.collection("users").document(email)
    member = member_ref.get(transaction=transaction).to_dict()
    if not member:
        raise HTTPException(404, "User profile not found.")
    discord_id = str(member.get("discord_id") or "")
    discord_ref = db.collection("users").document(discord_id) if re.fullmatch(r"\d{5,25}", discord_id) else None
    email_alias = email_ref.get(transaction=transaction).to_dict() or {}
    discord_alias = discord_ref.get(transaction=transaction).to_dict() or {} if discord_ref else {}
    updates = {"discord_id": None, "discord_link_version": None,
               "is_verified": False, "verified_at": None, "updated_at": now.isoformat()}
    transaction.set(member_ref, updates, merge=True)
    if email_alias.get("firebase_uid") == uid:
        transaction.set(email_ref, updates, merge=True)
    if discord_ref and discord_alias.get("firebase_uid") == uid and discord_alias.get("email") == email:
        transaction.delete(discord_ref)
    return {**member, **updates}
