"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMember } from "@/lib/useMember";
import { api, type EventSummaryItem, type BannerDocument } from "@/lib/api";
import { appCache } from "@/lib/cache";
import { getDashboardEvents, indiaDateKey, indiaDateParts } from "@/lib/dashboardData";
import { loadAllSpgs, loadAllUpcomingEvents } from "@/lib/memberData";
import type { SPGRecord } from "@/lib/spgData";
import type { ContributionRecord } from "@/lib/contributionData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "@/components/dashboard/OverviewDashboard.module.css";

type LoadStatus = "loading" | "ready" | "error";

type FeaturedBanner = {
  id: string;
  eventId: string;
  categoryBadge: string;
  formatBadge?: string;
  featuredBadge: string;
  title: string;
  description: string;
  dateStr: string;
  venue: string;
  registeredCount: number;
  detailsLink: string;
  statusTag?: string;
  imageSrc: string;
};

function formatBannerDate(date: Date) {
  const weekday = date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).toUpperCase().replace(/\./g, "");
  const day = String(date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit" })).padStart(2, "0");
  const month = date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short" }).toUpperCase().replace(/\./g, "");
  return `${weekday} ${day} ${month}`;
}

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
  const router = useRouter();
  const { token, profile } = useMember();
  const cachedSpgs = appCache.get<SPGRecord[]>("spgs:all:{}");
  const cachedEvents = appCache.get<EventSummaryItem[]>("events:upcoming");
  const cachedContribs = profile.id ? appCache.get<{ items: ContributionRecord[]; next_cursor?: string | null }>(`contribs:user:${profile.id}`) : null;
  const cachedBanners = appCache.get<{ banners: BannerDocument[] }>("banners:list");

  const [spgs, setSpgs] = useState<SPGRecord[]>(() => cachedSpgs?.data || []);
  const [events, setEvents] = useState<EventSummaryItem[]>(() => cachedEvents?.data || []);
  const [dedicatedBanners, setDedicatedBanners] = useState<BannerDocument[]>(() => cachedBanners?.data?.banners || []);
  const [contributions, setContributions] = useState<ContributionRecord[]>(() =>
    cachedContribs?.data?.items?.filter((record) => record.status === "approved") || []
  );
  const [contributionsComplete, setContributionsComplete] = useState(() => Boolean(cachedContribs && !cachedContribs.data?.next_cursor));
  const [spgStatus, setSpgStatus] = useState<LoadStatus>(() => (cachedSpgs ? "ready" : "loading"));
  const [eventStatus, setEventStatus] = useState<LoadStatus>(() => (cachedEvents ? "ready" : "loading"));
  const [contributionStatus, setContributionStatus] = useState<LoadStatus>(() => (cachedContribs ? "ready" : "loading"));
  const [bannerStatus, setBannerStatus] = useState<LoadStatus>(() => (cachedBanners ? "ready" : "loading"));
  const [retryCount, setRetryCount] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);
  const [registeredCountOverrides, setRegisteredCountOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      const force = retryCount > 0;
      if (!cachedSpgs || force) setSpgStatus("loading");
      if (!cachedEvents || force) setEventStatus("loading");
      if (!cachedContribs || force) setContributionStatus("loading");
      if (!cachedBanners || force) setBannerStatus("loading");

      const results = await Promise.allSettled([
        loadAllSpgs(token, undefined, force),
        loadAllUpcomingEvents(token, force),
        profile.id
          ? appCache.fetch(
              `contribs:user:${profile.id}`,
              () => api.getUserContributions(token, profile.id, 100),
              { ttl: 3 * 60 * 1000, tags: ["contributions", "dashboard"], userScope: profile.id, force }
            )
          : Promise.reject(new Error("Missing member ID")),
        appCache.fetch(
          "banners:list",
          () => api.listBanners(token, { limit: 20 }),
          { ttl: 5 * 60 * 1000, tags: ["banners", "dashboard"], force }
        ),
      ]);
      if (!active) return;
      const [spgResult, eventResult, contributionResult, bannerResult] = results;
      if (spgResult.status === "fulfilled") {
        setSpgs(spgResult.value);
        setSpgStatus("ready");
      } else if (!cachedSpgs) {
        setSpgStatus("error");
      }
      if (eventResult.status === "fulfilled") {
        setEvents(eventResult.value);
        setEventStatus("ready");
      } else if (!cachedEvents) {
        setEventStatus("error");
      }
      if (contributionResult.status === "fulfilled") {
        setContributions(contributionResult.value.items.filter((record) => record.status === "approved"));
        setContributionsComplete(!contributionResult.value.next_cursor);
        setContributionStatus("ready");
      } else if (!cachedContribs) {
        setContributionStatus("error");
      }
      if (bannerResult && bannerResult.status === "fulfilled") {
        setDedicatedBanners(bannerResult.value.banners || []);
        setBannerStatus("ready");
      } else {
        setBannerStatus("ready");
      }
    };
    void load();
    return () => { active = false; };
  }, [token, profile.id, retryCount]);

  const now = new Date();
  const nowMs = now.getTime();
  const memberSpgs = spgs.filter((spg) =>
    (spg.status === "active" || spg.status === "paused") &&
    (spg.lead_id === profile.id || spg.member_ids.includes(profile.id || "")));
  const { banners: legacyBanners, upcoming } = getDashboardEvents(events, now);

  const isBannerFutureOrOngoing = (b: BannerDocument) => {
    if (b.status === "archived") return false;
    const start = new Date(b.schedule.start_time).getTime();
    if (!Number.isFinite(start)) return false;
    const end = b.schedule.end_time
      ? new Date(b.schedule.end_time).getTime()
      : start + (b.schedule.duration_minutes ? b.schedule.duration_minutes * 60_000 : 86_400_000);
    return Number.isFinite(end) && end >= nowMs;
  };

  const activeDedicatedBanners = dedicatedBanners.filter(isBannerFutureOrOngoing);
  const bannerCandidates = activeDedicatedBanners.length > 0
    ? []
    : (legacyBanners.length > 0
        ? legacyBanners
        : (upcoming.length > 0 ? upcoming.slice(0, 3) : []));

  const sourceBanners = activeDedicatedBanners.length > 0
    ? activeDedicatedBanners
    : (bannerCandidates.length === 0 && dedicatedBanners.length > 0
        ? dedicatedBanners
        : []);

  const slides: FeaturedBanner[] = sourceBanners.length > 0
    ? sourceBanners.map((b) => {
        const d = new Date(b.schedule.start_time);
        const dateStr = formatBannerDate(d);

        const matchedEvent = events.find((e) =>
          e.id === b.id ||
          e.slug === b.id ||
          (b.banner_cta_url && (b.banner_cta_url.includes(e.id) || (e.slug && b.banner_cta_url.includes(e.slug)))) ||
          e.title.toLowerCase().trim() === b.title.toLowerCase().trim()
        );

        const eventId = matchedEvent ? matchedEvent.id : (
          (b.banner_cta_url && b.banner_cta_url.includes("/events/"))
            ? b.banner_cta_url.split("/events/")[1].split("?")[0].replace(/\/$/, "")
            : ""
        );

        const venue = matchedEvent?.venue_info?.room ||
          matchedEvent?.venue_info?.venue_name ||
          (matchedEvent?.format === "online" || b.description?.toLowerCase().includes("online") ? "ONLINE" : "CLASSROOM");

        const registeredCount = matchedEvent?.stats?.registered_count ?? 0;

        const categoryBadge = (b.banner_badge_text && b.banner_badge_text.toUpperCase() !== "FEATURED")
          ? b.banner_badge_text.toUpperCase()
          : (matchedEvent?.event_type ? matchedEvent.event_type.replace(/[-_]/g, " ").toUpperCase() : "CONTEST");

        const formatBadge = matchedEvent
          ? (matchedEvent.format === "in_person" || matchedEvent.format === "offline" ? "CAMPUS" : (matchedEvent.format || "CAMPUS").toUpperCase())
          : "CAMPUS";

        const startMs = new Date(b.schedule.start_time).getTime();
        const endMs = b.schedule.end_time
          ? new Date(b.schedule.end_time).getTime()
          : (Number.isFinite(startMs) ? startMs + (b.schedule.duration_minutes ? b.schedule.duration_minutes * 60_000 : 86_400_000) : null);

        const isEnded = matchedEvent
          ? (matchedEvent.status === "ended" || matchedEvent.status === "completed" || (endMs !== null && endMs < nowMs))
          : (b.status === "archived" || (endMs !== null && endMs < nowMs));

        const isOngoing = !isEnded && Number.isFinite(startMs) && startMs <= nowMs && (endMs !== null ? endMs >= nowMs : true);

        const statusTag = isEnded
          ? "EVENT ENDED"
          : isOngoing
          ? "HAPPENING NOW"
          : (matchedEvent?.status === "registration_closed" ? "REGISTRATION CLOSED" : "REGISTRATION OPEN");

        const detailsLink = matchedEvent
          ? `/dashboard/events/${matchedEvent.slug || matchedEvent.id}`
          : (b.banner_cta_url?.trim() || "/dashboard/events");

        return {
          id: b.id,
          eventId,
          categoryBadge,
          formatBadge,
          featuredBadge: "FEATURED",
          title: b.title,
          description: b.description,
          dateStr,
          venue,
          registeredCount,
          detailsLink,
          statusTag,
          imageSrc: b.banner_url || "/banners/reinforce-placeholder.png",
        };
      })
    : bannerCandidates.map((event) => {
        const d = eventDate(event);
        const dateStr = formatBannerDate(d);
        const venue = event.venue_info?.room ||
          event.venue_info?.venue_name ||
          (event.format === "online" ? "ONLINE" : "CLASSROOM");
        const registeredCount = event.stats?.registered_count ?? 0;

        const categoryBadge = event.event_type
          ? event.event_type.replace(/[-_]/g, " ").toUpperCase()
          : "EVENT";
        const formatBadge = event.format === "in_person" || event.format === "offline"
          ? "CAMPUS"
          : (event.format || "HYBRID").toUpperCase();
        const featuredBadge = (event.banner_badge_text?.trim().toUpperCase() === "FEATURED" || !event.banner_badge_text?.trim())
          ? "FEATURED"
          : event.banner_badge_text.trim().toUpperCase();

        const startMs = new Date(event.schedule.start_time).getTime();
        const endMs = event.schedule.end_time
          ? new Date(event.schedule.end_time).getTime()
          : (Number.isFinite(startMs) ? startMs + (event.schedule.duration_minutes ? event.schedule.duration_minutes * 60_000 : 86_400_000) : null);
        const deadlineMs = event.schedule.registration_deadline
          ? new Date(event.schedule.registration_deadline).getTime()
          : null;

        const isEnded = event.status === "ended" || event.status === "completed" || (endMs !== null && endMs < nowMs);
        const isOngoing = !isEnded && Number.isFinite(startMs) && startMs <= nowMs && (endMs !== null ? endMs >= nowMs : true);
        const isRegClosed = !isEnded && (event.status === "registration_closed" || (deadlineMs !== null && deadlineMs < nowMs));

        const statusTag = isEnded
          ? "EVENT ENDED"
          : isOngoing
          ? "HAPPENING NOW"
          : isRegClosed
          ? "REGISTRATION CLOSED"
          : "OPEN · TEAMS OK";

        return {
          id: event.id,
          eventId: event.id,
          categoryBadge,
          formatBadge,
          featuredBadge,
          title: event.title,
          description: event.description,
          dateStr,
          venue,
          registeredCount,
          detailsLink: `/dashboard/events/${event.slug || event.id}`,
          statusTag,
          imageSrc: event.banner_url || "/banners/reinforce-placeholder.png",
        };
      });
  const activeSlide = slides.length > 0 ? slides[slideIndex % slides.length] : null;

  useEffect(() => {
    if (!token || slides.length === 0) return;
    const eventIds = Array.from(new Set(slides.map((s) => s.eventId).filter(Boolean)));
    if (eventIds.length === 0) return;

    let active = true;
    Promise.allSettled(
      eventIds.map((id) => api.myEventRegistration(token, id).then((res) => ({ id, is_registered: res.is_registered })))
    ).then((results) => {
      if (!active) return;
      setRegisteredEventIds((prev) => {
        const next = new Set(prev);
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.is_registered) {
            next.add(r.value.id);
          }
        }
        return next;
      });
    });
    return () => { active = false; };
  }, [token, slides]);

  const navigateTo = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      window.location.assign(url);
    } else {
      router.push(url);
    }
  };

  const handleBannerRsvp = async (slide: FeaturedBanner) => {
    if (!slide.eventId) {
      navigateTo(slide.detailsLink);
      return;
    }
    setRsvpLoadingId(slide.eventId);
    try {
      const isCurrentlyRegistered = registeredEventIds.has(slide.eventId);
      if (isCurrentlyRegistered) {
        await api.cancelEventRegistration(token, slide.eventId);
        setRegisteredEventIds((prev) => {
          const next = new Set(prev);
          next.delete(slide.eventId);
          return next;
        });
        setRegisteredCountOverrides((prev) => ({
          ...prev,
          [slide.eventId]: Math.max(0, (prev[slide.eventId] ?? slide.registeredCount) - 1),
        }));
      } else {
        await api.registerForEvent(token, slide.eventId, {});
        setRegisteredEventIds((prev) => new Set(prev).add(slide.eventId));
        setRegisteredCountOverrides((prev) => ({
          ...prev,
          [slide.eventId]: (prev[slide.eventId] ?? slide.registeredCount) + 1,
        }));
      }
    } catch {
      navigateTo(slide.detailsLink);
    } finally {
      setRsvpLoadingId(null);
    }
  };

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

  const isRegistered = activeSlide?.eventId ? registeredEventIds.has(activeSlide.eventId) : false;
  const isRsvpBusy = activeSlide?.eventId ? rsvpLoadingId === activeSlide.eventId : false;
  const currentCount = (activeSlide?.eventId && registeredCountOverrides[activeSlide.eventId] !== undefined)
    ? registeredCountOverrides[activeSlide.eventId]
    : (activeSlide?.registeredCount ?? 0);
  const metaLine = activeSlide ? `${activeSlide.dateStr} · ${activeSlide.venue.toUpperCase()} · ${currentCount} REGISTERED` : "";

  return <div className={styles.dashboard}>
    <div className={styles.intro}>
      <div><h2>Your club workspace</h2><p>Projects, events, and contribution activity in one view.</p></div>
      <Link href="/profile" className={styles.textLink}>View profile</Link>
    </div>

    {(bannerStatus === "loading" && eventStatus === "loading") ? (
      <section className={`${styles.heroBanner} ${styles.bannerSkeleton}`} aria-label="Loading featured club announcement">
        <div className={styles.bannerSlide}>
          <div className={styles.heroContent}>
            <div className={styles.heroTopSection}>
              <div className={styles.heroTopRow}>
                <div className={styles.heroBadges}>
                  <div className={`${styles.skeletonBadge} ${styles.shimmer}`} />
                  <div className={`${styles.skeletonBadgeSmall} ${styles.shimmer}`} />
                </div>
                <div className={`${styles.skeletonFeatured} ${styles.shimmer}`} />
              </div>
              <div className={`${styles.skeletonHeroTitle} ${styles.shimmer}`} />
              <div className={`${styles.skeletonHeroDesc1} ${styles.shimmer}`} />
              <div className={`${styles.skeletonHeroDesc2} ${styles.shimmer}`} />
            </div>

            <div className={styles.heroBottomSection}>
              <div className={`${styles.skeletonMetaLine} ${styles.shimmer}`} />
              <div className={styles.heroActionRow}>
                <div className={`${styles.skeletonHeroBtn} ${styles.shimmer}`} />
                <div className={`${styles.skeletonHeroLink} ${styles.shimmer}`} />
              </div>
              <div className={`${styles.skeletonProgress} ${styles.shimmer}`} />
            </div>
          </div>
          <div className={styles.heroPosterFrame}>
            <div className={`${styles.skeletonPosterImg} ${styles.shimmer}`} />
          </div>
        </div>
      </section>
    ) : activeSlide ? (
      <section
        className={styles.heroBanner}
        aria-label="Featured club announcement"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className={styles.bannerSlide} key={activeSlide.id}>
          <div className={styles.heroContent}>
            <div className={styles.heroTopSection}>
              <div className={styles.heroTopRow}>
                <div className={styles.heroBadges}>
                  <span className={styles.categoryBadge}>{activeSlide.categoryBadge}</span>
                  {activeSlide.formatBadge && (
                    <span className={styles.formatBadge}>{activeSlide.formatBadge}</span>
                  )}
                </div>
                <span className={styles.featuredLabel}>{activeSlide.featuredBadge}</span>
              </div>
              <h2 className={styles.heroTitle}>{activeSlide.title}</h2>
              <p className={styles.heroDescription}>{activeSlide.description}</p>
            </div>

            <div className={styles.heroBottomSection}>
              <div className={styles.heroMetaLine}>{metaLine}</div>

              <div className={styles.heroActionRow}>
                {(() => {
                  const isEnded = activeSlide.statusTag === "EVENT ENDED";
                  return (
                    <button
                      type="button"
                      onClick={() => !isEnded && handleBannerRsvp(activeSlide)}
                      disabled={isRsvpBusy || (isEnded && !isRegistered)}
                      className={`${styles.ticketButton} ${isRegistered ? styles.ticketButtonRegistered : ""}`}
                      title={isEnded ? "This event has ended" : (isRegistered ? "Click to cancel registration" : "RSVP for this event")}
                    >
                      {isRsvpBusy ? "Processing..." : isRegistered ? "Registered" : isEnded ? "Event ended" : "Register now"}
                    </button>
                  );
                })()}
                <Link href={activeSlide.detailsLink} className={styles.heroSecondaryLink}>
                  View details →
                </Link>
                {activeSlide.statusTag && (
                  <span className={styles.heroStatusTag}>{activeSlide.statusTag}</span>
                )}
              </div>

              <div className={styles.heroProgressRow}>
                <div className={styles.heroProgressBarTrack}>
                  <div
                    className={styles.heroProgressBarFill}
                    style={{
                      width: `${((slideIndex + 1) / Math.max(1, slides.length)) * 100}%`,
                    }}
                  />
                </div>
                <span className={styles.heroSlideCounter}>
                  {String(slideIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
                </span>
                {slides.length > 1 && (
                  <div className={styles.heroNavBtns}>
                    <button
                      type="button"
                      onClick={() => setSlideIndex((index) => (index - 1 + slides.length) % slides.length)}
                      aria-label="Previous featured event"
                    >
                      <MemberIcon name="chevron-left" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlideIndex((index) => (index + 1) % slides.length)}
                      aria-label="Next featured event"
                    >
                      <MemberIcon name="chevron-right" size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.heroPosterFrame}>
            <img
              src={activeSlide.imageSrc}
              alt={activeSlide.title}
              className={styles.heroPosterImg}
              onError={(event) => {
                const image = event.currentTarget;
                if (!image.src.endsWith("/banners/reinforce-placeholder.png")) {
                  image.src = "/banners/reinforce-placeholder.png";
                }
              }}
            />
          </div>
        </div>
      </section>
    ) : null}

    <div className={styles.overviewContainer}>
      <nav className={styles.mobileQuickLinks} aria-label="Quick access">
        <Link href="/dashboard/spg"><MemberIcon name="spg" size={19} /><span><strong>Project groups</strong><small>Teams &amp; reports</small></span><span aria-hidden="true">→</span></Link>
        <Link href="/dashboard/tickets"><MemberIcon name="tickets" size={19} /><span><strong>Tickets</strong><small>Questions &amp; requests</small></span><span aria-hidden="true">→</span></Link>
      </nav>
      <div className={styles.leftColumn}>

        <section className={styles.metrics} aria-label="Activity summary">
          <div className={styles.metric}>
            {spgStatus === "loading" ? (
              <div className={`${styles.skeletonMetricVal} ${styles.shimmer}`} />
            ) : (
              <strong>{spgStatus === "ready" ? memberSpgs.filter((spg) => spg.status === "active").length : "—"}</strong>
            )}
            <span><b>Active SPGs</b><small>From your membership</small></span>
          </div>
          <div className={styles.metric}>
            {eventStatus === "loading" ? (
              <div className={`${styles.skeletonMetricVal} ${styles.shimmer}`} />
            ) : (
              <strong>{eventStatus === "ready" ? upcoming.length : "—"}</strong>
            )}
            <span><b>Upcoming events</b><small>Published by the club</small></span>
          </div>
          <div className={styles.metric}>
            <strong>{profile.points?.total ?? 0}</strong>
            <span><b>Merit points</b><small>From your member profile</small></span>
          </div>
        </section>

        <section className={styles.projectSection} aria-labelledby="project-heading">
          <div className={styles.sectionHeader}><h2 id="project-heading">Current projects (SPG)</h2><Link href="/dashboard/spg" className={styles.textLink}>View all groups ↗</Link></div>
          {spgStatus === "loading" && (
            <div className={styles.projectList} aria-label="Loading project groups">
              {[1, 2].map((i) => (
                <article className={styles.projectCard} key={i}>
                  <div className={styles.projectTop}>
                    <div className={`${styles.skeletonTrackTag} ${styles.shimmer}`} />
                    <div className={`${styles.skeletonStatusTag} ${styles.shimmer}`} />
                  </div>
                  <div className={`${styles.skeletonSpgTitle} ${styles.shimmer}`} />
                  <div className={`${styles.skeletonSpgDesc1} ${styles.shimmer}`} />
                  <div className={`${styles.skeletonSpgDesc2} ${styles.shimmer}`} />
                  <div className={styles.projectFooter}>
                    <div className={styles.avatars}>
                      <div className={`${styles.skeletonAvatar} ${styles.shimmer}`} />
                      <div className={`${styles.skeletonAvatar} ${styles.shimmer}`} />
                    </div>
                    <div className={`${styles.skeletonReportBtn} ${styles.shimmer}`} />
                  </div>
                </article>
              ))}
            </div>
          )}
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
          {eventStatus === "loading" && (
            <div className={styles.eventsList} aria-label="Loading upcoming events">
              {[1, 2, 3].map((i) => (
                <div className={styles.eventItem} key={i}>
                  <div className={`${styles.skeletonEventDateBox} ${styles.shimmer}`} />
                  <div className={styles.eventDetails} style={{ flex: 1 }}>
                    <div className={`${styles.skeletonEventItemTitle} ${styles.shimmer}`} />
                    <div className={`${styles.skeletonEventItemMeta} ${styles.shimmer}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {contributionStatus === "loading" && (
            <div className={styles.contributionList} aria-label="Loading contributions">
              {[1, 2, 3].map((i) => (
                <div className={styles.contributionItem} key={i}>
                  <div className={`${styles.skeletonContributionTitle} ${styles.shimmer}`} />
                  <div className={`${styles.skeletonContributionPts} ${styles.shimmer}`} />
                </div>
              ))}
            </div>
          )}
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
