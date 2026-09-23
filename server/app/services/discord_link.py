"""Shared identity boundary. All transaction reads precede writes."""
from datetime import datetime, timezone
from hashlib import sha256
import re
from fastapi import HTTPException


def linked_discord_id(db, email):
    email = email.lower().strip()
    primary = db.collection('users').document(email).get().to_dict() or {}
    discord_id = str(primary.get('discord_id') or '')
    if (primary.get('email') != email or primary.get('discord_link_version') != 1
            or not re.fullmatch(r'\d{5,25}', discord_id)):
        return None
    alias = db.collection('users').document(discord_id).get().to_dict() or {}
    if (alias.get('discord_link_version') != 1 or alias.get('email') != email
            or str(alias.get('discord_id')) != discord_id):
        return None
    return discord_id


def consume_link(transaction, db, token, user, now=None):
    now = now or datetime.now(timezone.utc)
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise HTTPException(400, 'Invalid verification link. Run /auth in Discord again.')
    email = user['email'].lower().strip()
    uid = user['uid']
    token_ref = db.collection('discord_link_tokens').document(sha256(token.encode()).hexdigest())
    proof = token_ref.get(transaction=transaction).to_dict() or {}
    expiry = proof.get('expires_at')
    if not isinstance(expiry, datetime) or expiry.tzinfo is None or expiry <= now:
        raise HTTPException(400, 'This verification link has expired. Run /auth in Discord again.')
    discord_id = str(proof.get('discord_id') or '')
    if not re.fullmatch(r'\d{5,25}', discord_id):
        raise HTTPException(400, 'Invalid verification link. Run /auth in Discord again.')
    used_by = proof.get('consumed_by')
    if used_by and used_by != uid:
        raise HTTPException(409, 'This verification link has already been used.')

    primary_ref = db.collection('users').document(email)
    alias_ref = db.collection('users').document(discord_id)
    primary = primary_ref.get(transaction=transaction).to_dict() or {}
    alias = alias_ref.get(transaction=transaction).to_dict() or {}
    old_id = str(primary.get('discord_id') or '')
    if alias.get('email') and alias['email'] != email:
        raise HTTPException(409, 'This Discord account is linked to another student. Ask a club admin to review it.')
    if old_id and old_id != discord_id:
        raise HTTPException(409, 'Your student account is linked to another Discord account. Unlink it with a club admin first.')
    if used_by:
        if (proof.get('email') != email or primary.get('email') != email
                or primary.get('discord_link_version') != 1
                or alias.get('discord_link_version') != 1 or old_id != discord_id
                or alias.get('email') != email or str(alias.get('discord_id')) != discord_id):
            raise HTTPException(409, 'This link is no longer active. Run /auth in Discord again.')
        return primary

    data = {
        **primary,
        'email': email,
        'full_name': primary.get('full_name') or user.get('name') or 'SST Member',
        'avatar_url': primary.get('avatar_url') or user.get('picture'),
        'firebase_uid': uid,
        'discord_id': discord_id,
        'discord_link_version': 1,
        'is_verified': True,
        'verified_at': now.isoformat(),
        'created_at': primary.get('created_at') or now.isoformat(),
        'updated_at': now.isoformat(),
    }
    transaction.set(primary_ref, data, merge=True)
    transaction.set(alias_ref, data, merge=True)
    transaction.set(token_ref, {'consumed_by': uid, 'email': email, 'consumed_at': now}, merge=True)
    return data


def unlink_member(transaction, db, email, now=None):
    now = now or datetime.now(timezone.utc)
    email = email.lower().strip()
    ref = db.collection('users').document(email)
    data = ref.get(transaction=transaction).to_dict()
    if data is None:
        raise HTTPException(404, 'User profile not found.')
    discord_id = str(data.get('discord_id') or '')
    alias_ref = db.collection('users').document(discord_id) if re.fullmatch(r'\d{5,25}', discord_id) else None
    alias = alias_ref.get(transaction=transaction).to_dict() if alias_ref else None
    updates = {'discord_id': None, 'discord_link_version': None, 'is_verified': False, 'verified_at': None, 'updated_at': now.isoformat()}
    transaction.set(ref, updates, merge=True)
    if alias and alias.get('email') == email:
        transaction.delete(alias_ref)
    return {**data, **updates}
