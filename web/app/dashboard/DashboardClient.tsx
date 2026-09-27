"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api, type EventSummaryItem } from "@/lib/api";
import { getDashboardEvents, indiaDateKey, indiaDateParts } from "@/lib/dashboardData";
import { loadAllSpgs, loadAllUpcomingEvents } from "@/lib/memberData";
import type { SPGRecord } from "@/lib/spgData";
import type { ContributionRecord } from "@/lib/contributionData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "@/components/dashboard/OverviewDashboard.module.css";

type LoadStatus = "loading" | "ready" | "error";

type FeaturedBanner = {
  id: string;
  badge: string;
  date: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  imageSrc: string;
};

const fallbackBanner: FeaturedBanner = {
  id: "club-overview",
  badge: "REINFORCE CLUB",
  date: "UPCOMING SESSIONS & GRANTS",
  title: "Reinforce AI/ML Student Hub",
  description: "Explore Student Project Groups, published club events, and technical workshops.",
  ctaText: "Explore Events →",
  ctaLink: "/dashboard/events",
  imageSrc: "/banners/reinforce-placeholder.png",
};

function eventLink(event: EventSummaryItem) {
  return `/dashboard/events/${event.slug || event.id}`;
}

function eventDate(event: EventSummaryItem) {
  return new Date(event.schedule.start_time);
}

