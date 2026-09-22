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


def __getattr__(name):
    # Keeps `from app.services.firebase import db` working without initialising
    # Firebase at import time.
    if name == "db":
        return get_db()
    if name == "bucket":
        return get_bucket()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def upload_file_to_storage(file_obj, destination_path: str, content_type: str) -> str:
    """Uploads a file and returns the public download URL."""
    bucket = get_bucket()
    blob = bucket.blob(destination_path)

    # Upload the file buffer
    blob.upload_from_file(file_obj, content_type=content_type)

    # Construct the public Firebase Storage URL manually
    encoded_path = urllib.parse.quote(destination_path, safe='')
    public_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded_path}?alt=media"

    return public_url
