"use client";
import Link from "next/link";
import { useMember, useTickets } from "@/lib/useMember";
import { STATUS_LABEL } from "@/lib/api";
import styles from "@/components/dashboard/MemberContent.module.css";

export default function DashboardClient() {
  const { profile } = useMember();
  const { data, error, retry } = useTickets();
  return <div className={styles.page}>
    <div className={styles.intro}><p className={styles.eyebrow}>Your club, connected</p><h1 className={styles.title}>Welcome, {profile.full_name}.</h1><p className={styles.muted}>Your member profile and requests from Discord, in one place.</p></div>
    <div className={styles.grid}>
      <section className={styles.card}><h2>Your membership</h2><p>{profile.email}</p><p className={styles.muted}>{profile.is_verified ? "Your Discord identity is verified." : "Run /auth in the club Discord to verify your account and view your tickets."}</p><div className={styles.actions}><Link className={styles.button} href="/profile">Edit your profile</Link></div></section>
      <section className={styles.card}><h2>Start something</h2><p className={styles.muted}>Explore the Product, Kaggle and Research tracks. Register a project group or request resources through YUVI in Discord.</p><div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/tracks">Explore tracks</Link><Link className={`${styles.button} ${styles.secondary}`} href="/projects">Club projects</Link></div></section>
    </div>
    <section className={styles.card}><h2>Recent requests</h2>
      {error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={retry}>Retry</button></div> : !data ? <p role="status">Loading your tickets…</p> : !data.linked ? <p className={styles.muted}>Verify your Discord account with <code>/auth</code> to see requests here.</p> : data.tickets.length === 0 ? <p className={styles.muted}>No tickets yet. Requests you create with YUVI in Discord will appear here.</p> : <ul className={styles.list}>{data.tickets.slice(0, 5).map(ticket => <li key={ticket.id}><Link className={styles.row} href={`/dashboard/tickets/${encodeURIComponent(ticket.id)}`}><strong>{ticket.title}</strong><span className={styles.badge}>{STATUS_LABEL[ticket.status]}</span></Link></li>)}</ul>}
      <div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/dashboard/tickets">View your tickets</Link></div>
    </section>
  </div>;
}
