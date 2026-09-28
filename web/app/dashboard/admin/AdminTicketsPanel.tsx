"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type TicketStatus, type TicketSummary } from "@/lib/api";
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
          ? "Review registration details here. Creating or changing the SPG is a separate admin step."
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
