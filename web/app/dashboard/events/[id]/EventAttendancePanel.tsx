"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api, type EventRegistration, type AttendeeProfile, type StudentProfile } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import StudentHoverCard from "./StudentHoverCard";
import styles from "./EventDetail.module.css";

type AttendanceStatus =
  | "checked_in"
  | "absent"
  | "disqualified"
  | "excused"
  | "registered"
  | "waitlisted"
  | "cancelled";

export default function EventAttendancePanel({
  eventId,
  token,
  attendancePoints = 0,
}: {
  eventId: string;
  token: string;
  attendancePoints?: number;
}) {
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Per-item loading state (regId -> boolean)
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});

  // Note editing state (regId -> note text)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // Award points toggle
  const [awardPoints, setAwardPoints] = useState(true);

  // Manual / Walk-in Add State
  const [showAddSection, setShowAddSection] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<StudentProfile[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [manualStatus, setManualStatus] = useState<AttendanceStatus>("checked_in");
  const [manualNote, setManualNote] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const loadRegistrations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.adminGetEventRegistrations(token, eventId);
      setRegistrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendees.");
    } finally {
      setLoading(false);
    }
  }, [eventId, token]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  // Debounced member search for adding manual attendee
  useEffect(() => {
    const q = memberSearchQuery.trim();
    if (q.length < 2) {
      setMemberSearchResults([]);
      setMemberSearchLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setMemberSearchLoading(true);
      try {
        const res = await api.adminDirectory(token, { search: q, page_size: 8 });
        setMemberSearchResults(res.items || []);
      } catch {
        setMemberSearchResults([]);
      } finally {
        setMemberSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [memberSearchQuery, token]);

  const existingRegForSelected = useMemo(() => {
    if (!selectedStudent) return null;
    return registrations.find(
      (r) =>
        r.user_id === selectedStudent.id ||
        r.member_uids?.includes(selectedStudent.id)
    );
  }, [selectedStudent, registrations]);

  const handleAddManualAttendee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !token) return;

    setAddingManual(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await api.adminAddManualRegistration(token, eventId, {
        user_id: selectedStudent.id,
        status: manualStatus,
        attendance_note: manualNote.trim() || undefined,
        award_points: awardPoints,
      });

      // Update local registrations list
      setRegistrations((prev) => {
        const idx = prev.findIndex(
          (r) => r.id === result.id || r.user_id === result.user_id
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = result;
          return updated;
        }
        return [result, ...prev];
      });

      const statusLabels: Record<string, string> = {
        checked_in: "Present",
        absent: "Absent",
        disqualified: "Disqualified",
        excused: "Excused",
        registered: "Registered",
        waitlisted: "Waitlisted",
      };

      setSuccessMsg(
        `Added ${selectedStudent.full_name || selectedStudent.email} to attendance as ${statusLabels[manualStatus] || manualStatus}!`
      );
      setTimeout(() => setSuccessMsg(null), 4000);

      setSelectedStudent(null);
      setMemberSearchQuery("");
      setManualNote("");
      setManualStatus("checked_in");
      setShowAddSection(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add student to attendance.");
    } finally {
      setAddingManual(false);
    }
  };

  // Handle single attendance update
  const handleUpdateStatus = async (
    regId: string,
    newStatus: AttendanceStatus,
    note?: string | null
  ) => {
    let finalNote = note;
    if (newStatus === "disqualified" && note === undefined) {
      const reason = prompt("Enter reason for disqualification (optional):", "");
      if (reason === null) return; // User canceled
      finalNote = reason;
    }

    setUpdatingIds((prev) => ({ ...prev, [regId]: true }));
    setError(null);
    setSuccessMsg(null);

    try {
      const updated = await api.adminUpdateRegistrationAttendance(token, eventId, regId, {
        status: newStatus,
        attendance_note: finalNote !== undefined ? finalNote : undefined,
        award_points: awardPoints,
      });

      // Update state locally preserving profile data
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === regId
            ? {
                ...r,
                ...updated,
                user_profile: updated.user_profile || r.user_profile,
                member_profiles: updated.member_profiles || r.member_profiles,
              }
            : r
        )
      );

      const statusLabels: Record<string, string> = {
        checked_in: "Present",
        absent: "Absent",
        disqualified: "Disqualified",
        excused: "Excused",
        registered: "Registered (Reset)",
        waitlisted: "Waitlisted",
      };
      setSuccessMsg(`Status updated to ${statusLabels[newStatus] || newStatus}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update attendance.");
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [regId]: false }));
    }
  };

  // Save attendance note
  const handleSaveNote = async (regId: string) => {
    const currentReg = registrations.find((r) => r.id === regId);
    if (!currentReg) return;

    setUpdatingIds((prev) => ({ ...prev, [regId]: true }));
    try {
      const updated = await api.adminUpdateRegistrationAttendance(token, eventId, regId, {
        status: currentReg.status,
        attendance_note: noteDraft.trim() || null,
        award_points: false,
      });

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === regId
            ? {
                ...r,
                ...updated,
                user_profile: updated.user_profile || r.user_profile,
                member_profiles: updated.member_profiles || r.member_profiles,
              }
            : r
        )
      );
      setEditingNoteId(null);
      setNoteDraft("");
      setSuccessMsg("Attendance note saved successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [regId]: false }));
    }
  };

  // Bulk Roll Call (Mark all filtered registered as Present)
  const [bulkBusy, setBulkBusy] = useState(false);
  const handleBulkCheckIn = async () => {
    // Only people who hold a place. A waitlisted person did not get one, and the
    // server refuses to check them in, so sending them only inflated the count
    // the admin was shown.
    const targets = filtered.filter((r) => r.status === "registered");
    const allAttendeeUids: string[] = [];
    for (const t of targets) {
      if (t.member_uids && t.member_uids.length > 0) {
        allAttendeeUids.push(...t.member_uids);
      } else if (t.user_id) {
        allAttendeeUids.push(t.user_id);
      }
    }
    if (allAttendeeUids.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to mark ${allAttendeeUids.length} attendee(s) as PRESENT? ${
          awardPoints ? `They will each receive +${attendancePoints} merit points.` : ""
        }`
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await api.adminRollCall(token, eventId, allAttendeeUids, awardPoints);
      await loadRegistrations();
      // Report what the server did, not what was asked for. A place can be
      // cancelled between loading the roster and the roll-call.
      const done = result.awarded_uids.length;
      const refused = result.failed_uids.length;
      setSuccessMsg(`${done} ${done === 1 ? "person" : "people"} checked in.`);
      if (refused > 0) {
        setError(`${refused} ${refused === 1 ? "person" : "people"} could not be checked in — they no longer hold a place. Refresh to see the current roster.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk roll-call failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Summary Counts
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let disqualified = 0;
    let excused = 0;
    let registered = 0;
    let waitlisted = 0;

    for (const r of registrations) {
      switch (r.status) {
        case "checked_in":
          present++;
          break;
        case "absent":
          absent++;
          break;
        case "disqualified":
          disqualified++;
          break;
        case "excused":
          excused++;
          break;
        case "waitlisted":
          waitlisted++;
          break;
        default:
          registered++;
          break;
      }
    }
    return {
      total: registrations.length,
      present,
      absent,
      disqualified,
      excused,
      registered,
      waitlisted,
    };
  }, [registrations]);

  // Filtered List
  const filtered = useMemo(() => {
    return registrations.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (r.user_profile?.full_name || "").toLowerCase().includes(q);
        const matchEmail = (r.user_profile?.email || "").toLowerCase().includes(q);
        const matchTeam = (r.team_name || "").toLowerCase().includes(q);
        const matchUser = (r.user_id || "").toLowerCase().includes(q);
        const matchMembers = (r.member_uids || []).some((m) => m.toLowerCase().includes(q));
        const matchNote = (r.attendance_note || "").toLowerCase().includes(q);
        return matchName || matchEmail || matchTeam || matchUser || matchMembers || matchNote;
      }
      return true;
    });
  }, [registrations, statusFilter, search]);

  const getDropdownClass = (st: string) => {
    switch (st) {
      case "checked_in":
        return styles.dropdownPresent;
      case "absent":
        return styles.dropdownAbsent;
      case "disqualified":
        return styles.dropdownDisqualified;
      case "excused":
        return styles.dropdownExcused;
      case "waitlisted":
        return styles.dropdownWaitlisted;
      default:
        return styles.dropdownRegistered;
    }
  };

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

  return (
    <div className={styles.attendancePanel}>
      {/* Header */}
      <div className={styles.attendeesHeaderRow}>
        <div>
          <h3 className={styles.sectionTitle}>
            <MemberIcon name="shield" size={20} />
            Event Attendance & Roll-Call Roster
          </h3>
          <p className={styles.sectionSubtitle}>
            Administrative attendance console. Hover over any student name to view their profile info card. Select attendance status from the dropdown.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setShowAddSection((prev) => !prev);
              setSelectedStudent(null);
              setMemberSearchQuery("");
            }}
            className={styles.addAttendeeToggleBtn}
            title="Add a student directly by name even if not RSVPed"
          >
            <MemberIcon name="plus" size={14} />
            {showAddSection ? "Close Walk-in Form" : "+ Add Student / Walk-in"}
          </button>

          <button
            type="button"
            onClick={loadRegistrations}
            disabled={loading}
            className={styles.refreshBtn}
            title="Refresh attendance records"
          >
            <MemberIcon name="lightning" size={14} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className={styles.attendanceStatsRow}>
        <div className={styles.statCard}>
          <span className={styles.statCardNum}>{stats.total}</span>
          <span className={styles.statCardLabel}>Total Registered</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPresent}`}>
          <span className={styles.statCardNum} style={{ color: "#22c55e" }}>{stats.present}</span>
          <span className={styles.statCardLabel}>Present</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardAbsent}`}>
          <span className={styles.statCardNum} style={{ color: "#f87171" }}>{stats.absent}</span>
          <span className={styles.statCardLabel}>Absent</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDisqualified}`}>
          <span className={styles.statCardNum} style={{ color: "#ef4444" }}>{stats.disqualified}</span>
          <span className={styles.statCardLabel}>Disqualified</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardExcused}`}>
          <span className={styles.statCardNum} style={{ color: "#38bdf8" }}>{stats.excused}</span>
          <span className={styles.statCardLabel}>Excused</span>
        </div>
      </div>

      {/* Action Notifications */}
      {successMsg && (
        <div className={styles.alertSuccessBox}>
          <MemberIcon name="check" size={16} />
          {successMsg}
        </div>
      )}
      {error && (
        <div className={styles.alertErrorBox}>
          <MemberIcon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {/* Walk-in / Manual Student Add Section */}
      {showAddSection && (
        <div className={styles.addManualCard}>
          <div className={styles.addManualHeader}>
            <div>
              <div className={styles.addManualTitle}>
                <MemberIcon name="user" size={18} />
                Add Student to Attendance Roster (Walk-in)
              </div>
              <p className={styles.addManualSubtitle}>
                Add any student by searching their name or email from the SST/Reinforce member directory, even if they haven&apos;t RSVP&apos;d beforehand.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddSection(false);
                setSelectedStudent(null);
                setMemberSearchQuery("");
              }}
              className={styles.changeStudentBtn}
            >
              Close
            </button>
          </div>

          {!selectedStudent ? (
            <div className={styles.searchStudentBox}>
              <input
                type="search"
                placeholder="Type student name (e.g. Aryan, Priyanshu) or SST email to search…"
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className={styles.studentSearchInput}
                autoFocus
              />

              {memberSearchLoading && (
                <div style={{ fontSize: "12px", color: "#e5b731", marginTop: "6px" }}>
                  Searching student directory…
                </div>
              )}

              {memberSearchQuery.trim().length >= 2 && !memberSearchLoading && (
                <div className={styles.searchResultsDropdown}>
                  {memberSearchResults.length > 0 ? (
                    memberSearchResults.map((student) => {
                      const initial = (student.full_name?.[0] || "?").toUpperCase();
                      const isAlready = registrations.some(
                        (r) => r.user_id === student.id || r.member_uids?.includes(student.id)
                      );

                      return (
                        <button
                          key={student.id}
                          type="button"
                          className={styles.searchResultItem}
                          onClick={() => {
                            setSelectedStudent(student);
                            setMemberSearchQuery("");
                            setMemberSearchResults([]);
                          }}
                        >
                          <div className={styles.searchResultStudentInfo}>
                            <div className={styles.searchResultAvatar}>
                              {student.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={student.avatar_url}
                                  alt={student.full_name}
                                  className={styles.searchResultAvatarImg}
                                />
                              ) : (
                                <span>{initial}</span>
                              )}
                            </div>
                            <div className={styles.searchResultNameRow}>
                              <span className={styles.searchResultName}>{student.full_name}</span>
                              <span className={styles.searchResultEmail}>{student.email || student.id}</span>
                            </div>
                          </div>

                          <div className={styles.searchResultBadges}>
                            {student.batch_year && (
                              <span className={styles.searchResultBatchTag}>Batch {student.batch_year}</span>
                            )}
                            {isAlready && (
                              <span className={styles.searchResultRegisteredBadge}>✓ Already on list</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.searchEmptyText}>
                      No students found matching &ldquo;{memberSearchQuery}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleAddManualAttendee} className={styles.selectedStudentBox}>
              <div className={styles.selectedStudentTopRow}>
                <div className={styles.selectedStudentDetails}>
                  <div className={styles.selectedAvatar}>
                    {selectedStudent.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedStudent.avatar_url}
                        alt={selectedStudent.full_name}
                        className={styles.selectedAvatarImg}
                      />
                    ) : (
                      <span>{(selectedStudent.full_name?.[0] || "?").toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className={styles.selectedStudentName}>{selectedStudent.full_name}</div>
                    <div className={styles.selectedStudentEmail}>{selectedStudent.email || selectedStudent.id}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className={styles.changeStudentBtn}
                >
                  Change Student
                </button>
              </div>

              {existingRegForSelected && (
                <div className={styles.alreadyRegisteredNotice}>
                  <MemberIcon name="alert-circle" size={15} />
                  <span>
                    Note: This student already has an active record (Status: <strong>{existingRegForSelected.status}</strong>). Submitting will update their status directly.
                  </span>
                </div>
              )}

              <div className={styles.selectedFormGrid}>
                <div className={styles.formFieldGroup}>
                  <label className={styles.formFieldLabel}>Attendance Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as AttendanceStatus)}
                    className={`${styles.attendanceDropdown} ${getDropdownClass(manualStatus)}`}
                    style={{ width: "100%", height: "38px" }}
                  >
                    <option value="checked_in">✓ Present (Checked-in)</option>
                    <option value="absent">✗ Absent</option>
                    <option value="excused">○ Excused</option>
                    <option value="disqualified">⊘ Disqualified</option>
                    <option value="registered">Registered (Pending)</option>
                  </select>
                </div>

                <div className={styles.formFieldGroup}>
                  <label className={styles.formFieldLabel}>Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Walk-in attendee, spot registration…"
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    className={styles.formInputField}
                    style={{ height: "38px" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={addingManual}
                  className={styles.addSubmitBtn}
                >
                  {addingManual ? "Adding Student…" : "+ Confirm & Add to Attendance"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Toolbar: Search, Filters & Bulk Actions */}
      <div className={styles.attendanceToolbar}>
        <input
          type="search"
          placeholder="Search by student name, email, team, or note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.attendeeSearchInput}
          style={{ flex: 1, minWidth: "220px" }}
        />

        <div className={styles.filterPillsRow}>
          {[
            { id: "all", label: "All" },
            { id: "checked_in", label: "Present" },
            { id: "absent", label: "Absent" },
            { id: "disqualified", label: "Disqualified" },
            { id: "excused", label: "Excused" },
            { id: "registered", label: "Registered" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterPill} ${statusFilter === item.id ? styles.filterPillActive : ""}`}
              onClick={() => setStatusFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Roll-Call Options */}
      <div className={styles.bulkActionBarBox}>
        <label className={styles.awardCheckboxLabel}>
          <input
            type="checkbox"
            checked={awardPoints}
            onChange={(e) => setAwardPoints(e.target.checked)}
          />
          <span>Award merit attendance points (+{attendancePoints} PTS) on check-in</span>
        </label>

        <button
          type="button"
          onClick={handleBulkCheckIn}
          disabled={bulkBusy || loading}
          className={styles.bulkRollCallBtn}
          title="Mark all pending registrations as Present"
        >
          <MemberIcon name="check" size={14} />
          {bulkBusy ? "Processing Roll-Call…" : "Check-in All Unmarked"}
        </button>
      </div>

      {/* ATTENDANCE ROSTER */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px", color: "var(--brand, #E5B731)" }}>
          Loading attendance records…
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyCardBox}>
          <MemberIcon name="users" size={32} />
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#8c8c98" }}>
            No attendee records found matching the active filter.
          </p>
        </div>
      ) : (
        <div className={styles.rosterList}>
          {filtered.map((r) => {
            const isBusy = updatingIds[r.id] || false;
            const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
            const leadName = r.user_profile?.full_name || r.user_id;
            // Each row's status control says whose status it is; a bare select is
            // announced as "combo box" once per person.
            const rowName = isTeam ? `team ${r.team_name || leadName}` : leadName;

            return (
              <div key={r.id} className={styles.rosterCard}>
                <div className={styles.rosterCardTop}>
                  <div className={styles.rosterIdentity}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className={isTeam ? styles.teamIconBox : styles.soloIconBox}>
                        <MemberIcon name={isTeam ? "users" : "user"} size={14} />
                      </span>

                      {/* Student or Team Name with Hover Card */}
                      {isTeam ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong className={styles.rosterTitle}>{r.team_name || "Team"}</strong>
                          <span className={styles.rosterTypeTag}>SPG / TEAM</span>
                        </div>
                      ) : (
                        <StudentHoverCard profile={r.user_profile} fallbackId={r.user_id}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <strong className={styles.rosterStudentName}>{leadName}</strong>
                            <span className={styles.rosterTypeTag}>SOLO</span>
                          </div>
                        </StudentHoverCard>
                      )}
                    </div>

                    <div className={styles.rosterMetaDetails}>
                      {isTeam ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "#8c8c98" }}>Lead:</span>
                          <StudentHoverCard profile={r.user_profile} fallbackId={r.user_id}>
                            <span className={styles.clickableStudentName}>
                              {leadName}
                            </span>
                          </StudentHoverCard>
                        </div>
                      ) : (
                        <span><strong>Email:</strong> {r.user_profile?.email || "No email on record"}</span>
                      )}

                      {/* Teammates with Hover Card */}
                      {isTeam && r.member_uids && r.member_uids.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ color: "#8c8c98" }}>Teammates:</span>
                          {r.member_uids.map((uid) => {
                            const prof = getMemberProfile(r, uid);
                            const nameDisplay = prof?.full_name || uid;
                            return (
                              <StudentHoverCard key={uid} profile={prof} fallbackId={uid}>
                                <span className={styles.clickableMemberChip}>
                                  {uid === r.user_id ? `👑 ${nameDisplay}` : nameDisplay}
                                </span>
                              </StudentHoverCard>
                            );
                          })}
                        </div>
                      )}

                      {r.spg_id && (
                        <span style={{ color: "#e5b731", fontWeight: 600 }}>SPG: {r.spg_id}</span>
                      )}
                    </div>
                  </div>

                  {/* Attendance Status Dropdown Selector */}
                  <div className={styles.attendanceSelectorBox}>
                    <label className={styles.selectorLabel}>Attendance Status:</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <select
                        aria-label={`Attendance status for ${rowName}`}
                        value={r.status}
                        disabled={isBusy}
                        onChange={(e) => handleUpdateStatus(r.id, e.target.value as AttendanceStatus)}
                        className={`${styles.attendanceDropdown} ${getDropdownClass(r.status)}`}
                      >
                        <option value="checked_in">✓ Present</option>
                        <option value="absent">✗ Absent</option>
                        <option value="disqualified">⊘ Disqualified</option>
                        <option value="excused">○ Excused</option>
                        <option value="registered">Registered (Pending)</option>
                        <option value="waitlisted">Waitlisted</option>
                      </select>

                      {isBusy && <span className={styles.rosterBusyText}>Updating…</span>}
                    </div>
                  </div>
                </div>

                {/* Note display / editing */}
                {r.attendance_note && editingNoteId !== r.id && (
                  <div className={styles.rosterNoteBox}>
                    <span><strong>Note:</strong> {r.attendance_note}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(r.id);
                        setNoteDraft(r.attendance_note || "");
                      }}
                      className={styles.editNoteLink}
                    >
                      Edit Note
                    </button>
                  </div>
                )}

                {editingNoteId === r.id && (
                  <div className={styles.noteEditBox}>
                    <input
                      type="text"
                      placeholder="Enter attendance or disqualification reason…"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      className={styles.noteInputField}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveNote(r.id)}
                      disabled={isBusy}
                      className={styles.saveNoteBtn}
                    >
                      Save Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNoteId(null)}
                      className={styles.cancelNoteBtn}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Footer bar */}
                <div className={styles.rosterFooterRow}>
                  <span className={styles.registeredTime}>
                    {r.checked_in_at ? `Checked in: ${new Date(r.checked_in_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}` : `Registered`}
                  </span>

                  {editingNoteId !== r.id && !r.attendance_note && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(r.id);
                        setNoteDraft("");
                      }}
                      className={styles.addNoteBtn}
                    >
                      + Add Note
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
