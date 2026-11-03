"use client";

import React, { useState, useEffect } from "react";
import type {
  TimelineItemSchema,
  EventSubmissionPayload,
  SubmissionConfigSchema,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import AttachProblemModal from "@/components/dashboard/AttachProblemModal";
import { api, type IdeaSummary } from "@/lib/api";
import styles from "./EventDetail.module.css";

interface ProjectSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  timeline?: TimelineItemSchema[];
  initialSubmission?: EventSubmissionPayload | null;
  submissionConfig?: SubmissionConfigSchema;
  token: string;
  onSuccess: (submission: EventSubmissionPayload) => void;
}

export default function ProjectSubmissionModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  timeline,
  initialSubmission,
  submissionConfig,
  token,
  onSuccess,
}: ProjectSubmissionModalProps) {
  const [repoUrl, setRepoUrl] = useState(initialSubmission?.repo_url || "");
  const [slidesUrl, setSlidesUrl] = useState(initialSubmission?.slides_url || "");
  const [demoUrl, setDemoUrl] = useState(initialSubmission?.demo_url || "");
  const [paperLink, setPaperLink] = useState(initialSubmission?.paper_link || "");
  const [notes, setNotes] = useState(initialSubmission?.notes || "");
  const [problemStatementId, setProblemStatementId] = useState<string | null>(
    initialSubmission?.problem_statement_id || null
  );
  const [customResponses, setCustomResponses] = useState<Record<string, any>>(
    initialSubmission?.custom_fields || {}
  );

  const [attachedIdea, setAttachedIdea] = useState<IdeaSummary | null>(null);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

  // Field visibility config defaults (all deliverable links enabled and required by default)
  const config = {
    enable_repo_url: submissionConfig?.enable_repo_url ?? true,
    require_repo_url: submissionConfig ? (submissionConfig.require_repo_url ?? true) : true,
    enable_slides_url: submissionConfig?.enable_slides_url ?? true,
    require_slides_url: submissionConfig ? (submissionConfig.require_slides_url ?? true) : true,
    enable_demo_url: submissionConfig?.enable_demo_url ?? true,
    require_demo_url: submissionConfig ? (submissionConfig.require_demo_url ?? true) : true,
    enable_paper_link: submissionConfig?.enable_paper_link ?? true,
    require_paper_link: submissionConfig ? (submissionConfig.require_paper_link ?? true) : true,
    enable_notes: submissionConfig?.enable_notes ?? true,
    require_notes: submissionConfig?.require_notes ?? false,
    allow_problem_statement_selection: submissionConfig?.allow_problem_statement_selection ?? true,
    require_problem_statement: submissionConfig?.require_problem_statement ?? false,
    custom_fields: submissionConfig?.custom_fields ?? [],
  };

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (initialSubmission) {
      setRepoUrl(initialSubmission.repo_url || "");
      setSlidesUrl(initialSubmission.slides_url || "");
      setDemoUrl(initialSubmission.demo_url || "");
      setPaperLink(initialSubmission.paper_link || "");
      setNotes(initialSubmission.notes || "");
      setProblemStatementId(initialSubmission.problem_statement_id || null);
      setCustomResponses(initialSubmission.custom_fields || {});
    }
  }, [initialSubmission]);

  // Load attached idea details if problem_statement_id is set
  useEffect(() => {
    if (problemStatementId && token) {
      api
        .getIdea(problemStatementId, token)
        .then((idea) => setAttachedIdea(idea as unknown as IdeaSummary))
        .catch(() => setAttachedIdea(null));
    } else {
      setAttachedIdea(null);
    }
  }, [problemStatementId, token]);

  if (!isOpen) return null;

  // Deadline check
  const deadlineItem = timeline?.find((t) => t.is_submission_deadline);
  const deadlinePassed = Boolean(
    deadlineItem &&
      now > 0 &&
      new Date(deadlineItem.end_time || deadlineItem.start_time).getTime() <= now
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deadlinePassed) {
      setError("The submission deadline has expired. Deliverables can no longer be updated.");
      return;
    }

    // Required field validations
    if ((config.enable_repo_url ?? true) && config.require_repo_url && !repoUrl.trim()) {
      setError("Code Repository URL is required for submission.");
      return;
    }
    if ((config.enable_slides_url ?? true) && config.require_slides_url && !slidesUrl.trim()) {
      setError("Presentation Deck URL is required for submission.");
      return;
    }
    if ((config.enable_demo_url ?? true) && config.require_demo_url && !demoUrl.trim()) {
      setError("Live Product Demo link is required for submission.");
      return;
    }
    if ((config.enable_paper_link ?? true) && config.require_paper_link && !paperLink.trim()) {
      setError("Technical Writeup / Paper link is required for submission.");
      return;
    }
    if ((config.enable_notes ?? true) && config.require_notes && !notes.trim()) {
      setError("Submission Notes / Project Brief are required.");
      return;
    }
    if (
      (config.allow_problem_statement_selection ?? true) &&
      config.require_problem_statement &&
      !problemStatementId
    ) {
      setError("Please select a Problem Statement from the Idea Jar.");
      return;
    }

    // Custom fields required validation
    for (const cf of config.custom_fields || []) {
      if (cf.required && !customResponses[cf.field_id]?.trim()) {
        setError(`Field '${cf.label}' is required.`);
        return;
      }
    }

    // At least one link or content if nothing explicitly required
    const hasAnyStandardLink =
      repoUrl.trim() || slidesUrl.trim() || demoUrl.trim() || paperLink.trim() || problemStatementId;
    const hasAnyCustom = Object.values(customResponses).some((v) => typeof v === "string" && v.trim());
    if (!hasAnyStandardLink && !hasAnyCustom && !notes.trim()) {
      setError("Please provide at least one submission deliverable or problem statement.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: EventSubmissionPayload = {
      repo_url: (config.enable_repo_url ?? true) ? repoUrl.trim() || undefined : undefined,
      slides_url: (config.enable_slides_url ?? true) ? slidesUrl.trim() || undefined : undefined,
      demo_url: (config.enable_demo_url ?? true) ? demoUrl.trim() || undefined : undefined,
      paper_link: (config.enable_paper_link ?? true) ? paperLink.trim() || undefined : undefined,
      notes: (config.enable_notes ?? true) ? notes.trim() || undefined : undefined,
      problem_statement_id: (config.allow_problem_statement_selection ?? true)
        ? problemStatementId || undefined
        : undefined,
      custom_fields: customResponses,
    };

    try {
      const res = await api.submitEventProject(token, eventId, payload);
      onSuccess(res.submission);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit deliverables.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose}>
        <div
          className={styles.modalCard}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="submission-modal-title"
          style={{ maxWidth: "660px", maxHeight: "90vh", overflowY: "auto" }}
        >
          <div className={styles.modalHeader}>
            <div className={styles.modalTitleBlock}>
              <h2 id="submission-modal-title" className={styles.modalHeading}>
                Project Deliverables & Submission
              </h2>
              <p className={styles.modalSubheading}>{eventTitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={styles.modalCloseBtn}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className={styles.modalFormBody}>
            {deadlinePassed && (
              <div className={styles.deadlineWarningBanner}>
                <MemberIcon name="alert-circle" size={16} />
                <span>
                  <strong>Submission Deadline Expired:</strong> Deliverable submissions are closed for this event.
                </span>
              </div>
            )}

            {error && (
              <div role="alert" className={styles.regErrorAlert}>
                {error}
              </div>
            )}

            <div className={styles.intakeFieldsStack}>
              {/* Problem Statement Selection from Idea Jar */}
              {(config.allow_problem_statement_selection ?? true) && (
                <div
                  style={{
                    background: "#141417",
                    border: "1px solid #31343a",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className={styles.fieldLabel} style={{ margin: 0 }}>
                      💡 Problem Statement / Idea Jar {config.require_problem_statement && <span style={{ color: "#ef4444" }}>*</span>}
                    </label>
                    <button
                      type="button"
                      disabled={deadlinePassed || saving}
                      onClick={() => setShowAttachModal(true)}
                      style={{
                        background: "rgba(229, 183, 49, 0.15)",
                        border: "1px solid rgba(229, 183, 49, 0.35)",
                        color: "#E5B731",
                        fontSize: "0.78rem",
                        fontWeight: "750",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      {problemStatementId ? "Change Problem" : "+ Pick from Idea Jar"}
                    </button>
                  </div>

                  {attachedIdea ? (
                    <div
                      style={{
                        background: "#1a1a20",
                        border: "1px solid #2b2e35",
                        borderRadius: "6px",
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "750", fontSize: "0.88rem", color: "#ffffff" }}>
                          {attachedIdea.title}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#8c8c98", marginTop: "2px" }}>
                          Track: <span style={{ color: "#e5b731", textTransform: "uppercase" }}>{attachedIdea.track || "GENERAL"}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={deadlinePassed || saving}
                        onClick={() => {
                          setProblemStatementId(null);
                          setAttachedIdea(null);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                        title="Remove attached problem"
                      >
                        ✕ Clear
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.8rem", color: "#71717a" }}>
                      No Idea Jar problem statement attached yet. You can attach one from the club&apos;s approved idea jar.
                    </div>
                  )}
                </div>
              )}

              {/* Code Repository URL */}
              {(config.enable_repo_url ?? true) && (
                <div className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    Code Repository URL (GitHub, GitLab, etc.) {config.require_repo_url && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <input
                    type="url"
                    placeholder="https://github.com/..."
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    disabled={deadlinePassed || saving}
                    className={styles.fieldTextInput}
                    required={config.require_repo_url}
                  />
                </div>
              )}

              {/* Presentation Deck / Pitch Slides URL */}
              {(config.enable_slides_url ?? true) && (
                <div className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    Presentation Deck / Pitch Slides URL {config.require_slides_url && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <input
                    type="url"
                    placeholder="https://slides.google.com/... or Figma link"
                    value={slidesUrl}
                    onChange={(e) => setSlidesUrl(e.target.value)}
                    disabled={deadlinePassed || saving}
                    className={styles.fieldTextInput}
                    required={config.require_slides_url}
                  />
                </div>
              )}

              {/* Live Product Demo or Video Walkthrough Link */}
              {(config.enable_demo_url ?? true) && (
                <div className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    Live Product Demo or Video Walkthrough Link {config.require_demo_url && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <input
                    type="url"
                    placeholder="https://... or YouTube/Loom video link"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    disabled={deadlinePassed || saving}
                    className={styles.fieldTextInput}
                    required={config.require_demo_url}
                  />
                </div>
              )}

              {/* Technical Writeup / Research Paper Link */}
              {(config.enable_paper_link ?? true) && (
                <div className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    Technical Writeup / Research Paper Link {config.require_paper_link && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <input
                    type="url"
                    placeholder="https://arxiv.org/... or PDF link"
                    value={paperLink}
                    onChange={(e) => setPaperLink(e.target.value)}
                    disabled={deadlinePassed || saving}
                    className={styles.fieldTextInput}
                    required={config.require_paper_link}
                  />
                </div>
              )}

              {/* Custom Deliverable Fields */}
              {(config.custom_fields || []).map((cf) => (
                <div key={cf.field_id} className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    {cf.label} {cf.required && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <input
                    type={cf.field_type === "url" ? "url" : "text"}
                    placeholder={cf.placeholder || (cf.field_type === "url" ? "https://..." : "")}
                    value={customResponses[cf.field_id] || ""}
                    onChange={(e) =>
                      setCustomResponses((prev) => ({
                        ...prev,
                        [cf.field_id]: e.target.value,
                      }))
                    }
                    disabled={deadlinePassed || saving}
                    className={styles.fieldTextInput}
                    required={cf.required}
                  />
                </div>
              ))}

              {/* Submission Notes / Project Brief */}
              {(config.enable_notes ?? true) && (
                <div className={styles.intakeFieldItem}>
                  <label className={styles.fieldLabel}>
                    Submission Notes / Project Brief {config.require_notes && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <textarea
                    placeholder="Key highlights, setup instructions, or notes for evaluators..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={deadlinePassed || saving}
                    rows={3}
                    className={styles.fieldTextarea}
                    required={config.require_notes}
                  />
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deadlinePassed || saving}
                className={styles.modalSubmitBtn}
              >
                <MemberIcon name="check" size={15} />
                {saving ? "Saving Deliverables..." : "Submit Project Deliverables"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Idea Jar Problem Statement Selector Modal */}
      <AttachProblemModal
        isOpen={showAttachModal}
        onClose={() => setShowAttachModal(false)}
        token={token}
        currentIdeaId={problemStatementId}
        onSelectIdea={(ideaId) => {
          setProblemStatementId(ideaId);
        }}
        title="Select Event Problem Statement"
      />
    </>
  );
}
