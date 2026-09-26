"use client";

import { useState } from "react";
import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { allEvents } from "@/lib/eventsData";
import styles from "./EventsManagement.module.css";

export type CalendarEventItem = {
  id: string;
  month: string;
  day: number;
  title: string;
  type: "hackathon" | "workshop" | "meetup";
  typeLabel: string;
  time: string;
  location: string;
  statusText: string;
  statusType: "registered" | "slots" | "available" | "limited" | "full";
  actionState: "joined" | "rsvp" | "closed";
  slug: string;
};

const initialEvents: CalendarEventItem[] = [
  {
    id: "evt_hacksprint_v3",
    slug: "reinforce-hacksprint-v3",
    month: "SEP",
    day: 10,
    title: "Reinforce HackSprint v3.0",
    type: "hackathon",
    typeLabel: "HACKATHON",
    time: "18:00 IST",
    location: "Guild Main Lab",
    statusText: "REGISTERED",
    statusType: "registered",
    actionState: "joined",
  },
  {
    id: "evt_multi_agent_rl",
    slug: "multi-agent-rl-advanced-deep-dive",
    month: "SEP",
    day: 12,
    title: "Multi-Agent RL Advanced Deep Dive",
    type: "workshop",
    typeLabel: "WORKSHOP",
    time: "10:30 IST",
    location: "Virtual • Discord",
    statusText: "12 SLOTS LEFT",
    statusType: "slots",
    actionState: "rsvp",
  },
  {
    id: "evt_founders_office_hours",
    slug: "founders-weekly-office-hours",
    month: "SEP",
    day: 15,
    title: "Founders Weekly Office Hours",
    type: "meetup",
    typeLabel: "MEETUP",
    time: "16:00 IST",
    location: "Building C, Room 402",
    statusText: "AVAILABLE",
    statusType: "available",
    actionState: "rsvp",
  },
  {
    id: "evt_kaggle_fireside",
    slug: "kaggle-grandmaster-fireside-chat",
    month: "SEP",
    day: 18,
    title: "Kaggle Grandmaster Fireside Chat",
    type: "hackathon",
    typeLabel: "HACKATHON",
    time: "20:00 IST",
    location: "Discord Stage",
    statusText: "LIMITED",
    statusType: "limited",
    actionState: "rsvp",
  },
  {
    id: "evt_deploying_llms",
    slug: "deploying-llms-with-vllm-triton",
    month: "SEP",
    day: 21,
    title: "Deploying LLMs with vLLM & Triton",
    type: "workshop",
    typeLabel: "WORKSHOP",
    time: "09:00 IST",
    location: "Guild Lab A",
    statusText: "FULL",
    statusType: "full",
    actionState: "closed",
  },
];

const septCalendarDays = Array.from({ length: 30 }, (_, i) => i + 1);
const eventDaysList = [9, 10, 12, 15, 18, 21];

