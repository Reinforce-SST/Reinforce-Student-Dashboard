"""Script to grant or revoke admin privileges for a user by email or UID."""

import sys
from firebase_admin import auth
from app.services.firebase import db, ensure_app


def set_admin(identifier: str, is_admin: bool = True):
    ensure_app()
    identifier = identifier.strip()

    # Find user in Firebase Auth
    user_record = None
    if "@" in identifier:
        try:
            user_record = auth.get_user_by_email(identifier)
        except Exception:
            pass
    if not user_record:
        try:
            user_record = auth.get_user(identifier)
        except Exception as e:
            print(f"Error: User '{identifier}' not found in Firebase Auth: {e}")
            return

    uid = user_record.uid
    email = user_record.email
    print(f"Target user: {email} (UID: {uid})")

    # 1. Update Firebase Custom Claims
    claims = user_record.custom_claims or {}
    claims["admin"] = is_admin
    auth.set_custom_user_claims(uid, claims)
    print(f"✓ Firebase custom claims updated: admin={is_admin}")

    # 2. Update Firestore document
    doc_ref = db.collection("users").document(uid)
    doc = doc_ref.get()
    if doc.exists:
        doc_ref.set({"is_admin": is_admin}, merge=True)
        print(f"✓ Firestore document users/{uid} updated: is_admin={is_admin}")
    else:
        print(f"! Notice: Firestore users/{uid} document not found yet (will sync on login)")

    status_str = "GRANTED" if is_admin else "REVOKED"
    print(f"\nSuccess: Admin privileges {status_str} for {email} ({uid}).")
    print("Note: The user should sign out and sign back in to refresh their Firebase Auth token immediately.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python set_admin.py <email_or_uid> [--revoke]")
        sys.exit(1)

    ident = sys.argv[1]
    revoke = "--revoke" in sys.argv
    set_admin(ident, is_admin=not revoke)
