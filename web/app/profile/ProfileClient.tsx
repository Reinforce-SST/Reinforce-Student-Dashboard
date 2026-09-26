"use client";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMember } from "@/lib/useMember";
import { api, type StudentProfile, type TrackPoints } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberLoading from "@/components/dashboard/MemberLoading";
import {
  type ContributionRecord,
  type ContributionCategory,
  type ContributionTrack,
  CONTRIBUTION_CATEGORY_INDEX,
  ALL_CATEGORIES,
  CATEGORY_HIERARCHY,
  CATEGORY_RANK_MAP,
  ACTIVITY_INTENSITY_LEVELS,
  getCategoryConfig,
  getTrackColor,
  getDominantCategory,
  getHeatmapCellStyle,
} from "@/lib/contributionData";
import styles from "./Profile.module.css";

export interface HeatmapDayCell {
  level: number;
  date: string;
  count: number;
  points: number;
  activityNote?: string;
  category?: ContributionCategory;
}

// Dynamic 52-week Contribution Heatmap generator from actual contribution records
function buildHeatmapGrid(contributions: ContributionRecord[]): HeatmapDayCell[][] {
  const weeks = 52;
  const daysPerWeek = 7;
  const grid: HeatmapDayCell[][] = [];

  // Start 52 weeks ago
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 52 * 7 + 1);

  // Live real contributions grouping
  const dateMap = new Map<string, { count: number; points: number; categories: ContributionCategory[]; titles: string[] }>();
  for (const contrib of contributions) {
    if (contrib.occurred_at) {
      try {
        const d = new Date(contrib.occurred_at);
        const key = d.toISOString().slice(0, 10);
        const existing = dateMap.get(key) || { count: 0, points: 0, categories: [], titles: [] };
        existing.count += 1;
        existing.points += contrib.points || 0;
        if (contrib.category) existing.categories.push(contrib.category);
        if (contrib.title) existing.titles.push(contrib.title);
        dateMap.set(key, existing);
      } catch {
        // ignore invalid date
      }
    }
  }

  for (let w = 0; w < weeks; w++) {
    const weekDays: HeatmapDayCell[] = [];
    for (let d = 0; d < daysPerWeek; d++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + (w * 7 + d));
      const key = cur.toISOString().slice(0, 10);
      const dateStr = cur.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const dayData = dateMap.get(key) || { count: 0, points: 0, categories: [], titles: [] };
      let level = 0;
      if (dayData.points >= 50) level = 4;
      else if (dayData.points >= 30) level = 3;
      else if (dayData.points >= 15) level = 2;
      else if (dayData.points > 0 || dayData.count > 0) level = 1;

      const dominantCat = getDominantCategory(dayData.categories) || (level > 0 ? "other" : undefined);
      const note = dayData.titles.length > 0 ? dayData.titles.join(", ") : undefined;

      weekDays.push({
        level,
        date: dateStr,
        count: dayData.count,
        points: dayData.points,
        category: dominantCat,
        activityNote: note,
      });
    }
    grid.push(weekDays);
  }
  return grid;
}

export function deriveBatchYear(batchYear?: number | null, email?: string | null): number | null {
  if (batchYear && batchYear >= 2000) {
    return batchYear;
  }
  if (batchYear && batchYear >= 1 && batchYear <= 5) {
    return 2028 - batchYear + 1;
  }
  if (email) {
    const match = email.toLowerCase().match(/(?:^|\.)(\d{2})[a-zA-Z]/);
    if (match && match[1]) {
      const prefix = parseInt(match[1], 10);
      if (prefix >= 20 && prefix <= 40) {
        return 2000 + prefix + 4;
      }
    }
  }
  return null;
}

function formatBatchDisplay(batchYear?: number | null): string | null {
  if (!batchYear) return null;
  return `Batch ${batchYear}`;
}

