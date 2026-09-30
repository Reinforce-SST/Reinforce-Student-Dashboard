"""One-time bootstrap for the first Firebase admin claim.

Run on the API host with its configured Firebase service account. This script
does not use Firestore's display-only is_admin field as authority.
"""

import argparse
from pathlib import Path
import sys

# Ensure the server directory is on sys.path when invoked directly
SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from firebase_admin import auth

from app.services.firebase import ensure_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant an existing verified SST account API admin access")
    parser.add_argument("email", help="Existing verified Firebase Authentication email")
    parser.add_argument("--apply", action="store_true", help="Write the claim; without this, only show the proposed change")
    args = parser.parse_args()
    email = args.email.lower().strip()
    if not email.endswith(("@sst.scaler.com", "@scaler.com")):
        parser.error("Only an SST/Scaler college account can be an admin")

    ensure_app()
    member = auth.get_user_by_email(email)
    if not member.email_verified:
        parser.error("The Firebase Authentication email is not verified")
    claims = dict(member.custom_claims or {})
    claims["admin"] = True
    if args.apply:
        auth.set_custom_user_claims(member.uid, claims)
        print(f"Granted admin access to {email} ({member.uid}). They must sign out and back in.")
    else:
        print(f"Would grant admin access to {email} ({member.uid}). Re-run with --apply to confirm.")


if __name__ == "__main__":
    main()
