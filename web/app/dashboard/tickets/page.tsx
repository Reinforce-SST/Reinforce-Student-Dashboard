"use client";
import Link from "next/link";
import { useTickets } from "@/lib/useMember";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/api";
import styles from "@/components/dashboard/MemberContent.module.css";

export default function TicketsPage() {
  const { data, error, retry } = useTickets();
  return <div className={styles.page}><div className={styles.intro}><p className={styles.eyebrow}>Discord activity</p><h1 className={styles.title}>Your tickets</h1><p className={styles.muted}>View your latest 100 requests. Create tickets and reply through YUVI in the club Discord. Confidential reports stay in Discord.</p></div>
    <section className={styles.card} aria-label="Your ticket list">
      {error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={retry}>Retry</button></div> : !data ? <p role="status">Loading your tickets…</p> : !data.linked ? <><h2>Verify your Discord account</h2><p className={styles.muted}>Run <code>/auth</code> in the club Discord and open the private link. This proves the tickets belong to you.</p></> : data.tickets.length === 0 ? <><h2>No tickets yet</h2><p className={styles.muted}>Your requests will appear here after you create them with YUVI in Discord.</p></> : <ul className={styles.list}>{data.tickets.map(ticket => <li key={ticket.id}><Link href={`/dashboard/tickets/${encodeURIComponent(ticket.id)}`} className={styles.row}><div><strong>{ticket.title}</strong><span className={styles.muted}>{CATEGORY_LABEL[ticket.category]}</span></div><span className={styles.badge}>{STATUS_LABEL[ticket.status]}</span></Link></li>)}</ul>}
    </section>
  </div>;
}
