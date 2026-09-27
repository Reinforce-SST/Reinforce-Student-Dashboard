"use client";

import { useState } from "react";
import { api, type MemberTier, type StudentProfile } from "@/lib/api";
import styles from "./Admin.module.css";

type RoleChoice = "beginner" | "advanced" | "core" | "admin" | "custom";

function currentRole(member: StudentProfile): RoleChoice {
  if (member.is_admin) return "admin";
  if (member.role_label?.toLowerCase() === "core") return "core";
  if (member.role_label) return "custom";
  return member.tier === "advanced" ? "advanced" : "beginner";
}

export default function MemberRoleRow({ member, token, onSaved }: {
  member: StudentProfile;
  token: string;
  onSaved: (message: string) => void;
}) {
  const [role, setRole] = useState<RoleChoice>(() => currentRole(member));
  const [customRole, setCustomRole] = useState(member.role_label && member.role_label.toLowerCase() !== "core" ? member.role_label : "");
  const [isMember, setIsMember] = useState(Boolean(member.is_member));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    if (role === "custom" && !customRole.trim()) {
      setMessage("Enter a custom role name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.adminUpdateUserStatus(token, member.id!, {
        is_member: isMember,
        is_admin: role === "admin",
        tier: role === "beginner" || role === "advanced" ? role as MemberTier : member.tier || "beginner",
        role_label: role === "core" ? "core" : role === "custom" ? customRole.trim() : null,
      });
      onSaved(`${member.full_name} saved.${role === "admin" || member.is_admin ? " Admin access updates after the member signs in again." : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this role.");
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.memberRow}>
    <div className={styles.memberIdentity}>
      <strong>{member.full_name}</strong>
      <span>{member.email}</span>
    </div>
    <label className={styles.memberToggle}>
      <input type="checkbox" checked={isMember} onChange={(event) => setIsMember(event.target.checked)} />
      Member
    </label>
    <select aria-label={`Role for ${member.full_name}`} className={styles.formSelect} value={role} onChange={(event) => setRole(event.target.value as RoleChoice)}>
      <option value="beginner">Beginner</option>
      <option value="advanced">Advanced</option>
      <option value="core">Core</option>
      <option value="admin">Admin</option>
      <option value="custom">Custom role</option>
    </select>
    {role === "custom" && <input aria-label={`Custom role for ${member.full_name}`} className={styles.formInput} value={customRole} onChange={(event) => setCustomRole(event.target.value)} maxLength={50} placeholder="Role name" />}
    <button type="button" className={styles.smallAction} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    {message && <span className={styles.memberMessage} role="status">{message}</span>}
  </div>;
}
