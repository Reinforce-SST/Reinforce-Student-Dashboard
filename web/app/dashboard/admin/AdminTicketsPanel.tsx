"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type AdminTicketFilters, type ApiTicketDetail, type TicketCategory, type TicketPriority, type TicketStatus, type TicketSummary } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import PaginationBar from "@/components/dashboard/PaginationBar";
import LoadingBar from "@/components/dashboard/LoadingBar";
import styles from "./AdminWorkflows.module.css";

const CATEGORY_OPTIONS: [TicketCategory, string][] = [
  ["support", "Support"],
  ["resource_request", "Resource request"],
  ["compute_resource_request", "Compute request"],
  ["learning_resource_request", "Learning resource request"],
  ["idea_jar", "Idea jar"],
  ["feedback", "Feedback"],
  ["report", "Report"],
  ["misc", "Other"],
];
const STATUS_OPTIONS: [TicketStatus, string][] = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];
const PRIORITY_OPTIONS: [TicketPriority, string][] = [
  ["urgent", "Urgent"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

export default function AdminTicketsPanel({ token, adminId, spgOnly = false }: { token: string; adminId?: string; spgOnly?: boolean }) {
  const [items, setItems] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [filters, setFilters] = useState<AdminTicketFilters>({});
  const filtered = Object.values(filters).some(Boolean);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // The SPG view is pinned to one category; the console filters are not shown there.
    const query: AdminTicketFilters = spgOnly ? { category: "spg_registration" } : filters;
    api.adminGetAllTickets(token, page, query)
      .then((result) => { if (active) { setItems(result.items); setTotal(result.total); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Tickets could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, page, spgOnly, revision, filters]);

  // A narrower filter can have fewer pages than the one before it. Staying on
  // page 3 of a one-page result shows an empty list that looks like "no match".
  function applyFilter(next: AdminTicketFilters) {
    setFilters(next);
    setPage(1);
  }

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
    <section className={`${styles.panel} ${spgOnly ? styles.spgPanel : ""}`}>
      <LoadingBar loading={loading} />
      <h2>{spgOnly ? "SPG registration requests" : "Member tickets"}</h2>
      <p>
        {spgOnly
          ? "Check each request, then create the group or return it with a reason."
          : "Review and update requests sent from the dashboard or Discord."}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button>
        </p>
      )}
      {!spgOnly && (
        <div className={styles.filterBar} role="group" aria-label="Ticket filters">
          <label>
            Category
            <select
              aria-label="Filter by category"
              value={filters.category ?? ""}
              onChange={(event) => applyFilter({ ...filters, category: (event.target.value || undefined) as TicketCategory | undefined })}
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Filter by status"
              value={filters.status ?? ""}
              onChange={(event) => applyFilter({ ...filters, status: (event.target.value || undefined) as TicketStatus | undefined })}
            >
              <option value="">Any status</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="Filter by priority"
              value={filters.priority ?? ""}
              onChange={(event) => applyFilter({ ...filters, priority: (event.target.value || undefined) as TicketPriority | undefined })}
            >
              <option value="">Any priority</option>
              {PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {adminId && (
            <label className={styles.filterCheck}>
              <input
                type="checkbox"
                checked={filters.assignedTo === adminId}
                onChange={(event) => applyFilter({ ...filters, assignedTo: event.target.checked ? adminId : undefined })}
              />
              Assigned to me
            </label>
          )}
          <button type="button" className={styles.filterClear} disabled={!filtered} onClick={() => applyFilter({})}>
            Clear filters
          </button>
        </div>
      )}
      {loading && items.length === 0 && <p>Loading tickets…</p>}
      {!loading && !error && items.length === 0 && (
        <p>
          {filtered
            ? "No tickets match these filters."
            : `No ${spgOnly ? "SPG registration requests" : "tickets"} found.`}
        </p>
      )}
      {!loading && !error && (
        <div className={styles.list}>
          {items.map((item) => item.category === "spg_registration" ? (
            <AdminSpgReview key={item.id} item={item} token={token} onUpdated={() => setRevision((value) => value + 1)} />
          ) : (
            <article key={item.id} className={styles.row}>
              <div><Link href={`/dashboard/tickets/${encodeURIComponent(item.id)}`}>{item.title}</Link><small>{item.category.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}{item.priority ? ` · ${item.priority} priority` : ""}</small></div>
              {!spgOnly && (
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
            </article>
          ))}
        </div>
      )}
      {!error && (
        <PaginationBar
          currentPage={page}
          totalItems={total}
          pageSize={20}
          onPageChange={setPage}
          itemLabel={spgOnly ? "requests" : "tickets"}
          disabled={loading}
        />
      )}
    </section>
  );
}

function fieldText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function memberNames(value: unknown): string {
  return fieldText(value).replace(/\s+\([^()]+\)/g, "");
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
  const [showReject, setShowReject] = useState(false);

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

  const fields = detail?.fields ?? {};
  const submittedTrack = fieldText(fields.track);
  const trackLabel = fieldText(fields.Track) || (submittedTrack ? `${submittedTrack[0].toUpperCase()}${submittedTrack.slice(1)} track` : "Not specified");
  const leader = memberNames(fields["Team Leader"]) || fieldText(fields.leader_uid) || "Not specified";
  const namedMembers = memberNames(fields["Team Members"]);
  const memberCount = Array.isArray(fields.member_uids) ? fields.member_uids.length : 0;
  const members = namedMembers && namedMembers.toLowerCase() !== "none" ? namedMembers : memberCount ? `${memberCount} additional member${memberCount === 1 ? "" : "s"}` : "No additional members";
  const duration = fieldText(fields.duration_days || fields["Duration (Days)"]);
  const frequency = fieldText(fields.frequency_days || fields["Report Frequency (Days)"]);
  const goals = fieldText(fields["Summary & Goals"]);
  const note = fieldText(detail?.description);
  const hasSubmittedTrack = ["kaggle", "product", "research", "general"].includes(submittedTrack);

  return <article className={styles.spgCard} data-status={item.status}>
    <header className={styles.spgCardHeader}>
      <div className={styles.spgCardHeading}>
        <div className={styles.spgCardMeta}><span>SPG registration</span><span className={styles.statusPill}>{item.status.replaceAll("_", " ")}</span></div>
        <h3>{item.title.replace(/^SPG:\s*/i, "")}</h3>
      </div>
      <button type="button" className={styles.reviewToggle} onClick={() => void toggle()} aria-expanded={expanded} aria-controls={`spg-review-${item.id}`}>
        {expanded ? "Hide details" : item.status === "open" || item.status === "in_progress" ? "Review request" : "View details"}
        <MemberIcon name="chevron-right" size={16} />
      </button>
    </header>
    {expanded && <div className={styles.spgCardBody} id={`spg-review-${item.id}`}>
      {loading && <p className={styles.loadingText}>Loading registration…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {detail && <>
        <div className={styles.reviewSectionHeading}><h4>Request details</h4><Link href={`/dashboard/tickets/${encodeURIComponent(item.id)}`}>View full ticket ↗</Link></div>
        {note && !/^Project group:/i.test(note) && <p className={styles.requestNote}>{note}</p>}
        <div className={styles.requestFacts}>
          <div><span>Submitted track</span><strong>{trackLabel}</strong></div>
          <div><span>Team leader</span><strong>{leader}</strong></div>
          <div className={styles.wideFact}><span>Other members</span><strong>{members}</strong></div>
          {(duration || frequency) && <div className={styles.wideFact}><span>Plan</span><strong>{[duration && `${duration} days`, frequency && `report every ${frequency} days`].filter(Boolean).join(" · ")}</strong></div>}
        </div>
        {goals && <div className={styles.goals}><span>Summary &amp; goals</span><p>{goals}</p></div>}
        {item.spg_id && <Link href={`/dashboard/spg/${encodeURIComponent(item.spg_id)}`} className={styles.createdGroupLink}>Open created SPG →</Link>}
        {!item.spg_id && item.status !== "closed" && item.status !== "resolved" && <section className={styles.decisionSection} aria-label="Registration decision">
          <h4>{showReject ? "Return this request" : "Create the group"}</h4>
          <p>{showReject ? "Give the member a clear reason so they can correct the request." : "Approval creates an active SPG and resolves this ticket."}</p>
          {!showReject ? <>
            <form className={styles.reviewForm} onSubmit={(event) => void approve(event)}>
              <label>Group type<select required value={type} onChange={(event) => { setType(event.target.value); setProposition(null); }}><option value="">Choose group type</option><option value="learning">Learning</option><option value="project">Project</option><option value="event">Club event</option><option value="external_event">External event or competition</option><option value="miscellaneous">Other group</option></select></label>
              {!hasSubmittedTrack && <label>Track<select required value={track} onChange={(event) => setTrack(event.target.value)}><option value="">Choose track</option><option value="kaggle">Kaggle</option><option value="product">Product</option><option value="research">Research</option><option value="general">General</option></select></label>}
              <label>Visibility<select value={type === "event" ? "public" : visibility} disabled={type === "event"} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public</option></select></label>
              {type === "project" && <label className={styles.fileField}>Proposition PDF <span>Required for project groups · max 10 MB</span><input type="file" accept="application/pdf,.pdf" required onChange={(event) => setProposition(event.target.files?.[0] || null)} /></label>}
              <button className={styles.approveButton} type="submit" disabled={busy || !type || !track || (type === "project" && !proposition)}>{busy ? "Creating group…" : "Approve and create SPG"}</button>
            </form>
            <button type="button" className={styles.rejectToggle} onClick={() => { setProposition(null); setShowReject(true); }}>Reject request instead</button>
          </> : <div className={styles.rejectForm}>
            <label>Reason for rejection<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Explain what the member needs to change" rows={3} /></label>
            <div className={styles.rejectActions}><button type="button" onClick={() => setShowReject(false)} disabled={busy}>Back to approval</button><button type="button" disabled={busy || !rejectReason.trim()} onClick={() => void reject()}>{busy ? "Rejecting…" : "Reject request"}</button></div>
          </div>}
        </section>}
        {item.status === "closed" && <div className={styles.closedReason}><strong>Request closed</strong><p>{detail.close_reason || "No reason recorded."}</p></div>}
      </>}
    </div>}
  </article>;
}
