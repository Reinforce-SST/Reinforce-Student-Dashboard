"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type IdeaSummary } from "@/lib/api";
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

export default function AdminContentPanel({
  token,
  kind,
}: {
  token: string;
  kind: "articles" | "ideas";
}) {
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(kind === "ideas");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (kind !== "ideas") return;
    let active = true;
    setLoadingIdeas(true);
    api
      .pendingIdeas(token)
      .then((result) => {
        if (active) {
          setIdeas(result.items);
          setError("");
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Pending ideas could not be loaded."
          );
      })
      .finally(() => {
        if (active) setLoadingIdeas(false);
      });
    return () => {
      active = false;
    };
  }, [token, kind, revision]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const article = await api.publishArticle(token, {
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10),
      });
      setTitle("");
      setSummary("");
      setContent("");
      setTags("");
      setNotice(`Published “${article.title}”.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Article could not be published."
      );
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.approveIdea(token, id);
      setNotice("Idea approved and published to the public Idea Jar!");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Idea could not be approved."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    if (busy) return;
    if (!window.confirm("Are you sure you want to reject / close this idea proposal?")) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.rejectIdea(token, id);
      setNotice("Idea proposal has been rejected and closed.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Idea could not be rejected."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>
            {kind === "articles" ? (
              "Publish an article"
            ) : (
              <>
                Idea Jar Submissions Review{" "}
                {!loadingIdeas && (
                  <span className={styles.countBadge}>
                    {ideas.length} pending
                  </span>
                )}
              </>
            )}
          </h2>
          <p>
            {kind === "articles"
              ? "Draft and publish educational articles to the Reinforce community hub."
              : "Review member proposals submitted via tickets or direct submission before they appear in the public Idea Jar."}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          {kind === "ideas" && (
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          )}
        </div>
      )}

      {notice && <div className={styles.successNotice}>{notice}</div>}

      {kind === "articles" ? (
        <form className={styles.form} onSubmit={(event) => void publish(event)}>
          <label>
            Title
            <input
              required
              minLength={3}
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Summary
            <textarea
              required
              minLength={10}
              maxLength={500}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            Article content (plain text)
            <textarea
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <label>
            Tags (comma-separated, up to 10)
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Publishing…" : "Publish article"}
          </button>
        </form>
      ) : (
        <>
          {loadingIdeas && (
            <div className={styles.loadingSkeleton}>
              Loading pending idea submissions…
            </div>
          )}

          {!loadingIdeas && ideas.length === 0 && !error && (
            <div className={styles.emptyContainer}>
              <h3>No Pending Submissions</h3>
              <p>
                All submitted ideas have been reviewed and published. New proposals from members will appear here as soon as they are submitted.
              </p>
            </div>
          )}

          {!loadingIdeas && ideas.length > 0 && (
            <div className={styles.list}>
              {ideas.map((idea) => {
                const isTicket = idea.id.startsWith("tkt_");
                const formattedDate = formatDate(idea.created_at);

                return (
                  <article className={styles.ideaCard} key={idea.id}>
                    <div className={styles.ideaCardHeader}>
                      <div className={styles.ideaBadges}>
                        <span
                          className={styles.trackPill}
                          data-track={idea.track}
                        >
                          {idea.track} Track
                        </span>
                        {idea.difficulty && (
                          <span className={styles.difficultyPill}>
                            {idea.difficulty}
                          </span>
                        )}
                        <span className={styles.sourcePill}>
                          {isTicket
                            ? `Ticket Proposal #${idea.id}`
                            : "Direct Proposal"}
                        </span>
                      </div>
                      {formattedDate && (
                        <span className={styles.submitterTime}>
                          Submitted {formattedDate}
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                      className={styles.ideaTitleLink}
                    >
                      {idea.title}
                    </Link>

                    {idea.description && (
                      <p className={styles.ideaDescription}>
                        {idea.description}
                      </p>
                    )}

                    <div className={styles.ideaActions}>
                      <button
                        type="button"
                        className={styles.approveActionBtn}
                        disabled={busy}
                        onClick={() => void approve(idea.id)}
                      >
                        ✓ Approve & Publish
                      </button>

                      <Link
                        href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                        className={styles.viewDetailLink}
                      >
                        View Full Proposal →
                      </Link>

                      {isTicket && (
                        <Link
                          href={`/dashboard/tickets/${encodeURIComponent(idea.id)}`}
                          className={styles.viewDetailLink}
                        >
                          View Ticket Thread →
                        </Link>
                      )}

                      <button
                        type="button"
                        className={styles.rejectActionBtn}
                        disabled={busy}
                        onClick={() => void reject(idea.id)}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
