"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, type ArticleSummary, type IdeaSummary, type TicketSummary } from "@/lib/api";
import { loadAllSpgs } from "@/lib/memberData";
import type { SPGRecord } from "@/lib/spgData";
import { useMember } from "@/lib/useMember";
import styles from "../Discovery.module.css";

export default function SearchClient() {
  const { token } = useMember();
  const query = useSearchParams().get("q")?.trim() || "";
  const [spgs, setSpgs] = useState<SPGRecord[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query) {
      setSpgs([]);
      setTickets([]);
      setIdeas([]);
      setArticles([]);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setSpgs([]);
    setTickets([]);
    setIdeas([]);
    setArticles([]);
    Promise.allSettled([loadAllSpgs(token), api.myTickets(token), api.listIdeas(query), api.listArticles(query)]).then(([groups, ownTickets, foundIdeas, foundArticles]) => {
      if (!active) return;
      const q = query.toLowerCase();
      setSpgs(groups.status === "fulfilled" ? groups.value.filter((spg) => `${spg.name} ${spg.description || ""}`.toLowerCase().includes(q)).slice(0, 20) : []);
      setTickets(ownTickets.status === "fulfilled" ? ownTickets.value.filter((ticket) => ticket.title.toLowerCase().includes(q)).slice(0, 20) : []);
      setIdeas(foundIdeas.status === "fulfilled" ? foundIdeas.value.items : []);
      setArticles(foundArticles.status === "fulfilled" ? foundArticles.value.items : []);
      setError([groups, ownTickets, foundIdeas, foundArticles].some((result) => result.status === "rejected") ? "Some results could not be loaded. Try again later." : "");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, token]);

  return <div className={styles.page}><div className={styles.heading}><div><h1>Search</h1><p>{query ? `Results for “${query}”` : "Enter a search term in the header."}</p></div></div>
    {loading && <p className={styles.muted}>Searching…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    {!loading && query && [spgs, tickets, ideas, articles].every((items) => items.length === 0) && !error && <div className={styles.empty}>No results found.</div>}
    {[{ title: "Project groups", items: spgs.map((item) => ({ id: item.id, title: item.name, href: `/dashboard/spg/${encodeURIComponent(item.id)}` })) }, { title: "Your tickets", items: tickets.map((item) => ({ id: item.id, title: item.title, href: `/dashboard/tickets/${encodeURIComponent(item.id)}` })) }, { title: "Ideas", items: ideas.map((item) => ({ id: item.id, title: item.title, href: `/dashboard/ideas/${encodeURIComponent(item.id)}` })) }, { title: "Articles", items: articles.map((item) => ({ id: item.id, title: item.title, href: `/dashboard/articles/${encodeURIComponent(item.slug)}` })) }].map((group) => group.items.length > 0 && <section key={group.title} className={styles.pending}><h2>{group.title}</h2>{group.items.map((item) => <p key={item.id}><Link href={item.href}>{item.title} →</Link></p>)}</section>)}
  </div>;
}
