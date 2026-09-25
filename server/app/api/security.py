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


def get_current_user(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
) -> dict:
    """Authenticate via Firebase ID token or internal bot secret.

    Fails closed: requires either a valid bot secret or verified Firebase credential.
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
        detail="Invalid authentication credentials",
    )


def get_optional_current_user(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
) -> dict | None:
    """Return a verified user when supplied, otherwise allow public access."""
    if cred is None and not x_internal_secret:
        return None
    return get_current_user(cred=cred, x_internal_secret=x_internal_secret)


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


def get_admin_user(user: dict = Depends(require_admin)) -> dict:
    """Compatibility wrapper for modules that already import this name.

    Delegates to `require_admin`, so there is only one authorization rule.
    """
    return user


def get_user_or_bot(user: dict = Depends(get_current_user)) -> dict:
    """Compatibility wrapper that resolves to get_current_user."""
    return user

