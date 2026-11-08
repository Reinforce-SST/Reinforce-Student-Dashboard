"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, ApiError, type IdeaDetail, type IdeaSummary } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import ArticleMarkdown from "@/components/dashboard/ArticleMarkdown";
import LoadingBar from "@/components/dashboard/LoadingBar";
import { appCache } from "@/lib/cache";
import styles from "./IdeaJar.module.css";

export function IdeaAuthorRow({ idea }: { idea: IdeaSummary | IdeaDetail }) {
  const profile = idea.creator_profile;
  const name = profile?.full_name || profile?.display_name || "Club Member";
  const avatar = profile?.avatar_url;
  const initial = (name || "M").charAt(0).toUpperCase();

  return (
    <div className={styles.authorRow}>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className={styles.authorAvatar}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "inline-flex";
          }}
        />
      ) : null}
      <span
        className={styles.authorAvatarFallback}
        style={{ display: avatar ? "none" : "inline-flex" }}
      >
        {initial}
      </span>
      <div className={styles.authorMeta}>
        <span className={styles.authorLabel}>Suggested by</span>
        <span className={styles.authorName}>{name}</span>
      </div>
    </div>
  );
}

export function formatIdeaDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getTrackBadgeClass(track: string): string {
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

  const [beginnerIdeas, setBeginnerIdeas] = useState<IdeaSummary[]>([]);
  const [beginnerTotal, setBeginnerTotal] = useState(0);

  const [intermediateIdeas, setIntermediateIdeas] = useState<IdeaSummary[]>([]);
  const [intermediateTotal, setIntermediateTotal] = useState(0);

  const [advancedIdeas, setAdvancedIdeas] = useState<IdeaSummary[]>([]);
  const [advancedTotal, setAdvancedTotal] = useState(0);

  const [featuredIdeas, setFeaturedIdeas] = useState<IdeaSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cachedPending = appCache.get<{ items: IdeaSummary[] }>("ideas:my");
  const [pendingIdeas, setPendingIdeas] = useState<IdeaSummary[]>(() =>
    cachedPending?.data?.items ? cachedPending.data.items.filter((item) => !item.is_verified) : []
  );

  // Drawing from the jar: the server picks one approved idea at random.
  const [drawn, setDrawn] = useState<IdeaDetail | null>(null);
  const [drawState, setDrawState] = useState<"idle" | "drawing" | "empty" | "error">("idle");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);

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

  // Fetch verified ideas from backend: exactly max 3 latest for each jar
  const fetchJars = useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      api.listIdeas("", 1, 3, undefined, "beginner", "newest"),
      api.listIdeas("", 1, 3, undefined, "intermediate", "newest"),
      api.listIdeas("", 1, 3, undefined, "advanced", "newest"),
      api.listIdeas("", 1, 6, undefined, undefined, "newest"),
    ])
      .then(([begRes, intRes, advRes, featRes]) => {
        if (!active) return;
        setBeginnerIdeas(begRes.items?.slice(0, 3) || []);
        setBeginnerTotal(begRes.total ?? begRes.items?.length ?? 0);

        setIntermediateIdeas(intRes.items?.slice(0, 3) || []);
        setIntermediateTotal(intRes.total ?? intRes.items?.length ?? 0);

        setAdvancedIdeas(advRes.items?.slice(0, 3) || []);
        setAdvancedTotal(advRes.total ?? advRes.items?.length ?? 0);

        const featured = (featRes.items || []).filter((i) => Boolean(i.is_featured)).slice(0, 3);
        setFeaturedIdeas(featured);
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
  }, []);

  useEffect(() => {
    return fetchJars();
  }, [fetchJars]);

  const updateIdeaScore = (ideaId: string, explicitCount?: number, delta: number = 0) => {
    const applyScore = (list: IdeaSummary[]) =>
      list.map((item) => {
        if (item.id === ideaId) {
          const count = explicitCount !== undefined ? explicitCount : Math.max(0, (item.stats?.upvote_count ?? 0) + delta);
          return {
            ...item,
            stats: { ...item.stats, upvote_count: count },
          };
        }
        return item;
      });

    setBeginnerIdeas(applyScore);
    setIntermediateIdeas(applyScore);
    setAdvancedIdeas(applyScore);
    setFeaturedIdeas(applyScore);
  };

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

    updateIdeaScore(ideaId, undefined, isCurrentlyVoted ? -1 : 1);

    try {
      const result = await api.upvoteIdea(token, ideaId);
      updateIdeaScore(ideaId, result.upvote_count);
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
      updateIdeaScore(ideaId, undefined, isCurrentlyVoted ? 1 : -1);
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

  const hasAnyIdeas =
    featuredIdeas.length > 0 ||
    beginnerIdeas.length > 0 ||
    intermediateIdeas.length > 0 ||
    advancedIdeas.length > 0;

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
            Explore the latest high-impact project concepts proposed by club members.
            Each jar holds top ideas by difficulty. Open any jar to search, filter, and browse all proposals.
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
            href="/dashboard/ideas/all"
            className={styles.browseAllBtn}
            aria-label="Browse and search all proposals"
          >
            <MemberIcon name="sparkles" size={15} />
            <span>Browse All Ideas →</span>
          </Link>
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

      {/* Non-blocking top loading bar */}
      <LoadingBar loading={loading} />

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
              <IdeaAuthorRow idea={drawn} />
              <div className={styles.ideaDescription}>
                <ArticleMarkdown content={drawn.description} />
              </div>
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

      {/* Error Banner */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchJars()}
            className={styles.retryBtn}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton Cards Grid */}
      {loading && !hasAnyIdeas && (
        <div className={styles.ideasGrid} aria-label="Loading ideas skeleton">
          {Array.from({ length: 3 }).map((_, idx) => (
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

      {/* Empty State when no ideas match anywhere */}
      {!loading && !error && !hasAnyIdeas && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <MemberIcon name="ideas" size={24} />
          </div>
          <h3 className={styles.emptyTitle}>No proposals found</h3>
          <p className={styles.emptyDesc}>
            No community ideas have been published yet. Be the first to spark a project initiative!
          </p>
          <div className={styles.emptyCta}>
            <Link href="/dashboard/tickets?category=idea_jar" className={styles.submitBtn}>
              <MemberIcon name="plus" size={14} />
              <span>Propose an Idea</span>
            </Link>
          </div>
        </div>
      )}

      {/* 0. Golden Jar: Featured Proposals (Visible only when featured ideas exist) */}
      {featuredIdeas.length > 0 && (
        <section className={styles.featuredJarRow} aria-label="Featured Proposals Golden Jar">
          <div className={styles.jarGold}>
            <div className={styles.jarLid}>
              <div className={styles.jarHeaderLeft}>
                <div className={styles.jarIconWrap}>
                  <MemberIcon name="sparkles" size={16} />
                </div>
                <div>
                  <h2 className={styles.jarTitle}>Golden Jar — Spotlight Initiatives</h2>
                  <div className={styles.jarSublabel}>Priority Challenges & Lead Endorsements</div>
                </div>
              </div>
              <div className={styles.jarLidRight}>
                <span className={styles.jarCountBadge}>{featuredIdeas.length} Featured</span>
                <Link
                  href="/dashboard/ideas/all"
                  className={styles.openJarLidBtn}
                  title="Browse all ideas"
                >
                  Browse All →
                </Link>
              </div>
            </div>

            <div className={styles.jarGoldCardsHorizontal}>
              {featuredIdeas.map((idea) => {
                const isVoted = votedIds.has(idea.id);
                const formattedDate = formatIdeaDate(idea.created_at);
                const trackBadgeClass = getTrackBadgeClass(idea.track);

                return (
                  <article key={idea.id} className={styles.jarGoldCard}>
                    <div className={styles.cardTopMeta}>
                      <div className={styles.badgeGroup}>
                        <span className={`${styles.trackTag} ${trackBadgeClass}`}>
                          {idea.track} Track
                        </span>
                        <span className={styles.difficultyTag} style={{ borderColor: "#eab308", color: "#facc15" }}>
                          ★ Featured
                        </span>
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
          </div>
        </section>
      )}

      {/* 3 Themed Jars Columns: Green (Beginner), Blue (Intermediate), Purple (Advanced) */}
      <section className={styles.jarsColumnsLayout} aria-label="Difficulty Jars Columns">
        {/* 1. Green Jar: Beginners */}
        <div className={`${styles.jarColumn} ${styles.jarGreen}`}>
          <div className={styles.jarLid}>
            <div className={styles.jarHeaderLeft}>
              <div className={styles.jarIconWrap}>
                <MemberIcon name="ideas" size={16} />
              </div>
              <div>
                <h2 className={styles.jarTitle}>Beginner Jar</h2>
                <div className={styles.jarSublabel}>Fundamental & Guided</div>
              </div>
            </div>
            <div className={styles.jarLidRight}>
              <span className={styles.jarCountBadge}>{beginnerTotal}</span>
              <Link
                href="/dashboard/ideas/all?difficulty=beginner"
                className={styles.openJarLidBtn}
                title="Open Beginner Jar in full view"
              >
                Open Jar →
              </Link>
            </div>
          </div>

          <div className={styles.jarListWrapper}>
            {beginnerIdeas.length === 0 ? (
              <div className={styles.jarEmptyState}>
                <span>No beginner proposals published yet</span>
              </div>
            ) : (
              beginnerIdeas.map((idea) => {
                const isVoted = votedIds.has(idea.id);
                const formattedDate = formatIdeaDate(idea.created_at);
                const trackBadgeClass = getTrackBadgeClass(idea.track);

                return (
                  <article key={idea.id} className={styles.jarIdeaCard}>
                    <div className={styles.cardTopMeta}>
                      <div className={styles.badgeGroup}>
                        <span className={`${styles.trackTag} ${trackBadgeClass}`}>
                          {idea.track} Track
                        </span>
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
              })
            )}
          </div>

          <div className={styles.jarBottomBar}>
            <Link
              href="/dashboard/ideas/all?difficulty=beginner"
              className={styles.viewAllJarLink}
            >
              <span>View all {beginnerTotal} Beginner ideas</span>
              <MemberIcon name="chevron-right" size={13} />
            </Link>
          </div>
        </div>

        {/* 2. Blue Jar: Intermediate */}
        <div className={`${styles.jarColumn} ${styles.jarBlue}`}>
          <div className={styles.jarLid}>
            <div className={styles.jarHeaderLeft}>
              <div className={styles.jarIconWrap}>
                <MemberIcon name="sparkles" size={16} />
              </div>
              <div>
                <h2 className={styles.jarTitle}>Intermediate Jar</h2>
                <div className={styles.jarSublabel}>Practical & Applied</div>
              </div>
            </div>
            <div className={styles.jarLidRight}>
              <span className={styles.jarCountBadge}>{intermediateTotal}</span>
              <Link
                href="/dashboard/ideas/all?difficulty=intermediate"
                className={styles.openJarLidBtn}
                title="Open Intermediate Jar in full view"
              >
                Open Jar →
              </Link>
            </div>
          </div>

          <div className={styles.jarListWrapper}>
            {intermediateIdeas.length === 0 ? (
              <div className={styles.jarEmptyState}>
                <span>No intermediate proposals published yet</span>
              </div>
            ) : (
              intermediateIdeas.map((idea) => {
                const isVoted = votedIds.has(idea.id);
                const formattedDate = formatIdeaDate(idea.created_at);
                const trackBadgeClass = getTrackBadgeClass(idea.track);

                return (
                  <article key={idea.id} className={styles.jarIdeaCard}>
                    <div className={styles.cardTopMeta}>
                      <div className={styles.badgeGroup}>
                        <span className={`${styles.trackTag} ${trackBadgeClass}`}>
                          {idea.track} Track
                        </span>
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
              })
            )}
          </div>

          <div className={styles.jarBottomBar}>
            <Link
              href="/dashboard/ideas/all?difficulty=intermediate"
              className={styles.viewAllJarLink}
            >
              <span>View all {intermediateTotal} Intermediate ideas</span>
              <MemberIcon name="chevron-right" size={13} />
            </Link>
          </div>
        </div>

        {/* 3. Purple Jar: Advanced */}
        <div className={`${styles.jarColumn} ${styles.jarPurple}`}>
          <div className={styles.jarLid}>
            <div className={styles.jarHeaderLeft}>
              <div className={styles.jarIconWrap}>
                <MemberIcon name="flame" size={16} />
              </div>
              <div>
                <h2 className={styles.jarTitle}>Advanced Jar</h2>
                <div className={styles.jarSublabel}>Cutting-Edge & Research</div>
              </div>
            </div>
            <div className={styles.jarLidRight}>
              <span className={styles.jarCountBadge}>{advancedTotal}</span>
              <Link
                href="/dashboard/ideas/all?difficulty=advanced"
                className={styles.openJarLidBtn}
                title="Open Advanced Jar in full view"
              >
                Open Jar →
              </Link>
            </div>
          </div>

          <div className={styles.jarListWrapper}>
            {advancedIdeas.length === 0 ? (
              <div className={styles.jarEmptyState}>
                <span>No advanced proposals published yet</span>
              </div>
            ) : (
              advancedIdeas.map((idea) => {
                const isVoted = votedIds.has(idea.id);
                const formattedDate = formatIdeaDate(idea.created_at);
                const trackBadgeClass = getTrackBadgeClass(idea.track);

                return (
                  <article key={idea.id} className={styles.jarIdeaCard}>
                    <div className={styles.cardTopMeta}>
                      <div className={styles.badgeGroup}>
                        <span className={`${styles.trackTag} ${trackBadgeClass}`}>
                          {idea.track} Track
                        </span>
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
              })
            )}
          </div>

          <div className={styles.jarBottomBar}>
            <Link
              href="/dashboard/ideas/all?difficulty=advanced"
              className={styles.viewAllJarLink}
            >
              <span>View all {advancedTotal} Advanced ideas</span>
              <MemberIcon name="chevron-right" size={13} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
