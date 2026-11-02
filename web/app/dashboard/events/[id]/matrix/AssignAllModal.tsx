"use client";

import React, { useState, useEffect } from "react";
import type {
  MatrixColumnDef,
  MatrixObjectPayload,
  FeedbackObject,
  SubmissionObject,
  RoleAssignmentObject,
  ContributionAssignmentObject,
  SPGAssignmentObject,
  IdeaJarAssignmentObject,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventMatrix.module.css";

interface AssignAllModalProps {
  isOpen: boolean;
  column: MatrixColumnDef | null;
  onClose: () => void;
  onAssignAll: (
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => Promise<void>;
}

export default function AssignAllModal({
  isOpen,
  column,
  onClose,
  onAssignAll,
}: AssignAllModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text / Number draft
  const [textVal, setTextVal] = useState("");
  const [numberVal, setNumberVal] = useState("");

  // Object drafts
  const [rating, setRating] = useState<number>(5);
  const [feedbackNotes, setFeedbackNotes] = useState("");

  const [repoUrl, setRepoUrl] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [score, setScore] = useState("");

  const [roleTitle, setRoleTitle] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isLead, setIsLead] = useState(false);

  const [contribPoints, setContribPoints] = useState("10");
  const [contribCategory, setContribCategory] = useState("participation");
  const [contribTrack, setContribTrack] = useState("general");
  const [contribTitle, setContribTitle] = useState("");
  const [contribDescription, setContribDescription] = useState("");

  const [spgName, setSpgName] = useState("");
  const [spgRole, setSpgRole] = useState("member");
  const [spgStatus, setSpgStatus] = useState("active");

  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaTrack, setIdeaTrack] = useState("general");

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTextVal("");
      setNumberVal("");
      setRating(5);
      setFeedbackNotes("");
      setRepoUrl("");
      setPaperLink("");
      setScore("");
      setRoleTitle("");
      setTeamName("");
      setIsLead(false);
      setContribPoints("10");
      setContribCategory("participation");
      setContribTrack("general");
      setContribTitle("");
      setContribDescription("");
      setSpgName("");
      setSpgRole("member");
      setSpgStatus("active");
      setIdeaTitle("");
      setIdeaTrack("general");
    }
  }, [isOpen, column]);

  if (!isOpen || !column) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let finalVal: string | number | MatrixObjectPayload | null = null;

    if (column.column_type === "text") {
      finalVal = textVal.trim() === "" ? null : textVal.trim();
    } else if (column.column_type === "number") {
      if (numberVal.trim() === "") {
        finalVal = null;
      } else {
        const num = parseFloat(numberVal.trim());
        if (isNaN(num)) {
          setError("Please provide a valid number.");
          return;
        }
        finalVal = num;
      }
    } else if (column.column_type === "object") {
      const st = column.object_schema_type || "feedback";
      if (st === "feedback") {
        finalVal = {
          schema_type: "feedback",
          rating: Number(rating),
          notes: feedbackNotes.trim() || null,
        } as FeedbackObject;
      } else if (st === "submission") {
        const sc = score.trim() !== "" ? parseFloat(score.trim()) : null;
        if (sc !== null && isNaN(sc)) {
          setError("Score must be a valid number.");
          return;
        }
        finalVal = {
          schema_type: "submission",
          repo_url: repoUrl.trim() || null,
          paper_link: paperLink.trim() || null,
          score: sc,
        } as SubmissionObject;
      } else if (st === "role_assignment") {
        if (!roleTitle.trim()) {
          setError("Role title is required.");
          return;
        }
        finalVal = {
          schema_type: "role_assignment",
          role_title: roleTitle.trim(),
          team_name: teamName.trim() || null,
          is_lead: isLead,
        } as RoleAssignmentObject;
      } else if (st === "contribution_assignment") {
        const pts = parseInt(contribPoints, 10);
        if (isNaN(pts) || pts < 0) {
          setError("Points must be a non-negative number.");
          return;
        }
        finalVal = {
          schema_type: "contribution_assignment",
          category: contribCategory,
          track: contribTrack,
          points: pts,
          title: contribTitle.trim() || null,
          description: contribDescription.trim() || null,
        } as ContributionAssignmentObject;
      } else if (st === "spg_assignment") {
        if (!spgName.trim()) {
          setError("SPG name is required.");
          return;
        }
        finalVal = {
          schema_type: "spg_assignment",
          spg_id: null,
          spg_name: spgName.trim(),
          spg_status: spgStatus,
          role: spgRole,
        } as SPGAssignmentObject;
      } else if (st === "idea_jar_assignment") {
        if (!ideaTitle.trim()) {
          setError("Idea title is required.");
          return;
        }
        finalVal = {
          schema_type: "idea_jar_assignment",
          idea_id: null,
          idea_title: ideaTitle.trim(),
          track: ideaTrack,
          spg_id: null,
          spg_name: null,
        } as IdeaJarAssignmentObject;
      }
    }

    setSaving(true);
    try {
      await onAssignAll(column.column_id, finalVal);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign to all rows.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    setSaving(true);
    setError(null);
    try {
      await onAssignAll(column.column_id, null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear column values.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={() => !saving && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Assign to All: {column.title}</h3>
            <span style={{ fontSize: "12px", color: "#8c8c98" }}>
              Batch-assign a uniform value across all attendees in this column.
            </span>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={saving}
          >
            <MemberIcon name="close" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && (
              <div
                style={{
                  color: "#ef4444",
                  fontSize: "13px",
                  background: "rgba(239, 68, 68, 0.12)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                }}
              >
                {error}
              </div>
            )}

            {/* Column type forms */}
            {column.column_type === "text" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Value to assign to all</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Enter text to fill for all attendees..."
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {column.column_type === "number" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Numeric value to assign</label>
                <input
                  type="number"
                  className={styles.formInput}
                  placeholder="Enter number..."
                  value={numberVal}
                  onChange={(e) => setNumberVal(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {column.column_type === "object" && (
              <>
                {column.object_schema_type === "feedback" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Rating (1 to 5 Stars)</label>
                      <select
                        className={styles.formSelect}
                        value={rating}
                        onChange={(e) => setRating(Number(e.target.value))}
                      >
                        <option value={5}>★★★★★ (5 - Outstanding)</option>
                        <option value={4}>★★★★☆ (4 - Very Good)</option>
                        <option value={3}>★★★☆☆ (3 - Meets Expectations)</option>
                        <option value={2}>★★☆☆☆ (2 - Needs Improvement)</option>
                        <option value={1}>★☆☆☆☆ (1 - Unsatisfactory)</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Notes</label>
                      <textarea
                        className={styles.formTextarea}
                        placeholder="Evaluation notes to set for all..."
                        value={feedbackNotes}
                        onChange={(e) => setFeedbackNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {column.object_schema_type === "submission" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Repository URL</label>
                      <input
                        type="url"
                        className={styles.formInput}
                        placeholder="https://github.com/..."
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Evaluation Score</label>
                      <input
                        type="number"
                        className={styles.formInput}
                        placeholder="e.g. 90"
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {column.object_schema_type === "role_assignment" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Role Title *</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. Hackathon Participant"
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Team Name</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. General"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {column.object_schema_type === "contribution_assignment" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Merit Points Awarded *</label>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        className={styles.formInput}
                        value={contribPoints}
                        onChange={(e) => setContribPoints(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Category</label>
                      <select
                        className={styles.formSelect}
                        value={contribCategory}
                        onChange={(e) => setContribCategory(e.target.value)}
                      >
                        <option value="participation">Event Participation</option>
                        <option value="achievement">Achievement / Award</option>
                        <option value="project_work">Project Work</option>
                        <option value="teaching">Teaching / Workshop</option>
                        <option value="mentorship">Mentorship</option>
                        <option value="content">Content / Article</option>
                        <option value="organizing">Organizing / Lead</option>
                        <option value="service">Community Service</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Award Title</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. Hackathon Participant Points"
                        value={contribTitle}
                        onChange={(e) => setContribTitle(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* SPG Assignment */}
                {column.object_schema_type === "spg_assignment" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>SPG Name to assign to all *</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. Squad Delta"
                        value={spgName}
                        onChange={(e) => setSpgName(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Role</label>
                      <select
                        className={styles.formSelect}
                        value={spgRole}
                        onChange={(e) => setSpgRole(e.target.value)}
                      >
                        <option value="member">SPG Member</option>
                        <option value="lead">SPG Lead</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Idea Jar Assignment */}
                {column.object_schema_type === "idea_jar_assignment" && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Idea Title to assign to all *</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. Reinforce Matrix System"
                        value={ideaTitle}
                        onChange={(e) => setIdeaTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Track</label>
                      <select
                        className={styles.formSelect}
                        value={ideaTrack}
                        onChange={(e) => setIdeaTrack(e.target.value)}
                      >
                        <option value="general">General</option>
                        <option value="technical">Technical</option>
                        <option value="product">Product</option>
                        <option value="research">Research</option>
                        <option value="misc">Misc</option>
                      </select>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={saving}
              className={styles.clearCellBtn}
              title="Clear all values in this column"
            >
              Clear All Rows
            </button>

            <div className={styles.footerActionsRight}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={styles.actionBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              >
                {saving ? "Assigning..." : "Assign to All"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
