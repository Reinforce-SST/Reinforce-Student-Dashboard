"use client";

import React, { useState, useEffect } from "react";
import type { EventDocument } from "@/lib/api";
import type { CustomFieldSchema } from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { api } from "@/lib/api";
import styles from "./EventDetail.module.css";

interface EditResponsesModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventDocument;
  token: string;
  currentUserId: string;
  initialResponses: Record<string, any>;
  initialTeamName?: string;
  onSuccess: (updatedResponses: Record<string, any>, updatedCustomResponses?: Record<string, any>, newTeamName?: string) => void;
}

export default function EditResponsesModal({
  isOpen,
  onClose,
  event,
  token,
  currentUserId,
  initialResponses,
  initialTeamName,
  onSuccess,
}: EditResponsesModalProps) {
  const customFields: CustomFieldSchema[] = event.custom_registration_fields || [];
  const [responses, setResponses] = useState<Record<string, any>>(initialResponses);
  const [teamName, setTeamName] = useState(initialTeamName || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResponses(initialResponses);
    if (initialTeamName) setTeamName(initialTeamName);
  }, [initialResponses, initialTeamName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (event.participation?.mode === "team" && !teamName.trim()) {
      setError("Please provide a valid team name.");
      return;
    }

    // Validate required fields
    for (const f of customFields) {
      if (f.required) {
        const val = responses[f.field_id];
        if (val === undefined || val === null || val === "") {
          setError(`Please provide an answer for "${f.label}".`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payloadResponses = {
        ...responses,
        ...(event.participation?.mode === "team" && teamName.trim() ? { team_name: teamName.trim() } : {}),
      };
      const res = await api.updateMemberCustomResponses(token, event.id, payloadResponses);
      onSuccess(res.responses, (res as any).custom_responses, teamName.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update responses.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", maxHeight: "88vh", overflowY: "auto" }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <h2 className={styles.modalHeading}>
              <MemberIcon name="edit" size={18} />
              Edit Registration Responses
            </h2>
            <p className={styles.modalSubheading}>
              Update your intake details for {event.title}. Changes will immediately sync to the Event Matrix.
            </p>
          </div>
          <button type="button" onClick={onClose} className={styles.modalCloseBtn} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalFormBody}>
          {error && (
            <div role="alert" className={styles.regErrorAlert}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Team Name if team-based event */}
            {event.participation?.mode === "team" && (
              <div
                style={{
                  background: "#16161a",
                  border: "1px solid #282832",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    Team Name <span className={styles.reqAsterisk}>*</span>
                  </label>
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: "750",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "rgba(229, 183, 49, 0.12)",
                      color: "#e5b731",
                      border: "1px solid rgba(229, 183, 49, 0.3)",
                      textTransform: "uppercase",
                    }}
                  >
                    Team Field
                  </span>
                </div>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter your team name"
                  className={styles.fieldTextInput}
                  required
                />
              </div>
            )}

            {customFields.map((cf) => (
              <div
                key={cf.field_id}
                style={{
                  background: "#16161a",
                  border: "1px solid #282832",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    {cf.label}
                    {cf.required && <span className={styles.reqAsterisk}> *</span>}
                  </label>
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: "750",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: cf.applies_to === "team" ? "rgba(229, 183, 49, 0.12)" : "rgba(56, 189, 248, 0.12)",
                      color: cf.applies_to === "team" ? "#e5b731" : "#38bdf8",
                      border: `1px solid ${cf.applies_to === "team" ? "rgba(229, 183, 49, 0.3)" : "rgba(56, 189, 248, 0.3)"}`,
                      textTransform: "uppercase",
                    }}
                  >
                    {cf.applies_to === "team" ? "Team Field" : "Individual Field"}
                  </span>
                </div>

                {cf.field_type === "select" ? (
                  <select
                    value={responses[cf.field_id] ?? ""}
                    onChange={(e) =>
                      setResponses((prev) => ({ ...prev, [cf.field_id]: e.target.value }))
                    }
                    className={styles.fieldSelect}
                  >
                    <option value="">-- Choose an option --</option>
                    {(cf.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : cf.field_type === "boolean" ? (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={Boolean(responses[cf.field_id])}
                      onChange={(e) =>
                        setResponses((prev) => ({ ...prev, [cf.field_id]: e.target.checked }))
                      }
                      className={styles.fieldCheckbox}
                    />
                    <span>Yes, confirmed / agreed</span>
                  </label>
                ) : (
                  <input
                    type={cf.field_type === "url" ? "url" : "text"}
                    value={responses[cf.field_id] ?? ""}
                    onChange={(e) =>
                      setResponses((prev) => ({ ...prev, [cf.field_id]: e.target.value }))
                    }
                    placeholder={cf.field_type === "url" ? "https://..." : `Enter your ${cf.label.toLowerCase()}`}
                    className={styles.fieldTextInput}
                  />
                )}
              </div>
            ))}
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={styles.modalCancelBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={styles.modalSubmitBtn}
            >
              <MemberIcon name="check" size={14} />
              {submitting ? "Saving Answers..." : "Save Responses"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
