"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api, type IdeaSummary } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import { useDebounce } from "@/lib/useDebounce";
import MemberIcon from "@/components/dashboard/MemberIcon";
import ArticleMarkdown from "@/components/dashboard/ArticleMarkdown";
import LoadingBar from "@/components/dashboard/LoadingBar";
import PaginationBar from "@/components/dashboard/PaginationBar";
import { appCache } from "@/lib/cache";
import {
  IdeaAuthorRow,
  formatIdeaDate,
  getTrackBadgeClass,
} from "../IdeaJarClient";
import styles from "../IdeaJar.module.css";

const TRACK_OPTIONS = [
  { id: "all", label: "All Tracks" },
  { id: "product", label: "Product" },
  { id: "research", label: "Research" },
  { id: "kaggle", label: "Kaggle" },
  { id: "misc", label: "General" },
] as const;

export default function AllIdeasClient() {
  const { token } = useMember();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialDifficultyParam = (searchParams.get("difficulty") || "all").toLowerCase();
  const validDifficulty = ["all", "beginner", "intermediate", "advanced"].includes(initialDifficultyParam)
    ? initialDifficultyParam
    : "all";

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(validDifficulty);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);

  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("upvotes");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Sync state if difficulty query param changes in URL (e.g. back/forward navigation)
  useEffect(() => {
    const diff = (searchParams.get("difficulty") || "all").toLowerCase();
    if (["all", "beginner", "intermediate", "advanced"].includes(diff) && diff !== selectedDifficulty) {
      setSelectedDifficulty(diff);
      setPage(1);
    }
  }, [searchParams]);

  // Update query param when user changes difficulty dropdown
  const handleDifficultyChange = (newDiff: string) => {
    setSelectedDifficulty(newDiff);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (newDiff === "all") {
      params.delete("difficulty");
    } else {
      params.set("difficulty", newDiff);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const queryParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (debouncedSearch.trim()) queryParams.set("search", debouncedSearch.trim());
  if (selectedTrack && selectedTrack !== "all") queryParams.set("track", selectedTrack);
  if (selectedDifficulty && selectedDifficulty !== "all") queryParams.set("difficulty", selectedDifficulty);
  if (sortBy) queryParams.set("sort_by", sortBy);
  const cacheKey = `ideas:list:${queryParams.toString()}`;

  const cachedResult = appCache.get<{ items: IdeaSummary[]; has_more: boolean; total: number }>(cacheKey);

  const [ideas, setIdeas] = useState<IdeaSummary[]>(() => cachedResult?.data?.items || []);
  const [total, setTotal] = useState(() => cachedResult?.data?.total ?? cachedResult?.data?.items?.length ?? 0);
  const [loading, setLoading] = useState(() => !cachedResult?.data);
  const [error, setError] = useState("");

  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);

  const prevFilterRef = useRef({ debouncedSearch, selectedTrack, selectedDifficulty, sortBy });

  // Fetch ideas when filters or pagination change
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
        return;
      }
    }

    let active = true;
    const isCached = appCache.has(cacheKey);
    if (!isCached) setLoading(true);
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
        if (ideas.length === 0) {
          setError(err instanceof Error ? err.message : "Ideas could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, selectedTrack, selectedDifficulty, sortBy, page, pageSize, cacheKey]);

  // Handle upvoting
  const handleVote = async (ideaId: string) => {
    if (votingId === ideaId || !token) return;
    setVotingId(ideaId);

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

  const getDifficultyTitle = () => {
    switch (selectedDifficulty) {
      case "beginner":
        return "BEGINNER JAR — ALL PROPOSALS";
      case "intermediate":
        return "INTERMEDIATE JAR — ALL PROPOSALS";
      case "advanced":
        return "ADVANCED JAR — ALL PROPOSALS";
      default:
        return "ALL COMMUNITY PROPOSALS";
    }
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedTrack("all");
    handleDifficultyChange("all");
    setSortBy("upvotes");
    setPage(1);
  };

  return (
    <div className={styles.pageContainer}>
      {/* Back to Jars navigation */}
      <Link href="/dashboard/ideas" className={styles.backLink}>
        ← Back to Idea Jars
      </Link>

      {/* Header Section */}
      <section className={styles.headerRow} aria-label="All Ideas Header">
        <div className={styles.titleGroup}>
          <span className={styles.badgePill}>
            <MemberIcon name="ideas" size={13} />
            Proposal Explorer
          </span>
          <h1 className={styles.pageTitle}>{getDifficultyTitle()}</h1>
          <p className={styles.pageSubtitle}>
            Browse, search, and upvote community project proposals. Filter by difficulty or track,
            or sort by popularity and submission date.
          </p>
        </div>

        <div className={styles.headerActions}>
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
            onChange={(e) => handleDifficultyChange(e.target.value)}
            className={styles.dropdownSelect}
            aria-label="Filter by difficulty"
          >
            <option value="all">All Difficulties</option>
            <option value="beginner">Beginner Jar</option>
            <option value="intermediate">Intermediate Jar</option>
            <option value="advanced">Advanced Jar</option>
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
              ? "No ideas match your current filter criteria. Try resetting or broadening your search."
              : "No community ideas have been published yet. Be the first to spark a project initiative!"}
          </p>
          <div className={styles.emptyCta} style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            {(searchQuery || selectedTrack !== "all" || selectedDifficulty !== "all") && (
              <button
                type="button"
                onClick={clearAllFilters}
                className={styles.drawBtn}
              >
                Reset all filters
              </button>
            )}
            <Link href="/dashboard/tickets?category=idea_jar" className={styles.submitBtn}>
              <MemberIcon name="plus" size={14} />
              <span>Propose an Idea</span>
            </Link>
          </div>
        </div>
      )}

      {/* Ideas Grid */}
      {ideas.length > 0 && (
        <div className={styles.ideasGrid} aria-label="All Ideas Grid">
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
                    {idea.is_featured && (
                      <span className={styles.difficultyTag} style={{ borderColor: "#eab308", color: "#facc15" }}>
                        ★ Featured
                      </span>
                    )}
                  </div>
                  {formattedDate && <span className={styles.dateTag}>{formattedDate}</span>}
                </div>

                <Link
                  href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                  className={styles.ideaTitleLink}
                >
                  <h3 className={styles.ideaTitle}>{idea.title}</h3>
                </Link>

                <IdeaAuthorRow idea={idea} />
                <div className={styles.ideaDescription}>
                  <ArticleMarkdown content={idea.description} />
                </div>

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
                    className={styles.viewIdeaBtn}
                    aria-label={`View idea ${idea.title}`}
                  >
                    <span>View</span>
                    <MemberIcon name="chevron-right" size={13} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Dedicated Pagination Bar */}
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

