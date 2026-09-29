"""Shared validation for public profile and event images."""

from typing import Any

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/x-png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/webp": "webp",
}


class ImageRejected(ValueError):
    pass


def read_image(file_obj: Any, content_type: str | None) -> tuple[bytes, str]:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    extension = IMAGE_EXTENSIONS.get(media_type)
    if extension is None:
        raise ImageRejected("Use a PNG, JPG, or WebP image.")

    payload = file_obj.read(MAX_IMAGE_BYTES + 1)
    if not payload:
        raise ImageRejected("The image is empty.")
    if len(payload) > MAX_IMAGE_BYTES:
        raise ImageRejected("The image must be 5MB or smaller.")

    valid = (
        media_type == "image/png" and payload.startswith(b"\x89PNG\r\n\x1a\n")
        or media_type == "image/jpeg" and payload.startswith(b"\xff\xd8\xff")
        or media_type == "image/webp" and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"
    )
    if not valid:
        raise ImageRejected("The file contents do not match its image type.")
    return payload, extension
