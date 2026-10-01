"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ArticleDetail, type IdeaDetail } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import ArticleMarkdown from "@/components/dashboard/ArticleMarkdown";
import styles from "./Discovery.module.css";

type Kind = "articles" | "ideas";

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

export default function DiscoveryDetail({
  kind,
  id,
}: {
  kind: Kind;
  id: string;
}) {
  const { token, profile } = useMember();
  const [item, setItem] = useState<ArticleDetail | IdeaDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [upvotes, setUpvotes] = useState<number>(0);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [upvoting, setUpvoting] = useState(false);

  useEffect(() => {
    let active = true;
    setItem(null);
    setError("");
    setLoading(true);

    const request =
      kind === "articles" ? api.getArticle(id) : api.getIdea(id, token);
    request
      .then((value) => {
        if (active) {
          setItem(value);
          if (kind === "ideas" && !("content" in value)) {
            setUpvotes(value.stats?.upvote_count ?? 0);
          }
        }
      })
      .catch(() => {
        if (active) setError("This item could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kind, id, token, revision]);

  // Articles are voted on through their own route; the idea handler below is
  // idea-only.
  const [articleVotes, setArticleVotes] = useState<number | null>(null);
  const [articleVoted, setArticleVoted] = useState(false);
  async function handleToggleArticleVote() {
    if (!token || upvoting || !item || !("content" in item)) return;
    setUpvoting(true);
    try {
      const res = await api.upvoteArticle(token, item.id);
      setArticleVotes(res.upvote_count);
      setArticleVoted(res.upvoted);
    } catch {
      // A failed vote leaves the count as it was.
    } finally {
      setUpvoting(false);
    }
  }

  async function handleToggleUpvote() {
    if (!token || upvoting || !item || "content" in item) return;
    setUpvoting(true);
    try {
      const res = await api.upvoteIdea(token, item.id);
      setUpvotes(res.upvote_count);
      setHasUpvoted(res.upvoted);
    } catch {
      // Ignored
    } finally {
      setUpvoting(false);
    }
  }

  const article = item && "content" in item ? item : null;
  const idea = item && !("content" in item) ? item : null;

  return (
    <div className={styles.page}>
      <div className={styles.topNavRow}>
        <Link className={styles.back} href={`/dashboard/${kind}`}>
          ← Back to {kind === "ideas" ? "Idea Jar" : "Articles"}
        </Link>
        {profile?.is_admin && kind === "ideas" && (
          <Link
            href="/dashboard/admin?tab=ideas"
            className={styles.adminReviewLink}
          >
            ⚙ Manage in Admin Console →
          </Link>
        )}
      </div>

      {loading && <p className={styles.muted}>Loading details…</p>}

      {error && (
        <p role="alert" className={styles.error}>
          {error}{" "}
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}

      {!loading && article && (
        <article className={styles.detail}>
          <div className={styles.meta}>
            {article.kind === "research_paper" ? "Research paper" : `${article.reading_time_minutes} min read`}
          </div>
          <h1>{article.title}</h1>
          <p className={styles.muted}>{article.summary}</p>

          {article.kind === "research_paper" && article.paper && (
            <section className={styles.paperBox} aria-label="Paper details">
              <dl>
                <dt>Authors</dt>
                <dd>{article.paper.authors.join(", ")}</dd>
                {article.paper.venue && (
                  <>
                    <dt>Venue</dt>
                    <dd>{article.paper.venue}</dd>
                  </>
                )}
              </dl>
              {/* The server only stores http(s) links; checked again here so a
                  javascript: address can never become a link. */}
              {/^https?:\/\//i.test(article.paper.paper_url) && (
                <a className={styles.paperLink} href={article.paper.paper_url} target="_blank" rel="noopener noreferrer">
                  Read the paper ↗
                </a>
              )}
            </section>
          )}

          <ArticleMarkdown content={article.content} />

          <footer className={styles.articleFooter}>
            {article.published_at && <span>Published {formatDate(article.published_at)}</span>}
            {article.tags.length > 0 && (
              <span className={styles.articleTags} aria-label="Tags">
                {article.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </span>
            )}
            {token ? (
              <button
                type="button"
                className={styles.articleVote}
                aria-pressed={articleVoted}
                disabled={upvoting}
                onClick={() => void handleToggleArticleVote()}
              >
                ▲ Upvote ({articleVotes ?? article.stats.upvote_count})
              </button>
            ) : (
              <span>▲ {article.stats.upvote_count} upvotes</span>
            )}
          </footer>
        </article>
      )}

      {!loading && idea && (
        <article className={styles.ideaDetail}>
          {/* Header & Badges */}
          <div className={styles.proposalHeader}>
            <div className={styles.badgeRow}>
              <span className={styles.trackBadge} data-track={idea.track}>
                {idea.track} Track
              </span>

              {idea.difficulty && (
                <span
                  className={styles.difficultyBadge}
                  data-difficulty={idea.difficulty.toLowerCase()}
                >
                  ⚡ {idea.difficulty}
                </span>
              )}

              {idea.is_verified ? (
                <span
                  className={`${styles.statusBadge} ${styles.statusBadgeVerified}`}
                >
                  ✓ Verified Project
                </span>
              ) : idea.status === "closed" ? (
                <span
                  className={`${styles.statusBadge} ${styles.statusBadgeClosed}`}
                >
                  ✕ Closed Proposal
                </span>
              ) : (
                <span
                  className={`${styles.statusBadge} ${styles.statusBadgePending}`}
                >
                  ⏳ Pending Lead Review
                </span>
              )}

              {idea.created_at && (
                <span className={styles.dateText}>
                  Submitted {formatDate(idea.created_at)}
                </span>
              )}
            </div>

            <h1 className={styles.proposalTitle}>{idea.title}</h1>
          </div>

          {/* Overview Section */}
          <div className={styles.overviewCard}>
            <h3 className={styles.overviewTitle}>Project Overview & Objectives</h3>
            <p className={styles.overviewText}>{idea.description}</p>
          </div>

          {/* Stats Bar */}
          <div className={styles.metaStatsRow}>
            {token && (
              <button
                type="button"
                className={`${styles.upvoteBtn} ${hasUpvoted ? styles.upvoteBtnActive : ""}`}
                onClick={handleToggleUpvote}
                disabled={upvoting}
                title="Upvote this idea"
              >
                ▲ Upvote ({upvotes})
              </button>
            )}

            {!token && (
              <span className={styles.metaStatItem}>
                ▲ Upvotes: <strong>{upvotes}</strong>
              </span>
            )}

            <span className={styles.metaStatItem}>
              👁 Views: <strong>{idea.stats?.views_count ?? 0}</strong>
            </span>

            {idea.id.startsWith("tkt_") && (
              <span className={styles.metaStatItem}>
                Ticket Ref: <strong>#{idea.id}</strong>
              </span>
            )}

            {idea.updated_at && (
              <span className={styles.metaStatItem}>
                Updated: <strong>{formatDate(idea.updated_at)}</strong>
              </span>
            )}

            {/* claims_count counts the project groups started from this idea. */}
            {(idea.stats?.claims_count ?? 0) > 0 && (
              <span className={styles.metaStatItem}>
                Groups started: <strong>{idea.stats.claims_count}</strong>
              </span>
            )}
          </div>

          {/* Only an approved idea is in the jar, and only those can seed a group. */}
          {idea.is_verified && (
            <div className={styles.startGroupCard}>
              <div>
                <h3 className={styles.overviewTitle}>Want to build this?</h3>
                <p className={styles.overviewText}>
                  Register a project group around this idea. The club reviews the registration like any other.
                </p>
              </div>
              <Link
                href={`/dashboard/tickets?category=spg_registration&idea=${encodeURIComponent(idea.id)}`}
                className={styles.startGroupLink}
              >
                Start a project group from this idea →
              </Link>
            </div>
          )}

          {/* Prerequisites */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                🛠️ Prerequisites & Knowledge
              </h2>
              <span className={styles.sectionCount}>
                {idea.prerequisites?.length ?? 0} items
              </span>
            </div>
            {idea.prerequisites && idea.prerequisites.length > 0 ? (
              <div className={styles.tagsWrap}>
                {idea.prerequisites.map((item, idx) => (
                  <span key={idx} className={styles.tagChip}>
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className={styles.emptyNotice}>
                No specific prerequisites listed. Accessible to motivated students of all levels!
              </p>
            )}
          </div>

          {/* Implementation Roadmap */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                🗺️ Implementation Roadmap
              </h2>
              <span className={styles.sectionCount}>
                {idea.rough_roadmap?.length ?? 0} milestones
              </span>
            </div>
            {idea.rough_roadmap && idea.rough_roadmap.length > 0 ? (
              <div className={styles.roadmapSteps}>
                {idea.rough_roadmap.map((step, idx) => (
                  <div key={idx} className={styles.roadmapStep}>
                    <div className={styles.stepBadge}>{idx + 1}</div>
                    <div className={styles.stepText}>{step}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyNotice}>
                Roadmap milestones will be collaboratively drafted upon team formation.
              </p>
            )}
          </div>

          {/* Learning Outcomes */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                🎯 Learning Outcomes & Skills
              </h2>
              <span className={styles.sectionCount}>
                {idea.learning_outcomes?.length ?? 0} outcomes
              </span>
            </div>
            {idea.learning_outcomes && idea.learning_outcomes.length > 0 ? (
              <div className={styles.outcomeList}>
                {idea.learning_outcomes.map((outcome, idx) => (
                  <div key={idx} className={styles.outcomeRow}>
                    <span className={styles.checkIcon}>✓</span>
                    <span className={styles.outcomeText}>{outcome}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyNotice}>
                Direct experience building applied solutions in the {idea.track.toUpperCase()} domain.
              </p>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