export default function EventsManagementClient() {
  const [activeTab, setActiveTab] = useState<"ALL" | "WORKSHOPS" | "HACKATHONS" | "MEETUPS">("ALL");
  const [selectedDay, setSelectedDay] = useState(10);
  const [events, setEvents] = useState<CalendarEventItem[]>(initialEvents);

  const handleToggleRsvp = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== id || ev.actionState === "closed") return ev;
        if (ev.actionState === "joined") {
          return {
            ...ev,
            actionState: "rsvp",
            statusText: "AVAILABLE",
            statusType: "available",
          };
        } else {
          return {
            ...ev,
            actionState: "joined",
            statusText: "REGISTERED",
            statusType: "registered",
          };
        }
      })
    );
  };

  const filteredEvents = events.filter((ev) => {
    if (activeTab === "WORKSHOPS") return ev.type === "workshop";
    if (activeTab === "HACKATHONS") return ev.type === "hackathon";
    if (activeTab === "MEETUPS") return ev.type === "meetup";
    return true;
  });

  const getTypeClass = (type: string) => {
    switch (type) {
      case "hackathon":
        return styles.typeHackathon;
      case "workshop":
        return styles.typeWorkshop;
      case "meetup":
        return styles.typeMeetup;
      default:
        return styles.typeHackathon;
    }
  };

  const getStatusTypeClass = (type: string) => {
    switch (type) {
      case "registered":
        return styles.statusRegistered;
      case "slots":
        return styles.statusSlots;
      case "available":
        return styles.statusAvailable;
      case "limited":
        return styles.statusLimited;
      case "full":
        return styles.statusFull;
      default:
        return styles.statusAvailable;
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Top Header Row with Title and Category Filters */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>EVENTS CALENDAR</h1>
          <p className={styles.pageSubtitle}>
            Sync your schedule with the guild&apos;s core milestones and workshops.
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
              onClick={() => setActiveTab(tab)}
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
          {filteredEvents.map((ev) => (
            <article key={ev.id} className={styles.eventCard}>
              <Link href={`/dashboard/events/${ev.id}`} className={styles.eventLeftArea} style={{ textDecoration: "none", flex: 1 }}>
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
                  <span className={`${styles.statusValue} ${getStatusTypeClass(ev.statusType)}`}>
                    {ev.statusText}
                  </span>
                </div>

                {ev.actionState === "joined" ? (
                  <button
                    type="button"
                    onClick={(e) => handleToggleRsvp(ev.id, e)}
                    className={`${styles.actionBtn} ${styles.btnJoined}`}
                    aria-label={`Joined ${ev.title}. Click to cancel RSVP`}
                  >
                    JOINED
                  </button>
                ) : ev.actionState === "rsvp" ? (
                  <button
                    type="button"
                    onClick={(e) => handleToggleRsvp(ev.id, e)}
                    className={`${styles.actionBtn} ${styles.btnRsvp}`}
                    aria-label={`RSVP for ${ev.title}`}
                  >
                    RSVP NOW
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className={`${styles.actionBtn} ${styles.btnClosed}`}
                    aria-disabled="true"
                  >
                    CLOSED
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>

        {/* Right Column: Calendar & Statistics Widgets */}
        <div className={styles.rightWidgets}>
          {/* Widget 1: Schedule Calendar */}
          <section className={styles.calendarWidget} aria-label="Interactive Event Calendar">
            <div className={styles.calendarTop}>
              <div>
                <h2 className={styles.calMonthTitle}>September 2025</h2>
                <span className={styles.calScheduleSubtitle}>SCHEDULE VIEW</span>
              </div>

              <div className={styles.calNavGroup}>
                <button
                  type="button"
                  className={styles.calNavBtn}
                  aria-label="Previous month"
                >
                  <MemberIcon name="chevron-left" size={14} />
                </button>
                <button
                  type="button"
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
              {/* Previous month placeholder day */}
              <span className={styles.dayMuted} aria-hidden="true">31</span>

              {septCalendarDays.map((d) => {
                const isSelected = selectedDay === d;
                const hasEvent = eventDaysList.includes(d);

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={`${styles.dayCell} ${isSelected ? styles.daySelected : ""}`}
                    aria-label={`September ${d}, 2025`}
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
                <span className={styles.statRowLabel}>Total Events (Sep)</span>
                <span className={`${styles.statRowValue} ${styles.valGold}`}>14</span>
              </div>

              <div className={styles.statRow}>
                <span className={styles.statRowLabel}>Workshops Completed</span>
                <span className={`${styles.statRowValue} ${styles.valGreen}`}>4</span>
              </div>

              <div className={styles.statRow}>
                <span className={styles.statRowLabel}>Merit Points Earned</span>
                <span className={`${styles.statRowValue} ${styles.valBlue}`}>+450</span>
              </div>
            </div>

            {/* Participation Target Progress Bar */}
            <div className={styles.progressSection}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: "65%" }} />
              </div>
              <span className={styles.progressFootnote}>65% MONTHLY PARTICIPATION TARGET</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
