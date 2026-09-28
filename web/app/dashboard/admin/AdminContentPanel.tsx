"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type IdeaSummary } from "@/lib/api";
import styles from "./AdminWorkflows.module.css";

export default function AdminContentPanel({ token, kind }: { token: string; kind: "articles" | "ideas" }) {
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
    api.pendingIdeas(token).then((result) => { if (active) { setIdeas(result.items); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Pending ideas could not be loaded."); })
      .finally(() => { if (active) setLoadingIdeas(false); });
    return () => { active = false; };
  }, [token, kind, revision]);

  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const article = await api.publishArticle(token, { title: title.trim(), summary: summary.trim(), content: content.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10) });
      setTitle(""); setSummary(""); setContent(""); setTags("");
      setNotice(`Published “${article.title}”.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Article could not be published."); }
    finally { setBusy(false); }
  }

  async function approve(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.approveIdea(token, id); setNotice("Idea approved."); setRevision((value) => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Idea could not be approved."); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel}>
    <h2>{kind === "articles" ? "Publish an article" : "Pending ideas"}</h2>
    {error && <p role="alert" className={styles.error}>{error} {kind === "ideas" && <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button>}</p>}
    {notice && <p role="status">{notice}</p>}
    {kind === "articles" ? <form className={styles.form} onSubmit={(event) => void publish(event)}><label>Title<input required minLength={3} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Summary<textarea required minLength={10} maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label>Article content (plain text)<textarea required value={content} onChange={(event) => setContent(event.target.value)} /></label><label>Tags (comma-separated, up to 10)<input value={tags} onChange={(event) => setTags(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish article"}</button></form> : <><p>Review member submissions before they appear in the public Idea Jar.</p>{loadingIdeas && <p>Loading ideas…</p>}{!loadingIdeas && ideas.length === 0 && !error && <p>No pending ideas.</p>}{!loadingIdeas && !error && <div className={styles.list}>{ideas.map((idea) => <article className={styles.row} key={idea.id}><div><Link href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}>{idea.title}</Link><small>{idea.track} · {idea.description}</small></div><button type="button" disabled={busy} onClick={() => void approve(idea.id)}>Approve</button></article>)}</div>}</>}
  </section>;
}
