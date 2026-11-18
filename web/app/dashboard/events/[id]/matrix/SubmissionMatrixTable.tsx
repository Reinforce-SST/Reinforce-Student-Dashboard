"use client";

import React, { useState, useMemo } from "react";
import type { EventRegistration } from "@/lib/api";
import { aggregateEventAttendees, type AggregatedTeam } from "@/lib/eventAttendees";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./SubmissionMatrix.module.css";

interface SubmissionMatrixTableProps {
  eventId: string;
  eventTitle: string;
  registrations: EventRegistration[];
  loading: boolean;
  approvedIdeas?: Array<{ id: string; title: string; track?: string; description?: string }>;
  tracks?: Array<{ track_id: string; name: string }>;
  onRefresh: () => void;
}

export interface SubmissionRowItem {
  id: string;
  type: "team" | "solo";
  name: string;
  leaderName: string;
  leaderEmail: string;
  members: Array<{ id: string; name: string; email?: string }>;
  track: string;
  problemStatementTitle?: string | null;
  problemStatementId?: string | null;
  repoUrl?: string | null;
  demoUrl?: string | null;
  slidesUrl?: string | null;
  paperLink?: string | null;
  notes?: string | null;
  customFields?: Record<string, any> | null;
  status: string;
  hasSubmitted: boolean;
  submittedAt?: string | null;
  submittedBy?: string | null;
  rawReg: EventRegistration;
}

