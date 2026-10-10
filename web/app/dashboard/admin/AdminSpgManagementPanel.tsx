"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type EventSummaryItem, type IdeaSummary } from "@/lib/api";
import { type SPGRecord, type SPGStatus, type SPGType } from "@/lib/spgData";
import { loadAllSpgs } from "@/lib/memberData";
import { useDebounce } from "@/lib/useDebounce";
import MemberIcon from "@/components/dashboard/MemberIcon";
import AdminTicketsPanel from "./AdminTicketsPanel";
import styles from "./AdminSpgManagement.module.css";

type TabMode = "all" | "events" | "ideas" | "tickets";
type SortOption = "recent" | "reports" | "name" | "members";

export default function AdminSpgManagementPanel({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabQuery = searchParams.get("tab");
  const resolvedTab: TabMode =
    tabQuery === "events"
      ? "events"
      : tabQuery === "ideas"
      ? "ideas"
      : tabQuery === "tickets" || tabQuery === "requests"
      ? "tickets"
      : "all";

  const [activeTab, setActiveTab] = useState<TabMode>(resolvedTab);

  // Sync tab state when URL changes (supports browser Back and Forward buttons)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "events") setActiveTab("events");
    else if (t === "ideas") setActiveTab("ideas");
    else if (t === "tickets" || t === "requests") setActiveTab("tickets");
    else setActiveTab("all");
  }, [searchParams]);

  // Handle tab click with URL path-based navigation
  const handleTabChange = (newTab: TabMode) => {
    setActiveTab(newTab);
    const currentTab = searchParams.get("tab") || "all";
    if (currentTab !== newTab) {
      const params = new URLSearchParams(searchParams.toString());
      if (newTab === "all") {
        params.delete("tab");
      } else {
        params.set("tab", newTab);
      }
      const qs = params.toString();
      router.push(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  };

  const [spgs, setSpgs] = useState<SPGRecord[]>([]);
  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // User profile resolution cache
  const [membersMap, setMembersMap] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});

  // Quick Edit Modal State
  const [editingSpg, setEditingSpg] = useState<SPGRecord | null>(null);
  const [editType, setEditType] = useState<SPGType>("learning");
  const [editVisibility, setEditVisibility] = useState<"public" | "private">("private");
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Action busy states
  const [busySpgId, setBusySpgId] = useState<string | null>(null);

  // Fetch all SPGs, Events & Idea Jar proposals
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [spgList, eventRes, ideaRes] = await Promise.all([
        loadAllSpgs(token),
        api.listEvents(token, { limit: 100 }).catch(() => ({ events: [], total: 0 })),
        api.listIdeas("", 1, 100).catch(() => ({ items: [], total: 0, has_more: false, page: 1, page_size: 100 })),
      ]);
      setSpgs(spgList);
      setEvents(eventRes.events || []);

      setIdeas(ideaRes.items || []);

      // Resolve member names and avatars
      const leadUids = [...new Set(spgList.map((s) => s.lead_id).filter(Boolean))];
      void Promise.allSettled(leadUids.map((uid) => api.getUserProfile(token, uid))).then((results) => {
        const resolved: Record<string, { full_name: string; avatar_url?: string | null }> = {};
        results.forEach((res, idx) => {
          if (res.status === "fulfilled" && res.value) {
            resolved[leadUids[idx]] = {
              full_name: res.value.full_name || leadUids[idx],
              avatar_url: res.value.avatar_url || null,
            };
          }
        });
        setMembersMap((prev) => ({ ...prev, ...resolved }));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SPGs.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Event ID to Event Map
  const eventLookup = useMemo(() => {
    const map = new Map<string, EventSummaryItem>();
    events.forEach((ev) => map.set(ev.id, ev));
    return map;
  }, [events]);

  // Idea ID to Idea Map
  const ideaLookup = useMemo(() => {
    const map = new Map<string, IdeaSummary>();
    ideas.forEach((idItem) => map.set(idItem.id, idItem));
    return map;
  }, [ideas]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const total = spgs.length;
    const active = spgs.filter((s) => s.status === "active").length;
    const project = spgs.filter((s) => s.type === "project").length;
    const learning = spgs.filter((s) => s.type === "learning").length;
    const eventGroups = spgs.filter((s) => Boolean(s.event_id) || s.type === "event" || s.type === "external_event").length;
    const ideaGroups = spgs.filter((s) => Boolean(s.idea_id) || s.is_idea_derived).length;
    const reports = spgs.reduce((acc, s) => acc + (s.report_count || 0), 0);
    return { total, active, project, learning, eventGroups, ideaGroups, reports };
  }, [spgs]);

  // Handle Lifecycle Status Transitions
  const handleToggleStatus = async (spg: SPGRecord) => {
    if (busySpgId) return;
    setBusySpgId(spg.id);
    setNotice("");
    try {
      let updated: SPGRecord;
      if (spg.status === "active") {
        updated = await api.adminPauseSpg(token, spg.id);
        setNotice(`SPG "${spg.name}" has been paused.`);
      } else if (spg.status === "paused") {
        updated = await api.adminResumeSpg(token, spg.id);
        setNotice(`SPG "${spg.name}" has been resumed.`);
      } else {
        return;
      }
      setSpgs((prev) => prev.map((s) => (s.id === spg.id ? { ...s, status: updated.status } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setBusySpgId(null);
    }
  };

  const handleDisbandSpg = async (spg: SPGRecord) => {
    if (busySpgId) return;
    if (!window.confirm(`Are you sure you want to permanently disband "${spg.name}"? This action cannot be undone.`)) {
      return;
    }
    setBusySpgId(spg.id);
    setNotice("");
    try {
      const updated = await api.adminDisbandSpg(token, spg.id);
      setNotice(`SPG "${spg.name}" has been disbanded.`);
      setSpgs((prev) => prev.map((s) => (s.id === spg.id ? { ...s, status: updated.status } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disband failed.");
    } finally {
      setBusySpgId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (spg: SPGRecord) => {
    setEditingSpg(spg);
    setEditType(spg.type);
    setEditVisibility(spg.visibility);
    setEditName(spg.name);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editingSpg || !token) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const payload: Partial<SPGRecord> = {
        name: editName.trim() || editingSpg.name,
        type: editType,
        visibility: editVisibility,
      };
      const updated = await api.updateSpg(token, editingSpg.id, payload);
      setSpgs((prev) =>
        prev.map((s) =>
          s.id === editingSpg.id
            ? {
                ...s,
                name: updated.name || payload.name!,
                type: updated.type || editType,
                visibility: updated.visibility || editVisibility,
              }
            : s
        )
      );
      setNotice(`Updated "${editingSpg.name}" specs.`);
      setEditingSpg(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save edits.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Filtered & Sorted SPG list (for All SPGs tab)
  const filteredSpgs = useMemo(() => {
    return spgs
      .filter((spg) => {
        // Status Filter
        if (statusFilter !== "all" && spg.status !== statusFilter) {
          return false;
        }

        // Track Filter
        if (trackFilter !== "all" && spg.track !== trackFilter) {
          return false;
        }

        // Category Type Filter
        if (typeFilter !== "all" && spg.type !== typeFilter) {
          return false;
        }

        // Search Query Filter
        if (debouncedSearch.trim()) {
          const q = debouncedSearch.trim().toLowerCase();
          const lead = membersMap[spg.lead_id]?.full_name?.toLowerCase() || "";
          const eventTitle = (spg.event_id ? eventLookup.get(spg.event_id)?.title : "")?.toLowerCase() || "";
          const matchesName = spg.name.toLowerCase().includes(q);
          const matchesLead = lead.includes(q) || spg.lead_id.toLowerCase().includes(q);
          const matchesDesc = (spg.description || "").toLowerCase().includes(q);
          const matchesEvent = eventTitle.includes(q);
          if (!matchesName && !matchesLead && !matchesDesc && !matchesEvent) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "reports") {
          return (b.report_count || 0) - (a.report_count || 0);
        }
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "members") {
          return (b.member_ids?.length || 0) - (a.member_ids?.length || 0);
        }
        // default: recent
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
  }, [spgs, statusFilter, trackFilter, typeFilter, debouncedSearch, membersMap, eventLookup, sortBy]);

  // Group teams by Event for the Event SPGs tab
  const { eventSections, unlinkedEventTeams } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    const sections = events.map((event) => {
      // Find all SPGs belonging to this event
      const teams = spgs.filter((spg) => {
        const matchesEvent = spg.event_id === event.id || spg.event_id === event.slug;
        if (!matchesEvent) return false;

        if (statusFilter !== "all" && spg.status !== statusFilter) return false;
        if (trackFilter !== "all" && spg.track !== trackFilter) return false;

        return true;
      });

      const eventMatchesQuery =
        !q ||
        event.title.toLowerCase().includes(q) ||
        (event.description || "").toLowerCase().includes(q) ||
        (event.track || "").toLowerCase().includes(q);

      const matchingTeams = !q
        ? teams
        : teams.filter((spg) => {
            const lead = membersMap[spg.lead_id]?.full_name?.toLowerCase() || "";
            return (
              spg.name.toLowerCase().includes(q) ||
              lead.includes(q) ||
              spg.lead_id.toLowerCase().includes(q) ||
              (spg.description || "").toLowerCase().includes(q)
            );
          });

      const shouldInclude = !q ? true : eventMatchesQuery || matchingTeams.length > 0;

      return {
        event,
        teams: q && !eventMatchesQuery ? matchingTeams : matchingTeams,
        shouldInclude,
      };
    }).filter((s) => s.shouldInclude);

    // Collect external / unlinked event teams
    const unlinked = spgs.filter((spg) => {
      const isEventGroup = spg.type === "event" || spg.type === "external_event" || spg.is_event_derived;
      if (!isEventGroup) return false;

      const matchesListedEvent = events.some((ev) => spg.event_id === ev.id || spg.event_id === ev.slug);
      if (matchesListedEvent) return false;

      if (statusFilter !== "all" && spg.status !== statusFilter) return false;
      if (trackFilter !== "all" && spg.track !== trackFilter) return false;

      if (q) {
        const lead = membersMap[spg.lead_id]?.full_name?.toLowerCase() || "";
        return (
          spg.name.toLowerCase().includes(q) ||
          lead.includes(q) ||
          spg.lead_id.toLowerCase().includes(q) ||
          (spg.description || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    return {
      eventSections: sections,
      unlinkedEventTeams: unlinked,
    };
  }, [events, spgs, debouncedSearch, statusFilter, trackFilter, membersMap]);

  // Group teams by Idea for the Idea Jar SPGs tab
  const { ideaSections, unlinkedIdeaTeams } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    const sections = ideas
      .map((idea) => {
        // Find all SPGs belonging to this idea
        const teams = spgs.filter((spg) => {
          const matchesIdea = spg.idea_id === idea.id;
          if (!matchesIdea) return false;

          if (statusFilter !== "all" && spg.status !== statusFilter) return false;
          if (trackFilter !== "all" && spg.track !== trackFilter) return false;

          return true;
        });

        const ideaMatchesQuery =
          !q ||
          idea.title.toLowerCase().includes(q) ||
          (idea.description || "").toLowerCase().includes(q) ||
          (idea.track || "").toLowerCase().includes(q);

        const matchingTeams = !q
          ? teams
          : teams.filter((spg) => {
              const lead = membersMap[spg.lead_id]?.full_name?.toLowerCase() || "";
              return (
                spg.name.toLowerCase().includes(q) ||
                lead.includes(q) ||
                spg.lead_id.toLowerCase().includes(q) ||
                (spg.description || "").toLowerCase().includes(q)
              );
            });

        const shouldInclude = !q ? true : ideaMatchesQuery || matchingTeams.length > 0;

        return {
          idea,
          teams: matchingTeams,
          shouldInclude,
        };
      })
      .filter((s) => s.shouldInclude);

    // Collect external / unlinked idea teams
    const unlinked = spgs.filter((spg) => {
      const isIdeaGroup = Boolean(spg.idea_id) || spg.is_idea_derived;
      if (!isIdeaGroup) return false;

      const matchesListedIdea = ideas.some((i) => spg.idea_id === i.id);
      if (matchesListedIdea) return false;

      if (statusFilter !== "all" && spg.status !== statusFilter) return false;
      if (trackFilter !== "all" && spg.track !== trackFilter) return false;

      if (q) {
        const lead = membersMap[spg.lead_id]?.full_name?.toLowerCase() || "";
        return (
          spg.name.toLowerCase().includes(q) ||
          lead.includes(q) ||
          spg.lead_id.toLowerCase().includes(q) ||
          (spg.description || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    return {
      ideaSections: sections,
      unlinkedIdeaTeams: unlinked,
    };
  }, [ideas, spgs, debouncedSearch, statusFilter, trackFilter, membersMap]);

  const activeFiltersCount = [
    statusFilter !== "all",
    trackFilter !== "all",
    activeTab === "all" && typeFilter !== "all",
    Boolean(debouncedSearch.trim()),
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter("all");
    setTrackFilter("all");
    setTypeFilter("all");
    setSearchQuery("");
  };

  const formatEventDate = (startStr?: string): string => {
    if (!startStr) return "Date TBD";
    try {
      const d = new Date(startStr);
      if (!Number.isFinite(d.getTime())) return "Date TBD";
      return d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Date TBD";
    }
  };

  const getTrackBadgeClass = (track: string) => {
    switch (track) {
      case "kaggle":
        return `${styles.trackBadge} ${styles.trackBadgeKaggle}`;
      case "product":
        return `${styles.trackBadge} ${styles.trackBadgeProduct}`;
      case "research":
        return `${styles.trackBadge} ${styles.trackBadgeResearch}`;
      default:
        return `${styles.trackBadge} ${styles.trackBadgeGeneral}`;
    }
  };

  const getStatusClass = (status: SPGStatus) => {
    switch (status) {
      case "active":
        return `${styles.statusPill} ${styles.statusActive}`;
      case "paused":
        return `${styles.statusPill} ${styles.statusPaused}`;
      case "completed":
        return `${styles.statusPill} ${styles.statusCompleted}`;
      case "disbanded":
        return `${styles.statusPill} ${styles.statusDisbanded}`;
      default:
        return styles.statusPill;
    }
  };

  const getTypeBadgeClass = (type: SPGType) => {
    if (type === "project") return `${styles.typeBadge} ${styles.typeBadgeProject}`;
    if (type === "event" || type === "external_event") return `${styles.typeBadge} ${styles.typeBadgeEvent}`;
    return styles.typeBadge;
  };

  const renderSpgCard = (spg: SPGRecord) => {
    const leadProfile = membersMap[spg.lead_id];
    const leadName = leadProfile?.full_name || spg.lead_name || spg.lead_id;
    const leadAvatar = leadProfile?.avatar_url;
    const initials =
      leadName
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase() || "LD";
    const eventInfo = spg.event_id ? eventLookup.get(spg.event_id) : null;
    const isBusy = busySpgId === spg.id;

    return (
      <article key={spg.id} className={styles.spgCard}>
        <div className={styles.spgHeader}>
          <div className={styles.titleArea}>
            <div className={styles.badgesRow}>
              <span className={getTrackBadgeClass(spg.track)}>{spg.track}</span>
              <span className={getTypeBadgeClass(spg.type)}>
                {spg.type === "project"
                  ? "Project SPG"
                  : spg.type === "learning"
                  ? "Learning SPG"
                  : spg.type === "event" || spg.type === "external_event"
                  ? "Event Team"
                  : spg.type}
              </span>
              <span className={getStatusClass(spg.status)}>{spg.status}</span>
            </div>
            <h3 className={styles.spgName} title={spg.name}>
              {spg.name}
            </h3>
          </div>
        </div>

        {spg.description && (
          <p className={styles.spgDescription} title={spg.description}>
            {spg.description}
          </p>
        )}

        {/* Linked Event Pill when rendered in All SPGs tab */}
        {spg.event_id && activeTab !== "events" && (
          <div className={styles.eventAttachedBox}>
            <MemberIcon name="calendar" size={13} />
            <span>Event:</span>
            <Link
              href={`/dashboard/events/${encodeURIComponent(spg.event_id)}`}
              className={styles.eventAttachedLink}
              title={eventInfo?.title || spg.event_id}
            >
              {eventInfo?.title || spg.event_id} ↗
            </Link>
          </div>
        )}

        {/* Linked Idea Jar Pill when rendered in All SPGs or Events tab */}
        {spg.idea_id && activeTab !== "ideas" && (
          <div className={styles.eventAttachedBox} style={{ borderColor: "rgba(234, 179, 8, 0.35)", background: "rgba(234, 179, 8, 0.05)" }}>
            <MemberIcon name="sparkles" size={13} />
            <span style={{ color: "#facc15" }}>Idea:</span>
            <Link
              href={`/dashboard/ideas/${encodeURIComponent(spg.idea_id)}`}
              className={styles.eventAttachedLink}
              title={ideaLookup.get(spg.idea_id)?.title || spg.idea_id}
              style={{ color: "#fef08a" }}
            >
              {ideaLookup.get(spg.idea_id)?.title || spg.idea_id} ↗
            </Link>
          </div>
        )}

        {/* Team & Lead Meta */}
        <div className={styles.teamSection}>
          <div className={styles.leadInfo}>
            <div className={styles.leadAvatar}>
              {leadAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={leadAvatar} alt={leadName} className={styles.leadAvatarImg} />
              ) : (
                initials
              )}
            </div>
            <div className={styles.leadDetails}>
              <span className={styles.leadName} title={leadName}>
                {leadName}
              </span>
              <span className={styles.leadRole}>Team Lead</span>
            </div>
          </div>

          <div className={styles.memberCountBadge}>
            <MemberIcon name="users" size={12} />
            <span>
              {spg.member_ids?.length || 1} {spg.member_ids?.length === 1 ? "Member" : "Members"}
            </span>
          </div>
        </div>

        {/* Stats & Ledger Info */}
        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <MemberIcon name="articles" size={12} />
            <span>{spg.report_count || 0} Reports</span>
          </div>
          <div className={styles.statItem}>
            <MemberIcon name="check-circle" size={12} />
            <span>{spg.milestone_count || 0} Milestones</span>
          </div>
          <div className={styles.statItem}>
            <MemberIcon name="eye" size={12} />
            <span style={{ textTransform: "capitalize" }}>{spg.visibility}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.cardActions}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Link href={`/dashboard/admin/spgs/${encodeURIComponent(spg.id)}`} className={styles.viewHubBtn} style={{ background: "#E5B731", color: "#0c0c0e" }}>
              Admin Inspect ⚙
            </Link>
            <Link href={`/dashboard/spg/${encodeURIComponent(spg.id)}`} className={styles.viewHubBtn}>
              Student Hub ↗
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              className={styles.actionMenuBtn}
              onClick={() => openEditModal(spg)}
              title="Edit Type, Visibility or Name"
            >
              <MemberIcon name="edit" size={12} />
              Specs
            </button>

            {spg.status === "active" && (
              <button
                type="button"
                className={styles.actionMenuBtn}
                disabled={isBusy}
                onClick={() => void handleToggleStatus(spg)}
                title="Pause this group"
              >
                {isBusy ? "..." : "Pause"}
              </button>
            )}

            {spg.status === "paused" && (
              <button
                type="button"
                className={`${styles.actionMenuBtn} ${styles.actionBtnPrimary}`}
                disabled={isBusy}
                onClick={() => void handleToggleStatus(spg)}
                title="Resume this group"
              >
                {isBusy ? "..." : "Resume"}
              </button>
            )}

            {spg.status !== "disbanded" && (
              <button
                type="button"
                className={`${styles.actionMenuBtn} ${styles.actionBtnDanger}`}
                disabled={isBusy}
                onClick={() => void handleDisbandSpg(spg)}
                title="Disband SPG"
              >
                Disband
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className={styles.container}>
      {/* Top KPI Metrics Strip */}
      <section className={styles.kpiStrip} aria-label="SPG Ecosystem Metrics">
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="spg" size={14} /> Total Clusters
          </span>
          <span className={styles.kpiValue}>{metrics.total}</span>
          <span className={styles.kpiSubtext}>Registered across all tracks</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="check" size={14} /> Active Groups
          </span>
          <span className={styles.kpiValue} style={{ color: "#4ade80" }}>
            {metrics.active}
          </span>
          <span className={styles.kpiSubtext}>{metrics.total - metrics.active} paused or completed</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="articles" size={14} /> Project vs Learning
          </span>
          <span className={styles.kpiValue} style={{ color: "var(--brand, #E5B731)" }}>
            {metrics.project} <span style={{ fontSize: "1rem", color: "#8c8c98", fontWeight: 600 }}>/ {metrics.learning}</span>
          </span>
          <span className={styles.kpiSubtext}>Projects with milestones vs Study</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="calendar" size={14} /> Event SPGs
          </span>
          <span className={styles.kpiValue} style={{ color: "#fca5a5" }}>
            {metrics.eventGroups}
          </span>
          <span className={styles.kpiSubtext}>Hackathons &amp; Competition teams</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="sparkles" size={14} /> Idea Jar SPGs
          </span>
          <span className={styles.kpiValue} style={{ color: "#facc15" }}>
            {metrics.ideaGroups}
          </span>
          <span className={styles.kpiSubtext}>Spawned from community jar</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <MemberIcon name="clock" size={14} /> Reports Filed
          </span>
          <span className={styles.kpiValue}>{metrics.reports}</span>
          <span className={styles.kpiSubtext}>Audited progress submissions</span>
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className={styles.tabsBar}>
        <div className={styles.tabsGroup}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("all")}
          >
            <MemberIcon name="spg" size={15} />
            All SPGs
            <span className={styles.tabCount}>{metrics.total}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "events" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("events")}
          >
            <MemberIcon name="calendar" size={15} />
            Event SPGs
            <span className={styles.tabCount}>{metrics.eventGroups}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "ideas" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("ideas")}
          >
            <MemberIcon name="sparkles" size={15} />
            Idea Jar SPGs
            <span className={styles.tabCount}>{metrics.ideaGroups}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "tickets" ? styles.tabBtnActive : ""}`}
            onClick={() => handleTabChange("tickets")}
          >
            <MemberIcon name="tickets" size={15} />
            Registration Requests
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px", padding: "10px 14px", color: "#4ade80", fontSize: "0.8rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: "14px" }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", padding: "10px 14px", color: "#fca5a5", fontSize: "0.8rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: "14px" }}>✕</button>
        </div>
      )}

      {/* Tab 3: Registration Requests Queue */}
      {activeTab === "tickets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <AdminTicketsPanel token={token} spgOnly />
        </div>
      )}

      {/* Tabs 1, 2 & 3: SPG Management Grid */}
      {activeTab !== "tickets" && (
        <>
          {/* Controls Bar */}
          <div className={styles.controlsBar}>
            <div className={styles.searchRow}>
              <div className={styles.searchBox}>
                <span className={styles.searchIcon}>
                  <MemberIcon name="search" size={16} />
                </span>
                <input
                  type="text"
                  placeholder={
                    activeTab === "events"
                      ? "Search events, teams, team leads, or topics..."
                      : activeTab === "ideas"
                      ? "Search ideas, derived SPGs, leads, or tracks..."
                      : "Search by SPG name, lead, event, or description..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
                {searchQuery && (
                  <button type="button" className={styles.clearSearchBtn} onClick={() => setSearchQuery("")}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className={styles.filtersRow}>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
              >
                <option value="all">Any Status</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="disbanded">Disbanded</option>
              </select>

              <select
                className={styles.filterSelect}
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                aria-label="Filter by Track"
              >
                <option value="all">Any Track</option>
                <option value="research">Research</option>
                <option value="product">Product</option>
                <option value="kaggle">Kaggle</option>
                <option value="general">General</option>
              </select>

              {activeTab === "all" && (
                <select
                  className={styles.filterSelect}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filter by Category Type"
                >
                  <option value="all">Any Type</option>
                  <option value="project">Project SPG</option>
                  <option value="learning">Learning SPG</option>
                  <option value="event">Club Event</option>
                  <option value="external_event">External Event</option>
                  <option value="miscellaneous">Other</option>
                </select>
              )}

              {activeTab === "all" && (
                <select
                  className={styles.filterSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort SPGs"
                >
                  <option value="recent">Sort: Recently Created</option>
                  <option value="reports">Sort: Most Reports Filed</option>
                  <option value="name">Sort: Name (A–Z)</option>
                  <option value="members">Sort: Team Size</option>
                </select>
              )}

              {activeFiltersCount > 0 && (
                <>
                  <span className={styles.activeFiltersCount}>
                    {activeFiltersCount} active {activeFiltersCount === 1 ? "filter" : "filters"}
                  </span>
                  <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                    Reset All
                  </button>
                </>
              )}
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "40px", color: "#8c8c98" }}>
              Loading project clusters…
            </div>
          )}

          {/* TAB 1: All SPGs Grid */}
          {!loading && activeTab === "all" && (
            <>
              {filteredSpgs.length === 0 && (
                <div className={styles.emptyState}>
                  <MemberIcon name="spg" size={32} />
                  <h3 className={styles.emptyStateTitle}>No project clusters found</h3>
                  <p className={styles.emptyStateText}>
                    {searchQuery || activeFiltersCount > 0
                      ? "No SPGs matched your search query or filter criteria. Try clearing some filters."
                      : "No SPGs have been created yet."}
                  </p>
                  {activeFiltersCount > 0 && (
                    <button type="button" className={styles.resetBtn} onClick={resetFilters} style={{ marginTop: "10px" }}>
                      Clear Filters
                    </button>
                  )}
                </div>
              )}

              {filteredSpgs.length > 0 && (
                <div className={styles.spgGrid}>
                  {filteredSpgs.map((spg) => renderSpgCard(spg))}
                </div>
              )}
            </>
          )}

          {/* TAB 2: Event SPGs — Grouped by Event */}
          {!loading && activeTab === "events" && (
            <div className={styles.eventsContainer}>
              {eventSections.map(({ event, teams }) => {
                return (
                  <section key={event.id} className={styles.eventCard}>
                    <div className={styles.eventCardHeader}>
                      <div className={styles.eventInfo}>
                        <div className={styles.eventTitleRow}>
                          <h3 className={styles.eventTitle}>{event.title}</h3>
                          <span className={getTrackBadgeClass(event.track)}>{event.track}</span>
                          <span className={styles.typeBadge} style={{ textTransform: "capitalize" }}>
                            {event.event_type || "Event"}
                          </span>
                          <span className={styles.statusPill} style={{ background: "#22222a", color: "#a1a1aa" }}>
                            {event.status}
                          </span>
                        </div>
                        <div className={styles.eventMetaRow}>
                          <span className={styles.eventMetaItem}>
                            <MemberIcon name="calendar" size={13} />
                            {formatEventDate(event.schedule?.start_time)}
                          </span>
                          {event.format && (
                            <span className={styles.eventMetaItem} style={{ textTransform: "capitalize" }}>
                              • {event.format}
                            </span>
                          )}
                          {event.venue_info?.venue_name && (
                            <span className={styles.eventMetaItem}>
                              • {event.venue_info.venue_name}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className={styles.eventDescription}>{event.description}</p>
                        )}
                      </div>

                      <div className={styles.eventHeaderActions}>
                        <span
                          className={`${styles.eventTeamCountBadge} ${
                            teams.length > 0 ? styles.eventTeamCountBadgeActive : ""
                          }`}
                        >
                          <MemberIcon name="users" size={13} />
                          {teams.length} {teams.length === 1 ? "Team Registered" : "Teams Registered"}
                        </span>
                        <Link
                          href={`/dashboard/events/${encodeURIComponent(event.id)}`}
                          className={styles.eventViewLink}
                        >
                          Event Details ↗
                        </Link>
                      </div>
                    </div>

                    {teams.length > 0 ? (
                      <div className={styles.eventTeamsGrid}>
                        {teams.map((spg) => renderSpgCard(spg))}
                      </div>
                    ) : (
                      <div className={styles.eventEmptyTeams}>
                        <span>No teams registered yet for this event.</span>
                        <span style={{ color: "#71717a" }}>
                          Teams formed for this event will appear here.
                        </span>
                      </div>
                    )}
                  </section>
                );
              })}

              {unlinkedEventTeams.length > 0 && (
                <section className={styles.eventCard}>
                  <div className={styles.eventCardHeader}>
                    <div className={styles.eventInfo}>
                      <div className={styles.eventTitleRow}>
                        <h3 className={styles.eventTitle}>External &amp; Independent Hackathons</h3>
                        <span className={styles.typeBadge}>External Event</span>
                      </div>
                      <div className={styles.eventMetaRow}>
                        <span>Teams formed for external competitions and unlisted hackathons</span>
                      </div>
                    </div>
                    <div className={styles.eventHeaderActions}>
                      <span className={`${styles.eventTeamCountBadge} ${styles.eventTeamCountBadgeActive}`}>
                        <MemberIcon name="users" size={13} />
                        {unlinkedEventTeams.length} {unlinkedEventTeams.length === 1 ? "Team" : "Teams"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.eventTeamsGrid}>
                    {unlinkedEventTeams.map((spg) => renderSpgCard(spg))}
                  </div>
                </section>
              )}

              {eventSections.length === 0 && unlinkedEventTeams.length === 0 && (
                <div className={styles.emptyState}>
                  <MemberIcon name="calendar" size={32} />
                  <h3 className={styles.emptyStateTitle}>No events found</h3>
                  <p className={styles.emptyStateText}>
                    {debouncedSearch
                      ? "No events or event teams matched your search query."
                      : "No events are currently scheduled where SPGs can be created."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Idea Jar SPGs — Grouped by Idea Proposal */}
          {!loading && activeTab === "ideas" && (
            <div className={styles.eventsContainer}>
              {ideaSections.map(({ idea, teams }) => {
                const cardTheme = idea.is_featured
                  ? styles.ideaCardGold
                  : idea.difficulty?.toLowerCase() === "beginner"
                  ? styles.ideaCardGreen
                  : idea.difficulty?.toLowerCase() === "intermediate"
                  ? styles.ideaCardBlue
                  : idea.difficulty?.toLowerCase() === "advanced"
                  ? styles.ideaCardPurple
                  : styles.ideaCardGreen;

                return (
                  <section
                    key={idea.id}
                    className={`${styles.eventCard} ${cardTheme}`}
                  >
                    <div className={styles.eventCardHeader}>
                      <div className={styles.eventInfo}>
                        <div className={styles.eventTitleRow}>
                          <h3 className={styles.eventTitle}>{idea.title}</h3>
                          <span className={getTrackBadgeClass(idea.track)}>{idea.track}</span>
                          {idea.difficulty && (
                            <span
                              className={styles.typeBadge}
                              style={{
                                textTransform: "capitalize",
                                color:
                                  idea.difficulty?.toLowerCase() === "beginner"
                                    ? "#4ade80"
                                    : idea.difficulty?.toLowerCase() === "intermediate"
                                    ? "#38bdf8"
                                    : "#c084fc",
                              }}
                            >
                              ⚡ {idea.difficulty}
                            </span>
                          )}
                          {idea.spg_creation_type && (
                            <span className={styles.typeBadge} style={{ textTransform: "uppercase" }}>
                              Target: {idea.spg_creation_type} SPG
                            </span>
                          )}
                          {idea.is_featured && (
                            <span
                              className={styles.statusPill}
                              style={{
                                background: "rgba(234, 179, 8, 0.15)",
                                color: "#fde047",
                                borderColor: "rgba(234, 179, 8, 0.4)",
                              }}
                            >
                              ★ Featured
                            </span>
                          )}
                        </div>
                        <div className={styles.eventMetaRow}>
                          <span className={styles.eventMetaItem}>
                            <MemberIcon name="sparkles" size={13} />
                            Idea Ref: #{idea.id}
                          </span>
                          <span className={styles.eventMetaItem}>
                            • ▲ {idea.stats?.upvote_count || 0} Upvotes
                          </span>
                          <span className={styles.eventMetaItem}>
                            • 👁 {idea.stats?.views_count || 0} Views
                          </span>
                        </div>
                        {idea.description && (
                          <p className={styles.eventDescription}>{idea.description}</p>
                        )}
                      </div>

                      <div className={styles.eventHeaderActions}>
                        <span
                          className={`${styles.eventTeamCountBadge} ${
                            teams.length > 0 ? styles.eventTeamCountBadgeActive : ""
                          }`}
                          style={teams.length > 0 ? { borderColor: "#facc15", color: "#facc15" } : undefined}
                        >
                          <MemberIcon name="users" size={13} />
                          {teams.length} {teams.length === 1 ? "SPG Formed" : "SPGs Formed"}
                        </span>
                        <Link
                          href={`/dashboard/ideas/${encodeURIComponent(idea.id)}`}
                          className={styles.eventViewLink}
                        >
                          View Idea Proposal ↗
                        </Link>
                      </div>
                    </div>

                    {teams.length > 0 ? (
                      <div className={styles.eventTeamsGrid}>
                        {teams.map((spg) => renderSpgCard(spg))}
                      </div>
                    ) : (
                      <div className={styles.eventEmptyTeams}>
                        <span>No project groups formed from this idea yet.</span>
                        <span style={{ color: "#71717a" }}>
                          When members charter an SPG referencing this idea jar proposal, it will appear here.
                        </span>
                      </div>
                    )}
                  </section>
                );
              })}

              {unlinkedIdeaTeams.length > 0 && (
                <section className={`${styles.eventCard} ${styles.ideaCardGreen}`}>
                  <div className={styles.eventCardHeader}>
                    <div className={styles.eventInfo}>
                      <div className={styles.eventTitleRow}>
                        <h3 className={styles.eventTitle}>Custom &amp; Independent Idea Jar Proposals</h3>
                        <span className={styles.typeBadge}>Idea Derived</span>
                      </div>
                      <div className={styles.eventMetaRow}>
                        <span>Teams spawned from user-submitted or unlisted ideas</span>
                      </div>
                    </div>
                    <div className={styles.eventHeaderActions}>
                      <span className={`${styles.eventTeamCountBadge} ${styles.eventTeamCountBadgeActive}`}>
                        <MemberIcon name="users" size={13} />
                        {unlinkedIdeaTeams.length} {unlinkedIdeaTeams.length === 1 ? "Team" : "Teams"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.eventTeamsGrid}>
                    {unlinkedIdeaTeams.map((spg) => renderSpgCard(spg))}
                  </div>
                </section>
              )}

              {ideaSections.length === 0 && unlinkedIdeaTeams.length === 0 && (
                <div className={styles.emptyState}>
                  <MemberIcon name="sparkles" size={32} />
                  <h3 className={styles.emptyStateTitle}>No Idea Jar entries found</h3>
                  <p className={styles.emptyStateText}>
                    {debouncedSearch
                      ? "No ideas or idea-derived SPGs matched your search query."
                      : "No ideas are currently registered in the Idea Jar."}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Quick Edit Specs Modal */}
      {editingSpg && (
        <div className={styles.modalBackdrop} onClick={() => setEditingSpg(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit SPG Specs</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setEditingSpg(null)}>
                ✕
              </button>
            </div>

            {editError && (
              <div style={{ color: "#ef4444", fontSize: "0.78rem" }}>{editError}</div>
            )}

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cluster Name</label>
                <input
                  type="text"
                  className={styles.searchInput}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="SPG Name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Category Type (Promote / Change)</label>
                <select
                  className={styles.filterSelect}
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as SPGType)}
                >
                  <option value="project">Project SPG</option>
                  <option value="learning">Learning SPG</option>
                  <option value="event">Club Event SPG</option>
                  <option value="external_event">External Event SPG</option>
                  <option value="miscellaneous">Other / Miscellaneous</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Visibility</label>
                <select
                  className={styles.filterSelect}
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as "public" | "private")}
                >
                  <option value="private">Private (Team only)</option>
                  <option value="public">Public (Visible in discovery)</option>
                </select>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                disabled={savingEdit}
                onClick={() => setEditingSpg(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalSaveBtn}
                disabled={savingEdit}
                onClick={() => void handleSaveEdit()}
              >
                {savingEdit ? "Saving..." : "Save Specs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
