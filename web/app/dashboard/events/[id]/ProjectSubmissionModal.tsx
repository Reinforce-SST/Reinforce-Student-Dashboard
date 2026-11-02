"use client";

import React, { useState, useEffect } from "react";
import type { TimelineItemSchema, EventSubmissionPayload } from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { api } from "@/lib/api";
import styles from "./EventDetail.module.css";

interface ProjectSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  timeline?: TimelineItemSchema[];
  initialSubmission?: EventSubmissionPayload | null;
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
  token,
  onSuccess,
}: ProjectSubmissionModalProps) {
  const [repoUrl, setRepoUrl] = useState(initialSubmission?.repo_url || "");
  const [slidesUrl, setSlidesUrl] = useState(initialSubmission?.slides_url || "");
  const [demoUrl, setDemoUrl] = useState(initialSubmission?.demo_url || "");
  const [paperLink, setPaperLink] = useState(initialSubmission?.paper_link || "");
  const [notes, setNotes] = useState(initialSubmission?.notes || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

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
    }
  }, [initialSubmission]);

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
    if (!repoUrl.trim() && !slidesUrl.trim() && !demoUrl.trim() && !paperLink.trim()) {
      setError("Please provide at least one submission link (Repository, Slides, Demo, or Paper).");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: EventSubmissionPayload = {
      repo_url: repoUrl.trim() || undefined,
      slides_url: slidesUrl.trim() || undefined,
      demo_url: demoUrl.trim() || undefined,
      paper_link: paperLink.trim() || undefined,
      notes: notes.trim() || undefined,
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
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="submission-modal-title"
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
            <div className={styles.intakeFieldItem}>
              <label className={styles.fieldLabel}>
                Code Repository URL (GitHub, GitLab, etc.)
              </label>
              <input
                type="url"
                placeholder="https://github.com/..."
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                disabled={deadlinePassed || saving}
                className={styles.fieldTextInput}
              />
            </div>

            <div className={styles.intakeFieldItem}>
              <label className={styles.fieldLabel}>
                Presentation Deck / Pitch Slides URL
              </label>
              <input
                type="url"
                placeholder="https://slides.google.com/... or Figma link"
                value={slidesUrl}
                onChange={(e) => setSlidesUrl(e.target.value)}
                disabled={deadlinePassed || saving}
                className={styles.fieldTextInput}
              />
            </div>

            <div className={styles.intakeFieldItem}>
              <label className={styles.fieldLabel}>
                Live Product Demo or Video Walkthrough Link
              </label>
              <input
                type="url"
                placeholder="https://... or YouTube/Loom video link"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                disabled={deadlinePassed || saving}
                className={styles.fieldTextInput}
              />
            </div>

            <div className={styles.intakeFieldItem}>
              <label className={styles.fieldLabel}>
                Technical Writeup / Research Paper Link (Optional)
              </label>
              <input
                type="url"
                placeholder="https://arxiv.org/... or PDF link"
                value={paperLink}
                onChange={(e) => setPaperLink(e.target.value)}
                disabled={deadlinePassed || saving}
                className={styles.fieldTextInput}
              />
            </div>

            <div className={styles.intakeFieldItem}>
              <label className={styles.fieldLabel}>
                Submission Notes / Project Brief
              </label>
              <textarea
                placeholder="Key highlights, setup instructions, or notes for evaluators..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={deadlinePassed || saving}
                rows={3}
                className={styles.fieldTextarea}
              />
            </div>
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
  );
}
