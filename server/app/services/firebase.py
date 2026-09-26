"""Firebase Admin access for the API.

Initialisation is lazy: importing this module never needs credentials, so the
app and its tests can be imported anywhere. The first call that actually needs
Firestore or Storage initialises the one shared app.

`db` and `bucket` still work as module attributes for existing callers; they
resolve through the same lazy path.
"""

import urllib.parse

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


def upload_file_to_storage(file_obj, destination_path: str, content_type: str) -> str:
    """Uploads a file and returns the public download URL."""
    bucket = get_bucket()
    blob = bucket.blob(destination_path)

    # Upload the file buffer
    blob.upload_from_file(file_obj, content_type=content_type)

    # Construct the public Firebase Storage URL manually
    encoded_path = urllib.parse.quote(destination_path, safe="")
    public_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded_path}?alt=media"

    return public_url
