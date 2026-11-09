"use client";

import React from "react";
import styles from "./EventDetail.module.css";

interface CancelRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isTeamLead: boolean;
  teamName?: string | null;
  hasSpg: boolean;
  eventTitle: string;
  loading: boolean;
  error?: string | null;
}

export default function CancelRegistrationModal({
  isOpen,
  onClose,
  onConfirm,
  isTeamLead,
  teamName,
  hasSpg,
  eventTitle,
  loading,
  error,
}: CancelRegistrationModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalBox}
        style={{ maxWidth: "520px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(248, 113, 113, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f87171",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 className={styles.modalTitle} style={{ color: "#ffffff", fontSize: "17px", margin: 0 }}>
                {isTeamLead && (hasSpg || teamName)
                  ? "Cancel Team Registration"
                  : teamName
                  ? "Leave Event Team"
                  : "Cancel Registration"}
              </h2>
              <span style={{ fontSize: "12px", color: "#8c8c98" }}>{eventTitle}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalCloseBtn}
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#f87171",
                fontSize: "12.5px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>⚠️ {error}</span>
            </div>
          )}

          {isTeamLead && (hasSpg || teamName) ? (
            <div
              style={{
                background: "rgba(248, 113, 113, 0.08)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: "8px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontWeight: "700", fontSize: "13px" }}>
                <span>⚠️ Important: Team &amp; SPG Cascading Cancellation</span>
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#e4e4e7", lineHeight: "1.5" }}>
                You are registered as the <strong>Lead of team &quot;{teamName || "Your Team"}&quot;</strong>.
                Cancelling your registration will <strong>cancel the event registration for the entire team</strong>.
              </p>
              {hasSpg && (
                <div style={{ fontSize: "12px", color: "#f87171", fontWeight: "600", marginTop: "4px" }}>
                  🚨 The associated Special Project Group (SPG) created for this event will be permanently disbanded/deleted along with its workspace.
                </div>
              )}
            </div>
          ) : teamName ? (
            <div
              style={{
                background: "rgba(248, 113, 113, 0.08)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: "8px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontWeight: "700", fontSize: "13px" }}>
                <span>Leave Event Team &quot;{teamName}&quot;</span>
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#e4e4e7", lineHeight: "1.5" }}>
                You are registered as a <strong>Member of team &quot;{teamName}&quot;</strong>.
                Cancelling will <strong>remove you from this team and release your spot</strong> in <strong>{eventTitle}</strong>.
                The rest of your team will remain registered.
              </p>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "13.5px", color: "#d4d4d8", lineHeight: "1.5" }}>
              Are you sure you want to cancel your registration for <strong>{eventTitle}</strong>?
              Your spot will be released to other students or waitlisted members.
            </p>
          )}

          <p style={{ margin: 0, fontSize: "12px", color: "#71717a" }}>
            This action cannot be undone. If you change your mind, you will need to re-register while spots remain open.
          </p>
        </div>

        <div className={styles.modalFooter} style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px" }}>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalCancelBtn}
            disabled={loading}
          >
            Keep Registration
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await onConfirm();
              } catch {
                // error handled via error prop
              }
            }}
            disabled={loading}
            style={{
              background: "#ef4444",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: "700",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {loading
              ? isTeamLead ? "Cancelling Registration..." : "Leaving Team..."
              : isTeamLead && hasSpg
              ? "Yes, Cancel Registration & Disband SPG"
              : !isTeamLead && teamName
              ? "Yes, Leave Team & Cancel RSVP"
              : "Yes, Cancel Registration"}
          </button>
        </div>
      </div>
    </div>
  );
}
