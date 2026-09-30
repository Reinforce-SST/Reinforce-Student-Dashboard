"use client";

import styles from "./PaginationBar.module.css";

export interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  disabled?: boolean;
  className?: string;
}

function getVisiblePages(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function PaginationBar({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50],
  itemLabel = "items",
  disabled = false,
  className = "",
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (totalItems <= 0) return null;

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <nav
      className={`${styles.paginationContainer} ${className}`}
      aria-label="Pagination Navigation"
    >
      {/* Information text */}
      <div className={styles.infoSection}>
        <span>
          Showing{" "}
          <span className={styles.infoHighlight}>
            {startItem}–{endItem}
          </span>{" "}
          of <span className={styles.infoHighlight}>{totalItems}</span> {itemLabel}
        </span>

        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={styles.pageSizeSelect}
            aria-label={`${itemLabel} per page`}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / page
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Navigation Buttons and Numbers */}
      <div className={styles.controlsSection}>
        <button
          type="button"
          disabled={currentPage <= 1 || disabled}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className={styles.navButton}
          aria-label="Go to previous page"
        >
          ← Prev
        </button>

        <div className={styles.pageList} role="list">
          {visiblePages.map((page, idx) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${idx}`} className={styles.ellipsis}>
                  …
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                disabled={disabled}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onPageChange(page)}
                className={`${styles.pageButton} ${isActive ? styles.pageButtonActive : ""}`}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages || disabled}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className={styles.navButton}
          aria-label="Go to next page"
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
