"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ArticleDetail, type IdeaDetail } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import styles from "./Discovery.module.css";

type Kind = "articles" | "ideas";

export default function DiscoveryDetail({ kind, id }: { kind: Kind; id: string }) {
  const { token } = useMember();
  const [item, setItem] = useState<ArticleDetail | IdeaDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setItem(null);
    setError("");
    setLoading(true);

    const request = kind === "articles" ? api.getArticle(id) : api.getIdea(id, token);
    request
      .then((value) => { if (active) setItem(value); })
      .catch(() => { if (active) setError("This item could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [kind, id, token, revision]);

  const article = item && "content" in item ? item : null;
  const idea = item && !("content" in item) ? item : null;
  const ideaSections = idea ? [
    { title: "Prerequisites", items: idea.prerequisites },
    { title: "Roadmap", items: idea.rough_roadmap },
    { title: "Learning outcomes", items: idea.learning_outcomes },
  ] : [];

  return (
    <div className={styles.page}>
      <Link className={styles.back} href={`/dashboard/${kind}`}>
        ← Back to {kind}
      </Link>
      {loading && <p className={styles.muted}>Loading…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button>
        </p>
      )}
      {!loading && article && (
        <article className={styles.detail}>
          <div className={styles.meta}>{article.reading_time_minutes} min read</div>
          <h1>{article.title}</h1>
          <p className={styles.muted}>{article.summary}</p>
          <div className={styles.articleText}>{article.content}</div>
        </article>
      )}
      {!loading && idea && (
        <article className={styles.detail}>
          <div className={styles.meta}>{idea.track}</div>
          <h1>{idea.title}</h1>
          <p>{idea.description}</p>
          {ideaSections.filter((section) => section.items.length > 0).map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <ul>{section.items.map((value) => <li key={value}>{value}</li>)}</ul>
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
