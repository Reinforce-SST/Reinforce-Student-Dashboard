"use client";

import React, { useState, useEffect } from "react";
import type {
  MatrixColumnDef,
  MatrixRowHydrated,
  MatrixObjectPayload,
  FeedbackObject,
  SubmissionObject,
  RoleAssignmentObject,
  ContributionAssignmentObject,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventMatrix.module.css";

export interface ActiveCellTarget {
  row: MatrixRowHydrated;
  column?: MatrixColumnDef | null; // if null, targeting core Attendance
  value: string | number | MatrixObjectPayload | null;
}

interface MatrixCellDrawerProps {
  isOpen: boolean;
  target: ActiveCellTarget | null;
  canEdit: boolean;
  onClose: () => void;
  onSaveCell: (
    userId: string,
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => void;
  onSaveAttendance: (userId: string, status: string) => void;
}

export default function MatrixCellDrawer({
  isOpen,
  target,
  canEdit,
  onClose,
  onSaveCell,
  onSaveAttendance,
}: MatrixCellDrawerProps) {
  // Common states
  const [error, setError] = useState<string | null>(null);

  // Attendance target
  const [attendanceStatus, setAttendanceStatus] = useState("registered");

  // Text / Number drafts
  const [textVal, setTextVal] = useState("");
  const [numberVal, setNumberVal] = useState("");

  // Object drafts
  // 1. Feedback
  const [rating, setRating] = useState<number>(5);
  const [feedbackNotes, setFeedbackNotes] = useState("");

  // 2. Submission
  const [repoUrl, setRepoUrl] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [score, setScore] = useState("");

  // 3. Role
  const [roleTitle, setRoleTitle] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isLead, setIsLead] = useState(false);

  // 4. Contribution
  const [contribPoints, setContribPoints] = useState("10");
  const [contribCategory, setContribCategory] = useState("participation");
  const [contribTrack, setContribTrack] = useState("general");
  const [contribTitle, setContribTitle] = useState("");
  const [contribDescription, setContribDescription] = useState("");

  useEffect(() => {
    if (!target) return;
    setError(null);

    // If targeting core attendance
    if (!target.column) {
      setAttendanceStatus(typeof target.value === "string" ? target.value : target.row.attendance);
      return;
    }

    const col = target.column;
    const val = target.value;

    if (col.column_type === "text") {
      setTextVal(typeof val === "string" ? val : "");
    } else if (col.column_type === "number") {
      setNumberVal(val != null ? String(val) : "");
    } else if (col.column_type === "object") {
      const obj = val && typeof val === "object" ? (val as MatrixObjectPayload) : null;
      if (col.object_schema_type === "feedback" || obj?.schema_type === "feedback") {
        const fb = obj as FeedbackObject | null;
        setRating(fb?.rating || 5);
        setFeedbackNotes(fb?.notes || "");
      } else if (col.object_schema_type === "submission" || obj?.schema_type === "submission") {
        const sub = obj as SubmissionObject | null;
        setRepoUrl(sub?.repo_url || "");
        setPaperLink(sub?.paper_link || "");
        setScore(sub?.score != null ? String(sub.score) : "");
      } else if (col.object_schema_type === "role_assignment" || obj?.schema_type === "role_assignment") {
        const r = obj as RoleAssignmentObject | null;
        setRoleTitle(r?.role_title || "");
        setTeamName(r?.team_name || "");
        setIsLead(Boolean(r?.is_lead));
      } else if (col.object_schema_type === "contribution_assignment" || obj?.schema_type === "contribution_assignment") {
        const c = obj as ContributionAssignmentObject | null;
        setContribPoints(c?.points != null ? String(c.points) : "10");
        setContribCategory(c?.category || "participation");
        setContribTrack(c?.track || "general");
        setContribTitle(c?.title || "");
        setContribDescription(c?.description || "");
      }
    }
  }, [target]);

  if (!isOpen || !target) return null;

  const { row, column } = target;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Handling Attendance
    if (!column) {
      onSaveAttendance(row.user_id, attendanceStatus);
      onClose();
      return;
    }

    // 2. Handling Column Value
    let finalVal: string | number | MatrixObjectPayload | null = null;

    if (column.column_type === "text") {
      finalVal = textVal.trim() === "" ? null : textVal.trim();
    } else if (column.column_type === "number") {
      if (numberVal.trim() === "") {
        finalVal = null;
      } else {
        const parsed = parseFloat(numberVal.trim());
        if (isNaN(parsed)) {
          setError("Please enter a valid number.");
          return;
        }
        finalVal = parsed;
      }
    } else if (column.column_type === "object") {
      const st = column.object_schema_type || "feedback";
      if (st === "feedback") {
        const r = Number(rating);
        if (isNaN(r) || r < 1 || r > 5) {
          setError("Rating must be between 1 and 5.");
          return;
        }
        finalVal = {
          schema_type: "feedback",
          rating: r,
          notes: feedbackNotes.trim() || null,
        } as FeedbackObject;
      } else if (st === "submission") {
        const sc = score.trim() !== "" ? parseFloat(score.trim()) : null;
        if (sc !== null && isNaN(sc)) {
          setError("Score must be a number.");
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
          setError("Points must be a positive number.");
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
      }
    }

    onSaveCell(row.user_id, column.column_id, finalVal);
    onClose();
  };

  const handleClear = () => {
    if (!column) return;
    onSaveCell(row.user_id, column.column_id, null);
    onClose();
  };

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} />
      <aside className={styles.drawerContainer} aria-label="Matrix Cell Editor">
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            <div className={styles.drawerAttendeeRow}>
              <span className={styles.drawerAttendeeName}>{row.user_name}</span>
              {row.team_name && (
                <span className={styles.drawerTeamTag}>Team: {row.team_name}</span>
              )}
            </div>
            <span className={styles.drawerSubMeta}>
              {column ? (
                <>
                  Column: <strong>{column.title}</strong> (
                  {column.column_type === "object"
                    ? `Object: ${column.object_schema_type}`
                    : column.column_type.toUpperCase()}
                  )
                </>
              ) : (
                "Attendance Roll-Call"
              )}
            </span>
          </div>

          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            title="Close editor drawer"
          >
            <MemberIcon name="close" size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className={styles.drawerForm}>
          <div className={styles.drawerBody}>
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

            {/* Core Attendance Editor */}
            {!column && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Attendance Status</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  {[
                    { id: "checked_in", label: "✓ Checked In" },
                    { id: "registered", label: "Registered" },
                    { id: "waitlisted", label: "Waitlisted" },
                    { id: "absent", label: "Absent" },
                    { id: "excused", label: "Excused" },
                    { id: "disqualified", label: "Disqualified" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setAttendanceStatus(s.id)}
                      className={`${styles.drawerChoiceBtn} ${
                        attendanceStatus === s.id ? styles.drawerChoiceBtnActive : ""
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Column Text Editor */}
            {column && column.column_type === "text" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cell Content (Plain Text)</label>
                <textarea
                  className={styles.formTextarea}
                  style={{ minHeight: "120px" }}
                  placeholder="Enter text, remarks, notes, or URL..."
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  disabled={!canEdit}
                  autoFocus
                />
              </div>
            )}

            {/* Column Number Editor */}
            {column && column.column_type === "number" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Numeric Value (Scores, Ranks, Metrics)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.formInput}
                  placeholder="e.g. 95 or 42.5"
                  value={numberVal}
                  onChange={(e) => setNumberVal(e.target.value)}
                  disabled={!canEdit}
                  autoFocus
                />
              </div>
            )}

            {/* Column Object Editor: Feedback */}
            {column &&
              column.column_type === "object" &&
              column.object_schema_type === "feedback" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Star Rating (1 to 5 Stars)</label>
                    <select
                      className={styles.formSelect}
                      value={rating}
                      onChange={(e) => setRating(Number(e.target.value))}
                      disabled={!canEdit}
                    >
                      <option value={5}>★★★★★ (5 - Exceptional)</option>
                      <option value={4}>★★★★☆ (4 - Very Good)</option>
                      <option value={3}>★★★☆☆ (3 - Meets Expectations)</option>
                      <option value={2}>★★☆☆☆ (2 - Needs Improvement)</option>
                      <option value={1}>★☆☆☆☆ (1 - Unsatisfactory)</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Review Notes & Feedback</label>
                    <textarea
                      className={styles.formTextarea}
                      style={{ minHeight: "100px" }}
                      placeholder="Observation notes, strengths, or suggestions..."
                      value={feedbackNotes}
                      onChange={(e) => setFeedbackNotes(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </>
              )}

            {/* Column Object Editor: Submission */}
            {column &&
              column.column_type === "object" &&
              column.object_schema_type === "submission" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Repository / Code URL</label>
                    <input
                      type="url"
                      className={styles.formInput}
                      placeholder="https://github.com/..."
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Paper / Article / Presentation Link</label>
                    <input
                      type="url"
                      className={styles.formInput}
                      placeholder="https://docs.google.com/... or https://arxiv.org/..."
                      value={paperLink}
                      onChange={(e) => setPaperLink(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Evaluation Score (Points)</label>
                    <input
                      type="number"
                      step="any"
                      className={styles.formInput}
                      placeholder="e.g. 92.5"
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </>
              )}

            {/* Column Object Editor: Role */}
            {column &&
              column.column_type === "object" &&
              column.object_schema_type === "role_assignment" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Role Title *</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Lead Researcher, Frontend Developer"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      disabled={!canEdit}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Assigned Team / Pod</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Reinforce Alpha"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <input
                      type="checkbox"
                      id="drawer-is-lead"
                      checked={isLead}
                      onChange={(e) => setIsLead(e.target.checked)}
                      disabled={!canEdit}
                      style={{ accentColor: "#e5b731", width: "16px", height: "16px" }}
                    />
                    <label htmlFor="drawer-is-lead" style={{ fontSize: "13px", color: "#f4f4f5", cursor: "pointer" }}>
                      Designate as Team Lead
                    </label>
                  </div>
                </>
              )}

            {/* Column Object Editor: Contribution Assignment */}
            {column &&
              column.column_type === "object" &&
              column.object_schema_type === "contribution_assignment" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Merit Points *</label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      className={styles.formInput}
                      value={contribPoints}
                      onChange={(e) => setContribPoints(e.target.value)}
                      disabled={!canEdit}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Contribution Category</label>
                    <select
                      className={styles.formSelect}
                      value={contribCategory}
                      onChange={(e) => setContribCategory(e.target.value)}
                      disabled={!canEdit}
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
                    <label className={styles.formLabel}>Track</label>
                    <select
                      className={styles.formSelect}
                      value={contribTrack}
                      onChange={(e) => setContribTrack(e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="general">General / All Tracks</option>
                      <option value="research">Research Track</option>
                      <option value="product">Product Track</option>
                      <option value="kaggle">Kaggle Track</option>
                      <option value="misc">Misc Track</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Award Title</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. 1st Place Solution, Workshop Presentation"
                      value={contribTitle}
                      onChange={(e) => setContribTitle(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description / Highlights</label>
                    <textarea
                      className={styles.formTextarea}
                      style={{ minHeight: "80px" }}
                      placeholder="Notes or context..."
                      value={contribDescription}
                      onChange={(e) => setContribDescription(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </>
              )}
          </div>

          {/* Drawer Footer Actions */}
          <div className={styles.drawerFooter}>
            {column && target.value !== null && canEdit && (
              <button
                type="button"
                onClick={handleClear}
                className={styles.clearCellBtn}
                title="Reset this cell to empty"
              >
                Clear Cell
              </button>
            )}

            <div className={styles.footerActionsRight}>
              <button
                type="button"
                onClick={onClose}
                className={styles.actionBtn}
              >
                Close
              </button>
              {canEdit && (
                <button
                  type="submit"
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                >
                  Apply Change
                </button>
              )}
            </div>
          </div>
        </form>
      </aside>
    </>
  );
}
