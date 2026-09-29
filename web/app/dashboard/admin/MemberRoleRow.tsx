"use client";

import { useState } from "react";
import { api, type MemberTier, type StudentProfile } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./MemberRoleRow.module.css";

function getInitials(name?: string) {
  if (!name) return "MB";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MemberRoleRow({
  member,
  token,
  onSaved,
}: {
  member: StudentProfile;
  token: string;
  onSaved: (message: string) => void;
}) {
  const [tier, setTier] = useState<"beginner" | "advanced">(() =>
    member.tier === "advanced" ? "advanced" : "beginner"
  );
  const [isMember, setIsMember] = useState<boolean>(() => Boolean(member.is_member));
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(member.is_admin));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  const initialTier = member.tier === "advanced" ? "advanced" : "beginner";
  const initialIsMember = Boolean(member.is_member);
  const initialIsAdmin = Boolean(member.is_admin);

  const hasChanges =
    tier !== initialTier ||
    isMember !== initialIsMember ||
    isAdmin !== initialIsAdmin;

  const save = async () => {
    setBusy(true);
    setMessage("");
    setIsSaved(false);
    try {
      await api.adminUpdateUserStatus(token, member.id!, {
        is_member: isMember,
        is_admin: isAdmin,
        tier: tier as MemberTier,
        role_label: null,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
      onSaved(
        `${member.full_name} updated.${
          isAdmin !== initialIsAdmin
            ? " Admin privileges update after the user signs in again."
            : ""
        }`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update member status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`${styles.memberRow} ${hasChanges ? styles.memberRowModified : ""}`}
      aria-label={`Member ${member.full_name}`}
    >
      {/* User Avatar & Identity */}
      <div className={styles.memberIdentity}>
        <div className={styles.avatar}>
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.full_name || "Member avatar"}
              className={styles.avatarImg}
            />
          ) : (
            <span>{getInitials(member.full_name)}</span>
          )}
        </div>

        <div className={styles.nameGroup}>
          <div className={styles.nameRow}>
            <span className={styles.memberName}>{member.full_name || "Unnamed Member"}</span>
            {member.is_verified && (
              <span className={styles.verifiedBadge} title="Verified Discord Student">
                ✓
              </span>
            )}
            {isAdmin && <span className={styles.adminBadge}>Admin</span>}
          </div>
          <span className={styles.memberEmail}>{member.email || "No email"}</span>
        </div>
      </div>

      {/* Role & Privileges Controls */}
      <div className={styles.controls}>
        {/* Tier Select */}
        <select
          aria-label={`Skill tier for ${member.full_name}`}
          className={styles.tierSelect}
          value={tier}
          onChange={(event) => setTier(event.target.value as "beginner" | "advanced")}
        >
          <option value="beginner">Beginner Tier</option>
          <option value="advanced">Advanced Tier</option>
        </select>

        {/* Member Status Toggle */}
        <label
          className={`${styles.togglePill} ${isMember ? styles.toggleMemberActive : ""}`}
          title="Toggle verified guild membership status"
        >
          <input
            type="checkbox"
            checked={isMember}
            onChange={(event) => setIsMember(event.target.checked)}
          />
          <span>Member</span>
        </label>

        {/* Admin Access Toggle */}
        <label
          className={`${styles.togglePill} ${isAdmin ? styles.toggleAdminActive : ""}`}
          title="Toggle administrative dashboard privileges"
        >
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => setIsAdmin(event.target.checked)}
          />
          <MemberIcon name="shield" size={13} />
          <span>Admin</span>
        </label>
      </div>

      {/* Action / Save Group */}
      <div className={styles.actionGroup}>
        {isSaved && !hasChanges && (
          <span className={styles.saveFeedback}>
            <MemberIcon name="check" size={13} />
            Saved
          </span>
        )}
        {message && <span className={styles.errorFeedback}>{message}</span>}

        <button
          type="button"
          className={`${styles.saveBtn} ${hasChanges ? styles.saveBtnHighlight : ""}`}
          onClick={save}
          disabled={busy || !hasChanges}
          title={hasChanges ? "Save role and privilege changes" : "No changes to save"}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </article>
  );
}
