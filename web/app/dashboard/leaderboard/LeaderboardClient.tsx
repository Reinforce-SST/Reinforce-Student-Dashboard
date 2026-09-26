"use client";

import { useState, useEffect, useCallback } from "react";

import Link from "next/link";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberLoading from "@/components/dashboard/MemberLoading";
import { useMember } from "@/lib/useMember";

import { api, type StudentProfile, type TrackPoints } from "@/lib/api";
import { type LeaderboardEntry } from "@/lib/leaderboardData";
import styles from "./Leaderboard.module.css";

export default function LeaderboardClient() {
  const { token, profile: currentProfile } = useMember();
  const [viewMode, setViewMode] = useState<"LEADERBOARD" | "DIRECTORY">("LEADERBOARD");
  const [selectedTrack, setSelectedTrack] = useState<"total" | "research" | "product" | "kaggle">("total");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<StudentProfile | null>(null);

  const [members, setMembers] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch live members/leaderboard from backend API
  const fetchDirectoryData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await api.browseUsers(token, {
        search: searchQuery.trim() || undefined,
        track: selectedTrack !== "total" ? selectedTrack : undefined,
        tier: selectedTier !== "all" ? selectedTier : undefined,
      }).catch(() => null);

      if (res && res.items) {
        setMembers(res.items);
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [token, searchQuery, selectedTrack, selectedTier]);


  useEffect(() => {
    fetchDirectoryData();
  }, [fetchDirectoryData]);

  // Compute leaderboard entries sorted by selected track score
  const sortedLeaderboard: LeaderboardEntry[] = [...members]
    .map((m) => {
      const points: TrackPoints = m.points || { total: 0, research: 0, product: 0, kaggle: 0, misc: 0 };
      return {
        id: m.id || m.email,
        full_name: m.full_name || "Club Member",
        avatar_url: m.avatar_url,
        is_member: Boolean(m.is_member),
        tier: m.tier || "beginner",
        points,
        rank: 1,
      };
    })
    .filter((entry) => {
      // Tier filter
      if (selectedTier !== "all" && entry.tier !== selectedTier) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = entry.full_name.toLowerCase().includes(q);
        const originalMember = members.find((m) => m.id === entry.id);
        const matchSkills = originalMember?.skills?.some((s) => s.toLowerCase().includes(q));
        const matchBio = (originalMember?.bio || "").toLowerCase().includes(q);
        if (!matchName && !matchSkills && !matchBio) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const scoreA = a.points[selectedTrack] ?? a.points.total;
      const scoreB = b.points[selectedTrack] ?? b.points.total;
      return scoreB - scoreA;
    })
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  // Directory filtered list
  const filteredDirectory = members.filter((m) => {
    if (selectedTier !== "all" && m.tier !== selectedTier) return false;
    if (selectedTrack !== "total") {
      const trackScore = m.points?.[selectedTrack] || 0;
      if (trackScore <= 0) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = m.full_name.toLowerCase().includes(q);
      const matchSkills = m.skills?.some((s) => s.toLowerCase().includes(q));
      const matchBio = (m.bio || "").toLowerCase().includes(q);
      if (!matchName && !matchSkills && !matchBio) return false;
    }
    return true;
  });

  const getInitials = (name?: string) => {
    if (!name) return "MB";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getDominantTrackClass = (points?: TrackPoints) => {
    if (!points) return styles.trackPillRes;
    const { research = 0, product = 0, kaggle = 0 } = points;
    if (research >= product && research >= kaggle) return styles.trackPillRes;
    if (product >= research && product >= kaggle) return styles.trackPillProd;
    return styles.trackPillKag;
  };

  const openProfileModal = (memberId: string) => {
    const found = members.find((m) => m.id === memberId || m.email === memberId);
    if (found) setSelectedMember(found);
  };

  // Top 3 Podium
  const top1 = sortedLeaderboard[0];
  const top2 = sortedLeaderboard[1];
  const top3 = sortedLeaderboard[2];

  if (loading && members.length === 0) {
    return <MemberLoading message="Loading student leaderboard & rankings…" />;
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header Row: Title & View Switcher */}

      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>LEADERBOARD & DIRECTORY</h1>
          <p className={styles.pageSubtitle}>
            {viewMode === "LEADERBOARD"
              ? "Rankings of club builders, sprint contributors, and domain masters."
              : "Search and browse the student member directory and collaborative profiles."}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className={styles.viewSwitcher} role="tablist" aria-label="Page View Mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "LEADERBOARD"}
            onClick={() => setViewMode("LEADERBOARD")}
            className={`${styles.viewTabBtn} ${viewMode === "LEADERBOARD" ? styles.viewTabActive : ""}`}
          >
            <MemberIcon name="award" size={15} />
            <span>RANKINGS</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "DIRECTORY"}
            onClick={() => setViewMode("DIRECTORY")}
            className={`${styles.viewTabBtn} ${viewMode === "DIRECTORY" ? styles.viewTabActive : ""}`}
          >
            <MemberIcon name="users" size={15} />
            <span>BROWSE MEMBERS</span>
          </button>
        </div>
      </div>

      {/* Filter Row: Track Tabs & Search Box */}
      <div className={styles.filterRow}>
        {/* Track Pills */}
        <div className={styles.trackTabs}>
          <button
            type="button"
            onClick={() => setSelectedTrack("total")}
            className={`${styles.trackBtn} ${selectedTrack === "total" ? styles.trackBtnActiveTotal : ""}`}
          >
            OVERALL SCORE
          </button>

          <button
            type="button"
            onClick={() => setSelectedTrack("research")}
            className={`${styles.trackBtn} ${selectedTrack === "research" ? styles.trackBtnActiveResearch : ""}`}
          >
            RESEARCH TRACK
          </button>

          <button
            type="button"
            onClick={() => setSelectedTrack("product")}
            className={`${styles.trackBtn} ${selectedTrack === "product" ? styles.trackBtnActiveProduct : ""}`}
          >
            PRODUCT TRACK
          </button>

          <button
            type="button"
            onClick={() => setSelectedTrack("kaggle")}
            className={`${styles.trackBtn} ${selectedTrack === "kaggle" ? styles.trackBtnActiveKaggle : ""}`}
          >
            KAGGLE TRACK
          </button>
        </div>

        {/* Search & Tier Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className={styles.searchBox}>
            <MemberIcon name="filter" size={14} />
            <input
              type="text"
              placeholder="Search by name, skill, or bio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className={styles.trackBtn}
            style={{ cursor: "pointer", outline: "none" }}
            aria-label="Filter by member tier"
          >
            <option value="all">ALL TIERS</option>
            <option value="advanced">ADVANCED</option>
            <option value="beginner">BEGINNER</option>
          </select>
        </div>
      </div>

      {/* VIEW MODE 1: LEADERBOARD RANKINGS */}
      {viewMode === "LEADERBOARD" && (
        <>
          {/* Top 3 Podium Cards */}
          {sortedLeaderboard.length >= 3 && !searchQuery.trim() && (
            <section className={styles.podiumSection} aria-label="Top 3 Contributors Podium">
              {/* Rank 2 (Silver) */}
              {top2 && (
                <article
                  className={`${styles.podiumCard} ${styles.podiumSecond}`}
                  onClick={() => openProfileModal(top2.id)}
                >
                  <span className={`${styles.podiumRankBadge} ${styles.rankSecondBadge}`}>#2</span>
                  <div className={styles.podiumAvatar}>
                    {getInitials(top2.full_name)}
                  </div>
                  <h2 className={styles.podiumName}>
                    {top2.full_name}
                    <MemberIcon name="check" size={14} />
                  </h2>
                  <span className={styles.podiumScore}>
                    {top2.points[selectedTrack] ?? top2.points.total} PTS
                  </span>
                  <div className={styles.podiumPointsMeta}>
                    <span style={{ color: "#f87171" }}>R: {top2.points.research}</span>
                    <span style={{ color: "#4ade80" }}>P: {top2.points.product}</span>
                    <span style={{ color: "#38c8ff" }}>K: {top2.points.kaggle}</span>
                  </div>
                  <Link
                    href={`/dashboard/profile?id=${encodeURIComponent(top2.id)}`}
                    className={styles.podiumViewProfileBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Profile →
                  </Link>
                </article>
              )}

              {/* Rank 1 (Gold - Center) */}
              {top1 && (
                <article
                  className={`${styles.podiumCard} ${styles.podiumFirst}`}
                  onClick={() => openProfileModal(top1.id)}
                >
                  <span className={`${styles.podiumRankBadge} ${styles.rankFirstBadge}`}>👑 #1</span>
                  <div className={styles.podiumAvatar}>
                    {getInitials(top1.full_name)}
                  </div>
                  <h2 className={styles.podiumName}>
                    {top1.full_name}
                    <MemberIcon name="check" size={14} />
                  </h2>
                  <span className={styles.podiumScore}>
                    {top1.points[selectedTrack] ?? top1.points.total} PTS
                  </span>
                  <div className={styles.podiumPointsMeta}>
                    <span style={{ color: "#f87171" }}>R: {top1.points.research}</span>
                    <span style={{ color: "#4ade80" }}>P: {top1.points.product}</span>
                    <span style={{ color: "#38c8ff" }}>K: {top1.points.kaggle}</span>
                  </div>
                  <Link
                    href={`/dashboard/profile?id=${encodeURIComponent(top1.id)}`}
                    className={styles.podiumViewProfileBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Profile →
                  </Link>
                </article>
              )}

              {/* Rank 3 (Bronze) */}
              {top3 && (
                <article
                  className={`${styles.podiumCard} ${styles.podiumThird}`}
                  onClick={() => openProfileModal(top3.id)}
                >
                  <span className={`${styles.podiumRankBadge} ${styles.rankThirdBadge}`}>#3</span>
                  <div className={styles.podiumAvatar}>
                    {getInitials(top3.full_name)}
                  </div>
                  <h2 className={styles.podiumName}>
                    {top3.full_name}
                    <MemberIcon name="check" size={14} />
                  </h2>
                  <span className={styles.podiumScore}>
                    {top3.points[selectedTrack] ?? top3.points.total} PTS
                  </span>
                  <div className={styles.podiumPointsMeta}>
                    <span style={{ color: "#f87171" }}>R: {top3.points.research}</span>
                    <span style={{ color: "#4ade80" }}>P: {top3.points.product}</span>
                    <span style={{ color: "#38c8ff" }}>K: {top3.points.kaggle}</span>
                  </div>
                  <Link
                    href={`/dashboard/profile?id=${encodeURIComponent(top3.id)}`}
                    className={styles.podiumViewProfileBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Profile →
                  </Link>
                </article>
              )}
            </section>
          )}

          {/* Full Rankings Table */}
          <section className={styles.tableCard} aria-label="Ecosystem Rankings List">
            <div className={styles.tableHeader}>
              <span>RANK</span>
              <span>MEMBER</span>
              <span className={styles.tierCol}>TIER</span>
              <span className={styles.trackCol}>TRACK BREAKDOWN</span>
              <span style={{ textAlign: "right" }}>SCORE</span>
              <span style={{ textAlign: "right" }}>PROFILE</span>
            </div>

            <div className={styles.tableBody}>
              {sortedLeaderboard.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center", color: "#8c8c98", fontSize: "0.85rem" }}>
                  No members found on the leaderboard matching your search or filters.
                </div>
              ) : (
                sortedLeaderboard.map((entry) => {
                  const originalMember = members.find((m) => m.id === entry.id || m.email === entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={styles.tableRow}
                      onClick={() => openProfileModal(entry.id)}
                    >
                      {/* Rank */}
                      <span className={`${styles.rankNumber} ${entry.rank <= 3 ? styles.rankGold : ""}`}>
                        {entry.rank === 1 ? "🥇 1" : entry.rank === 2 ? "🥈 2" : entry.rank === 3 ? "🥉 3" : `#${entry.rank}`}
                      </span>

                      {/* Member Details */}
                      <div className={styles.memberCol}>
                        <div className={styles.tableAvatar}>
                          {getInitials(entry.full_name)}
                        </div>
                        <div className={styles.memberNameGroup}>
                          <span className={styles.memberNameText}>
                            {entry.full_name}
                            {originalMember?.is_verified && (
                              <span style={{ color: "#5865F2", fontSize: "0.8rem" }} title="Verified Discord Member">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className={styles.memberBioMuted}>
                            {originalMember?.bio || "Reinforce Club Member"}
                          </span>
                        </div>
                      </div>

                      {/* Tier */}
                      <div className={styles.tierCol}>
                        <span className={`${styles.tierChip} ${entry.tier === "advanced" ? styles.tierAdvanced : styles.tierBeginner}`}>
                          {entry.tier.toUpperCase()}
                        </span>
                      </div>

                      {/* Track Breakdown */}
                      <div className={styles.trackCol}>
                        <div className={styles.trackPillsGroup}>
                          <span className={styles.trackPillRes}>R: {entry.points.research}</span>
                          <span className={styles.trackPillProd}>P: {entry.points.product}</span>
                          <span className={styles.trackPillKag}>K: {entry.points.kaggle}</span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className={styles.scoreCol}>
                        {entry.points[selectedTrack] ?? entry.points.total} PTS
                      </div>

                      {/* View Profile Action */}
                      <div className={styles.actionCol}>
                        <Link
                          href={`/dashboard/profile?id=${encodeURIComponent(entry.id)}`}
                          className={styles.rowViewProfileBtn}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Profile →
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      {/* VIEW MODE 2: BROWSE DIRECTORY */}
      {viewMode === "DIRECTORY" && (
        <section className={styles.directoryGrid} aria-label="Student Member Directory">
          {filteredDirectory.length === 0 ? (
            <div className={styles.tableCard} style={{ gridColumn: "1 / -1", padding: "48px 24px", textAlign: "center", color: "#8c8c98", fontSize: "0.85rem" }}>
              No student profiles found matching your search or filters.
            </div>
          ) : (
            filteredDirectory.map((member) => (
              <article
                key={member.id || member.email}
                className={styles.memberCard}
                onClick={() => setSelectedMember(member)}
              >
                {/* Card Top: Avatar & Name */}
                <div className={styles.memberCardTop}>
                  <div className={styles.memberCardHeader}>
                    <div className={styles.cardAvatar}>
                      {getInitials(member.full_name)}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <h2 style={{ fontSize: "0.96rem", fontWeight: "800", color: "#ffffff", margin: 0 }}>
                          {member.full_name}
                        </h2>
                        {member.is_verified && (
                          <span style={{ color: "#5865F2", fontSize: "0.8rem" }} title="Verified Discord Member">
                            ✓
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.68rem", color: "#8c8c98" }}>
                        Batch &apos;{member.batch_year ? String(member.batch_year).slice(-2) : "24"} • {member.tier?.toUpperCase() || "MEMBER"}
                      </span>
                    </div>
                  </div>

                  <span className={getDominantTrackClass(member.points)}>
                    {member.points?.total || 0} PTS
                  </span>
                </div>

                {/* Bio */}
                <p className={styles.cardBio}>
                  {member.bio || "Active contributor and project builder in Reinforce SST guild."}
                </p>

                {/* Skills Tags */}
                <div className={styles.skillsRow}>
                  {member.skills?.slice(0, 4).map((skill, idx) => (
                    <span key={idx} className={styles.skillPill}>
                      {skill}
                    </span>
                  ))}
                  {(member.skills?.length || 0) > 4 && (
                    <span className={styles.skillPill}>
                      +{(member.skills?.length || 0) - 4}
                    </span>
                  )}
                </div>

                {/* Card Footer: Social Links & Action */}
                <div className={styles.cardFooter}>
                  <div className={styles.cardSocialLinks}>
                    {member.social_links?.github && (
                      <a
                        href={member.social_links.github}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.socialIconBtn}
                        onClick={(e) => e.stopPropagation()}
                        title="GitHub Profile"
                      >
                        <MemberIcon name="github" size={14} />
                      </a>
                    )}
                    {member.social_links?.discord && (
                      <span className={styles.socialIconBtn} title={`Discord: ${member.social_links.discord}`}>
                        <MemberIcon name="discord" size={14} />
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/profile?id=${encodeURIComponent(member.id || member.email)}`}
                    className={styles.rowViewProfileBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    VIEW PROFILE →
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      )}


      {/* Member Profile Preview Modal */}
      {selectedMember && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedMember(null)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="profile-modal-title"
          >
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setSelectedMember(null)}
              aria-label="Close profile drawer"
            >
              ✕
            </button>

            {/* Profile Hero Header */}
            <div className={styles.profileHero}>
              <div className={styles.profileAvatarLarge}>
                {getInitials(selectedMember.full_name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2 id="profile-modal-title" style={{ fontSize: "1.25rem", fontWeight: "900", color: "#ffffff", margin: 0 }}>
                    {selectedMember.full_name}
                  </h2>
                  {selectedMember.is_verified && (
                    <span style={{ color: "#5865F2", fontSize: "0.95rem" }} title="Verified Discord Link">
                      ✓
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className={`${styles.tierChip} ${selectedMember.tier === "advanced" ? styles.tierAdvanced : styles.tierBeginner}`}>
                    {selectedMember.tier?.toUpperCase() || "MEMBER"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#8c8c98" }}>
                    Batch of {selectedMember.batch_year || 2024}
                  </span>
                </div>
              </div>
            </div>

            {/* Track Points Grid */}
            <div className={styles.profilePointsGrid}>
              <div className={styles.pointsBox}>
                <span className={styles.pointsBoxLabel}>Total Merit</span>
                <span className={styles.pointsBoxValue} style={{ color: "var(--brand, #E5B731)" }}>
                  {selectedMember.points?.total || 0}
                </span>
              </div>
              <div className={styles.pointsBox}>
                <span className={styles.pointsBoxLabel}>Research</span>
                <span className={styles.pointsBoxValue} style={{ color: "#f87171" }}>
                  {selectedMember.points?.research || 0}
                </span>
              </div>
              <div className={styles.pointsBox}>
                <span className={styles.pointsBoxLabel}>Product</span>
                <span className={styles.pointsBoxValue} style={{ color: "#4ade80" }}>
                  {selectedMember.points?.product || 0}
                </span>
              </div>
              <div className={styles.pointsBox}>
                <span className={styles.pointsBoxLabel}>Kaggle</span>
                <span className={styles.pointsBoxValue} style={{ color: "#38c8ff" }}>
                  {selectedMember.points?.kaggle || 0}
                </span>
              </div>
            </div>

            {/* Bio Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: "800", color: "#70707a", textTransform: "uppercase" }}>
                About & Research Interests
              </span>
              <p style={{ fontSize: "0.84rem", color: "#d2d2dc", margin: 0, lineHeight: 1.6 }}>
                {selectedMember.bio || "No biography provided yet."}
              </p>
            </div>

            {/* Technical Skills */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: "800", color: "#70707a", textTransform: "uppercase" }}>
                Verified Skills & Technologies
              </span>
              <div className={styles.skillsRow}>
                {selectedMember.skills && selectedMember.skills.length > 0 ? (
                  selectedMember.skills.map((skill, idx) => (
                    <span key={idx} className={styles.skillPill} style={{ padding: "4px 10px", fontSize: "0.74rem" }}>
                      {skill}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: "0.78rem", color: "#70707a" }}>No skills listed</span>
                )}
              </div>
            </div>

            {/* Social & Guild Presence */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid #1e1e24" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {selectedMember.social_links?.github && (
                  <a
                    href={selectedMember.social_links.github}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9da3ae", textDecoration: "none", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <MemberIcon name="github" size={14} />
                    GitHub
                  </a>
                )}
                {selectedMember.social_links?.linkedin && (
                  <a
                    href={selectedMember.social_links.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9da3ae", textDecoration: "none", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    LinkedIn
                  </a>
                )}
                {selectedMember.social_links?.discord && (
                  <span style={{ color: "#9da3ae", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <MemberIcon name="discord" size={14} />
                    {selectedMember.social_links.discord}
                  </span>
                )}
              </div>

              <Link
                href={`/dashboard/profile?id=${encodeURIComponent(selectedMember.id || selectedMember.email)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "var(--brand, #E5B731)",
                  color: "#0c0c0e",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "0.76rem",
                  fontWeight: "800",
                  textDecoration: "none",
                  boxShadow: "0 3px 10px rgba(229, 183, 49, 0.25)",
                }}
              >
                View Full Profile →
              </Link>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
