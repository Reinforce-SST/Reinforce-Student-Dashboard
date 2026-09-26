"""An in-memory stand-in for Firebase Storage.

Records what was uploaded and where, so a test can assert the bytes that were
stored and the server-generated path they were stored at. No network, no
bucket, no credentials.
"""

from typing import Dict, List, Tuple


class FakeStorage:
    def __init__(self, fail: bool = False):
        self.objects: Dict[str, bytes] = {}
        self.uploads: List[Tuple[str, bytes]] = []
        self.deleted: List[str] = []
        self.fail = fail

    def store(self, payload: bytes, destination_path: str) -> str:
        """Matches the signature of app.services.uploads.store_pdf."""
        if self.fail:
            raise RuntimeError("storage unavailable")
        self.objects[destination_path] = payload
        self.uploads.append((destination_path, payload))
        return f"https://storage.test/{destination_path}"

    def paths(self) -> List[str]:
        return [path for path, _ in self.uploads]


# A minimal file that really does begin with the PDF magic bytes.
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"
NOT_PDF_BYTES = b"MZ\x90\x00this is not a pdf at all"
