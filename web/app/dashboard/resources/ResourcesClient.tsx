"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type LearningResource, type ResourceTrack, type ResourceType } from "@/lib/api";
import { RESOURCE_TRACKS, RESOURCE_TYPES, isWebAddress, trackLabel, typeLabel } from "@/lib/learningResources";
import { useDebounce } from "@/lib/useDebounce";
import styles from "../Discovery.module.css";

/**
 * The Learning Resources hub: links admins have picked, filtered by track and
 * type. Resources saved from an event link back to it.
 *
 * It asks without a token on purpose, so admins see exactly what members see;
 * hidden resources are managed from the admin panel.
 */
export default function ResourcesClient() {
  const [track, setTrack] = useState<ResourceTrack | "all">("all");
  const [type, setType] = useState<ResourceType | "">("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [items, setItems] = useState<LearningResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listLearningResources({
      track: track === "all" ? undefined : track,
      type: type || undefined,
      q: debouncedQuery.trim() || undefined,
    })
      .then((result) => {
        if (!active) return;
        setItems(result.resources);
        setError("");
      })
      .catch(() => { if (active) setError("Learning resources could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [track, type, debouncedQuery, revision]);

  const filtered = track !== "all" || type !== "" || debouncedQuery.trim() !== "";

  return <div className={styles.page}>
    <div className={styles.heading}><div><h1>Learning Resources</h1><p>Courses, talks, slides and links the Reinforce team recommends.</p></div></div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    <div className={styles.kindTabs} role="tablist" aria-label="Filter by track">
      {[{ value: "all" as const, label: "All tracks" }, ...RESOURCE_TRACKS].map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={track === value}
          className={track === value ? styles.kindTabActive : undefined}
          onClick={() => setTrack(value)}
        >
          {label}
        </button>
      ))}
    </div>
    <div className={styles.filterRow}>
      <label className={styles.searchLabel}>Type
        <select value={type} onChange={(event) => setType(event.target.value as ResourceType | "")}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={styles.searchLabel}>Search resources<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, descriptions and tags" /></label>
    </div>
    {loading && <p className={styles.muted}>Loading resources…</p>}
    {!loading && !error && items.length === 0 && <div className={styles.empty}>
      {filtered ? "No resources match these filters." : "No learning resources yet."}
    </div>}
    {!loading && !error && <div className={styles.grid}>{items.map((item) => (
      <article key={item.id} className={styles.card}>
        <div className={styles.cardBody}>
          <div className={styles.meta}>{typeLabel(item.type)} · {trackLabel(item.track)}</div>
          <h2>{item.title}</h2>
          {item.description && <p>{item.description}</p>}
          {item.tags.length > 0 && <ul className={styles.resourceTags} aria-label="Tags">
            {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>}
          {item.event_id && <p className={styles.resourceEvent}>
            From <Link href={`/dashboard/events/${encodeURIComponent(item.event_id)}`}>{item.event_title || "an event"}</Link>
          </p>}
          {isWebAddress(item.url) && <div className={styles.actions}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Open resource <span aria-hidden="true">↗</span><span className={styles.visuallyHidden}> (opens in a new tab)</span>
            </a>
          </div>}
        </div>
      </article>
    ))}</div>}
  </div>;
}
