from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth

from app.services.firebase import ensure_app

security = HTTPBearer(auto_error=False)

ALLOWED_DOMAINS = ("@sst.scaler.com", "@scaler.com")


def _verify_credential(cred: HTTPAuthorizationCredentials) -> dict:
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    ensure_app()
    try:
        # Verifies the token and decodes the user payload
        decoded_token = auth.verify_id_token(cred.credentials)

        # Restrict login to SST / Scaler emails
        email = (decoded_token.get("email") or "").lower().strip()
        if not any(email.endswith(domain) for domain in ALLOWED_DOMAINS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="An SST/Scaler email (@sst.scaler.com or @scaler.com) is required for club access.",
            )
        if decoded_token.get("email_verified") is not True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Verify your college email before signing in.",
            )

        return decoded_token

    except auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )


def get_current_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    return _verify_credential(cred)


def get_optional_current_user(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> dict | None:
    """Return a verified user when supplied, otherwise allow public access."""
    if cred is None:
        return None
    return _verify_credential(cred)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Admin access, from the Firebase custom claim `admin`.

    The one authorization rule in the API. It fails closed: only the exact
    boolean True passes, so a missing claim, a false one or a truthy string is
    rejected. Nothing is read from Firestore, so `UserDocument.is_admin` can
    exist for display without ever granting API privileges. Provisioning the
    claim on an account is an environment setup step.
    """
    if user.get("admin") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required.",
        )
    return user


def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    """Compatibility wrapper for modules that already import this name.

    Delegates to `require_admin`, so there is only one authorization rule.
    """
    return require_admin(user)
