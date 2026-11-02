"use client";

import React from "react";
import styles from "./EventMatrix.module.css";

interface TextCellEditorProps {
  value: string | number | null;
  columnType?: "text" | "number";
  canEdit: boolean;
  isUnsaved?: boolean;
  onClick?: () => void;
}

export default function TextCellEditor({
  value,
  columnType = "text",
  canEdit,
  isUnsaved = false,
  onClick,
}: TextCellEditorProps) {
  return (
    <div
      className={`${styles.textCellBox} ${isUnsaved ? styles.cellUnsaved : ""}`}
      onClick={onClick}
      title={canEdit ? "Click to edit in sidebar" : undefined}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={(e) => {
        if (canEdit && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {value != null ? (
        <span>{value}</span>
      ) : (
        <span className={styles.textCellPlaceholder}>
          {canEdit ? `+ Add ${columnType === "number" ? "number" : "text"}` : "—"}
        </span>
      )}
      {isUnsaved && <span className={styles.unsavedDot} title="Unsaved edit" />}
    </div>
  );
}
