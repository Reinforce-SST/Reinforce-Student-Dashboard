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
  fallbackSpgs,
  fallbackReports,
} from "@/lib/spgData";
import styles from "./SpgDetail.module.css";

export default function SpgDetailClient({ spgId }: { spgId: string }) {
  const { token, profile } = useMember();

  // Load initial SPG & reports from fallback or local matching
  const defaultSpg =
    fallbackSpgs.find((s) => s.id === spgId) ||
    fallbackSpgs[0];

  const [spg, setSpg] = useState<SPGRecord>(defaultSpg);
  const [reports, setReports] = useState<SPGReportRecord[]>(() => {
    const raw = fallbackReports[spgId] || fallbackReports[defaultSpg.id] || [];
    return [...raw].sort((a, b) => b.sequence_number - a.sequence_number);
  });
  const [loading, setLoading] = useState(false);

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

  // Expanded report cards state
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});

  const toggleExpand = (reportId: string) => {
    setExpandedReports((prev) => ({ ...prev, [reportId]: !prev[reportId] }));
  };

  // Fetch SPG & Reports from Backend API
  const fetchSpgData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const spgRes = await api.getSpg(token, spgId).catch(() => null);
      if (spgRes) {
        setSpg(spgRes);
      }

      const repRes = await api.listSpgReports(token, spgId).catch(() => null);
      if (repRes && repRes.items) {
        const sorted = [...repRes.items].sort(
          (a, b) => (b.sequence_number || 0) - (a.sequence_number || 0)
        );
        setReports(sorted);
      }
    } catch {
      // Keep fallback data
    } finally {
      setLoading(false);
    }
  }, [token, spgId]);

  useEffect(() => {
    fetchSpgData();
  }, [fetchSpgData]);

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

        if (token) {
          try {
            const res = await api.submitFormReport(token, spg.id, payload);
            newRecord = res;
          } catch {
            // Local mock record creation for testing/offline
            newRecord = {
              id: `rep_${Date.now()}`,
              spg_id: spg.id,
              report_type: reportType,
              report_format: "form",
              heading: payload.heading,
              short_description: payload.short_description,
              sequence_number: reports.length + 1,
              summary: payload.summary,
              milestones: payload.milestones,
              blockers: payload.blockers,
              next_steps: payload.next_steps,
              submitted_by: profile.id || profile.email,
              submitter_name: profile.full_name || "Member",
              submitted_at: new Date().toISOString(),
              status: "pending",
            };
          }
        } else {
          newRecord = {
            id: `rep_${Date.now()}`,
            spg_id: spg.id,
            report_type: reportType,
            report_format: "form",
            heading: payload.heading,
            short_description: payload.short_description,
            sequence_number: reports.length + 1,
            summary: payload.summary,
            milestones: payload.milestones,
            blockers: payload.blockers,
            next_steps: payload.next_steps,
            submitted_by: profile.id || profile.email,
            submitter_name: profile.full_name || "Guild Member",
            submitted_at: new Date().toISOString(),
            status: "pending",
          };
        }
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

        if (token) {
          try {
            const res = await api.submitPdfReport(token, spg.id, formData);
            newRecord = res;
          } catch {
            newRecord = {
              id: `rep_${Date.now()}`,
              spg_id: spg.id,
              report_type: reportType,
              report_format: "pdf",
              heading: heading.trim(),
              short_description: shortDescription.trim(),
              sequence_number: reports.length + 1,
              pdf_url: URL.createObjectURL(pdfFile),
              milestones: [],
              submitted_by: profile.id || profile.email,
              submitter_name: profile.full_name || "Member",
              submitted_at: new Date().toISOString(),
              status: "pending",
            };
          }
        } else {
          newRecord = {
            id: `rep_${Date.now()}`,
            spg_id: spg.id,
            report_type: reportType,
            report_format: "pdf",
            heading: heading.trim(),
            short_description: shortDescription.trim(),
            sequence_number: reports.length + 1,
            pdf_url: URL.createObjectURL(pdfFile),
            milestones: [],
            submitted_by: profile.id || profile.email,
            submitter_name: profile.full_name || "Guild Member",
            submitted_at: new Date().toISOString(),
            status: "pending",
          };
        }
      }

      setReports((prev) => [newRecord, ...prev]);
      setSpg((prev) => ({ ...prev, report_count: prev.report_count + 1 }));
      setIsModalOpen(false);
      
      // Reset form fields
      setHeading("");
      setShortDescription("");
      setSummary("");
      setMilestones([""]);
      setBlockers("");
      setNextSteps("");
      setPdfFile(null);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to submit report" });
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

  return (
    <div className={styles.pageContainer}>
      {/* Back Link & Breadcrumb Header */}
      <div className={styles.backRow}>
        <Link href="/dashboard/spg" className={styles.backBtn}>
          ← Back to Project Clusters (SPG)
        </Link>

        <div className={styles.statusChipsRow}>
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
          <button
            type="button"
            className={styles.reportCtaBtn}
            onClick={() => setIsModalOpen(true)}
          >
            <MemberIcon name="plus" size={16} />
            Submit Progress Report
          </button>

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
        </div>
      </section>

      {/* 2-Column Main Layout Grid */}
      <div className={styles.mainGrid}>
        {/* Left Main Column: Proposition & Reports History */}
        <div className={styles.contentColumn}>
          {/* Progress Reports Feed */}
          <section className={styles.sectionCard} aria-label="Progress Reports History">
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <MemberIcon name="articles" size={18} />
                Progress Reports & Milestones Feed
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
                <button
                  type="button"
                  className={styles.reportCtaBtn}
                  onClick={() => setIsModalOpen(true)}
                  style={{ marginTop: "8px" }}
                >
                  File First Progress Report
                </button>
              </div>
            ) : (
              <div className={styles.reportsList}>
                {reports.map((report) => {
                  const isExpanded = expandedReports[report.id] ?? true;
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
              <div className={styles.rosterItem}>
                <div className={styles.rosterLeft}>
                  <div className={`${styles.memberAvatar} ${styles.leadAvatar}`}>
                    {getInitials(spg.lead_name || spg.lead_id)}
                  </div>
                  <div className={styles.memberNameGroup}>
                    <span className={styles.memberName}>
                      {spg.lead_name || spg.lead_id}
                    </span>
                    <span className={styles.memberRole}>Project Lead</span>
                  </div>
                </div>
                <span className={styles.leadBadge}>LEAD</span>
              </div>

              {/* Other Members */}
              {spg.member_ids
                ?.filter((uid) => uid !== spg.lead_id)
                .map((uid) => {
                  const name = spg.member_names?.[uid] || uid;
                  return (
                    <div key={uid} className={styles.rosterItem}>
                      <div className={styles.rosterLeft}>
                        <div className={styles.memberAvatar}>
                          {getInitials(name)}
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
                <span className={styles.specVal}>{spg.type.toUpperCase()}</span>
              </div>

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Visibility</span>
                <span className={styles.specVal}>{spg.visibility.toUpperCase()}</span>
              </div>

              <div className={styles.specRow}>
                <span className={styles.specLabel}>Total Reports</span>
                <span className={styles.specVal}>{spg.report_count} Filed</span>
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
