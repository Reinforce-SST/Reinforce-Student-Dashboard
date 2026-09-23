"use client";
import { useState } from "react";
import { useTickets } from "@/lib/useMember";
import TicketList from "@/components/dashboard/TicketList";
import styles from "@/components/dashboard/MemberContent.module.css";

export default function TicketsPage() {
  const { data, error, retry } = useTickets();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const tickets = (data?.tickets ?? []).filter(ticket => {
    const closed = ticket.status === "closed" || ticket.status === "resolved";
    return (filter === "All" || (filter === "Closed" ? closed : !closed)) && ticket.title.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <div className={styles.page}>
    <div className={styles.intro}><h1 className={styles.title}>Your tickets</h1><p className={styles.muted}>Follow your requests here. Create tickets and reply through YUVI in Discord.</p></div>
    <section aria-label="Your ticket list">
      {data?.linked && data.tickets.length > 0 && <div className={styles.toolbar}><div className={styles.filters} role="group" aria-label="Filter tickets">{["All", "Active", "Closed"].map(value => <button key={value} className={styles.filter} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div><label className={styles.search}><span className="sr-only">Search tickets</span><input type="search" className={styles.input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your tickets" /></label></div>}
      {error ? <div role="alert" className={styles.empty}><p>{error}</p><div className={styles.actions}><button className={styles.button} onClick={retry}>Retry</button></div></div> : !data ? <p role="status" className={styles.empty}>Loading your tickets…</p> : !data.linked ? <div className={styles.empty}><h3>Verify your Discord account</h3><p>Run <code>/auth</code> in the club Discord and open the private link to see your requests.</p></div> : data.tickets.length === 0 ? <div className={styles.empty}><h3>No tickets yet</h3><p>Requests you create with YUVI in Discord will appear here. You can ask for resources, register a project group or get help.</p></div> : tickets.length === 0 ? <div className={styles.empty}><h3>No matching tickets</h3><p>Try a different search or show all statuses.</p><button className={styles.textLink} onClick={() => { setQuery(""); setFilter("All"); }}>Clear filters</button></div> : <TicketList tickets={tickets} />}
    </section>
    <p className={styles.muted}>Showing your latest 100 requests. Confidential reports stay in Discord.</p>
  </div>;
}
