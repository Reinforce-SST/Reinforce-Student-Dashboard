"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type ApiTicketDetail, type TicketStatus, type TicketSummary } from "@/lib/api";
import styles from "./AdminWorkflows.module.css";

export default function AdminTicketsPanel({ token, spgOnly = false }: { token: string; spgOnly?: boolean }) {
  const [items, setItems] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.adminGetAllTickets(token, page, spgOnly ? "spg_registration" : undefined)
      .then((result) => { if (active) { setItems(result.items); setTotal(result.total); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Tickets could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, page, spgOnly, revision]);

  async function updateStatus(id: string, status: TicketStatus) {
    setSaving(id);
    setError("");
    try {
      await api.adminUpdateTicketStatus(token, id, status);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status could not be updated.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className={styles.panel}>
      <h2>{spgOnly ? "SPG registration requests" : "Member tickets"}</h2>
      <p>
        {spgOnly
          ? "Review the submitted team, choose the group type and approve to create its SPG. Project groups need a proposition PDF."
          : "Review and update requests sent from the dashboard or Discord."}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button>
        </p>
      )}
      {loading && <p>Loading tickets…</p>}
      {!loading && !error && items.length === 0 && (
        <p>No {spgOnly ? "SPG registration requests" : "tickets"} found.</p>
      )}
      {!loading && !error && (
        <div className={styles.list}>
          {items.map((item) => (
            <article key={item.id} className={styles.row}>
              <div>
                <Link href={`/dashboard/tickets/${encodeURIComponent(item.id)}`}>{item.title}</Link>
                <small>{item.category.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</small>
              </div>
              {!spgOnly && item.category !== "spg_registration" && (
                <label>
                  Status
                  <select
                    aria-label={`Status for ${item.title}`}
                    value={item.status}
                    disabled={saving === item.id}
                    onChange={(event) => void updateStatus(item.id, event.target.value as TicketStatus)}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
              )}
              {item.category === "spg_registration" && <AdminSpgReview item={item} token={token} onUpdated={() => setRevision((value) => value + 1)} />}
            </article>
          ))}
        </div>
      )}
      {!loading && !error && total > 20 && (
        <div className={styles.pager}>
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>{page} / {Math.ceil(total / 20)}</span>
          <button type="button" disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

function AdminSpgReview({ item, token, onUpdated }: { item: TicketSummary; token: string; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ApiTicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [track, setTrack] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [proposition, setProposition] = useState<File | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function toggle() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (detail) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.ticketDetail(token, item.id);
      setDetail(result);
      const submittedTrack = result.fields?.track;
      if (typeof submittedTrack === "string" && ["kaggle", "product", "research", "general"].includes(submittedTrack)) setTrack(submittedTrack);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || !track || (type === "project" && !proposition)) return;
    setBusy(true);
    setError("");
    try {
      await api.adminApproveSpgTicket(token, item.id, { type, track, visibility: type === "event" ? "public" : visibility, proposition: type === "project" ? proposition : null });
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) { setError("Enter a reason before rejecting this registration."); return; }
    setBusy(true);
    setError("");
    try {
      await api.adminUpdateTicketStatus(token, item.id, "closed", rejectReason.trim());
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rejection failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.review}>
    {item.spg_id ? <Link href={`/dashboard/spg/${encodeURIComponent(item.spg_id)}`}>Open SPG →</Link> : <button type="button" onClick={() => void toggle()} aria-expanded={expanded}>{expanded ? "Hide review" : "Review request"}</button>}
    {expanded && <div className={styles.reviewDetails}>
      {loading && <p>Loading registration…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {detail && <>
        {detail.description && <p>{detail.description}</p>}
        <dl>{Object.entries(detail.fields || {}).filter(([key]) => !["Team Leader", "Team Members", "Team Leader UID", "Team Member UIDs", "Duration (Days)", "Report Frequency (Days)", "Project Name & Track"].includes(key)).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{Array.isArray(value) ? value.join(", ") || "None" : String(value ?? "—")}</dd></div>)}</dl>
        {item.status !== "closed" && item.status !== "resolved" && <>
          <form className={styles.reviewForm} onSubmit={(event) => void approve(event)}>
            <label>Group type<select required value={type} onChange={(event) => setType(event.target.value)}><option value="">Choose type</option><option value="learning">Learning</option><option value="project">Project</option><option value="event">Club event</option><option value="external_event">External event or competition</option><option value="miscellaneous">Other group</option></select></label>
            <label>Track<select required value={track} onChange={(event) => setTrack(event.target.value)}><option value="">Choose track</option><option value="kaggle">Kaggle</option><option value="product">Product</option><option value="research">Research</option><option value="general">General</option></select></label>
            <label>Visibility<select value={type === "event" ? "public" : visibility} disabled={type === "event"} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public</option></select></label>
            {type === "project" && <label>Proposition PDF (max 10 MB)<input type="file" accept="application/pdf,.pdf" required onChange={(event) => setProposition(event.target.files?.[0] || null)} /></label>}
            <button type="submit" disabled={busy || !type || !track || (type === "project" && !proposition)}>{busy ? "Saving…" : "Approve and create SPG"}</button>
          </form>
          <div className={styles.reject}><label>Reason for rejection<input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Tell the member what needs changing" /></label><button type="button" disabled={busy || !rejectReason.trim()} onClick={() => void reject()}>Reject request</button></div>
        </>}
        {item.status === "closed" && <p>Closed: {detail.close_reason || "No reason recorded."}</p>}
      </>}
    </div>}
  </div>;
}
