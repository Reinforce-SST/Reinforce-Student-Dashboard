"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ContributionRecord } from "@/lib/contributionData";
import styles from "./AdminWorkflows.module.css";

const CATEGORY_LABELS: Record<string, string> = {
  achievement: "Achievement",
  project_work: "Project work",
  teaching: "Teaching",
  mentorship: "Mentorship",
  content: "Content",
  organizing: "Organizing",
  service: "Service",
  other: "Other",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The review queue. Publishing an article, having a progress report verified
 * and having an idea accepted each record a pending contribution worth nothing.
 * Here an admin decides what it is worth, or rejects it with a reason. Nothing
 * reaches the leaderboard or a profile until it is approved.
 */
export default function AdminPendingContributionsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<ContributionRecord[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [points, setPoints] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.adminListContributions(token, { status: "pending", limit: 50 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setError("");
        // Records carry a UID only. Resolve each member once for display.
        const unknown = [...new Set(page.items.map((item) => item.user_id))];
        void Promise.allSettled(unknown.map((uid) => api.getUserProfile(token, uid))).then((results) => {
          if (!active) return;
          const resolved: Record<string, string> = {};
          results.forEach((result, index) => {
            if (result.status === "fulfilled" && result.value.full_name) resolved[unknown[index]] = result.value.full_name;
          });
          setNames((current) => ({ ...current, ...resolved }));
        });
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "The review queue could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision]);

  const nameOf = (record: ContributionRecord) => names[record.user_id] || record.user_id;

  async function approve(record: ContributionRecord) {
    const value = Number(points[record.id]);
    if (points[record.id] === undefined || points[record.id] === "" || !Number.isInteger(value) || value < 0) {
      setError(`Enter a whole number of points, zero or more, for ${nameOf(record)}.`);
      return;
    }
    setBusyId(record.id);
    setError("");
    setNotice("");
    try {
      await api.adminReviewContribution(token, record.id, { action: "approve", points: value });
      setItems((current) => current.filter((item) => item.id !== record.id));
      setNotice(`Approved ${value} ${value === 1 ? "point" : "points"} for ${nameOf(record)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The contribution could not be approved.");
    } finally {
      setBusyId("");
    }
  }

  async function reject(record: ContributionRecord) {
    if (!reason.trim()) {
      setError("Give a reason before rejecting. The member's record keeps it.");
      return;
    }
    setBusyId(record.id);
    setError("");
    setNotice("");
    try {
      await api.adminReviewContribution(token, record.id, { action: "reject", reason: reason.trim() });
      setItems((current) => current.filter((item) => item.id !== record.id));
      setRejecting("");
      setReason("");
      setNotice(`Rejected the request for ${nameOf(record)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The contribution could not be rejected.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="pending-contributions-heading">
      <h2 id="pending-contributions-heading">Waiting for review{items.length > 0 ? ` (${items.length})` : ""}</h2>
      <p>
        Recorded automatically when an article is published, a progress report is verified, or an idea is
        accepted. Each is worth nothing until you set its points here.
      </p>
      {notice && <p role="status" className={styles.reviewNotice}>{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Reload</button>
        </p>
      )}
      {loading && items.length === 0 && <p>Loading the review queue…</p>}
      {!loading && !error && items.length === 0 && <p>Nothing is waiting for review.</p>}
      <div className={styles.list}>
        {items.map((record) => {
          const name = nameOf(record);
          const pointsId = `review-points-${record.id}`;
          const reasonId = `review-reason-${record.id}`;
          const busy = busyId === record.id;
          return (
            <article key={record.id} className={styles.reviewRow} aria-label={`${name}: ${record.title}`}>
              <div className={styles.reviewSummary}>
                <strong>{name}</strong>
                <span>{record.title}</span>
                <small>
                  {CATEGORY_LABELS[record.category] ?? record.category}
                  {record.track && record.track !== "misc" ? ` · ${record.track}` : ""}
                  {formatDate(record.occurred_at) ? ` · ${formatDate(record.occurred_at)}` : ""}
                </small>
              </div>
              {rejecting === record.id ? (
                <div className={styles.reviewActions}>
                  <label htmlFor={reasonId}>Reason for rejecting {name}&apos;s request</label>
                  <input
                    id={reasonId}
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="e.g. Duplicate of an earlier article"
                  />
                  <button type="button" disabled={busy} onClick={() => void reject(record)}>Confirm rejection</button>
                  <button type="button" className={styles.reviewSecondary} disabled={busy} onClick={() => { setRejecting(""); setReason(""); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.reviewActions}>
                  <label htmlFor={pointsId}>Points for {name}</label>
                  <input
                    id={pointsId}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    // The label is visually hidden; this tells sighted admins the same thing.
                    placeholder="Points"
                    value={points[record.id] ?? ""}
                    onChange={(event) => setPoints((current) => ({ ...current, [record.id]: event.target.value }))}
                  />
                  <button type="button" disabled={busy} onClick={() => void approve(record)}>Approve</button>
                  <button
                    type="button"
                    className={styles.reviewSecondary}
                    disabled={busy}
                    onClick={() => { setRejecting(record.id); setReason(""); }}
                  >
                    Reject…
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
