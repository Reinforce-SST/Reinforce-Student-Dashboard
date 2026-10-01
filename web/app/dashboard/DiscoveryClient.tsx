"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ArticleKind, type ArticleSummary } from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import styles from "./Discovery.module.css";

/**
 * The Article Hub feed. Research papers are articles with kind
 * "research_paper", so one feed lists both and a tab narrows it.
 *
 * This component used to render the Idea Jar too. That page moved to
 * IdeaJarClient, and the ideas branch here — a submit form, voting and a
 * pending list — had become unreachable.
 */
const KINDS: { value: ArticleKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "article", label: "Articles" },
  { value: "research_paper", label: "Research papers" },
];

export default function DiscoveryClient() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [kind, setKind] = useState<ArticleKind | "all">("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ArticleSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, kind]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listArticles(debouncedQuery, page, kind === "all" ? undefined : kind)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setHasMore(result.has_more);
        setError("");
      })
      .catch(() => { if (active) setError("Articles could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, page, kind, revision]);

  const emptyLabel = kind === "research_paper" ? "No research papers found." : "No published articles found.";

  return <div className={styles.page}>
    <div className={styles.heading}><div><h1>Article Hub</h1><p>Read articles and research papers from the Reinforce community.</p></div></div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    <div className={styles.kindTabs} role="tablist" aria-label="Filter by kind">
      {KINDS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={kind === value}
          className={kind === value ? styles.kindTabActive : undefined}
          onClick={() => setKind(value)}
        >
          {label}
        </button>
      ))}
    </div>
    <label className={styles.searchLabel}>Search articles<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles and papers" /></label>
    {loading && <p className={styles.muted}>Loading articles…</p>}
    {!loading && !error && items.length === 0 && <div className={styles.empty}>{emptyLabel}</div>}
    {!loading && !error && <div className={styles.grid}>{items.map((item) => {
      const isPaper = item.kind === "research_paper" && item.paper;
      return <article key={item.id} className={styles.card}>
        {item.cover_image_url && <img className={styles.cover} src={item.cover_image_url} alt="" />}
        <div className={styles.cardBody}>
          <div className={styles.meta}>{isPaper ? "Research paper" : `${item.reading_time_minutes} min read`}</div>
          <h2>{item.title}</h2>
          {isPaper && item.paper && <p className={styles.paperByline}>
            {item.paper.authors.join(", ")}{item.paper.venue ? ` · ${item.paper.venue}` : ""}
          </p>}
          <p>{item.summary}</p>
          <div className={styles.actions}>
            <Link href={`/dashboard/articles/${encodeURIComponent(item.slug)}`}>{isPaper ? "Read the write-up" : "Read article"} →</Link>
          </div>
        </div>
      </article>;
    })}</div>}
    {!loading && !error && (page > 1 || hasMore) && <div className={styles.pager}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</button></div>}
  </div>;
}