export default function SubmissionMatrixTable({
  eventTitle,
  registrations,
  loading,
  approvedIdeas = [],
  tracks = [],
  onRefresh,
}: SubmissionMatrixTableProps) {
  const [viewMode, setViewMode] = useState<"teams" | "solos">("teams");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "pending">("all");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [inspectTarget, setInspectTarget] = useState<SubmissionRowItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Map of idea ID to title
  const ideaMap = useMemo(() => {
    const map = new Map<string, { title: string; track?: string }>();
    for (const idea of approvedIdeas) {
      if (idea?.id) {
        map.set(idea.id, { title: idea.title, track: idea.track });
      }
    }
    return map;
  }, [approvedIdeas]);

  // Aggregate attendees into teams and solos
  const { allTeams, soloRegistrations } = useMemo(() => {
    return aggregateEventAttendees(registrations);
  }, [registrations]);

  // Default viewMode to solos if there are no teams
  const effectiveViewMode = allTeams.length === 0 ? "solos" : viewMode;

  // Transform aggregated teams into row items
  const teamRows = useMemo<SubmissionRowItem[]>(() => {
    return allTeams.map((team: AggregatedTeam) => {
      // Find all registrations matching this team
      const teamRegs = registrations.filter(
        (r) =>
          r.team_id === team.team_id ||
          (team.spg_id && r.spg_id === team.spg_id) ||
          (r.team_name && r.team_name.trim().toLowerCase() === team.team_name.trim().toLowerCase())
      );

      // Find any submission on these registrations
      const subReg =
        teamRegs.find(
          (r) =>
            r.submission &&
            (r.submission.repo_url ||
              r.submission.demo_url ||
              r.submission.slides_url ||
              r.submission.paper_link ||
              r.submission.notes ||
              r.submission.submitted_at)
        ) || teamRegs[0];

      const sub = subReg?.submission || null;

      // Extract problem statement
      const psId =
        sub?.problem_statement_id ||
        teamRegs.find((r) => r.problem_statement_id || r.idea_id)?.problem_statement_id ||
        teamRegs.find((r) => r.idea_id)?.idea_id ||
        null;
      const ideaInfo = psId ? ideaMap.get(psId) : null;
      const problemTitle = ideaInfo?.title || (psId ? `Problem #${psId.slice(0, 8)}` : null);

      // Extract track
      const trackId = teamRegs.find((r) => r.selected_track_id)?.selected_track_id;
      const trackObj = trackId ? tracks.find((t) => t.track_id === trackId) : null;
      const trackName = trackObj?.name || trackId || ideaInfo?.track || "general";

      // Members
      const members = team.member_uids.map((uid) => {
        const p = team.profileMap.get(uid);
        return {
          id: uid,
          name: p?.full_name || `Member ${uid.slice(0, 6)}`,
          email: p?.email,
        };
      });

      const leaderProfile = team.leader_profile || team.profileMap.get(team.leader_uid);
      const leaderName = leaderProfile?.full_name || `Lead ${team.leader_uid.slice(0, 6)}`;
      const leaderEmail = leaderProfile?.email || "";

      const hasSubmitted = Boolean(
        sub &&
          (sub.repo_url ||
            sub.demo_url ||
            sub.slides_url ||
            sub.paper_link ||
            sub.notes ||
            sub.submitted_at)
      );

      return {
        id: team.key,
        type: "team",
        name: team.team_name,
        leaderName,
        leaderEmail,
        members,
        track: trackName,
        problemStatementTitle: problemTitle,
        problemStatementId: psId,
        repoUrl: sub?.repo_url || null,
        demoUrl: sub?.demo_url || null,
        slidesUrl: sub?.slides_url || null,
        paperLink: sub?.paper_link || null,
        notes: sub?.notes || null,
        customFields: sub?.custom_fields || null,
        status: team.status,
        hasSubmitted,
        submittedAt: sub?.submitted_at || null,
        submittedBy: sub?.submitted_by || null,
        rawReg: subReg || teamRegs[0],
      };
    });
  }, [allTeams, registrations, ideaMap, tracks]);

  // Transform solo registrations into row items
  const soloRows = useMemo<SubmissionRowItem[]>(() => {
    return soloRegistrations.map((r) => {
      const sub = r.submission || null;
      const psId = sub?.problem_statement_id || r.problem_statement_id || r.idea_id || null;
      const ideaInfo = psId ? ideaMap.get(psId) : null;
      const problemTitle = ideaInfo?.title || (psId ? `Problem #${psId.slice(0, 8)}` : null);

      const trackObj = r.selected_track_id
        ? tracks.find((t) => t.track_id === r.selected_track_id)
        : null;
      const trackName = trackObj?.name || r.selected_track_id || ideaInfo?.track || "general";

      const name = r.user_profile?.full_name || `Member ${r.user_id.slice(0, 6)}`;
      const email = r.user_profile?.email || "";

      const hasSubmitted = Boolean(
        sub &&
          (sub.repo_url ||
            sub.demo_url ||
            sub.slides_url ||
            sub.paper_link ||
            sub.notes ||
            sub.submitted_at)
      );

      return {
        id: r.id || r.user_id,
        type: "solo",
        name,
        leaderName: name,
        leaderEmail: email,
        members: [{ id: r.user_id, name, email }],
        track: trackName,
        problemStatementTitle: problemTitle,
        problemStatementId: psId,
        repoUrl: sub?.repo_url || null,
        demoUrl: sub?.demo_url || null,
        slidesUrl: sub?.slides_url || null,
        paperLink: sub?.paper_link || null,
        notes: sub?.notes || null,
        customFields: sub?.custom_fields || null,
        status: r.status,
        hasSubmitted,
        submittedAt: sub?.submitted_at || null,
        submittedBy: sub?.submitted_by || null,
        rawReg: r,
      };
    });
  }, [soloRegistrations, ideaMap, tracks]);

  const activeRows = effectiveViewMode === "teams" ? teamRows : soloRows;

  // Filtered rows
  const filteredRows = useMemo(() => {
    return activeRows.filter((row) => {
      // Status filter
      if (statusFilter === "submitted" && !row.hasSubmitted) return false;
      if (statusFilter === "pending" && row.hasSubmitted) return false;

      // Track filter
      if (trackFilter !== "all" && row.track.toLowerCase() !== trackFilter.toLowerCase()) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = row.name.toLowerCase().includes(q);
        const matchLead = row.leaderName.toLowerCase().includes(q);
        const matchEmail = row.leaderEmail.toLowerCase().includes(q);
        const matchMembers = row.members.some((m) => m.name.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q)));
        const matchIdea = (row.problemStatementTitle || "").toLowerCase().includes(q);
        const matchRepo = (row.repoUrl || "").toLowerCase().includes(q);
        const matchDemo = (row.demoUrl || "").toLowerCase().includes(q);
        const matchNotes = (row.notes || "").toLowerCase().includes(q);
        return matchName || matchLead || matchEmail || matchMembers || matchIdea || matchRepo || matchDemo || matchNotes;
      }

      return true;
    });
  }, [activeRows, statusFilter, trackFilter, search]);

  // Aggregate summary statistics
  const stats = useMemo(() => {
    const total = activeRows.length;
    const submitted = activeRows.filter((r) => r.hasSubmitted).length;
    const pending = total - submitted;
    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    const repos = activeRows.filter((r) => r.repoUrl).length;
    const demos = activeRows.filter((r) => r.demoUrl).length;
    const slides = activeRows.filter((r) => r.slidesUrl).length;
    return { total, submitted, pending, pct, repos, demos, slides };
  }, [activeRows]);

  // Available tracks from rows
  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeRows) {
      if (r.track) set.add(r.track);
    }
    return Array.from(set).sort();
  }, [activeRows]);

  // Export submissions to CSV
  const handleExportCsv = () => {
    const headers = [
      "Record Type",
      "Name",
      "Leader / Contact",
      "Email",
      "Team Members",
      "Track",
      "Problem Statement",
      "Submission Status",
      "GitHub Repo",
      "Live Demo",
      "Presentation Slides",
      "Paper / Docs",
      "Notes",
      "Submitted At",
      "Registration Status",
    ];

    const escapeCsv = (val: any) => {
      if (val == null) return "";
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredRows.map((r) => [
      escapeCsv(r.type === "team" ? "Team / Squad" : "Individual"),
      escapeCsv(r.name),
      escapeCsv(r.leaderName),
      escapeCsv(r.leaderEmail),
      escapeCsv(r.members.map((m) => m.name).join(", ")),
      escapeCsv(r.track),
      escapeCsv(r.problemStatementTitle || ""),
      escapeCsv(r.hasSubmitted ? "SUBMITTED" : "PENDING"),
      escapeCsv(r.repoUrl || ""),
      escapeCsv(r.demoUrl || ""),
      escapeCsv(r.slidesUrl || ""),
      escapeCsv(r.paperLink || ""),
      escapeCsv(r.notes || ""),
      escapeCsv(r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ""),
      escapeCsv(r.status),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    link.href = url;
    link.download = `${cleanTitle}-deliverables-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={styles.submissionMatrixContainer}>
      {/* 1. Quick Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Registered {effectiveViewMode === "teams" ? "Teams" : "Attendees"}</span>
          <div className={styles.statValue}>
            {stats.total}
            <span className={styles.statSubtext}>total</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Deliverables Submitted</span>
          <div className={styles.statValue} style={{ color: "#4ade80" }}>
            {stats.submitted}
            <span className={styles.statSubtext}>({stats.pct}%)</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending Submissions</span>
          <div className={styles.statValue} style={{ color: stats.pending > 0 ? "#fbbf24" : "#a1a1aa" }}>
            {stats.pending}
            <span className={styles.statSubtext}>unsubmitted</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>GitHub Repositories</span>
          <div className={styles.statValue}>
            {stats.repos}
            <span className={styles.statSubtext}>linked</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Live Demos</span>
          <div className={styles.statValue}>
            {stats.demos}
            <span className={styles.statSubtext}>available</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pitch / Decks</span>
          <div className={styles.statValue}>
            {stats.slides}
            <span className={styles.statSubtext}>slides</span>
          </div>
        </div>
      </div>

      {/* 2. Toolbar: View Mode, Filters, Search & Export */}
      <div className={styles.toolbarCard}>
        <div className={styles.toolbarTopRow}>
          {/* Mode toggle (Squads vs Solo Attendees) */}
          <div className={styles.filterPills}>
            <button
              type="button"
              onClick={() => setViewMode("teams")}
              className={`${styles.filterPill} ${effectiveViewMode === "teams" ? styles.filterPillActive : ""}`}
            >
              <MemberIcon name="users" size={13} />
              <span>Grouped Teams ({allTeams.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("solos")}
              className={`${styles.filterPill} ${effectiveViewMode === "solos" ? styles.filterPillActive : ""}`}
            >
              <MemberIcon name="user" size={13} />
              <span>Solo / Individual ({soloRegistrations.length})</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className={styles.toolbarActions}>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              title="Download structured deliverables CSV"
            >
              <MemberIcon name="download" size={13} />
              Export Submissions CSV ({filteredRows.length})
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={styles.actionBtn}
              title="Refresh registration & submission records"
            >
              <MemberIcon name="refresh" size={13} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.toolbarTopRow}>
          <div className={styles.filterPills}>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`${styles.filterPill} ${statusFilter === "all" ? styles.filterPillActive : ""}`}
            >
              All Records ({activeRows.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("submitted")}
              className={`${styles.filterPill} ${statusFilter === "submitted" ? styles.filterPillActive : ""}`}
            >
              <span style={{ color: "#4ade80" }}>●</span> Submitted ({stats.submitted})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`${styles.filterPill} ${statusFilter === "pending" ? styles.filterPillActive : ""}`}
            >
              <span style={{ color: "#fbbf24" }}>●</span> Pending ({stats.pending})
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {availableTracks.length > 0 && (
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                className={styles.selectDropdown}
                aria-label="Filter by Track"
              >
                <option value="all">All Tracks ({availableTracks.length})</option>
                {availableTracks.map((tr) => (
                  <option key={tr} value={tr}>
                    Track: {tr.toUpperCase()}
                  </option>
                ))}
              </select>
            )}

            <div className={styles.searchBox}>
              <MemberIcon name="search" size={13} />
              <input
                type="search"
                placeholder="Search team, lead, member, repo, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deliverables Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableScrollWrapper}>
          <table className={styles.submissionTable}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.thSticky}`}>
                  {effectiveViewMode === "teams" ? "Team / Squad" : "Participant"}
                </th>
                <th className={styles.th}>
                  {effectiveViewMode === "teams" ? "Leader & Teammates" : "Email / Batch"}
                </th>
                <th className={styles.th}>Track</th>
                <th className={styles.th}>Problem Statement</th>
                <th className={styles.th}>GitHub Repository</th>
                <th className={styles.th}>Live Demo</th>
                <th className={styles.th}>Slides / Deck</th>
                <th className={styles.th}>Paper / Docs</th>
                <th className={styles.th}>Submission Status</th>
                <th className={styles.th}>Submitted At</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className={styles.emptyState}>
                      <MemberIcon name="inbox" size={36} />
                      <div style={{ fontWeight: 600, color: "#e4e4e7" }}>
                        {loading ? "Loading registrations..." : "No matching registrations or deliverables found."}
                      </div>
                      <div style={{ fontSize: "12px", color: "#71717a" }}>
                        {search || statusFilter !== "all" || trackFilter !== "all"
                          ? "Try adjusting your search query or status filter."
                          : "Participants will appear here once they register for the event."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isSelected = inspectTarget?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setInspectTarget(row)}
                      className={`${styles.tr} ${isSelected ? styles.trSelected : ""}`}
                    >
                      {/* 1. Name & Team Info */}
                      <td className={`${styles.td} ${styles.tdSticky}`}>
                        <div className={styles.teamNameCell}>
                          <span className={styles.teamNameText}>
                            {effectiveViewMode === "teams" && <MemberIcon name="users" size={13} />}
                            {row.name}
                          </span>
                          <span className={styles.teamMetaText}>
                            {row.members.length} {row.members.length === 1 ? "member" : "members"}
                            {row.rawReg?.roster_locked && " · 🔒 Locked"}
                          </span>
                        </div>
                      </td>

                      {/* 2. Members Info */}
                      <td className={styles.td}>
                        <div className={styles.membersCell}>
                          <div className={styles.leaderRow}>
                            <span className={styles.leaderCrown} title="Team Lead">👑</span>
                            <span>{row.leaderName}</span>
                          </div>
                          {row.members.length > 1 && (
                            <div className={styles.teammatesRow}>
                              {row.members
                                .filter((m) => m.name !== row.leaderName)
                                .map((m) => (
                                  <span key={m.id} style={{ background: "#27272a", padding: "1px 6px", borderRadius: "4px" }}>
                                    {m.name}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Track */}
                      <td className={styles.td}>
                        <span className={styles.trackBadge}>{row.track}</span>
                      </td>

                      {/* 4. Problem Statement */}
                      <td className={styles.td}>
                        {row.problemStatementTitle ? (
                          <div className={styles.problemStatementCell} title={row.problemStatementTitle}>
                            💡 {row.problemStatementTitle}
                          </div>
                        ) : (
                          <span className={styles.linkMissing}>—</span>
                        )}
                      </td>

                      {/* 5. GitHub Repo */}
                      <td className={styles.td}>
                        {row.repoUrl ? (
                          <a
                            href={row.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`${styles.linkBadge} ${styles.linkBadgeGithub}`}
                            title={row.repoUrl}
                          >
                            <MemberIcon name="github" size={12} />
                            <span>Repository</span>
                          </a>
                        ) : (
                          <span className={styles.linkMissing}>—</span>
                        )}
                      </td>

                      {/* 6. Live Demo */}
                      <td className={styles.td}>
                        {row.demoUrl ? (
                          <a
                            href={row.demoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`${styles.linkBadge} ${styles.linkBadgeDemo}`}
                            title={row.demoUrl}
                          >
                            <MemberIcon name="external" size={12} />
                            <span>Demo Link</span>
                          </a>
                        ) : (
                          <span className={styles.linkMissing}>—</span>
                        )}
                      </td>

                      {/* 7. Slides */}
                      <td className={styles.td}>
                        {row.slidesUrl ? (
                          <a
                            href={row.slidesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`${styles.linkBadge} ${styles.linkBadgeSlides}`}
                            title={row.slidesUrl}
                          >
                            <MemberIcon name="award" size={12} />
                            <span>Slides / Deck</span>
                          </a>
                        ) : (
                          <span className={styles.linkMissing}>—</span>
                        )}
                      </td>

                      {/* 8. Paper Link */}
                      <td className={styles.td}>
                        {row.paperLink ? (
                          <a
                            href={row.paperLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`${styles.linkBadge} ${styles.linkBadgePaper}`}
                            title={row.paperLink}
                          >
                            <MemberIcon name="book" size={12} />
                            <span>Paper / Docs</span>
                          </a>
                        ) : (
                          <span className={styles.linkMissing}>—</span>
                        )}
                      </td>

                      {/* 9. Submission Status */}
                      <td className={styles.td}>
                        {row.hasSubmitted ? (
                          <span className={`${styles.statusBadge} ${styles.statusSubmitted}`}>
                            <MemberIcon name="check" size={11} />
                            Submitted
                          </span>
                        ) : (
                          <span className={`${styles.statusBadge} ${styles.statusPending}`}>
                            <MemberIcon name="clock" size={11} />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* 10. Timestamp */}
                      <td className={styles.td}>
                        <span className={styles.timestampText}>{formatDate(row.submittedAt)}</span>
                      </td>

                      {/* 11. Inspect Action */}
                      <td className={styles.td} style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectTarget(row);
                          }}
                          className={styles.iconBtn}
                          title="Inspect submission details"
                        >
                          <MemberIcon name="eye" size={12} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Side Inspector Drawer */}
      {inspectTarget && (
        <aside className={styles.inspectorDrawer} aria-label="Deliverables Inspector">
          <div className={styles.inspectorHeader}>
            <div>
              <h3 className={styles.inspectorTitle}>{inspectTarget.name}</h3>
              <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
                {inspectTarget.type === "team" ? "Squad Deliverables" : "Individual Submission"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInspectTarget(null)}
              className={styles.inspectorCloseBtn}
              aria-label="Close Inspector"
            >
              ✕
            </button>
          </div>

          <div className={styles.inspectorBody}>
            {/* Status & Timing */}
            <div className={styles.inspectorSection}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={styles.sectionHeading}>Submission Status</span>
                {inspectTarget.hasSubmitted ? (
                  <span className={`${styles.statusBadge} ${styles.statusSubmitted}`}>
                    <MemberIcon name="check" size={11} />
                    Submitted
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.statusPending}`}>
                    <MemberIcon name="clock" size={11} />
                    Pending / Not Submitted
                  </span>
                )}
              </div>
              {inspectTarget.submittedAt && (
                <div style={{ fontSize: "12px", color: "#a1a1aa", marginTop: "4px" }}>
                  Submitted on: <strong>{new Date(inspectTarget.submittedAt).toLocaleString()}</strong>
                </div>
              )}
            </div>

            {/* Team Roster & Contacts */}
            <div className={styles.inspectorSection}>
              <h4 className={styles.sectionHeading}>Participants & Contacts</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {inspectTarget.members.map((m) => {
                  const isLead = m.name === inspectTarget.leaderName;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        background: "#18181b",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {isLead && <span title="Leader">👑</span>}
                        <strong style={{ color: "#ffffff" }}>{m.name}</strong>
                      </div>
                      {m.email && (
                        <a
                          href={`mailto:${m.email}`}
                          style={{ color: "#e5b731", textDecoration: "none", fontSize: "11px" }}
                        >
                          {m.email}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Problem Statement */}
            {inspectTarget.problemStatementTitle && (
              <div className={styles.inspectorSection}>
                <h4 className={styles.sectionHeading}>Idea Jar Problem Statement</h4>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>
                  💡 {inspectTarget.problemStatementTitle}
                </div>
                {inspectTarget.problemStatementId && (
                  <div style={{ fontSize: "11px", color: "#71717a" }}>
                    ID: {inspectTarget.problemStatementId}
                  </div>
                )}
              </div>
            )}

            {/* Deliverables Links */}
            <div className={styles.inspectorSection}>
              <h4 className={styles.sectionHeading}>Project Deliverables</h4>

              {/* GitHub */}
              <div className={styles.deliverableRow}>
                <div className={styles.deliverableLabel}>
                  <MemberIcon name="github" size={14} />
                  <span>GitHub Repository</span>
                </div>
                {inspectTarget.repoUrl ? (
                  <div className={styles.deliverableButtons}>
                    <button
                      type="button"
                      onClick={() => handleCopy(inspectTarget.repoUrl!, "repo")}
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="copy" size={12} />
                      {copiedKey === "repo" ? "Copied!" : "Copy"}
                    </button>
                    <a
                      href={inspectTarget.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="external" size={12} />
                      Open
                    </a>
                  </div>
                ) : (
                  <span className={styles.linkMissing}>Not provided</span>
                )}
              </div>

              {/* Live Demo */}
              <div className={styles.deliverableRow}>
                <div className={styles.deliverableLabel}>
                  <MemberIcon name="external" size={14} />
                  <span>Live Demo URL</span>
                </div>
                {inspectTarget.demoUrl ? (
                  <div className={styles.deliverableButtons}>
                    <button
                      type="button"
                      onClick={() => handleCopy(inspectTarget.demoUrl!, "demo")}
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="copy" size={12} />
                      {copiedKey === "demo" ? "Copied!" : "Copy"}
                    </button>
                    <a
                      href={inspectTarget.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="external" size={12} />
                      Open
                    </a>
                  </div>
                ) : (
                  <span className={styles.linkMissing}>Not provided</span>
                )}
              </div>

              {/* Slides */}
              <div className={styles.deliverableRow}>
                <div className={styles.deliverableLabel}>
                  <MemberIcon name="award" size={14} />
                  <span>Presentation / Pitch</span>
                </div>
                {inspectTarget.slidesUrl ? (
                  <div className={styles.deliverableButtons}>
                    <button
                      type="button"
                      onClick={() => handleCopy(inspectTarget.slidesUrl!, "slides")}
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="copy" size={12} />
                      {copiedKey === "slides" ? "Copied!" : "Copy"}
                    </button>
                    <a
                      href={inspectTarget.slidesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="external" size={12} />
                      Open
                    </a>
                  </div>
                ) : (
                  <span className={styles.linkMissing}>Not provided</span>
                )}
              </div>

              {/* Paper Link */}
              <div className={styles.deliverableRow}>
                <div className={styles.deliverableLabel}>
                  <MemberIcon name="book" size={14} />
                  <span>Paper / Documentation</span>
                </div>
                {inspectTarget.paperLink ? (
                  <div className={styles.deliverableButtons}>
                    <button
                      type="button"
                      onClick={() => handleCopy(inspectTarget.paperLink!, "paper")}
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="copy" size={12} />
                      {copiedKey === "paper" ? "Copied!" : "Copy"}
                    </button>
                    <a
                      href={inspectTarget.paperLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.iconBtn}
                    >
                      <MemberIcon name="external" size={12} />
                      Open
                    </a>
                  </div>
                ) : (
                  <span className={styles.linkMissing}>Not provided</span>
                )}
              </div>
            </div>

            {/* Notes */}
            {inspectTarget.notes && (
              <div className={styles.inspectorSection}>
                <h4 className={styles.sectionHeading}>Submission Remarks / Notes</h4>
                <div className={styles.notesBox}>{inspectTarget.notes}</div>
              </div>
            )}

            {/* Custom Deliverable Responses */}
            {inspectTarget.customFields && Object.keys(inspectTarget.customFields).length > 0 && (
              <div className={styles.inspectorSection}>
                <h4 className={styles.sectionHeading}>Custom Deliverable Intake</h4>
                <div className={styles.customFieldsGrid}>
                  {Object.entries(inspectTarget.customFields).map(([k, v]) => (
                    <div key={k} className={styles.customFieldItem}>
                      <span className={styles.customFieldKey}>{k}</span>
                      <span className={styles.customFieldValue}>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
