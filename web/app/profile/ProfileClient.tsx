"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMember } from "@/lib/useMember";
import { api, type StudentProfile, type TrackPoints } from "@/lib/api";
import MemberIcon, { type IconName } from "@/components/dashboard/MemberIcon";
import styles from "./Profile.module.css";



// ---------------------------------------------------------------------------
// Schemas strictly derived from server/app/schemas/users.py & contributions.py
// ---------------------------------------------------------------------------
export type ContributionTrack = "research" | "product" | "kaggle" | "misc";

export type ContributionCategory =
  | "achievement"
  | "project_work"
  | "teaching"
  | "mentorship"
  | "content"
  | "organizing"
  | "service"
  | "other";

export interface ContributionItem {
  id: string;
  title: string;
  track: ContributionTrack;
  category: ContributionCategory;
  categoryLabel: string;
  points: number;
  occurredAt: string;
  status: "approved" | "pending" | "reviewed";
  description: string;
  sourceType?: "project" | "blog" | "trophy_item";
  sourceId?: string;
  spgId?: string;
}

const mockContributions: ContributionItem[] = [
  {
    id: "cnt_99a8b1",
    title: "Shipped Autonomous Drone Swarms v2.1 RL Policy",
    track: "research",
    category: "project_work",
    categoryLabel: "Project Work",
    points: 50,
    occurredAt: "Sep 24, 2025",
    status: "approved",
    description: "Completed distributed policy rollout iteration with 4x A100 GPU cluster allocation for SP-1.",
    sourceType: "project",
    spgId: "SP-1 Autonomous Drone Swarms",
  },
  {
    id: "cnt_88c7d2",
    title: "Kaggle Multimodal Video Grounding Grandmaster Silver Medal",
    track: "kaggle",
    category: "achievement",
    categoryLabel: "Achievement",
    points: 60,
    occurredAt: "Sep 18, 2025",
    status: "approved",
    description: "Ranked Top 2% globally among 1,400+ international teams with vision-language temporal grounding model.",
    sourceType: "trophy_item",
  },
  {
    id: "cnt_77e6f3",
    title: "Built Decentralized Compute Resource Broker Prototype",
    track: "product",
    category: "project_work",
    categoryLabel: "Product Work",
    points: 40,
    occurredAt: "Sep 10, 2025",
    status: "approved",
    description: "Engineered student workstation GPU pooling daemon and telemetry bridge for SP-2.",
    sourceType: "project",
    spgId: "SP-2 Decentralized Compute",
  },
  {
    id: "cnt_66a5b4",
    title: "Authored Deep-Dive: Deploying LLMs with vLLM & Triton Kernels",
    track: "research",
    category: "content",
    categoryLabel: "Technical Content",
    points: 30,
    occurredAt: "Aug 29, 2025",
    status: "approved",
    description: "Published peer-reviewed guide on custom paged-attention kernels in the Reinforce Article Hub.",
    sourceType: "blog",
  },
  {
    id: "cnt_55c4d5",
    title: "Conducted Hands-on Workshop: PyTorch Distributed Data Parallel",
    track: "misc",
    category: "teaching",
    categoryLabel: "Teaching & Workshop",
    points: 25,
    occurredAt: "Aug 15, 2025",
    status: "approved",
    description: "Taught 45+ club members multi-GPU training, gradient synchronization, and NCCL tuning.",
  },
  {
    id: "cnt_44e3f6",
    title: "Mentored 3 Junior SPG Teams for Reinforce HackSprint v3.0",
    track: "misc",
    category: "mentorship",
    categoryLabel: "Mentorship",
    points: 20,
    occurredAt: "Jul 28, 2025",
    status: "approved",
    description: "Provided architecture reviews and debugging guidance for freshman teams.",
  },
];

