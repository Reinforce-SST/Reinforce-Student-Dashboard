"use client";

import React, { useState, useEffect, useCallback } from "react";
import MemberIcon from "./MemberIcon";
import { api, type IdeaSummary } from "@/lib/api";
import styles from "./AttachProblemModal.module.css";

interface AttachProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  currentIdeaId?: string | null;
  onSelectIdea: (ideaId: string | null) => Promise<void> | void;
  title?: string;
}

const TRACKS = [
  { id: "all", label: "All Tracks" },
  { id: "research", label: "Research" },
  { id: "systems", label: "Systems" },
  { id: "web", label: "Web / Fullstack" },
  { id: "app", label: "Mobile / App" },
  { id: "ai", label: "AI / ML" },
  { id: "design", label: "Design / UI" },
  { id: "misc", label: "Misc" },
];

const DIFFICULTIES = [
  { id: "all", label: "All Levels" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export default function AttachProblemModal({
  isOpen,
  onClose,
  token,
  currentIdeaId,
  onSelectIdea,
  title = "Select Problem Statement from Idea Jar",
}: AttachProblemModalProps) {
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(currentIdeaId || null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const trackParam = selectedTrack === "all" ? undefined : selectedTrack;
      const diffParam = selectedDifficulty === "all" ? undefined : selectedDifficulty;
      const res = await api.listIdeas(search.trim(), 1, 40, trackParam, diffParam);
      setIdeas(res.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ideas from Idea Jar.");
    } finally {
      setLoading(false);
    }
  }, [token, search, selectedTrack, selectedDifficulty]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIdeaId(currentIdeaId || null);
      void fetchIdeas();
    }
  }, [isOpen, currentIdeaId, fetchIdeas]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSelectIdea(selectedIdeaId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update problem statement.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSelectIdea(null);
      setSelectedIdeaId(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach problem statement.");
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyBadgeStyle = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case "beginner":
        return {
          background: "rgba(52, 211, 153, 0.15)",
          color: "#34d399",
          border: "1px solid rgba(52, 211, 153, 0.3)",
        };
      case "intermediate":
        return {
          background: "rgba(251, 191, 36, 0.15)",
          color: "#fbbf24",
          border: "1px solid rgba(251, 191, 36, 0.3)",
        };
      case "advanced":
        return {
          background: "rgba(239, 68, 68, 0.15)",
          color: "#f87171",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        };
      default:
        return {
          background: "rgba(161, 161, 170, 0.15)",
          color: "#a1a1aa",
          border: "1px solid rgba(161, 161, 170, 0.25)",
        };
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attach-problem-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="attach-problem-title" className={styles.modalTitle}>
            <MemberIcon name="ideas" size={20} />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalCloseBtn}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className={styles.searchBarContainer}>
          <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search problem statements by title, tags, or keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Difficulty Filter Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.74rem", fontWeight: "750", color: "#8c8c98", textTransform: "uppercase", marginRight: "4px" }}>
              Level:
            </span>
            {DIFFICULTIES.map((d) => {
              const isActive = selectedDifficulty === d.id;
              let activeColor = "#e5b731";
              if (d.id === "beginner") activeColor = "#34d399";
              if (d.id === "intermediate") activeColor = "#fbbf24";
              if (d.id === "advanced") activeColor = "#f87171";

              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDifficulty(d.id)}
                  style={{
                    backgroundColor: isActive ? "rgba(255, 255, 255, 0.08)" : "#1c1c21",
                    borderColor: isActive ? activeColor : "#31343a",
                    color: isActive ? activeColor : "#a1a1aa",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: isActive ? "800" : "600",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {/* Track Filter Tabs */}
          <div className={styles.trackTabsRow}>
            {TRACKS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTrack(t.id)}
                className={`${styles.trackTab} ${
                  selectedTrack === t.id ? styles.trackTabActive : ""
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: "10px 24px", color: "#ef4444", fontSize: "0.84rem", background: "rgba(239, 68, 68, 0.1)" }}>
            {error}
          </div>
        )}

        <div className={styles.ideasScrollList}>
          {loading ? (
            <div className={styles.emptyState}>Loading Idea Jar proposals...</div>
          ) : ideas.length === 0 ? (
            <div className={styles.emptyState}>
              No verified problem statements found matching your search and filter criteria.
            </div>
          ) : (
            ideas.map((idea) => {
              const isSelected = selectedIdeaId === idea.id;
              const isCurrentlyAttached = currentIdeaId === idea.id;
              const diffStyle = idea.difficulty ? getDifficultyBadgeStyle(idea.difficulty) : null;

              return (
                <div
                  key={idea.id}
                  onClick={() => setSelectedIdeaId(idea.id)}
                  className={`${styles.ideaItem} ${
                    isSelected ? styles.ideaItemSelected : ""
                  }`}
                >
                  <div className={styles.ideaItemHeader}>
                    <h3 className={styles.ideaTitle}>{idea.title}</h3>
                    <div className={styles.ideaMetaRow}>
                      {isCurrentlyAttached && (
                        <span className={styles.activeAttachedBadge}>✓ Currently Attached</span>
                      )}
                      {idea.difficulty && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: "750",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            textTransform: "capitalize",
                            ...diffStyle,
                          }}
                        >
                          {idea.difficulty}
                        </span>
                      )}
                      <span className={styles.trackBadge}>
                        {idea.track || "GENERAL"}
                      </span>
                      {idea.stats?.upvote_count !== undefined && (
                        <span style={{ fontSize: "0.75rem", color: "#8c8c98" }}>
                          ▲ {idea.stats.upvote_count}
                        </span>
                      )}
                    </div>
                  </div>

                  {idea.description && (
                    <p className={styles.ideaDesc}>{idea.description}</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className={styles.modalFooter}>
          {currentIdeaId ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleDetach}
              className={styles.detachBtn}
            >
              Detach Problem
            </button>
          ) : (
            <div />
          )}

          <div className={styles.footerActions}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !selectedIdeaId}
              className={styles.selectBtn}
            >
              {submitting ? "Saving..." : "Attach to Team"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
