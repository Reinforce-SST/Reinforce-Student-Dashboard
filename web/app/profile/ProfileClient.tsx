"use client";

import { useState, useMemo } from "react";
import { useMember } from "@/lib/useMember";
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

export default function ProfileClient() {
  const { profile, save } = useMember();

  // Local state initialized from useMember profile or synthetic fallbacks
  const [fullName, setFullName] = useState(profile?.full_name || "Julian Chen");
  const [bio, setBio] = useState(
    profile?.bio ||
      "AI & Systems Researcher @ Scaler School of Technology. Building autonomous multi-agent drone swarms and scalable LLM inference optimizations."
  );
  const [batchYear, setBatchYear] = useState<number>(profile?.batch_year || 2);
  const [skills, setSkills] = useState<string[]>(
    profile?.skills?.length
      ? profile.skills
      : ["PyTorch", "Reinforcement Learning", "ROS2", "CUDA", "Multi-Agent Systems", "Transformers", "Triton", "Distributed Systems"]
  );
  const [socialLinks, setSocialLinks] = useState({
    github: profile?.social_links?.github || "https://github.com/julianchen-ai",
    kaggle: profile?.social_links?.kaggle || "https://kaggle.com/julianchen",
    linkedin: profile?.social_links?.linkedin || "https://linkedin.com/in/julianchen",
    discord: profile?.social_links?.discord || "julian_chen#8921",
  });

  // Track Points strictly mapped from schema
  const trackPoints = useMemo(() => {
    return {
      total: profile?.points?.total || 225,
      research: profile?.points?.research || 110,
      product: profile?.points?.product || 40,
      kaggle: profile?.points?.kaggle || 60,
      misc: profile?.points?.misc || 15,
    };
  }, [profile?.points]);

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

  // Edit Modal state
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

      setFullName(editFormName.trim());
      setBio(editFormBio.trim());
      setBatchYear(Number(editFormBatch));
      setSkills(parsedSkills);
      setSocialLinks(updatedSocials as any);

      setIsSaving(false);
      setIsEditModalOpen(false);
      setSaveSuccessMsg("Profile updated successfully!");
      setTimeout(() => setSaveSuccessMsg(""), 4000);
    } catch {
      setIsSaving(false);
      setIsEditModalOpen(false);
      setFullName(editFormName.trim());
      setBio(editFormBio.trim());
      setBatchYear(Number(editFormBatch));
      setSkills(parsedSkills);
      setSocialLinks(updatedSocials as any);
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
    .toUpperCase() || "JC";

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
                  {profile?.tier ? `${profile.tier.toUpperCase()} MEMBER` : "ADVANCED MEMBER"}
                </span>
              </div>

              <div className={styles.metaRow}>
                <span className={styles.metaItem}>
                  <MemberIcon name="calendar" size={14} />
                  Batch &apos;24 (Year {batchYear})
                </span>
                <span className={styles.metaItem}>
                  <MemberIcon name="shield" size={14} />
                  {profile?.email || "student@sst.scaler.com"}
                </span>
                <span className={styles.verifiedChip}>
                  <MemberIcon name="check" size={13} />
                  Verified Discord: {socialLinks.discord || "julian_chen#8921"}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            {saveSuccessMsg && (
              <span style={{ fontSize: "0.76rem", color: "#4ade80", fontWeight: "750" }}>
                ✓ {saveSuccessMsg}
              </span>
            )}
            <button
              type="button"
              className={styles.editProfileBtn}
              onClick={handleOpenEditModal}
              aria-label="Edit your profile details"
            >
              <MemberIcon name="edit" size={16} />
              Edit Profile
            </button>
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
          <span className={styles.trackCardFooter}>Autonomous Swarms (SP-1)</span>
        </div>

        <div className={`${styles.trackCard} ${styles.trackBorderProduct}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Product Track</span>
            <MemberIcon name="lightning" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorProduct}`}>
            {trackPoints.product} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Decentralized Compute (SP-2)</span>
        </div>

        <div className={`${styles.trackCard} ${styles.trackBorderKaggle}`}>
          <div className={styles.trackCardHeader}>
            <span className={styles.trackName}>Kaggle Track</span>
            <MemberIcon name="award" size={16} />
          </div>
          <span className={`${styles.trackPointsVal} ${styles.colorKaggle}`}>
            {trackPoints.kaggle} <span style={{ fontSize: "0.9rem", color: "#8c8c98" }}>PTS</span>
          </span>
          <span className={styles.trackCardFooter}>Grandmaster Silver Tier</span>
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
