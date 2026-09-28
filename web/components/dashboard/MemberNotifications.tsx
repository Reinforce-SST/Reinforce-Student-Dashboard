"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ContributionRecord } from "@/lib/contributionData";
import { memberUpdates, upcomingEventNotices, type MemberNotification } from "@/lib/notifications";
import { useMember } from "@/lib/useMember";
import MemberIcon from "./MemberIcon";
import styles from "./MemberNotifications.module.css";

type Feed = {
  identity: string;
  updates: MemberNotification[];
  events: MemberNotification[];
  failures: number;
};

const timestampFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

function NoticeList({ items, onNavigate }: { items: MemberNotification[]; onNavigate: () => void }) {
  return <ul className={styles.list}>{items.map(item => <li key={item.key}>
    <Link href={item.href} onClick={onNavigate}>
      <span className={styles.noticeTitle}>{item.title}</span>
      <span className={styles.noticeDescription}>{item.description}</span>
      <time dateTime={item.timestamp}>{timestampFormat.format(new Date(item.timestamp))}</time>
    </Link>
  </li>)}</ul>;
}

export default function MemberNotifications() {
  const { token, profile } = useMember();
  const identity = profile.id;
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [seen, setSeen] = useState<{ identity: string; keys: string[] } | null>(null);

  useEffect(() => {
    const key = `reinforce:notification-seen:v1:${identity}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeen({ identity, keys: Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [] });
    } catch {
      setSeen({ identity, keys: [] });
    }
  }, [identity]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [tickets, contributions, events] = await Promise.allSettled([
        api.myTickets(token),
        api.getMyContributions<ContributionRecord>(token, 50),
        api.listEvents(token, { timeline: "upcoming", limit: 100 }),
      ]);
      if (!active) return;
      setFeed({
        identity,
        updates: memberUpdates(
          tickets.status === "fulfilled" ? tickets.value : [],
          contributions.status === "fulfilled" ? contributions.value.items : [],
        ),
        events: upcomingEventNotices(events.status === "fulfilled" ? events.value.events : [], new Date()),
        failures: [tickets, contributions, events].filter(result => result.status === "rejected").length,
      });
    };
    void load();
    return () => { active = false; };
  }, [token, identity, attempt]);

  useEffect(() => {
    if (!open || !feed || feed.identity !== identity || seen?.identity !== identity) return;
    const fresh = feed.updates.map(item => item.key).filter(key => !seen.keys.includes(key));
    if (fresh.length === 0) return;
    const keys = [...new Set([...seen.keys, ...fresh])].slice(-200);
    setSeen({ identity, keys });
    try { localStorage.setItem(`reinforce:notification-seen:v1:${identity}`, JSON.stringify(keys)); } catch { /* Reading the panel still works without storage. */ }
  }, [open, feed, seen, identity]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const refreshOnFocus = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  const current = feed?.identity === identity ? feed : null;
  const unread = current && seen?.identity === identity
    ? current.updates.filter(item => !seen.keys.includes(item.key)).length : 0;

  return <div className={styles.wrap} ref={container}>
    <button type="button" className={styles.trigger} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={open} aria-controls="member-notifications" onClick={() => { setOpen(value => !value); if (!open) setAttempt(value => value + 1); }}>
      <MemberIcon name="bell" size={19} />
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <section className={styles.panel} id="member-notifications" aria-label="Notifications">
      <header className={styles.panelHeader}><div><span className={styles.eyebrow}>Your activity</span><h2>Notifications</h2></div><button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close notifications"><MemberIcon name="close" size={18} /></button></header>
      {!current ? <p className={styles.message} role="status">Loading updates…</p> : <>
        {current.failures > 0 && <p className={styles.warning} role="alert">{current.failures === 3 ? "Updates could not load." : "Some updates could not load."} <button type="button" onClick={() => { setFeed(null); setAttempt(value => value + 1); }}>Retry</button></p>}
        {current.updates.length > 0 && <div className={styles.group}><h3>Ticket &amp; contribution updates</h3><NoticeList items={current.updates} onNavigate={() => setOpen(false)} /></div>}
        {current.events.length > 0 && <div className={styles.group}><h3>Coming up this week</h3><NoticeList items={current.events} onNavigate={() => setOpen(false)} /></div>}
        {current.failures === 0 && current.updates.length === 0 && current.events.length === 0 && <p className={styles.message}>No updates yet. New ticket decisions, contribution reviews, and upcoming events will appear here.</p>}
      </>}
    </section>}
  </div>;
}
