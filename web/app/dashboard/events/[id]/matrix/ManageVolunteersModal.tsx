"use client";

import React, { useState } from "react";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
import type { VolunteerProfile } from "@/types/event-matrix";
import styles from "./EventMatrix.module.css";

interface ManageVolunteersModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  volunteerUids: string[];
  volunteerProfiles: VolunteerProfile[];
  onSaveVolunteers: (uids: string[]) => Promise<void>;
}

export default function ManageVolunteersModal({
  isOpen,
  onClose,
  token,
  volunteerUids,
  volunteerProfiles,
  onSaveVolunteers,
}: ManageVolunteersModalProps) {
  // Initialize with picked members from profiles
  const [selected, setSelected] = useState<PickedMember[]>(() => {
    return volunteerUids.map((uid) => {
      const prof = volunteerProfiles.find((p) => p.id === uid);
      return {
        id: uid,
        full_name: prof?.full_name || uid,
        email: prof?.email || "",
        avatar_url: prof?.avatar_url || null,
        batch_year: prof?.batch_year || null,
      };
    });
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const uids = selected.map((m) => m.id);
      await onSaveVolunteers(uids);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update volunteer access.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={() => !saving && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Manage Event Matrix Volunteers</h3>
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
            <p style={{ margin: 0, fontSize: "13px", color: "#a1a1aa", lineHeight: "1.5" }}>
              By default, the Event Matrix is restricted to Site Admins. Authorized volunteers can view the matrix, grade submissions, log evaluations, and update live attendance.
            </p>

            {error && (
              <div style={{ color: "#ef4444", fontSize: "13px", background: "rgba(239, 68, 68, 0.12)", padding: "8px 12px", borderRadius: "6px" }}>
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <MemberPicker
                token={token}
                label="Authorized Volunteers"
                selected={selected}
                onChange={setSelected}
                max={15}
              />
            </div>
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
                {saving ? "Updating..." : "Save Volunteer Roster"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
