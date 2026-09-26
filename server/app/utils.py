"""Common utility functions for time formatting, string manipulation, and helpers."""

from datetime import datetime, timezone
import re
from typing import Any, Optional


def now_utc() -> datetime:
    """Return current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 string format."""
    return datetime.now(timezone.utc).isoformat()


def iso_str(value: Any) -> Optional[str]:
    """Normalise Firestore timestamp, datetime, or string to an ISO-8601 string."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    isoformat = getattr(value, "isoformat", None)
    return isoformat() if callable(isoformat) else str(value)


def slugify(text: str) -> str:
    """Generate a clean URL-friendly slug from text."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s or "untitled"


def is_admin_user(user: dict) -> bool:
    """Use the verified Firebase custom claim as the sole admin authority."""
    return bool(user and user.get("admin") is True)


def get_user_uid(user: dict) -> str:
    """Safely extract the user UID from token payload."""
    return user.get("uid") or ""
