"use client";

import { useEffect, useState, useMemo } from "react";
import { api, type EventSummaryItem, type SPGRecord, type StudentProfile } from "@/lib/api";
import type {
  ContributionRecord,
  ContributionCategory,
  ContributionTrack,
} from "@/lib/contributionData";
import ConfirmModal from "@/components/dashboard/ConfirmModal";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./AdminContributionEditor.module.css";

const CATEGORY_OPTIONS: { value: ContributionCategory; label: string }[] = [
  { value: "participation", label: "Event Participation" },
  { value: "achievement", label: "Achievement / Award" },
  { value: "project_work", label: "Project Work" },
  { value: "teaching", label: "Teaching / Workshop" },
  { value: "mentorship", label: "Mentorship" },
  { value: "content", label: "Content / Article" },
  { value: "organizing", label: "Organizing / Lead" },
  { value: "service", label: "Community Service" },
  { value: "other", label: "Other" },
];

const TRACK_OPTIONS: { value: ContributionTrack; label: string }[] = [
  { value: "research", label: "Research Track" },
  { value: "product", label: "Product Track" },
  { value: "kaggle", label: "Kaggle Track" },
  { value: "misc", label: "Misc Track" },
];

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminContributionEditorPanel({ token }: { token: string }) {
  const [panelType, setPanelType] = useState<"event" | "spg" | "misc">("event");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [selectedSpgId, setSelectedSpgId] = useState<string>("all");
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Data
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [spgs, setSpgs] = useState<SPGRecord[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, StudentProfile>>({});

  // Loading & feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<ContributionRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editCategory, setEditCategory] = useState<ContributionCategory>("participation");
  const [editTrack, setEditTrack] = useState<ContributionTrack>("misc");
  const [editOccurredAt, setEditOccurredAt] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Revoke modal state
  const [revokingRecord, setRevokingRecord] = useState<ContributionRecord | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // Load auxiliary lists: events & spgs
  useEffect(() => {
    let active = true;
    if (token) {
      api.listEvents(token, { limit: 100 })
        .then((res) => {
          if (active && res.events) setEvents(res.events);
        })
        .catch(() => {});

      api.listSpgs(token, { limit: 100 })
        .then((res) => {
          if (active && res.items) setSpgs(res.items);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [token]);

  // Load contributions according to active panel and filters
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const params: Parameters<typeof api.adminListContributions>[1] = {
      limit: 100,
    };

    if (panelType === "event" && selectedEventId !== "all") {
      params.event_id = selectedEventId;
    }
    if (panelType === "spg" && selectedSpgId !== "all") {
      params.spg_id = selectedSpgId;
    }
    if (selectedTrack !== "all") {
      params.track = selectedTrack;
    }
    if (selectedCategory !== "all") {
      params.category = selectedCategory;
    }
    if (selectedStatus !== "all") {
      params.status = selectedStatus;
    }

    api.adminListContributions(token, params)
      .then((res) => {
        if (!active) return;
        let items = res.items || [];

        // Apply panel scope filtering
        if (panelType === "event") {
          items = items.filter((item) => Boolean(item.event_id) || item.category === "participation");
        } else if (panelType === "spg") {
          items = items.filter((item) => Boolean(item.spg_id));
        } else if (panelType === "misc") {
          items = items.filter((item) => !item.event_id && !item.spg_id && item.category !== "participation");
        }

        setContributions(items);

        // Resolve unknown member profiles
        const unknownUids = [...new Set(items.map((i) => i.user_id))].filter(
          (uid) => !memberProfiles[uid]
        );

        if (unknownUids.length > 0) {
          Promise.allSettled(
            unknownUids.map((uid) => api.getUserProfile(token, uid))
          ).then((results) => {
            if (!active) return;
            const newMap: Record<string, StudentProfile> = {};
            results.forEach((r, idx) => {
              if (r.status === "fulfilled" && r.value) {
                newMap[unknownUids[idx]] = r.value;
              }
            });
            setMemberProfiles((prev) => ({ ...prev, ...newMap }));
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load contributions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, panelType, selectedEventId, selectedSpgId, selectedTrack, selectedCategory, selectedStatus, refreshKey]);

  // Filter by search query client-side
  const filteredContributions = useMemo(() => {
    if (!searchQuery.trim()) return contributions;
    const q = searchQuery.toLowerCase().trim();
    return contributions.filter((c) => {
      const profile = memberProfiles[c.user_id];
      const name = (profile?.full_name || "").toLowerCase();
      const email = (profile?.email || "").toLowerCase();
      const title = (c.title || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      return name.includes(q) || email.includes(q) || title.includes(q) || desc.includes(q);
    });
  }, [contributions, searchQuery, memberProfiles]);

  // Open Edit Modal
  const handleOpenEdit = (record: ContributionRecord) => {
    setEditingRecord(record);
    const staged = stagedEdits[record.id];
    setEditTitle(record.title || "");
    setEditDescription(record.description || "");
    setEditPoints(staged?.points ?? record.points ?? 0);
    setEditCategory(staged?.category ?? record.category ?? "participation");
    setEditTrack(record.track || "misc");
    setEditOccurredAt(formatDateTimeInput(record.occurred_at));
    setError("");
  };

  // Close Edit Modal
  const handleCloseEdit = () => {
    setEditingRecord(null);
    setIsSavingEdit(false);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    if (!editTitle.trim()) {
      setError("Contribution title cannot be empty.");
      return;
    }
    if (editPoints < 0) {
      setError("Points must be a non-negative whole number.");
      return;
    }

    setIsSavingEdit(true);
    setError("");
    setNotice("");

    try {
      const occurredDate = editOccurredAt ? new Date(editOccurredAt).toISOString() : undefined;
      await api.adminUpdateContribution(token, editingRecord.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        points: editPoints,
        category: editCategory,
        track: editTrack,
        occurred_at: occurredDate,
      });

      setNotice(`Updated contribution "${editTitle}" successfully.`);
      const editedUid = editingRecord.user_id;
      handleDiscardRow(editingRecord.id);
      setMemberProfiles((prev) => {
        const next = { ...prev };
        delete next[editedUid];
        return next;
      });
      handleCloseEdit();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contribution.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Revoke Flow
  const handleOpenRevokePrompt = (record: ContributionRecord) => {
    setRevokingRecord(record);
    setRevokeReason("Award adjusted or duplicate record");
    setShowRevokeConfirm(false);
  };

  const handleProceedRevokeConfirm = () => {
    if (!revokeReason.trim()) {
      setError("Please specify a revocation reason.");
      return;
    }
    setShowRevokeConfirm(true);
  };

  // Execute Revocation
  const handleExecuteRevoke = async () => {
    if (!revokingRecord) return;
    setIsRevoking(true);
    setError("");
    setNotice("");

    try {
      await api.adminRevokeContribution(token, revokingRecord.id, revokeReason.trim());
      setNotice(`Revoked ${revokingRecord.points} PTS for "${revokingRecord.title}". Points recalculated.`);
      setShowRevokeConfirm(false);
      const revokedUid = revokingRecord.user_id;
      handleDiscardRow(revokingRecord.id);
      setRevokingRecord(null);
      setMemberProfiles((prev) => {
        const next = { ...prev };
        delete next[revokedUid];
        return next;
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke contribution.");
    } finally {
      setIsRevoking(false);
    }
  };

  // Staged edits state for batch saving
  type StagedEdit = {
    category?: ContributionCategory;
    points?: number;
  };

  const [stagedEdits, setStagedEdits] = useState<Record<string, StagedEdit>>({});
  const [isSavingStaged, setIsSavingStaged] = useState(false);

  const stagedCount = Object.keys(stagedEdits).length;

  const handleStageCategoryChange = (record: ContributionRecord, newCategory: string) => {
    if (record.status === "revoked") return;
    setStagedEdits((prev) => {
      const existing = prev[record.id] || {};
      const updated: StagedEdit = { ...existing };
      if (record.category === newCategory) {
        delete updated.category;
      } else {
        updated.category = newCategory as ContributionCategory;
      }

      if (Object.keys(updated).length === 0) {
        const next = { ...prev };
        delete next[record.id];
        return next;
      }
      return { ...prev, [record.id]: updated };
    });
  };

  const handleStagePointsChange = (record: ContributionRecord, rawValue: string) => {
    if (record.status === "revoked") return;
    const num = parseInt(rawValue, 10);
    if (Number.isNaN(num) || num < 0) return;

    setStagedEdits((prev) => {
      const existing = prev[record.id] || {};
      const updated: StagedEdit = { ...existing };
      if (record.points === num) {
        delete updated.points;
      } else {
        updated.points = num;
      }

      if (Object.keys(updated).length === 0) {
        const next = { ...prev };
        delete next[record.id];
        return next;
      }
      return { ...prev, [record.id]: updated };
    });
  };

  const handleDiscardRow = (recordId: string) => {
    setStagedEdits((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  };

  const handleDiscardAll = () => {
    setStagedEdits({});
  };

  const handleSaveStaged = async () => {
    const entries = Object.entries(stagedEdits);
    if (entries.length === 0) return;

    setIsSavingStaged(true);
    setError("");
    setNotice("");

    const payloadUpdates = entries.map(([recordId, edits]) => ({
      record_id: recordId,
      update_data: {
        ...(edits.category !== undefined ? { category: edits.category } : {}),
        ...(edits.points !== undefined ? { points: edits.points } : {}),
      },
    }));

    try {
      let savedRecords: ContributionRecord[];
      try {
        savedRecords = await api.adminBatchUpdateContributions(token, payloadUpdates);
      } catch {
        // Fallback to parallel adminUpdateContribution requests
        savedRecords = await Promise.all(
          payloadUpdates.map((item) =>
            api.adminUpdateContribution(token, item.record_id, item.update_data)
          )
        );
      }

      const savedMap = new Map(savedRecords.map((r) => [r.id, r]));
      setContributions((prev) =>
        prev.map((c) => savedMap.get(c.id) || c)
      );

      const affectedUids = new Set(savedRecords.map((r) => r.user_id));
      setMemberProfiles((prev) => {
        const next = { ...prev };
        affectedUids.forEach((uid) => delete next[uid]);
        return next;
      });

      setStagedEdits({});
      setNotice(`Saved ${savedRecords.length} contribution change${savedRecords.length > 1 ? "s" : ""} successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contribution changes.");
    } finally {
      setIsSavingStaged(false);
    }
  };

  const handleSubTabChange = (targetPanel: "event" | "spg" | "misc") => {
    if (stagedCount > 0) {
      const confirmDiscard = window.confirm(
        `You have ${stagedCount} unsaved contribution change(s). Switching panels will discard them. Discard and proceed?`
      );
      if (!confirmDiscard) return;
      setStagedEdits({});
    }
    setPanelType(targetPanel);
    if (targetPanel === "event") setSelectedEventId("all");
    if (targetPanel === "spg") setSelectedSpgId("all");
  };

  const getEventName = (eventId?: string | null) => {
    if (!eventId) return null;
    const ev = events.find((e) => e.id === eventId || e.slug === eventId);
    return ev?.title || eventId;
  };

  const getSpgName = (spgId?: string | null) => {
    if (!spgId) return null;
    const spg = spgs.find((s) => s.id === spgId);
    return spg?.name || spgId;
  };

  return (
    <div className={styles.container}>
      {/* Header and Sub-Panel Tabs */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2>Contribution Points Editor & Ledger</h2>
          <p>
            Inspect, adjust points, and revoke already awarded contributions across events, SPGs, and merit tracks.
          </p>
        </div>

        <div className={styles.subTabs}>
          <button
            type="button"
            className={`${styles.subTabBtn} ${panelType === "event" ? styles.subTabBtnActive : ""}`}
            onClick={() => handleSubTabChange("event")}
          >
            <MemberIcon name="calendar" size={16} />
            Event Panel
          </button>

          <button
            type="button"
            className={`${styles.subTabBtn} ${panelType === "spg" ? styles.subTabBtnActive : ""}`}
            onClick={() => handleSubTabChange("spg")}
          >
            <MemberIcon name="spg" size={16} />
            SPG Panel
          </button>

          <button
            type="button"
            className={`${styles.subTabBtn} ${panelType === "misc" ? styles.subTabBtnActive : ""}`}
            onClick={() => handleSubTabChange("misc")}
          >
            <MemberIcon name="award" size={16} />
            MISC & Direct Panel
          </button>
        </div>
      </div>

      {/* Notice & Error Banners */}
      {notice && (
        <div className={styles.noticeBanner}>
          <span>✓ {notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: "14px" }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠ {error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: "14px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Controls */}
      <div className={styles.filterBar}>
        <div className={styles.searchInputWrapper}>
          <span className={styles.searchIcon}>
            <MemberIcon name="search" size={15} />
          </span>
          <input
            type="search"
            placeholder="Search by student name, email, or contribution title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Event scope select */}
        {panelType === "event" && (
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className={styles.filterSelect}
            aria-label="Filter by Event"
          >
            <option value="all">All Events ({events.length})</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        )}

        {/* SPG scope select */}
        {panelType === "spg" && (
          <select
            value={selectedSpgId}
            onChange={(e) => setSelectedSpgId(e.target.value)}
            className={styles.filterSelect}
            aria-label="Filter by SPG"
          >
            <option value="all">All SPGs ({spgs.length})</option>
            {spgs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Track filter */}
        <select
          value={selectedTrack}
          onChange={(e) => setSelectedTrack(e.target.value)}
          className={styles.filterSelect}
          aria-label="Filter by Track"
        >
          <option value="all">All Tracks</option>
          {TRACK_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Category filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={styles.filterSelect}
          aria-label="Filter by Category"
        >
          <option value="all">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className={styles.filterSelect}
          aria-label="Filter by Status"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="revoked">Revoked</option>
        </select>

        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className={styles.refreshBtn}
          title="Refresh contributions"
        >
          <MemberIcon name="lightning" size={14} />
          Refresh
        </button>
      </div>

      {/* Staged Changes Notification & Action Bar */}
      {stagedCount > 0 && (
        <div className={styles.stagedChangesBar}>
          <div className={styles.stagedInfo}>
            <span className={styles.stagedPulse} />
            <span className={styles.stagedText}>
              You have <strong>{stagedCount}</strong> unsaved contribution {stagedCount === 1 ? "change" : "changes"}. Click &ldquo;Save Contributions&rdquo; to apply them all at once.
            </span>
          </div>
          <div className={styles.stagedActions}>
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={isSavingStaged}
              className={styles.discardBtn}
            >
              Discard All
            </button>
            <button
              type="button"
              onClick={handleSaveStaged}
              disabled={isSavingStaged}
              className={styles.saveBtn}
            >
              {isSavingStaged ? (
                <>
                  <span className={styles.btnSpinner} />
                  Saving Changes…
                </>
              ) : (
                <>
                  <MemberIcon name="check" size={15} />
                  Save Contributions ({stagedCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Contributions Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Contribution & Context</th>
                <th>Category</th>
                <th>Track</th>
                <th>Points</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && contributions.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyStateTitle}>Loading contributions…</span>
                      <span className={styles.emptyStateDesc}>Fetching verified records from the ledger.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredContributions.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyStateTitle}>No contributions found</span>
                      <span className={styles.emptyStateDesc}>
                        {searchQuery
                          ? `No records matching "${searchQuery}".`
                          : "No records found in this category or panel."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContributions.map((record) => {
                  const profile = memberProfiles[record.user_id];
                  const fullName = profile?.full_name || "Club Member";
                  const email = profile?.email || record.user_id;
                  const initials = fullName
                    ? fullName.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                    : "MB";

                  const eventName = getEventName(record.event_id);
                  const spgName = getSpgName(record.spg_id);

                  const isRowModified = Boolean(stagedEdits[record.id]);
                  const currentCategory = stagedEdits[record.id]?.category ?? record.category;
                  const isCategoryModified = stagedEdits[record.id]?.category !== undefined;
                  const currentPoints = stagedEdits[record.id]?.points ?? record.points;
                  const isPointsModified = stagedEdits[record.id]?.points !== undefined;

                  return (
                    <tr key={record.id} className={isRowModified ? styles.rowModified : ""}>
                      {/* Member */}
                      <td>
                        <div className={styles.memberCell}>
                          <div className={styles.avatar}>
                            {profile?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={profile.avatar_url} alt={fullName} className={styles.avatarImg} />
                            ) : (
                              initials
                            )}
                          </div>
                          <div className={styles.memberMeta}>
                            <span className={styles.memberName}>
                              {fullName}
                              {isRowModified && (
                                <span className={styles.modifiedBadge}>Unsaved</span>
                              )}
                            </span>
                            <span className={styles.memberEmail}>{email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contribution & Context */}
                      <td>
                        <div className={styles.titleCell}>
                          <span className={styles.contribTitle}>{record.title}</span>
                          {eventName && (
                            <span className={styles.contribContext}>
                              Event: {eventName}
                            </span>
                          )}
                          {spgName && (
                            <span className={styles.contribContext}>
                              SPG: {spgName}
                            </span>
                          )}
                          {record.description && (
                            <span className={styles.contribDesc} title={record.description}>
                              {record.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <select
                          value={currentCategory}
                          onChange={(e) => handleStageCategoryChange(record, e.target.value)}
                          disabled={record.status === "revoked" || isSavingStaged}
                          className={`${styles.inlineCategorySelect} ${isCategoryModified ? styles.inlineCategorySelectModified : ""}`}
                          aria-label={`Change category for ${record.title}`}
                          title={record.status === "revoked" ? "Cannot change category for revoked contribution" : "Change category"}
                        >
                          {!CATEGORY_OPTIONS.some((opt) => opt.value === currentCategory) && (
                            <option value={currentCategory}>{currentCategory}</option>
                          )}
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Track */}
                      <td>
                        <span className={styles.trackPill} data-track={record.track}>
                          {record.track}
                        </span>
                      </td>

                      {/* Points */}
                      <td>
                        <div className={styles.pointsCell}>
                          <input
                            type="number"
                            min={0}
                            value={currentPoints}
                            onChange={(e) => handleStagePointsChange(record, e.target.value)}
                            disabled={record.status === "revoked" || isSavingStaged}
                            className={`${styles.inlinePointsInput} ${isPointsModified ? styles.inlinePointsModified : ""}`}
                            title="Edit contribution points"
                            aria-label={`Edit points for ${record.title}`}
                          />
                          <span className={styles.ptsUnit}>PTS</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ whiteSpace: "nowrap", color: "#a1a1aa", fontSize: "0.8rem" }}>
                        {formatDate(record.occurred_at || record.created_at)}
                      </td>

                      {/* Status */}
                      <td className={styles.statusCell}>
                        {record.status === "approved" ? (
                          <span className={styles.statusApproved}>✓ Approved</span>
                        ) : (
                          <span className={styles.statusRevoked}>✕ Revoked</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className={styles.actionsCell}>
                          {isRowModified && (
                            <button
                              type="button"
                              onClick={() => handleDiscardRow(record.id)}
                              className={styles.revertRowBtn}
                              title="Discard unsaved changes for this row"
                            >
                              ↺ Undo
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(record)}
                            className={styles.editBtn}
                            title="Edit this contribution"
                          >
                            <MemberIcon name="edit" size={13} />
                            Edit
                          </button>

                          {record.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => handleOpenRevokePrompt(record)}
                              className={styles.revokeBtn}
                              title="Revoke this contribution"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Contribution Modal */}
      {editingRecord && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h3>Edit Contribution Points</h3>
              <button
                type="button"
                onClick={handleCloseEdit}
                className={styles.modalCloseBtn}
                aria-label="Close edit dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className={styles.modalBody}>
                {/* Member summary */}
                <div style={{ padding: "10px 14px", background: "#202024", borderRadius: "8px", fontSize: "0.82rem", color: "#d4d4d8" }}>
                  Editing contribution for <strong>{memberProfiles[editingRecord.user_id]?.full_name || editingRecord.user_id}</strong>
                </div>

                {/* Title */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Contribution Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={styles.formInput}
                    required
                    maxLength={200}
                  />
                </div>

                {/* Description */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Description / Notes (Optional)</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className={styles.formTextarea}
                    rows={3}
                  />
                </div>

                {/* Points & Track */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Points Awarded</label>
                    <input
                      type="number"
                      value={editPoints}
                      onChange={(e) => setEditPoints(e.target.value === "" ? 0 : Number(e.target.value))}
                      className={styles.formInput}
                      min={0}
                      max={1000}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Track</label>
                    <select
                      value={editTrack}
                      onChange={(e) => setEditTrack(e.target.value as ContributionTrack)}
                      className={styles.formSelect}
                    >
                      {TRACK_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Category & Date */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as ContributionCategory)}
                      className={styles.formSelect}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date Occurred</label>
                    <input
                      type="datetime-local"
                      value={editOccurredAt}
                      onChange={(e) => setEditOccurredAt(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className={styles.cancelModalBtn}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveModalBtn}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? "Saving Changes…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revocation Prompt Modal */}
      {revokingRecord && !showRevokeConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalDialog} style={{ maxWidth: "520px" }}>
            <div className={styles.modalHeader}>
              <h3>Revoke Contribution</h3>
              <button
                type="button"
                onClick={() => setRevokingRecord(null)}
                className={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.revokePromptBox}>
                <div className={styles.revokeWarning}>
                  Revoking this contribution will deduct <strong>{revokingRecord.points} PTS</strong> from{" "}
                  <strong>{memberProfiles[revokingRecord.user_id]?.full_name || revokingRecord.user_id}</strong>. The audit
                  record will be preserved.
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reason for Revocation</label>
                  <input
                    type="text"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="e.g. Duplicate award, session cancellation, attendance discrepancy"
                    className={styles.formInput}
                    required
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setRevokingRecord(null)}
                className={styles.cancelModalBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedRevokeConfirm}
                className={styles.revokeBtn}
                style={{ padding: "9px 18px", fontSize: "0.82rem" }}
                disabled={!revokeReason.trim()}
              >
                Proceed to Revoke →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revocation Confirmation with ConfirmModal */}
      {revokingRecord && (
        <ConfirmModal
          isOpen={showRevokeConfirm}
          title="Confirm Contribution Revocation"
          message={`Are you sure you want to revoke ${revokingRecord.points} PTS for "${revokingRecord.title}" awarded to ${
            memberProfiles[revokingRecord.user_id]?.full_name || revokingRecord.user_id
          }? Reason: "${revokeReason}". This will subtract the points from their score.`}
          confirmLabel="Revoke Points"
          cancelLabel="Back"
          variant="danger"
          isLoading={isRevoking}
          onConfirm={handleExecuteRevoke}
          onCancel={() => setShowRevokeConfirm(false)}
        />
      )}
    </div>
  );
}
