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


def batch_year_from_email(email: str) -> Optional[int]:
    """Derive a graduation batch from an SST enrollment-year email prefix."""
    match = re.search(r"(?:^|\.)(\d{2})[a-zA-Z]", (email or "").lower())
    if match:
        start_year = int(match.group(1))
        if 20 <= start_year <= 40:
            return 2000 + start_year + 4
    return None


def resolve_batch_year(stored: Any, email: str) -> Optional[int]:
    """Prefer a stored graduation year; repair old study-year values when possible."""
    if type(stored) is int and 2000 <= stored <= 2100:
        return stored
    derived = batch_year_from_email(email)
    if derived is not None:
        return derived
    # Preserve an unresolvable legacy value; never guess its graduation year.
    return stored if type(stored) is int and 1 <= stored <= 5 else None


def slugify(text: str) -> str:
    """Generate a clean URL-friendly slug from text."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s or "untitled"


def is_admin_user(user: dict) -> bool:
    """Check if the user has administrator privileges."""
    if not user:
        return False
    if user.get("admin") is True or user.get("is_admin") is True:
        return True
    uid = user.get("uid")
    if uid:
        try:
            from app.services.firebase import db
            doc = db.collection("users").document(uid).get()
            if doc.exists and doc.to_dict().get("is_admin") is True:
                user["admin"] = True
                user["is_admin"] = True
                return True
        except Exception:
            pass
    return False


def get_user_uid(user: dict) -> str:
    """Safely extract the user UID from token payload."""
    return user.get("uid") or ""
