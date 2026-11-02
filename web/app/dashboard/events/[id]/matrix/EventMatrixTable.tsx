"use client";

import React, { useState, useMemo } from "react";
import type {
  MatrixColumnDef,
  MatrixRowHydrated,
  MatrixObjectPayload,
} from "@/types/event-matrix";
import MemberIcon from "@/components/dashboard/MemberIcon";
import TextCellEditor from "./TextCellEditor";
import ObjectCellEditor from "./ObjectCellEditor";
import AssignAllModal from "./AssignAllModal";
import styles from "./EventMatrix.module.css";

interface EventMatrixTableProps {
  columns: MatrixColumnDef[];
  rows: MatrixRowHydrated[];
  isAdmin: boolean;
  canEdit: boolean;
  stagedCells?: Map<string, string | number | MatrixObjectPayload | null>;
  stagedAttendance?: Map<string, string>;
  activeCellTarget?: {
    row: MatrixRowHydrated;
    column?: MatrixColumnDef | null;
    value: string | number | MatrixObjectPayload | null;
  } | null;
  onUpdateAttendance: (userId: string, newStatus: string) => void | Promise<void>;
  onUpdateCell: (
    userId: string,
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => void | Promise<void>;
  onDeleteColumn: (columnId: string, columnTitle: string) => void | Promise<void>;
  onAssignAll: (
    columnId: string,
    value: string | number | MatrixObjectPayload | null
  ) => Promise<void>;
  onOpenDrawer?: (target: {
    row: MatrixRowHydrated;
    column?: MatrixColumnDef | null;
    value: string | number | MatrixObjectPayload | null;
  }) => void;
}

function compareRows(
  a: MatrixRowHydrated,
  b: MatrixRowHydrated,
  sortKey: string,
  sortDirection: "asc" | "desc",
  columns: MatrixColumnDef[],
  stagedCells?: Map<string, string | number | MatrixObjectPayload | null>,
  stagedAttendance?: Map<string, string>
): number {
  const dir = sortDirection === "asc" ? 1 : -1;

  if (sortKey === "member") {
    return dir * a.user_name.localeCompare(b.user_name);
  }

  if (sortKey === "attendance") {
    const stA = stagedAttendance?.get(a.user_id) ?? a.attendance;
    const stB = stagedAttendance?.get(b.user_id) ?? b.attendance;
    return dir * stA.localeCompare(stB);
  }

  const col = columns.find((c) => c.column_id === sortKey);
  if (!col) return 0;

  const keyA = `${a.user_id}:${sortKey}`;
  const keyB = `${b.user_id}:${sortKey}`;
  const rawA = stagedCells?.has(keyA) ? stagedCells.get(keyA) : a.cells[sortKey];
  const rawB = stagedCells?.has(keyB) ? stagedCells.get(keyB) : b.cells[sortKey];

  if (rawA == null && rawB == null) return 0;
  if (rawA == null) return 1;
  if (rawB == null) return -1;

  if (col.column_type === "number") {
    const numA = typeof rawA === "number" ? rawA : parseFloat(String(rawA));
    const numB = typeof rawB === "number" ? rawB : parseFloat(String(rawB));
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return dir * (numA - numB);
  }

  if (col.column_type === "text") {
    return dir * String(rawA).localeCompare(String(rawB));
  }

  if (typeof rawA === "object" && typeof rawB === "object") {
    const objA = rawA as MatrixObjectPayload;
    const objB = rawB as MatrixObjectPayload;

    if (objA.schema_type === "feedback" && objB.schema_type === "feedback") {
      return dir * (objA.rating - objB.rating);
    }
    if (objA.schema_type === "submission" && objB.schema_type === "submission") {
      const sA = objA.score ?? -1;
      const sB = objB.score ?? -1;
      return dir * (sA - sB);
    }
    if (objA.schema_type === "role_assignment" && objB.schema_type === "role_assignment") {
      return dir * objA.role_title.localeCompare(objB.role_title);
    }
    if (objA.schema_type === "contribution_assignment" && objB.schema_type === "contribution_assignment") {
      return dir * (objA.points - objB.points);
    }
  }

  return 0;
}

export default function EventMatrixTable({
  columns,
  rows,
  isAdmin,
  canEdit,
  stagedCells,
  stagedAttendance,
  activeCellTarget,
  onUpdateAttendance,
  onUpdateCell,
  onDeleteColumn,
  onAssignAll,
  onOpenDrawer,
}: EventMatrixTableProps) {
  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  // Assign All Modal state
  const [assignAllCol, setAssignAllCol] = useState<MatrixColumnDef | null>(null);

  const handleHeaderClick = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDirection) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) =>
      compareRows(a, b, sortKey, sortDirection, columns, stagedCells, stagedAttendance)
    );
    return sorted;
  }, [rows, sortKey, sortDirection, columns, stagedCells, stagedAttendance]);

  const getAttendanceClass = (st: string) => {
    switch (st.toLowerCase()) {
      case "checked_in":
        return styles.attendanceCheckedIn;
      case "registered":
        return styles.attendanceRegistered;
      case "waitlisted":
        return styles.attendanceWaitlisted;
      case "absent":
        return styles.attendanceAbsent;
      case "excused":
        return styles.attendanceExcused;
      case "disqualified":
        return styles.attendanceDisqualified;
      default:
        return "";
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "M";
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  };

  const renderSortIndicator = (key: string) => {
    if (sortKey !== key) return null;
    return (
      <span className={styles.sortIndicator}>
        {sortDirection === "asc" ? " ▲" : " ▼"}
      </span>
    );
  };

  return (
    <div className={styles.matrixTableCard}>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              {/* Sticky Column 1: Member Name / Email */}
              <th
                className={`${styles.th} ${styles.thStickyMember} ${styles.thSortable}`}
                onClick={() => handleHeaderClick("member")}
                title="Click to sort by attendee name"
              >
                <div className={styles.columnHeaderContent}>
                  <span>Attendee / Member {renderSortIndicator("member")}</span>
                </div>
              </th>

              {/* Sticky Column 2: Core Attendance Status */}
              <th
                className={`${styles.th} ${styles.thStickyAttendance} ${styles.thSortable}`}
                onClick={() => handleHeaderClick("attendance")}
                title="Click to sort by attendance status"
              >
                <div className={styles.columnHeaderContent}>
                  <span>Attendance Status {renderSortIndicator("attendance")}</span>
                </div>
              </th>

              {/* Dynamic Columns */}
              {columns.map((col) => (
                <th key={col.column_id} className={styles.th}>
                  <div className={styles.columnHeaderContent}>
                    <div
                      className={`${styles.columnHeaderLeft} ${styles.thSortable}`}
                      onClick={() => handleHeaderClick(col.column_id)}
                      title={`Click to sort by ${col.title}`}
                    >
                      <span className={styles.colHeaderTitle}>
                        {col.title}
                        {renderSortIndicator(col.column_id)}
                      </span>
                      <span
                        className={`${styles.colTypeBadge} ${
                          col.column_type === "object"
                            ? styles.colTypeBadgeObj
                            : col.column_type === "number"
                            ? styles.colTypeBadgeNum
                            : ""
                        }`}
                      >
                        {col.column_type === "object"
                          ? `OBJ: ${col.object_schema_type || "GEN"}`
                          : col.column_type === "number"
                          ? "NUM"
                          : "TXT"}
                      </span>
                    </div>

                    <div className={styles.colHeaderActions}>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignAllCol(col);
                          }}
                          className={styles.colHeaderActionBtn}
                          title={`Assign a value to all attendees for "${col.title}"`}
                        >
                          <MemberIcon name="edit" size={13} />
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteColumn(col.column_id, col.title);
                          }}
                          className={styles.deleteColBtn}
                          title={`Delete column "${col.title}"`}
                        >
                          <MemberIcon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + columns.length}
                  className={styles.emptyState}
                >
                  No attendees or registrations found matching the current criteria.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const currentAttendance =
                  stagedAttendance?.get(row.user_id) ?? row.attendance;
                const isAttendanceUnsaved = stagedAttendance?.has(row.user_id);

                return (
                  <tr key={row.user_id} className={styles.tr}>
                    {/* Sticky Column 1 */}
                    <td className={`${styles.td} ${styles.tdStickyMember}`}>
                      <div className={styles.memberCell}>
                        <div className={styles.avatar}>
                          {row.avatar_url ? (
                            <img
                              src={row.avatar_url}
                              alt={row.user_name}
                              className={styles.avatarImg}
                            />
                          ) : (
                            getInitials(row.user_name)
                          )}
                        </div>
                        <div className={styles.memberMeta}>
                          <span className={styles.memberName} title={row.user_name}>
                            {row.user_name}
                          </span>
                          <span className={styles.memberEmail} title={row.email}>
                            {row.email || "No email"}
                          </span>
                          {row.team_name && (
                            <span className={styles.teamBadge} title={`Team: ${row.team_name}`}>
                              {row.team_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Sticky Column 2 */}
                    {(() => {
                      const isAttendanceActive =
                        activeCellTarget?.row.user_id === row.user_id &&
                        !activeCellTarget?.column;

                      return (
                        <td
                          className={`${styles.td} ${styles.tdStickyAttendance} ${
                            isAttendanceActive ? styles.cellSelected : ""
                          }`}
                          onClick={() => {
                            if (canEdit && onOpenDrawer) {
                              onOpenDrawer({
                                row,
                                column: null,
                                value: currentAttendance,
                              });
                            }
                          }}
                        >
                          <div className={styles.attendanceWrapper}>
                            <select
                              className={`${styles.attendanceSelect} ${getAttendanceClass(
                                currentAttendance
                              )} ${isAttendanceUnsaved ? styles.attendanceUnsaved : ""}`}
                              value={currentAttendance}
                              disabled={!canEdit}
                              onChange={(e) => onUpdateAttendance(row.user_id, e.target.value)}
                            >
                              <option value="checked_in">✓ Checked In</option>
                              <option value="registered">Registered</option>
                              <option value="waitlisted">Waitlisted</option>
                              <option value="absent">Absent</option>
                              <option value="excused">Excused</option>
                              <option value="disqualified">Disqualified</option>
                            </select>
                            {isAttendanceUnsaved && (
                              <span
                                className={styles.unsavedDot}
                                style={{ position: "relative", marginLeft: "4px" }}
                                title="Unsaved attendance change"
                              />
                            )}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Dynamic Columns */}
                    {columns.map((col) => {
                      const cellKey = `${row.user_id}:${col.column_id}`;
                      const isCellUnsaved = stagedCells?.has(cellKey);
                      const rawVal = isCellUnsaved
                        ? stagedCells!.get(cellKey)
                        : row.cells[col.column_id];

                      const isCellActive =
                        activeCellTarget?.row.user_id === row.user_id &&
                        activeCellTarget?.column?.column_id === col.column_id;

                      const handleCellClick = () => {
                        if (canEdit && onOpenDrawer) {
                          onOpenDrawer({
                            row,
                            column: col,
                            value: rawVal ?? null,
                          });
                        }
                      };

                      return (
                        <td
                          key={col.column_id}
                          className={`${styles.td} ${isCellActive ? styles.cellSelected : ""}`}
                          onClick={handleCellClick}
                          style={{ cursor: canEdit ? "pointer" : "default" }}
                          title={canEdit ? "Click to inspect / edit in sidebar" : undefined}
                        >
                          {col.column_type === "text" || col.column_type === "number" ? (
                            <TextCellEditor
                              value={
                                typeof rawVal === "string" || typeof rawVal === "number"
                                  ? rawVal
                                  : null
                              }
                              columnType={col.column_type}
                              canEdit={canEdit}
                              isUnsaved={isCellUnsaved}
                              onClick={handleCellClick}
                            />
                          ) : (
                            <ObjectCellEditor
                              schemaType={col.object_schema_type}
                              value={
                                rawVal && typeof rawVal === "object"
                                  ? (rawVal as MatrixObjectPayload)
                                  : null
                              }
                              canEdit={canEdit}
                              isUnsaved={isCellUnsaved}
                              onClick={handleCellClick}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Assign All Modal */}
      {assignAllCol && (
        <AssignAllModal
          isOpen={Boolean(assignAllCol)}
          column={assignAllCol}
          onClose={() => setAssignAllCol(null)}
          onAssignAll={onAssignAll}
        />
      )}
    </div>
  );
}
