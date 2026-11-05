"use client";

import React from "react";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventDetail.module.css";

interface LockRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  teamName?: string | null;
  squadSize: number;
  minTeamSize: number;
  eventTitle: string;
  loading: boolean;
  error?: string | null;
}

export default function LockRosterModal({
  isOpen,
  onClose,
  onConfirm,
  teamName,
  squadSize,
  minTeamSize,
  eventTitle,
  loading,
  error,
}: LockRosterModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={loading ? undefined : onClose}>
      <div
        className={styles.modalBox}
        style={{ maxWidth: "520px", background: "#18181b", border: "1px solid #31343a" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-modal-title"
      >
        {/* Modal Header */}
        <div className={styles.modalHeader} style={{ borderBottom: "1px solid #27272a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(229, 183, 49, 0.15)",
                border: "1px solid rgba(229, 183, 49, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#E5B731",
                flexShrink: 0,
              }}
            >
              <MemberIcon name="lock" size={20} />
            </div>
            <div>
              <h2
                id="lock-modal-title"
                className={styles.modalTitle}
                style={{ color: "#ffffff", fontSize: "17px", fontWeight: "800", margin: 0 }}
              >
                Lock Squad Roster & Form SPG
              </h2>
              <span style={{ fontSize: "12px", color: "#a1a1aa" }}>{eventTitle}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalCloseBtn}
            disabled={loading}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
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
              <MemberIcon name="shield" size={14} />
              <span>{error}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.6", color: "#e4e4e7" }}>
            Lock squad roster now? This will automatically mint your <strong>Event SPG</strong> and finalize your team roster. You can unlock later if someone needs to join or leave.
          </p>

          {/* Details Card */}
          <div
            style={{
              background: "#121214",
              border: "1px solid #27272a",
              borderRadius: "8px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#d4d4d8" }}>
              <div style={{ color: "#E5B731" }}>
                <MemberIcon name="sparkles" size={16} />
              </div>
              <div>
                <strong style={{ color: "#ffffff" }}>Official Event SPG Created:</strong> An SPG record will be minted for <strong>{teamName || "your squad"}</strong>.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#d4d4d8" }}>
              <div style={{ color: "#4ade80" }}>
                <MemberIcon name="users" size={16} />
              </div>
              <div>
                <strong style={{ color: "#ffffff" }}>Roster Finalized:</strong> All {squadSize} current member(s) will be linked to the SPG.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#d4d4d8" }}>
              <div style={{ color: "#60a5fa" }}>
                <MemberIcon name="unlock" size={16} />
              </div>
              <div>
                <strong style={{ color: "#ffffff" }}>Reversible:</strong> You can click &ldquo;Unlock / Edit Roster&rdquo; at any time if team members change.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div
          className={styles.modalActions}
          style={{
            borderTop: "1px solid #27272a",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className={styles.modalCancelBtn}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await onConfirm();
              } catch {
                // handled in parent via error state
              }
            }}
            disabled={loading || squadSize < minTeamSize}
            style={{
              background: "#E5B731",
              color: "#121214",
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: "800",
              cursor: loading || squadSize < minTeamSize ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 10px rgba(229, 183, 49, 0.3)",
            }}
          >
            <MemberIcon name="lock" size={14} />
            {loading ? "Locking & Minting SPG..." : "Confirm & Lock Roster"}
          </button>
        </div>
      </div>
    </div>
  );
}
