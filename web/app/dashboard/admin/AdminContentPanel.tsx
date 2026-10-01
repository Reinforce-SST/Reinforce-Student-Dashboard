"use client";

import { useState, type FormEvent } from "react";
import { api, type ArticleKind } from "@/lib/api";
import AdminIdeaReviewPanel from "./AdminIdeaReviewPanel";
import styles from "./AdminWorkflows.module.css";

export default function AdminContentPanel({
  token,
  kind,
}: {
  token: string;
  kind: "articles" | "ideas";
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  // A research paper is an article with paper details: who wrote it, where,
  // and a link to the paper itself.
  const [articleKind, setArticleKind] = useState<ArticleKind>("article");
  const [authors, setAuthors] = useState("");
  const [venue, setVenue] = useState("");
  const [paperUrl, setPaperUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const isPaper = articleKind === "research_paper";
    const authorList = authors.split(",").map((name) => name.trim()).filter(Boolean);
    if (isPaper && authorList.length === 0) {
      setError("A research paper needs at least one author.");
      setBusy(false);
      return;
    }
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
        kind: articleKind,
        paper: isPaper
          ? { authors: authorList, venue: venue.trim() || null, paper_url: paperUrl.trim() }
          : null,
      });
      setTitle("");
      setSummary("");
      setContent("");
      setTags("");
      setAuthors("");
      setVenue("");
      setPaperUrl("");
      setNotice(`Published “${article.title}”${isPaper ? " as a research paper" : ""}.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Article could not be published."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      {kind === "ideas" ? (
        <AdminIdeaReviewPanel token={token} />
      ) : (
        <>
          <div className={styles.panelHeader}>
            <div>
              <h2>Publish an Article</h2>
              <p>
                Draft and publish educational articles to the Reinforce community hub.
              </p>
            </div>
          </div>

          {error && <div role="alert" className={styles.error}>{error}</div>}
          {notice && <div className={styles.successNotice}>{notice}</div>}

          <form className={styles.form} onSubmit={(event) => void publish(event)}>
            <label>
              Kind
              <select value={articleKind} onChange={(event) => setArticleKind(event.target.value as ArticleKind)}>
                <option value="article">Article</option>
                <option value="research_paper">Research paper</option>
              </select>
            </label>
            {articleKind === "research_paper" && (
              <>
                <label>
                  Authors (comma-separated)
                  <input required value={authors} onChange={(event) => setAuthors(event.target.value)} />
                </label>
                <label>
                  Venue (optional)
                  <input maxLength={200} value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="e.g. NeurIPS 2025 Workshop" />
                </label>
                <label>
                  Link to the paper
                  <input
                    required
                    type="url"
                    // The server accepts http(s) only; pattern keeps the browser in step.
                    pattern="https?://.+"
                    maxLength={500}
                    value={paperUrl}
                    onChange={(event) => setPaperUrl(event.target.value)}
                    placeholder="https://arxiv.org/abs/…"
                  />
                </label>
              </>
            )}
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
        </>
      )}
    </section>
  );
}
