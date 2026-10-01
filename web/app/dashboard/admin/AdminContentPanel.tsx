"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
