"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import {
  type SPGRecord,
  type SPGReportRecord,
  type SPGFormReportSubmission,
  type SPGMilestone,
  type SPGType,
} from "@/lib/spgData";
import styles from "./SpgDetail.module.css";

export default function SpgDetailClient({ spgId }: { spgId: string }) {
  const { token, profile } = useMember();
  const [spg, setSpg] = useState<SPGRecord | null>(null);
  const [reports, setReports] = useState<SPGReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Persistent Milestones State
  const [milestonesList, setMilestonesList] = useState<SPGMilestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDescription, setNewMilestoneDescription] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [addingSubmilestoneFor, setAddingSubmilestoneFor] = useState<string | null>(null);
  const [newSubmilestoneTitle, setNewSubmilestoneTitle] = useState("");
  const [submittingSubmilestone, setSubmittingSubmilestone] = useState(false);
  const [updatingMilestoneId, setUpdatingMilestoneId] = useState<string | null>(null);

  // Admin Type Promotion State
  const [isEditingType, setIsEditingType] = useState(false);
  const [selectedNewType, setSelectedNewType] = useState<SPGType>("learning");
  const [updatingType, setUpdatingType] = useState(false);
  const [typeUpdateError, setTypeUpdateError] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState<"form" | "pdf">("form");
  const [heading, setHeading] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [reportType, setReportType] = useState<"progress" | "final">("progress");
  const [summary, setSummary] = useState("");
  const [milestones, setMilestones] = useState<string[]>([""]);
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [membersMap, setMembersMap] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  // Fetch SPG & Reports from Backend API
  const fetchSpgData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setLoadError("");
      const spgRes = await api.getSpg(token, spgId);
      setSpg(spgRes);

      if (spgRes?.member_ids?.length) {
        void Promise.all(
          spgRes.member_ids.map(async (uid) => {
            try {
              const u = await api.getUserProfile(token, uid);
              return [uid, { full_name: u.full_name || uid, avatar_url: u.avatar_url || null }] as const;
            } catch {
              const fallbackName = spgRes.member_names?.[uid] || (uid === spgRes.lead_id ? spgRes.lead_name : uid) || uid;
              return [uid, { full_name: fallbackName, avatar_url: null }] as const;
            }
          })
        ).then((entries) => {
          setMembersMap(Object.fromEntries(entries));
        }).catch(() => {});
      }
      try {
        const repRes = await api.listSpgReports(token, spgId);
        setReports([...repRes.items].sort((a, b) => b.sequence_number - a.sequence_number));
      } catch {
        setReports([]);
        setLoadError("Project group reports could not be loaded. Try again.");
      }

      try {
        setMilestonesLoading(true);
        const msRes = await api.listMilestones(token, spgId);
        setMilestonesList(msRes);
      } catch {
        setMilestonesList([]);
      } finally {
        setMilestonesLoading(false);
      }
    } catch {
      setSpg(null);
      setReports([]);
      setMilestonesList([]);
      setLoadError("Project group could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token, spgId]);

  useEffect(() => {
    void Promise.resolve().then(fetchSpgData);
  }, [fetchSpgData]);

  // Team Membership & Submission Permissions (Admins cannot submit if not in team)
  const isTeamMember = Boolean(
    spg && profile?.id && (spg.lead_id === profile.id || spg.member_ids?.includes(profile.id))
  );
  const canSubmitReports = Boolean(
    isTeamMember && spg && (spg.status === "active" || spg.status === "paused")
  );
  const canEditMilestones = Boolean(
    isTeamMember && spg && (spg.status === "active" || spg.status === "paused")
  );

  const handleToggleMilestone = async (milestoneId: string, currentCompleted: boolean) => {
    if (!token || !canEditMilestones) return;
    const nextCompleted = !currentCompleted;
    setMilestonesList((prev) =>
      prev.map((m) => (m.id === milestoneId ? { ...m, is_completed: nextCompleted } : m))
    );
    try {
      const updated = await api.updateMilestone(token, spgId, milestoneId, { is_completed: nextCompleted });
      setMilestonesList((prev) => prev.map((m) => (m.id === milestoneId ? updated : m)));
    } catch {
      setMilestonesList((prev) =>
        prev.map((m) => (m.id === milestoneId ? { ...m, is_completed: currentCompleted } : m))
      );
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!token || !canEditMilestones) return;
    if (!window.confirm("Are you sure you want to delete this milestone?")) return;
    setUpdatingMilestoneId(milestoneId);
    try {
      await api.deleteMilestone(token, spgId, milestoneId);
      setMilestonesList((prev) => prev.filter((m) => m.id !== milestoneId));
      if (spg) {
        setSpg({
          ...spg,
          milestone_count: Math.max(0, (spg.milestone_count ?? 1) - 1),
          milestone_ids: (spg.milestone_ids ?? []).filter((id) => id !== milestoneId),
        });
      }
    } catch {
      alert("Failed to delete milestone. Please try again.");
    } finally {
      setUpdatingMilestoneId(null);
    }
  };

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canEditMilestones || !newMilestoneTitle.trim()) return;
    setAddingMilestone(true);
    try {
      const created = await api.createMilestone(token, spgId, {
        title: newMilestoneTitle.trim(),
        description: newMilestoneDescription.trim() || undefined,
      });
      setMilestonesList((prev) => [...prev, created]);
      if (spg) {
        setSpg({
          ...spg,
          milestone_count: (spg.milestone_count ?? 0) + 1,
          milestone_ids: [...(spg.milestone_ids ?? []), created.id],
        });
      }
      setNewMilestoneTitle("");
      setNewMilestoneDescription("");
      setIsAddMilestoneOpen(false);
    } catch {
      alert("Failed to create milestone. Please try again.");
    } finally {
      setAddingMilestone(false);
    }
  };

  const handleAddSubmilestone = async (milestoneId: string) => {
    if (!token || !canEditMilestones || !newSubmilestoneTitle.trim()) return;
    setSubmittingSubmilestone(true);
    try {
      const updated = await api.addSubmilestone(token, spgId, milestoneId, {
        title: newSubmilestoneTitle.trim(),
      });
      setMilestonesList((prev) => prev.map((m) => (m.id === milestoneId ? updated : m)));
      setNewSubmilestoneTitle("");
      setAddingSubmilestoneFor(null);
    } catch {
      alert("Failed to add submilestone. Please try again.");
    } finally {
      setSubmittingSubmilestone(false);
    }
  };

  const handleToggleSubmilestone = async (milestoneId: string, subId: string, currentCompleted: boolean) => {
    if (!token || !canEditMilestones) return;
    const nextCompleted = !currentCompleted;
    setMilestonesList((prev) =>
      prev.map((m) => {
        if (m.id !== milestoneId) return m;
        return {
          ...m,
          submilestones: m.submilestones.map((s) =>
            s.id === subId ? { ...s, is_completed: nextCompleted } : s
          ),
        };
      })
    );
    try {
      const updated = await api.toggleSubmilestone(token, spgId, milestoneId, subId, nextCompleted);
      setMilestonesList((prev) => prev.map((m) => (m.id === milestoneId ? updated : m)));
    } catch {
      setMilestonesList((prev) =>
        prev.map((m) => {
          if (m.id !== milestoneId) return m;
          return {
            ...m,
            submilestones: m.submilestones.map((s) =>
              s.id === subId ? { ...s, is_completed: currentCompleted } : s
            ),
          };
        })
      );
    }
  };

  const handleDeleteSubmilestone = async (milestoneId: string, subId: string) => {
    if (!token || !canEditMilestones) return;
    try {
      const updated = await api.deleteSubmilestone(token, spgId, milestoneId, subId);
      setMilestonesList((prev) => prev.map((m) => (m.id === milestoneId ? updated : m)));
    } catch {
      alert("Failed to delete submilestone. Please try again.");
    }
  };

  const handleUpdateType = async () => {
    if (!token || !spg || !selectedNewType || selectedNewType === spg.type) {
      setIsEditingType(false);
      return;
    }
    setUpdatingType(true);
    setTypeUpdateError("");
    try {
      const updated = await api.updateSpg(token, spgId, { type: selectedNewType });
      setSpg((prev) => (prev ? { ...prev, type: (updated.type as SPGType) || selectedNewType } : null));
      setIsEditingType(false);
    } catch (err) {
      setTypeUpdateError(err instanceof Error ? err.message : "Failed to update SPG type.");
    } finally {
      setUpdatingType(false);
    }
  };

  // Milestone input helpers
  const handleMilestoneChange = (index: number, val: string) => {
    setMilestones((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleAddMilestone = () => {
    setMilestones((prev) => [...prev, ""]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle report submission
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spg || !token) {
      setStatusMessage({ type: "error", text: "Project group is unavailable. Please retry loading it." });
      return;
    }
    if (!canSubmitReports) {
      setStatusMessage({ type: "error", text: "Only members of this project group can submit progress reports." });
      return;
    }
    if (!heading.trim() || !shortDescription.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a heading and short description." });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      let newRecord: SPGReportRecord;

      if (reportFormat === "form") {
        if (!summary.trim()) {
          setStatusMessage({ type: "error", text: "Please provide a detailed summary for the form report." });
          setSubmitting(false);
          return;
        }

        const filteredMilestones = milestones.map((m) => m.trim()).filter(Boolean);
        const payload: SPGFormReportSubmission = {
          heading: heading.trim(),
          short_description: shortDescription.trim(),
          report_type: reportType,
          summary: summary.trim(),
          milestones: filteredMilestones,
          blockers: blockers.trim() || undefined,
          next_steps: nextSteps.trim() || undefined,
        };

        newRecord = await api.submitFormReport(token, spg.id, payload);
      } else {
        // PDF Report
        if (!pdfFile) {
          setStatusMessage({ type: "error", text: "Please select a PDF file to upload." });
          setSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", pdfFile);
        formData.append("heading", heading.trim());
        formData.append("short_description", shortDescription.trim());
        formData.append("report_type", reportType);

        newRecord = await api.submitPdfReport(token, spg.id, formData);
      }

      setReports((prev) => [newRecord, ...prev]);
      setSpg((prev) => prev ? { ...prev, report_count: prev.report_count + 1 } : prev);
      setIsModalOpen(false);
      
      // Reset form fields
      setHeading("");
      setShortDescription("");
      setSummary("");
      setMilestones([""]);
      setBlockers("");
      setNextSteps("");
      setPdfFile(null);
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to submit report" });
    } finally {
      setSubmitting(false);
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
        return styles.trackChipGeneral;
    }
  };

  const getStatusChipClass = (status: string) => {
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

  const getInitials = (name?: string) => {
    if (!name) return "MB";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (loading) {
    return (
      <div className={styles.pageContainer} aria-label="Loading project group skeleton" aria-busy="true">
        {/* Top Bar Skeleton */}
        <div className={styles.backRow}>
          <div className={`${styles.skeletonBackBtn} ${styles.shimmer}`} />
          <div className={styles.statusChipsRow}>
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
          </div>
        </div>

        {/* Hero Banner Skeleton */}
        <div className={styles.skeletonHero}>
          <div className={`${styles.skeletonHeroTitle} ${styles.shimmer}`} />
          <div className={`${styles.skeletonHeroLine1} ${styles.shimmer}`} />
          <div className={`${styles.skeletonHeroLine2} ${styles.shimmer}`} />
          <div className={`${styles.skeletonHeroBtn} ${styles.shimmer}`} />
        </div>

        {/* Main Grid Skeleton */}
        <div className={styles.mainGrid}>
          <div className={styles.mainContentColumn}>
            {/* Milestones Card Skeleton */}
            <div className={styles.skeletonCardBox}>
              <div className={`${styles.skeletonCardTitle} ${styles.shimmer}`} />
              {[1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonMilestoneRow}>
                  <div className={`${styles.skeletonCheckbox} ${styles.shimmer}`} />
                  <div className={`${styles.skeletonMilestoneText} ${styles.shimmer}`} />
                </div>
              ))}
            </div>

            {/* Reports Card Skeleton */}
            <div className={styles.skeletonCardBox}>
              <div className={`${styles.skeletonCardTitle} ${styles.shimmer}`} />
              {[1, 2].map((i) => (
                <div key={i} className={styles.skeletonReportItem}>
                  <div className={styles.skeletonReportHeader}>
                    <div className={`${styles.skeletonReportHeading} ${styles.shimmer}`} />
                    <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
                  </div>
                  <div className={`${styles.skeletonReportDesc} ${styles.shimmer}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Roster Skeleton */}
          <aside className={styles.sidebarColumn}>
            <div className={styles.skeletonCardBox}>
              <div className={`${styles.skeletonCardTitle} ${styles.shimmer}`} />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.skeletonRosterRow}>
                  <div className={`${styles.skeletonRosterAvatar} ${styles.shimmer}`} />
                  <div className={styles.skeletonRosterNameGroup}>
                    <div className={`${styles.skeletonRosterName} ${styles.shimmer}`} />
                    <div className={`${styles.skeletonRosterRole} ${styles.shimmer}`} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (!spg) {
    return (
      <div className={styles.pageContainer}>
        <Link href="/dashboard/spg" className={styles.backBtn}>
          ← Back to Project Clusters (SPG)
        </Link>
        <div role="alert" style={{ marginTop: "20px" }}>
          <p>{loadError || "Project group not found."}</p>
          <button type="button" onClick={fetchSpgData} className={styles.reportCtaBtn} style={{ marginTop: "10px" }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {loadError && <p role="alert">{loadError} <button type="button" onClick={fetchSpgData}>Retry</button></p>}
      {/* Back Link & Breadcrumb Header */}
      <div className={styles.backRow}>
        <Link href="/dashboard/spg" className={styles.backBtn}>
          ← Back to Project Clusters (SPG)
        </Link>

        <div className={styles.statusChipsRow}>
          {profile?.is_admin && (
            <Link
              href={`/dashboard/admin/spgs/${encodeURIComponent(spg.id)}`}
              className={styles.formatChip}
              style={{
                background: "rgba(229, 183, 49, 0.15)",
                color: "#E5B731",
                border: "1px solid rgba(229, 183, 49, 0.35)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>⚙ Admin Inspector</span>
            </Link>
          )}
          <span className={styles.formatChip}>{spg.type.toUpperCase()}</span>
          <span className={getTrackChipClass(spg.track)}>{spg.track.toUpperCase()} TRACK</span>
          <span className={getStatusChipClass(spg.status)}>{spg.status.toUpperCase()}</span>
          <span className={styles.formatChip}>{spg.visibility.toUpperCase()}</span>
          {spg.is_recruiting && (
            <span className={styles.recruitingPill}>
              <MemberIcon name="plus" size={12} />
              RECRUITING
            </span>
          )}
        </div>
      </div>

      {/* Hero Banner Card */}
      <section className={styles.heroBanner} aria-label="SPG Overview Banner">
        <div className={styles.heroGlow} />

        <div>
          <h1 className={styles.spgTitle}>{spg.name}</h1>
        </div>

        <p className={styles.spgDescription}>
          {spg.description || "No project overview description published for this group."}
        </p>

        <div className={styles.heroActionRow}>
          {canSubmitReports && (
            <button
              type="button"
              className={styles.reportCtaBtn}
              onClick={() => setIsModalOpen(true)}
            >
              <MemberIcon name="plus" size={16} />
              Submit Progress Report
            </button>
          )}

          {spg.proposition_document_url && (
            <a
              href={spg.proposition_document_url}
              target="_blank"
              rel="noreferrer"
              className={styles.propositionLink}
            >
              <MemberIcon name="articles" size={16} />
              View Proposition Document →
            </a>
          )}

          {spg.idea_id && (
            <Link href={`/dashboard/ideas/${encodeURIComponent(spg.idea_id)}`} className={styles.propositionLink}>
              <MemberIcon name="ideas" size={16} />
              Started from an Idea Jar idea →
            </Link>
          )}
        </div>
      </section>

      {/* 2-Column Main Layout Grid */}
      <div className={styles.mainGrid}>
        {/* Left Main Column: Proposition, Milestones & Reports History */}
        <div className={styles.contentColumn}>
          {/* Milestones & Roadmap Section */}
          <section id="milestones" className={`${styles.sectionCard} ${styles.milestonesSection}`} aria-label="Project Milestones">
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <MemberIcon name="check-circle" size={18} />
                Project Milestones & Roadmap
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.78rem", color: "#8c8c98", fontWeight: "750" }}>
                  {milestonesList.length} {milestonesList.length === 1 ? "Milestone" : "Milestones"}
                </span>
                {canEditMilestones && !isAddMilestoneOpen && (
                  <button
                    type="button"
                    className={styles.addMilestoneBtn}
                    onClick={() => setIsAddMilestoneOpen(true)}
                  >
                    <MemberIcon name="plus" size={14} /> Add Milestone
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {milestonesList.length > 0 && (() => {
              const completedCount = milestonesList.filter((m) => m.is_completed).length;
              const pct = Math.round((completedCount / milestonesList.length) * 100);
              return (
                <div className={styles.milestonesProgressBarWrap}>
                  <div className={styles.milestonesProgressMeta}>
                    <span>Progress: {completedCount} of {milestonesList.length} completed</span>
                    <span className={styles.milestonesProgressPercent}>{pct}%</span>
                  </div>
                  <div className={styles.milestonesProgressBar}>
                    <div
                      className={styles.milestonesProgressBarFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Add Milestone Inline Form */}
            {isAddMilestoneOpen && (
              <form onSubmit={handleCreateMilestone} className={styles.milestoneCard} style={{ borderColor: "var(--brand, #E5B731)" }}>
                <h3 style={{ fontSize: "0.85rem", fontWeight: "800", color: "#ffffff", margin: 0 }}>New Milestone</h3>
                <input
                  type="text"
                  placeholder="Milestone title (e.g. Complete Baseline Model Training)"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  className={styles.inlineSubInput}
                  style={{ padding: "8px 10px", fontSize: "0.82rem" }}
                  required
                  autoFocus
                />
                <textarea
                  placeholder="Optional description / details..."
                  value={newMilestoneDescription}
                  onChange={(e) => setNewMilestoneDescription(e.target.value)}
                  className={styles.inlineSubInput}
                  rows={2}
                  style={{ padding: "8px 10px", fontSize: "0.8rem", resize: "vertical" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    className={styles.inlineSubCancelBtn}
                    onClick={() => {
                      setIsAddMilestoneOpen(false);
                      setNewMilestoneTitle("");
                      setNewMilestoneDescription("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.inlineSubSaveBtn}
                    disabled={addingMilestone || !newMilestoneTitle.trim()}
                  >
                    {addingMilestone ? "Saving..." : "Create Milestone"}
                  </button>
                </div>
              </form>
            )}

            {/* Milestones List */}
            {milestonesLoading ? (
              <p style={{ color: "#71717a", fontSize: "0.8rem" }}>Loading milestones…</p>
            ) : milestonesList.length === 0 ? (
              <div className={styles.emptyMilestonesBox}>
                <MemberIcon name="sparkles" size={28} />
                <p className={styles.emptyMilestonesText}>No milestones defined for this project group yet.</p>
                {canEditMilestones && !isAddMilestoneOpen && (
                  <button
                    type="button"
                    className={styles.reportCtaBtn}
                    onClick={() => setIsAddMilestoneOpen(true)}
                    style={{ marginTop: "6px" }}
                  >
                    <MemberIcon name="plus" size={14} /> Add First Milestone
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.milestonesList}>
                {milestonesList.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.milestoneCard} ${m.is_completed ? styles.milestoneCardCompleted : ""}`}
                  >
                    <div className={styles.milestoneTop}>
                      <div className={styles.milestoneLeft}>
                        <input
                          type="checkbox"
                          checked={m.is_completed}
                          onChange={() => handleToggleMilestone(m.id, m.is_completed)}
                          disabled={!canEditMilestones}
                          className={styles.milestoneCheckbox}
                          aria-label={`Toggle completion for ${m.title}`}
                        />
                        <div className={styles.milestoneInfo}>
                          <h3
                            className={`${styles.milestoneTitle} ${
                              m.is_completed ? styles.milestoneTitleCompleted : ""
                            }`}
                          >
                            {m.title}
                          </h3>
                          {m.description && (
                            <p className={styles.milestoneDesc}>{m.description}</p>
                          )}
                        </div>
                      </div>

                      {canEditMilestones && (
                        <div className={styles.milestoneActions}>
                          <button
                            type="button"
                            onClick={() => handleDeleteMilestone(m.id)}
                            disabled={updatingMilestoneId === m.id}
                            className={styles.milestoneIconBtn}
                            title="Delete Milestone"
                            aria-label={`Delete milestone ${m.title}`}
                          >
                            <MemberIcon name="trash" size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Submilestones Sub-list */}
                    <div className={styles.submilestonesContainer}>
                      {m.submilestones && m.submilestones.length > 0 && (
                        <div className={styles.submilestonesList}>
                          {m.submilestones.map((sub) => (
                            <div key={sub.id} className={styles.submilestoneItem}>
                              <div className={styles.submilestoneLeft}>
                                <input
                                  type="checkbox"
                                  checked={sub.is_completed}
                                  onChange={() => handleToggleSubmilestone(m.id, sub.id, sub.is_completed)}
                                  disabled={!canEditMilestones}
                                  className={styles.submilestoneCheckbox}
                                  aria-label={`Toggle submilestone ${sub.title}`}
                                />
                                <span
                                  className={`${styles.submilestoneTitle} ${
                                    sub.is_completed ? styles.submilestoneTitleCompleted : ""
                                  }`}
                                >
                                  {sub.title}
                                </span>
                              </div>
                              {canEditMilestones && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubmilestone(m.id, sub.id)}
                                  className={styles.submilestoneDeleteBtn}
                                  title="Delete submilestone"
                                  aria-label={`Delete submilestone ${sub.title}`}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Submilestone inline row */}
                      {canEditMilestones && (
                        addingSubmilestoneFor === m.id ? (
                          <div className={styles.inlineSubInputRow}>
                            <input
                              type="text"
                              placeholder="Submilestone title..."
                              value={newSubmilestoneTitle}
                              onChange={(e) => setNewSubmilestoneTitle(e.target.value)}
                              className={styles.inlineSubInput}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleAddSubmilestone(m.id);
                                } else if (e.key === "Escape") {
                                  setAddingSubmilestoneFor(null);
                                  setNewSubmilestoneTitle("");
                                }
                              }}
                            />
                            <button
                              type="button"
                              className={styles.inlineSubSaveBtn}
                              disabled={submittingSubmilestone || !newSubmilestoneTitle.trim()}
                              onClick={() => void handleAddSubmilestone(m.id)}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              className={styles.inlineSubCancelBtn}
                              onClick={() => {
                                setAddingSubmilestoneFor(null);
                                setNewSubmilestoneTitle("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={styles.addSubmilestoneTriggerBtn}
                            onClick={() => {
                              setAddingSubmilestoneFor(m.id);
                              setNewSubmilestoneTitle("");
                            }}
                          >
                            <MemberIcon name="plus" size={12} /> Add sub-item
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Progress Reports Feed */}
          <section id="reports" className={`${styles.sectionCard} ${styles.reportsSection}`} aria-label="Progress Reports History">
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <MemberIcon name="articles" size={18} />
                Progress Reports Feed
              </h2>
              <span style={{ fontSize: "0.78rem", color: "#8c8c98", fontWeight: "750" }}>
                {reports.length} {reports.length === 1 ? "Report" : "Reports"} Published
              </span>
            </div>

            {reports.length === 0 ? (
              <div className={styles.emptyReportsBox}>
                <MemberIcon name="articles" size={32} />
                <p className={styles.emptyReportsText}>
                  No progress reports have been filed for this SPG yet.
                </p>
                {canSubmitReports && (
                  <button
                    type="button"
                    className={styles.reportCtaBtn}
                    onClick={() => setIsModalOpen(true)}
                    style={{ marginTop: "8px" }}
                  >
                    File First Progress Report
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.reportsList}>
                {reports.map((report) => {
                  const isExpanded = true;
                  const dateFormatted = new Date(report.submitted_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <article key={report.id} className={styles.reportItemCard}>
                      <div className={styles.reportTopRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <span className={styles.reportSeqBadge}>#{report.sequence_number}</span>
                          <h3 className={styles.reportHeading}>{report.heading}</h3>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className={styles.formatChip}>
                            {report.report_format === "pdf" ? "📄 PDF" : "📝 FORM"}
                          </span>
                          <span className={report.status === "verified" ? styles.statusActive : styles.statusPaused}>
                            {report.status === "verified" ? "✓ VERIFIED" : "PENDING REVIEW"}
                          </span>
                        </div>
                      </div>

                      <div className={styles.reportMetaText}>
                        <span>Submitted by {report.submitter_name || report.submitted_by}</span>
                        <span>•</span>
                        <span>{dateFormatted}</span>
                        <span>•</span>
                        <span style={{ textTransform: "uppercase" }}>{report.report_type} REPORT</span>
                      </div>

                      <p className={styles.reportSummaryText}>{report.short_description}</p>

                      {/* Detailed Content if Structured Form */}
                      {report.report_format === "form" && isExpanded && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
                          {report.summary && (
                            <div style={{ background: "#16161a", padding: "12px 14px", borderRadius: "8px", border: "1px solid #23232a" }}>
                              <span style={{ fontSize: "0.7rem", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                                Detailed Summary
                              </span>
                              <p style={{ fontSize: "0.8rem", color: "#d2d2dc", margin: 0, lineHeight: 1.6 }}>
                                {report.summary}
                              </p>
                            </div>
                          )}

                          {report.milestones && report.milestones.length > 0 && (
                            <div className={styles.milestoneBox}>
                              <span className={styles.milestoneBoxTitle}>Milestones Achieved</span>
                              <ul className={styles.milestoneList}>
                                {report.milestones.map((m, idx) => (
                                  <li key={idx} className={styles.milestoneItem}>
                                    <span className={styles.milestoneCheck}>✓</span>
                                    <span>{m}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {report.blockers && (
                            <div className={styles.blockerCallout}>
                              <strong>Blockers / Resource Needs:</strong> {report.blockers}
                            </div>
                          )}

                          {report.next_steps && (
                            <div className={styles.nextStepsCallout}>
                              <strong>Next Sprint Focus:</strong> {report.next_steps}
                            </div>
                          )}
                        </div>
                      )}

                      {/* PDF Direct Link if PDF Report */}
                      {report.report_format === "pdf" && report.pdf_url && (
                        <div style={{ marginTop: "4px" }}>
                          <a
                            href={report.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.propositionLink}
                            style={{ display: "inline-flex", width: "fit-content" }}
                          >
                            <span>📥 Open Attached Report PDF</span>
                          </a>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Sidebar Column */}
        <aside className={styles.sidebarColumn} aria-label="SPG Leadership and Lifecycle">
          {/* Leadership & Collaborators Roster */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="users" size={16} />
              Team Roster ({spg.member_ids?.length || 1})
            </h2>

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
                        <span className={styles.memberName}>
                          {leadName}
                        </span>
                        <span className={styles.memberRole}>Project Lead</span>
                      </div>
                    </div>
                    <span className={styles.leadBadge}>LEAD</span>
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
                          <span className={styles.memberRole}>Collaborator</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Recruitment Card if Recruiting */}
          {spg.is_recruiting && (
            <div className={styles.recruitingCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MemberIcon name="plus" size={16} />
                <h2 style={{ fontSize: "0.98rem", fontWeight: "850", color: "#ffffff", margin: 0 }}>
                  Open Positions
                </h2>
              </div>

              <p style={{ fontSize: "0.78rem", color: "#d2d2dc", margin: 0, lineHeight: 1.5 }}>
                This SPG is actively recruiting new collaborators with the following skills:
              </p>

              <div className={styles.recruitingRolesList}>
                {spg.recruiting_roles?.map((role, idx) => (
                  <span key={idx} className={styles.roleTag}>
                    {role}
                  </span>
                ))}
              </div>

              <Link
                href={`/dashboard/tickets?type=support&spg_apply=${encodeURIComponent(spg.name)}`}
                className={styles.applyBtn}
              >
                Apply to Collaborate →
              </Link>
            </div>
          )}

          {/* SPG System Ledger Metadata */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={16} />
              Cluster Specs & Ledger
            </h2>

            <div className={styles.specList}>
              <div className={styles.specRow}>
                <span className={styles.specLabel}>SPG Domain</span>
                <span className={styles.specVal}>{spg.track.toUpperCase()}</span>
              </div>

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Category Type</span>
                {isEditingType ? (
                  <div className={styles.adminTypeEditForm}>
                    <select
                      className={styles.adminTypeSelect}
                      value={selectedNewType}
                      onChange={(e) => setSelectedNewType(e.target.value as SPGType)}
                      disabled={updatingType}
                    >
                      <option value="learning">Learning</option>
                      <option value="project">Project</option>
                      <option value="event">Club Event</option>
                      <option value="external_event">External Event</option>
                      <option value="miscellaneous">Other</option>
                    </select>
                    <button
                      type="button"
                      className={styles.adminTypeSaveBtn}
                      disabled={updatingType}
                      onClick={() => void handleUpdateType()}
                    >
                      {updatingType ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className={styles.adminTypeCancelBtn}
                      disabled={updatingType}
                      onClick={() => {
                        setIsEditingType(false);
                        setTypeUpdateError("");
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className={styles.adminTypeWrap}>
                    <span className={styles.specVal}>{spg.type.toUpperCase()}</span>
                    {profile?.is_admin && (
                      <button
                        type="button"
                        className={styles.adminTypeEditTrigger}
                        onClick={() => {
                          setSelectedNewType(spg.type);
                          setIsEditingType(true);
                        }}
                        title="Promote or change SPG type (Admin)"
                      >
                        Change Type
                      </button>
                    )}
                  </div>
                )}
              </div>
              {typeUpdateError && (
                <div style={{ color: "#ef4444", fontSize: "0.72rem", textAlign: "right" }}>
                  {typeUpdateError}
                </div>
              )}

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Visibility</span>
                <span className={styles.specVal}>{spg.visibility.toUpperCase()}</span>
              </div>

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Total Reports</span>
                <span className={styles.specVal}>{spg.report_count} Filed</span>
              </div>

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Milestones</span>
                <span className={styles.specVal}>
                  {milestonesList.length} ({milestonesList.filter((m) => m.is_completed).length} Done)
                </span>
              </div>

              {spg.created_at && (
                <div className={styles.specRow}>
                  <span className={styles.specLabel}>Created Date</span>
                  <span className={styles.specVal}>
                    {new Date(spg.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Progress Report Modal */}
      {isModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="modal-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="modal-title" className={styles.modalTitle}>
                Submit Progress Report
              </h2>
              <button
                type="button"
                className={styles.closeModalBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close report modal"
              >
                ✕
              </button>
            </div>

            {/* Format Switcher */}
            <div className={styles.formatToggle}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${reportFormat === "form" ? styles.toggleBtnActive : ""}`}
                onClick={() => setReportFormat("form")}
              >
                📝 Structured Form Update
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${reportFormat === "pdf" ? styles.toggleBtnActive : ""}`}
                onClick={() => setReportFormat("pdf")}
              >
                📄 Upload PDF Document
              </button>
            </div>

            {statusMessage && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  background: statusMessage.type === "error" ? "rgba(248, 113, 113, 0.15)" : "rgba(74, 222, 128, 0.15)",
                  color: statusMessage.type === "error" ? "#f87171" : "#4ade80",
                  border: `1px solid ${statusMessage.type === "error" ? "rgba(248, 113, 113, 0.3)" : "rgba(74, 222, 128, 0.3)"}`,
                }}
              >
                {statusMessage.text}
              </div>
            )}

            <form onSubmit={handleSubmitReport} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Report Heading / Title *</label>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="e.g. Phase 2: Distributed Model Architecture Benchmarks"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Short Summary (1-2 lines) *</label>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="Brief synopsis displayed on the cluster overview card"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Report Type</label>
                <select
                  className={styles.inputField}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as "progress" | "final")}
                >
                  <option value="progress">Sprint Progress Report</option>
                  <option value="final">Final Project Milestone Report</option>
                </select>
              </div>

              {/* Form Format Fields */}
              {reportFormat === "form" ? (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Detailed Technical Summary *</label>
                    <textarea
                      className={styles.textareaField}
                      placeholder="Comprehensive breakdown of technical achievements, experiments run, and benchmark results..."
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Milestones Achieved</label>
                    <div className={styles.milestonesInputList}>
                      {milestones.map((m, idx) => (
                        <div key={idx} className={styles.milestoneInputRow}>
                          <input
                            type="text"
                            className={styles.inputField}
                            placeholder={`Milestone #${idx + 1}`}
                            value={m}
                            onChange={(e) => handleMilestoneChange(idx, e.target.value)}
                            style={{ flex: 1 }}
                          />
                          {milestones.length > 1 && (
                            <button
                              type="button"
                              className={styles.removeMilestoneBtn}
                              onClick={() => handleRemoveMilestone(idx)}
                              aria-label="Remove milestone"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.addMilestoneBtn}
                        onClick={handleAddMilestone}
                      >
                        + Add Another Milestone
                      </button>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Blockers / Compute Needs (Optional)</label>
                    <textarea
                      className={styles.textareaField}
                      placeholder="GPU memory bottlenecks, cluster access needs, library conflicts..."
                      value={blockers}
                      onChange={(e) => setBlockers(e.target.value)}
                      style={{ minHeight: "60px" }}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Next Sprint Objectives (Optional)</label>
                    <textarea
                      className={styles.textareaField}
                      placeholder="Upcoming experiments, model evaluations, paper draft sections..."
                      value={nextSteps}
                      onChange={(e) => setNextSteps(e.target.value)}
                      style={{ minHeight: "60px" }}
                    />
                  </div>
                </>
              ) : (
                /* PDF Upload Format */
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Report PDF Document *</label>
                  <input
                    type="file"
                    accept=".pdf"
                    className={styles.inputField}
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#8c8c98" }}>
                    Upload complete LaTeX or PDF report document (max 10MB).
                  </span>
                </div>
              )}

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitModalBtn}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Report →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
