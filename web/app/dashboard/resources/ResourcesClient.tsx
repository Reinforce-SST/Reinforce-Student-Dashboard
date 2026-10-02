"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type LearningResource, type ResourceCategoryId, type ResourceType } from "@/lib/api";
import {
  RESOURCE_TYPES,
  isWebAddress,
  resourceCategoryId,
  resourceFolderAncestors,
  resourceFolderLabel,
  resourceFolders,
  typeLabel,
} from "@/lib/learningResources";
import { useDebounce } from "@/lib/useDebounce";
import styles from "../Discovery.module.css";

/**
 * The Learning Resources hub is a nested folder tree of shared links. Old
 * records without a category are placed in the root matching their track.
 */
export default function ResourcesClient() {
  const [folderId, setFolderId] = useState<ResourceCategoryId | null>(null);
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
    api.listLearningResources({ type: type || undefined, q: debouncedQuery.trim() || undefined })
      .then((result) => {
        if (!active) return;
        setItems(result.resources);
        setError("");
      })
      .catch(() => { if (active) setError("Learning resources could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, debouncedQuery, revision]);

  const ancestors = resourceFolderAncestors(folderId);
  const folders = resourceFolders(items).filter((folder) => folder.parentId === folderId);
  const searchActive = debouncedQuery.trim() !== "";
  const visibleFolders = searchActive ? [] : folders;
  const resources = items.filter((item) => searchActive || resourceCategoryId(item) === folderId);
  const filtered = type !== "" || debouncedQuery.trim() !== "";
  const allResourcesEmpty = items.length === 0 && !filtered && folderId === null;
  const emptyFolder = resources.length === 0 && visibleFolders.length === 0 && (items.length > 0 || folderId !== null);

  return <div className={styles.page}>
    <div className={styles.heading}><div><h1>Learning Resources</h1><p>Browse recommended links like folders and files.</p></div></div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}

    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <button type="button" onClick={() => setFolderId(null)} aria-label="All resources">All resources</button>
      {ancestors.map((folder, index) => <span key={folder.id} className={styles.crumbPart}>
        <span aria-hidden="true">/</span>
        {index === ancestors.length - 1
          ? <span aria-current="page">{folder.name}</span>
          : <button type="button" onClick={() => setFolderId(folder.id)}>{folder.name}</button>}
      </span>)}
    </nav>

    <div className={styles.filterRow}>
      <label className={styles.searchLabel}>Type
        <select value={type} onChange={(event) => setType(event.target.value as ResourceType | "")}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={styles.searchLabel}>Search resources<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, descriptions and tags" /></label>
    </div>

    <div className={styles.directoryHeading}>
      <h2>{folderId ? resourceFolderLabel(folderId) : "General pool"}</h2>
      {loading && <span className={styles.muted}>Loading resources…</span>}
    </div>

    {visibleFolders.length > 0 && <section className={styles.directorySection} aria-label="Folders">
      <h3>Folders</h3>
      <div className={styles.folderGrid}>
        {visibleFolders.map((folder) => <button
          key={folder.id}
          type="button"
          className={styles.folderTile}
          aria-label={`${folder.name} folder`}
          onClick={() => setFolderId(folder.id)}
        >
          <svg className={styles.folderIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.1l2 2H18.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="currentColor" opacity=".22" />
            <path d="M3.5 8h17v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="currentColor" />
            <path d="M3.5 8h17" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span>{folder.name}</span>
          <small>Open folder</small>
        </button>)}
      </div>
    </section>}

    {loading && <p className={styles.visuallyHidden} role="status">Loading resources…</p>}
    {!loading && !error && allResourcesEmpty && <div className={styles.empty}>No learning resources yet.</div>}
    {!loading && !error && filtered && resources.length === 0 && <div className={styles.empty}>No resources match these filters.</div>}
    {!loading && !error && !filtered && emptyFolder && <div className={styles.empty}>No resources in this folder.</div>}
    {!loading && !error && resources.length > 0 && <section className={styles.directorySection} aria-label="Resources">
      <h3>Files</h3>
      <div className={styles.grid}>{resources.map((item) => (
        <article key={item.id} className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.meta}>{typeLabel(item.type)} · {resourceFolderLabel(resourceCategoryId(item))}</div>
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
      ))}</div>
    </section>}
  </div>;
}
