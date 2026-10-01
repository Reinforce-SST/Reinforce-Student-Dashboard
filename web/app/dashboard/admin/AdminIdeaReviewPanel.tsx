"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api, type IdeaSummary, type IdeaDetail } from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import PaginationBar from "@/components/dashboard/PaginationBar";
import styles from "./AdminWorkflows.module.css";

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The filters live in a tablist, so each one is a tab with a selected state.
// Without role="tab" assistive technology announces an empty tab list and never
// reads out which filter is active.
const STATUS_TABS: [string, string][] = [
  ["all", "All Submissions"],
  ["pending", "⏳ Pending Review"],
  ["approved", "✓ Approved & Live"],
  ["closed", "✕ Closed / Rejected"],
];

export default function AdminIdeaReviewPanel({ token }: { token: string }) {
  // Filter & Pagination States
  const [status, setStatus] = useState<string>("all");
  const [track, setTrack] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Data States
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Edit Modal States
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The Edit button disables itself while the idea loads, and a disabled button
  // drops focus — so by the time showModal() runs the browser would remember
  // <body> and restore focus there. Capture the trigger at click time instead.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [editingIdea, setEditingIdea] = useState<IdeaDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [formTitle, setFormTitle] = useState("");
  const [formTrack, setFormTrack] = useState("misc");
  const [formDifficulty, setFormDifficulty] = useState("intermediate");
  const [formDescription, setFormDescription] = useState("");
  const [formPrerequisites, setFormPrerequisites] = useState("");
  const [formRoadmap, setFormRoadmap] = useState("");
  const [formOutcomes, setFormOutcomes] = useState("");

  // Opened with showModal, like the drawer in DashboardShell: the browser then
  // closes it on Escape, keeps focus inside it, and returns focus to the Edit
  // button afterwards. The guard keeps Strict Mode's effect replay from calling
  // showModal on a dialog that is already open, which throws.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (editingIdea && dialog && !dialog.open) dialog.showModal();
  }, [editingIdea]);

  // Load ideas with active filters
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api
      .adminListIdeas(token, {
        status,
        track,
        difficulty,
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize,
      })
      .then((res) => {
        if (active) {
          setIdeas(res.items);
          setTotal(res.total);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Failed to load ideas."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, status, track, difficulty, debouncedSearch, page, pageSize, revision]);

  // Open Edit Modal and pre-fill form
  async function handleOpenEdit(summary: IdeaSummary, trigger?: HTMLElement) {
    returnFocusRef.current = trigger ?? null;
    setEditError("");
    setEditLoading(true);
    try {
      const detail = await api.getIdea(summary.id, token);
      setEditingIdea(detail);
      setFormTitle(detail.title);
      setFormTrack(detail.track || "misc");
      setFormDifficulty(detail.difficulty || "intermediate");
      setFormDescription(detail.description || "");
      setFormPrerequisites((detail.prerequisites || []).join("\n"));
      setFormRoadmap((detail.rough_roadmap || []).join("\n"));
      setFormOutcomes((detail.learning_outcomes || []).join("\n"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to load idea details for editing."
      );
    } finally {
      setEditLoading(false);
    }
  }

  function handleCloseEdit() {
    if (dialogRef.current?.open) dialogRef.current.close();
    else resetEdit();
  }

  function resetEdit() {
    setEditingIdea(null);
    setEditError("");
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    // After a save the list re-renders; only restore focus if the button survived.
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
  }

  // Save changes (and optionally approve simultaneously)
  async function handleSaveEdit(alsoApprove = false) {
    if (!editingIdea || editSaving) return;

    if (!formTitle.trim()) {
      setEditError("Title cannot be empty.");
      return;
    }
    if (!formDescription.trim()) {
      setEditError("Description cannot be empty.");
      return;
    }

    setEditSaving(true);
    setEditError("");
    try {
      const prereqList = formPrerequisites
        .split("\n")
        .map((s) => s.replace(/^[•\-\*\d\.\)\s]+/, "").trim())
        .filter(Boolean);

      const roadmapList = formRoadmap
        .split("\n")
        .map((s) => s.replace(/^[•\-\*\d\.\)\s]+/, "").trim())
        .filter(Boolean);

      const outcomesList = formOutcomes
        .split("\n")
        .map((s) => s.replace(/^[•\-\*\d\.\)\s]+/, "").trim())
        .filter(Boolean);

      await api.updateIdea(token, editingIdea.id, {
        title: formTitle.trim(),
        description: formDescription.trim(),
        track: formTrack,
        difficulty: formDifficulty,
        prerequisites: prereqList,
        rough_roadmap: roadmapList,
        learning_outcomes: outcomesList,
      });

      if (alsoApprove) {
        await api.approveIdea(token, editingIdea.id);
        setNotice(`“${formTitle.trim()}” updated, approved, and published!`);
      } else {
        setNotice(`“${formTitle.trim()}” changes saved successfully.`);
      }

      handleCloseEdit();
      setRevision((v) => v + 1);
    } catch (cause) {
      setEditError(
        cause instanceof Error ? cause.message : "Failed to save idea changes."
      );
    } finally {
      setEditSaving(false);
    }
  }

  // Direct Approve
  async function handleApprove(id: string) {
    if (actionBusyId) return;
    setActionBusyId(id);
    setError("");
    setNotice("");
    try {
      await api.approveIdea(token, id);
      setNotice("Idea approved and published to the public Idea Jar!");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Idea could not be approved."
      );
    } finally {
      setActionBusyId(null);
    }
  }

  // Direct Reject / Delete
  async function handleReject(id: string, title: string) {
    if (actionBusyId) return;
    if (
      !window.confirm(
        `Are you sure you want to delete or reject “${title}”? This action cannot be undone.`
      )
    ) {
      return;
    }
    setActionBusyId(id);
    setError("");
    setNotice("");
    try {
      await api.rejectIdea(token, id);
      setNotice(`Idea proposal “${title}” has been deleted / closed.`);
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Idea could not be deleted."
      );
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Panel Header */}
      <div className={styles.panelHeader}>
        <div>
          <h2>
            Idea Jar Moderation Console{" "}
            {!loading && <span className={styles.countBadge}>{total} ideas</span>}
          </h2>
          <p>
            Review, edit, approve, and manage all student project proposals and published ideas in the community Idea Jar.
          </p>
        </div>
      </div>

      {/* Notice / Error */}
      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button type="button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}

      {notice && <div className={styles.successNotice}>{notice}</div>}

      {/* Filter & Search Toolbar */}
      <div className={styles.filterToolbar}>
        {/* Status Filter Tabs */}
        <div className={styles.statusTabs} role="tablist" aria-label="Filter ideas by status">
          {STATUS_TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`${styles.statusTabBtn} ${status === value ? styles.statusTabBtnActive : ""}`}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search & Select Controls */}
        <div className={styles.filterControls}>
          <div className={styles.searchInputWrapper}>
            <input
              type="text"
              placeholder="Search ideas by title or keywords…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={styles.filterSearchInput}
            />
          </div>

          <select
            value={track}
            onChange={(e) => {
              setTrack(e.target.value);
              setPage(1);
            }}
            className={styles.filterSelect}
            aria-label="Filter by Track"
          >
            <option value="all">All Tracks</option>
            <option value="research">Research Track</option>
            <option value="product">Product Track</option>
            <option value="kaggle">Kaggle Track</option>
            <option value="misc">General / Misc</option>
          </select>

          <select
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value);
              setPage(1);
            }}
            className={styles.filterSelect}
            aria-label="Filter by Difficulty"
          >
            <option value="all">All Difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className={styles.loadingSkeleton}>
          Fetching community ideas from database…
        </div>
      )}

      {/* Empty State */}
      {!loading && ideas.length === 0 && (
        <div className={styles.emptyContainer}>
          <h3>No matching ideas found</h3>
          <p>
            {status !== "all" || track !== "all" || difficulty !== "all" || search
              ? "Try adjusting your filters or search keywords to see other submissions."
              : "No ideas have been submitted yet."}
          </p>
        </div>
      )}

      {/* Idea Cards List */}
      {!loading && ideas.length > 0 && (
        <div className={styles.list}>
          {ideas.map((idea) => {
            const isTicket = idea.id.startsWith("tkt_");
            const isPending = idea.status === "pending" || (!idea.is_verified && idea.status !== "closed");
            const isClosed = idea.status === "closed";
            const isApproved = idea.is_verified || idea.status === "approved";
            const formattedDate = formatDate(idea.created_at);

            return (
              <article className={styles.ideaCard} key={idea.id}>
                {/* Header Row */}
                <div className={styles.ideaCardHeader}>
                  <div className={styles.ideaBadges}>
                    {/* Status Pill */}
                    {isApproved && (
                      <span className={`${styles.statusIndicator} ${styles.statusApproved}`}>
                        ✓ Approved
                      </span>
                    )}
                    {isPending && (
                      <span className={`${styles.statusIndicator} ${styles.statusPending}`}>
                        ⏳ Pending Review
                      </span>
                    )}
                    {isClosed && (
                      <span className={`${styles.statusIndicator} ${styles.statusClosed}`}>
                        ✕ Closed
                      </span>
                    )}

                    {/* Track Pill */}
                    <span className={styles.trackPill} data-track={idea.track}>
                      {idea.track} Track
                    </span>

                    {/* Difficulty Pill */}
                    {idea.difficulty && (
                      <span className={styles.difficultyPill}>
                        {idea.difficulty}
                      </span>
                    )}

                    {/* Source Pill */}
                    <span className={styles.sourcePill}>
                      {isTicket ? `Ticket #${idea.id}` : "Direct Idea"}
                    </span>
                  </div>

                  {formattedDate && (
                    <span className={styles.submitterTime}>
                      Submitted {formattedDate}
                    </span>
                  )}
                </div>

                {/* Title */}
                <Link
                  href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                  className={styles.ideaTitleLink}
                >
                  {idea.title}
                </Link>

                {/* Description */}
                {idea.description && (
                  <p className={styles.ideaDescription}>{idea.description}</p>
                )}

                {/* Actions */}
                <div className={styles.ideaActions}>
                  {/* Edit Proposal Button */}
                  <button
                    type="button"
                    className={styles.editActionBtn}
                    onClick={(event) => void handleOpenEdit(idea, event.currentTarget)}
                    disabled={editLoading || actionBusyId === idea.id}
                  >
                    ✏️ Edit Proposal
                  </button>

                  {/* Approve & Publish Button (if pending) */}
                  {isPending && (
                    <button
                      type="button"
                      className={styles.approveActionBtn}
                      disabled={actionBusyId === idea.id}
                      onClick={() => void handleApprove(idea.id)}
                    >
                      ✓ Approve & Publish
                    </button>
                  )}

                  {/* View Full Proposal Link */}
                  <Link
                    href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                    className={styles.viewDetailLink}
                  >
                    View Proposal →
                  </Link>

                  {/* Ticket Link if Ticket */}
                  {isTicket && (
                    <Link
                      href={`/dashboard/tickets/${encodeURIComponent(idea.id)}`}
                      className={styles.viewDetailLink}
                    >
                      Ticket Thread →
                    </Link>
                  )}

                  {/* Delete / Reject Button */}
                  <button
                    type="button"
                    className={styles.rejectActionBtn}
                    disabled={actionBusyId === idea.id}
                    onClick={() => void handleReject(idea.id, idea.title)}
                  >
                    🗑️ {isPending ? "Reject" : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {!loading && total > 0 && (
        <PaginationBar
          currentPage={page}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50]}
          itemLabel="ideas"
          disabled={loading}
        />
      )}

      {/* Edit Idea Modal */}
      {editingIdea && (
        <dialog
          ref={dialogRef}
          className={styles.modalOverlay}
          aria-labelledby="edit-idea-heading"
          onClose={resetEdit}
          // Cancel is disabled while saving; Escape should not get around that.
          onCancel={(event) => { if (editSaving) event.preventDefault(); }}
        >
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h3 id="edit-idea-heading">Edit Idea Proposal</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={handleCloseEdit}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div
                role="alert"
                style={{
                  margin: "12px 24px 0",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "#f87171",
                  fontSize: "0.84rem",
                }}
              >
                {editError}
              </div>
            )}

            <form
              className={styles.modalForm}
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveEdit(false);
              }}
            >
              <div className={styles.modalScrollContent}>
                {/* Title */}
                <div className={styles.formField}>
                  <label htmlFor="edit-idea-title">Idea Title *</label>
                  <input
                    id="edit-idea-title"
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="E.g. Autonomous Navigation with Reinforcement Learning"
                  />
                </div>

                {/* Track & Difficulty */}
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label htmlFor="edit-idea-track">Domain Track *</label>
                    <select
                      id="edit-idea-track"
                      value={formTrack}
                      onChange={(e) => setFormTrack(e.target.value)}
                    >
                      <option value="research">Research Track</option>
                      <option value="product">Product Track</option>
                      <option value="kaggle">Kaggle Track</option>
                      <option value="misc">General / Misc</option>
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="edit-idea-difficulty">Target Difficulty *</label>
                    <select
                      id="edit-idea-difficulty"
                      value={formDifficulty}
                      onChange={(e) => setFormDifficulty(e.target.value)}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className={styles.formField}>
                  <label htmlFor="edit-idea-description">Project Overview & Description *</label>
                  <textarea
                    id="edit-idea-description"
                    rows={4}
                    required
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Explain the background, core problem, and expected solution..."
                  />
                </div>

                {/* Prerequisites */}
                <div className={styles.formField}>
                  <label htmlFor="edit-idea-prerequisites">Prerequisites (One item per line)</label>
                  <textarea
                    id="edit-idea-prerequisites"
                    rows={3}
                    value={formPrerequisites}
                    onChange={(e) => setFormPrerequisites(e.target.value)}
                    placeholder="Python 3.10+&#10;PyTorch basics&#10;Git version control"
                  />
                  <span className={styles.fieldHint}>
                    Students will see these as required knowledge tags.
                  </span>
                </div>

                {/* Roadmap */}
                <div className={styles.formField}>
                  <label htmlFor="edit-idea-roadmap">Implementation Roadmap (One milestone per line)</label>
                  <textarea
                    id="edit-idea-roadmap"
                    rows={3}
                    value={formRoadmap}
                    onChange={(e) => setFormRoadmap(e.target.value)}
                    placeholder="1. Dataset exploration and preprocessing&#10;2. Architecture implementation&#10;3. Benchmarking and validation"
                  />
                  <span className={styles.fieldHint}>
                    Numbered sequentially in the proposal roadmap view.
                  </span>
                </div>

                {/* Learning Outcomes */}
                <div className={styles.formField}>
                  <label htmlFor="edit-idea-outcomes">Learning Outcomes (One outcome per line)</label>
                  <textarea
                    id="edit-idea-outcomes"
                    rows={3}
                    value={formOutcomes}
                    onChange={(e) => setFormOutcomes(e.target.value)}
                    placeholder="Understand GNN message-passing algorithms&#10;Profile latency on edge devices"
                  />
                  <span className={styles.fieldHint}>
                    Key takeaways and engineering skills acquired.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleCloseEdit}
                  disabled={editSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={editSaving}
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>

                {/* If idea is pending, allow Save & Approve */}
                {!editingIdea.is_verified && editingIdea.status !== "closed" && (
                  <button
                    type="button"
                    className={styles.saveApproveBtn}
                    disabled={editSaving}
                    onClick={() => void handleSaveEdit(true)}
                  >
                    {editSaving ? "Publishing…" : "✓ Save & Approve"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
}
