"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
import { type EventDocument, type LearningResource, type EventRegistration, type IdeaSummary } from "@/lib/api";
import type { EventSubmissionPayload, TimelineItemSchema } from "@/types/event-matrix";
import { formatEventDuration, getEventGraduationBatches } from "@/lib/eventsData";
import EventAttendeesPanel from "./EventAttendeesPanel";
import EventAttendancePanel from "./EventAttendancePanel";
import EventTimelineSection from "./EventTimelineSection";
import RsvpIntakeModal from "./RsvpIntakeModal";
import ProjectSubmissionModal from "./ProjectSubmissionModal";
import EditResponsesModal from "./EditResponsesModal";
import AttachProblemModal from "@/components/dashboard/AttachProblemModal";
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
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachedIdea, setAttachedIdea] = useState<IdeaSummary | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [switchingTrack, setSwitchingTrack] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [memberProfilesMap, setMemberProfilesMap] = useState<Record<string, { full_name?: string; avatar_url?: string }>>({});

  useEffect(() => {
    if (!token || !myRegistration) return;
    const uidsToFetch = new Set<string>();
    const leadUid = myRegistration.user_id;
    if (leadUid && !myRegistration.user_profile?.full_name && !memberProfilesMap[leadUid]) {
      uidsToFetch.add(leadUid);
    }
    const memberUids = myRegistration.member_uids || [];
    for (const u of memberUids) {
      if (!u || memberProfilesMap[u]) continue;
      const cached = myRegistration.member_profiles?.find((p) => p.id === u);
      if (!cached || !cached.full_name || cached.full_name === u) {
        uidsToFetch.add(u);
      }
    }
    if (uidsToFetch.size === 0) return;

    uidsToFetch.forEach((uid) => {
      api.getUserProfile(token, uid)
        .then((prof) => {
          if (prof?.full_name) {
            setMemberProfilesMap((prev) => ({
              ...prev,
              [uid]: { full_name: prof.full_name, avatar_url: prof.avatar_url || undefined },
            }));
          }
        })
        .catch(() => {});
    });
  }, [token, myRegistration, memberProfilesMap]);

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
    const ideaId =
      (myRegistration as any)?.submission?.problem_statement_id ||
      (myRegistration as any)?.problem_statement_id ||
      (myRegistration as any)?.idea_id;
    if (ideaId && token) {
      api
        .getIdea(ideaId, token)
        .then((res) => setAttachedIdea(res as unknown as IdeaSummary))
        .catch(() => setAttachedIdea(null));
    } else {
      setAttachedIdea(null);
    }
  }, [myRegistration, token]);

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

    const hasCustomFields = (event.custom_registration_fields?.length ?? 0) > 0;
    const hasTracks = (event.event_tracks?.length ?? 0) > 0;

    // If event has custom intake questions or tracks, open the modal for detailed intake answers
    if (hasCustomFields || hasTracks) {
      setShowRsvpModal(true);
      return;
    }

    setRegistrationBusy(true);
    try {
      const memberUids = teammates.map((member) => member.id);
      if (event.participation?.mode === "team" && !teamName.trim()) {
        setRegistrationError("Enter a team name before registering.");
        return;
      }
      // The team counts you; the server enforces the same rule.
      if (event.participation?.mode === "team" && memberUids.length + 1 < minTeamSize) {
        setRegistrationError(`This event needs teams of at least ${minTeamSize}. Add ${minTeamSize - 1 - memberUids.length} more ${minTeamSize - 1 - memberUids.length === 1 ? "teammate" : "teammates"}.`);
        return;
      }
      const result: any = await api.registerForEvent(
        token,
        event.id,
        event.participation?.mode === "team" ? { team_name: teamName.trim(), member_uids: memberUids } : {}
      );
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
      // Server messages name members by account ID; show the teammate's name.
      const message = err instanceof Error ? err.message : "Registration could not be completed.";
      setRegistrationError(teammates.reduce((text, member) => text.split(member.id).join(member.full_name), message));
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

  const handleAttachEventProblem = async (ideaId: string | null) => {
    if (!token || !event?.id) return;
    try {
      const res = await api.attachEventIdea(token, event.id, ideaId);
      setMyRegistration((prev: any) => {
        if (!prev) return prev;
        const prevSub = prev.submission || {};
        return {
          ...prev,
          idea_id: ideaId,
          problem_statement_id: ideaId,
          submission: {
            ...prevSub,
            problem_statement_id: ideaId,
          },
        };
      });
      if (ideaId && res?.idea) {
        setAttachedIdea(res.idea as unknown as IdeaSummary);
      } else if (!ideaId) {
        setAttachedIdea(null);
      }
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to update problem statement.");
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
          {/* Team Participation Box (For Team-based events) */}
          {isRegistered && (event.participation?.mode === "team" || Boolean(myRegistration?.team_name)) && (
            <section className={styles.deliverablesCard} style={{ borderColor: "#3f424c", marginBottom: "16px" }} aria-label="Your Registered Team">
              <div className={styles.deliverablesHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    <MemberIcon name="users" size={18} />
                    Your Team: <span style={{ color: "#e5b731" }}>{myRegistration?.team_name || "Registered Team"}</span>
                  </h2>
                  <span
                    className={styles.deliverablesStatusTag}
                    style={{
                      background: "rgba(229, 183, 49, 0.12)",
                      color: "#e5b731",
                      border: "1px solid rgba(229, 183, 49, 0.3)",
                    }}
                  >
                    👥 Team Participation ({myRegistration?.member_uids?.length || 1} Members)
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {myRegistration?.spg_id && (
                    <Link
                      href={`/dashboard/spg/${encodeURIComponent(myRegistration.spg_id)}`}
                      className={styles.openSubmissionModalBtn}
                      style={{ textDecoration: "none", background: "rgba(229, 183, 49, 0.15)", color: "#e5b731", border: "1px solid rgba(229, 183, 49, 0.3)" }}
                    >
                      <MemberIcon name="sparkles" size={13} />
                      View Team SPG →
                    </Link>
                  )}
                </div>
              </div>

              {/* Team Details Grid: Roster, Invite Code, Problem Statement */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "14px" }}>
                {/* Team Roster Column */}
                <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#8c8c98", textTransform: "uppercase", marginBottom: "8px" }}>
                    Team Roster
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Team Leader */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1c1c22", padding: "8px 10px", borderRadius: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e5b731", color: "#000", fontWeight: "800", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          L
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: "#ffffff" }}>
                          {(() => {
                            const leadUid = myRegistration?.user_id || "";
                            if (leadUid === profile?.id) return `${profile.full_name || "You"} (You)`;
                            if (myRegistration?.user_profile?.full_name && myRegistration.user_profile.full_name !== leadUid) {
                              return myRegistration.user_profile.full_name;
                            }
                            return memberProfilesMap[leadUid]?.full_name || "Team Lead";
                          })()}
                        </span>
                      </div>
                      <span style={{ fontSize: "10px", fontWeight: "800", background: "rgba(229, 183, 49, 0.2)", color: "#e5b731", padding: "2px 6px", borderRadius: "4px" }}>
                        LEAD
                      </span>
                    </div>

                    {/* Teammates */}
                    {(myRegistration?.member_profiles?.length ? myRegistration.member_profiles : (myRegistration?.member_uids || []).filter(u => u !== myRegistration?.user_id).map(u => ({ id: u, full_name: u, email: "" }))).map((m: any, idx: number) => {
                      const uid = m.id || m;
                      if (uid === myRegistration?.user_id) return null;
                      const rawName = m.full_name || uid;
                      const displayName =
                        rawName && rawName !== uid
                          ? rawName
                          : uid === profile?.id
                          ? profile.full_name || "You"
                          : memberProfilesMap[uid]?.full_name || "Team Member";
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1c1c22", padding: "8px 10px", borderRadius: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#2b2e35", color: "#d4d4d8", fontWeight: "700", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {displayName.slice(0, 1).toUpperCase()}
                            </div>
                            <span style={{ fontSize: "13px", color: "#e4e4e7" }}>
                              {displayName} {uid === profile?.id && "(You)"}
                            </span>
                          </div>
                          <span style={{ fontSize: "10px", color: "#8c8c98" }}>MEMBER</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Team Controls & Problem Statement */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Team Invite Code */}
                  {myRegistration?.invite_code && (
                    <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#8c8c98", textTransform: "uppercase", marginBottom: "6px" }}>
                        Team Invite Code
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <code style={{ fontSize: "14px", fontWeight: "750", background: "#0c0c0e", padding: "6px 12px", borderRadius: "6px", color: "#e5b731", border: "1px solid #31343a", letterSpacing: "0.08em" }}>
                          {myRegistration.invite_code}
                        </code>
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
                          style={{ padding: "6px 12px", fontSize: "12px" }}
                        >
                          <MemberIcon name="tag" size={12} />
                          {copiedCode ? "Copied!" : "Copy Code"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Attached Problem Statement from Idea Jar */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px", flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#8c8c98", textTransform: "uppercase" }}>
                        Problem Statement (Idea Jar)
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAttachModal(true)}
                        style={{
                          background: "rgba(229, 183, 49, 0.12)",
                          border: "1px solid rgba(229, 183, 49, 0.3)",
                          color: "#e5b731",
                          fontSize: "11px",
                          fontWeight: "750",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {attachedIdea ? "Change Problem" : "+ Pick Problem"}
                      </button>
                    </div>

                    {attachedIdea ? (
                      <div>
                        <div style={{ fontWeight: "750", fontSize: "13px", color: "#ffffff", marginTop: "4px" }}>
                          {attachedIdea.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                          <span style={{ fontSize: "10px", fontWeight: "750", background: "rgba(229, 183, 49, 0.15)", color: "#e5b731", padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase" }}>
                            {attachedIdea.track || "GENERAL"}
                          </span>
                          <Link href={`/dashboard/ideas/${encodeURIComponent(attachedIdea.id)}`} style={{ fontSize: "11.5px", color: "#a1a1aa", textDecoration: "underline" }}>
                            View in Idea Jar →
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#71717a" }}>
                        No problem statement attached to this team yet. Choose an approved problem from the Idea Jar to sync with the Event Matrix.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Project Deliverables Card (For Registered Attendees) */}
          {isRegistered && (() => {
            const hasDeliverablesSubmitted = Boolean(
              myRegistration?.submission && (
                myRegistration.submission.submitted_at ||
                myRegistration.submission.repo_url ||
                myRegistration.submission.slides_url ||
                myRegistration.submission.demo_url ||
                myRegistration.submission.paper_link ||
                (myRegistration.submission.custom_fields && Object.keys(myRegistration.submission.custom_fields).length > 0)
              )
            );

            return (
              <section className={styles.deliverablesCard} aria-label="Project Deliverables">
                <div className={styles.deliverablesHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                      <MemberIcon name="articles" size={18} />
                      Project Deliverables & Submission
                    </h2>
                    <span
                      className={`${styles.deliverablesStatusTag} ${
                        hasDeliverablesSubmitted
                          ? styles.statusSubmitted
                          : styles.statusPending
                      }`}
                    >
                      {hasDeliverablesSubmitted
                        ? "✓ Submitted"
                        : "Submission Pending"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSubmissionModal(true)}
                    className={styles.openSubmissionModalBtn}
                  >
                    <MemberIcon name={hasDeliverablesSubmitted ? "edit" : "plus"} size={14} />
                    {hasDeliverablesSubmitted
                      ? "Update Deliverables"
                      : "Submit Project Deliverables"}
                  </button>
                </div>

                {hasDeliverablesSubmitted && myRegistration?.submission ? (
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
                    {myRegistration.submission.custom_fields &&
                      Object.entries(myRegistration.submission.custom_fields).map(([k, v]) => {
                        if (!v) return null;
                        const href = String(v).startsWith("http") ? String(v) : `https://${v}`;
                        return (
                          <a
                            key={k}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.deliverableLinkItem}
                          >
                            <span>🔗</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {k}: {String(v)}
                            </span>
                          </a>
                        );
                      })}
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
            );
          })()}

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

          {/* Registration Form Responses Card (Right Sidebar for Registered Attendees) */}
          {isRegistered && (
            (event.custom_registration_fields?.length ?? 0) > 0 ||
            Boolean(myRegistration?.custom_responses && Object.keys(myRegistration.custom_responses).length > 0) ||
            Boolean(myRegistration?.team_name)
          ) && (
            <section className={styles.intakeCard} style={{ padding: "18px" }} aria-label="Registration Form Answers">
              <div className={styles.intakeHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: "15px" }}>
                    <MemberIcon name="tag" size={16} />
                    Registration Form Responses
                  </h2>
                  <span
                    className={styles.deliverablesStatusTag}
                    style={{
                      background: "rgba(229, 183, 49, 0.12)",
                      color: "#e5b731",
                      border: "1px solid rgba(229, 183, 49, 0.3)",
                      fontSize: "10.5px",
                      padding: "2px 7px",
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

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Team Name Response (for team events) */}
                {event.participation?.mode === "team" && myRegistration?.team_name && (
                  <div className={styles.intakeFieldBox} style={{ padding: "12px 14px" }}>
                    <div className={styles.intakeFieldHeader}>
                      <span className={styles.intakeFieldLabel}>TEAM NAME</span>
                      <span
                        className={styles.intakeFieldScope}
                        style={{
                          background: "rgba(229, 183, 49, 0.12)",
                          color: "#e5b731",
                          border: "1px solid rgba(229, 183, 49, 0.3)",
                        }}
                      >
                        Team
                      </span>
                    </div>
                    <div className={styles.intakeFieldValue} style={{ fontWeight: "700", color: "#f4f4f5" }}>
                      <span>{myRegistration.team_name}</span>
                    </div>
                  </div>
                )}

                {/* Custom registration fields */}
                {event.custom_registration_fields?.map((cf) => {
                  const val =
                    cf.applies_to === "team"
                      ? myRegistration?.custom_responses?.[cf.field_id]
                      : myRegistration?.member_responses?.[profile?.id || ""]?.[cf.field_id] ??
                        myRegistration?.custom_responses?.[cf.field_id];

                  const hasVal = val !== undefined && val !== null && val !== "";

                  return (
                    <div key={cf.field_id} className={styles.intakeFieldBox} style={{ padding: "12px 14px" }}>
                      <div className={styles.intakeFieldHeader}>
                        <span className={styles.intakeFieldLabel}>{cf.label.toUpperCase()}</span>
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
        submissionConfig={event.submission_config}
        token={token}
        onSuccess={(savedSubmission) => {
          setMyRegistration((prev) => (prev ? { ...prev, submission: savedSubmission } : prev));
        }}
      />

      {/* Attach Problem Statement Modal */}
      <AttachProblemModal
        isOpen={showAttachModal}
        onClose={() => setShowAttachModal(false)}
        token={token}
        currentIdeaId={
          (myRegistration as any)?.submission?.problem_statement_id ||
          (myRegistration as any)?.problem_statement_id ||
          (myRegistration as any)?.idea_id
        }
        onSelectIdea={(ideaId) => void handleAttachEventProblem(ideaId)}
        title="Select Event Problem Statement"
      />

      {/* Edit Registration Responses Modal */}
      <EditResponsesModal
        isOpen={showEditResponsesModal}
        onClose={() => setShowEditResponsesModal(false)}
        event={event}
        token={token}
        currentUserId={profile?.id || ""}
        initialTeamName={myRegistration?.team_name || ""}
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
        onSuccess={(updatedUserResponses, updatedCustom, newTeamName) => {
          setMyRegistration((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              team_name: newTeamName !== undefined ? newTeamName : prev.team_name,
              custom_responses: { ...prev.custom_responses, ...(updatedCustom || {}) },
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
