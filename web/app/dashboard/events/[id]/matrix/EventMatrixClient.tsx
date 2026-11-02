"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import type {
  EventMatrixResponse,
  CreateMatrixColumnPayload,
  MatrixObjectPayload,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import LoadingBar from "@/components/dashboard/LoadingBar";
import { useConfirmDialog } from "@/components/dashboard/useConfirmDialog";
import EventMatrixTable from "./EventMatrixTable";
import AddColumnModal from "./AddColumnModal";
import ManageVolunteersModal from "./ManageVolunteersModal";
import MatrixCellSidebar, { type ActiveCellTarget } from "./MatrixCellSidebar";
import styles from "./EventMatrix.module.css";

export default function EventMatrixClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { token, profile } = useMember();
  const { confirm, alert, DialogComponent } = useConfirmDialog();

  const [data, setData] = useState<EventMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs: Operations (Full editor) vs Public View (Read-only preview)
  const [matrixTab, setMatrixTab] = useState<"operations" | "public_view">(
    "operations"
  );

  // Search & Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState<"all" | "team" | "solo">("all");
  const [trackFilter, setTrackFilter] = useState("all");

  // Export State
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Active Cell Inspector / Drawer Target
  const [activeCellTarget, setActiveCellTarget] = useState<ActiveCellTarget | null>(
    null
  );

  // Staged Edits (to avoid multiple individual API calls)
  const [stagedCells, setStagedCells] = useState<
    Map<string, string | number | MatrixObjectPayload | null>
  >(new Map());
  const [stagedAttendance, setStagedAttendance] = useState<Map<string, string>>(
    new Map()
  );
  const [savingBatch, setSavingBatch] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showVolunteers, setShowVolunteers] = useState(false);

  const showToastNotice = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const loadMatrix = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEventMatrix(token, eventId);
      setData(res);
      // Clear staged edits on fresh load
      setStagedCells(new Map());
      setStagedAttendance(new Map());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Event Matrix.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  // Stage Attendance Update
  const handleStageAttendance = (userId: string, newStatus: string) => {
    setStagedAttendance((prev) => {
      const next = new Map(prev);
      next.set(userId, newStatus);
      return next;
    });
  };

  // Stage Cell Update
  const handleStageCell = (
    userId: string,
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => {
    setStagedCells((prev) => {
      const next = new Map(prev);
      next.set(`${userId}:${columnId}`, value);
      return next;
    });
  };

  // Discard all staged changes
  const handleDiscardChanges = () => {
    setStagedCells(new Map());
    setStagedAttendance(new Map());
  };

  // Batch Save all staged changes
  const handleSaveChanges = async () => {
    if (!token || !data) return;
    const totalCount = stagedCells.size + stagedAttendance.size;
    if (totalCount === 0) return;

    setSavingBatch(true);
    try {
      const cellsPayload = Array.from(stagedCells.entries()).map(([k, v]) => {
        const [user_id, column_id] = k.split(":");
        return { user_id, column_id, value: v };
      });
      const attendancePayload = Array.from(stagedAttendance.entries()).map(
        ([user_id, status]) => ({
          user_id,
          status,
        })
      );

      await api.batchUpdateMatrix(token, eventId, {
        cells: cellsPayload,
        attendance: attendancePayload,
      });

      // Optimistically update local data state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => {
            const nextCells = { ...row.cells };
            for (const [k, v] of stagedCells.entries()) {
              const [uId, colId] = k.split(":");
              if (uId === row.user_id) {
                nextCells[colId] = v;
              }
            }
            const nextAttendance =
              stagedAttendance.get(row.user_id) ?? row.attendance;
            return {
              ...row,
              cells: nextCells,
              attendance: nextAttendance,
              rsvp_status: nextAttendance,
            };
          }),
        };
      });

      handleDiscardChanges();
      showToastNotice(`Saved ${totalCount} matrix change(s) successfully!`);
    } catch (err) {
      console.error("Batch save error", err);
      alert({
        title: "Save Failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to save matrix changes.",
        variant: "danger",
      });
    } finally {
      setSavingBatch(false);
    }
  };

  // Add Column
  const handleAddColumn = async (payload: CreateMatrixColumnPayload) => {
    if (!token) return;
    try {
      const created = await api.createMatrixColumn(token, eventId, payload);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: [...prev.columns, created],
          rows: prev.rows.map((row) => ({
            ...row,
            cells: {
              ...row.cells,
              [created.column_id]: null,
            },
          })),
        };
      });
      showToastNotice(`Column "${created.title}" added.`);
    } catch (err) {
      console.error("Add column error", err);
      alert({
        title: "Failed to Add Column",
        message: err instanceof Error ? err.message : "An error occurred.",
        variant: "danger",
      });
    }
  };

  // Delete Column (with in-app modal confirmation)
  const handleDeleteColumn = async (columnId: string, columnTitle: string) => {
    if (!token) return;
    const ok = await confirm({
      title: `Delete Column "${columnTitle}"?`,
      message: `Are you sure you want to delete column "${columnTitle}"? All stored values for this column will be permanently removed.`,
      confirmLabel: "Delete Column",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.deleteMatrixColumn(token, eventId, columnId);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.filter((c) => c.column_id !== columnId),
          rows: prev.rows.map((row) => {
            const nextCells = { ...row.cells };
            delete nextCells[columnId];
            return {
              ...row,
              cells: nextCells,
            };
          }),
        };
      });
      // Clear staged keys for this column
      setStagedCells((prev) => {
        const next = new Map(prev);
        for (const key of next.keys()) {
          if (key.endsWith(`:${columnId}`)) {
            next.delete(key);
          }
        }
        return next;
      });
      showToastNotice(`Column "${columnTitle}" deleted.`);
    } catch (err) {
      console.error("Failed to delete column", err);
      alert({
        title: "Delete Failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to delete column. Please refresh.",
        variant: "danger",
      });
    }
  };

  // Assign to All attendees for a column
  const handleAssignAll = async (
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => {
    if (!token) return;
    try {
      const res = await api.assignAllToColumn(token, eventId, columnId, value);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => ({
            ...row,
            cells: {
              ...row.cells,
              [columnId]: value,
            },
          })),
        };
      });
      // Clear staged edits for this column
      setStagedCells((prev) => {
        const next = new Map(prev);
        for (const key of next.keys()) {
          if (key.endsWith(`:${columnId}`)) {
            next.delete(key);
          }
        }
        return next;
      });
      showToastNotice(`Assigned value across ${res.updated_count} attendees.`);
    } catch (err) {
      console.error("Assign all error", err);
      alert({
        title: "Bulk Assignment Failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to assign value to all rows.",
        variant: "danger",
      });
    }
  };

  // Save Volunteers
  const handleSaveVolunteers = async (uids: string[]) => {
    if (!token) return;
    try {
      await api.updateMatrixAccess(token, eventId, uids);
      showToastNotice("Volunteer permissions updated.");
      loadMatrix();
    } catch (err) {
      console.error("Update volunteers error", err);
      alert({
        title: "Update Failed",
        message: err instanceof Error ? err.message : "Failed to update volunteers.",
        variant: "danger",
      });
    }
  };

  const isAdmin = Boolean(profile?.is_admin || data?.is_admin);
  const isPublic = Boolean(data?.matrix_is_public);
  const isPinned = Boolean(data?.matrix_is_pinned);
  const canEdit = Boolean(data?.has_edit_access) && matrixTab !== "public_view";

  // Toggle Public Matrix Visibility
  const handleTogglePublic = async () => {
    if (!token || !data || !isAdmin) return;
    const nextVal = !data.matrix_is_public;
    try {
      await api.updateMatrixSettings(token, eventId, { matrix_is_public: nextVal });
      setData((prev) => (prev ? { ...prev, matrix_is_public: nextVal } : prev));
      showToastNotice(
        nextVal
          ? "Matrix is now Public to club members."
          : "Matrix is now Private."
      );
    } catch (err) {
      console.error("Toggle public error", err);
      alert({
        title: "Settings Error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to toggle public visibility.",
        variant: "danger",
      });
    }
  };

  // Toggle Pinned Matrix
  const handleTogglePin = async () => {
    if (!token || !data || !isAdmin) return;
    const nextVal = !data.matrix_is_pinned;
    try {
      await api.updateMatrixSettings(token, eventId, { matrix_is_pinned: nextVal });
      setData((prev) => (prev ? { ...prev, matrix_is_pinned: nextVal } : prev));
      showToastNotice(nextVal ? "Matrix pinned." : "Matrix unpinned.");
    } catch (err) {
      console.error("Toggle pin error", err);
      alert({
        title: "Settings Error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to toggle pinned status.",
        variant: "danger",
      });
    }
  };

  // Available tracks extracted from col_event_track cells
  const availableTracks = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const row of data.rows) {
      const val = row.cells["col_event_track"];
      if (typeof val === "string" && val.trim()) {
        set.add(val.trim());
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Comprehensive Exports
  const handleExportCsv = async (checkedInOnly = false) => {
    if (!token) return;
    setExportLoading(true);
    setShowExportMenu(false);
    try {
      await api.downloadComprehensiveExportCsv(token, eventId, checkedInOnly);
      showToastNotice(
        checkedInOnly
          ? "Checked-in attendance CSV downloaded."
          : "Comprehensive event CSV downloaded."
      );
    } catch (err) {
      alert({
        title: "Export Failed",
        message: err instanceof Error ? err.message : "Failed to download CSV export.",
        variant: "danger",
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportJson = async () => {
    if (!token) return;
    setExportLoading(true);
    setShowExportMenu(false);
    try {
      const jsonData = await api.getComprehensiveExportJson(token, eventId);
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-${eventId}-comprehensive.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToastNotice("Comprehensive event JSON downloaded.");
    } catch (err) {
      alert({
        title: "Export Failed",
        message: err instanceof Error ? err.message : "Failed to export JSON.",
        variant: "danger",
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((row) => {
      // 1. Attendance Status Filter
      const currentAttendance =
        stagedAttendance.get(row.user_id) ?? row.attendance;
      if (
        statusFilter !== "all" &&
        currentAttendance.toLowerCase() !== statusFilter
      ) {
        return false;
      }

      // 2. Solo vs Team Mode Filter
      if (teamFilter === "team" && !row.team_name) {
        return false;
      }
      if (teamFilter === "solo" && row.team_name) {
        return false;
      }

      // 3. Track Filter
      if (trackFilter !== "all") {
        const rowTrack = row.cells["col_event_track"];
        if (rowTrack !== trackFilter) {
          return false;
        }
      }

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = row.user_name.toLowerCase().includes(q);
        const matchEmail = (row.email || "").toLowerCase().includes(q);
        const matchTeam = (row.team_name || "").toLowerCase().includes(q);
        const matchYear =
          row.batch_year != null && String(row.batch_year).includes(q);

        // Search dynamic cells
        let matchCell = false;
        for (const [colId, val] of Object.entries(row.cells)) {
          const effectiveVal =
            stagedCells.get(`${row.user_id}:${colId}`) !== undefined
              ? stagedCells.get(`${row.user_id}:${colId}`)
              : val;

          if (effectiveVal != null) {
            if (
              typeof effectiveVal === "string" ||
              typeof effectiveVal === "number"
            ) {
              if (String(effectiveVal).toLowerCase().includes(q)) {
                matchCell = true;
                break;
              }
            } else if (typeof effectiveVal === "object") {
              const obj = effectiveVal as MatrixObjectPayload;
              if (
                obj.schema_type === "role_assignment" &&
                (obj.role_title.toLowerCase().includes(q) ||
                  (obj.team_name || "").toLowerCase().includes(q))
              ) {
                matchCell = true;
                break;
              }
              if (
                obj.schema_type === "feedback" &&
                (obj.notes || "").toLowerCase().includes(q)
              ) {
                matchCell = true;
                break;
              }
              if (
                obj.schema_type === "contribution_assignment" &&
                ((obj.title || "").toLowerCase().includes(q) ||
                  (obj.description || "").toLowerCase().includes(q) ||
                  obj.category.toLowerCase().includes(q))
              ) {
                matchCell = true;
                break;
              }
            }
          }
        }
        return matchName || matchEmail || matchTeam || matchYear || matchCell;
      }
      return true;
    });
  }, [data, statusFilter, teamFilter, trackFilter, search, stagedAttendance, stagedCells]);

  // Attendance stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, checkedIn: 0, pct: 0 };
    const total = data.rows.length;
    const checkedIn = data.rows.filter((r) => {
      const eff = stagedAttendance.get(r.user_id) ?? r.attendance;
      return eff === "checked_in";
    }).length;
    const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
    return { total, checkedIn, pct };
  }, [data, stagedAttendance]);

  const totalUnsaved = stagedCells.size + stagedAttendance.size;

  if (loading && !data) {
    return (
      <main className={styles.pageContainer}>
        <LoadingBar loading={true} />
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#a1a1aa" }}>
          Loading Event Matrix...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.backRow}>
          <Link href={`/dashboard/events/${eventId}`} className={styles.backBtn}>
            ← Back to Event
          </Link>
        </div>
        <div className={styles.errorCard} role="alert">
          <MemberIcon name="alert-circle" size={40} />
          <h2 className={styles.errorTitle}>Access Restricted or Not Found</h2>
          <p style={{ margin: 0, color: "#a1a1aa", maxWidth: "480px", fontSize: "14px", lineHeight: "1.5" }}>
            {error || "You do not have permission to view or manage this event matrix."}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/dashboard/events/${eventId}`)}
            className={styles.actionBtn}
            style={{ marginTop: "10px" }}
          >
            Return to Event Page
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.pageContainer}>
      <LoadingBar loading={loading} />

      {/* In-app Confirm / Alert Modal Dialog */}
      {DialogComponent}

      {/* Sleek Success Toast */}
      {toastMessage && (
        <div className={styles.toastNotice}>
          <MemberIcon name="check" size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Row */}
      <div className={styles.backRow}>
        <Link href={`/dashboard/events/${eventId}`} className={styles.backBtn}>
          ← Back to Event Overview
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleTogglePublic}
                className={`${styles.toggleBtn} ${
                  isPublic ? styles.toggleBtnActivePublic : ""
                }`}
                title="Toggle public visibility of the matrix"
              >
                <MemberIcon name="eye" size={13} />
                {isPublic ? "Public: Active" : "Private Matrix"}
              </button>

              <button
                type="button"
                onClick={handleTogglePin}
                className={`${styles.toggleBtn} ${
                  isPinned ? styles.toggleBtnActive : ""
                }`}
                title="Pin matrix for priority access"
              >
                <MemberIcon name="tag" size={13} />
                {isPinned ? "Pinned" : "Pin"}
              </button>
            </>
          )}

          <span className={styles.roleBadge}>
            {isAdmin
              ? "Site Administrator Access"
              : canEdit
              ? "Authorized Volunteer Access"
              : "Public / Member Access"}
          </span>
        </div>
      </div>

      {/* Header Banner & Matrix Control Panel */}
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <div className={styles.matrixTitleRow}>
              <h1 className={styles.matrixHeading}>EVENT MATRIX</h1>
              <span className={styles.eventTitleTag}>{data.event_title}</span>
              {isPinned && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#e5b731",
                    background: "rgba(229, 183, 49, 0.12)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  📌 Pinned
                </span>
              )}
            </div>
            <p className={styles.matrixSubtitle}>
              Dynamic operational roster, live attendance roll-call, submission reviews, and custom evaluation records.
            </p>
          </div>

          <div className={styles.headerActions}>
            {/* View Mode Switch */}
            <div className={styles.filterPills}>
              <button
                type="button"
                onClick={() => setMatrixTab("operations")}
                className={`${styles.filterPill} ${
                  matrixTab === "operations" ? styles.filterPillActive : ""
                }`}
              >
                Editor Matrix
              </button>
              <button
                type="button"
                onClick={() => setMatrixTab("public_view")}
                className={`${styles.filterPill} ${
                  matrixTab === "public_view" ? styles.filterPillActive : ""
                }`}
              >
                Public View {isPublic ? "✓" : "(Private)"}
              </button>
            </div>

            {isAdmin && matrixTab === "operations" && (
              <>
                <button
                  type="button"
                  onClick={() => setShowVolunteers(true)}
                  className={styles.actionBtn}
                  title="Grant matrix edit permissions to volunteers"
                >
                  <MemberIcon name="users" size={14} />
                  Manage Volunteers ({data.volunteer_uids.length})
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddColumn(true)}
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                >
                  <MemberIcon name="plus" size={14} />
                  Add Column
                </button>
              </>
            )}

            {/* Comprehensive Export Dropdown */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={exportLoading}
                className={styles.actionBtn}
                title="Export comprehensive event & matrix records"
              >
                <MemberIcon name="articles" size={14} />
                {exportLoading ? "Exporting..." : "Export Data ▾"}
              </button>

              {showExportMenu && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "#18181c",
                    border: "1px solid #31343a",
                    borderRadius: "8px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    zIndex: 50,
                    minWidth: "205px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleExportCsv(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#f4f4f5",
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#24242a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span>📊</span>
                    <span>Comprehensive CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv(true)}
                    style={{
                      background: "none",
                      border: "none",
                      borderTop: "1px solid #282830",
                      color: "#f4f4f5",
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#24242a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span>✅</span>
                    <span>Checked-In Only CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    style={{
                      background: "none",
                      border: "none",
                      borderTop: "1px solid #282830",
                      color: "#f4f4f5",
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#24242a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span>📦</span>
                    <span>Raw JSON Export</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={loadMatrix}
              className={styles.actionBtn}
              title="Refresh matrix data"
            >
              <MemberIcon name="lightning" size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className={styles.filterBar}>
          <div className={styles.filterPills}>
            {[
              { id: "all", label: `All Attendees (${stats.total})` },
              { id: "checked_in", label: `Checked In (${stats.checkedIn} - ${stats.pct}%)` },
              { id: "registered", label: "Registered" },
              { id: "waitlisted", label: "Waitlisted" },
              { id: "absent", label: "Absent" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`${styles.filterPill} ${
                  statusFilter === tab.id ? styles.filterPillActive : ""
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Team mode filter */}
            <div className={styles.filterPills}>
              {[
                { id: "all", label: "All Members" },
                { id: "team", label: "Team Only" },
                { id: "solo", label: "Solo Only" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeamFilter(t.id as "all" | "team" | "solo")}
                  className={`${styles.filterPill} ${
                    teamFilter === t.id ? styles.filterPillActive : ""
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Track filter (if tracks are present) */}
            {availableTracks.length > 0 && (
              <div className={styles.filterPills}>
                <button
                  type="button"
                  onClick={() => setTrackFilter("all")}
                  className={`${styles.filterPill} ${
                    trackFilter === "all" ? styles.filterPillActive : ""
                  }`}
                >
                  All Tracks
                </button>
                {availableTracks.map((tr) => (
                  <button
                    key={tr}
                    type="button"
                    onClick={() => setTrackFilter(tr)}
                    className={`${styles.filterPill} ${
                      trackFilter === tr ? styles.filterPillActive : ""
                    }`}
                  >
                    Track: {tr}
                  </button>
                ))}
              </div>
            )}

            {/* Search Box */}
            <div className={styles.searchBox}>
              <MemberIcon name="search" size={14} />
              <input
                type="search"
                placeholder="Search member, email, team, cell values..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Matrix Workspace (Table + Persistent Sidebar) */}
      <div className={styles.matrixWorkspace}>
        <div className={styles.matrixTableSection}>
          <EventMatrixTable
            columns={data.columns}
            rows={filteredRows}
            isAdmin={isAdmin}
            canEdit={canEdit}
            stagedCells={stagedCells}
            stagedAttendance={stagedAttendance}
            activeCellTarget={activeCellTarget}
            onUpdateAttendance={handleStageAttendance}
            onUpdateCell={handleStageCell}
            onDeleteColumn={handleDeleteColumn}
            onAssignAll={handleAssignAll}
            onOpenDrawer={(target) => setActiveCellTarget(target)}
          />
        </div>

        {/* Persistent Right Sidebar (Always visible on PC for instant access, no blur) */}
        <MatrixCellSidebar
          target={activeCellTarget}
          canEdit={canEdit}
          stats={stats}
          columnsCount={data.columns.length}
          eventSpgs={data.event_spgs || []}
          approvedIdeas={data.approved_ideas || []}
          onSaveCell={handleStageCell}
          onSaveAttendance={handleStageAttendance}
          onDeselect={() => setActiveCellTarget(null)}
        />
      </div>

      {/* Sticky Save Changes Bar */}
      {totalUnsaved > 0 && matrixTab === "operations" && (
        <aside className={styles.stickySaveBar} role="status">
          <div className={styles.stickySaveInfo}>
            <span className={styles.unsavedDot} />
            <span>
              You have <strong>{totalUnsaved}</strong> unsaved matrix change
              {totalUnsaved > 1 ? "s" : ""}.
            </span>
          </div>

          <div className={styles.stickySaveActions}>
            <button
              type="button"
              onClick={handleDiscardChanges}
              disabled={savingBatch}
              className={styles.discardBtn}
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={savingBatch}
              className={styles.saveChangesBtn}
            >
              <MemberIcon name="check" size={14} />
              {savingBatch ? "Saving Changes..." : "Save Matrix Changes"}
            </button>
          </div>
        </aside>
      )}

      {/* Add Column Modal (Admins only) */}
      {isAdmin && (
        <AddColumnModal
          isOpen={showAddColumn}
          onClose={() => setShowAddColumn(false)}
          onAdd={handleAddColumn}
        />
      )}

      {/* Manage Volunteers Modal (Admins only) */}
      {isAdmin && token && (
        <ManageVolunteersModal
          isOpen={showVolunteers}
          onClose={() => setShowVolunteers(false)}
          token={token}
          volunteerUids={data.volunteer_uids}
          volunteerProfiles={data.volunteer_profiles}
          onSaveVolunteers={handleSaveVolunteers}
        />
      )}
    </main>
  );
}
