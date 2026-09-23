"use client";
import { useState, type FormEvent } from "react";
import { ApiError, type SocialLinks } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import styles from "@/components/dashboard/MemberContent.module.css";

export default function ProfileClient() {
  const { profile, save } = useMember();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setStatus(""); setFailed(false);
    const social_links: SocialLinks = {};
    for (const key of ["github", "linkedin", "kaggle", "discord"] as const) social_links[key] = String(data.get(key) ?? "").trim() || null;
    try {
      await save({ full_name: String(data.get("name")).trim(), skills: String(data.get("skills")).split(",").map(value => value.trim()).filter(Boolean), social_links });
      setStatus("Profile saved.");
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof ApiError ? error.message : "Your changes were not saved. Please try again.");
    } finally { setSaving(false); }
  }
  return <div className={styles.page}>
    <div className={styles.intro}><p className={styles.eyebrow}>Member profile</p><h1 className={styles.title}>Your profile</h1><p className={styles.muted}>Keep your skills and links up to date.</p></div>
    <div className={styles.grid}>
      <form className={styles.card} onSubmit={submit}>
        <label className={styles.label}>Full name<input className={styles.input} name="name" required maxLength={100} defaultValue={profile.full_name} /></label>
        <label className={styles.label}>Skills, separated by commas<input className={styles.input} name="skills" maxLength={1000} defaultValue={profile.skills.join(", ")} /></label>
        {([['github', 'GitHub'], ['linkedin', 'LinkedIn'], ['kaggle', 'Kaggle'], ['discord', 'Discord profile']] as const).map(([key, label]) => <label key={key} className={styles.label}>{label}<input className={styles.input} type="url" name={key} placeholder="https://" defaultValue={profile.social_links[key] ?? ""} maxLength={2048} /></label>)}
        {status && <p role={failed ? "alert" : "status"} className={failed ? styles.error : styles.muted}>{status}</p>}
        <div className={styles.actions}><button className={styles.button} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
      </form>
      <section className={styles.card}><h2>Connected accounts</h2><dl className={styles.facts}><div><dt>College email</dt><dd>{profile.email}</dd></div><div><dt>Discord</dt><dd>{profile.is_verified ? `Verified · ${profile.discord_id}` : "Verification required"}</dd></div></dl><p className={styles.muted}>Run <code>/auth</code> in the club Discord to verify your identity or retry a pending role. To change the linked Discord account, ask a club admin to unlink it first.</p></section>
    </div>
  </div>;
}
