"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import {
  type SPGRecord,
  type SPGReportRecord,
  type SPGMilestone,
  type SPGType,
  type SPGTrack,
  type SPGVisibility,
  type SPGStatus,
} from "@/lib/spgData";
import styles from "./AdminSpgDetail.module.css";

export default function AdminSpgDetailClient({ spgId }: { spgId: string }) {
  const { token, profile } = useMember();
  const [spg, setSpg] = useState<SPGRecord | null>(null);
  const [reports, setReports] = useState<SPGReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Milestones State
  const [milestonesList, setMilestonesList] = useState<SPGMilestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  // Edit SPG Metadata Form State
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<SPGType>("learning");
  const [editTrack, setEditTrack] = useState<SPGTrack>("general");
  const [editVisibility, setEditVisibility] = useState<SPGVisibility>("private");
  const [editRecruiting, setEditRecruiting] = useState(false);
  const [editRecruitingRoles, setEditRecruitingRoles] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Team Member Management State
  const [newMemberUid, setNewMemberUid] = useState("");
  const [managingTeam, setManagingTeam] = useState(false);

  // Lifecycle Status Action State
  const [statusActionBusy, setStatusActionBusy] = useState(false);

  // Report Verification State
  const [verifyingReportId, setVerifyingReportId] = useState<string | null>(null);

  // Member names cache
  const [membersMap, setMembersMap] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  // Fetch SPG & Reports
  const fetchSpgData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setLoadError("");
      const spgRes = await api.getSpg(token, spgId);
      setSpg(spgRes);

      // Populate edit form defaults
      setEditName(spgRes.name);
      setEditDescription(spgRes.description || "");
      setEditType(spgRes.type);
      setEditTrack(spgRes.track);
      setEditVisibility(spgRes.visibility);
      setEditRecruiting(Boolean(spgRes.is_recruiting));
      setEditRecruitingRoles((spgRes.recruiting_roles || []).join(", "));

      // Resolve member profiles
      if (spgRes?.member_ids?.length) {
        void Promise.all(
          spgRes.member_ids.map(async (uid) => {
            try {
              const res = await api.getUserProfile(token, uid);
              if (res) {
                setMembersMap((prev) => ({
                  ...prev,
                  [uid]: { full_name: res.full_name || uid, avatar_url: res.avatar_url || null },
                }));
              }
            } catch {
              setMembersMap((prev) => ({ ...prev, [uid]: { full_name: uid, avatar_url: null } }));
            }
          })
        );
      }

      // Fetch reports
      const reportsRes = await api.listSpgReports(token, spgId);
      setReports(reportsRes.items || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load SPG details.");
    } finally {
      setLoading(false);
    }
  }, [token, spgId]);

  // Fetch Milestones
  const fetchMilestones = useCallback(async () => {
    if (!token) return;
    try {
      setMilestonesLoading(true);
      const res = await api.listMilestones(token, spgId);
      setMilestonesList(Array.isArray(res) ? res : []);
    } catch {
      setMilestonesList([]);
    } finally {
      setMilestonesLoading(false);
    }
  }, [token, spgId]);

  useEffect(() => {
    void fetchSpgData();
    void fetchMilestones();
  }, [fetchSpgData, fetchMilestones]);

  // Notice timer helper
  const showNotice = (type: "success" | "error", text: string) => {
    setActionNotice({ type, text });
    setTimeout(() => setActionNotice(null), 5000);
  };

  // 1. Save SPG Metadata Updates
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !spg) return;
    setSavingMeta(true);
    try {
      const rolesArray = editRecruitingRoles
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      const updated = await api.updateSpg(token, spg.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        type: editType,
        track: editTrack,
        visibility: editVisibility,
        is_recruiting: editRecruiting,
        recruiting_roles: rolesArray,
      });

      setSpg(updated);
      setIsEditingMeta(false);
      showNotice("success", "SPG metadata updated successfully.");
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : "Failed to update SPG metadata.");
    } finally {
      setSavingMeta(false);
    }
  };

  // 2. Lifecycle Status Transitions (Pause, Resume, Disband)
  const handleStatusTransition = async (action: "pause" | "resume" | "disband") => {
    if (!token || !spg) return;
    if (action === "disband") {
      const confirmDisband = window.confirm(
        `Are you sure you want to disband "${spg.name}"? This action marks the team as permanently disbanded.`
      );
      if (!confirmDisband) return;
    }

    setStatusActionBusy(true);
    try {
      let updated: SPGRecord;
      if (action === "pause") {
        updated = await api.adminPauseSpg(token, spg.id);
      } else if (action === "resume") {
        updated = await api.adminResumeSpg(token, spg.id);
      } else {
        updated = await api.adminDisbandSpg(token, spg.id);
      }
      setSpg(updated);
      showNotice("success", `SPG status successfully transitioned to "${updated.status}".`);
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : `Failed to ${action} SPG.`);
    } finally {
      setStatusActionBusy(false);
    }
  };

  // 3. Verify / Approve a Progress Report
  const handleVerifyReport = async (reportId: string) => {
    if (!token) return;
    setVerifyingReportId(reportId);
    try {
      const verified = await api.verifySpgReport(token, reportId);
      setReports((prev) => prev.map((r) => (r.id === reportId ? verified : r)));
      showNotice("success", `Report #${verified.sequence_number} verified and approved.`);
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : "Failed to verify report.");
    } finally {
      setVerifyingReportId(null);
    }
  };

  // 4. Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !spg || !newMemberUid.trim()) return;
    setManagingTeam(true);
    try {
      const updated = await api.addSpgMember(token, spg.id, newMemberUid.trim());
      setSpg(updated);
      setNewMemberUid("");
      showNotice("success", `Member "${newMemberUid.trim()}" added to SPG.`);
      void fetchSpgData();
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setManagingTeam(false);
    }
  };

  // 5. Remove Member
  const handleRemoveMember = async (uid: string) => {
    if (!token || !spg) return;
    if (uid === spg.lead_id) {
      alert("Cannot remove the team lead. Designate a new lead before removing this member.");
      return;
    }
    const confirmRemove = window.confirm(`Remove member ${membersMap[uid]?.full_name || uid} from this SPG?`);
    if (!confirmRemove) return;

    setManagingTeam(true);
    try {
      const updated = await api.removeSpgMember(token, spg.id, uid);
      setSpg(updated);
      showNotice("success", `Member removed from SPG.`);
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setManagingTeam(false);
    }
  };

  // 6. Promote to Lead
  const handleChangeLead = async (uid: string) => {
    if (!token || !spg) return;
    const confirmLead = window.confirm(`Assign ${membersMap[uid]?.full_name || uid} as the project team lead?`);
    if (!confirmLead) return;

    setManagingTeam(true);
    try {
      const updated = await api.changeSpgLead(token, spg.id, uid);
      setSpg(updated);
      showNotice("success", `Designated new project team lead.`);
    } catch (err) {
      showNotice("error", err instanceof Error ? err.message : "Failed to reassign team lead.");
    } finally {
      setManagingTeam(false);
    }
  };

  // Helpers
  const getInitials = (name?: string) => {
    if (!name) return "MB";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getStatusClass = (status: SPGStatus) => {
    switch (status) {
      case "active":
        return styles.statusActive;
      case "paused":
        return styles.statusPaused;
      case "completed":
        return styles.statusCompleted;
      case "disbanded":
        return styles.statusDisbanded;
      default:
        return styles.statusActive;
    }
  };

  if (!profile.is_admin) {
    return (
      <div className={styles.restrictedContainer}>
        <MemberIcon name="alert-circle" size={32} />
        <h2>Administrator Access Required</h2>
        <p>This console is restricted to club administrators.</p>
        <Link href="/dashboard/spg" className={styles.returnBtn}>
          Return to Project Clusters
        </Link>
      </div>
    );
  }

  if (loading || !spg) {
    return (
      <div className={styles.pageContainer}>
        <Link href="/dashboard/admin/manage-spgs" className={styles.backBtn}>
          ← Back to SPG Management
        </Link>
        {loading ? (
          <p style={{ color: "#8c8c98" }}>Loading admin SPG inspection console…</p>
        ) : (
          <div role="alert" style={{ color: "#ef4444" }}>
            <p>{loadError || "SPG cluster not found."}</p>
            <button type="button" onClick={fetchSpgData} className={styles.saveBtn}>
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {actionNotice && (
        <div
          role="status"
          className={`${styles.toastNotice} ${
            actionNotice.type === "success" ? styles.toastSuccess : styles.toastError
          }`}
        >
          {actionNotice.type === "success" ? "✓" : "⚠️"} {actionNotice.text}
        </div>
      )}

      {/* Breadcrumb Navigation Header */}
      <div className={styles.topNavRow}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/dashboard/admin/manage-spgs" className={styles.backBtn}>
            ← Back to SPG Operations
          </Link>
          <span style={{ color: "#484856" }}>|</span>
          <Link href={`/dashboard/spg/${spg.id}`} target="_blank" className={styles.studentViewBtn}>
            <span>View Public / Student Hub ↗</span>
          </Link>
        </div>

        <div className={styles.statusChipsRow}>
          <span className={styles.adminBadge}>ADMIN MODE</span>
          <span className={styles.formatChip}>{spg.type.toUpperCase()}</span>
          <span className={styles.formatChip}>{spg.track.toUpperCase()} TRACK</span>
          <span className={getStatusClass(spg.status)}>{spg.status.toUpperCase()}</span>
          <span className={styles.formatChip}>{spg.visibility.toUpperCase()}</span>
        </div>
      </div>

      {/* Admin Hero Inspector Card */}
      <section className={styles.heroCard} aria-label="SPG Overview and Quick Actions">
        <div className={styles.heroGlow} />

        <div className={styles.heroHeaderRow}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className={styles.idChip}>ID: {spg.id}</span>
              {spg.source_ticket_id && (
                <span className={styles.ticketChip}>Ticket: {spg.source_ticket_id}</span>
              )}
            </div>
            <h1 className={styles.spgTitle}>{spg.name}</h1>
          </div>

          {/* Quick Lifecycle Controls */}
          <div className={styles.lifecycleButtonRow}>
            {spg.status === "active" && (
              <button
                type="button"
                className={styles.pauseBtn}
                disabled={statusActionBusy}
                onClick={() => void handleStatusTransition("pause")}
              >
                ⏸ Pause SPG
              </button>
            )}
            {spg.status === "paused" && (
              <button
                type="button"
                className={styles.resumeBtn}
                disabled={statusActionBusy}
                onClick={() => void handleStatusTransition("resume")}
              >
                ▶ Resume SPG
              </button>
            )}
            {spg.status !== "disbanded" && (
              <button
                type="button"
                className={styles.disbandBtn}
                disabled={statusActionBusy}
                onClick={() => void handleStatusTransition("disband")}
              >
                ✕ Disband SPG
              </button>
            )}
            <button
              type="button"
              className={styles.editMetaTriggerBtn}
              onClick={() => setIsEditingMeta(!isEditingMeta)}
            >
              {isEditingMeta ? "Cancel Edit" : "⚙ Edit Specs"}
            </button>
          </div>
        </div>

        <p className={styles.spgDescription}>
          {spg.description || "No project overview description published for this group."}
        </p>

        {/* Embedded Metadata Edit Form */}
        {isEditingMeta && (
          <form onSubmit={handleSaveMetadata} className={styles.editMetaForm}>
            <div className={styles.formRowTwoCol}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cluster Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>SPG Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as SPGType)}
                  className={styles.formSelect}
                >
                  <option value="learning">Learning Group</option>
                  <option value="project">Project / Product</option>
                  <option value="event">Club Event</option>
                  <option value="external_event">External Hackathon</option>
                  <option value="miscellaneous">Other</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Overview Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className={styles.formTextarea}
                rows={2}
              />
            </div>

            <div className={styles.formRowThreeCol}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Domain Track</label>
                <select
                  value={editTrack}
                  onChange={(e) => setEditTrack(e.target.value as SPGTrack)}
                  className={styles.formSelect}
                >
                  <option value="ai">AI / ML</option>
                  <option value="dev">Software Engineering</option>
                  <option value="systems">Systems / Cloud</option>
                  <option value="security">Cybersecurity</option>
                  <option value="kaggle">Kaggle</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Visibility</label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as SPGVisibility)}
                  className={styles.formSelect}
                >
                  <option value="public">Public (Visible to All Members)</option>
                  <option value="private">Private (Team Members Only)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recruiting Status</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    id="recruitingCheckbox"
                    checked={editRecruiting}
                    onChange={(e) => setEditRecruiting(e.target.checked)}
                    className={styles.formCheckbox}
                  />
                  <label htmlFor="recruitingCheckbox" style={{ fontSize: "0.82rem", color: "#e4e4e7" }}>
                    Actively Recruiting
                  </label>
                </div>
              </div>
            </div>

            {editRecruiting && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recruiting Roles (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="e.g. PyTorch Engineer, Frontend Dev, UI Designer"
                  value={editRecruitingRoles}
                  onChange={(e) => setEditRecruitingRoles(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setIsEditingMeta(false)}
              >
                Cancel
              </button>
              <button type="submit" disabled={savingMeta} className={styles.saveBtn}>
                {savingMeta ? "Saving Changes…" : "Save Metadata"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Main Layout Grid */}
      <div className={styles.contentGrid}>
        {/* Left / Center Column: Reports & Milestones */}
        <div className={styles.mainColumn}>
          {/* Progress Reports Verification Section */}
          <section className={styles.sectionCard} aria-label="Progress Reports Audit">
            <div className={styles.sectionHeaderRow}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <MemberIcon name="articles" size={18} />
                  Progress Reports Audit ({reports.length})
                </h2>
                <p className={styles.sectionSubtitle}>
                  Review filed milestone submissions and grant verified status.
                </p>
              </div>
            </div>

            {reports.length === 0 ? (
              <div className={styles.emptyBox}>
                <MemberIcon name="articles" size={32} />
                <p>No progress reports filed by this team yet.</p>
              </div>
            ) : (
              <div className={styles.reportsList}>
                {reports.map((report) => {
                  const dateFormatted = new Date(report.submitted_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const isVerified = report.status === "verified";
                  const submitterName =
                    membersMap[report.submitted_by]?.full_name || report.submitter_name || report.submitted_by;

                  return (
                    <article key={report.id} className={styles.reportCard}>
                      <div className={styles.reportHeaderRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <span className={styles.seqBadge}>#{report.sequence_number}</span>
                          <h3 className={styles.reportHeading}>{report.heading}</h3>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className={styles.formatChip}>
                            {report.report_format === "pdf" ? "📄 PDF" : "📝 FORM"}
                          </span>
                          <span className={isVerified ? styles.statusActive : styles.statusPaused}>
                            {isVerified ? "✓ VERIFIED" : "PENDING AUDIT"}
                          </span>

                          {!isVerified ? (
                            <button
                              type="button"
                              className={styles.verifyBtn}
                              disabled={verifyingReportId === report.id}
                              onClick={() => void handleVerifyReport(report.id)}
                            >
                              {verifyingReportId === report.id ? "Approving…" : "✓ Approve / Verify"}
                            </button>
                          ) : (
                            <span className={styles.verifiedByTag}>
                              Verified by {report.verified_by || "Admin"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.reportMetaText}>
                        <span>Filed by {submitterName}</span>
                        <span>•</span>
                        <span>{dateFormatted}</span>
                        <span>•</span>
                        <span style={{ textTransform: "uppercase" }}>{report.report_type} REPORT</span>
                      </div>

                      <p className={styles.reportShortDesc}>{report.short_description}</p>

                      {/* Detailed Summary if Structured Form */}
                      {report.report_format === "form" && (
                        <div className={styles.reportFormDetails}>
                          {report.summary && (
                            <div className={styles.summaryBlock}>
                              <span className={styles.blockTitle}>Executive Summary</span>
                              <p>{report.summary}</p>
                            </div>
                          )}

                          {report.milestones && report.milestones.length > 0 && (
                            <div className={styles.milestoneAchievedBlock}>
                              <span className={styles.blockTitle}>Milestones Achieved</span>
                              <ul className={styles.milestoneList}>
                                {report.milestones.map((m, idx) => (
                                  <li key={idx}>
                                    <span style={{ color: "#4ade80" }}>✓</span> {m}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {report.blockers && (
                            <div className={styles.blockerAlert}>
                              <strong>Blockers / Resource Requests:</strong> {report.blockers}
                            </div>
                          )}

                          {report.next_steps && (
                            <div className={styles.nextSprintAlert}>
                              <strong>Next Sprint Goals:</strong> {report.next_steps}
                            </div>
                          )}
                        </div>
                      )}

                      {/* PDF Report Direct Link */}
                      {report.report_format === "pdf" && report.pdf_url && (
                        <div style={{ marginTop: "10px" }}>
                          <a
                            href={report.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.pdfDownloadLink}
                          >
                            📥 Download Submitted Report PDF ↗
                          </a>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* SPG Milestones Inspection */}
          <section className={styles.sectionCard} aria-label="SPG Milestones Overview">
            <div className={styles.sectionHeaderRow}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <MemberIcon name="check-circle" size={18} />
                  Milestones Tracker ({milestonesList.length})
                </h2>
                <p className={styles.sectionSubtitle}>
                  Current progress checkpoints recorded by the student cluster.
                </p>
              </div>
            </div>

            {milestonesLoading ? (
              <p style={{ color: "#8c8c98", fontSize: "0.82rem" }}>Loading milestones…</p>
            ) : milestonesList.length === 0 ? (
              <div className={styles.emptyBox}>
                <MemberIcon name="sparkles" size={28} />
                <p>No milestones created for this project group yet.</p>
              </div>
            ) : (
              <div className={styles.milestonesList}>
                {milestonesList.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.milestoneCard} ${
                      m.is_completed ? styles.milestoneCompleted : ""
                    }`}
                  >
                    <div className={styles.milestoneTop}>
                      <span className={m.is_completed ? styles.checkDone : styles.checkPending}>
                        {m.is_completed ? "✓" : "○"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <h4 className={styles.milestoneTitle}>{m.title}</h4>
                          <span style={{ fontSize: "0.72rem", color: "#8c8c98" }}>
                            {m.submilestones.filter((s) => s.is_completed).length} / {m.submilestones.length} Done
                          </span>
                        </div>
                        {m.description && <p className={styles.milestoneDesc}>{m.description}</p>}

                        {/* Submilestones preview */}
                        {m.submilestones.length > 0 && (
                          <div className={styles.submilestonesWrapper}>
                            {m.submilestones.map((sub) => (
                              <div key={sub.id} className={styles.submilestoneItem}>
                                <span style={{ color: sub.is_completed ? "#4ade80" : "#71717a" }}>
                                  {sub.is_completed ? "✓" : "•"}
                                </span>
                                <span
                                  style={{
                                    textDecoration: sub.is_completed ? "line-through" : "none",
                                    color: sub.is_completed ? "#8c8c98" : "#d2d2dc",
                                  }}
                                >
                                  {sub.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Team Roster & Administrative Membership Controls */}
        <aside className={styles.sidebarColumn} aria-label="Team Membership Controls">
          {/* Team Roster & Admin Editor */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeaderRow}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <MemberIcon name="users" size={16} />
                  Team Roster ({spg.member_ids?.length || 1})
                </h2>
                <p className={styles.sectionSubtitle}>Manage members, roles, and leads.</p>
              </div>
            </div>

            {/* Add Member Form */}
            <form onSubmit={handleAddMember} className={styles.addMemberForm}>
              <input
                type="text"
                placeholder="User Firebase UID (e.g. usr_...)"
                value={newMemberUid}
                onChange={(e) => setNewMemberUid(e.target.value)}
                className={styles.addMemberInput}
                disabled={managingTeam}
              />
              <button
                type="submit"
                disabled={managingTeam || !newMemberUid.trim()}
                className={styles.addMemberBtn}
              >
                + Add
              </button>
            </form>

            <div className={styles.rosterList}>
              {/* Project Lead */}
              {(() => {
                const leadProfile = membersMap[spg.lead_id];
                const leadName = leadProfile?.full_name || spg.lead_name || spg.lead_id;
                const leadAvatar = leadProfile?.avatar_url;
                return (
                  <div className={styles.rosterItem}>
                    <div className={styles.rosterLeft}>
                      <div className={`${styles.memberAvatar} ${styles.leadAvatar}`}>
                        {leadAvatar && !failedAvatars.has(spg.lead_id) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={leadAvatar}
                            alt={leadName}
                            className={styles.avatarImg}
                            onError={() => setFailedAvatars((prev) => new Set(prev).add(spg.lead_id))}
                          />
                        ) : (
                          getInitials(leadName)
                        )}
                      </div>
                      <div className={styles.memberNameGroup}>
                        <span className={styles.memberName}>{leadName}</span>
                        <span className={styles.memberUidText}>UID: {spg.lead_id}</span>
                      </div>
                    </div>
                    <span className={styles.leadTag}>LEAD</span>
                  </div>
                );
              })()}

              {/* Other Members */}
              {spg.member_ids
                ?.filter((uid) => uid !== spg.lead_id)
                .map((uid) => {
                  const memProfile = membersMap[uid];
                  const name = memProfile?.full_name || spg.member_names?.[uid] || uid;
                  const avatar = memProfile?.avatar_url;
                  return (
                    <div key={uid} className={styles.rosterItem}>
                      <div className={styles.rosterLeft}>
                        <div className={styles.memberAvatar}>
                          {avatar && !failedAvatars.has(uid) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatar}
                              alt={name}
                              className={styles.avatarImg}
                              onError={() => setFailedAvatars((prev) => new Set(prev).add(uid))}
                            />
                          ) : (
                            getInitials(name)
                          )}
                        </div>
                        <div className={styles.memberNameGroup}>
                          <span className={styles.memberName}>{name}</span>
                          <span className={styles.memberUidText}>UID: {uid}</span>
                        </div>
                      </div>

                      {/* Admin Member Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          className={styles.makeLeadBtn}
                          disabled={managingTeam}
                          onClick={() => void handleChangeLead(uid)}
                          title="Assign this member as the new team lead"
                        >
                          Make Lead
                        </button>
                        <button
                          type="button"
                          className={styles.removeMemberBtn}
                          disabled={managingTeam}
                          onClick={() => void handleRemoveMember(uid)}
                          title="Remove member from SPG"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Proposal Document Link if Project SPG */}
          {spg.proposition_document_url && (
            <div className={styles.sectionCard}>
              <h2 className={styles.sectionTitle}>
                <MemberIcon name="articles" size={16} />
                Project Proposal
              </h2>
              <p style={{ fontSize: "0.8rem", color: "#8c8c98", margin: "6px 0 12px 0" }}>
                Original project proposal uploaded during SPG registration ticket.
              </p>
              <a
                href={spg.proposition_document_url}
                target="_blank"
                rel="noreferrer"
                className={styles.pdfDownloadLink}
              >
                📄 View Project Proposal PDF ↗
              </a>
            </div>
          )}

          {/* System Audit Ledger */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={16} />
              System Audit Ledger
            </h2>

            <div className={styles.ledgerList}>
              <div className={styles.ledgerRow}>
                <span>Cluster ID:</span>
                <code>{spg.id}</code>
              </div>
              <div className={styles.ledgerRow}>
                <span>Created At:</span>
                <span>
                  {spg.created_at ? new Date(spg.created_at).toLocaleString() : "Unknown"}
                </span>
              </div>
              <div className={styles.ledgerRow}>
                <span>Updated At:</span>
                <span>
                  {spg.updated_at ? new Date(spg.updated_at).toLocaleString() : "Unknown"}
                </span>
              </div>
              <div className={styles.ledgerRow}>
                <span>Source Ticket:</span>
                <span>{spg.source_ticket_id || "None (Legacy Direct)"}</span>
              </div>
              <div className={styles.ledgerRow}>
                <span>Total Reports:</span>
                <span>{reports.length}</span>
              </div>
              <div className={styles.ledgerRow}>
                <span>Total Milestones:</span>
                <span>{milestonesList.length}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
