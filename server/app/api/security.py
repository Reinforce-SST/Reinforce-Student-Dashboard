import secrets
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth

from app.services.config import get_settings
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


def verify_internal_bot_secret(
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
) -> bool:
    """Dependency that strictly validates internal service calls from YUVI bot."""
    settings = get_settings()
    if not settings.bot_internal_secret or not x_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bot secret",
        )
    if not secrets.compare_digest(x_internal_secret, settings.bot_internal_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized internal request",
        )
    return True


def get_user_or_bot(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
) -> dict:
    """Authenticate either via Firebase ID token or internal bot secret.

    Returns user payload dictionary with an additional `is_bot` boolean indicator.
    """
    settings = get_settings()
    if x_internal_secret and settings.bot_internal_secret:
        if secrets.compare_digest(x_internal_secret, settings.bot_internal_secret):
            return {
                "uid": "yuvi-bot",
                "email": "bot@sst.scaler.com",
                "is_bot": True,
                "admin": True,
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized internal request",
        )

    if cred:
        user = _verify_credential(cred)
        user["is_bot"] = False
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required (User token or Bot secret)",
    )


def require_admin(user: dict = Depends(get_user_or_bot)) -> dict:
    """Admin access, from the Firebase custom claim `admin` or bot internal secret.

    Fails closed: only exact boolean True passes. When called by YUVI bot via
    X-Internal-Secret, admin is set to True automatically.
    """
    if user.get("admin") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required.",
        )
    return user


def get_admin_user(user: dict = Depends(require_admin)) -> dict:
    """Compatibility wrapper for modules that already import this name."""
    return user

