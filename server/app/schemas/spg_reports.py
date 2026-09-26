"""SPG report schemas.

A member files a report in one of two formats, and chooses which:

- **form** — the structured update typed into the dashboard, stored in
  Firestore and rendered directly in the report list
- **pdf** — a document uploaded to Firebase Storage, listed with an action that
  opens it

Both are the same record in the same collection. Both carry a `heading` and a
`short_description`, which is what the dashboard shows before anyone opens
anything, so a listing never has to branch on the format to render a row.

`report_format` and `report_type` are different dimensions and neither implies
the other: a `progress` report may be a form or a PDF, and so may a `final`
one.

Reports are immutable history. Correcting a mistake means filing another
report, never overwriting one.

Verification is review metadata and nothing else. Verifying a report awards no
points and creates no contribution — an admin decides separately whether to
award one through the contribution workflow. See docs/SPG_WORKFLOW.md.
"""

from datetime import timezone
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    model_validator,
)

from app.schemas.common import DescriptionStr, NonBlankStr, TitleStr

UtcDatetime = Annotated[
    AwareDatetime,
    AfterValidator(lambda value: value.astimezone(timezone.utc)),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]


class SPGReportType(str, Enum):
    """A periodic update, or the one that closes the group out.

    `final` exists so the completion workflow can reuse this model unchanged
    when it is specified. Nothing in this release treats a final report
    differently from a progress report.
    """

    PROGRESS = "progress"
    FINAL = "final"


class SPGReportFormat(str, Enum):
    """How the report was filed — not what it is about.

    Named `report_format` rather than `type` precisely because `report_type`
    already exists and means something else.
    """

    FORM = "form"
    PDF = "pdf"


class SPGReportStatus(str, Enum):
    """Review state.

    Two values only. Whether a reviewer can reject a report, and what a member
    does next if so, is not specified yet, so no `rejected` value is invented
    here.
    """

    PENDING = "pending"
    VERIFIED = "verified"


class SPGFormReportSubmission(BaseModel):
    """The JSON body for a form report.

    `summary` is required: it is the report. Milestones, blockers and next
    steps mirror the dashboard's existing fields and are optional, because a
    week with no blockers should not force the member to invent one.
    """

    model_config = ConfigDict(extra="forbid")

    heading: TitleStr
    short_description: DescriptionStr
    report_type: SPGReportType = SPGReportType.PROGRESS
    summary: DescriptionStr
    milestones: List[NonBlankStr] = Field(default_factory=list)
    blockers: Optional[DescriptionStr] = None
    next_steps: Optional[DescriptionStr] = None


class SPGReportRecord(BaseModel):
    """A stored report document, in either format."""

    model_config = ConfigDict(extra="forbid")

    id: NonBlankStr
    spg_id: NonBlankStr
    report_type: SPGReportType = SPGReportType.PROGRESS
    report_format: SPGReportFormat
    heading: TitleStr
    short_description: DescriptionStr
    sequence_number: int = Field(strict=True, ge=1)

    # Set for a PDF report only.
    pdf_url: Optional[NonBlankStr] = None

    # Set for a form report only.
    summary: Optional[DescriptionStr] = None
    milestones: List[NonBlankStr] = Field(default_factory=list)
    blockers: Optional[DescriptionStr] = None
    next_steps: Optional[DescriptionStr] = None

    submitted_by: NonBlankStr
    submitted_at: UtcDatetime
    status: SPGReportStatus = SPGReportStatus.PENDING
    verified_by: Optional[NonBlankStr] = None
    verified_at: Optional[UtcDatetime] = None

    @model_validator(mode="after")
    def _content_matches_the_format(self):
        """Each format carries its own content and not the other's.

        A PDF report with a typed summary, or a form report pointing at a file,
        would leave the dashboard guessing which one to render.
        """
        if self.report_format is SPGReportFormat.PDF:
            if self.pdf_url is None:
                raise ValueError("pdf_url is required when report_format is 'pdf'")
            for field in ("summary", "blockers", "next_steps"):
                if getattr(self, field) is not None:
                    raise ValueError(f"{field} is not allowed when report_format is 'pdf'")
            if self.milestones:
                raise ValueError("milestones is not allowed when report_format is 'pdf'")
        else:
            if self.pdf_url is not None:
                raise ValueError("pdf_url is not allowed when report_format is 'form'")
            if self.summary is None:
                raise ValueError("summary is required when report_format is 'form'")
        return self

    @model_validator(mode="after")
    def _review_metadata_matches_status(self):
        verified = self.status is SPGReportStatus.VERIFIED
        for field in ("verified_by", "verified_at"):
            if (getattr(self, field) is not None) != verified:
                rule = "required" if verified else "not allowed"
                raise ValueError(f"{field} is {rule} when status is '{self.status.value}'")
        if self.verified_at is not None and self.verified_at < self.submitted_at:
            raise ValueError("verified_at cannot be earlier than submitted_at")
        return self

    @property
    def is_verified(self) -> bool:
        """Reviewed by the club. Says nothing about points: awarding one is a
        separate admin decision in the contribution workflow."""
        return self.status is SPGReportStatus.VERIFIED


class SPGReportPage(BaseModel):
    """A bounded page of reports, oldest first so history reads in order."""

    model_config = ConfigDict(extra="forbid")

    items: List[SPGReportRecord] = Field(default_factory=list)
    next_cursor: Optional[NonBlankStr] = None
