"""Firebase Admin access for the API.

Initialisation is lazy: importing this module never needs credentials, so the
app and its tests can be imported anywhere. The first call that actually needs
Firestore or Storage initialises the one shared app.

`db` and `bucket` still work as module attributes for existing callers; they
resolve through the same lazy path.
"""

import urllib.parse
import uuid
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage

from app.services.config import get_settings

_app = None


def _resolve_credentials_path(path_str: str) -> str:
    cleaned = (path_str or "").strip().strip("'\"").strip()
    candidate = Path(cleaned)
    if candidate.is_file():
        return str(candidate)

    server_dir = Path(__file__).resolve().parent.parent.parent
    if (server_dir / cleaned).is_file():
        return str(server_dir / cleaned)
    if (server_dir / "serviceAccountKey.json").is_file():
        return str(server_dir / "serviceAccountKey.json")
    if (server_dir / "firebase_credentials.json").is_file():
        return str(server_dir / "firebase_credentials.json")
    return cleaned


def ensure_app():
    """Initialise the Firebase Admin app once, and return it."""
    global _app
    if _app is None:
        if firebase_admin._apps:
            _app = firebase_admin.get_app()
        else:
            settings = get_settings()
            cred_path = _resolve_credentials_path(settings.firebase_credentials_path)
            cred = credentials.Certificate(cred_path)
            _app = firebase_admin.initialize_app(
                cred, {"storageBucket": settings.firebase_storage_bucket}
            )
    return _app


def get_db():
    """The shared Firestore client. Used as a FastAPI dependency."""
    ensure_app()
    return firestore.client()


def get_bucket():
    ensure_app()
    return storage.bucket()


class _LazyClient:
    """Resolve an SDK client only when code first uses it.

    A module ``__getattr__`` is still evaluated by ``from module import name``.
    Keeping a real proxy object bound to the exported name makes route imports
    credential-free while preserving the existing call sites.
    """

    def __init__(self, factory):
        self._factory = factory

    def __getattr__(self, name):
        return getattr(self._factory(), name)


db = _LazyClient(get_db)
bucket = _LazyClient(get_bucket)


def upload_file_to_storage(file_obj, destination_path: str, content_type: str, *, shareable: bool = False) -> str:
    """Upload a file, optionally issuing a persistent shareable download URL.

    Cloud Storage buckets are private by default. Public website images need a
    download token. Private documents keep their existing access behavior.
    """
    bucket = get_bucket()
    blob = bucket.blob(destination_path)
    token = str(uuid.uuid4()) if shareable else None
    if token:
        blob.metadata = {**(blob.metadata or {}), "firebaseStorageDownloadTokens": token}
    blob.upload_from_file(file_obj, content_type=content_type)
    encoded_path = urllib.parse.quote(destination_path, safe="")
    public_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded_path}?alt=media"
    if token:
        public_url += f"&token={token}"

    return public_url
