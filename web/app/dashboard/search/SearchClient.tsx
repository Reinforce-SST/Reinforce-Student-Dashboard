"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type ArticleSummary,
  type EventSummaryItem,
  type IdeaSummary,
  type StudentProfile,
  type TicketSummary,
} from "@/lib/api";
import { loadAllSpgs } from "@/lib/memberData";
import type { SPGRecord } from "@/lib/spgData";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./Search.module.css";

type TabKey = "all" | "events" | "members" | "spgs" | "tickets" | "ideas" | "articles";

function formatEventDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return null;
  }
}

export default function SearchClient() {
  const { token, profile } = useMember();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() || "";

  const [inputVal, setInputVal] = useState(query);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [nowMs] = useState(() => Date.now());

  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [members, setMembers] = useState<StudentProfile[]>([]);
  const [spgs, setSpgs] = useState<SPGRecord[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Keep local input in sync with query parameter
  useEffect(() => {
    setInputVal(query);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setEvents([]);
      setMembers([]);
      setSpgs([]);
      setTickets([]);
      setIdeas([]);
      setArticles([]);
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    const q = query.toLowerCase();

    // 1. Events: upcoming + recently finished only (optimized, capped at 10 each)
    const fetchEvents = Promise.allSettled([
      api.listEvents(token, { timeline: "upcoming", search: query, limit: 10 }),
      api.listEvents(token, { timeline: "past", search: query, limit: 10 }),
    ]).then(([upcomingRes, pastRes]) => {
      const up = upcomingRes.status === "fulfilled" ? (upcomingRes.value.events || []) : [];
      const past = pastRes.status === "fulfilled" ? (pastRes.value.events || []) : [];
      const combined = [...up, ...past];
      const seen = new Set<string>();
      const deduped: EventSummaryItem[] = [];
      for (const ev of combined) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id);
          deduped.push(ev);
        }
      }
      return deduped
        .filter((ev) => `${ev.title} ${ev.description || ""}`.toLowerCase().includes(q))
        .slice(0, 10);
    });

    // 2. Members: club members only (is_member: true, capped at 10)
    const fetchMembers = api
      .browseUsers(token, { search: query, is_member: true, page_size: 10 })
      .then((res) => {
        return (res.items || [])
          .filter(
            (u) =>
              u.is_member !== false &&
              `${u.full_name || ""} ${u.email || ""} ${u.skills?.join(" ") || ""}`
                .toLowerCase()
                .includes(q)
          )
          .slice(0, 10);
      })
      .catch(() => [] as StudentProfile[]);

    // 3. Projects: user's projects which are recent
    const fetchSpgs = loadAllSpgs(token)
      .then((allSpgs) => {
        const myId = profile?.id;
        const userProjects = myId
          ? allSpgs.filter((s) => s.lead_id === myId || s.member_ids?.includes(myId))
          : allSpgs;
        const targetPool = userProjects.length > 0 ? userProjects : allSpgs;

        return targetPool
          .filter((s) => `${s.name} ${s.description || ""}`.toLowerCase().includes(q))
          .sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at || 0).getTime() -
              new Date(a.updated_at || a.created_at || 0).getTime()
          )
          .slice(0, 10);
      })
      .catch(() => [] as SPGRecord[]);

    // 4. Tickets: user's tickets which are recent
    const fetchTickets = api
      .myTickets(token)
      .then((list) => {
        return (list || [])
          .filter((t) => t.title.toLowerCase().includes(q))
          .sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at || 0).getTime() -
              new Date(a.updated_at || a.created_at || 0).getTime()
          )
          .slice(0, 10);
      })
      .catch(() => [] as TicketSummary[]);

    // 5. Ideas: recent ideas (sort_by: "newest", capped at 10)
    const fetchIdeas = api
      .listIdeas(query, 1, 10, undefined, undefined, "newest")
      .then((res) => (res.items || []).slice(0, 10))
      .catch(() => [] as IdeaSummary[]);

    // 6. Articles: capped at 10
    const fetchArticles = api
      .listArticles(query, 1)
      .then((res) => (res.items || []).slice(0, 10))
      .catch(() => [] as ArticleSummary[]);

    Promise.allSettled([
      fetchEvents,
      fetchMembers,
      fetchSpgs,
      fetchTickets,
      fetchIdeas,
      fetchArticles,
    ])
      .then(([evRes, memRes, spgRes, tktRes, ideaRes, artRes]) => {
        if (!active) return;
        setEvents(evRes.status === "fulfilled" ? evRes.value : []);
        setMembers(memRes.status === "fulfilled" ? memRes.value : []);
        setSpgs(spgRes.status === "fulfilled" ? spgRes.value : []);
        setTickets(tktRes.status === "fulfilled" ? tktRes.value : []);
        setIdeas(ideaRes.status === "fulfilled" ? ideaRes.value : []);
        setArticles(artRes.status === "fulfilled" ? artRes.value : []);

        const anyFailed = [evRes, memRes, spgRes, tktRes, ideaRes, artRes].some(
          (r) => r.status === "rejected"
        );
        setError(anyFailed ? "Some results could not be loaded. Try again later." : "");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, token, profile?.id]);

  const totalResults = useMemo(
    () =>
      events.length +
      members.length +
      spgs.length +
      tickets.length +
      ideas.length +
      articles.length,
    [events, members, spgs, tickets, ideas, articles]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    router.push(`/dashboard/search?q=${encodeURIComponent(inputVal.trim())}`);
  };

  const handleClear = () => {
    setInputVal("");
    router.push("/dashboard/search");
  };

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>Search</h1>
          <p>
            {query
              ? `Results for “${query}”`
              : "Enter a search term in the header to find events, members, projects, tickets, and ideas."}
          </p>
        </div>
      </div>

      {/* In-page search bar for fast refinement */}
      <form onSubmit={handleSubmit} className={styles.searchBarWrapper} role="search">
        <div className={styles.searchInputContainer}>
          <span className={styles.searchIcon}>
            <MemberIcon name="search" size={17} />
          </span>
          <input
            type="search"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Search events, members, projects, tickets..."
            className={styles.searchInput}
            aria-label="Search term"
          />
          {inputVal && (
            <button
              type="button"
              onClick={handleClear}
              className={styles.clearBtn}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <button type="submit" className={styles.searchSubmitBtn}>
          Search
        </button>
      </form>

      {/* Suggested hints when no query */}
      {!query && (
        <div className={styles.hints}>
          <span>Try searching for:</span>
          {["Hackathon", "Research", "Kaggle", "Product", "Beginner"].map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => router.push(`/dashboard/search?q=${encodeURIComponent(hint)}`)}
              className={styles.hintTag}
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {loading && <p className={styles.muted}>Searching…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {!loading && query && totalResults === 0 && !error && (
        <div className={styles.empty}>No results found.</div>
      )}

      {/* Category Tabs when results exist */}
      {!loading && query && totalResults > 0 && (
        <div className={styles.tabs} role="tablist" aria-label="Result categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All <span className={styles.tabCount}>{totalResults}</span>
          </button>
          {events.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "events"}
              className={`${styles.tabBtn} ${activeTab === "events" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("events")}
            >
              Events <span className={styles.tabCount}>{events.length}</span>
            </button>
          )}
          {members.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "members"}
              className={`${styles.tabBtn} ${activeTab === "members" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Members <span className={styles.tabCount}>{members.length}</span>
            </button>
          )}
          {spgs.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "spgs"}
              className={`${styles.tabBtn} ${activeTab === "spgs" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("spgs")}
            >
              Project groups <span className={styles.tabCount}>{spgs.length}</span>
            </button>
          )}
          {tickets.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tickets"}
              className={`${styles.tabBtn} ${activeTab === "tickets" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("tickets")}
            >
              Your tickets <span className={styles.tabCount}>{tickets.length}</span>
            </button>
          )}
          {ideas.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ideas"}
              className={`${styles.tabBtn} ${activeTab === "ideas" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("ideas")}
            >
              Ideas <span className={styles.tabCount}>{ideas.length}</span>
            </button>
          )}
          {articles.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "articles"}
              className={`${styles.tabBtn} ${activeTab === "articles" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("articles")}
            >
              Articles <span className={styles.tabCount}>{articles.length}</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Events */}
      {(activeTab === "all" || activeTab === "events") && events.length > 0 && (
        <section className={styles.section} aria-label="Events">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Events</h2>
            <span className={styles.sectionCount}>{events.length}</span>
          </div>
          <div className={styles.resultsList}>
            {events.map((event) => {
              const startMs = event.schedule?.start_time
                ? new Date(event.schedule.start_time).getTime()
                : null;
              const isEnded =
                event.status === "completed" ||
                event.status === "ended" ||
                (startMs !== null && startMs < nowMs && event.status !== "ongoing");
              const dateStr = formatEventDate(event.schedule?.start_time);
              const venue =
                event.venue_info?.room ||
                event.venue_info?.venue_name ||
                (event.format === "online" ? "Online" : "Campus");

              return (
                <div key={event.id} className={styles.resultCard}>
                  <div className={styles.resultHeader}>
                    <span className={styles.resultTypeBadge}>EVENT</span>
                    <span
                      className={`${styles.statusBadge} ${
                        isEnded ? styles.statusEnded : styles.statusUpcoming
                      }`}
                    >
                      {isEnded ? "Ended" : "Upcoming"}
                    </span>
                    {event.event_type && (
                      <span className={styles.roleBadge}>
                        {event.event_type.replace(/[-_]/g, " ").toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h3 className={styles.resultTitle}>
                    <Link
                      href={`/dashboard/events/${event.slug || event.id}`}
                      className={styles.resultLink}
                    >
                      {event.title} →
                    </Link>
                  </h3>
                  {event.description && (
                    <p className={styles.resultSnippet}>{event.description}</p>
                  )}
                  <div className={styles.resultMeta}>
                    {dateStr && (
                      <span>
                        <MemberIcon name="calendar" size={13} /> {dateStr}
                      </span>
                    )}
                    {venue && (
                      <span>
                        <MemberIcon name="location" size={13} /> {venue}
                      </span>
                    )}
                    {event.stats?.registered_count !== undefined && (
                      <span>{event.stats.registered_count} registered</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Members */}
      {(activeTab === "all" || activeTab === "members") && members.length > 0 && (
        <section className={styles.section} aria-label="Members">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Members</h2>
            <span className={styles.sectionCount}>{members.length}</span>
          </div>
          <div className={styles.resultsList}>
            {members.map((member) => {
              const name = member.full_name || "Club Member";
              const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase();

              return (
                <div key={member.id || member.email} className={styles.resultCard}>
                  <div className={styles.resultHeader}>
                    <span className={styles.resultTypeBadge}>MEMBER</span>
                    {member.role_label && (
                      <span className={styles.roleBadge}>
                        {member.role_label.toUpperCase()}
                      </span>
                    )}
                    {member.tier && (
                      <span className={styles.tierBadge}>{member.tier.toUpperCase()}</span>
                    )}
                    {member.batch_year && (
                      <span className={styles.tierBadge}>BATCH {member.batch_year}</span>
                    )}
                  </div>
                  <div className={styles.memberRow}>
                    <div className={styles.memberAvatar}>
                      {member.avatar_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={member.avatar_url} alt="" className={styles.avatarImg} />
                      ) : (
                        <span>{initials || "M"}</span>
                      )}
                    </div>
                    <div>
                      <h3 className={styles.resultTitle}>
                        <Link
                          href={`/dashboard/profile?id=${encodeURIComponent(
                            member.id || member.email || ""
                          )}`}
                          className={styles.resultLink}
                        >
                          {name} →
                        </Link>
                      </h3>
                      {member.email && (
                        <span className={styles.memberEmail}>{member.email}</span>
                      )}
                    </div>
                  </div>
                  {member.skills && member.skills.length > 0 && (
                    <div className={styles.skillTags}>
                      {member.skills.slice(0, 5).map((skill) => (
                        <span key={skill} className={styles.skillTag}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {member.points && member.points.total > 0 && (
                    <div className={styles.resultMeta}>
                      <span>{member.points.total} contribution points</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Project groups */}
      {(activeTab === "all" || activeTab === "spgs") && spgs.length > 0 && (
        <section className={styles.section} aria-label="Project groups">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Project groups</h2>
            <span className={styles.sectionCount}>{spgs.length}</span>
          </div>
          <div className={styles.resultsList}>
            {spgs.map((spg) => {
              const isLead = profile?.id && spg.lead_id === profile.id;
              const isMember =
                profile?.id &&
                Array.isArray(spg.member_ids) &&
                spg.member_ids.includes(profile.id);

              return (
                <div key={spg.id} className={styles.resultCard}>
                  <div className={styles.resultHeader}>
                    <span className={styles.resultTypeBadge}>PROJECT</span>
                    <span className={styles.statusBadge}>
                      {spg.status ? spg.status.toUpperCase() : "ACTIVE"}
                    </span>
                    {isLead && <span className={styles.leadBadge}>LEAD</span>}
                    {isMember && !isLead && (
                      <span className={styles.memberRoleBadge}>YOUR PROJECT</span>
                    )}
                  </div>
                  <h3 className={styles.resultTitle}>
                    <Link
                      href={`/dashboard/spg/${encodeURIComponent(spg.id)}`}
                      className={styles.resultLink}
                    >
                      {spg.name} →
                    </Link>
                  </h3>
                  {spg.description && (
                    <p className={styles.resultSnippet}>{spg.description}</p>
                  )}
                  <div className={styles.resultMeta}>
                    {spg.track && <span>{spg.track.toUpperCase()}</span>}
                    {spg.lead_name && <span>Lead: {spg.lead_name}</span>}
                    {Array.isArray(spg.member_ids) && (
                      <span>{spg.member_ids.length} members</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Your tickets */}
      {(activeTab === "all" || activeTab === "tickets") && tickets.length > 0 && (
        <section className={styles.section} aria-label="Your tickets">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Your tickets</h2>
            <span className={styles.sectionCount}>{tickets.length}</span>
          </div>
          <div className={styles.resultsList}>
            {tickets.map((ticket) => (
              <div key={ticket.id} className={styles.resultCard}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultTypeBadge}>TICKET</span>
                  <span className={styles.statusBadge}>
                    {(ticket.status || "open").toUpperCase().replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className={styles.resultTitle}>
                  <Link
                    href={`/dashboard/tickets/${encodeURIComponent(ticket.id)}`}
                    className={styles.resultLink}
                  >
                    {ticket.title} →
                  </Link>
                </h3>
                <div className={styles.resultMeta}>
                  {ticket.category && (
                    <span>{ticket.category.replace(/_/g, " ").toUpperCase()}</span>
                  )}
                  {ticket.created_at && (
                    <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Ideas */}
      {(activeTab === "all" || activeTab === "ideas") && ideas.length > 0 && (
        <section className={styles.section} aria-label="Ideas">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Ideas</h2>
            <span className={styles.sectionCount}>{ideas.length}</span>
          </div>
          <div className={styles.resultsList}>
            {ideas.map((idea) => (
              <div key={idea.id} className={styles.resultCard}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultTypeBadge}>IDEA</span>
                  {idea.difficulty && (
                    <span className={styles.difficultyBadge}>
                      {idea.difficulty.toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className={styles.resultTitle}>
                  <Link
                    href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                    className={styles.resultLink}
                  >
                    {idea.title} →
                  </Link>
                </h3>
                {idea.description && (
                  <p className={styles.resultSnippet}>{idea.description}</p>
                )}
                <div className={styles.resultMeta}>
                  {idea.track && <span>{idea.track.toUpperCase()}</span>}
                  {idea.stats?.upvote_count !== undefined && (
                    <span>{idea.stats.upvote_count} upvotes</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Articles */}
      {(activeTab === "all" || activeTab === "articles") && articles.length > 0 && (
        <section className={styles.section} aria-label="Articles">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Articles</h2>
            <span className={styles.sectionCount}>{articles.length}</span>
          </div>
          <div className={styles.resultsList}>
            {articles.map((article) => (
              <div key={article.id || article.slug} className={styles.resultCard}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultTypeBadge}>ARTICLE</span>
                  {article.kind && (
                    <span className={styles.kindBadge}>
                      {article.kind.toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className={styles.resultTitle}>
                  <Link
                    href={`/dashboard/articles/${encodeURIComponent(article.slug)}`}
                    className={styles.resultLink}
                  >
                    {article.title} →
                  </Link>
                </h3>
                {article.summary && (
                  <p className={styles.resultSnippet}>{article.summary}</p>
                )}
                <div className={styles.resultMeta}>
                  {article.reading_time_minutes && (
                    <span>{article.reading_time_minutes} min read</span>
                  )}
                  {article.stats?.upvote_count !== undefined && (
                    <span>{article.stats.upvote_count} upvotes</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
