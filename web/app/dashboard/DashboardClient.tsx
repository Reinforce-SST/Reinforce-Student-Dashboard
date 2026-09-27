"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import type { SPGRecord } from "@/lib/spgData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "@/components/dashboard/OverviewDashboard.module.css";

type SPGProject = {
  id: string;
  code: string;
  track: string;
  trackLabel: string;
  title: string;
  description: string;
  status: "active" | "paused";
  statusLabel: string;
  team: string[];
  teamExtra?: number;
  reportCount: number;
};

function toProject(record: SPGRecord): SPGProject {
  const names = Object.values(record.member_names || {});
  const team = names.slice(0, 3).map((name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
  return {
    id: record.id,
    code: record.id,
    track: record.track,
    trackLabel: `${record.track} track`,
    title: record.name,
    description: record.description || "No description provided.",
    status: record.status === "paused" ? "paused" : "active",
    statusLabel: record.status === "paused" ? "Paused" : "Active",
    team,
    teamExtra: Math.max(0, record.member_ids.length - team.length),
    reportCount: record.report_count,
  };
}

type UpcomingEvent = {
  id: string;
  slug?: string;
  month: string;
  day: string;
  year: number;
  title: string;
  location: string;
};

type FeaturedBannerEvent = {
  id: string;
  badge: string;
  date: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  imageSrc?: string;
  alt?: string;
};

const defaultPlaceholderBanner: FeaturedBannerEvent = {
  id: "placeholder-1",
  badge: "REINFORCE CLUB",
  date: "MEMBER DASHBOARD",
  title: "Reinforce AI/ML Student Hub",
  description:
    "Explore your project groups and the club's published events.",
  ctaText: "Explore Events →",
  ctaLink: "/dashboard/events",
  imageSrc: "/banners/reinforce-placeholder.png",
  alt: "Reinforce AI/ML Club",
};

export default function DashboardClient() {
  const { token, profile } = useMember();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [projects, setProjects] = useState<SPGProject[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbBanners, setDbBanners] = useState<FeaturedBannerEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [slideIndex, setSlideIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchBannersAndEvents() {
      const [spgResult, eventResult] = await Promise.allSettled([
        api.listSpgs(token, { limit: 100 }),
        api.listEvents(token, { timeline: "upcoming", limit: 100 }),
      ]);
      if (!active) return;
      setLoadError(spgResult.status === "rejected" || eventResult.status === "rejected"
        ? "Some dashboard data could not be loaded. Please refresh." : "");
      if (spgResult.status === "fulfilled") {
        const uid = profile.id;
        setProjects(spgResult.value.items.filter((spg) =>
          (spg.status === "active" || spg.status === "paused") &&
          (spg.lead_id === uid || spg.member_ids.includes(uid || ""))).map(toProject).slice(0, 3));
      }
      if (eventResult.status === "fulfilled") {
        const res = eventResult.value;
        if (res.events && res.events.length > 0) {
          // 1. Filter / Map Featured Hero Banners
          const bannerSource = res.events.filter((ev) =>
            ev.event_type?.toLowerCase().includes("banner"));
          const activeBannerList = bannerSource.filter((ev) =>
            new Date(ev.schedule.start_time).getTime() >= Date.now());

          const mappedBanners: FeaturedBannerEvent[] = activeBannerList.map((ev) => {
            let displayDate: string | undefined;
            if (ev.schedule?.start_time) {
              try {
                const dt = new Date(ev.schedule.start_time);
                displayDate = dt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });
              } catch {
                displayDate = ev.schedule.start_time;
              }
            }

            return {
              id: ev.id,
              badge: ev.event_type?.toUpperCase() || "FEATURED",
              date: displayDate || "UPCOMING",
              title: ev.title,
              description: ev.description,
              ctaText: "Explore Event →",
              ctaLink: `/dashboard/events/${ev.slug || ev.id}`,
              imageSrc: ev.banner_url || "/banners/reinforce-placeholder.png",
              alt: ev.title,
            };
          });
          setDbBanners(mappedBanners);

          // 2. Filter / Map Upcoming Events Widget
          const regularEvents = res.events.filter((ev) =>
            !ev.event_type?.toLowerCase().includes("banner") &&
            new Date(ev.schedule.start_time).getTime() >= Date.now());
          const mappedUpcoming: UpcomingEvent[] = regularEvents.slice(0, 4).map((ev) => {
            let month = "UPCOMING";
            let day = "•";
            if (ev.schedule?.start_time) {
              try {
                const dt = new Date(ev.schedule.start_time);
                month = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
                day = String(dt.getDate());
              } catch {}
            }
            const location =
              ev.venue_info?.venue_name ||
              ev.venue_info?.room ||
              (ev.format === "online" ? "Virtual • Discord" : "Campus Guild");

            return {
              id: ev.id,
              slug: ev.slug,
              month,
              day,
              year: new Date(ev.schedule.start_time).getFullYear(),
              title: ev.title,
              location,
            };
          });
          setUpcomingEvents(mappedUpcoming);
        } else {
          setDbBanners([]);
          setUpcomingEvents([]);
        }
      }
      setLoading(false);
    }
    fetchBannersAndEvents();
    return () => {
      active = false;
    };
  }, [token, profile.id]);

  const calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  const calendarDays = Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
  const mondayOffset = (calendarMonth.getDay() + 6) % 7;
  const eventDays = new Set(upcomingEvents.filter((ev) => {
    const date = new Date(`${ev.month} ${ev.day}, ${ev.year}`);
    return !Number.isNaN(date.getTime()) && date.getMonth() === calendarMonth.getMonth() && ev.year === calendarMonth.getFullYear();
  }).map((ev) => Number(ev.day)));

  const activeSlides = dbBanners.length > 0 ? dbBanners : [defaultPlaceholderBanner];

  // Extended slides for seamless infinite loop (cloned last item prepended, cloned first item appended)
  const extendedSlides =
    activeSlides.length > 1
      ? [
          { ...activeSlides[activeSlides.length - 1], virtualKey: "clone-prev" },
          ...activeSlides.map((ev, idx) => ({ ...ev, virtualKey: `slide-${idx}` })),
          { ...activeSlides[0], virtualKey: "clone-next" },
        ]
      : [{ ...activeSlides[0], virtualKey: "slide-single" }];

  const handlePrevSlide = () => {
    if (activeSlides.length <= 1) return;
    setIsTransitioning(true);
    setSlideIndex((prev) => prev - 1);
  };

  const handleNextSlide = () => {
    if (activeSlides.length <= 1) return;
    setIsTransitioning(true);
    setSlideIndex((prev) => prev + 1);
  };

  const handleTransitionEnd = () => {
    if (activeSlides.length <= 1) return;
    if (slideIndex >= extendedSlides.length - 1) {
      // Reached cloned first slide -> instantly snap to real first slide (index 1)
      setIsTransitioning(false);
      setSlideIndex(1);
    } else if (slideIndex <= 0) {
      // Reached cloned last slide -> instantly snap to real last slide
      setIsTransitioning(false);
      setSlideIndex(activeSlides.length);
    }
  };

  // Automatically transition carousel every 8 seconds (paused on hover)
  useEffect(() => {
    if (isPaused || activeSlides.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setSlideIndex((prev) => prev + 1);
    }, 8000);

    return () => clearInterval(interval);
  }, [isPaused, activeSlides.length]);

  const activeDotIndex =
    activeSlides.length > 1
      ? (slideIndex - 1 + activeSlides.length) % activeSlides.length
      : 0;

  return (
    <div className={styles.overviewContainer}>
      {/* Left / Center Column (Main Content) */}
      <div className={styles.leftColumn}>
        {/* Featured Banner: Infinite Sliding Carousel (22:9 Block) */}
        <section
          className={styles.heroBanner}
          aria-label="Featured Event Announcement"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Sliding Track */}
          <div
            className={
              isTransitioning
                ? styles.bannerSliderTrack
                : styles.bannerSliderTrackNoTransition
            }
            style={{
              transform:
                activeSlides.length > 1
                  ? `translateX(-${slideIndex * 100}%)`
                  : `translateX(0%)`,
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {extendedSlides.map((ev, index) => {
              return (
                <div
                  key={ev.virtualKey}
                  className={styles.bannerSlide}
                  aria-hidden={
                    activeSlides.length > 1
                      ? activeDotIndex !==
                        (index - 1 + activeSlides.length) % activeSlides.length
                      : false
                  }
                >
                  {/* Left Text Side */}
                  <div className={styles.heroContent}>
                    <div>
                      <div className={styles.heroTopRow}>
                        <span className={styles.eventBadge}>{ev.badge}</span>
                        <span className={styles.eventDate}>{ev.date}</span>
                      </div>

                      <h2 className={styles.heroTitle}>{ev.title}</h2>
                      <p className={styles.heroDescription}>{ev.description}</p>
                    </div>

                    <Link href={ev.ctaLink} className={styles.heroCtaBtn}>
                      {ev.ctaText}
                    </Link>
                  </div>

                  {/* Right 16:9 Cover taking Full Height with Blurred Edge */}
                  <div className={styles.heroCoverRight}>
                    <img
                      src={ev.imageSrc || "/banners/reinforce-placeholder.png"}
                      alt={ev.alt || ev.title || "Reinforce Event Banner"}
                      className={styles.coverImage}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/banners/reinforce-placeholder.png";
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation Arrows (Only show if multiple slides) */}
          {activeSlides.length > 1 && (
            <div className={styles.heroNavArrows}>
              <button
                className={styles.navArrowBtn}
                onClick={handlePrevSlide}
                aria-label="Previous featured event"
              >
                <MemberIcon name="chevron-left" size={16} />
              </button>
              <button
                className={styles.navArrowBtn}
                onClick={handleNextSlide}
                aria-label="Next featured event"
              >
                <MemberIcon name="chevron-right" size={16} />
              </button>
            </div>
          )}

          {/* Carousel Dots (Only show if multiple slides) */}
          {activeSlides.length > 1 && (
            <div className={styles.dotsRow} aria-hidden="true">
              {activeSlides.map((ev, index) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setIsTransitioning(true);
                    setSlideIndex(index + 1);
                  }}
                  className={
                    activeDotIndex === index ? styles.dotActive : styles.dot
                  }
                  style={{ border: "none", cursor: "pointer", padding: 0 }}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* Current Projects (SPG) */}
        <section
          className={styles.spgSection}
          aria-labelledby="spg-section-heading"
        >
          <div className={styles.spgHeader}>
            <div className={styles.spgTitleGroup}>
              <span className={styles.spgBar} aria-hidden="true" />
              <h2 id="spg-section-heading" className={styles.spgTitle}>
                Current Projects (SPG)
              </h2>
            </div>
            <Link href="/dashboard/spg" className={styles.viewAllLink}>
              View All Management
            </Link>
          </div>

          <div className={styles.spgCardsList}>
            {projects.map((project) => (
              <article key={project.id} className={styles.spgCard}>
                <div className={styles.spgCardTop}>
                  <div className={styles.trackIdGroup}>
                    <span
                      className={`${styles.trackPill} ${project.track === "kaggle"
                          ? styles.trackKaggle
                          : project.track === "research"
                            ? styles.trackResearch
                            : styles.trackProduct
                        }`}
                    >
                      {project.trackLabel}
                    </span>
                    <span className={styles.spgId}>ID: {project.code}</span>
                  </div>

                  <span
                    className={`${styles.statusPill} ${project.status === "active"
                        ? styles.statusOnTrack
                        : styles.statusAtRisk
                      }`}
                  >
                    {project.statusLabel}
                  </span>
                </div>

                <div className={styles.spgCardBody}>
                  <h3 className={styles.projectTitle}>{project.title}</h3>
                  <p className={styles.projectDesc}>{project.description}</p>
                </div>

                <div className={styles.spgCardFooter}>
                  <div className={styles.avatarStack}>
                    {project.team.map((initials, index) => (
                      <span
                        key={initials}
                        className={`${styles.stackAvatar} ${index === 0 ? styles.avatarGold : styles.avatarDark
                          }`}
                      >
                        {initials}
                      </span>
                    ))}
                    {(project.teamExtra ?? 0) > 0 && (
                      <span
                        className={`${styles.stackAvatar} ${styles.avatarCount}`}
                      >
                        +{project.teamExtra}
                      </span>
                    )}
                  </div>

                  <div className={styles.reportActionGroup}>
                    <div className={styles.reportMeta}>
                      <span className={styles.reportLabel}>REPORTS FILED</span>
                      <span className={styles.reportDue}>
                        {project.reportCount}
                      </span>
                    </div>

                    <Link
                      href={`/dashboard/spg/${project.id}`}
                      className={styles.submitReportBtn}
                    >
                      Submit Report
                    </Link>
                  </div>
                </div>
              </article>
            ))}
            {loading && <p>Loading project groups…</p>}
            {!loading && !loadError && projects.length === 0 && <p>No current project groups assigned to you.</p>}
            {loadError && <p role="alert">{loadError}</p>}
          </div>
        </section>
      </div>

      {/* Right Column (Widgets) */}
      <div className={styles.rightColumn}>
        {/* Widget 1: Upcoming Events */}
        <section
          className={styles.widgetCard}
          aria-labelledby="upcoming-events-heading"
        >
          <div className={styles.widgetHeader}>
            <div className={styles.widgetTitleGroup}>
              <span className={styles.widgetIcon}>
                <MemberIcon name="lightning" size={18} />
              </span>
              <h2 id="upcoming-events-heading">Upcoming Events</h2>
            </div>
            <Link href="/dashboard/events" className={styles.viewAllLink}>
              View All →
            </Link>
          </div>

          <div className={styles.eventsList}>
            {upcomingEvents.length === 0 ? (
              <div style={{ padding: "16px 8px", textAlign: "center", color: "#8e8e93", fontSize: "12.5px" }}>
                No upcoming club events scheduled.
              </div>
            ) : (
              upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/dashboard/events/${ev.slug || ev.id}`}
                  className={styles.eventItem}
                  style={{ textDecoration: "none" }}
                >
                  <div className={styles.eventDateBox}>
                    <span className={styles.eventMonth}>{ev.month}</span>
                    <span className={styles.eventDay}>{ev.day}</span>
                  </div>
                  <div className={styles.eventDetails}>
                    <h3 className={styles.eventItemTitle}>{ev.title}</h3>
                    <span className={styles.eventLocation}>{ev.location}</span>
                  </div>
                </Link>
              ))
            )}
          </div>

          <Link href="/dashboard/events" className={styles.calendarFooterLink}>
            View Event Calendar
          </Link>
        </section>

        {/* Widget 2: Calendar Widget */}
        <section
          className={styles.calendarCard}
          aria-labelledby="calendar-heading"
        >
          <div className={styles.widgetHeader}>
            <div className={styles.widgetTitleGroup}>
              <span className={styles.widgetIcon}>
                <MemberIcon name="events" size={18} />
              </span>
              <h2 id="calendar-heading">{calendarMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</h2>
            </div>
            <div className={styles.calendarNav}>
              <button
                className={styles.calNavBtn}
                aria-label="Previous month"
                onClick={() => { setMonthOffset((value) => value - 1); setSelectedDay(null); }}
              >
                <MemberIcon name="chevron-left" size={14} />
              </button>
              <button className={styles.calNavBtn} aria-label="Next month" onClick={() => { setMonthOffset((value) => value + 1); setSelectedDay(null); }}>
                <MemberIcon name="chevron-right" size={14} />
              </button>
            </div>
          </div>

          <div className={styles.weekdaysGrid} aria-hidden="true">
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
            <span>Su</span>
          </div>

          <div className={styles.daysGrid} role="grid">
            {Array.from({ length: mondayOffset }, (_, index) => <span key={`blank-${index}`} className={styles.dayMuted} aria-hidden="true" />)}

            {calendarDays.map((day) => {
              const isSelected = selectedDay === day;
              const isEventDay = eventDays.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`${styles.dayCell} ${isSelected
                      ? styles.dayActive
                      : isEventDay
                        ? styles.dayBordered
                        : ""
                    }`}
                  aria-label={`${calendarMonth.toLocaleString("en-IN", { month: "long" })} ${day}, ${calendarMonth.getFullYear()}`}
                  aria-pressed={isSelected}
                >
                  {day}
                  {isEventDay && !isSelected && (
                    <span className={styles.dayDot} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Create Floating Action Button */}
          <Link
            href="/dashboard/events"
            className={styles.fabAdd}
            aria-label="View events"
            title="View events"
          >
            <MemberIcon name="plus" size={18} />
          </Link>
        </section>
      </div>
    </div>
  );
}
