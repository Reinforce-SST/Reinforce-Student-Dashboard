"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api, type EventRegistration, type AttendeeProfile } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import StudentHoverCard from "./StudentHoverCard";
import styles from "./EventDetail.module.css";

function formatRegisteredDate(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoStr || "";
  }
}

export default function EventAttendeesPanel({
  eventId,
  token,
}: {
  eventId: string;
  token: string;
}) {
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "teams" | "solo">("all");

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    api
      .getEventRegistrations(token, eventId)
      .then((data) => {
        if (active) setRegistrations(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load attendees.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, token]);

  const filtered = useMemo(() => {
    return registrations.filter((r) => {
      const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
      if (filterType === "teams" && !isTeam) return false;
      if (filterType === "solo" && isTeam) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (r.user_profile?.full_name || "").toLowerCase().includes(q);
        const matchEmail = (r.user_profile?.email || "").toLowerCase().includes(q);
        const matchTeam = (r.team_name || "").toLowerCase().includes(q);
        const matchUser = (r.user_id || "").toLowerCase().includes(q);
        const matchMembers = (r.member_uids || []).some((m) => m.toLowerCase().includes(q));
        const matchStatus = (r.status || "").toLowerCase().includes(q);
        return matchName || matchEmail || matchTeam || matchUser || matchMembers || matchStatus;
      }
      return true;
    });
  }, [registrations, filterType, search]);

  const teamList = useMemo(
    () => filtered.filter((r) => r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id),
    [filtered]
  );
  const soloList = useMemo(
    () => filtered.filter((r) => !r.team_name && (!r.member_uids || r.member_uids.length <= 1) && !r.spg_id),
    [filtered]
  );

  const getMemberProfile = (r: EventRegistration, uid: string): AttendeeProfile | undefined => {
    if (r.member_profiles) {
      const match = r.member_profiles.find((m) => m.id === uid);
      if (match) return match;
    }
    if (r.user_profile && r.user_profile.id === uid) {
      return r.user_profile;
    }
    return undefined;
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "checked_in":
        return <span className={styles.badgePresent}>✓ Present</span>;
      case "absent":
        return <span className={styles.badgeAbsent}>✗ Absent</span>;
      case "disqualified":
        return <span className={styles.badgeDisqualified}>⊘ Disqualified</span>;
      case "excused":
        return <span className={styles.badgeExcused}>○ Excused</span>;
      case "waitlisted":
        return <span className={styles.badgeWaitlist}>Waitlisted</span>;
      default:
        return <span className={styles.badgeRegistered}>Registered</span>;
    }
  };

  return (
    <div className={styles.attendeesContainer}>
      {/* Header and Controls */}
      <div className={styles.attendeesHeaderRow}>
        <div>
          <h3 className={styles.sectionTitle}>
            <MemberIcon name="users" size={20} />
            Registered Participants & Teams
          </h3>
          <p className={styles.sectionSubtitle}>
            Students who have registered for this event. Hover over any participant name to view their profile info card.
          </p>
        </div>

        <div className={styles.filterPillsRow}>
          <button
            type="button"
            className={`${styles.filterPill} ${filterType === "all" ? styles.filterPillActive : ""}`}
            onClick={() => setFilterType("all")}
          >
            All ({registrations.length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterType === "teams" ? styles.filterPillActive : ""}`}
            onClick={() => setFilterType("teams")}
          >
            Teams / SPGs ({registrations.filter((r) => r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id).length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterType === "solo" ? styles.filterPillActive : ""}`}
            onClick={() => setFilterType("solo")}
          >
            Individual ({registrations.filter((r) => !r.team_name && (!r.member_uids || r.member_uids.length <= 1) && !r.spg_id).length})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: "18px" }}>
        <input
          type="search"
          placeholder="Search by participant name, email, team name, or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.attendeeSearchInput}
        />
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "48px", color: "var(--brand, #E5B731)" }}>
          Loading registered attendees…
        </div>
      )}

      {error && (
        <div className={styles.alertErrorBox}>
          <MemberIcon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className={styles.emptyCardBox}>
          <MemberIcon name="users" size={32} />
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#8c8c98" }}>
            {search ? "No attendees found matching your search query." : "No students have registered for this event yet."}
          </p>
        </div>
      )}

      {/* TEAMS & SPGS SECTION */}
      {!loading && (filterType === "all" || filterType === "teams") && teamList.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <div className={styles.groupHeading}>
            <span>🚀 Teams & Event SPGs ({teamList.length})</span>
          </div>

          <div className={styles.attendeesGrid}>
            {teamList.map((team) => (
              <div key={team.id} className={styles.attendeeCard}>
                <div className={styles.attendeeCardHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className={styles.teamIconBox}>
                      <MemberIcon name="users" size={14} />
                    </span>
                    <strong className={styles.attendeeName}>
                      {team.team_name || "Unnamed Team"}
                    </strong>
                  </div>
                  {getStatusBadge(team.status)}
                </div>

                <div className={styles.attendeeCardBody}>
                  {team.spg_id && (
                    <div className={styles.spgBadgeRow}>
                      <span className={styles.spgLabelBadge}>SPG Group</span>
                      <Link href={`/dashboard/spg?id=${team.spg_id}`} className={styles.spgLink}>
                        View SPG Workspace ↗
                      </Link>
                    </div>
                  )}

                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Team Lead:</span>
                    <StudentHoverCard profile={team.user_profile} fallbackId={team.user_id}>
                      <span className={styles.clickableStudentName}>
                        {team.user_profile?.full_name || team.user_id}
                      </span>
                    </StudentHoverCard>
                  </div>

                  {team.member_uids && team.member_uids.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <span className={styles.metaLabel}>Teammates ({team.member_uids.length}):</span>
                      <div className={styles.memberChipsTray}>
                        {team.member_uids.map((uid) => {
                          const prof = getMemberProfile(team, uid);
                          const displayName = prof?.full_name || uid;
                          return (
                            <StudentHoverCard key={uid} profile={prof} fallbackId={uid}>
                              <span className={styles.clickableMemberChip}>
                                {uid === team.user_id ? `👑 ${displayName}` : displayName}
                              </span>
                            </StudentHoverCard>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className={styles.registeredTime}>
                    Registered: {formatRegisteredDate(team.registered_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INDIVIDUAL REGISTRATIONS SECTION */}
      {!loading && (filterType === "all" || filterType === "solo") && soloList.length > 0 && (
        <div>
          <div className={styles.groupHeading}>
            <span>👤 Individual Registrations ({soloList.length})</span>
          </div>

          <div className={styles.attendeesGrid}>
            {soloList.map((reg) => {
              const studentName = reg.user_profile?.full_name || reg.user_id;

              return (
                <div key={reg.id} className={styles.attendeeCard}>
                  <div className={styles.attendeeCardHeader}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className={styles.soloIconBox}>
                        <MemberIcon name="user" size={14} />
                      </span>
                      <StudentHoverCard profile={reg.user_profile} fallbackId={reg.user_id}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                          <strong className={styles.attendeeName}>{studentName}</strong>
                        </div>
                      </StudentHoverCard>
                    </div>
                    {getStatusBadge(reg.status)}
                  </div>

                  <div className={styles.attendeeCardBody}>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Email:</span>
                      <span className={styles.metaValue}>
                        {reg.user_profile?.email || "No email on record"}
                      </span>
                    </div>

                    <div className={styles.registeredTime}>
                      Registered: {formatRegisteredDate(reg.registered_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
