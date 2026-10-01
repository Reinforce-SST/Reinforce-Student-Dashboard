"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api, ApiError, type IdeaDetail, type IdeaSummary } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import { useDebounce } from "@/lib/useDebounce";
import MemberIcon from "@/components/dashboard/MemberIcon";
import LoadingBar from "@/components/dashboard/LoadingBar";
import PaginationBar from "@/components/dashboard/PaginationBar";
import styles from "./IdeaJar.module.css";

const TRACK_OPTIONS = [
  { id: "all", label: "All Tracks" },
  { id: "product", label: "Product" },
  { id: "research", label: "Research" },
  { id: "kaggle", label: "Kaggle" },
  { id: "misc", label: "General" },
] as const;

function formatIdeaDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTrackBadgeClass(track: string): string {
  switch (track.toLowerCase()) {
    case "research":
      return styles.trackResearch;
    case "product":
      return styles.trackProduct;
    case "kaggle":
      return styles.trackKaggle;
    default:
      return styles.trackMisc;
  }
}

export default function IdeaJarClient() {
  const { token } = useMember();

  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);

  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("upvotes");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [pendingIdeas, setPendingIdeas] = useState<IdeaSummary[]>([]);

  // Drawing from the jar: the server picks one approved idea at random.
  const [drawn, setDrawn] = useState<IdeaDetail | null>(null);
  const [drawState, setDrawState] = useState<"idle" | "drawing" | "empty" | "error">("idle");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);

  const prevFilterRef = useRef({ debouncedSearch, selectedTrack, selectedDifficulty, sortBy });

  // Load user's pending ideas for the status banner
  useEffect(() => {
    if (!token) return;
    let active = true;
    api.myIdeas(token)
      .then((res) => {
        if (active && res && res.items) {
          setPendingIdeas(res.items.filter((item) => !item.is_verified));
        }
      })
      .catch(() => {
        if (active) setPendingIdeas([]);
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Fetch verified ideas from backend
  useEffect(() => {
    const prev = prevFilterRef.current;
    const filterChanged =
      prev.debouncedSearch !== debouncedSearch ||
      prev.selectedTrack !== selectedTrack ||
      prev.selectedDifficulty !== selectedDifficulty ||
      prev.sortBy !== sortBy;

    if (filterChanged) {
      prevFilterRef.current = { debouncedSearch, selectedTrack, selectedDifficulty, sortBy };
      if (page !== 1) {
        setPage(1);
        return; // setPage(1) will re-trigger the fetch with page: 1
      }
    }

    let active = true;
    setLoading(true);
    setError("");

    api.listIdeas(
      debouncedSearch,
      page,
      pageSize,
      selectedTrack,
      selectedDifficulty,
      sortBy
    )
      .then((res) => {
        if (!active) return;
        setIdeas(res.items || []);
        setTotal(res.total ?? (res.items || []).length);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Ideas could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, selectedTrack, selectedDifficulty, sortBy, page, pageSize]);

  // Handle upvoting
  const handleVote = async (ideaId: string) => {
    if (votingId === ideaId || !token) return;
    setVotingId(ideaId);

    // Optimistic toggle
    const isCurrentlyVoted = votedIds.has(ideaId);
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyVoted) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });

    setIdeas((prev) =>
      prev.map((idea) => {
        if (idea.id === ideaId) {
          const delta = isCurrentlyVoted ? -1 : 1;
          const currentCount = idea.stats?.upvote_count ?? 0;
          return {
            ...idea,
            stats: {
              ...idea.stats,
              upvote_count: Math.max(0, currentCount + delta),
            },
          };
        }
        return idea;
      })
    );

    try {
      const result = await api.upvoteIdea(token, ideaId);
      setIdeas((prev) =>
        prev.map((idea) =>
          idea.id === ideaId
            ? { ...idea, stats: { ...idea.stats, upvote_count: result.upvote_count } }
            : idea
        )
      );
      if (result.upvoted) {
        setVotedIds((prev) => new Set(prev).add(ideaId));
      } else {
        setVotedIds((prev) => {
          const next = new Set(prev);
          next.delete(ideaId);
          return next;
        });
      }
    } catch {
      // Revert on error
      setVotedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyVoted) next.add(ideaId);
        else next.delete(ideaId);
        return next;
      });
      setIdeas((prev) =>
        prev.map((idea) => {
          if (idea.id === ideaId) {
            const delta = isCurrentlyVoted ? 1 : -1;
            const currentCount = idea.stats?.upvote_count ?? 0;
            return {
              ...idea,
              stats: {
                ...idea.stats,
                upvote_count: Math.max(0, currentCount + delta),
              },
            };
          }
          return idea;
        })
      );
    } finally {
      setVotingId(null);
    }
  };

  async function drawFromJar() {
    setDrawState("drawing");
    try {
      setDrawn(await api.randomIdea(token));
      setDrawState("idle");
    } catch (cause) {
      setDrawn(null);
      // 404 is the server's answer for a jar with no approved ideas.
      setDrawState(cause instanceof ApiError && cause.status === 404 ? "empty" : "error");
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header Section */}
      <section className={styles.headerRow} aria-label="Idea Jar Header">
        <div className={styles.titleGroup}>
          <span className={styles.badgePill}>
            <MemberIcon name="flame" size={13} />
            Community Brainstorm
          </span>
          <h1 className={styles.pageTitle}>IDEA JAR & PROPOSALS</h1>
          <p className={styles.pageSubtitle}>
            Explore and upvote high-impact project concepts, algorithms, and applications proposed by club members.
            Top voted proposals become candidate initiatives for Special Project Groups (SPGs).
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.drawBtn}
            onClick={() => void drawFromJar()}
            disabled={drawState === "drawing"}
          >
            <MemberIcon name="ideas" size={15} />
            <span>{drawState === "drawing" ? "Drawing…" : "Draw from the jar"}</span>
          </button>
          <Link
            href="/dashboard/tickets?category=idea_jar"
            className={styles.submitBtn}
            id="btn-propose-idea"
            aria-label="Submit a new proposal through the ticket dispatch system"
          >
            <MemberIcon name="plus" size={15} />
            <span>Submit an Idea</span>
          </Link>
        </div>
      </section>

      {/* Drawn idea. aria-live so the draw is announced, not just painted. */}
      {(drawn || drawState === "empty" || drawState === "error") && (
        <section className={styles.drawnCard} aria-label="Drawn idea" aria-live="polite">
          {drawn ? (
            <>
              <div className={styles.cardTopMeta}>
                <span className={styles.badgePill}>Drawn from the jar</span>
                {drawn.difficulty && <span className={styles.difficultyTag}>{drawn.difficulty}</span>}
              </div>
              <h2 className={styles.drawnTitle}>{drawn.title}</h2>
              <p className={styles.ideaDescription}>{drawn.description}</p>
              <div className={styles.drawnActions}>
                <Link href={`/dashboard/ideas/${encodeURIComponent(drawn.id)}`} className={styles.submitBtn}>
                  Open this idea →
                </Link>
                <button type="button" className={styles.drawBtn} onClick={() => void drawFromJar()} disabled={drawState === "drawing"}>
                  Draw another
                </button>
              </div>
            </>
          ) : (
            <p role="status" className={styles.ideaDescription}>
              {drawState === "empty"
                ? "The jar is empty — there are no approved ideas to draw yet."
                : "An idea could not be drawn. Try again."}
            </p>
          )}
        </section>
      )}

      {/* Pending User Submissions Notice Tray */}
      {pendingIdeas.length > 0 && (
        <section className={styles.pendingTray} aria-label="Your Pending Ideas">
          <div className={styles.pendingHeader}>
            <div className={styles.pendingTitleGroup}>
              <span className={styles.pendingDot} />
              <div>
                <h3 className={styles.pendingTitle}>Your Pending Proposal Submissions</h3>
                <p className={styles.pendingSubtitle}>
                  {pendingIdeas.length} idea{pendingIdeas.length > 1 ? "s" : ""} currently under review by club leads. Once verified, they will appear in the public jar.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.pendingList}>
            {pendingIdeas.map((idea) => (
              <div key={idea.id} className={styles.pendingChip}>
                <span className={styles.pendingStatusTag}>Pending Review</span>
                <span>{idea.title}</span>
                <span style={{ color: "#6a6a75", fontSize: "0.7rem" }}>({idea.track})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Controls & Filter Bar */}
      <section className={styles.controlsBar} aria-label="Search and Filter Ideas">
        {/* Track Pills */}
        <div className={styles.trackPills} role="tablist" aria-label="Filter by track">
          {TRACK_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={selectedTrack === opt.id}
              onClick={() => setSelectedTrack(opt.id)}
              className={`${styles.trackPillBtn} ${
                selectedTrack === opt.id ? styles.trackPillActive : ""
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search & Dropdowns */}
        <div className={styles.filterRightGroup}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>
              <MemberIcon name="search" size={14} />
            </span>
            <input
              type="search"
              aria-label="Search ideas by title or overview"
              placeholder="Search concepts, tools, models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={styles.clearSearchBtn}
                aria-label="Clear search input"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className={styles.dropdownSelect}
            aria-label="Filter by difficulty"
          >
            <option value="all">All Difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.dropdownSelect}
            aria-label="Sort ideas"
          >
            <option value="upvotes">Most Upvoted</option>
            <option value="newest">Newest First</option>
          </select>
        </div>
      </section>

      {/* Non-blocking top loading bar */}
      <LoadingBar loading={loading} />

      {/* Error Banner */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setPage(1)}
            className={styles.retryBtn}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton Cards Grid */}
      {loading && ideas.length === 0 && (
        <div className={styles.ideasGrid} aria-label="Loading ideas skeleton">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className={styles.skeletonCard}>
              <div className={styles.cardTopMeta}>
                <div className={`${styles.skeletonBadge} ${styles.shimmer}`} />
                <div style={{ width: 60, height: 14 }} className={styles.shimmer} />
              </div>
              <div className={`${styles.skeletonTitle} ${styles.shimmer}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className={`${styles.skeletonDescLine1} ${styles.shimmer}`} />
                <div className={`${styles.skeletonDescLine2} ${styles.shimmer}`} />
                <div className={`${styles.skeletonDescLine3} ${styles.shimmer}`} />
              </div>
              <div className={styles.skeletonFooter}>
                <div className={`${styles.skeletonBtn} ${styles.shimmer}`} />
                <div style={{ width: 80, height: 16 }} className={styles.shimmer} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && ideas.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <MemberIcon name="ideas" size={24} />
          </div>
          <h3 className={styles.emptyTitle}>No proposals found</h3>
          <p className={styles.emptyDesc}>
            {searchQuery || selectedTrack !== "all" || selectedDifficulty !== "all"
              ? "Try adjusting your filters or clearing your search term to see more ideas."
              : "No community ideas have been published yet. Be the first to spark a project initiative!"}
          </p>
          <div className={styles.emptyCta}>
            <Link href="/dashboard/tickets?category=idea_jar" className={styles.submitBtn}>
              <MemberIcon name="plus" size={14} />
              <span>Propose an Idea</span>
            </Link>
          </div>
        </div>
      )}

      {/* Main Ideas Grid */}
      {ideas.length > 0 && (
        <div className={styles.ideasGrid} aria-label="Ideas List">
          {ideas.map((idea) => {
            const isVoted = votedIds.has(idea.id);
            const formattedDate = formatIdeaDate(idea.created_at);
            const trackBadgeClass = getTrackBadgeClass(idea.track);

            return (
              <article key={idea.id} className={styles.ideaCard}>
                <div className={styles.cardTopMeta}>
                  <div className={styles.badgeGroup}>
                    <span className={`${styles.trackTag} ${trackBadgeClass}`}>
                      {idea.track} Track
                    </span>
                    {idea.difficulty && (
                      <span className={styles.difficultyTag}>
                        {idea.difficulty}
                      </span>
                    )}
                  </div>
                  {formattedDate && <span className={styles.dateTag}>{formattedDate}</span>}
                </div>

                <Link
                  href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                  className={styles.ideaTitleLink}
                >
                  <h2 className={styles.ideaTitle}>{idea.title}</h2>
                </Link>

                <p className={styles.ideaDescription}>{idea.description}</p>

                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    onClick={() => void handleVote(idea.id)}
                    className={`${styles.voteBtn} ${isVoted ? styles.voteBtnActive : ""}`}
                    aria-label={`Upvote ${idea.title}. Current score: ${idea.stats?.upvote_count ?? 0}`}
                    disabled={votingId === idea.id}
                  >
                    <span className={styles.voteIcon}>▲</span>
                    <span>{idea.stats?.upvote_count ?? 0}</span>
                  </button>

                  <Link
                    href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                    className={styles.exploreLink}
                  >
                    <span>Read Proposal</span>
                    <MemberIcon name="chevron-right" size={14} />
                  </Link>
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
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          pageSizeOptions={[12, 24, 48]}
          itemLabel="ideas"
          disabled={loading}
        />
      )}
    </div>
  );
}
