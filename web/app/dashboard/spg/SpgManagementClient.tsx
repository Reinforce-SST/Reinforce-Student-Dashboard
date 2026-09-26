"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import { type SPGRecord, fallbackSpgs } from "@/lib/spgData";
import styles from "./SpgManagement.module.css";

export default function SpgManagementClient() {
  const { token, profile } = useMember();
  const [scopeTab, setScopeTab] = useState<"MY_SPGS" | "PUBLIC_SPGS">("MY_SPGS");
  const [activeStatus, setActiveStatus] = useState<"ALL" | "ACTIVE" | "COMPLETED" | "ARCHIVED">("ALL");
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [spgs, setSpgs] = useState<SPGRecord[]>(fallbackSpgs);
  const [loading, setLoading] = useState(false);

  // Fetch SPGs from Backend API
  const fetchSpgs = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await api.listSpgs(token, {
        track: selectedTrack !== "all" ? selectedTrack : undefined,
      }).catch(() => null);

      if (res && res.items && res.items.length > 0) {
        setSpgs(res.items);
      }
    } catch {
      // Retain fallback data
    } finally {
      setLoading(false);
    }
  }, [token, selectedTrack]);

  useEffect(() => {
    fetchSpgs();
  }, [fetchSpgs]);

  // Current member identifier
  const myId = profile?.id || profile?.email || "";

  const isUserMember = (cluster: SPGRecord) => {
    if (!myId) return true; // fallback preview
    const matchesLead = cluster.lead_id === myId;
    const matchesMembers = cluster.member_ids?.includes(myId);
    const matchesEmail =
      Boolean(profile?.email) &&
      cluster.member_ids?.some(
        (m) => m.toLowerCase() === profile.email.toLowerCase()
      );
    const matchesName =
      Boolean(profile?.full_name) &&
      Boolean(cluster.member_names) &&
      Object.values(cluster.member_names || {}).some(
        (n) => n.toLowerCase() === profile.full_name.toLowerCase()
      );

    // Fallback: If user is default student demo, Julian Chen's SPGs match
    const isDemoJulian = myId === "usr_julian_chen" || !profile?.id;
    const isJulianSpg =
      cluster.lead_id === "usr_julian_chen" ||
      cluster.member_ids?.includes("usr_julian_chen");

    return matchesLead || matchesMembers || matchesEmail || matchesName || (isDemoJulian && isJulianSpg);
  };

  const isUserLead = (cluster: SPGRecord) => {
    if (!myId) return false;
    if (cluster.lead_id === myId) return true;
    if (profile?.full_name && cluster.lead_name?.toLowerCase() === profile.full_name.toLowerCase()) return true;
    if (myId === "usr_julian_chen" && cluster.lead_id === "usr_julian_chen") return true;
    return false;
  };

  // Counts for scope tabs
  const mySpgsAll = spgs.filter(isUserMember);
  const publicSpgsAll = spgs.filter((s) => s.visibility === "public");

  const filteredClusters = spgs.filter((cluster) => {
    // 1. Scope filter
    if (scopeTab === "MY_SPGS") {
      if (!isUserMember(cluster)) return false;
    } else {
      if (cluster.visibility !== "public") return false;
    }

    // 2. Status filter
    if (activeStatus === "ACTIVE" && cluster.status !== "active" && cluster.status !== "paused") {
      return false;
    }
    if (activeStatus === "COMPLETED" && cluster.status !== "completed") {
      return false;
    }
    if (activeStatus === "ARCHIVED" && cluster.status !== "disbanded") {
      return false;
    }

    // 3. Track filter
    if (selectedTrack !== "all" && cluster.track !== selectedTrack) {
      return false;
    }

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = cluster.name.toLowerCase().includes(q);
      const matchDesc = (cluster.description || "").toLowerCase().includes(q);
      const matchLead = (cluster.lead_name || cluster.lead_id).toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchLead) return false;
    }

    return true;
  });

  const getAccentClass = (track: string) => {
    switch (track) {
      case "research":
        return styles.accentBarRed;
      case "product":
        return styles.accentBarGreen;
      case "kaggle":
        return styles.accentBarBlue;
      default:
        return styles.accentBarRed;
    }
  };

  const getStatusClass = (track: string) => {
    switch (track) {
      case "research":
        return styles.statusResearch;
      case "product":
        return styles.statusProduct;
      case "kaggle":
        return styles.statusKaggle;
      default:
        return styles.statusResearch;
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "MB";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Schema-Ground Stats Computation
  // MY SPGS STATS:
  const myActiveCount = mySpgsAll.filter((s) => s.status === "active").length;
  const myLedCount = mySpgsAll.filter(isUserLead).length;
  const myCollabCount = mySpgsAll.length - myLedCount;
  const myReportsTotal = mySpgsAll.reduce((acc, curr) => acc + (curr.report_count || 0), 0);
  const myRecruitingRolesCount = mySpgsAll
    .filter((s) => s.is_recruiting)
    .reduce((acc, curr) => acc + (curr.recruiting_roles?.length || 0), 0);

  // PUBLIC SPGS STATS:
  const publicActiveCount = publicSpgsAll.filter((s) => s.status === "active").length;
  const publicResearchCount = publicSpgsAll.filter((s) => s.track === "research").length;
  const publicProductCount = publicSpgsAll.filter((s) => s.track === "product").length;
  const publicKaggleCount = publicSpgsAll.filter((s) => s.track === "kaggle").length;
  const publicReportsTotal = publicSpgsAll.reduce((acc, curr) => acc + (curr.report_count || 0), 0);
  const publicRecruitingClusters = publicSpgsAll.filter((s) => s.is_recruiting).length;

  return (
    <div className={styles.pageContainer}>
      {/* Top Header Row with Title & Scope Switcher */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>PROJECT CLUSTERS (SPG)</h1>
          <p className={styles.pageSubtitle}>
            {scopeTab === "MY_SPGS"
              ? "Your active Student Project Groups, leadership responsibilities, and reports."
              : "Discover public Student Project Groups across Research, Product, and Kaggle domains."}
          </p>
        </div>

        {/* Scope Tabs (My SPGs vs All Public SPGs) */}
        <div className={styles.scopeTabs} role="tablist" aria-label="SPG View Scope">
          <button
            type="button"
            role="tab"
            aria-selected={scopeTab === "MY_SPGS"}
            onClick={() => setScopeTab("MY_SPGS")}
            className={`${styles.scopeTabBtn} ${scopeTab === "MY_SPGS" ? styles.scopeTabActive : ""}`}
          >
            <MemberIcon name="users" size={15} />
            <span>MY SPGS</span>
            <span className={styles.scopeCountBadge}>{mySpgsAll.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={scopeTab === "PUBLIC_SPGS"}
            onClick={() => setScopeTab("PUBLIC_SPGS")}
            className={`${styles.scopeTabBtn} ${scopeTab === "PUBLIC_SPGS" ? styles.scopeTabActive : ""}`}
          >
            <MemberIcon name="articles" size={15} />
            <span>ALL PUBLIC SPGS</span>
            <span className={styles.scopeCountBadge}>{publicSpgsAll.length}</span>
          </button>
        </div>
      </div>

      {/* Secondary Filter & Search Row */}
      <div className={styles.subFilterRow}>
        {/* Status Tabs */}
        <div className={styles.filterTabs} role="tablist">
          {(["ALL", "ACTIVE", "COMPLETED", "ARCHIVED"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeStatus === tab}
              onClick={() => setActiveStatus(tab)}
              className={`${styles.tabBtn} ${activeStatus === tab ? styles.tabActive : ""}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Search Box */}
          <div className={styles.searchBox}>
            <MemberIcon name="filter" size={14} />
            <input
              type="text"
              placeholder="Search by name, lead, or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Track Filter Toggle */}
          <button
            type="button"
            className={styles.filterIconBtn}
            onClick={() =>
              setSelectedTrack(
                selectedTrack === "all"
                  ? "research"
                  : selectedTrack === "research"
                  ? "product"
                  : selectedTrack === "product"
                  ? "kaggle"
                  : "all"
              )
            }
            aria-label="Filter project clusters by track"
            title={`Current Track Filter: ${selectedTrack.toUpperCase()}`}
          >
            <MemberIcon name="filter" size={16} />
          </button>
        </div>
      </div>

      {/* Top 4 Schema-Driven Metrics Cards */}
      <section className={styles.metricsGrid} aria-label="SPG Ecosystem Overview Metrics">
        {scopeTab === "MY_SPGS" ? (
          <>
            {/* Metric 1: My Active SPGs */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>ENROLLED SPGS</span>
              <span className={styles.metricValue}>{String(myActiveCount).padStart(2, "0")}</span>
              <span className={styles.metricSubtext}>Active project workspaces</span>
            </div>

            {/* Metric 2: Leadership Breakdown */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>LEADERSHIP ROLE</span>
              <span className={styles.metricValueSmall}>
                {myLedCount > 0 ? `${myLedCount} Led • ` : ""}{myCollabCount} Collaborating
              </span>
              <span className={styles.metricSubtext}>Designated responsibility</span>
            </div>

            {/* Metric 3: Reports Filed */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>MILESTONES FILED</span>
              <span className={`${styles.metricValue} ${styles.metricVelocity}`}>+{myReportsTotal}</span>
              <span className={styles.metricSubtext}>Sprint updates published</span>
            </div>

            {/* Metric 4: Open Roles */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>TEAM RECRUITMENT</span>
              <span className={`${styles.metricValue} ${styles.metricPending}`}>
                {myRecruitingRolesCount} Roles
              </span>
              <span className={styles.metricSubtext}>Open skill vacancies</span>
            </div>
          </>
        ) : (
          <>
            {/* Metric 1: Public Active Clusters */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>ACTIVE PUBLIC CLUSTERS</span>
              <span className={styles.metricValue}>{String(publicActiveCount).padStart(2, "0")}</span>
              <span className={styles.metricSubtext}>Publicly discoverable</span>
            </div>

            {/* Metric 2: Track Distribution */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>TRACK DISTRIBUTION</span>
              <span className={styles.metricValueSmall}>
                {publicResearchCount} Res • {publicProductCount} Prod • {publicKaggleCount} Kag
              </span>
              <span className={styles.metricSubtext}>Club domain breakdown</span>
            </div>

            {/* Metric 3: Total Milestone Reports */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>TOTAL PROGRESS REPORTS</span>
              <span className={`${styles.metricValue} ${styles.metricVelocity}`}>+{publicReportsTotal}</span>
              <span className={styles.metricSubtext}>Verified milestone history</span>
            </div>

            {/* Metric 4: Recruiting Groups */}
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>OPEN FOR COLLABORATION</span>
              <span className={`${styles.metricValue} ${styles.metricPending}`}>
                {publicRecruitingClusters} Groups
              </span>
              <span className={styles.metricSubtext}>Actively seeking members</span>
            </div>
          </>
        )}
      </section>

      {/* 3-Column Projects Grid */}
      <section className={styles.projectsGrid} aria-label="Active Project Clusters">
        {filteredClusters.length === 0 ? (
          <div className={styles.emptyStateCard}>
            <div className={styles.emptyStateIcon}>
              <MemberIcon name="users" size={24} />
            </div>
            <h2 className={styles.emptyStateTitle}>
              {scopeTab === "MY_SPGS"
                ? "No Projects in Your Workspace"
                : "No Public SPGs Matching Filters"}
            </h2>
            <p className={styles.emptyStateDesc}>
              {scopeTab === "MY_SPGS"
                ? "You are not currently enrolled in any project groups matching this filter. You can propose a new SPG charter or explore active public groups in the All Public SPGs tab."
                : "Try adjusting your track or status filters to discover active student project groups."}
            </p>
            <div className={styles.emptyStateActions}>
              <Link
                href="/dashboard/tickets?type=spg_registration"
                className={styles.emptyPrimaryBtn}
              >
                <MemberIcon name="plus" size={15} />
                Propose New SPG (Charter)
              </Link>
              {scopeTab === "MY_SPGS" && (
                <button
                  type="button"
                  onClick={() => setScopeTab("PUBLIC_SPGS")}
                  className={styles.emptySecondaryBtn}
                >
                  Browse Public Directory →
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredClusters.map((cluster) => {
            const initialsList = cluster.member_ids.slice(0, 3).map((uid) => {
              const name = cluster.member_names?.[uid] || uid;
              return getInitials(name);
            });
            const extraCount = Math.max(0, cluster.member_ids.length - 3);

            return (
              <article
                key={cluster.id}
                className={`${styles.projectCard} ${getAccentClass(cluster.track)}`}
              >
                {/* Card Top: Status Tag + Cluster Type */}
                <div className={styles.cardTopRow}>
                  <span className={`${styles.statusPill} ${getStatusClass(cluster.track)}`}>
                    {cluster.track.toUpperCase()} TRACK
                  </span>
                  <span className={styles.clusterCode}>
                    {cluster.type.toUpperCase()} SPG
                  </span>
                </div>

                {/* Project Info */}
                <div className={styles.cardBody}>
                  <h2 className={styles.projectTitle}>{cluster.name}</h2>
                  <p className={styles.projectDesc}>
                    {cluster.description || "Active Student Project Group."}
                  </p>

                  {/* Badges & Tags Row (Recruiting, Event-linked) */}
                  <div className={styles.cardTagsRow}>
                    {cluster.is_recruiting && (
                      <span className={styles.recruitingChip}>
                        <MemberIcon name="plus" size={10} />
                        Recruiting ({cluster.recruiting_roles?.length || 0} roles)
                      </span>
                    )}

                    {cluster.is_event_derived && (
                      <span className={styles.linkedPill}>
                        🏆 Event-Linked
                      </span>
                    )}

                    {cluster.idea_id && (
                      <span className={styles.linkedPill} style={{ color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.1)" }}>
                        💡 Idea Jar
                      </span>
                    )}
                  </div>
                </div>

                {/* Schema Grounded Specs: Milestones, Lead, and Team Size */}
                <div className={styles.reportRowsSection}>
                  <div className={styles.reportRow}>
                    <span className={styles.reportRowLabel}>Milestones Filed -</span>
                    <span className={`${styles.reportRowValue} ${styles.reportHighlight}`}>
                      {cluster.report_count} {cluster.report_count === 1 ? "Report" : "Reports"}
                    </span>
                  </div>
                  <div className={styles.reportRow}>
                    <span className={styles.reportRowLabel}>Project Lead -</span>
                    <span className={styles.reportRowValue}>
                      {cluster.lead_name || cluster.lead_id}
                    </span>
                  </div>
                  <div className={styles.reportRow}>
                    <span className={styles.reportRowLabel}>Active Team -</span>
                    <span className={styles.reportRowValue}>
                      {cluster.member_ids.length} {cluster.member_ids.length === 1 ? "Member" : "Members"}
                    </span>
                  </div>
                </div>

                {/* Card Footer: Avatar Stack & Open Suite Link */}
                <div className={styles.cardFooter}>
                  <div className={styles.avatarStack} aria-label="Team Members">
                    {initialsList.map((initials, index) => (
                      <span
                        key={index}
                        className={`${styles.stackAvatar} ${
                          index === 0 ? styles.avatarGold : styles.avatarDark
                        }`}
                      >
                        {initials}
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span className={`${styles.stackAvatar} ${styles.avatarExtra}`}>
                        +{extraCount}
                      </span>
                    )}
                  </div>

                  <Link href={`/dashboard/spg/${cluster.id}`} className={styles.openSuiteBtn}>
                    OPEN SUITE →
                  </Link>
                </div>
              </article>
            );
          })
        )}

        {/* Propose New SPG Card (Shown in active tab) */}
        {activeStatus === "ALL" || activeStatus === "ACTIVE" ? (
          <Link
            href="/dashboard/tickets?type=spg_registration"
            className={styles.proposeCard}
            aria-label="Propose a new Student Project Group"
          >
            <div className={styles.proposeIconBox}>
              <MemberIcon name="plus" size={20} />
            </div>
            <h2 className={styles.proposeTitle}>Propose New SPG</h2>
            <p className={styles.proposeSubtitle}>
              Submit a registration charter for a new Research or Product focused cluster.
            </p>
          </Link>
        ) : null}
      </section>
    </div>
  );
}
