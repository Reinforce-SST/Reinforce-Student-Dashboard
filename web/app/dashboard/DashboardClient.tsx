"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "@/components/dashboard/OverviewDashboard.module.css";

type SPGProject = {
  id: string;
  code: string;
  track: "kaggle" | "research" | "product";
  trackLabel: string;
  title: string;
  description: string;
  status: "on_track" | "at_risk";
  statusLabel: string;
  team: string[];
  teamExtra?: number;
  reportDue: string;
};

const placeholderProjects: SPGProject[] = [
  {
    id: "spg-1",
    code: "SPG-2024-089",
    track: "kaggle",
    trackLabel: "Kaggle Track",
    title: "Deep Learning for Seismic Prediction",
    description:
      "Developing an ensemble model for high-precision earthquake detection and early warning systems.",
    status: "on_track",
    statusLabel: "On Track",
    team: ["JC", "AK"],
    teamExtra: 1,
    reportDue: "In 2 days",
  },
  {
    id: "spg-2",
    code: "SPG-2024-042",
    track: "research",
    trackLabel: "Research Track",
    title: "Multimodal LLM for Medical Diagnostics",
    description:
      "Fine-tuning open weights models on federated clinical trial datasets for automated ECG interpretation.",
    status: "at_risk",
    statusLabel: "At Risk",
    team: ["JC", "MS", "RD"],
    reportDue: "Tomorrow",
  },
];

type UpcomingEvent = {
  id: string;
  slug?: string;
  month: string;
  day: string;
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
  date: "UPCOMING SESSIONS & GRANTS",
  title: "Reinforce AI/ML Student Hub",
  description:
    "Explore Student Project Groups (SPGs), request dedicated cluster compute, join technical workshops, and ship cutting-edge open-source software.",
  ctaText: "Explore Events →",
  ctaLink: "/dashboard/events",
  imageSrc: "/banners/reinforce-placeholder.png",
  alt: "Reinforce AI/ML Club",
};

// October 2024 calendar grid days (1 = Tuesday ... 31 = Thursday)
const calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);

export default function DashboardClient() {
  const { token } = useMember();
  const [selectedDay, setSelectedDay] = useState(24);
  const [dbBanners, setDbBanners] = useState<FeaturedBannerEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [slideIndex, setSlideIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchBannersAndEvents() {
      try {
        const res = await api.listEvents(token, { status: "published", limit: 20 });
        if (!active) return;
        if (res.events && res.events.length > 0) {
          // 1. Filter / Map Featured Hero Banners
          const bannerSource = res.events.filter(
            (ev) =>
              ev.event_type?.toLowerCase().includes("banner") ||
              ev.schedule?.badge === "FEATURED"
          );
          const activeBannerList = bannerSource.length > 0 ? bannerSource : res.events;

          const mappedBanners: FeaturedBannerEvent[] = activeBannerList.map((ev) => {
            let displayDate = ev.schedule?.display_date;
            if (!displayDate && ev.schedule?.start_time) {
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
              badge: ev.schedule?.badge || ev.event_type?.toUpperCase() || "FEATURED",
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
          const regularEvents = res.events.filter(
            (ev) => !ev.event_type?.toLowerCase().includes("banner")
          );
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
              title: ev.title,
              location,
            };
          });
          setUpcomingEvents(mappedUpcoming);
        } else {
          setDbBanners([]);
          setUpcomingEvents([]);
        }
      } catch (err) {
        console.error("Failed to load dashboard data from database:", err);
      }
    }
    fetchBannersAndEvents();
    return () => {
      active = false;
    };
  }, [token]);

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
            {placeholderProjects.map((project) => (
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
                    className={`${styles.statusPill} ${project.status === "on_track"
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
                    {project.teamExtra && (
                      <span
                        className={`${styles.stackAvatar} ${styles.avatarCount}`}
                      >
                        +{project.teamExtra}
                      </span>
                    )}
                  </div>

                  <div className={styles.reportActionGroup}>
                    <div className={styles.reportMeta}>
                      <span className={styles.reportLabel}>NEXT REPORT</span>
                      <span className={styles.reportDue}>
                        {project.reportDue}
                      </span>
                    </div>

                    <Link
                      href="/dashboard/spg"
                      className={styles.submitReportBtn}
                    >
                      Submit Report
                    </Link>
                  </div>
                </div>
              </article>
            ))}
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
              <h2 id="calendar-heading">October 2024</h2>
            </div>
            <div className={styles.calendarNav}>
              <button
                className={styles.calNavBtn}
                aria-label="Previous month"
              >
                <MemberIcon name="chevron-left" size={14} />
              </button>
              <button className={styles.calNavBtn} aria-label="Next month">
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
            {/* 1 empty slot for Monday offset */}
            <span className={styles.dayMuted} aria-hidden="true" />

            {calendarDays.map((day) => {
              const isSelected = selectedDay === day;
              const isEventDay = day === 22;
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
                  aria-label={`October ${day}, 2024`}
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
            aria-label="Create new event or ticket"
            title="Create Event / Ticket"
          >
            <MemberIcon name="plus" size={18} />
          </Link>
        </section>
      </div>
    </div>
  );
}
