"use client";

import { useState } from "react";
import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { type EventDocument } from "@/lib/eventsData";
import styles from "./EventDetail.module.css";

function formatInline(text: string): React.ReactNode[] {
  // Regex to split by **bold** and `code`
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

function renderMarkdown(md?: string) {
  if (!md) {
    return <p className={styles.mdParagraph}>No additional specifications published for this event yet.</p>;
  }

  // Safely normalize compacted markdown without corrupting hashes
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
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredCount, setRegisteredCount] = useState(event.stats.registered_count);

  // Feedback State (conforming to FeedbackSubmitRequest schema)
  const [ratingContent, setRatingContent] = useState(5);
  const [ratingOrg, setRatingOrg] = useState(5);
  const [ratingOverall, setRatingOverall] = useState(5);
  const [takeaways, setTakeaways] = useState("");
  const [improvements, setImprovements] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleToggleRsvp = () => {
    if (isRegistered) {
      setIsRegistered(false);
      setRegisteredCount((c) => Math.max(0, c - 1));
    } else {
      setIsRegistered(true);
      setRegisteredCount((c) => c + 1);
    }
  };

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSubmitted(true);
    setTimeout(() => setFeedbackSubmitted(false), 5000);
    setTakeaways("");
    setImprovements("");
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

  const formattedStartTime = new Date(event.schedule.start_time).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const formattedDeadline = event.schedule.registration_deadline
    ? new Date(event.schedule.registration_deadline).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Until start time";

  const capacity = event.participation.max_participants || 100;
  const fillPercent = Math.min(100, Math.round((registeredCount / capacity) * 100));

  return (
    <div className={styles.pageContainer}>
      {/* Back Link & Breadcrumb */}
      <div className={styles.backRow}>
        <Link href="/dashboard/events" className={styles.backBtn}>
          ← Back to Events Planner
        </Link>

        <div className={styles.statusChipsRow}>
          <span className={styles.formatChip}>{event.format.toUpperCase()}</span>
          <span className={getTrackChipClass(event.track)}>{event.track.toUpperCase()} TRACK</span>
          <span className={styles.typeChip}>{event.event_type.toUpperCase()}</span>
        </div>
      </div>

      {/* Hero Banner Card */}
      <section className={styles.heroBanner} aria-label="Event Hero Banner">
        <div className={styles.heroGlow} />

        <div className={styles.heroTopMeta}>
          <h1 className={styles.eventTitle}>{event.title}</h1>
        </div>

        <p className={styles.eventSubtitle}>{event.description}</p>

        <div className={styles.heroActionRow}>
          <button
            type="button"
            className={isRegistered ? styles.joinedButton : styles.rsvpButton}
            onClick={handleToggleRsvp}
          >
            {isRegistered ? (
              <>
                <MemberIcon name="check" size={16} />
                Registered & Confirmed (Cancel RSVP)
              </>
            ) : (
              <>
                <MemberIcon name="plus" size={16} />
                {event.participation.mode === "team" ? "Register Team (RSVP)" : "RSVP for Event"}
              </>
            )}
          </button>

          {event.venue_info.meeting_url && (
            <a
              href={event.venue_info.meeting_url}
              target="_blank"
              rel="noreferrer"
              className={styles.discordThreadLink}
            >
              <MemberIcon name="discord" size={16} />
              Open Discord Stage
            </a>
          )}
        </div>
      </section>

      {/* Main 2-Column Content Grid */}
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
              {renderMarkdown(event.detailed_info)}
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
                  {event.participation.mode === "team" ? "TEAM EVENT" : "SOLO PARTICIPATION"}
                </span>
                {event.participation.requires_event_spg && (
                  <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: "750" }}>
                    ✓ Auto-provisions temporary Event SPG
                  </span>
                )}
              </div>

              <div className={styles.spgRuleList}>
                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Team Size</span>
                  <span className={styles.ruleVal}>
                    {event.participation.mode === "team"
                      ? `${event.participation.min_team_size} - ${event.participation.max_team_size} Members`
                      : "Individual (Solo)"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>SPG Auto-Disband</span>
                  <span className={styles.ruleVal}>
                    {event.participation.requires_event_spg
                      ? `${event.participation.spg_auto_disband_days} Days after event`
                      : "N/A"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Access Scope</span>
                  <span className={styles.ruleVal}>
                    {event.eligibility.access_scope === "open_to_all"
                      ? "Open to All SST Students"
                      : "Members Only"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Eligibility</span>
                  <span className={styles.ruleVal}>
                    Batches &apos;22-&apos;25 (All Tiers)
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
              {event.resources.slides_url && (
                <a
                  href={event.resources.slides_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>📄 Presentation Slides & Technical Brief</span>
                  <span>Open PDF →</span>
                </a>
              )}
              {event.resources.writeup_url && (
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
              {event.resources.recording_url && (
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
            </div>
          </section>

          {/* Member Feedback Form */}
          <section className={styles.feedbackCard} aria-label="Submit Feedback">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="message" size={18} />
              Member Feedback & Rating
            </h2>
            <p style={{ fontSize: "0.78rem", color: "#8c8c98", margin: 0 }}>
              Help core leads improve technical depth and organizing quality.
            </p>

            {feedbackSubmitted ? (
              <div
                style={{
                  background: "rgba(74, 222, 128, 0.15)",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                  color: "#4ade80",
                  padding: "14px 18px",
                  borderRadius: "10px",
                  fontSize: "0.82rem",
                  fontWeight: "750",
                }}
              >
                ✓ Thank you! Your feedback has been submitted to the organizing ledger.
              </div>
            ) : (
              <form onSubmit={handleSubmitFeedback} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className={styles.ratingGroup}>
                  <div className={styles.ratingBox}>
                    <span className={styles.ratingLabel}>Content Depth</span>
                    <div className={styles.starButtons}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className={`${styles.starBtn} ${ratingContent >= star ? styles.starActive : ""}`}
                          onClick={() => setRatingContent(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.ratingBox}>
                    <span className={styles.ratingLabel}>Organization</span>
                    <div className={styles.starButtons}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className={`${styles.starBtn} ${ratingOrg >= star ? styles.starActive : ""}`}
                          onClick={() => setRatingOrg(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.ratingBox}>
                    <span className={styles.ratingLabel}>Overall Value</span>
                    <div className={styles.starButtons}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className={`${styles.starBtn} ${ratingOverall >= star ? styles.starActive : ""}`}
                          onClick={() => setRatingOverall(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <textarea
                  className={styles.feedbackTextarea}
                  placeholder="Key takeaways or technical improvements for next time..."
                  value={takeaways}
                  onChange={(e) => setTakeaways(e.target.value)}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.76rem", color: "#a2a2b0", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      style={{ accentColor: "var(--brand, #E5B731)" }}
                    />
                    Submit anonymously
                  </label>

                  <button type="submit" className={styles.submitFeedbackBtn}>
                    Submit Feedback →
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        {/* Right Sidebar Column */}
        <aside className={styles.sidebarColumn} aria-label="Event Key Details Sidebar">
          {/* Merit Reward Card */}
          <div className={styles.pointsRewardCard}>
            <div className={styles.pointsTextGroup}>
              <span className={styles.pointsLabel}>Merit Points Reward</span>
              <span className={styles.pointsAmount}>+{event.points_reward.attendance_points} PTS</span>
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
                  <span className={styles.specValue}>{event.schedule.duration_minutes || 120} Minutes</span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="location" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Venue / Stage</span>
                  <span className={styles.specValue}>
                    {event.venue_info.venue_name || "Virtual (Discord)"} {event.venue_info.room ? `(${event.venue_info.room})` : ""}
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
                <span className={styles.statValueMono}>{registeredCount} / {capacity}</span>
              </div>

              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${fillPercent}%` }} />
              </div>

              <div className={styles.statRow}>
                <span style={{ color: "#8c8c98" }}>Average Rating</span>
                <span style={{ color: "var(--brand, #E5B731)", fontWeight: "800", fontFamily: "var(--font-mono, monospace)" }}>
                  ⭐ {event.stats.average_rating.toFixed(2)} / 5.0
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
