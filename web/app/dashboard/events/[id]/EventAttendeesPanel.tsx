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

  type AggregatedTeam = {
    key: string;
    id: string;
    team_id?: string | null;
    team_name: string;
    spg_id?: string | null;
    status: string;
    registered_at: string;
    leader_uid: string;
    leader_profile?: AttendeeProfile | null;
    member_uids: string[];
    profileMap: Map<string, AttendeeProfile>;
  };

  const { allTeams, soloRegistrations } = useMemo(() => {
    // Pass 1: Build canonical team key aliases across team_id, spg_id, and team_name
    const nameToKey = new Map<string, string>();
    const spgToKey = new Map<string, string>();
    const teamIdToKey = new Map<string, string>();

    for (const r of registrations) {
      const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
      if (!isTeam) continue;
      const canonical = r.team_id
        ? `team_${r.team_id}`
        : r.spg_id
        ? `spg_${r.spg_id}`
        : r.team_name?.trim()
        ? `name_${r.team_name.trim().toLowerCase()}`
        : `reg_${r.id || r.user_id}`;

      if (r.team_id && !teamIdToKey.has(r.team_id)) teamIdToKey.set(r.team_id, canonical);
      if (r.spg_id && !spgToKey.has(r.spg_id)) spgToKey.set(r.spg_id, canonical);
      if (r.team_name?.trim()) {
        const norm = r.team_name.trim().toLowerCase();
        if (!nameToKey.has(norm)) nameToKey.set(norm, canonical);
      }
    }

    const teamsMap = new Map<string, EventRegistration[]>();
    const solos: EventRegistration[] = [];

    for (const r of registrations) {
      const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
      if (!isTeam) {
        solos.push(r);
        continue;
      }

      const key =
        (r.team_id && teamIdToKey.get(r.team_id)) ||
        (r.spg_id && spgToKey.get(r.spg_id)) ||
        (r.team_name?.trim() && nameToKey.get(r.team_name.trim().toLowerCase())) ||
        `reg_${r.id || r.user_id}`;

      if (!teamsMap.has(key)) {
        teamsMap.set(key, []);
      }
      teamsMap.get(key)!.push(r);
    }

    const aggregated: AggregatedTeam[] = [];
    teamsMap.forEach((groupRegs, key) => {
      // Find true team leader
      const explicitLeaders = groupRegs.filter((r) => r.is_team_leader);
      let leaderUid = "";
      if (explicitLeaders.length === 1) {
        leaderUid = explicitLeaders[0].user_id;
      } else if (explicitLeaders.length > 1) {
        // If multiple claim leadership (legacy bug), prefer member_uids[0] or earliest registered_at
        const firstMember = groupRegs[0].member_uids?.[0];
        const matchFirst = explicitLeaders.find((r) => r.user_id === firstMember);
        if (matchFirst) {
          leaderUid = matchFirst.user_id;
        } else {
          const sorted = [...explicitLeaders].sort((a, b) =>
            (a.registered_at || "").localeCompare(b.registered_at || "")
          );
          leaderUid = sorted[0].user_id;
        }
      } else {
        leaderUid = groupRegs[0].member_uids?.[0] || groupRegs[0].user_id;
      }

      // Collect all attendee profiles known for this team
      const profileMap = new Map<string, AttendeeProfile>();
      for (const r of groupRegs) {
        if (r.user_profile && r.user_id) {
          profileMap.set(r.user_id, r.user_profile);
        }
        for (const p of r.member_profiles || []) {
          if (p?.id) profileMap.set(p.id, p);
        }
      }

      // Consolidated ordered member list: leader first, then other members
      const memberUidsSet = new Set<string>();
      if (leaderUid) memberUidsSet.add(leaderUid);
      for (const r of groupRegs) {
        for (const m of r.member_uids || []) {
          if (m) memberUidsSet.add(m);
        }
        if (r.user_id) memberUidsSet.add(r.user_id);
      }
      const memberUids = Array.from(memberUidsSet);

      const leaderReg = groupRegs.find((r) => r.user_id === leaderUid) || groupRegs[0];
      const leaderProfile = profileMap.get(leaderUid) || leaderReg.user_profile || null;
      const teamName = groupRegs.find((r) => r.team_name)?.team_name || "Unnamed Team";
      const spgId = groupRegs.find((r) => r.spg_id)?.spg_id || null;
      const teamId = groupRegs.find((r) => r.team_id)?.team_id || null;
      const status = leaderReg.status || groupRegs[0].status;

      const sortedByDate = [...groupRegs].sort((a, b) =>
        (a.registered_at || "").localeCompare(b.registered_at || "")
      );
      const registeredAt = sortedByDate[0].registered_at;

      aggregated.push({
        key,
        id: leaderReg.id || key,
        team_id: teamId,
        team_name: teamName,
        spg_id: spgId,
        status,
        registered_at: registeredAt,
        leader_uid: leaderUid,
        leader_profile: leaderProfile,
        member_uids: memberUids,
        profileMap,
      });
    });

    return { allTeams: aggregated, soloRegistrations: solos };
  }, [registrations]);

  const filteredTeams = useMemo(() => {
    if (filterType === "solo") return [];
    const q = search.trim().toLowerCase();
    if (!q) return allTeams;

    return allTeams.filter((team) => {
      const matchName = team.team_name.toLowerCase().includes(q);
      const matchLeaderName = (team.leader_profile?.full_name || "").toLowerCase().includes(q);
      const matchLeaderEmail = (team.leader_profile?.email || "").toLowerCase().includes(q);
      const matchLeaderUid = team.leader_uid.toLowerCase().includes(q);
      const matchStatus = team.status.toLowerCase().includes(q);
      const matchMember = team.member_uids.some((m) => {
        const prof = team.profileMap.get(m);
        const name = (prof?.full_name || "").toLowerCase();
        const email = (prof?.email || "").toLowerCase();
        return m.toLowerCase().includes(q) || name.includes(q) || email.includes(q);
      });
      return matchName || matchLeaderName || matchLeaderEmail || matchLeaderUid || matchStatus || matchMember;
    });
  }, [allTeams, filterType, search]);

  const filteredSolo = useMemo(() => {
    if (filterType === "teams") return [];
    const q = search.trim().toLowerCase();
    if (!q) return soloRegistrations;

    return soloRegistrations.filter((r) => {
      const matchName = (r.user_profile?.full_name || "").toLowerCase().includes(q);
      const matchEmail = (r.user_profile?.email || "").toLowerCase().includes(q);
      const matchUser = (r.user_id || "").toLowerCase().includes(q);
      const matchStatus = (r.status || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchUser || matchStatus;
    });
  }, [soloRegistrations, filterType, search]);

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
            All ({allTeams.length + soloRegistrations.length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterType === "teams" ? styles.filterPillActive : ""}`}
            onClick={() => setFilterType("teams")}
          >
            Teams / SPGs ({allTeams.length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterType === "solo" ? styles.filterPillActive : ""}`}
            onClick={() => setFilterType("solo")}
          >
            Individual ({soloRegistrations.length})
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

      {!loading && !error && filteredTeams.length === 0 && filteredSolo.length === 0 && (
        <div className={styles.emptyCardBox}>
          <MemberIcon name="users" size={32} />
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#8c8c98" }}>
            {search ? "No attendees found matching your search query." : "No students have registered for this event yet."}
          </p>
        </div>
      )}

      {/* TEAMS & SPGS SECTION */}
      {!loading && (filterType === "all" || filterType === "teams") && filteredTeams.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <div className={styles.groupHeading}>
            <span>🚀 Teams & Event SPGs ({filteredTeams.length})</span>
          </div>

          <div className={styles.attendeesGrid}>
            {filteredTeams.map((team) => (
              <div key={team.key} className={styles.attendeeCard}>
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
                    <StudentHoverCard profile={team.leader_profile} fallbackId={team.leader_uid}>
                      <span className={styles.clickableStudentName}>
                        {team.leader_profile?.full_name || team.leader_uid}
                      </span>
                    </StudentHoverCard>
                  </div>

                  {team.member_uids && team.member_uids.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <span className={styles.metaLabel}>Teammates ({team.member_uids.length}):</span>
                      <div className={styles.memberChipsTray}>
                        {team.member_uids.map((uid) => {
                          const prof = team.profileMap.get(uid);
                          const displayName = prof?.full_name || uid;
                          return (
                            <StudentHoverCard key={uid} profile={prof} fallbackId={uid}>
                              <span className={styles.clickableMemberChip}>
                                {uid === team.leader_uid ? `👑 ${displayName}` : displayName}
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
      {!loading && (filterType === "all" || filterType === "solo") && filteredSolo.length > 0 && (
        <div>
          <div className={styles.groupHeading}>
            <span>👤 Individual Registrations ({filteredSolo.length})</span>
          </div>

          <div className={styles.attendeesGrid}>
            {filteredSolo.map((reg) => {
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
