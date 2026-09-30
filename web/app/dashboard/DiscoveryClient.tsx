"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type ArticleSummary, type IdeaSummary } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import { useDebounce } from "@/lib/useDebounce";
import styles from "./Discovery.module.css";

export default function DiscoveryClient({ kind }: { kind: "articles" | "ideas" }) {
  const { token } = useMember();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<(ArticleSummary | IdeaSummary)[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<IdeaSummary[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [track, setTrack] = useState("misc");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const result = kind === "articles" ? await api.listArticles(debouncedQuery, page) : await api.listIdeas(debouncedQuery, page);
        if (!active) return;
        setItems(result.items);
        setHasMore(result.has_more);
        setError("");
      } catch {
        if (active) setError(`${kind === "ideas" ? "Ideas" : "Articles"} could not be loaded.`);
      }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [kind, debouncedQuery, page, revision]);

  useEffect(() => {
    if (kind !== "ideas") return;
    let active = true;
    api.myIdeas(token).then((result) => { if (active) setPending(result.items.filter((item) => !item.is_verified)); })
      .catch(() => { if (active) setPending([]); });
    return () => { active = false; };
  }, [kind, token, revision]);

  async function vote(id: string) {
    try {
      const result = await api.upvoteIdea(token, id);
      setItems((current) => current.map((item) => item.id === id && !("slug" in item) ? { ...item, stats: { ...item.stats, upvote_count: result.upvote_count } } : item));
    } catch { setError("Your vote could not be saved."); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await api.createIdea(token, { title: title.trim(), description: description.trim(), track });
      setFormOpen(false); setTitle(""); setDescription("");
      setNotice(result.is_verified ? "Idea published." : "Idea submitted for review. It will appear publicly after approval.");
      setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Idea submission failed."); }
    finally { setSubmitting(false); }
  }

  const isIdea = kind === "ideas";
  return <div className={styles.page}>
    <div className={styles.heading}><div><h1>{isIdea ? "Idea Jar" : "Article Hub"}</h1><p>{isIdea ? "Explore member ideas and submit your own for review." : "Read published work from the Reinforce community."}</p></div>{isIdea && <button className={styles.primary} type="button" onClick={() => setFormOpen((value) => !value)}>{formOpen ? "Close form" : "Submit an idea"}</button>}</div>
    {formOpen && <form className={styles.form} onSubmit={(event) => void submit(event)}><label>Title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Track<select value={track} onChange={(event) => setTrack(event.target.value)}><option value="misc">General</option><option value="research">Research</option><option value="product">Product</option><option value="kaggle">Kaggle</option></select></label><button className={styles.primary} type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit for review"}</button></form>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    {pending.length > 0 && <section className={styles.pending}><h2>Your pending ideas</h2>{pending.map((idea) => <p key={idea.id}>{idea.title} · Awaiting review</p>)}</section>}
    <label className={styles.searchLabel}>Search {kind}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isIdea ? "Search ideas" : "Search articles"} /></label>
    {loading && <p className={styles.muted}>Loading {kind}…</p>}
    {!loading && !error && items.length === 0 && <div className={styles.empty}>No {isIdea ? "approved ideas" : "published articles"} found.</div>}
    {!loading && !error && <div className={styles.grid}>{items.map((item) => <article key={item.id} className={styles.card}>{"cover_image_url" in item && item.cover_image_url && <img className={styles.cover} src={item.cover_image_url} alt="" />}<div className={styles.cardBody}><div className={styles.meta}>{"slug" in item ? `${item.reading_time_minutes} min read` : item.track}</div><h2>{item.title}</h2><p>{"slug" in item ? item.summary : item.description}</p><div className={styles.actions}><Link href={"slug" in item ? `/dashboard/articles/${encodeURIComponent(item.slug)}` : `/dashboard/ideas/${encodeURIComponent(item.id)}`}>{isIdea ? "View details" : "Read article"} →</Link>{!("slug" in item) && <button type="button" aria-label={`Vote for ${item.title}`} onClick={() => void vote(item.id)}>▲ {item.stats.upvote_count}</button>}</div></div></article>)}</div>}
    {!loading && !error && (page > 1 || hasMore) && <div className={styles.pager}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</button></div>}
  </div>;
}
