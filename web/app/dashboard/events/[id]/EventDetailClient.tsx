"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { type EventDocument } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
import EventAttendeesPanel from "./EventAttendeesPanel";
import EventAttendancePanel from "./EventAttendancePanel";
import styles from "./EventDetail.module.css";

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      const lower = inner.toLowerCase();
      let trackStyle: React.CSSProperties | undefined;
      if (lower.includes("research")) {
        trackStyle = { color: "#f87171", fontWeight: 750 };
      } else if (lower.includes("product")) {
        trackStyle = { color: "#4ade80", fontWeight: 750 };
      } else if (lower.includes("kaggle")) {
        trackStyle = { color: "#38c8ff", fontWeight: 750 };
      }
      return (
        <strong key={i} className={styles.mdBold} style={trackStyle}>
          {inner}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "#1c1c22",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "var(--brand, #E5B731)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.85em",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(md?: string | null) {
  if (!md) {
    return <p className={styles.mdParagraph}>No additional specifications published for this event yet.</p>;
  }

  const normalized = md
    .replace(/([^\n#])\s*(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\s*(\d+\.\s+\*\*)/g, "$1\n$2")
    .replace(/([^\n])\s*([*-]\s+\*\*)/g, "$1\n$2");

  const lines = normalized.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    if (currentList.type === "ul") {
      elements.push(
        <ul key={`ul-${elements.length}`} className={styles.mdList}>
          {currentList.items.map((item, idx) => (
            <li key={idx} className={styles.mdListItem}>
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`ol-${elements.length}`} className={styles.mdOrderedList}>
          {currentList.items.map((item, idx) => (
            <li key={idx} className={styles.mdOrderedItem}>
              {formatInline(item)}
            </li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || /^#+$/.test(rawLine)) {
      flushList();
      continue;
    }

    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      if (level === 1) {
        elements.push(
          <h1 key={`h1-${i}`} className={styles.mdHeading}>
            {formatInline(title)}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2 key={`h2-${i}`} className={styles.mdHeading}>
            {formatInline(title)}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={`h3-${i}`} className={styles.mdHeading}>
            {formatInline(title)}
          </h3>
        );
      }
    } else if (/^([-*_]\s*){3,}$/.test(rawLine) || /^<hr\s*\/?>$/i.test(rawLine)) {
      flushList();
      elements.push(
        <hr key={`hr-${i}`} className={styles.mdDivider} />
      );
    } else if (/^(\*|-)\s+/.test(rawLine)) {
      const itemText = rawLine.replace(/^(\*|-)\s+/, "");
      if (currentList && currentList.type === "ul") {
        currentList.items.push(itemText);
      } else {
        flushList();
        currentList = { type: "ul", items: [itemText] };
      }
    } else if (/^\d+\.\s+/.test(rawLine)) {
      const itemText = rawLine.replace(/^\d+\.\s+/, "");
      if (currentList && currentList.type === "ol") {
        currentList.items.push(itemText);
      } else {
        flushList();
        currentList = { type: "ol", items: [itemText] };
      }
    } else {
      flushList();
      elements.push(
        <p key={`p-${i}`} className={styles.mdParagraph}>
          {formatInline(rawLine)}
        </p>
      );
    }
  }

  flushList();
  return <div className={styles.mdContainer}>{elements}</div>;
}

export default function EventDetailClient({ event }: { event: EventDocument }) {
  const { token, profile } = useMember();
  const isAdmin = Boolean(profile?.is_admin);
  const [activeTab, setActiveTab] = useState<"overview" | "attendees" | "attendance">("overview");

  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teammateIds, setTeammateIds] = useState("");
  const [registeredCount, setRegisteredCount] = useState(event.stats?.registered_count ?? 0);
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    const deadline = event.schedule?.registration_deadline;
    const check = () => setDeadlinePassed(Boolean(deadline && Date.parse(deadline) <= Date.now()));
    const initial = setTimeout(check, 0);
    const interval = setInterval(check, 60_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [event.schedule?.registration_deadline]);

  useEffect(() => {
    let active = true;
    api.myEventRegistration(token, event.id).then((result) => {
      if (active) {
        setIsRegistered(result.is_registered);
        setRegistrationStatus(result.registration?.status || "");
      }
    }).catch(() => { if (active) setRegistrationError("Registration status could not be loaded."); })
      .finally(() => { if (active) setRegistrationLoading(false); });
    return () => { active = false; };
  }, [token, event.id]);

  const handleToggleRsvp = async () => {
    if (registrationBusy || registrationLoading) return;
    setRegistrationBusy(true);
    setRegistrationError("");
    try {
      if (isRegistered) {
        await api.cancelEventRegistration(token, event.id);
        setIsRegistered(false);
        setRegistrationStatus("");
      } else {
        const memberUids = teammateIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
        if (event.participation?.mode === "team" && !teamName.trim()) {
          setRegistrationError("Enter a team name before registering.");
          return;
        }
        const result = await api.registerForEvent(token, event.id, event.participation?.mode === "team"
          ? { team_name: teamName.trim(), member_uids: memberUids } : {});
        setIsRegistered(true);
        setRegistrationStatus(result.status);
      }
      const refreshed = await api.getEvent(event.id, token);
      setRegisteredCount(refreshed.stats?.registered_count ?? registeredCount);
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Registration could not be updated.");
    } finally {
      setRegistrationBusy(false);
    }
  };

  const getTrackChipClass = (track: string) => {
    switch (track) {
      case "research":
        return styles.trackChipResearch;
      case "product":
        return styles.trackChipProduct;
      case "kaggle":
        return styles.trackChipKaggle;
      default:
        return styles.trackChipMisc;
    }
  };

  const formattedStartTime = event.schedule?.start_time
    ? new Date(event.schedule.start_time).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "TBD";

  const formattedDeadline = event.schedule?.registration_deadline
    ? new Date(event.schedule.registration_deadline).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No deadline specified";

  const durationMinutes = event.schedule?.duration_minutes ?? (
    event.schedule?.start_time && event.schedule?.end_time
      ? Math.max(0, Math.round((new Date(event.schedule.end_time).getTime() - new Date(event.schedule.start_time).getTime()) / 60000))
      : null
  );

  const capacity = event.participation?.max_participants;
  const eligibleYears = event.eligibility?.allowed_years;
  const legacyDefaultYears = eligibleYears?.length === 4 && [1, 2, 3, 4].every((year) => eligibleYears.includes(year));
  const displayedBatches = legacyDefaultYears ? getEventGraduationBatches() : eligibleYears;
  const fillPercent = capacity ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;
  const registrationOpen = (event.status === "published" || event.status === "ongoing") && !deadlinePassed;

  return (
    <div className={styles.pageContainer}>
      {/* Back Link & Breadcrumb */}
      <div className={styles.backRow}>
        <Link href="/dashboard/events" className={styles.backBtn}>
          ← Back to Events Planner
        </Link>

        <div className={styles.statusChipsRow}>
          <span className={styles.formatChip}>{(event.format || "ONLINE").toUpperCase()}</span>
          <span className={getTrackChipClass(event.track || "misc")}>
            {(event.track || "GENERAL").toUpperCase()} TRACK
          </span>
          <span className={styles.typeChip}>{(event.event_type || "EVENT").toUpperCase()}</span>
        </div>
      </div>

      {/* Hero Banner Card */}
      <section className={styles.heroBanner} aria-label="Event Hero Banner">
        <div className={styles.heroGlow} />

        <div className={event.banner_url ? styles.heroLayoutGrid : styles.heroLayoutSingle}>
          {event.banner_url && (
            <div className={styles.eventCoverWrapper}>
              <img
                src={event.banner_url}
                alt={event.title}
                className={styles.eventCoverImage}
              />
            </div>
          )}

          {/* Right 50% Side Panel: Heading, Description, and Buttons */}
          <div className={styles.heroSidePanel}>
            <div className={styles.heroTopMeta}>
              <h1 className={styles.eventTitle}>{event.title}</h1>
            </div>

            {event.description && (
              <p className={styles.eventSubtitle}>{event.description}</p>
            )}

            <div className={styles.heroActionRow}>
              <button
                type="button"
                className={isRegistered ? styles.joinedButton : styles.rsvpButton}
                onClick={handleToggleRsvp}
                disabled={registrationBusy || registrationLoading || (!isRegistered && !registrationOpen)}
              >
                {isRegistered ? (
                  <>
                    <MemberIcon name="check" size={16} />
                    {registrationStatus === "waitlisted" ? "Waitlisted" : "Registered"} (Cancel RSVP)
                  </>
                ) : (
                  <>
                    <MemberIcon name="plus" size={16} />
                    {!registrationOpen ? "Registration Closed" : event.participation?.mode === "team" ? "Register Team (RSVP)" : "RSVP for Event"}
                  </>
                )}
              </button>

              {/* Registration Count & Status Beside the RSVP Button */}
              <div className={styles.regStatusPill}>
                <span className={styles.regCountText}>
                  <MemberIcon name="users" size={14} />
                  <strong>{registeredCount}</strong>
                  {capacity ? ` / ${capacity}` : ""} Registered
                </span>
                <span className={styles.regStatusDivider}>•</span>
                <span
                  className={
                    isRegistered
                      ? registrationStatus === "waitlisted"
                        ? styles.statusWaitlisted
                        : styles.statusRegistered
                      : !registrationOpen
                      ? styles.statusClosed
                      : styles.statusOpen
                  }
                >
                  {isRegistered
                    ? registrationStatus === "waitlisted"
                      ? "Waitlisted"
                      : "✓ Registered"
                    : !registrationOpen
                    ? "Closed"
                    : "RSVP Open"}
                </span>
              </div>

              {event.venue_info?.meeting_url && (
                <a
                  href={event.venue_info.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.discordThreadLink}
                >
                  <MemberIcon name="discord" size={16} />
                  Open Meeting
                </a>
              )}
            </div>

            {event.participation?.mode === "team" && registrationOpen && !isRegistered && (
              <div className={styles.teamInputBlock}>
                <input
                  aria-label="Team name"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.teamFieldInput}
                />
                <input
                  aria-label="Teammate user IDs"
                  placeholder="Teammate IDs, comma-separated"
                  value={teammateIds}
                  onChange={(e) => setTeammateIds(e.target.value)}
                  className={styles.teamFieldInput}
                />
                <span className={styles.teamHintText}>
                  Your account is included automatically.
                </span>
              </div>
            )}

            {registrationError && (
              <p role="alert" className={styles.regErrorAlert}>
                {registrationError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Event Details Navigation Tabs */}
      <div className={styles.eventTabsBar}>
        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "overview" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <MemberIcon name="calendar" size={15} />
          Overview & Specifications
        </button>

        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "attendees" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("attendees")}
        >
          <MemberIcon name="users" size={15} />
          Registered Attendees & SPGs
          {registeredCount > 0 && <span className={styles.tabCountBadge}>{registeredCount}</span>}
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`${styles.eventTabBtn} ${activeTab === "attendance" ? styles.eventTabBtnActive : ""}`}
            onClick={() => setActiveTab("attendance")}
          >
            <MemberIcon name="shield" size={15} />
            Attendance Management (Admin)
          </button>
        )}
      </div>

      {/* TAB 1: OVERVIEW & SPECIFICATIONS */}
      {activeTab === "overview" && (
        <div className={styles.mainGrid}>
        {/* Left Main Column */}
        <div className={styles.contentColumn}>
          {/* Detailed Overview */}
          <section className={styles.sectionCard} aria-label="Event Detailed Overview">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="articles" size={18} />
              Event Agenda & Specifications
            </h2>
            <div className={styles.sectionBody}>
              {renderMarkdown(event.detailed_info || event.description)}
            </div>
          </section>

          {/* Participation & Team Formation (SPG) */}
          <section className={styles.sectionCard} aria-label="Participation Guidelines">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="users" size={18} />
              Participation & SPG Formation
            </h2>

            <div className={styles.spgInfoBox}>
              <div className={styles.spgHeader}>
                <span className={styles.spgTag}>
                  {event.participation?.mode === "team" ? "TEAM EVENT" : "SOLO PARTICIPATION"}
                </span>
                {event.participation?.requires_event_spg && (
                  <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: "750" }}>
                    ✓ Auto-provisions temporary Event SPG
                  </span>
                )}
              </div>

              <div className={styles.spgRuleList}>
                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Team Size</span>
                  <span className={styles.ruleVal}>
                    {event.participation?.mode === "team"
                      ? `${event.participation.min_team_size ?? 1} - ${event.participation.max_team_size ?? 1} Members`
                      : "Individual (Solo)"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>SPG Auto-Disband</span>
                  <span className={styles.ruleVal}>
                    {event.participation?.requires_event_spg
                      ? `${event.participation?.spg_auto_disband_days || 3} Days after event`
                      : "N/A"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Access Scope</span>
                  <span className={styles.ruleVal}>
                    {event.eligibility?.access_scope === "invite_only" ? "Invite Only" :
                      event.eligibility?.access_scope === "members_only" ? "Members Only" : "Open to All Students"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Eligibility</span>
                  <span className={styles.ruleVal}>
                    {displayedBatches?.length
                      ? `${legacyDefaultYears || displayedBatches.every((year) => year >= 1900) ? "Batches" : "Years"}: ${displayedBatches.join(", ")}`
                      : "All Batches"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Resources & Downloads */}
          <section className={styles.sectionCard} aria-label="Event Artifacts & Materials">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="tag" size={18} />
              Event Materials & Links
            </h2>

            <div className={styles.resourcesList}>
              {event.resources?.slides_url && (
                <a
                  href={event.resources.slides_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>📄 Presentation Slides & Technical Brief</span>
                  <span>Open Slides →</span>
                </a>
              )}
              {event.resources?.writeup_url && (
                <a
                  href={event.resources.writeup_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>💻 Starter Repository & Notebooks</span>
                  <span>GitHub →</span>
                </a>
              )}
              {event.resources?.recording_url && (
                <a
                  href={event.resources.recording_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>🎥 Workshop Video Recording</span>
                  <span>Watch →</span>
                </a>
              )}
              {!event.resources?.slides_url &&
                !event.resources?.writeup_url &&
                !event.resources?.recording_url && (
                  <p style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                    No event materials have been published yet.
                  </p>
                )}
            </div>
          </section>
        </div>

        {/* Right Sidebar Column */}
        <aside className={styles.sidebarColumn} aria-label="Event Key Details Sidebar">
          {/* Merit Reward Card */}
          <div className={styles.pointsRewardCard}>
            <div className={styles.pointsTextGroup}>
              <span className={styles.pointsLabel}>Merit Points Reward</span>
              <span className={styles.pointsAmount}>
                +{event.points_reward?.attendance_points ?? 0} PTS
              </span>
            </div>
            <MemberIcon name="award" size={28} />
          </div>

          {/* Quick Specs */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={16} />
              Schedule & Location
            </h2>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="calendar" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Date & Start Time</span>
                  <span className={styles.specValue}>{formattedStartTime}</span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="clock" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Estimated Duration</span>
                  <span className={styles.specValue}>
                    {durationMinutes ? `${durationMinutes} Minutes` : "Not specified"}
                  </span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="location" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Venue / Stage</span>
                  <span className={styles.specValue}>
                    {event.venue_info?.venue_name ||
                      (event.format === "online" ? "Online; link to be announced" : "Venue to be announced")}
                    {event.venue_info?.room ? ` (${event.venue_info.room})` : ""}
                  </span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="shield" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>RSVP Deadline</span>
                  <span className={styles.specValue}>{formattedDeadline}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Participation Stats */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="users" size={16} />
              Registration Status
            </h2>

            <div className={styles.statsWidget}>
              <div className={styles.statRow}>
                <span style={{ color: "#8c8c98" }}>Confirmed Attendees</span>
                <span className={styles.statValueMono}>
                  {registeredCount}{capacity ? ` / ${capacity}` : ""}
                </span>
              </div>

              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${fillPercent}%` }} />
              </div>

              <div className={styles.statRow}>
                <span style={{ color: "#8c8c98" }}>Average Rating</span>
                <span
                  style={{
                    color: "var(--brand, #E5B731)",
                    fontWeight: "800",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {event.stats?.feedback_count ? `⭐ ${(event.stats.average_rating ?? 0).toFixed(1)} / 5.0` : "No ratings yet"}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      )}

      {/* TAB 2: REGISTERED ATTENDEES & SPGS */}
      {activeTab === "attendees" && (
        <section className={styles.sectionCard} aria-label="Registered Attendees">
          <EventAttendeesPanel eventId={event.id} token={token} />
        </section>
      )}

      {/* TAB 3: ADMIN ATTENDANCE MANAGEMENT */}
      {activeTab === "attendance" && isAdmin && (
        <section className={styles.sectionCard} aria-label="Attendance Console">
          <EventAttendancePanel
            eventId={event.id}
            token={token}
            attendancePoints={event.points_reward?.attendance_points ?? 0}
          />
        </section>
      )}
    </div>
  );
}
