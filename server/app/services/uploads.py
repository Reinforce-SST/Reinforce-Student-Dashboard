"""PDF upload validation and storage for the SPG workflow.

A declared content type is a claim by the client, and a filename is not even
that. Both are checked, and then the first bytes are read: a PDF begins with
`%PDF-`, so a renamed archive or executive-looking `.pdf` is rejected on its
contents rather than its label.

Storage paths are built by the server from IDs it generated. The client's
filename never reaches the path, so it cannot traverse out of the namespace or
overwrite another group's document.
"""

from typing import Any, Optional

from app.services.firebase import upload_file_to_storage

# The dashboard's upload control already tells members "Max 10MB"; matching it
# means the limit the UI promises is the limit the server enforces.
MAX_PDF_BYTES = 10 * 1024 * 1024

PDF_CONTENT_TYPE = "application/pdf"
PDF_MAGIC = b"%PDF-"


class UploadRejected(Exception):
    """The uploaded file is not something we are willing to store."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def read_pdf(file_obj: Any, declared_content_type: Optional[str]) -> bytes:
    """Return the file's bytes, or raise `UploadRejected`.

    Reads one byte past the limit so an oversized upload is refused by its real
    size rather than by a header the client controls.
    """
    if (declared_content_type or "").split(";")[0].strip().lower() != PDF_CONTENT_TYPE:
        raise UploadRejected("The report must be a PDF.")

    payload = file_obj.read(MAX_PDF_BYTES + 1)
    if not payload:
        raise UploadRejected("The uploaded file is empty.")
    if len(payload) > MAX_PDF_BYTES:
        raise UploadRejected(
            f"The PDF must be {MAX_PDF_BYTES // (1024 * 1024)}MB or smaller."
        )
    if not payload.startswith(PDF_MAGIC):
        # The extension and the content type both said PDF; the bytes did not.
        raise UploadRejected("The uploaded file is not a PDF.")
    return payload


def report_path(spg_id: str, report_id: str) -> str:
    """Where one report's PDF lives. Server-generated IDs only."""
    return f"spgs/{spg_id}/reports/{report_id}.pdf"


def proposition_path(request_id: str) -> str:
    """Where a registration's proposition document lives."""
    return f"spgs/registrations/{request_id}/proposition.pdf"


def store_pdf(payload: bytes, destination_path: str) -> str:
    """Upload validated bytes and return the URL to record."""
    import io

    return upload_file_to_storage(
        file_obj=io.BytesIO(payload),
        destination_path=destination_path,
        content_type=PDF_CONTENT_TYPE,
    )
