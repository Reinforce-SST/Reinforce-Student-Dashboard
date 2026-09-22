"""Reading an existing SPG.

Contribution awards reference SPGs but never create or manage them; that is the
separate SPG workflow. All SPG reads go through here, so when that workflow
lands only this function changes.
"""

from typing import Any, Optional

from pydantic import ValidationError

from app.schemas.spgs import SPGRecord

SPGS_COLLECTION = "spgs"


class SPGRecordInvalid(Exception):
    """A stored SPG document does not match the SPG schema."""


def get_spg(db: Any, spg_id: str) -> Optional[SPGRecord]:
    """Return the SPG, or None when it does not exist."""
    snapshot = db.collection(SPGS_COLLECTION).document(spg_id).get()
    if not getattr(snapshot, "exists", False):
        return None

    data = dict(snapshot.to_dict() or {})
    data.setdefault("id", snapshot.id)
    try:
        return SPGRecord.model_validate(data)
    except ValidationError as error:
        # The SPG workflow owns this shape; awarding cannot guess at it.
        raise SPGRecordInvalid(str(error)) from None