// 52-week Contribution Heatmap generator with realistic activity distribution
function generateHeatmapData() {
  const weeks = 52;
  const daysPerWeek = 7;
  const grid: { level: number; date: string; count: number; points: number }[][] = [];

  const startDate = new Date(2024, 9, 1); // Approx 1 year ago

  for (let w = 0; w < weeks; w++) {
    const weekDays = [];
    for (let d = 0; d < daysPerWeek; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + (w * 7 + d));
      
      const dateStr = currentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      // Synthetic density pattern
      const rand = (w * 13 + d * 7 + (w % 3) * 11) % 100;
      let level = 0;
      let count = 0;
      let points = 0;

      if (rand > 82) {
        level = 4;
        count = 3 + (rand % 3);
        points = count * 15;
      } else if (rand > 65) {
        level = 3;
        count = 2;
        points = 25;
      } else if (rand > 45) {
        level = 2;
        count = 1;
        points = 15;
      } else if (rand > 25) {
        level = 1;
        count = 1;
        points = 5;
      }

      weekDays.push({ level, date: dateStr, count, points });
    }
    grid.push(weekDays);
  }
  return grid;
}

function ProfileClientContent() {
  const { token, profile: loggedInProfile, save } = useMember();
  const searchParams = useSearchParams();
  const queryId = searchParams ? searchParams.get("id") || searchParams.get("uid") : null;

  // Determine if viewing own profile or someone else's
  const isOwner = useMemo(() => {
    if (!queryId) return true;
    if (loggedInProfile?.id && loggedInProfile.id === queryId) return true;
    if (loggedInProfile?.email && loggedInProfile.email.toLowerCase() === queryId.toLowerCase()) return true;
    if (loggedInProfile?.discord_id && loggedInProfile.discord_id === queryId) return true;
    return false;
  }, [queryId, loggedInProfile]);

  const [activeProfile, setActiveProfile] = useState<StudentProfile | null>(loggedInProfile || null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Sync profile when queryId changes or when own profile updates
  useEffect(() => {
    if (isOwner) {
      setActiveProfile(loggedInProfile);
      setNotFound(false);
      return;
    }

    if (!queryId) return;

    let isMounted = true;
    setLoading(true);

    // Try pulling user profile from backend API
    api.getUserProfile(token, queryId)
      .then((data) => {
        if (!isMounted) return;
        if (data && (data.id || data.email)) {
          setActiveProfile(data);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setNotFound(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOwner, queryId, token, loggedInProfile]);


  // Derived state fields from activeProfile
  const fullName = activeProfile?.full_name || (isOwner ? "Julian Chen" : "Club Member");
  const bio = activeProfile?.bio || (isOwner ? "AI & Systems Researcher @ Scaler School of Technology." : "No biography provided yet.");
  const batchYear = activeProfile?.batch_year || 2024;
  const skills = activeProfile?.skills && activeProfile.skills.length > 0
    ? activeProfile.skills
    : ["PyTorch", "Reinforcement Learning", "Transformers", "Distributed Systems"];
  const socialLinks = {
    github: activeProfile?.social_links?.github || "",
    kaggle: activeProfile?.social_links?.kaggle || "",
    linkedin: activeProfile?.social_links?.linkedin || "",
    discord: activeProfile?.social_links?.discord || activeProfile?.discord_id || "",
  };

  // Track Points strictly mapped from schema
  const trackPoints: TrackPoints = useMemo(() => {
    const raw = activeProfile?.points || loggedInProfile?.points;
    return {
      total: raw?.total || 0,
      research: raw?.research || 0,
      product: raw?.product || 0,
      kaggle: raw?.kaggle || 0,
      misc: raw?.misc || 0,
    };
  }, [activeProfile?.points, loggedInProfile?.points]);

  // Heatmap state
  const heatmapData = useMemo(() => generateHeatmapData(), []);
  const [hoveredCell, setHoveredCell] = useState<{
    date: string;
    count: number;
    points: number;
  } | null>(null);
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<"all" | "research" | "product" | "kaggle">("all");

  // History ledger tab filter
  const [historyTab, setHistoryTab] = useState<"all" | "research" | "product" | "kaggle" | "misc">("all");

  // Edit Modal state (Owner Only)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormName, setEditFormName] = useState(fullName);
  const [editFormBio, setEditFormBio] = useState(bio);
  const [editFormBatch, setEditFormBatch] = useState(batchYear);
  const [editFormSkills, setEditFormSkills] = useState(skills.join(", "));
  const [editFormGithub, setEditFormGithub] = useState(socialLinks.github || "");
  const [editFormKaggle, setEditFormKaggle] = useState(socialLinks.kaggle || "");
  const [editFormLinkedin, setEditFormLinkedin] = useState(socialLinks.linkedin || "");
  const [editFormDiscord, setEditFormDiscord] = useState(socialLinks.discord || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  const handleOpenEditModal = () => {
    if (!isOwner) return;
    setEditFormName(fullName);
    setEditFormBio(bio);
    setEditFormBatch(batchYear);
    setEditFormSkills(skills.join(", "));
    setEditFormGithub(socialLinks.github || "");
    setEditFormKaggle(socialLinks.kaggle || "");
    setEditFormLinkedin(socialLinks.linkedin || "");
    setEditFormDiscord(socialLinks.discord || "");
    setIsEditModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setIsSaving(true);

    const parsedSkills = editFormSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedSocials = {
      github: editFormGithub.trim() || null,
      kaggle: editFormKaggle.trim() || null,
      linkedin: editFormLinkedin.trim() || null,
      discord: editFormDiscord.trim() || null,
    };

    try {
      if (save) {
        await save({
          full_name: editFormName.trim(),
          bio: editFormBio.trim() || null,
          batch_year: Number(editFormBatch),
          skills: parsedSkills,
          social_links: updatedSocials,
        });
      }

      setActiveProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: editFormName.trim(),
              bio: editFormBio.trim() || null,
              batch_year: Number(editFormBatch),
              skills: parsedSkills,
              social_links: updatedSocials,
            }
          : prev
      );

      setIsSaving(false);
      setIsEditModalOpen(false);
      setSaveSuccessMsg("Profile updated successfully!");
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    } catch {
      setIsSaving(false);
      setIsEditModalOpen(false);
      setActiveProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: editFormName.trim(),
              bio: editFormBio.trim() || null,
              batch_year: Number(editFormBatch),
              skills: parsedSkills,
              social_links: updatedSocials,
            }
          : prev
      );
      setSaveSuccessMsg("Profile updated locally.");
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    }
  };

  const filteredContributions = mockContributions.filter((item) => {
    if (historyTab === "all") return true;
    return item.track === historyTab;
  });

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "MB";

  if (notFound) {
    return (
      <div className={styles.pageContainer}>
        <section className={styles.heroCard} style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ maxWidth: "480px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#1c1c22", border: "1px solid #282832", display: "grid", placeItems: "center", color: "#f87171" }}>
              <MemberIcon name="shield" size={24} />
            </div>
            <h1 className={styles.fullName} style={{ fontSize: "1.4rem" }}>Member Profile Not Found</h1>
            <p className={styles.bioText} style={{ textAlign: "center" }}>
              No student profile could be found for ID <code>&quot;{queryId}&quot;</code>. The user might not have joined the platform yet.
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <Link href="/dashboard/profile" className={styles.myProfileBtn}>
                Go to My Profile
              </Link>
              <Link href="/dashboard/leaderboard" className={styles.backDirBtn}>
                Browse Member Directory
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* 1. Hero Profile Header Card */}
      <section className={styles.heroCard} aria-label="Member Profile Header">
        <div className={styles.heroBackgroundGlow} />

        <div className={styles.heroTopRow}>
          <div className={styles.userMainInfo}>
            <div className={styles.avatarWrapper}>
              <span className={styles.avatarInitials}>{initials}</span>
              <span className={styles.avatarOnlineBadge} title="Active Member" />
            </div>

            <div className={styles.nameBlock}>
              <div className={styles.nameRow}>
                <h1 className={styles.fullName}>{fullName}</h1>
                <span className={styles.tierBadge}>
                  {activeProfile?.tier ? `${activeProfile.tier.toUpperCase()} MEMBER` : "BEGINNER MEMBER"}
                </span>
                {activeProfile?.is_admin && (
                  <span style={{ fontSize: "0.65rem", fontWeight: "850", padding: "3px 8px", borderRadius: "5px", background: "rgba(248, 113, 113, 0.15)", color: "#f87171", border: "1px solid rgba(248, 113, 113, 0.35)", textTransform: "uppercase" }}>
                    ADMIN
                  </span>
                )}
              </div>

              <div className={styles.metaRow}>
                <span className={styles.metaItem}>
                  <MemberIcon name="calendar" size={14} />
                  Batch &apos;{batchYear ? String(batchYear).slice(-2) : "24"} (Year {batchYear})
                </span>
                <span className={styles.metaItem}>
                  <MemberIcon name="shield" size={14} />
                  {activeProfile?.email || "student@sst.scaler.com"}
                </span>
                {socialLinks.discord ? (
                  <span className={styles.verifiedChip}>
                    <MemberIcon name="check" size={13} />
                    Discord: {socialLinks.discord}
                  </span>
                ) : (
                  <span className={styles.metaItem} style={{ color: "#71717a" }}>
                    <MemberIcon name="discord" size={13} />
                    Unlinked Discord
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            {saveSuccessMsg && (
              <span style={{ fontSize: "0.76rem", color: "#4ade80", fontWeight: "750" }}>
                ✓ {saveSuccessMsg}
              </span>
            )}
            {isOwner ? (
              <button
                type="button"
                className={styles.editProfileBtn}
                onClick={handleOpenEditModal}
                aria-label="Edit your profile details"
              >
                <MemberIcon name="edit" size={16} />
                Edit Profile
              </button>
            ) : (
              <>
                <span className={styles.publicBadge}>
                  <MemberIcon name="profile" size={13} />
                  Public Member View
                </span>
                <Link href="/dashboard/profile" className={styles.myProfileBtn}>
                  My Profile
                </Link>
                <Link href="/dashboard/leaderboard" className={styles.backDirBtn}>
                  ← Directory
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Bio & Skills */}
        <div className={styles.bioSection}>
          <p className={styles.bioText}>{bio}</p>

          <div className={styles.skillsContainer}>
            {skills.map((skill) => (
              <span key={skill} className={styles.skillPill}>
                #{skill}
              </span>
            ))}
          </div>

          {/* Social Links */}
          <div className={styles.socialRow}>
            {socialLinks.github && (
              <a
                href={socialLinks.github}
                target="_blank"
                rel="noreferrer"
                className={styles.socialBtn}
              >
                <MemberIcon name="github" size={14} />
                GitHub
              </a>
            )}
            {socialLinks.kaggle && (
              <a
                href={socialLinks.kaggle}
                target="_blank"
                rel="noreferrer"
                className={styles.socialBtn}
              >
                <MemberIcon name="kaggle" size={14} />
                Kaggle
              </a>
            )}
            {socialLinks.linkedin && (
              <a
                href={socialLinks.linkedin}
                target="_blank"
                rel="noreferrer"
                className={styles.socialBtn}
              >
                <MemberIcon name="linkedin" size={14} />
                LinkedIn
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 2. Track Points Breakdown Grid (Strict Track Colors) */}
      <section className={styles.tracksGrid} aria-label="Track Points Breakdown">
        <div className={`${styles.trackCard} ${styles.trackBorderResearch}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Research Track</span>
            <MemberIcon name="rocket" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorResearch}`}>
            {trackPoints.research} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Research & AI Algorithms</span>
        </div>

        <div className={`${styles.trackCard} ${styles.trackBorderProduct}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Product Track</span>
            <MemberIcon name="lightning" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorProduct}`}>
            {trackPoints.product} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Full-Stack & Systems Engineering</span>
        </div>

        <div className={`${styles.trackCard} ${styles.trackBorderKaggle}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Kaggle Track</span>
            <MemberIcon name="award" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorKaggle}`}>
            {trackPoints.kaggle} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Competitions & Benchmarks</span>
        </div>

        <div className={`${styles.trackCard} ${styles.trackBorderMisc}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Total Merit Score</span>
            <MemberIcon name="flame" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorMisc}`}>
            {trackPoints.total} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Audited by Reinforce Ledger</span>
        </div>
      </section>

      {/* 3. GitHub-Style Contribution Heatmap Calendar */}
      <section className={styles.heatmapSection} aria-label="Contribution Activity Heatmap">
        <div className={styles.heatmapHeaderRow}>
          <div className={styles.heatmapTitleGroup}>
            <h2 className={styles.heatmapTitle}>
              <MemberIcon name="calendar" size={18} />
              Contribution Activity Calendar
            </h2>
            <p className={styles.heatmapSubtitle}>
              Daily ledger activity across SPGs, competitions, research papers, and technical workshops.
            </p>
          </div>

          <div className={styles.heatmapStatsRow}>
            <span className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatVal}>168</span> Contributions
            </span>
            <span className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatVal}>19 Days</span> Longest Streak
            </span>
            <span className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatVal}>4 Days</span> Current Streak
            </span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className={styles.heatmapContainer}>
          <div className={styles.heatmapGrid}>
            <div className={styles.monthsRow}>
              <span>Oct</span>
              <span>Nov</span>
              <span>Dec</span>
              <span>Jan</span>
              <span>Feb</span>
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
              <span>Jun</span>
              <span>Jul</span>
              <span>Aug</span>
              <span>Sep</span>
            </div>

            <div className={styles.daysMatrix}>
              <div className={styles.weekdayLabels}>
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>

              <div className={styles.weeksColumns}>
                {heatmapData.map((week, wIdx) => (
                  <div key={wIdx} className={styles.weekColumn}>
                    {week.map((day, dIdx) => (
                      <div
                        key={dIdx}
                        className={`${styles.dayCell} ${
                          day.level === 0
                            ? styles.level0
                            : day.level === 1
                            ? styles.level1
                            : day.level === 2
                            ? styles.level2
                            : day.level === 3
                            ? styles.level3
                            : styles.level4
                        }`}
                        onMouseEnter={() => setHoveredCell(day)}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${day.date}: ${day.count} contributions (+${day.points} pts)`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap Footer with Hover Meta & Legend */}
        <div className={styles.heatmapFooter}>
          <div>
            {hoveredCell ? (
              <span style={{ color: "#ffffff", fontWeight: "750" }}>
                {hoveredCell.date} — {hoveredCell.count} contribution{hoveredCell.count !== 1 ? "s" : ""} (+{hoveredCell.points} merit pts)
              </span>
            ) : (
              <span>Hover over any day cell to view verified contributions.</span>
            )}
          </div>

          <div className={styles.legendScale}>
            <span>Less</span>
            <span className={`${styles.legendDot} ${styles.level0}`} />
            <span className={`${styles.legendDot} ${styles.level1}`} />
            <span className={`${styles.legendDot} ${styles.level2}`} />
            <span className={`${styles.legendDot} ${styles.level3}`} />
            <span className={`${styles.legendDot} ${styles.level4}`} />
            <span>More</span>
          </div>
        </div>
      </section>

      {/* 4. Contribution History Area Below (Ledger Feed) */}
      <section className={styles.historySection} aria-label="Contribution Ledger History">
        <div className={styles.historyHeaderRow}>
          <div>
            <h2 className={styles.heatmapTitle}>Contribution History & Ledger</h2>
            <p className={styles.heatmapSubtitle}>
              Immutable record of awarded points, project milestones, and club achievements.
            </p>
          </div>

          <div className={styles.historyFilterTabs} role="tablist">
            {(
              [
                { id: "all", label: "ALL" },
                { id: "research", label: "RESEARCH" },
                { id: "product", label: "PRODUCT" },
                { id: "kaggle", label: "KAGGLE" },
                { id: "misc", label: "COMMUNITY" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={historyTab === tab.id}
                onClick={() => setHistoryTab(tab.id)}
                className={`${styles.historyTabBtn} ${
                  historyTab === tab.id ? styles.historyTabActive : ""
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.contributionsList}>
          {filteredContributions.map((contrib) => (
            <article key={contrib.id} className={styles.contributionCard}>
              <div className={styles.contribTopRow}>
                <div className={styles.contribBadges}>
                  <span
                    className={`${styles.trackTag} ${
                      contrib.track === "research"
                        ? styles.colorResearch
                        : contrib.track === "product"
                        ? styles.colorProduct
                        : contrib.track === "kaggle"
                        ? styles.colorKaggle
                        : styles.colorMisc
                    }`}
                    style={{
                      background:
                        contrib.track === "research"
                          ? "rgba(248, 113, 113, 0.12)"
                          : contrib.track === "product"
                          ? "rgba(74, 222, 128, 0.12)"
                          : contrib.track === "kaggle"
                          ? "rgba(56, 200, 255, 0.12)"
                          : "rgba(229, 183, 49, 0.12)",
                    }}
                  >
                    {contrib.track.toUpperCase()} TRACK
                  </span>
                  <span className={styles.categoryTag}>{contrib.categoryLabel}</span>
                  {contrib.spgId && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontFamily: "var(--font-mono, monospace)",
                        color: "#7e7e8a",
                      }}
                    >
                      [{contrib.spgId}]
                    </span>
                  )}
                </div>

                <span className={styles.pointsBadge}>+{contrib.points} PTS</span>
              </div>

              <h3 className={styles.contribTitle}>{contrib.title}</h3>
              <p className={styles.contribDesc}>{contrib.description}</p>

              <div className={styles.contribFooter}>
                <span className={styles.statusApproved}>
                  <MemberIcon name="check" size={13} />
                  Verified on Ledger
                </span>
                <span>{contrib.occurredAt}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Edit Profile Popup Modal */}
      {isEditModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
        >
          <div className={styles.modalContainer}>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setIsEditModalOpen(false)}
              aria-label="Close edit profile dialog"
            >
              ✕
            </button>

            <div className={styles.modalHeader}>
              <h2 id="edit-profile-title" className={styles.modalTitle}>
                Edit Member Profile
              </h2>
              <p className={styles.modalSubtitle}>
                Update your public profile, bio, skills, and linked platform handles.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className={styles.formStack}>
              <div className={styles.fieldsRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-name">
                    Full Name
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    required
                    maxLength={100}
                    className={styles.textInput}
                    value={editFormName}
                    onChange={(e) => setEditFormName(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-batch">
                    Batch Year
                  </label>
                  <select
                    id="edit-batch"
                    className={styles.selectInput}
                    value={editFormBatch}
                    onChange={(e) => setEditFormBatch(Number(e.target.value))}
                  >
                    <option value={1}>Batch &apos;25 (Year 1)</option>
                    <option value={2}>Batch &apos;24 (Year 2)</option>
                    <option value={3}>Batch &apos;23 (Year 3)</option>
                    <option value={4}>Batch &apos;22 (Year 4)</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="edit-bio">
                  Bio / Statement
                </label>
                <textarea
                  id="edit-bio"
                  maxLength={1000}
                  className={styles.textareaInput}
                  value={editFormBio}
                  onChange={(e) => setEditFormBio(e.target.value)}
                  placeholder="Tell the club about your engineering focus, research tracks, or goals..."
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="edit-skills">
                  Skills (comma-separated)
                </label>
                <input
                  id="edit-skills"
                  type="text"
                  className={styles.textInput}
                  value={editFormSkills}
                  onChange={(e) => setEditFormSkills(e.target.value)}
                  placeholder="e.g. PyTorch, CUDA, ROS2, Reinforcement Learning, Next.js"
                />
              </div>

              <div className={styles.fieldsRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-github">
                    GitHub Profile URL
                  </label>
                  <input
                    id="edit-github"
                    type="url"
                    className={styles.textInput}
                    value={editFormGithub}
                    onChange={(e) => setEditFormGithub(e.target.value)}
                    placeholder="https://github.com/username"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-kaggle">
                    Kaggle Profile URL
                  </label>
                  <input
                    id="edit-kaggle"
                    type="url"
                    className={styles.textInput}
                    value={editFormKaggle}
                    onChange={(e) => setEditFormKaggle(e.target.value)}
                    placeholder="https://kaggle.com/username"
                  />
                </div>
              </div>

              <div className={styles.fieldsRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-linkedin">
                    LinkedIn URL
                  </label>
                  <input
                    id="edit-linkedin"
                    type="url"
                    className={styles.textInput}
                    value={editFormLinkedin}
                    onChange={(e) => setEditFormLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-discord">
                    Discord Handle
                  </label>
                  <input
                    id="edit-discord"
                    type="text"
                    className={styles.textInput}
                    value={editFormDiscord}
                    onChange={(e) => setEditFormDiscord(e.target.value)}
                    placeholder="username#0000 or username"
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className={styles.saveBtn}>
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfileClient() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "48px 24px", color: "#8c8c96", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
          Loading student profile...
        </div>
      }
    >
      <ProfileClientContent />
    </Suspense>
  );
}

