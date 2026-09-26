"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  month: string;
  day: string;
  title: string;
  location: string;
};

const placeholderEvents: UpcomingEvent[] = [
  {
    id: "ev-1",
    month: "SEP",
    day: "10",
    title: "Reinforce HackSprint v3.0",
    location: "Guild Main Lab",
  },
  {
    id: "ev-2",
    month: "SEP",
    day: "12",
    title: "Multi-Agent RL Advanced Deep Dive",
    location: "Virtual • Discord",
  },
];

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

const featuredEvents: FeaturedBannerEvent[] = [
  {
    id: "feat-1",
    badge: "NEW EVENT",
    date: "SEP 28, 2026 · 5:30 PM",
    title: "Reinforce Club Orientation 2026–27",
    description:
      "Open for all in Classroom A (2nd Floor). Discover Student Project Groups (SPGs), the community server, compute resource grants, and the new web dashboard.",
    ctaText: "Join Session →",
    ctaLink: "/dashboard/events",
    imageSrc: "/banners/orientation-2026.png",
    alt: "Reinforce AI/ML Club Orientation 2026-27",
  },
  {
    id: "feat-2",
    badge: "COMPUTE GRANTS",
    date: "APPLICATIONS OPEN · FALL 2024",
    title: "A100 / H100 GPU Grants for Project Groups",
    description:
      "All active Student Project Groups (SPGs) can request cluster compute, cloud credits, and mentor pairing for ongoing papers and open-source models.",
    ctaText: "Submit Proposal →",
    ctaLink: "/dashboard/spg",
    // No image - renders full-width yellow banner card
  },
  {
    id: "feat-3",
    badge: "NIGHT SOCIAL",
    date: "DEC 21 · 09.00 - 12.00",
    title: "Reinforce Night Club Social & Mixer",
    description:
      "End of term networking night. Meet project leads, celebrate shipped hackathon releases, and connect with fellow builders and researchers.",
    ctaText: "RSVP Now →",
    ctaLink: "/dashboard/events",
    imageSrc: "/banners/night-club.jpg",
    alt: "Reinforce Night Club Event",
  },
  {
    id: "feat-4",
    badge: "DATATHON 2024",
    date: "NOV 15 – 17, 2024",
    title: "Reinforce Datathon & HackSprint",
    description:
      "Campus-wide 48-hour competition tackling multimodal sensor prediction and seismic forecasting. Dedicated A100 GPU compute for top teams.",
    ctaText: "Register Your Team →",
    ctaLink: "/dashboard/events",
    imageSrc: "/banners/8198583.jpg",
    alt: "Reinforce Datathon & HackSprint Banner",
  },
];

// October 2024 calendar grid days (1 = Tuesday ... 31 = Thursday)
const calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);

// Extended slides for seamless infinite loop (cloned last item prepended, cloned first item appended)
const extendedSlides = [
  { ...featuredEvents[featuredEvents.length - 1], virtualKey: "clone-prev" },
  ...featuredEvents.map((ev, idx) => ({ ...ev, virtualKey: `slide-${idx}` })),
  { ...featuredEvents[0], virtualKey: "clone-next" },
];


export default function DashboardClient() {
  const [selectedDay, setSelectedDay] = useState(24);
  const [slideIndex, setSlideIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const handlePrevSlide = () => {
    setIsTransitioning(true);
    setSlideIndex((prev) => prev - 1);
  };

  const handleNextSlide = () => {
    setIsTransitioning(true);
    setSlideIndex((prev) => prev + 1);
  };

  const handleTransitionEnd = () => {
    if (slideIndex >= extendedSlides.length - 1) {
      // Reached cloned first slide -> instantly snap to real first slide (index 1)
      setIsTransitioning(false);
      setSlideIndex(1);
    } else if (slideIndex <= 0) {
      // Reached cloned last slide -> instantly snap to real last slide
      setIsTransitioning(false);
      setSlideIndex(featuredEvents.length);
    }
  };

  // Automatically transition carousel every 8 seconds (paused on hover)
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setSlideIndex((prev) => prev + 1);
    }, 8000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const activeDotIndex = (slideIndex - 1 + featuredEvents.length) % featuredEvents.length;

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
            style={{ transform: `translateX(-${slideIndex * 100}%)` }}
            onTransitionEnd={handleTransitionEnd}
          >
            {extendedSlides.map((ev, index) => {
              const isNonImage = !ev.imageSrc;
              return (
                <div
                  key={ev.virtualKey}
                  className={styles.bannerSlide}
                  aria-hidden={activeDotIndex !== (index - 1 + featuredEvents.length) % featuredEvents.length}
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
                    />
                  </div>
                </div>
              );
            })}
          </div>


          {/* Navigation Arrows */}
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

          {/* Carousel Dots */}
          <div className={styles.dotsRow} aria-hidden="true">
            {featuredEvents.map((ev, index) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => {
                  setIsTransitioning(true);
                  setSlideIndex(index + 1);
                }}
                className={activeDotIndex === index ? styles.dotActive : styles.dot}
                style={{ border: "none", cursor: "pointer", padding: 0 }}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
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
            {placeholderEvents.map((ev) => (
              <div key={ev.id} className={styles.eventItem}>
                <div className={styles.eventDateBox}>
                  <span className={styles.eventMonth}>{ev.month}</span>
                  <span className={styles.eventDay}>{ev.day}</span>
                </div>
                <div className={styles.eventDetails}>
                  <h3 className={styles.eventItemTitle}>{ev.title}</h3>
                  <span className={styles.eventLocation}>{ev.location}</span>
                </div>
              </div>
            ))}
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
