"use client";
import Link from "next/link";
import { useMember, useTickets } from "@/lib/useMember";
import TicketList from "@/components/dashboard/TicketList";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "@/components/dashboard/MemberContent.module.css";

export default function DashboardClient() {
  const { profile } = useMember();
  const { data, error, retry } = useTickets();
  const initials = profile.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  return <div className={styles.page}>
    <div className={styles.intro}><h1 className={styles.title}>Welcome, {profile.full_name}.</h1><p className={styles.muted}>Your requests and club account, in one place.</p></div>
    {!profile.is_verified && <section className={styles.notice}><div><h2>Connect your Discord account</h2><p>Run <code>/auth</code> in the club Discord and follow your private link. Your tickets will appear here once you are verified.</p></div><Link className={styles.textLink} href="/profile">Account details</Link></section>}
    <div className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.section} aria-labelledby="recent-tickets"><div className={styles.sectionHead}><h2 id="recent-tickets">Recent tickets</h2><Link className={styles.textLink} href="/dashboard/tickets">All tickets</Link></div>
          {error ? <div role="alert" className={styles.empty}><p>{error}</p><div className={styles.actions}><button className={styles.button} onClick={retry}>Retry</button></div></div> : !data ? <p role="status" className={styles.empty}>Loading your tickets…</p> : !data.linked ? <div className={styles.empty}><h3>Your tickets start in Discord</h3><p>Verify your account with <code>/auth</code> to view the requests you create with YUVI.</p></div> : data.tickets.length === 0 ? <div className={styles.empty}><h3>No tickets yet</h3><p>Need resources, project support or help from the club? Create a ticket with YUVI in Discord, then follow its progress here.</p></div> : <TicketList tickets={data.tickets.slice(0, 5)} />}
        </section>
        <section className={styles.section} aria-labelledby="explore-club"><div className={styles.sectionHead}><h2 id="explore-club">Find your next project</h2></div><div className={styles.explore}>
          <Link href="/tracks"><h3>Explore the tracks<MemberIcon name="external" /></h3><p>Choose a direction: build a product, enter a competition or explore research.</p></Link>
          <Link href="/projects"><h3>See what we’re building<MemberIcon name="external" /></h3><p>Browse the club’s public projects and find work you can contribute to.</p></Link>
        </div></section>
      </div>
      <aside className={[styles.card, styles.account].join(" ")} aria-label="Your club account"><h2>Your club account</h2><div className={styles.avatar} aria-hidden="true">{initials}</div><p className={styles.accountName}>{profile.full_name}</p><p className={styles.accountEmail}>{profile.email}</p><p className={styles.accountStatus}>{profile.is_verified ? "Discord identity verified" : "Discord not verified"}</p><p className={styles.accountHint}>{profile.is_verified ? "Missing a Discord role? Run /auth again in the club server." : "Connect Discord to see your tickets."}</p><Link className={styles.textLink} href="/profile">Edit your profile</Link></aside>
    </div>
  </div>;
}
