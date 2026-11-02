"use client";

import React, { useState } from "react";
import type { MatrixColumnType, MatrixSchemaType, CreateMatrixColumnPayload } from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventMatrix.module.css";

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (payload: CreateMatrixColumnPayload) => Promise<void>;
}

export default function AddColumnModal({
  isOpen,
  onClose,
  onAdd,
}: AddColumnModalProps) {
  const [title, setTitle] = useState("");
  const [columnType, setColumnType] = useState<MatrixColumnType>("text");
  const [objectSchemaType, setObjectSchemaType] = useState<MatrixSchemaType>("feedback");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Column title is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onAdd({
        title: title.trim(),
        column_type: columnType,
        object_schema_type: columnType === "object" ? objectSchemaType : null,
      });
      setTitle("");
      setColumnType("text");
      setObjectSchemaType("feedback");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={() => !saving && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add Custom Matrix Column</h3>
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
              <div style={{ color: "#ef4444", fontSize: "13px", background: "rgba(239, 68, 68, 0.12)", padding: "8px 12px", borderRadius: "6px" }}>
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Column Title *</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="e.g. Mentor Feedback, Project Demo Link, Room Assignment"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Cell Data Type</label>
              <select
                className={styles.formSelect}
                value={columnType}
                onChange={(e) => setColumnType(e.target.value as MatrixColumnType)}
              >
                <option value="text">Plain Text (Inline editable notes, URLs, remarks)</option>
                <option value="number">Numeric (Integers, Scores, Ranks, Quantities)</option>
                <option value="object">Structured Object (Validated Pydantic schema)</option>
              </select>
            </div>

            {columnType === "object" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target Object Schema</label>
                <select
                  className={styles.formSelect}
                  value={objectSchemaType}
                  onChange={(e) => setObjectSchemaType(e.target.value as MatrixSchemaType)}
                >
                  <option value="feedback">Feedback Object (1-5 Star Rating & Review notes)</option>
                  <option value="submission">Submission Object (Repo URL, Paper Link & Score)</option>
                  <option value="role_assignment">Role Assignment Object (Role Title, Team, Lead flag)</option>
                  <option value="contribution_assignment">Contribution Assignment (Category, Track, Points)</option>
                  <option value="spg_assignment">SPG Assignment (Event SPGs, Member / Lead Role, Status)</option>
                  <option value="idea_jar_assignment">Idea Jar Assignment (Idea Title, Track, Linked SPG)</option>
                </select>
                <span style={{ fontSize: "11px", color: "#8c8c98", marginTop: "3px" }}>
                  Object cells feature an inline popover editor that validates against server schemas.
                </span>
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
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
                {saving ? "Creating..." : "Add Column"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
