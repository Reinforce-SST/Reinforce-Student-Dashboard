"""Firebase Admin access for the API.

Initialisation is lazy: importing this module never needs credentials, so the
app and its tests can be imported anywhere. The first call that actually needs
Firestore or Storage initialises the one shared app.

`db` and `bucket` still work as module attributes for existing callers; they
resolve through the same lazy path.
"""

import urllib.parse
import uuid

import firebase_admin
from firebase_admin import credentials, firestore, storage

from app.services.config import get_settings

_app = None


def ensure_app():
    """Initialise the Firebase Admin app once, and return it."""
    global _app
    if _app is None:
        if firebase_admin._apps:
            _app = firebase_admin.get_app()
        else:
            settings = get_settings()
            cred = credentials.Certificate(settings.firebase_credentials_path)
            bucket_name = (settings.firebase_storage_bucket or "").strip().strip('"').strip("'")
            if not bucket_name:
                project_id = getattr(cred, "project_id", None) or "reinforce-sst-bfda8"
                bucket_name = f"{project_id}.appspot.com"
            _app = firebase_admin.initialize_app(
                cred, {"storageBucket": bucket_name}
            )
    return _app


def get_db():
    """The shared Firestore client. Used as a FastAPI dependency."""
    ensure_app()
    return firestore.client()


def get_bucket():
    app = ensure_app()
    settings = get_settings()
    configured = (settings.firebase_storage_bucket or "").strip().strip('"').strip("'")
    if configured:
        try:
            return storage.bucket(configured, app=app)
        except Exception:
            pass

    try:
        b = storage.bucket(app=app)
        if b and b.name:
            return b
    except Exception:
        pass

    project_id = getattr(app, "project_id", None) or "reinforce-sst-bfda8"
    for candidate in [f"{project_id}.appspot.com", f"{project_id}.firebasestorage.app"]:
        try:
            b = storage.bucket(candidate, app=app)
            if b:
                return b
        except Exception:
            continue

    raise RuntimeError("No Firebase storage bucket could be resolved.")


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
    token = str(uuid.uuid4()) if shareable else None

    def _do_upload(target_bucket):
        blob = target_bucket.blob(destination_path)
        if token:
            blob.metadata = {**(blob.metadata or {}), "firebaseStorageDownloadTokens": token}
        if hasattr(file_obj, "seek"):
            file_obj.seek(0)
        blob.upload_from_file(file_obj, content_type=content_type)
        if token:
            try:
                blob.patch()
            except Exception:
                pass
        encoded_path = urllib.parse.quote(destination_path, safe="")
        public_url = f"https://firebasestorage.googleapis.com/v0/b/{target_bucket.name}/o/{encoded_path}?alt=media"
        if token:
            public_url += f"&token={token}"
        return public_url

    primary_bucket = get_bucket()
    try:
        return _do_upload(primary_bucket)
    except Exception as exc:
        app = ensure_app()
        project_id = getattr(app, "project_id", None) or "reinforce-sst-bfda8"
        alt_names = [f"{project_id}.appspot.com", f"{project_id}.firebasestorage.app"]
        alt_names = [n for n in alt_names if n != primary_bucket.name]
        for alt in alt_names:
            try:
                alt_bucket = storage.bucket(alt, app=app)
                return _do_upload(alt_bucket)
            except Exception:
                continue
        raise exc
