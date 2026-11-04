"use client";

import React, { useState } from "react";
import type { EventDocument } from "@/lib/api";
import type { CustomFieldSchema, EventTrackSchema } from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { api } from "@/lib/api";
import styles from "./EventDetail.module.css";

interface RsvpIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventDocument;
  token: string;
  currentUserId: string;
  initialTeamName?: string;
  onSuccess: (result: { status: string; registration?: any }) => void;
}

export default function RsvpIntakeModal({
  isOpen,
  onClose,
  event,
  token,
  currentUserId,
  initialTeamName = "",
  onSuccess,
}: RsvpIntakeModalProps) {
  const isTeam = event.participation?.mode === "team";
  const tracks: EventTrackSchema[] = event.event_tracks || [];
  const customFields: CustomFieldSchema[] = event.custom_registration_fields || [];

  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    tracks.length > 0 ? tracks[0].track_id : ""
  );
  const [teamName, setTeamName] = useState(initialTeamName);
  const [individualResponses, setIndividualResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Under register-first, individual RSVP only prompts for individual fields
  const individualFields = customFields.filter((cf) => cf.applies_to !== "team");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required individual fields
    for (const ind of individualFields) {
      if (ind.required) {
        const val = individualResponses[ind.field_id];
        if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
          setError(`Please complete your individual required field: "${ind.label}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payload: Parameters<typeof api.registerForEvent>[2] = {
        team_name: isTeam && teamName.trim() ? teamName.trim() : undefined,
        selected_track_id: selectedTrackId || undefined,
        custom_responses: individualResponses,
      };

      const res = await api.registerForEvent(token, event.id, payload);
      onSuccess(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register for event.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <h2 id="modal-title" className={styles.modalHeading}>
              Event Registration
            </h2>
            <p className={styles.modalSubheading}>{event.title}</p>
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
          {error && (
            <div role="alert" className={styles.regErrorAlert}>
              {error}
            </div>
          )}

          {/* Register-First Guidance Banner */}
          {isTeam && (
            <div
              style={{
                background: "rgba(229, 183, 49, 0.08)",
                border: "1px solid rgba(229, 183, 49, 0.3)",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: "12.5px",
                color: "#e4e4e7",
                lineHeight: "1.5",
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: "16px", lineHeight: "1" }}>ℹ️</span>
              <div>
                <strong style={{ color: "#E5B731" }}>Register-First Rule:</strong> Every participant registers individually first to answer their own intake questions. Once registered, you will unlock the <strong>Team Formation & Merge Hub</strong> where you can form squads, search registered peers, or merge via code!
              </div>
            </div>
          )}

          {/* Track Selection */}
          {tracks.length > 0 && (
            <div className={styles.modalSection}>
              <label className={styles.modalSectionLabel}>
                Choose Problem Track / Focus Area <span className={styles.reqAsterisk}>*</span>
              </label>
              <div className={styles.tracksGrid}>
                {tracks.map((track) => {
                  const isSelected = selectedTrackId === track.track_id;
                  return (
                    <button
                      key={track.track_id}
                      type="button"
                      onClick={() => setSelectedTrackId(track.track_id)}
                      className={`${styles.trackOptionCard} ${
                        isSelected ? styles.trackOptionCardSelected : ""
                      }`}
                    >
                      <div className={styles.trackCardHead}>
                        <span className={styles.trackCardName}>{track.name}</span>
                        {isSelected && <span className={styles.trackSelectedBadge}>Selected</span>}
                      </div>
                      {track.description && (
                        <p className={styles.trackCardDesc}>{track.description}</p>
                      )}
                      {track.max_teams && (
                        <span className={styles.trackCapTag}>
                          Cap: {track.max_teams} Teams Max
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Starter Team Name for Team Events */}
          {isTeam && (
            <div className={styles.modalSection}>
              <label className={styles.modalSectionLabel}>
                Starter Squad Name (Optional)
              </label>
              <div className={styles.teamInputBlock}>
                <input
                  type="text"
                  placeholder="e.g. Neural Knights (Leave blank to decide later)"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.teamFieldInput}
                />
                <span className={styles.teamHintText}>
                  If left blank, you will enter the Registered Pool as a solo participant ready to merge.
                </span>
              </div>
            </div>
          )}

          {/* Individual-Level Intake Questions */}
          {individualFields.length > 0 && (
            <div className={styles.modalSection}>
              <label className={styles.modalSectionLabel}>
                Individual Attendee Details (For You)
              </label>
              <div className={styles.intakeFieldsStack}>
                {individualFields.map((field) => (
                  <div key={field.field_id} className={styles.intakeFieldItem}>
                    <label className={styles.fieldLabel}>
                      {field.label}
                      {field.required && <span className={styles.reqAsterisk}> *</span>}
                    </label>

                    {field.field_type === "select" ? (
                      <select
                        value={individualResponses[field.field_id] || ""}
                        onChange={(e) =>
                          setIndividualResponses((prev) => ({
                            ...prev,
                            [field.field_id]: e.target.value,
                          }))
                        }
                        className={styles.fieldSelect}
                        required={field.required}
                      >
                        <option value="">-- Select an option --</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.field_type === "boolean" ? (
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(individualResponses[field.field_id])}
                          onChange={(e) =>
                            setIndividualResponses((prev) => ({
                              ...prev,
                              [field.field_id]: e.target.checked,
                            }))
                          }
                          className={styles.fieldCheckbox}
                        />
                        <span>Yes / Confirm</span>
                      </label>
                    ) : (
                      <input
                        type={field.field_type === "url" ? "url" : "text"}
                        placeholder={
                          field.field_type === "url"
                            ? "https://..."
                            : `Enter ${field.label.toLowerCase()}`
                        }
                        value={individualResponses[field.field_id] || ""}
                        onChange={(e) =>
                          setIndividualResponses((prev) => ({
                            ...prev,
                            [field.field_id]: e.target.value,
                          }))
                        }
                        className={styles.fieldTextInput}
                        required={field.required}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <MemberIcon name="plus" size={15} />
              {submitting ? "Confirming RSVP..." : "Complete Registration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
