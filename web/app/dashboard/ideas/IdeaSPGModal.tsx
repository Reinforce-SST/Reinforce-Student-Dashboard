"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type IdeaDetail } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./IdeaSPGModal.module.css";

interface IdeaSPGModalProps {
  idea: IdeaDetail;
  isOpen: boolean;
  onClose: () => void;
}

export default function IdeaSPGModal({ idea, isOpen, onClose }: IdeaSPGModalProps) {
  const router = useRouter();
  const { token, profile } = useMember();

  const [teamName, setTeamName] = useState(`${idea.title} [SPG]`);
  const [spgType, setSpgType] = useState<string>(idea.spg_creation_type || "project");
  const [vision, setVision] = useState(idea.description || "");
  const [teamMembers, setTeamMembers] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [meetingCadence, setMeetingCadence] = useState("Weekly sync & async Discord reviews");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("You must be signed in to charter an SPG.");
      return;
    }

    if (!teamName.trim()) {
      setError("Please provide a name for the Project Group.");
      return;
    }

    setSubmitting(true);
    setError("");

    // Build prefilled SPG Charter ticket payload with attached Idea Jar reference
    const ticketPayload = {
      title: `SPG Charter: ${teamName.trim()}`,
      category: "spg_registration" as const,
      description: vision.trim() || idea.description,
      priority: "medium" as const,
      fields: {
        "SPG Name": teamName.trim(),
        "SPG Type": spgType,
        "Idea Jar ID": idea.id,
        "Derived from Idea": idea.title,
        "Track": idea.track || "general",
        "Team Lead": profile?.full_name || profile?.email || "Current Member",
        "Lead UID": profile?.id || "",
        "Co-conspirators / Team Members": teamMembers.trim() || "Solo initiative / Recruiting",
        "GitHub Repository": githubUrl.trim() || "Will create upon charter approval",
        "Proposed Cadence": meetingCadence.trim(),
        "Charter Objectives": idea.description,
      },
    };

    try {
      await api.createTicket(token, ticketPayload);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        router.push("/dashboard/tickets?category=spg_registration");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register SPG charter. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <span className={styles.headerPill}>
              <MemberIcon name="sparkles" size={13} />
              Fast-Track Charter
            </span>
            <h2 className={styles.modalTitle}>Start SPG from this Idea</h2>
            <p className={styles.modalSubtitle}>
              Fields are pre-populated from <strong>{idea.title}</strong> (#{idea.id}).
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {success ? (
          <div className={styles.successBox}>
            <div className={styles.successCheck}>✓</div>
            <h3>Charter Ticket Dispatched!</h3>
            <p>Your project group registration has been submitted to club leads for review.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.modalForm}>
            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* Read-only Idea Attachment Badge */}
            <div className={styles.attachedIdeaCard}>
              <div className={styles.attachedMeta}>
                <span className={styles.trackBadge}>{idea.track} Track</span>
                {idea.difficulty && <span className={styles.diffBadge}>{idea.difficulty}</span>}
                <span className={styles.idBadge}>Idea Ref: #{idea.id}</span>
              </div>
              <div className={styles.attachedTitle}>{idea.title}</div>
            </div>

            <div className={styles.twoColRow}>
              <label className={styles.formLabel}>
                <span>Project Group (SPG) Name *</span>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </label>

              <label className={styles.formLabel}>
                <span>Target SPG Type (Auto-selected) *</span>
                <select
                  value={spgType}
                  onChange={(e) => setSpgType(e.target.value)}
                  className={styles.formInput}
                  style={{ background: "#1c1c21", color: "#f4f4f5" }}
                >
                  <option value="project">Project SPG</option>
                  <option value="learning">Learning SPG</option>
                  <option value="event">Event SPG</option>
                  <option value="external_event">External Hackathon SPG</option>
                  <option value="miscellaneous">Miscellaneous</option>
                </select>
              </label>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                <span>Team Leader</span>
                <input
                  type="text"
                  value={`${profile?.full_name || profile?.email || "You"} (Authenticated Lead)`}
                  disabled
                  className={`${styles.formInput} ${styles.inputDisabled}`}
                />
              </label>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                <span>Team Members / Discord Usernames</span>
                <input
                  type="text"
                  placeholder="e.g. @alex, @jordan (or leave empty if solo/recruiting)"
                  value={teamMembers}
                  onChange={(e) => setTeamMembers(e.target.value)}
                  className={styles.formInput}
                />
              </label>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                <span>Project Vision & Goals</span>
                <textarea
                  rows={3}
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                  className={styles.formTextarea}
                />
              </label>
            </div>

            <div className={styles.twoColRow}>
              <label className={styles.formLabel}>
                <span>GitHub Repository (Optional)</span>
                <input
                  type="url"
                  placeholder="https://github.com/Reinforce-SST/..."
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className={styles.formInput}
                />
              </label>

              <label className={styles.formLabel}>
                <span>Meeting / Sprint Cadence</span>
                <input
                  type="text"
                  value={meetingCadence}
                  onChange={(e) => setMeetingCadence(e.target.value)}
                  className={styles.formInput}
                />
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting ? "Dispatching Charter…" : "Submit SPG Charter →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