function eventMeta(event: EventSummaryItem) {
  const time = eventDate(event).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit",
  });
  const venue = event.venue_info?.venue_name || event.venue_info?.room ||
    (event.format === "online" ? "Online" : event.format === "offline" ? "In person" : "");
  return venue ? `${time} · ${venue}` : time;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function DashboardClient() {
  const { token, profile } = useMember();
  const [spgs, setSpgs] = useState<SPGRecord[]>([]);
  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [contributionsComplete, setContributionsComplete] = useState(false);
  const [spgStatus, setSpgStatus] = useState<LoadStatus>("loading");
  const [eventStatus, setEventStatus] = useState<LoadStatus>("loading");
  const [contributionStatus, setContributionStatus] = useState<LoadStatus>("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSpgStatus("loading");
      setEventStatus("loading");
      setContributionStatus("loading");
      const results = await Promise.allSettled([
        loadAllSpgs(token),
        loadAllUpcomingEvents(token),
        profile.id ? api.getUserContributions(token, profile.id, 100) : Promise.reject(new Error("Missing member ID")),
      ]);
      if (!active) return;
      const [spgResult, eventResult, contributionResult] = results;
      if (spgResult.status === "fulfilled") {
        setSpgs(spgResult.value);
        setSpgStatus("ready");
      } else {
        setSpgStatus("error");
      }
      if (eventResult.status === "fulfilled") {
        setEvents(eventResult.value);
        setEventStatus("ready");
      } else {
        setEventStatus("error");
      }
      if (contributionResult.status === "fulfilled") {
        setContributions(contributionResult.value.items.filter((record) => record.status === "approved"));
        setContributionsComplete(!contributionResult.value.next_cursor);
        setContributionStatus("ready");
      } else {
        setContributionStatus("error");
      }
    };
    void load();
    return () => { active = false; };
  }, [token, profile.id, retryCount]);

  const now = new Date();
  const memberSpgs = spgs.filter((spg) =>
    (spg.status === "active" || spg.status === "paused") &&
    (spg.lead_id === profile.id || spg.member_ids.includes(profile.id || "")));
  const { banners, upcoming } = getDashboardEvents(events, now);
  const slides: FeaturedBanner[] = banners.length > 0 ? banners.map((event) => ({
    id: event.id,
    badge: event.event_type.toUpperCase(),
    date: eventDate(event).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }),
    title: event.title,
    description: event.description,
    ctaText: "Explore Event →",
    ctaLink: eventLink(event),
    imageSrc: event.banner_url || "/banners/reinforce-placeholder.png",
  })) : [fallbackBanner];
  const activeSlide = slides[slideIndex % slides.length];

  useEffect(() => {
    if (isPaused || slides.length < 2) return;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % slides.length), 8000);
    return () => window.clearInterval(timer);
  }, [isPaused, slides.length]);

  const today = indiaDateParts(now);
  const firstOfMonth = new Date(Date.UTC(today.year, today.month - 1 + monthOffset, 1));
  const calendarYear = firstOfMonth.getUTCFullYear();
  const calendarMonth = firstOfMonth.getUTCMonth();
  const dayCount = new Date(Date.UTC(calendarYear, calendarMonth + 1, 0)).getUTCDate();
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const selectedDateKey = selectedDay === null ? null : `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
  const selectedEvents = selectedDateKey ? upcoming.filter((event) => indiaDateKey(eventDate(event)) === selectedDateKey) : [];
  const eventDays = new Set(upcoming.filter((event) => {
    const parts = indiaDateParts(eventDate(event));
    return parts.year === calendarYear && parts.month === calendarMonth + 1;
  }).map((event) => indiaDateParts(eventDate(event)).day));

  const recentContributions = contributions.slice(0, 3);
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getTime() - (6 - index) * 86_400_000);
    const key = indiaDateKey(day);
    return contributions.filter((record) => {
      const recorded = new Date(record.reviewed_at || record.created_at);
      return Number.isFinite(recorded.getTime()) && indiaDateKey(recorded) === key;
    }).length;
  });
  const showActivity = contributionsComplete && contributions.length >= 3 && lastSevenDays.some(Boolean);
  const maxActivity = Math.max(1, ...lastSevenDays);

  const retry = () => setRetryCount((count) => count + 1);

  return <div className={styles.dashboard}>
    <div className={styles.intro}>
      <div><h2>Your club workspace</h2><p>Projects, events, and contribution activity in one view.</p></div>
      <Link href="/profile" className={styles.textLink}>View profile</Link>
    </div>
    <div className={styles.overviewContainer}>
      <div className={styles.leftColumn}>
        <section className={styles.heroBanner} aria-label="Featured club announcement" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
          <div className={styles.bannerSlide} key={activeSlide.id}>
            <div className={styles.heroContent}>
              <div><div className={styles.heroTopRow}><span className={styles.eventBadge}>{activeSlide.badge}</span><span className={styles.eventDate}>{activeSlide.date}</span></div><h2 className={styles.heroTitle}>{activeSlide.title}</h2><p className={styles.heroDescription}>{activeSlide.description}</p></div>
              <Link href={activeSlide.ctaLink} className={styles.heroCtaBtn}>{activeSlide.ctaText}</Link>
            </div>
            <div className={styles.heroCoverRight}><img src={activeSlide.imageSrc} alt="" className={styles.coverImage} onError={(event) => { const image = event.currentTarget; if (!image.src.endsWith("/banners/reinforce-placeholder.png")) image.src = "/banners/reinforce-placeholder.png"; }} /></div>
          </div>
          {slides.length > 1 && <><div className={styles.heroNavArrows}><button type="button" onClick={() => setSlideIndex((index) => (index - 1 + slides.length) % slides.length)} aria-label="Previous featured event"><MemberIcon name="chevron-left" size={16} /></button><button type="button" onClick={() => setSlideIndex((index) => (index + 1) % slides.length)} aria-label="Next featured event"><MemberIcon name="chevron-right" size={16} /></button></div><div className={styles.dotsRow}>{slides.map((slide, index) => <button type="button" key={slide.id} aria-label={`Go to featured slide ${index + 1}`} aria-current={slideIndex === index ? "true" : undefined} className={slideIndex === index ? styles.dotActive : styles.dot} onClick={() => setSlideIndex(index)} />)}</div></>}
        </section>

        <section className={styles.metrics} aria-label="Activity summary">
          <div className={styles.metric}><strong>{spgStatus === "ready" ? memberSpgs.filter((spg) => spg.status === "active").length : "—"}</strong><span><b>Active SPGs</b><small>From your membership</small></span></div>
          <div className={styles.metric}><strong>{eventStatus === "ready" ? upcoming.length : "—"}</strong><span><b>Upcoming events</b><small>Published by the club</small></span></div>
          <div className={styles.metric}><strong>{profile.points?.total ?? 0}</strong><span><b>Merit points</b><small>From your member profile</small></span></div>
        </section>

        <section className={styles.projectSection} aria-labelledby="project-heading">
          <div className={styles.sectionHeader}><h2 id="project-heading">Current projects (SPG)</h2><Link href="/dashboard/spg" className={styles.textLink}>View all groups ↗</Link></div>
          {spgStatus === "loading" && <p className={styles.stateText}>Loading project groups…</p>}
          {spgStatus === "error" && <p className={styles.stateText} role="alert">Project groups could not be loaded. <button type="button" onClick={retry}>Retry</button></p>}
          {spgStatus === "ready" && memberSpgs.length === 0 && <div className={styles.projectEmpty}><span className={styles.emptyIcon}><MemberIcon name="spg" size={24} /></span><div><h3>No active project group yet</h3><p>When you join an SPG, its status and next action appear here. Browse groups to find work that fits your track.</p><Link href="/dashboard/spg" className={styles.textLink}>Explore SPGs ↗</Link></div></div>}
          {spgStatus === "ready" && memberSpgs.length > 0 && <div className={`${styles.projectList} ${memberSpgs.length === 1 ? styles.singleProject : ""}`}>{memberSpgs.slice(0, 2).map((spg) => {
            const names = Object.values(spg.member_names || {});
            return <article className={styles.projectCard} key={spg.id}><div className={styles.projectTop}><span className={styles.trackPill}>{spg.track} track</span><span className={styles.projectStatus}>{spg.status === "paused" ? "Paused" : "Active"}</span></div><h3>{spg.name}</h3><p>{spg.description || "No description provided."}</p><div className={styles.projectFooter}><div className={styles.avatars}>{names.slice(0, 3).map((name, index) => <span key={`${name}-${index}`} title={name}>{initials(name)}</span>)}{spg.member_ids.length > names.slice(0, 3).length && <span>+{spg.member_ids.length - names.slice(0, 3).length}</span>}</div><div className={styles.reportAction}><small>{spg.report_count} reports filed</small><Link href={`/dashboard/spg/${spg.id}`}>Submit Report</Link></div></div></article>;
          })}</div>}
        </section>
      </div>

      <div className={styles.rightColumn}>
        <section className={styles.widgetCard} aria-labelledby="upcoming-events-heading">
          <div className={styles.widgetHeader}><h2 id="upcoming-events-heading"><MemberIcon name="lightning" size={18} />Upcoming Events</h2><Link href="/dashboard/events" className={styles.textLink}>View all →</Link></div>
          {eventStatus === "loading" && <p className={styles.stateText}>Loading upcoming events…</p>}
          {eventStatus === "error" && <p className={styles.stateText} role="alert">Events could not be loaded. <button type="button" onClick={retry}>Retry</button></p>}
          {eventStatus === "ready" && upcoming.length === 0 && <p className={styles.emptyEvents}>No upcoming club events scheduled.</p>}
          {eventStatus === "ready" && upcoming.length > 0 && <div className={styles.eventsList}>{upcoming.slice(0, 4).map((event) => {
            const parts = indiaDateParts(eventDate(event));
            const month = eventDate(event).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short" });
            return <Link href={eventLink(event)} className={styles.eventItem} key={event.id}><span className={styles.eventDateBox}><small>{month}</small><b>{parts.day}</b></span><span className={styles.eventDetails}><strong>{event.title}</strong><small>{eventMeta(event)}</small></span><span aria-hidden="true" className={styles.eventArrow}>↗</span></Link>;
          })}</div>}
          <Link href="/dashboard/events" className={styles.eventsFooter}>View Event Calendar →</Link>
        </section>

        <section className={styles.calendarCard} aria-labelledby="calendar-heading">
          <div className={styles.widgetHeader}><h2 id="calendar-heading"><MemberIcon name="events" size={17} />{firstOfMonth.toLocaleString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" })}</h2><div className={styles.calendarNav}><button type="button" aria-label="Previous month" onClick={() => { setMonthOffset((value) => value - 1); setSelectedDay(null); }}><MemberIcon name="chevron-left" size={14} /></button><button type="button" aria-label="Next month" onClick={() => { setMonthOffset((value) => value + 1); setSelectedDay(null); }}><MemberIcon name="chevron-right" size={14} /></button></div></div>
          <div className={styles.weekdaysGrid} aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
          <div className={styles.daysGrid}>{Array.from({ length: mondayOffset }, (_, index) => <span key={`blank-${index}`} />)}{days.map((day) => {
            const selected = selectedDay === day;
            const todayCell = selectedDay === null && monthOffset === 0 && today.day === day;
            const hasEvent = eventDays.has(day);
            return <button type="button" key={day} className={`${styles.dayCell} ${selected || todayCell ? styles.dayActive : ""} ${hasEvent ? styles.dayEvent : ""}`} onClick={() => setSelectedDay(day)} aria-label={`${firstOfMonth.toLocaleString("en-IN", { timeZone: "UTC", month: "long" })} ${day}, ${calendarYear}${hasEvent ? ", event scheduled" : ""}`} aria-pressed={selected}>{day}{hasEvent && <span className={styles.dayDot} />}</button>;
          })}</div>
          {selectedDay !== null && <div className={styles.selectedEvents}><strong>{selectedDay} {firstOfMonth.toLocaleString("en-IN", { timeZone: "UTC", month: "short" })}</strong>{selectedEvents.length > 0 ? selectedEvents.map((event) => <Link href={eventLink(event)} key={event.id}>{event.title} ↗</Link>) : <span>No published events on this date.</span>}</div>}
        </section>

        <section className={styles.contributionCard} aria-labelledby="contribution-heading">
          <div className={styles.sectionHeader}><h2 id="contribution-heading">Your contributions</h2><Link href="/profile" className={styles.textLink}>View history ↗</Link></div>
          <div className={styles.contributionScore}><strong>{profile.points?.total ?? 0}</strong><span>approved points</span></div>
          {contributionStatus === "loading" && <p className={styles.stateText}>Loading contributions…</p>}
          {contributionStatus === "error" && <p className={styles.stateText} role="alert">Contribution history could not be loaded. <button type="button" onClick={retry}>Retry</button></p>}
          {contributionStatus === "ready" && recentContributions.length === 0 && <p className={styles.contributionEmpty}>Recent approved contributions will appear here.</p>}
          {contributionStatus === "ready" && recentContributions.length > 0 && <div className={styles.contributionList}>{recentContributions.map((record) => <div className={styles.contributionItem} key={record.id}><span title={record.title}>{record.title}</span><b>+{record.points}</b></div>)}</div>}
          {showActivity && <div className={styles.activityChart} aria-label="Approved contributions in the last seven days"><span>Last 7 days</span><div>{lastSevenDays.map((count, index) => <i key={index} style={{ height: `${Math.max(8, count / maxActivity * 100)}%` }} title={`${count} approved contributions`} />)}</div></div>}
          <Link href="/dashboard/leaderboard" className={styles.contributionFooter}>Open leaderboard ↗</Link>
        </section>
      </div>
    </div>
  </div>;
}
