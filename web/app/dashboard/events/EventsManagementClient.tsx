"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMember } from "@/lib/useMember";
import { loadAllUpcomingEvents } from "@/lib/memberData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import PaginationBar from "@/components/dashboard/PaginationBar";
import LoadingBar from "@/components/dashboard/LoadingBar";
import styles from "./EventsManagement.module.css";

export type CalendarEventItem = {
  id: string;
  slug: string;
  month: string;
  day: number;
  year: number;
  title: string;
  type: string;
  typeLabel: string;
  time: string;
  location: string;
  statusText: string;
  statusType: "registered" | "slots" | "available" | "limited" | "full";
  registrationOpen: boolean;
  startDate: Date;
  bannerUrl?: string | null;
};

export default function EventsManagementClient() {
  const router = useRouter();
  const { token } = useMember();
  const [activeTab, setActiveTab] = useState<"ALL" | "WORKSHOPS" | "HACKATHONS" | "MEETUPS">("ALL");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Current calendar month view (default to current date)
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  useEffect(() => {
    setPage(1);
  }, [activeTab, selectedDay, currentCalendarDate]);

  useEffect(() => {
    let active = true;
    async function fetchEvents() {
      try {
        const upcomingEvents = await loadAllUpcomingEvents(token);
        if (!active) return;
        setLoadError("");

        if (upcomingEvents.length > 0) {
          const mapped: CalendarEventItem[] = upcomingEvents.filter((ev) =>
            !ev.event_type?.toLowerCase().includes("banner") &&
            ["published", "registration_closed", "ongoing"].includes(ev.status) &&
            new Date(ev.schedule.start_time).getTime() >= Date.now()).map((ev) => {
            const start = new Date(ev.schedule.start_time);

            const monthStr = start.toLocaleString("en-US", { month: "short" }).toUpperCase();
            const dayNum = start.getDate();
            const yearNum = start.getFullYear();
            const timeStr = start.toLocaleString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });

            const rawType = ev.event_type.toLowerCase();
            const registrationOpen = (ev.status === "published" || ev.status === "ongoing") &&
              (!ev.schedule.registration_deadline || new Date(ev.schedule.registration_deadline).getTime() >= Date.now());
            const loc =
              ev.venue_info?.room ||
              ev.venue_info?.venue_name ||
              (ev.format === "online" ? "Online" : "Venue to be announced");

            return {
              id: ev.id,
              slug: ev.slug || ev.id,
              month: monthStr,
              day: dayNum,
              year: yearNum,
              title: ev.title,
              type: rawType,
              typeLabel: ev.event_type.toUpperCase(),
              time: timeStr,
              location: loc,
              statusText: registrationOpen ? "OPEN" : "REGISTRATION CLOSED",
              statusType: "available",
              registrationOpen,
              startDate: start,
              bannerUrl: ev.banner_url,
            };
          });

          // Sort upcoming first
          mapped.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
          setEvents(mapped);
        } else {
          setEvents([]);
        }
      } catch {
        if (active) setLoadError("Events could not be loaded. Please refresh.");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchEvents();
    return () => {
      active = false;
    };
  }, [token]);

  const handleToggleRsvp = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/dashboard/events/${slug}`);
  };

  // Filter events by tab and selected day
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Tab filter
      if (activeTab === "WORKSHOPS" && !ev.type.includes("workshop")) return false;
      if (activeTab === "HACKATHONS" && !ev.type.includes("hackathon")) return false;
      if (activeTab === "MEETUPS" && !ev.type.includes("meetup") && !ev.type.includes("ama") && !ev.type.includes("fireside")) return false;

      // Day filter if selected
      if (selectedDay !== null) {
        const matchesMonth =
          ev.startDate.getMonth() === currentCalendarDate.getMonth() &&
          ev.startDate.getFullYear() === currentCalendarDate.getFullYear();
        if (!matchesMonth || ev.day !== selectedDay) {
          return false;
        }
      }

      return true;
    });
  }, [events, activeTab, selectedDay, currentCalendarDate]);

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, page, pageSize]);

  // Calendar calculations
  const calYear = currentCalendarDate.getFullYear();
  const calMonth = currentCalendarDate.getMonth();
  const calMonthName = currentCalendarDate.toLocaleString("en-US", { month: "long" });
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Extract days in current month that have events
  const eventDaysInMonth = useMemo(() => {
    const set = new Set<number>();
    events.forEach((ev) => {
      if (ev.startDate.getMonth() === calMonth && ev.startDate.getFullYear() === calYear) {
        set.add(ev.day);
      }
    });
    return set;
  }, [events, calMonth, calYear]);

  const handlePrevMonth = () => {
    setCurrentCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const getTypeClass = (type: string) => {
    if (type.includes("hackathon")) return styles.typeHackathon;
    if (type.includes("workshop")) return styles.typeWorkshop;
    if (type.includes("meetup") || type.includes("fireside") || type.includes("ama")) return styles.typeMeetup;
    return styles.typeHackathon;
  };

  return (
    <div className={styles.pageContainer}>
      {/* Top Header Row with Title and Category Filters */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>EVENTS CALENDAR</h1>
          <p className={styles.pageSubtitle}>
            Sync your schedule with the guild&apos;s core milestones, research workshops, and hackathons.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className={styles.filterTabs} role="tablist">
          {(["ALL", "WORKSHOPS", "HACKATHONS", "MEETUPS"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedDay(null);
              }}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabActive : ""}`}
            >
              {tab === "ALL" ? "ALL EVENTS" : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main 2-Column Content */}
      <div className={styles.mainLayout}>
        {/* Left Column: Stack of Event Cards */}
        <section className={styles.eventsStack} aria-label="Upcoming Events Schedule">
          <LoadingBar loading={loading} />
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#8e8e93" }}>
              Loading upcoming club events...
            </div>
          ) : loadError ? (
            <div className={styles.eventCard} role="alert">{loadError}</div>
          ) : filteredEvents.length === 0 ? (
            <div className={styles.eventCard} style={{ padding: "40px 24px", textAlign: "center", flexDirection: "column", gap: "12px" }}>
              <div style={{ color: "#e5b731" }}>
                <MemberIcon name="calendar" size={32} />
              </div>
              <h3 style={{ margin: 0, color: "#ffffff", fontSize: "16px" }}>
                {selectedDay !== null
                  ? `No events scheduled on ${calMonthName} ${selectedDay}`
                  : "No upcoming events found"}
              </h3>
              <p style={{ margin: 0, color: "#8e8e93", fontSize: "13px", maxWidth: "400px" }}>
                {selectedDay !== null
                  ? "Try selecting another calendar day or click below to view all upcoming events."
                  : "New technical workshops, hackathons, and guest masterclasses are announced regularly. Check back soon!"}
              </p>
              {selectedDay !== null && (
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className={styles.actionBtn}
                  style={{ marginTop: "10px", width: "fit-content", alignSelf: "center", padding: "8px 16px" }}
                >
                  View All Events
                </button>
              )}
            </div>
          ) : (
            paginatedEvents.map((ev) => {
              return (
                <article key={ev.id} className={styles.eventCard}>
                  <Link
                    href={`/dashboard/events/${ev.slug}`}
                    className={styles.eventLeftArea}
                    style={{ textDecoration: "none", flex: 1 }}
                  >
                    {/* Date Badge on Left */}
                    <div className={styles.dateBox}>
                      <span className={styles.dateMonth}>{ev.month}</span>
                      <span className={styles.dateDay}>{ev.day}</span>
                    </div>

                    {/* Event Details */}
                    <div className={styles.eventDetails}>
                      <span className={`${styles.typeTag} ${getTypeClass(ev.type)}`}>
                        {ev.typeLabel}
                      </span>
                      <h2 className={styles.eventTitle}>{ev.title}</h2>

                      <div className={styles.metaRow}>
                        <span className={styles.metaItem}>
                          <MemberIcon name="clock" size={13} />
                          {ev.time}
                        </span>
                        <span className={styles.metaItem}>
                          <MemberIcon name="location" size={13} />
                          {ev.location}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Right Action & Status Area */}
                  <div className={styles.eventRightArea}>
                    <div className={styles.statusCol}>
                      <span className={styles.statusHeader}>STATUS</span>
                      <span
                        className={`${styles.statusValue} ${
                          styles.statusAvailable
                        }`}
                      >
                        {ev.statusText}
                      </span>
                    </div>

                    <button type="button" onClick={(e) => handleToggleRsvp(ev.slug, e)} className={`${styles.actionBtn} ${styles.btnRsvp}`} aria-label={`Open ${ev.title}`}>{ev.registrationOpen ? "RSVP NOW" : "VIEW EVENT"}</button>
                  </div>
                </article>
              );
            })
          )}

          {!loading && filteredEvents.length > 0 && (
            <PaginationBar
              currentPage={page}
              totalItems={filteredEvents.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              pageSizeOptions={[6, 12, 24]}
              itemLabel="events"
              disabled={loading}
            />
          )}
        </section>

        {/* Right Column: Calendar & Statistics Widgets */}
        <div className={styles.rightWidgets}>
          {/* Widget 1: Schedule Calendar */}
          <section className={styles.calendarWidget} aria-label="Interactive Event Calendar">
            <div className={styles.calendarTop}>
              <div>
                <h2 className={styles.calMonthTitle}>
                  {calMonthName} {calYear}
                </h2>
                <span className={styles.calScheduleSubtitle}>SCHEDULE VIEW</span>
              </div>

              <div className={styles.calNavGroup}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className={styles.calNavBtn}
                  aria-label="Previous month"
                >
                  <MemberIcon name="chevron-left" size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className={styles.calNavBtn}
                  aria-label="Next month"
                >
                  <MemberIcon name="chevron-right" size={14} />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className={styles.weekdaysHeader} aria-hidden="true">
              <span>SUN</span>
              <span>MON</span>
              <span>TUE</span>
              <span>WED</span>
              <span>THU</span>
              <span>FRI</span>
              <span>SAT</span>
            </div>

            {/* Days Grid */}
            <div className={styles.daysGrid} role="grid">
              {Array.from({ length: new Date(calYear, calMonth, 1).getDay() }, (_, index) => <span key={`blank-${index}`} className={styles.dayMuted} aria-hidden="true" />)}
              {calendarDays.map((d) => {
                const isSelected = selectedDay === d;
                const hasEvent = eventDaysInMonth.has(d);

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : d)}
                    className={`${styles.dayCell} ${isSelected ? styles.daySelected : ""}`}
                    aria-label={`${calMonthName} ${d}, ${calYear}`}
                    aria-pressed={isSelected}
                  >
                    {d}
                    {hasEvent && <span className={styles.dayDotIndicator} />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Widget 2: Event Statistics */}
          <section className={styles.statsWidget} aria-label="Monthly Participation Metrics">
            <h2 className={styles.statsTitle}>EVENT STATISTICS</h2>

            <div className={styles.statsRowsList}>
              <div className={styles.statRow}>
                <span className={styles.statRowLabel}>Visible upcoming</span>
                <span className={`${styles.statRowValue} ${styles.valGold}`}>{events.length}</span>
              </div>

              <div className={styles.statRow}>
                <span className={styles.statRowLabel}>Workshops</span>
                <span className={`${styles.statRowValue} ${styles.valGreen}`}>
                  {events.filter((e) => e.type.includes("workshop")).length}
                </span>
              </div>

              <div className={styles.statRow}>
                <span className={styles.statRowLabel}>Hackathons</span>
                <span className={`${styles.statRowValue} ${styles.valBlue}`}>
                  {events.filter((e) => e.type.includes("hackathon")).length}
                </span>
              </div>
            </div>

            {/* Participation Target Progress Bar */}
            <div className={styles.progressSection}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.round(eventDaysInMonth.size / daysInMonth * 100)}%` }}
                />
              </div>
              <span className={styles.progressFootnote}>
                {eventDaysInMonth.size} EVENT DAYS THIS MONTH
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
