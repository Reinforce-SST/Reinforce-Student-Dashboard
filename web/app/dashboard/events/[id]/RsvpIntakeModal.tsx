"use client";

import React, { useState } from "react";
import type { EventDocument } from "@/lib/api";
import type { CustomFieldSchema, EventTrackSchema } from "@/types/event-matrix";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
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
  initialTeammates?: PickedMember[];
  onSuccess: (result: { status: string; registration?: any }) => void;
}

export default function RsvpIntakeModal({
  isOpen,
  onClose,
  event,
  token,
  currentUserId,
  initialTeamName = "",
  initialTeammates = [],
  onSuccess,
}: RsvpIntakeModalProps) {
  const isTeam = event.participation?.mode === "team";
  const minTeamSize = Math.max(1, event.participation?.min_team_size ?? 1);
  const maxTeamSize = Math.max(1, event.participation?.max_team_size ?? 1);

  const tracks: EventTrackSchema[] = event.event_tracks || [];
  const customFields: CustomFieldSchema[] = event.custom_registration_fields || [];

  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    tracks.length > 0 ? tracks[0].track_id : ""
  );
  const [teamName, setTeamName] = useState(initialTeamName);
  const [teammates, setTeammates] = useState<PickedMember[]>(initialTeammates);

  // Field responses: team-level and individual-level for current user
  const [teamResponses, setTeamResponses] = useState<Record<string, any>>({});
  const [individualResponses, setIndividualResponses] = useState<Record<string, any>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const teamFields = customFields.filter((cf) => cf.applies_to === "team");
  const individualFields = customFields.filter((cf) => cf.applies_to === "individual");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (isTeam && !teamName.trim()) {
      setError("Please provide a team name.");
      return;
    }

    const memberUids = teammates.map((t) => t.id);
    if (isTeam && memberUids.length + 1 < minTeamSize) {
      setError(
        `This event requires teams of at least ${minTeamSize}. Add ${
          minTeamSize - 1 - memberUids.length
        } more ${minTeamSize - 1 - memberUids.length === 1 ? "teammate" : "teammates"}.`
      );
      return;
    }

    // Validate required team fields
    for (const tf of teamFields) {
      if (tf.required) {
        const val = teamResponses[tf.field_id];
        if (val === undefined || val === null || val === "") {
          setError(`Please complete the required field: "${tf.label}"`);
          return;
        }
      }
    }

    // Validate required individual fields
    for (const ind of individualFields) {
      if (ind.required) {
        const val = individualResponses[ind.field_id];
        if (val === undefined || val === null || val === "") {
          setError(`Please complete your individual required field: "${ind.label}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payload: Parameters<typeof api.registerForEvent>[2] = {
        team_name: isTeam ? teamName.trim() : undefined,
        member_uids: isTeam && memberUids.length > 0 ? memberUids : undefined,
        selected_track_id: selectedTrackId || undefined,
        custom_responses: Object.keys(teamResponses).length > 0 ? teamResponses : undefined,
        member_responses:
          Object.keys(individualResponses).length > 0 && currentUserId
            ? { [currentUserId]: individualResponses }
            : undefined,
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
              Event Registration Intake
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

          {/* Team Configuration */}
          {isTeam && (
            <div className={styles.modalSection}>
              <label className={styles.modalSectionLabel}>
                Team Registration Details <span className={styles.reqAsterisk}>*</span>
              </label>
              <div className={styles.teamInputBlock}>
                <input
                  type="text"
                  placeholder="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.teamFieldInput}
                  required
                />

                {maxTeamSize > 1 && (
                  <MemberPicker
                    token={token}
                    label="Invite Teammates"
                    selected={teammates}
                    onChange={setTeammates}
                    excludeIds={currentUserId ? [currentUserId] : []}
                    max={maxTeamSize - 1}
                  />
                )}
                <span className={styles.teamHintText}>
                  You are registered automatically as the team lead. Teammates added here will receive invitations and must accept them to join your squad roster. Teams require {minTeamSize === maxTeamSize ? `${maxTeamSize} members.` : `${minTeamSize}–${maxTeamSize} members.`}
                </span>
              </div>
            </div>
          )}

          {/* Team-Level Intake Questions */}
          {teamFields.length > 0 && (
            <div className={styles.modalSection}>
              <label className={styles.modalSectionLabel}>
                Team / Project Intake Questions
              </label>
              <div className={styles.intakeFieldsStack}>
                {teamFields.map((field) => (
                  <div key={field.field_id} className={styles.intakeFieldItem}>
                    <label className={styles.fieldLabel}>
                      {field.label}
                      {field.required && <span className={styles.reqAsterisk}> *</span>}
                    </label>

                    {field.field_type === "select" ? (
                      <select
                        value={teamResponses[field.field_id] || ""}
                        onChange={(e) =>
                          setTeamResponses((prev) => ({
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
                          checked={Boolean(teamResponses[field.field_id])}
                          onChange={(e) =>
                            setTeamResponses((prev) => ({
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
                        value={teamResponses[field.field_id] || ""}
                        onChange={(e) =>
                          setTeamResponses((prev) => ({
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
