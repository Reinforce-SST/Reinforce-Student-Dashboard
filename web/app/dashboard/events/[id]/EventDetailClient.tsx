"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
import { type EventDocument, type LearningResource, type EventRegistration } from "@/lib/api";
import type { EventSubmissionPayload, TimelineItemSchema } from "@/types/event-matrix";
import { formatEventDuration, getEventGraduationBatches } from "@/lib/eventsData";
import EventAttendeesPanel from "./EventAttendeesPanel";
import EventAttendancePanel from "./EventAttendancePanel";
import EventTimelineSection from "./EventTimelineSection";
import RsvpIntakeModal from "./RsvpIntakeModal";
import ProjectSubmissionModal from "./ProjectSubmissionModal";
import EditResponsesModal from "./EditResponsesModal";
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
    .replace(/([^\n#])\s*(#{1,6}(?:\s+|[^\s#a-zA-Z0-9_\/:]))/g, "$1\n\n$2")
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

    const headingMatch = rawLine.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch && headingMatch[2].trim()) {
      flushList();
      const level = headingMatch[1].length;
      const title = headingMatch[2].replace(/\s+#+$/, "").trim();
      if (level === 1) {
        elements.push(
          <h1 key={`h1-${i}`} className={styles.mdHeading1}>
            {formatInline(title)}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2 key={`h2-${i}`} className={styles.mdHeading2}>
            {formatInline(title)}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={`h3-${i}`} className={styles.mdHeading3}>
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
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "attendees" | "attendance">("overview");

  const [isRegistered, setIsRegistered] = useState(false);
  const [myRegistration, setMyRegistration] = useState<EventRegistration | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teammates, setTeammates] = useState<PickedMember[]>([]);
  const minTeamSize = Math.max(1, event.participation?.min_team_size ?? 1);
  const maxTeamSize = Math.max(1, event.participation?.max_team_size ?? 1);
  const [registeredCount, setRegisteredCount] = useState(event.stats?.registered_count ?? 0);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [linkedResources, setLinkedResources] = useState<LearningResource[]>([]);
  const [linkedResourcesLoading, setLinkedResourcesLoading] = useState(false);
  const [linkedResourcesError, setLinkedResourcesError] = useState(false);
  const linkedResourceIdsKey = (event.resources?.learning_resource_ids ?? []).join("|");

  // Modals & Interactive States
  const [showRsvpModal, setShowRsvpModal] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showEditResponsesModal, setShowEditResponsesModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [switchingTrack, setSwitchingTrack] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Active Milestone computation
  const activeTimelineStage = useMemo(() => {
    if (!event.timeline || event.timeline.length === 0 || !currentTime) return null;
    const now = currentTime;
    const sorted = [...event.timeline].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    // 1. Current in-progress milestone
    const current = sorted.find((m) => {
      if (m.status_override === "live") return true;
      const s = new Date(m.start_time).getTime();
      const e = m.end_time ? new Date(m.end_time).getTime() : s + 3600000;
      return now >= s && now <= e;
    });
    if (current) return { item: current, isCurrent: true };

    // 2. Next upcoming milestone
    const upcoming = sorted.find((m) => {
      if (m.status_override === "upcoming") return true;
      const s = new Date(m.start_time).getTime();
      return s > now;
    });
    if (upcoming) return { item: upcoming, isCurrent: false };

    return null;
  }, [event.timeline, currentTime]);

  useEffect(() => {
    const deadline = event.schedule?.registration_deadline;
    const check = () => setDeadlinePassed(Boolean(deadline && Date.parse(deadline) <= Date.now()));
    const initial = setTimeout(check, 0);
    const interval = setInterval(check, 60_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [event.schedule?.registration_deadline]);

  useEffect(() => {
    if (!token || !event?.id) return;
    let active = true;
    api.myEventRegistration(token, event.id).then((result) => {
      if (active) {
        setIsRegistered(result.is_registered);
        setMyRegistration(result.registration);
        setRegistrationStatus(result.registration?.status || "");
      }
    }).catch(() => { if (active) setRegistrationError("Registration status could not be loaded."); })
      .finally(() => { if (active) setRegistrationLoading(false); });
    return () => { active = false; };
  }, [token, event.id]);

  useEffect(() => {
    let active = true;
    if (!linkedResourceIdsKey) {
      setLinkedResources([]);
      setLinkedResourcesError(false);
      setLinkedResourcesLoading(false);
      return () => { active = false; };
    }
    setLinkedResourcesLoading(true);
    setLinkedResourcesError(false);
    api.getEventLearningResources(event.id, token)
      .then((result) => { if (active) setLinkedResources(result.resources); })
      .catch(() => { if (active) setLinkedResourcesError(true); })
      .finally(() => { if (active) setLinkedResourcesLoading(false); });
    return () => { active = false; };
  }, [token, event.id, linkedResourceIdsKey]);

  const handleToggleRsvp = async () => {
    if (registrationBusy || registrationLoading) return;
    setRegistrationError("");

    if (isRegistered) {
      setRegistrationBusy(true);
      try {
        await api.cancelEventRegistration(token, event.id);
        setIsRegistered(false);
        setMyRegistration(null);
        setRegistrationStatus("");
        const refreshed = await api.getEvent(event.id, token);
        setRegisteredCount(refreshed.stats?.registered_count ?? Math.max(0, registeredCount - 1));
      } catch (err) {
        setRegistrationError(err instanceof Error ? err.message : "Failed to cancel registration.");
      } finally {
        setRegistrationBusy(false);
      }
      return;
    }

    // If event has custom fields, tracks, or requires team details, open the modal for a smooth experience
    const hasCustomFields = (event.custom_registration_fields?.length ?? 0) > 0;
    const hasTracks = (event.event_tracks?.length ?? 0) > 0;
    const isTeam = event.participation?.mode === "team";

    if (hasCustomFields || hasTracks || isTeam) {
      setShowRsvpModal(true);
      return;
    }

    // Direct solo registration for basic events
    setRegistrationBusy(true);
    try {
      const result: any = await api.registerForEvent(token, event.id, {});
      setIsRegistered(true);
      setRegistrationStatus(result.status || "registered");
      setMyRegistration(result);
      api.myEventRegistration(token, event.id).then((fresh) => {
        if (fresh.is_registered && fresh.registration) {
          setMyRegistration(fresh.registration);
        }
      });
      const refreshed = await api.getEvent(event.id, token);
      setRegisteredCount(refreshed.stats?.registered_count ?? registeredCount + 1);
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Registration could not be completed.");
    } finally {
      setRegistrationBusy(false);
    }
  };

  const handleSwitchTrack = async (newTrackId: string) => {
    if (!token || switchingTrack) return;
    let currentReg = myRegistration;
    if (!currentReg?.id) {
      try {
        const fresh = await api.myEventRegistration(token, event.id);
        if (fresh.registration) {
          currentReg = fresh.registration;
          setMyRegistration(fresh.registration);
        }
      } catch {
        // continue
      }
    }
    if (!currentReg?.id) {
      setRegistrationError("Could not locate registration record to switch tracks.");
      return;
    }
    setSwitchingTrack(true);
    setRegistrationError("");
    try {
      const res = await api.updateRegistrationTrack(token, event.id, currentReg.id, newTrackId);
      setMyRegistration((prev) => (prev ? { ...prev, selected_track_id: res.selected_track_id } : prev));
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to switch track.");
    } finally {
      setSwitchingTrack(false);
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
  const isDraftMode = event.status === "draft";
  const registrationOpen =
    ((event.status === "published" || event.status === "ongoing") || (isAdmin && isDraftMode)) &&
    !deadlinePassed;

  return (
    <div className={styles.pageContainer}>
      {/* Back Link & Breadcrumb */}
      <div className={styles.backRow}>
        <Link href="/dashboard/events" className={styles.backBtn}>
          ← Back to Events Planner
        </Link>

        <div className={styles.statusChipsRow}>
          {isDraftMode ? (
            <span className={styles.draftStatusChip}>
              🔒 DRAFT MODE (ADMIN ONLY)
            </span>
          ) : (
            <span className={styles.formatChip}>{(event.format || "ONLINE").toUpperCase()}</span>
          )}
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
              {activeTimelineStage && (
                <div className={styles.activeMilestonePill}>
                  <span className={styles.pulseDot} />
                  <span>
                    <strong>{activeTimelineStage.isCurrent ? "Active Stage:" : "Next Stage:"}</strong>{" "}
                    {activeTimelineStage.item.title}
                  </span>
                </div>
              )}
            </div>

            {isDraftMode && (
              <div className={styles.draftModeAlertBanner}>
                <MemberIcon name="shield" size={14} />
                <span>
                  <strong>Admin Draft Mode:</strong> This event is invisible to regular members. Admins can test registration, matrix operations, and deliverables workflows.
                </span>
              </div>
            )}

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
                    {!registrationOpen
                      ? "Registration Closed"
                      : isDraftMode
                      ? event.participation?.mode === "team"
                        ? "Test Register Team (Draft)"
                        : "Test RSVP (Draft)"
                      : event.participation?.mode === "team"
                      ? "Register Team (RSVP)"
                      : "RSVP for Event"}
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
                    : isDraftMode
                    ? "Draft (Admin Test)"
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

              {(isAdmin || event.can_access_matrix) && (
                <Link
                  href={`/dashboard/events/${encodeURIComponent(event.slug || event.id)}/matrix`}
                  className={styles.heroMatrixLink}
                  title="Open live Event Matrix in a dedicated view"
                >
                  <MemberIcon name="table" size={15} />
                  Open Event Matrix ↗
                </Link>
              )}
            </div>

            {/* Registered attendee metadata: Team Invite Code, Track Switcher, Roster Lock */}
            {isRegistered && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                {myRegistration?.invite_code && (
                  <div className={styles.teamInvitePill}>
                    <span>Team Code:</span>
                    <span className={styles.inviteCodeMono}>{myRegistration.invite_code}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (myRegistration?.invite_code) {
                          navigator.clipboard.writeText(myRegistration.invite_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }
                      }}
                      className={styles.copyCodeBtn}
                      title="Copy team invite code"
                    >
                      <MemberIcon name="tag" size={11} />
                      {copiedCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}

                {event.team_settings?.lock_rosters_at && (
                  <div className={styles.rosterLockWarning}>
                    <MemberIcon name="clock" size={12} />
                    <span>
                      {currentTime > 0 && currentTime >= new Date(event.team_settings.lock_rosters_at).getTime()
                        ? "🔒 Rosters Locked"
                        : `Rosters lock ${new Date(event.team_settings.lock_rosters_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  </div>
                )}

                {event.event_tracks && event.event_tracks.length > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#8c8c98" }}>Track:</span>
                    <select
                      value={myRegistration?.selected_track_id || ""}
                      onChange={(e) => handleSwitchTrack(e.target.value)}
                      disabled={switchingTrack}
                      style={{
                        background: "#18181c",
                        border: "1px solid #31343a",
                        color: "#e5b731",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">-- No Track --</option>
                      {event.event_tracks.map((tr) => (
                        <option key={tr.track_id} value={tr.track_id}>
                          {tr.name} {tr.max_teams ? `(Cap: ${tr.max_teams})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {event.participation?.mode === "team" && registrationOpen && !isRegistered && (
              <div className={styles.teamInputBlock}>
                <input
                  aria-label="Team name"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.teamFieldInput}
                />
                {maxTeamSize > 1 && (
                  <MemberPicker
                    token={token}
                    label="Teammates"
                    selected={teammates}
                    onChange={setTeammates}
                    excludeIds={profile?.id ? [profile.id] : []}
                    max={maxTeamSize - 1}
                  />
                )}
                <span className={styles.teamHintText}>
                  You are included automatically.{" "}
                  {minTeamSize === maxTeamSize
                    ? `Teams have exactly ${maxTeamSize} ${maxTeamSize === 1 ? "member" : "members"}.`
                    : `Teams have ${minTeamSize}–${maxTeamSize} members.`}
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
          className={`${styles.eventTabBtn} ${activeTab === "timeline" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          <MemberIcon name="clock" size={15} />
          Timeline & Milestones
          {event.timeline && event.timeline.length > 0 && (
            <span className={styles.tabCountBadge}>{event.timeline.length}</span>
          )}
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

        {(isAdmin || event.can_access_matrix) && (
          <Link
            href={`/dashboard/events/${encodeURIComponent(event.slug || event.id)}/matrix`}
            className={styles.eventTabMatrixLink}
          >
            <MemberIcon name="table" size={15} />
            Event Matrix ↗
          </Link>
        )}
      </div>

      {/* TAB 1: OVERVIEW & SPECIFICATIONS */}
      {activeTab === "overview" && (
        <div className={styles.mainGrid}>
        {/* Left Main Column */}
        <div className={styles.contentColumn}>
          {/* Project Deliverables Card (For Registered Attendees) */}
          {isRegistered && (
            <section className={styles.deliverablesCard} aria-label="Project Deliverables">
              <div className={styles.deliverablesHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    <MemberIcon name="articles" size={18} />
                    Project Deliverables & Submission
                  </h2>
                  <span
                    className={`${styles.deliverablesStatusTag} ${
                      myRegistration?.submission
                        ? styles.statusSubmitted
                        : styles.statusPending
                    }`}
                  >
                    {myRegistration?.submission
                      ? "✓ Submitted"
                      : "Submission Pending"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSubmissionModal(true)}
                  className={styles.openSubmissionModalBtn}
                >
                  <MemberIcon name="plus" size={14} />
                  {myRegistration?.submission
                    ? "Update Deliverables"
                    : "Submit Project Links"}
                </button>
              </div>

              {myRegistration?.submission ? (
                <div className={styles.deliverablesLinksList}>
                  {myRegistration.submission.repo_url && (
                    <a
                      href={myRegistration.submission.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.deliverableLinkItem}
                    >
                      <span>💻</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Repository
                      </span>
                    </a>
                  )}
                  {myRegistration.submission.slides_url && (
                    <a
                      href={myRegistration.submission.slides_url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.deliverableLinkItem}
                    >
                      <span>📊</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Pitch Slides
                      </span>
                    </a>
                  )}
                  {myRegistration.submission.demo_url && (
                    <a
                      href={myRegistration.submission.demo_url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.deliverableLinkItem}
                    >
                      <span>🎥</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Live Demo
                      </span>
                    </a>
                  )}
                  {myRegistration.submission.paper_link && (
                    <a
                      href={myRegistration.submission.paper_link}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.deliverableLinkItem}
                    >
                      <span>📄</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Paper / Writeup
                      </span>
                    </a>
                  )}
                  {myRegistration.submission.notes && (
                    <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "#a1a1aa", gridColumn: "1 / -1" }}>
                      <strong>Notes:</strong> {myRegistration.submission.notes}
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "#8c8c98" }}>
                  No deliverables submitted yet. Upload your repository, pitch slides, or demo before the submission deadline.
                </p>
              )}
            </section>
          )}

          {/* Custom Intake Form Responses Card (For Registered Attendees) */}
          {isRegistered && (
            (event.custom_registration_fields?.length ?? 0) > 0 ||
            Boolean(myRegistration?.custom_responses && Object.keys(myRegistration.custom_responses).length > 0)
          ) && (
            <section className={styles.intakeCard} aria-label="Registration Form Answers">
              <div className={styles.intakeHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    <MemberIcon name="tag" size={18} />
                    Registration Form Responses
                  </h2>
                  <span
                    className={styles.deliverablesStatusTag}
                    style={{
                      background: "rgba(229, 183, 49, 0.12)",
                      color: "#e5b731",
                      border: "1px solid rgba(229, 183, 49, 0.3)",
                    }}
                  >
                    ✓ Intake Recorded
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEditResponsesModal(true)}
                  className={styles.editIntakeBtn}
                  title="Edit your submitted answers for this event"
                >
                  <MemberIcon name="edit" size={13} />
                  Edit Responses
                </button>
              </div>

              <div className={styles.intakeGrid}>
                {event.custom_registration_fields?.map((cf) => {
                  const val =
                    cf.applies_to === "team"
                      ? myRegistration?.custom_responses?.[cf.field_id]
                      : myRegistration?.member_responses?.[profile?.id || ""]?.[cf.field_id] ??
                        myRegistration?.custom_responses?.[cf.field_id];

                  const hasVal = val !== undefined && val !== null && val !== "";

                  return (
                    <div key={cf.field_id} className={styles.intakeFieldBox}>
                      <div className={styles.intakeFieldHeader}>
                        <span className={styles.intakeFieldLabel}>{cf.label}</span>
                        <span
                          className={styles.intakeFieldScope}
                          style={{
                            background:
                              cf.applies_to === "team"
                                ? "rgba(229, 183, 49, 0.12)"
                                : "rgba(56, 189, 248, 0.12)",
                            color: cf.applies_to === "team" ? "#e5b731" : "#38bdf8",
                            border: `1px solid ${
                              cf.applies_to === "team"
                                ? "rgba(229, 183, 49, 0.3)"
                                : "rgba(56, 189, 248, 0.3)"
                            }`,
                          }}
                        >
                          {cf.applies_to === "team" ? "Team" : "Individual"}
                        </span>
                      </div>

                      <div className={styles.intakeFieldValue}>
                        {!hasVal ? (
                          <span className={styles.intakeFieldValueEmpty}>Not provided</span>
                        ) : cf.field_type === "boolean" ? (
                          <span>{val ? "✓ Yes, Confirmed" : "✗ No"}</span>
                        ) : cf.field_type === "url" ? (
                          <a
                            href={String(val)}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.intakeFieldLink}
                          >
                            <span>🔗</span>
                            <span>{String(val)}</span>
                          </a>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

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
              {linkedResources.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>{resource.title}</span>
                  <span>Open link →</span>
                </a>
              ))}
              {linkedResourcesLoading && (
                <p style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                  Loading shared links…
                </p>
              )}
              {linkedResourcesError && (
                <p role="status" style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                  Shared event links could not be loaded.
                </p>
              )}
              {!event.resources?.slides_url &&
                !event.resources?.writeup_url &&
                !event.resources?.recording_url && (
                !linkedResourcesLoading && !linkedResourcesError && linkedResources.length === 0 && (
                  <p style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                    No event materials have been published yet.
                  </p>
                ))}
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
                    {formatEventDuration(durationMinutes)}
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

      {/* TAB 2: TIMELINE & MILESTONES */}
      {activeTab === "timeline" && (
        <section className={styles.sectionCard} aria-label="Event Timeline">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={18} />
              Event Milestone Schedule & Deadlines
            </h2>
          </div>
          <EventTimelineSection timeline={event.timeline || []} />
        </section>
      )}

      {/* TAB 3: REGISTERED ATTENDEES & SPGS */}
      {activeTab === "attendees" && (
        <section className={styles.sectionCard} aria-label="Registered Attendees">
          <EventAttendeesPanel eventId={event.id} token={token} />
        </section>
      )}

      {/* TAB 4: ADMIN ATTENDANCE MANAGEMENT */}
      {activeTab === "attendance" && isAdmin && (
        <section className={styles.sectionCard} aria-label="Attendance Console">
          <EventAttendancePanel
            eventId={event.id}
            token={token}
            attendancePoints={event.points_reward?.attendance_points ?? 0}
          />
        </section>
      )}

      {/* Dynamic RSVP Intake Modal */}
      <RsvpIntakeModal
        isOpen={showRsvpModal}
        onClose={() => setShowRsvpModal(false)}
        event={event}
        token={token}
        currentUserId={profile?.id || ""}
        initialTeamName={teamName}
        initialTeammates={teammates}
        onSuccess={(res: any) => {
          setIsRegistered(true);
          setRegistrationStatus(res?.status || "registered");
          setMyRegistration(res?.registration || res);
          api.myEventRegistration(token, event.id).then((fresh) => {
            if (fresh.is_registered && fresh.registration) {
              setMyRegistration(fresh.registration);
            }
          });
          api.getEvent(event.id, token).then((refreshed) => {
            setRegisteredCount(refreshed.stats?.registered_count ?? registeredCount + 1);
          });
        }}
      />

      {/* Project Deliverables Submission Modal */}
      <ProjectSubmissionModal
        isOpen={showSubmissionModal}
        onClose={() => setShowSubmissionModal(false)}
        eventId={event.id}
        eventTitle={event.title}
        timeline={event.timeline}
        initialSubmission={myRegistration?.submission}
        token={token}
        onSuccess={(savedSubmission) => {
          setMyRegistration((prev) => (prev ? { ...prev, submission: savedSubmission } : prev));
        }}
      />

      {/* Edit Registration Responses Modal */}
      <EditResponsesModal
        isOpen={showEditResponsesModal}
        onClose={() => setShowEditResponsesModal(false)}
        event={event}
        token={token}
        currentUserId={profile?.id || ""}
        initialResponses={
          event.custom_registration_fields?.reduce((acc, cf) => {
            const val =
              cf.applies_to === "team"
                ? myRegistration?.custom_responses?.[cf.field_id]
                : myRegistration?.member_responses?.[profile?.id || ""]?.[cf.field_id] ??
                  myRegistration?.custom_responses?.[cf.field_id];
            if (val !== undefined && val !== null) {
              acc[cf.field_id] = val;
            }
            return acc;
          }, {} as Record<string, any>) || {}
        }
        onSuccess={(updatedUserResponses, updatedCustom) => {
          setMyRegistration((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              custom_responses: { ...prev.custom_responses, ...updatedCustom },
              member_responses: {
                ...prev.member_responses,
                [profile?.id || ""]: {
                  ...(prev.member_responses?.[profile?.id || ""] || {}),
                  ...updatedUserResponses,
                },
              },
            };
          });
          api.myEventRegistration(token, event.id).then((fresh) => {
            if (fresh.is_registered && fresh.registration) {
              setMyRegistration(fresh.registration);
            }
          });
        }}
      />
    </div>
  );
}
