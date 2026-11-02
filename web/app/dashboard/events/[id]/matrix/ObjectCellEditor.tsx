"use client";

import React from "react";
import type {
  MatrixSchemaType,
  MatrixObjectPayload,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventMatrix.module.css";

interface ObjectCellEditorProps {
  schemaType?: MatrixSchemaType | null;
  value: MatrixObjectPayload | null;
  canEdit: boolean;
  isUnsaved?: boolean;
  onClick?: () => void;
}

export default function ObjectCellEditor({
  schemaType = "feedback",
  value,
  canEdit,
  isUnsaved = false,
  onClick,
}: ObjectCellEditorProps) {
  if (!value) {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <button
          type="button"
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeEmpty}`}
          disabled={!canEdit}
        >
          <MemberIcon name="plus" size={12} />
          <span>
            Add{" "}
            {schemaType === "feedback"
              ? "Feedback"
              : schemaType === "submission"
              ? "Submission"
              : schemaType === "role_assignment"
              ? "Role"
              : schemaType === "contribution_assignment"
              ? "Points"
              : schemaType === "spg_assignment"
              ? "SPG"
              : schemaType === "idea_jar_assignment"
              ? "Idea"
              : "Object"}
          </span>
        </button>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "feedback") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeFeedback}`}
          role="button"
          tabIndex={0}
          title="Click to inspect/edit in sidebar"
        >
          <MemberIcon name="sparkles" size={13} />
          <strong>★ {value.rating}/5</strong>
          {value.notes && (
            <span
              style={{
                opacity: 0.8,
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {value.notes}
            </span>
          )}
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "submission") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeSubmission}`}
          role="button"
          tabIndex={0}
          title="Click to inspect/edit in sidebar"
        >
          <MemberIcon name="github" size={13} />
          <span>{value.score != null ? `${value.score} pts` : "Submitted"}</span>
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "role_assignment") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeRole}`}
          role="button"
          tabIndex={0}
          title="Click to inspect/edit in sidebar"
        >
          <MemberIcon name="shield" size={13} />
          <span>{value.is_lead ? "★ " : ""}{value.role_title}</span>
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "contribution_assignment") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeContrib}`}
          role="button"
          tabIndex={0}
          title={value.title || value.description || `${value.points} pts awarded in ${value.category}`}
        >
          <MemberIcon name="award" size={13} />
          <strong>{value.points} pts</strong>
          <span style={{ opacity: 0.85, fontSize: "11px" }}>{value.category}</span>
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "spg_assignment") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeSPG}`}
          role="button"
          tabIndex={0}
          title={`SPG: ${value.spg_name}${value.role ? ` (${value.role})` : ""}`}
        >
          <MemberIcon name="shield" size={13} />
          <strong>{value.role === "lead" ? "★ " : ""}{value.spg_name}</strong>
          {value.spg_status && (
            <span style={{ opacity: 0.85, fontSize: "10px", textTransform: "uppercase" }}>
              [{value.spg_status}]
            </span>
          )}
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  if (value.schema_type === "idea_jar_assignment") {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          onClick={onClick}
          className={`${styles.objectCellBadge} ${styles.objectCellBadgeIdea}`}
          role="button"
          tabIndex={0}
          title={`Idea: ${value.idea_title}${value.track ? ` [${value.track}]` : ""}`}
        >
          <MemberIcon name="sparkles" size={13} />
          <span
            style={{
              maxWidth: "140px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value.idea_title}
          </span>
          {value.track && (
            <span style={{ opacity: 0.85, fontSize: "10px" }}>
              ({value.track})
            </span>
          )}
        </div>
        {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
      </div>
    );
  }

  return <span>Unknown Object</span>;
}
