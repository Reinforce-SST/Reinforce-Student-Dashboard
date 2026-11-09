"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api, type EventRegistration } from "@/lib/api";
import { aggregateEventAttendees, type AggregatedTeam } from "@/lib/eventAttendees";
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
  isAdmin = false,
}: {
  eventId: string;
  token: string;
  isAdmin?: boolean;
}) {
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "teams" | "solo">("all");

  // Admin Roster Edit State
  const [editingTeam, setEditingTeam] = useState<AggregatedTeam | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editLeaderUid, setEditLeaderUid] = useState("");
  const [editMemberUids, setEditMemberUids] = useState<string[]>([]);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterSuccess, setRosterSuccess] = useState<string | null>(null);

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


  const handleOpenAdminEdit = (team: AggregatedTeam) => {
    setEditingTeam(team);
    setEditTeamName(team.team_name);
    setEditLeaderUid(team.leader_uid);
    setEditMemberUids([...team.member_uids]);
    setAddMemberQuery("");
    setRosterError(null);
    setRosterSuccess(null);
  };

  const handleCloseAdminEdit = () => {
    if (savingRoster) return;
    setEditingTeam(null);
  };

  const handleRemoveMember = (uid: string) => {
    if (editMemberUids.length <= 1) {
      setRosterError("A squad must maintain at least one member.");
      return;
    }
    const updated = editMemberUids.filter((m) => m !== uid);
    setEditMemberUids(updated);
    if (editLeaderUid === uid) {
      setEditLeaderUid(updated[0]);
    }
  };

  const handleAddMember = (uid: string) => {
    const clean = uid.trim();
    if (!clean) return;
    if (editMemberUids.includes(clean)) {
      setRosterError("Member is already in this squad.");
      return;
    }
    setEditMemberUids([...editMemberUids, clean]);
    setAddMemberQuery("");
    setRosterError(null);
  };

  const handleSaveRoster = async () => {
    if (!editingTeam || !token) return;
    if (editMemberUids.length === 0) {
      setRosterError("A squad must have at least one member.");
      return;
    }
    if (!editLeaderUid || !editMemberUids.includes(editLeaderUid)) {
      setRosterError("Please designate a valid team leader from the squad members.");
      return;
    }

    setSavingRoster(true);
    setRosterError(null);
    setRosterSuccess(null);

    try {
      await api.adminUpdateTeamRoster(
        token,
        eventId,
        editingTeam.team_id || editingTeam.spg_id || editingTeam.key,
        {
          team_name: editTeamName.trim() || undefined,
          member_uids: editMemberUids,
          leader_uid: editLeaderUid,
        }
      );

      const freshRegs = await api.getEventRegistrations(token, eventId);
      setRegistrations(freshRegs);

      setRosterSuccess("Squad roster updated and synced successfully!");
      setTimeout(() => {
        setEditingTeam(null);
      }, 900);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : "Failed to update squad roster.");
    } finally {
      setSavingRoster(false);
    }
  };

  const { allTeams, soloRegistrations } = useMemo(
    () => aggregateEventAttendees(registrations),
    [registrations]
  );

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
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {team.roster_locked ? (
                      <span
                        style={{
                          background: "rgba(34, 197, 94, 0.15)",
                          color: "#4ade80",
                          border: "1px solid rgba(34, 197, 94, 0.3)",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontSize: "10.5px",
                          fontWeight: "700",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        <MemberIcon name="lock" size={9} /> Locked Roster
                      </span>
                    ) : (
                      <span
                        style={{
                          background: "rgba(229, 183, 49, 0.12)",
                          color: "#e5b731",
                          border: "1px solid rgba(229, 183, 49, 0.3)",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontSize: "10.5px",
                          fontWeight: "600",
                        }}
                      >
                        Open Roster
                      </span>
                    )}
                    {getStatusBadge(team.status)}
                  </div>
                </div>

                <div className={styles.attendeeCardBody}>
                  {team.spg_id && (
                    <div className={styles.spgBadgeRow}>
                      <span className={styles.spgLabelBadge}>SPG Group</span>
                      <Link href={`/dashboard/spg/${encodeURIComponent(team.spg_id)}`} className={styles.spgLink}>
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

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleOpenAdminEdit(team)}
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#ffffff",
                        borderRadius: "6px",
                        padding: "5px 10px",
                        fontSize: "11px",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        marginTop: "10px",
                        width: "fit-content",
                      }}
                    >
                      <MemberIcon name="edit" size={12} /> Edit Squad Roster (Admin)
                    </button>
                  )}
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

      {/* ADMIN EDIT SQUAD ROSTER MODAL */}
      {editingTeam && (
        <div className={styles.modalOverlay} onClick={savingRoster ? undefined : handleCloseAdminEdit}>
          <div
            className={styles.modalBox}
            style={{ maxWidth: "560px", background: "#18181b", border: "1px solid #31343a", borderRadius: "14px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader} style={{ borderBottom: "1px solid #27272a", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(229, 183, 49, 0.15)",
                    border: "1px solid rgba(229, 183, 49, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#E5B731",
                  }}
                >
                  <MemberIcon name="edit" size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#ffffff" }}>
                    Edit Squad Roster (Admin Override)
                  </h3>
                  <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
                    Bypasses roster lock & deadline. Automatically syncs with the Event SPG.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseAdminEdit}
                className={styles.modalCloseBtn}
                disabled={savingRoster}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {rosterError && (
                <div className={styles.alertErrorBox} style={{ margin: 0 }}>
                  <MemberIcon name="alert-circle" size={14} />
                  <span>{rosterError}</span>
                </div>
              )}
              {rosterSuccess && (
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#4ade80",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <MemberIcon name="check" size={14} />
                  <span>{rosterSuccess}</span>
                </div>
              )}

              {/* Team Name */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#d4d4d8", marginBottom: "6px" }}>
                  Squad / Team Name
                </label>
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  className={styles.attendeeSearchInput}
                  placeholder="Team Name"
                />
              </div>

              {/* Team Lead Selector */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#d4d4d8", marginBottom: "6px" }}>
                  Designated Team Lead (Crown 👑)
                </label>
                <select
                  value={editLeaderUid}
                  onChange={(e) => setEditLeaderUid(e.target.value)}
                  className={styles.attendeeSearchInput}
                  style={{ cursor: "pointer" }}
                >
                  {editMemberUids.map((uid) => {
                    const prof = editingTeam.profileMap.get(uid);
                    return (
                      <option key={uid} value={uid}>
                        👑 {prof?.full_name || uid} ({uid.slice(0, 8)}...)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Current Squad Members */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#d4d4d8", marginBottom: "8px" }}>
                  Squad Members ({editMemberUids.length})
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
                  {editMemberUids.map((uid) => {
                    const prof = editingTeam.profileMap.get(uid);
                    const isLead = uid === editLeaderUid;
                    return (
                      <div
                        key={uid}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "#121214",
                          border: "1px solid #27272a",
                          borderRadius: "6px",
                          padding: "8px 12px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: isLead ? "#E5B731" : "#ffffff" }}>
                            {isLead ? "👑 " : ""}{prof?.full_name || uid}
                          </span>
                          <span style={{ fontSize: "11px", color: "#71717a" }}>
                            {prof?.email || uid}
                          </span>
                        </div>
                        {editMemberUids.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(uid)}
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              color: "#f87171",
                              borderRadius: "4px",
                              padding: "2px 8px",
                              fontSize: "11px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Member to Squad */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#d4d4d8", marginBottom: "6px" }}>
                  Add Member (Select registered participant or enter UID)
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={addMemberQuery}
                    onChange={(e) => setAddMemberQuery(e.target.value)}
                    className={styles.attendeeSearchInput}
                    style={{ flex: 1, cursor: "pointer" }}
                  >
                    <option value="">-- Choose from registered participants --</option>
                    {registrations
                      .filter((r) => r.user_id && !editMemberUids.includes(r.user_id))
                      .map((r) => (
                        <option key={r.user_id} value={r.user_id}>
                          {r.user_profile?.full_name || r.user_id} ({r.user_profile?.email || r.user_id})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAddMember(addMemberQuery)}
                    disabled={!addMemberQuery}
                    style={{
                      background: addMemberQuery ? "rgba(229, 183, 49, 0.2)" : "#27272a",
                      color: addMemberQuery ? "#E5B731" : "#71717a",
                      border: "1px solid rgba(229, 183, 49, 0.4)",
                      borderRadius: "6px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: addMemberQuery ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    + Add Member
                  </button>
                </div>
              </div>
            </div>

            <div
              className={styles.modalActions}
              style={{
                borderTop: "1px solid #27272a",
                padding: "14px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={handleCloseAdminEdit}
                className={styles.modalCancelBtn}
                disabled={savingRoster}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoster}
                disabled={savingRoster || editMemberUids.length === 0}
                style={{
                  background: "#E5B731",
                  color: "#121214",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: savingRoster ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <MemberIcon name="check" size={14} />
                {savingRoster ? "Saving & Syncing SPG..." : "Save Squad & Sync SPG"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