function ProfileClientContent() {
  const { token, profile: loggedInProfile, save } = useMember();
  const searchParams = useSearchParams();
  const queryId = searchParams ? searchParams.get("id") || searchParams.get("uid") : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Determine if viewing own profile or someone else's
  const isOwner = useMemo(() => {
    if (!queryId) return true;
    if (loggedInProfile?.id && loggedInProfile.id === queryId) return true;
    if (loggedInProfile?.email && loggedInProfile.email.toLowerCase() === queryId.toLowerCase()) return true;
    if (loggedInProfile?.discord_id && loggedInProfile.discord_id === queryId) return true;
    return false;
  }, [queryId, loggedInProfile]);

  const [activeProfile, setActiveProfile] = useState<StudentProfile | null>(isOwner ? loggedInProfile : null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Live Contributions State
  const [liveContributions, setLiveContributions] = useState<ContributionRecord[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);

  // Collapsible Activity & Category Hierarchy Guide toggle
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Filters
  const [historyTab, setHistoryTab] = useState<"all" | ContributionTrack>("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<"all" | ContributionCategory>("all");

  // Fetch Profile data
  useEffect(() => {
    if (isOwner) {
      setActiveProfile(loggedInProfile);
      setNotFound(false);
      return;
    }

    if (!queryId) return;

    let isMounted = true;
    setProfileLoading(true);

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
        if (isMounted) setProfileLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOwner, queryId, token, loggedInProfile]);

  // Fetch Live Contributions from API
  const fetchContributions = useCallback(async () => {
    if (!token) return;
    setContributionsLoading(true);
    try {
      if (isOwner) {
        const res = await api.getMyContributions(token, 100);
        setLiveContributions(res?.items || []);
      } else {
        const targetUserId = activeProfile?.id || queryId;
        if (targetUserId) {
          const res = await api.getUserContributions(token, targetUserId, 100);
          setLiveContributions(res?.items || []);
        }
      }
    } catch {
      setLiveContributions([]);
    } finally {
      setContributionsLoading(false);
    }
  }, [token, isOwner, activeProfile?.id, queryId]);

  useEffect(() => {
    fetchContributions();
  }, [fetchContributions]);

  // Active contributions strictly backed by live ledger
  const activeContributions = liveContributions;

  // Filtered contributions
  const filteredContributions = useMemo(() => {
    return activeContributions.filter((item) => {
      if (historyTab !== "all" && item.track !== historyTab) return false;
      if (selectedCategoryFilter !== "all" && item.category !== selectedCategoryFilter) return false;
      return true;
    });
  }, [activeContributions, historyTab, selectedCategoryFilter]);

  // Derived state fields from activeProfile
  const fullName = activeProfile?.full_name || (isOwner ? "Member Profile" : "Club Member");
  const avatarUrl = activeProfile?.avatar_url || null;
  const bio = activeProfile?.bio || "";
  const skills = activeProfile?.skills || [];
  const socialLinks = {
    github: activeProfile?.social_links?.github || "",
    kaggle: activeProfile?.social_links?.kaggle || "",
    linkedin: activeProfile?.social_links?.linkedin || "",
    discord: activeProfile?.social_links?.discord || activeProfile?.discord_id || "",
  };

  // Derive 4-digit graduation batch year from email or profile (e.g. 25bcs -> 2029, 26bcs -> 2030)
  const derivedBatchYear = useMemo(() => {
    return deriveBatchYear(activeProfile?.batch_year, activeProfile?.email || loggedInProfile?.email);
  }, [activeProfile?.batch_year, activeProfile?.email, loggedInProfile?.email]);

  const batchDisplay = formatBatchDisplay(derivedBatchYear);

  // Track Points strictly mapped from schema (Live API)
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

  // Dynamic Heatmap computed strictly from verified live contributions
  const heatmapData = useMemo(
    () => buildHeatmapGrid(activeContributions),
    [activeContributions]
  );
  const [hoveredCell, setHoveredCell] = useState<HeatmapDayCell | null>(null);

  // Edit Modal state (Owner Only)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormName, setEditFormName] = useState(fullName);
  const [editFormAvatarUrl, setEditFormAvatarUrl] = useState(avatarUrl || "");
  const [editFormBio, setEditFormBio] = useState(bio);
  const [editFormSkills, setEditFormSkills] = useState(skills.join(", "));
  const [editFormGithub, setEditFormGithub] = useState(socialLinks.github || "");
  const [editFormKaggle, setEditFormKaggle] = useState(socialLinks.kaggle || "");
  const [editFormLinkedin, setEditFormLinkedin] = useState(socialLinks.linkedin || "");
  const [editFormDiscord, setEditFormDiscord] = useState(socialLinks.discord || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  const handleOpenEditModal = () => {
    if (!isOwner) return;
    setEditFormName(activeProfile?.full_name || "");
    setEditFormAvatarUrl(activeProfile?.avatar_url || "");
    setEditFormBio(activeProfile?.bio || "");
    setEditFormSkills(skills.join(", "));
    setEditFormGithub(socialLinks.github || "");
    setEditFormKaggle(socialLinks.kaggle || "");
    setEditFormLinkedin(socialLinks.linkedin || "");
    setEditFormDiscord(socialLinks.discord || "");
    setSaveError("");
    setAvatarUploadError("");
    setIsEditModalOpen(true);
  };

  // Upload Avatar File to /users/me/avatar
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarUploadError("Please select a valid image file (.png, .jpg, .webp).");
      return;
    }

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setAvatarUploadError("Image size must be under 5MB.");
      return;
    }

    try {
      setIsUploadingAvatar(true);
      setAvatarUploadError("");

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setEditFormAvatarUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);

      const res = await api.uploadAvatar(token, file);
      if (res && res.avatar_url) {
        setEditFormAvatarUrl(res.avatar_url);
        setActiveProfile((prev) => (prev ? { ...prev, avatar_url: res.avatar_url } : prev));
        setSaveSuccessMsg("Avatar uploaded successfully!");
        setTimeout(() => setSaveSuccessMsg(""), 4000);
      }
    } catch (err: any) {
      setAvatarUploadError(err.message || "Failed to upload avatar image.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Form Submit Handler (PATCH /users/me)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setIsSaving(true);
    setSaveError("");

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

    const payload = {
      full_name: editFormName.trim(),
      avatar_url: editFormAvatarUrl.trim() || null,
      bio: editFormBio.trim() || null,
      batch_year: derivedBatchYear || null,
      skills: parsedSkills,
      social_links: updatedSocials,
    };

    try {
      if (save) {
        await save(payload);
      } else {
        await api.updateProfile(token, payload);
      }

      setActiveProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: payload.full_name,
              avatar_url: payload.avatar_url,
              bio: payload.bio,
              batch_year: payload.batch_year,
              skills: parsedSkills,
              social_links: updatedSocials,
            }
          : prev
      );

      setIsSaving(false);
      setIsEditModalOpen(false);
      setSaveSuccessMsg("Profile updated successfully!");
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    } catch (err: any) {
      setIsSaving(false);
      setSaveError(err.message || "Failed to update profile details. Please try again.");
    }
  };

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "MB";

  if (profileLoading) {
    return (
      <div className={styles.pageContainer}>
        <MemberLoading message="Loading member profile…" />
      </div>
    );
  }

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
              No student profile could be found for ID <code>&quot;{queryId}&quot;</code>.
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
            {/* Avatar Circle with Picture and Owner Edit Trigger */}
            <div
              className={styles.avatarWrapper}
              onClick={isOwner ? handleOpenEditModal : undefined}
              title={isOwner ? "Click to change profile picture or details" : undefined}
              style={{ cursor: isOwner ? "pointer" : "default" }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className={styles.avatarImg}
                  onError={(e) => {
                    // Fallback to initials if broken image
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <span className={styles.avatarInitials}>{initials}</span>
              )}

              {isOwner && (
                <div className={styles.avatarOverlay} aria-hidden="true">
                  <MemberIcon name="edit" size={16} />
                  <span>Edit</span>
                </div>
              )}

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
                {batchDisplay && (
                  <span className={styles.metaItem}>
                    <MemberIcon name="calendar" size={14} />
                    {batchDisplay}
                  </span>
                )}
                {activeProfile?.email && (
                  <span className={styles.metaItem}>
                    <MemberIcon name="shield" size={14} />
                    {activeProfile.email}
                  </span>
                )}
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
          {bio ? (
            <p className={styles.bioText}>{bio}</p>
          ) : (
            <p className={styles.bioText} style={{ color: "#6b6b7a", fontStyle: "italic" }}>
              {isOwner ? "No biography added yet. Click 'Edit Profile' to add your bio and technical background." : "No biography provided."}
            </p>
          )}

          {skills.length > 0 && (
            <div className={styles.skillsContainer}>
              {skills.map((skill) => (
                <span key={skill} className={styles.skillPill}>
                  #{skill}
                </span>
              ))}
            </div>
          )}

          {/* Social Links */}
          <div className={styles.socialRow}>
            {socialLinks.github && (
              <a
                href={socialLinks.github.startsWith("http") ? socialLinks.github : `https://github.com/${socialLinks.github}`}
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
                href={socialLinks.kaggle.startsWith("http") ? socialLinks.kaggle : `https://kaggle.com/${socialLinks.kaggle}`}
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
                href={socialLinks.linkedin.startsWith("http") ? socialLinks.linkedin : `https://linkedin.com/in/${socialLinks.linkedin}`}
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

      {/* 2. Merit Track Breakdown Cards */}
      <section className={styles.tracksSection} aria-label="Merit Points Across Tracks">
        <div className={styles.tracksGrid}>
          {/* Total Merit */}
          <article className={`${styles.trackCard} ${styles.cardTotal}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>OVERALL MERIT</span>
              <div className={`${styles.iconWrap} ${styles.iconWrapTotal}`}>
                <MemberIcon name="award" size={16} />
              </div>
            </div>
            <div className={styles.pointsValue}>{trackPoints.total}</div>
            <div className={styles.progressBarBg}>
              <div
                className={`${styles.progressBarFill} ${styles.fillTotal}`}
                style={{ width: `${Math.min(100, Math.max(10, (trackPoints.total / 400) * 100))}%` }}
              />
            </div>
            <div className={styles.tierSubtext}>
              {activeProfile?.tier ? `${activeProfile.tier.toUpperCase()} TIER` : "ACTIVE MEMBER"}
            </div>
          </article>

          {/* Research Track */}
          <article className={`${styles.trackCard} ${styles.cardResearch}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>RESEARCH TRACK</span>
              <div className={`${styles.iconWrap} ${styles.iconWrapResearch}`}>
                <MemberIcon name="articles" size={16} />
              </div>
            </div>
            <div className={styles.pointsValue}>{trackPoints.research}</div>
            <div className={styles.progressBarBg}>
              <div
                className={`${styles.progressBarFill} ${styles.fillResearch}`}
                style={{ width: `${Math.min(100, (trackPoints.research / 150) * 100)}%` }}
              />
            </div>
            <div className={styles.trackSubtext}>Papers, Triton Kernels & Architectures</div>
          </article>

          {/* Product Track */}
          <article className={`${styles.trackCard} ${styles.cardProduct}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>PRODUCT TRACK</span>
              <div className={`${styles.iconWrap} ${styles.iconWrapProduct}`}>
                <MemberIcon name="rocket" size={16} />
              </div>
            </div>
            <div className={styles.pointsValue}>{trackPoints.product}</div>
            <div className={styles.progressBarBg}>
              <div
                className={`${styles.progressBarFill} ${styles.fillProduct}`}
                style={{ width: `${Math.min(100, (trackPoints.product / 150) * 100)}%` }}
              />
            </div>
            <div className={styles.trackSubtext}>SPGs, Deployments & Infrastructure</div>
          </article>

          {/* Kaggle Track */}
          <article className={`${styles.trackCard} ${styles.cardKaggle}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>KAGGLE TRACK</span>
              <div className={`${styles.iconWrap} ${styles.iconWrapKaggle}`}>
                <MemberIcon name="flame" size={16} />
              </div>
            </div>
            <div className={styles.pointsValue}>{trackPoints.kaggle}</div>
            <div className={styles.progressBarBg}>
              <div
                className={`${styles.progressBarFill} ${styles.fillKaggle}`}
                style={{ width: `${Math.min(100, (trackPoints.kaggle / 150) * 100)}%` }}
              />
            </div>
            <div className={styles.trackSubtext}>Competitions & Benchmarks</div>
          </article>
        </div>
      </section>

      {/* 3. CONTRIBUTION CATEGORY INDEX / LEGEND (Compact Short Strip) */}
      <section className={styles.categoryIndexCard} aria-label="Contribution Category Index">
        <div className={styles.categoryIndexHeader}>
          <h2 className={styles.categoryIndexTitle}>
            <MemberIcon name="award" size={16} />
            Contribution Categories
          </h2>
          <span style={{ fontSize: "0.72rem", color: "#71717a" }}>
            9 Verified Categories • Select to filter ledger
          </span>
        </div>

        {/* Compact 9-Category Chip Row */}
        <div className={styles.categoryPillRow}>
          {ALL_CATEGORIES.map((catKey) => {
            const config = CONTRIBUTION_CATEGORY_INDEX[catKey];
            const isSelected = selectedCategoryFilter === catKey;

            return (
              <button
                key={catKey}
                type="button"
                className={styles.categoryChipBtn}
                onClick={() => setSelectedCategoryFilter(isSelected ? "all" : catKey)}
                title={`${config.label}: ${config.description}`}
                style={{
                  background: isSelected ? config.bg : "#18181d",
                  color: isSelected ? config.color : "#d4d4d8",
                  borderColor: isSelected ? config.color : "rgba(255, 255, 255, 0.08)",
                  boxShadow: isSelected ? `0 0 10px ${config.bg}` : "none",
                }}
              >
                <MemberIcon name={config.icon} size={12} />
                <span>{config.label}</span>
                <span
                  className={styles.categoryDot}
                  style={{ background: config.color, boxShadow: `0 0 6px ${config.color}` }}
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Contribution Activity Heatmap */}
      <section className={styles.heatmapCard} aria-label="52-Week Contribution Activity Heatmap">
        <div className={styles.heatmapHeader}>
          <div className={styles.heatmapTitleGroup}>
            <h2 className={styles.heatmapTitle}>
              <MemberIcon name="calendar" size={18} />
              Activity &amp; Commit Matrix
            </h2>
            <span className={styles.heatmapSubtitle}>
              {activeContributions.length} verified contribution{activeContributions.length !== 1 ? "s" : ""} recorded in past 52 weeks
            </span>
          </div>

          <div className={styles.heatmapHeaderActions}>
            <div className={styles.heatmapFilterRow}>
              {(["all", "research", "product", "kaggle", "misc"] as const).map((track) => (
                <button
                  key={track}
                  type="button"
                  onClick={() => setHistoryTab(track)}
                  className={`${styles.heatmapFilterBtn} ${
                    historyTab === track ? styles.heatmapFilterBtnActive : ""
                  }`}
                >
                  {track === "all" ? "ALL TRACKS" : track.toUpperCase()}
                </button>
              ))}
            </div>
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
                    {week.map((day, dIdx) => {
                      const cellStyle = getHeatmapCellStyle(day.category, day.level);
                      const catConfig = day.category ? getCategoryConfig(day.category) : null;

                      return (
                        <div
                          key={dIdx}
                          className={styles.dayCell}
                          style={cellStyle}
                          onMouseEnter={() => setHoveredCell(day)}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={`${day.date}: ${day.count} contributions (+${day.points} pts)${catConfig ? ` [${catConfig.label}]` : ""}${day.activityNote ? ` — ${day.activityNote}` : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap Footer with Hover Meta & Legend */}
        <div className={styles.heatmapFooter}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            {hoveredCell ? (
              <span style={{ color: "#ffffff", fontWeight: "750", display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span>
                  {hoveredCell.date} — {hoveredCell.count > 0 ? `${hoveredCell.count} contribution${hoveredCell.count !== 1 ? "s" : ""} (+${hoveredCell.points} merit pts)` : "No contributions"}
                </span>
                {hoveredCell.category && hoveredCell.level > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "2px 7px",
                      borderRadius: "4px",
                      fontSize: "0.68rem",
                      background: getCategoryConfig(hoveredCell.category).bg,
                      color: getCategoryConfig(hoveredCell.category).color,
                      border: `1px solid ${getCategoryConfig(hoveredCell.category).color}50`,
                      fontWeight: "800",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: getCategoryConfig(hoveredCell.category).color }} />
                    {getCategoryConfig(hoveredCell.category).label} (Rank #{CATEGORY_RANK_MAP[hoveredCell.category]})
                  </span>
                )}
                {hoveredCell.activityNote && (
                  <span style={{ color: "#a1a1aa", fontWeight: "500" }}>
                    • {hoveredCell.activityNote}
                  </span>
                )}
              </span>
            ) : (
              <span>Hover over any day cell to view category color &amp; verified contributions.</span>
            )}
          </div>

          <div className={styles.legendScale}>
            <span>Less</span>
            <span className={`${styles.legendDot} ${styles.level0}`} title="Level 0 (0 pts)" />
            <span className={`${styles.legendDot} ${styles.level1}`} title="Level 1 (1–14 pts)" />
            <span className={`${styles.legendDot} ${styles.level2}`} title="Level 2 (15–29 pts)" />
            <span className={`${styles.legendDot} ${styles.level3}`} title="Level 3 (30–49 pts)" />
            <span className={`${styles.legendDot} ${styles.level4}`} title="Level 4 (50+ pts)" />
            <span>More</span>

            {/* Info Icon Button to toggle Collapsible Hierarchy Guide */}
            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className={`${styles.infoGuideToggleBtn} ${isGuideOpen ? styles.infoGuideToggleBtnActive : ""}`}
              title={isGuideOpen ? "Collapse Hierarchy & Intensity Guide" : "Expand Category Hierarchy & Color Guide"}
              aria-expanded={isGuideOpen}
              aria-label="Toggle Category Hierarchy and Intensity Guide"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>{isGuideOpen ? "Hide Guide" : "Hierarchy Guide"}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Category & Level Intensity Hierarchy Guide */}
        {isGuideOpen && (
          <div className={styles.intensityGuideCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div className={styles.intensityGuideTitle}>
                <MemberIcon name="award" size={13} />
                <span>Category Color Hierarchy (Rank 1 to 9)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.68rem", color: "#8e8e9c" }}>
                  Highest category priority on a day dictates cell hue
                </span>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#71717a",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                  title="Close Guide"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.categoryHierarchyGrid}>
              {CATEGORY_HIERARCHY.map((item) => {
                const config = getCategoryConfig(item.category);
                return (
                  <div key={item.category} className={styles.catHierarchyItem}>
                    <div className={styles.catHierarchyTop}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "2px",
                          background: config.color,
                          boxShadow: `0 0 6px ${config.color}80`,
                        }}
                      />
                      <span className={styles.catRankBadge}>#{item.rank}</span>
                    </div>
                    <span className={styles.catName}>{config.label}</span>
                    <span className={styles.catPoints}>{item.typicalPoints}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid #1f1f26", paddingTop: "10px", marginTop: "4px" }}>
              <div className={styles.intensityGuideTitle} style={{ marginBottom: "8px" }}>
                <MemberIcon name="lightning" size={13} />
                <span>Activity Intensity Saturation &amp; Glow Levels</span>
              </div>
              <div className={styles.intensityHierarchyGrid}>
                {ACTIVITY_INTENSITY_LEVELS.map((tier) => (
                  <div key={tier.level} className={styles.intensityItem}>
                    <div className={styles.intensityTopRow}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          className={styles.intensityDot}
                          style={{
                            background:
                              tier.level === 4
                                ? "#E5B731"
                                : tier.level === 3
                                ? "rgba(229, 183, 49, 0.85)"
                                : tier.level === 2
                                ? "rgba(229, 183, 49, 0.55)"
                                : tier.level === 1
                                ? "rgba(229, 183, 49, 0.28)"
                                : "#18181d",
                            boxShadow: tier.level === 4 ? "0 0 8px rgba(229, 183, 49, 0.8)" : "none",
                            border: tier.level === 0 ? "1px solid #202026" : "none",
                          }}
                        />
                        <span className={styles.intensityName}>{tier.label.split(" ")[0]} {tier.label.split(" ")[1]}</span>
                      </div>
                      <span className={styles.intensityPoints}>{tier.points}</span>
                    </div>
                    <span className={styles.intensityDesc}>{tier.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. Contribution History Area Below (Ledger Feed) */}
      <section className={styles.historySection} aria-label="Contribution Ledger History">
        <div className={styles.historyHeaderRow}>
          <div>
            <h2 className={styles.heatmapTitle}>Auditable Contribution Ledger</h2>
            <p className={styles.heatmapSubtitle}>
              Immutable record of awarded points, project milestones, and club achievements.
            </p>
          </div>

          <div className={styles.historyFilterTabs} role="tablist">
            {(
              [
                { id: "all", label: "ALL TRACKS" },
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

        {/* Category Filter Chips */}
        <div className={styles.categoryFilterRow}>
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter("all")}
            className={`${styles.categoryFilterChip} ${
              selectedCategoryFilter === "all" ? styles.categoryFilterChipActive : ""
            }`}
          >
            All Categories ({activeContributions.length})
          </button>
          {ALL_CATEGORIES.map((catKey) => {
            const config = CONTRIBUTION_CATEGORY_INDEX[catKey];
            const count = activeContributions.filter((c) => c.category === catKey).length;
            if (count === 0 && selectedCategoryFilter !== catKey) return null;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() =>
                  setSelectedCategoryFilter(selectedCategoryFilter === catKey ? "all" : catKey)
                }
                className={`${styles.categoryFilterChip} ${
                  selectedCategoryFilter === catKey ? styles.categoryFilterChipActive : ""
                }`}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: config.color,
                  }}
                />
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Contributions List */}
        {contributionsLoading ? (
          <MemberLoading message="Syncing contribution ledger…" />
        ) : filteredContributions.length === 0 ? (
          <div className={styles.emptyStateCard}>
            <MemberIcon name="award" size={32} />
            <h3 className={styles.emptyStateTitle}>No Contributions Found</h3>
            <p className={styles.emptyStateText}>
              {selectedCategoryFilter !== "all" || historyTab !== "all"
                ? "No verified records match the selected category and track filters."
                : isOwner
                ? "You haven't recorded any club contributions yet. Work on SPGs, teach workshops, or compete on Kaggle to earn verified ledger merit."
                : "This member has no recorded contributions on the ledger yet."}
            </p>
          </div>
        ) : (
          <div className={styles.contributionsList}>
            {filteredContributions.map((contrib) => {
              const catConfig = getCategoryConfig(contrib.category);
              const trackConfig = getTrackColor(contrib.track);

              const formattedDate = contrib.occurred_at
                ? new Date(contrib.occurred_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Verified Date";

              return (
                <article
                  key={contrib.id}
                  className={styles.contributionCard}
                  style={{
                    borderLeft: `4px solid ${catConfig.color}`,
                  }}
                >
                  <div className={styles.contribTopRow}>
                    <div className={styles.contribBadges}>
                      {/* Track Tag */}
                      <span
                        className={styles.trackTag}
                        style={{
                          background: trackConfig.bg,
                          color: trackConfig.color,
                          border: `1px solid ${trackConfig.color}40`,
                        }}
                      >
                        {trackConfig.label} TRACK
                      </span>

                      {/* Category Badge with custom color */}
                      <span
                        className={styles.categoryTag}
                        style={{
                          background: catConfig.bg,
                          color: catConfig.color,
                          border: `1px solid ${catConfig.border}`,
                          fontWeight: "800",
                        }}
                      >
                        <MemberIcon name={catConfig.icon} size={12} />
                        {catConfig.label}
                      </span>

                      {/* SPG Badge */}
                      {contrib.spg_id && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#9ca3af",
                            background: "#18181f",
                            padding: "3px 8px",
                            borderRadius: "5px",
                            border: "1px solid #282834",
                          }}
                        >
                          [{contrib.spg_id}]
                        </span>
                      )}

                      {/* Event ID */}
                      {contrib.event_id && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#9ca3af",
                            background: "#18181f",
                            padding: "3px 8px",
                            borderRadius: "5px",
                            border: "1px solid #282834",
                          }}
                        >
                          Event: {contrib.event_id}
                        </span>
                      )}
                    </div>

                    <span
                      className={styles.pointsBadge}
                      style={{
                        background: catConfig.bg,
                        color: catConfig.color,
                        borderColor: catConfig.border,
                      }}
                    >
                      +{contrib.points} PTS
                    </span>
                  </div>

                  <h3 className={styles.contribTitle}>{contrib.title}</h3>
                  {contrib.description && <p className={styles.contribDesc}>{contrib.description}</p>}

                  <div className={styles.contribFooter}>
                    <span className={styles.statusApproved}>
                      <MemberIcon name="check" size={13} />
                      Verified on Ledger ({contrib.status.toUpperCase()})
                    </span>
                    <span>{formattedDate}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Edit Profile Popup Modal (Owner Only) */}
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
                Update your public profile, bio, skills, profile picture, and linked handles.
              </p>
            </div>

            {/* Error Message */}
            {saveError && (
              <div style={{ background: "rgba(248, 113, 113, 0.15)", border: "1px solid rgba(248, 113, 113, 0.4)", borderRadius: "8px", padding: "10px 14px", color: "#f87171", fontSize: "0.78rem", fontWeight: "700" }}>
                ✕ {saveError}
              </div>
            )}

            {/* Avatar Upload Section */}
            <div className={styles.avatarEditSection}>
              <div className={styles.modalAvatarPreview}>
                {editFormAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editFormAvatarUrl}
                    alt="Preview"
                    className={styles.modalAvatarImg}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className={styles.avatarInitials} style={{ fontSize: "1.3rem" }}>
                    {initials}
                  </span>
                )}
              </div>

              <div className={styles.avatarEditControls}>
                <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#ffffff" }}>
                  Profile Picture
                </span>
                <div className={styles.avatarBtnRow}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    style={{ display: "none" }}
                    id="avatar-file-input"
                  />
                  <button
                    type="button"
                    disabled={isUploadingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                    className={styles.avatarUploadBtn}
                  >
                    <MemberIcon name="edit" size={13} />
                    {isUploadingAvatar ? "Uploading…" : "Upload New Photo"}
                  </button>

                  {editFormAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setEditFormAvatarUrl("")}
                      className={styles.avatarRemoveBtn}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <span className={styles.avatarHint}>
                  {avatarUploadError ? (
                    <span style={{ color: "#f87171", fontWeight: "700" }}>{avatarUploadError}</span>
                  ) : (
                    "Supports JPG, PNG, WebP up to 5MB. Uploads directly to platform storage."
                  )}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className={styles.editForm}>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="edit-name">
                  Full Name *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  placeholder="Your full name"
                  value={editFormName}
                  onChange={(e) => setEditFormName(e.target.value)}
                  className={styles.textInput}
                />
              </div>

              {derivedBatchYear && (
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>
                    Graduation Batch
                  </label>
                  <div
                    style={{
                      padding: "9px 12px",
                      background: "#18181d",
                      border: "1px solid #282832",
                      borderRadius: "8px",
                      color: "#e4e4e7",
                      fontSize: "0.8rem",
                      fontWeight: "750",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <MemberIcon name="calendar" size={14} />
                    <span>Batch {derivedBatchYear}</span>
                    <span style={{ color: "#71717a", fontSize: "0.72rem", fontWeight: "500", marginLeft: "auto" }}>
                      Auto-derived from college email (Locked)
                    </span>
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="edit-skills">
                  Technical Skills (Comma separated)
                </label>
                <input
                  id="edit-skills"
                  type="text"
                  placeholder="PyTorch, Transformers, CUDA, Triton"
                  value={editFormSkills}
                  onChange={(e) => setEditFormSkills(e.target.value)}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="edit-bio">
                  Bio / Research Focus
                </label>
                <textarea
                  id="edit-bio"
                  placeholder="Share your technical interests, papers, research focus, or club SPGs..."
                  value={editFormBio}
                  onChange={(e) => setEditFormBio(e.target.value)}
                  className={styles.textareaInput}
                />
              </div>

              <div className={styles.fieldsRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-github">
                    GitHub Handle / URL
                  </label>
                  <input
                    id="edit-github"
                    type="text"
                    placeholder="github_username"
                    value={editFormGithub}
                    onChange={(e) => setEditFormGithub(e.target.value)}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-kaggle">
                    Kaggle Handle / URL
                  </label>
                  <input
                    id="edit-kaggle"
                    type="text"
                    placeholder="kaggle_username"
                    value={editFormKaggle}
                    onChange={(e) => setEditFormKaggle(e.target.value)}
                    className={styles.textInput}
                  />
                </div>
              </div>

              <div className={styles.fieldsRow}>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-linkedin">
                    LinkedIn Handle / URL
                  </label>
                  <input
                    id="edit-linkedin"
                    type="text"
                    placeholder="linkedin_handle or URL"
                    value={editFormLinkedin}
                    onChange={(e) => setEditFormLinkedin(e.target.value)}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="edit-discord">
                    Discord Username
                  </label>
                  <input
                    id="edit-discord"
                    type="text"
                    placeholder="username or username#0000"
                    value={editFormDiscord}
                    onChange={(e) => setEditFormDiscord(e.target.value)}
                    className={styles.textInput}
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
                <button type="submit" disabled={isSaving || isUploadingAvatar} className={styles.saveBtn}>
                  {isSaving ? "Saving to API…" : "Save Changes"}
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
    <Suspense fallback={<MemberLoading message="Loading profile…" />}>
      <ProfileClientContent />
    </Suspense>
  );
}
