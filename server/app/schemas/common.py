"""Constrained string types shared by the API schemas.

Primitives only. Domain models, enums and validators live in their own modules.
"""

from typing import Annotated

from pydantic import StringConstraints

# Trimmed and never blank. Identifiers typed this way are opaque: nothing
# assumes an email, Firebase UID or Discord snowflake.
NonBlankStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
TitleStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DescriptionStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
