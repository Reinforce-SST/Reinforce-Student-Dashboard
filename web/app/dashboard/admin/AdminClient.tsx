"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { useAdminMode } from "@/lib/useAdminMode";
import { api, type StudentProfile } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
import { getBannerPresentation, isBannerDestination } from "@/lib/dashboardData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import PaginationBar from "@/components/dashboard/PaginationBar";
import LoadingBar from "@/components/dashboard/LoadingBar";
import AdminTicketsPanel from "./AdminTicketsPanel";
import AdminContentPanel from "./AdminContentPanel";
import MemberRoleRow from "./MemberRoleRow";
import styles from "./Admin.module.css";

type AdminTab =
  | "banners"
  | "events"
  | "spg"
  | "tickets"
  | "contributions"
  | "members"
  | "articles"
  | "ideas";

function formatBannerDate(startStr: string): string {
  const start = new Date(startStr);
  return startStr && Number.isFinite(start.getTime())
    ? start.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
    : "Date not set";
}

export default function AdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, token } = useMember();
  const { setAdminMode } = useAdminMode();

  const tabParam = (searchParams.get("tab") as AdminTab) || "banners";
  const [activeTab, setActiveTab] = useState<AdminTab>(tabParam);

  useEffect(() => {
    if (searchParams.get("tab")) {
      setActiveTab(searchParams.get("tab") as AdminTab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setSubmitSuccess(null);
    setSubmitError(null);
    setDirectoryMessage("");
    router.push(`/dashboard/admin?tab=${tab}`);
  };

  // --- TAB 1: Dashboard Hero Banner State ---
  const [bannerStartDateTime, setBannerStartDateTime] = useState("");
  const [bannerEndDateTime, setBannerEndDateTime] = useState("");
  const bannerDateDisplay = formatBannerDate(bannerStartDateTime);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerDescription, setBannerDescription] = useState("");
  const [bannerBadgeText, setBannerBadgeText] = useState("");
  const [bannerCtaText, setBannerCtaText] = useState("");
  const [bannerCtaUrl, setBannerCtaUrl] = useState("");
  const bannerPresentation = getBannerPresentation({
    id: "", slug: "", event_type: "Featured Banner",
    banner_badge_text: bannerBadgeText,
    banner_cta_text: bannerCtaText,
    banner_cta_url: bannerCtaUrl,
  });
  const bannerTrack = "all";
  const bannerFormat = "offline";
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFilePreview, setBannerFilePreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  // --- TAB 2: Full Club Event Publisher State ---
  const [eventTitle, setEventTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventTrack, setEventTrack] = useState("research");
  const [eventFormat, setEventFormat] = useState("offline");
  const [eventSummary, setEventSummary] = useState("");
  const [eventDetailedInfo, setEventDetailedInfo] = useState("");
  const [eventVenueName, setEventVenueName] = useState("");
  const [eventRoom, setEventRoom] = useState("");
  const [eventMeetingUrl, setEventMeetingUrl] = useState("");
  const [eventStartDateTime, setEventStartDateTime] = useState("");
  const [eventEndDateTime, setEventEndDateTime] = useState("");
  const [eventRegDeadline, setEventRegDeadline] = useState("");
  const [eventAccessScope, setEventAccessScope] = useState("open_to_all");
  const eventGraduationBatches = getEventGraduationBatches();
  const [eventEligibleBatches, setEventEligibleBatches] = useState<number[]>(getEventGraduationBatches);
  const [eventParticipationMode, setEventParticipationMode] = useState<"solo" | "team">("solo");
  const [eventMinTeamSize, setEventMinTeamSize] = useState(1);
  const [eventMaxTeamSize, setEventMaxTeamSize] = useState(1);
  const [eventMaxParticipants, setEventMaxParticipants] = useState<number | "">("");
  const [eventPointsReward, setEventPointsReward] = useState<number | "">("");
  const [eventSlidesUrl, setEventSlidesUrl] = useState("");
  const [eventDiscordThread, setEventDiscordThread] = useState("");
  const [eventBannerUrl, setEventBannerUrl] = useState("");
  const [eventFilePreview, setEventFilePreview] = useState<string | null>(null);
  const [eventFile, setEventFile] = useState<File | null>(null);
  const [eventStatus, setEventStatus] = useState("published");

  // Status & Refs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const eventFileInputRef = useRef<HTMLInputElement>(null);

  // Merit Award State
  const [awardPoints, setAwardPoints] = useState<number | "">(25);
  const [awardReason, setAwardReason] = useState("");
  const [awardType, setAwardType] = useState("project_milestone");
  const [awardTrack, setAwardTrack] = useState<"misc" | "research" | "product" | "kaggle">("misc");
  const [awardLoading, setAwardLoading] = useState(false);
  const [awardSearch, setAwardSearch] = useState("");
  const [awardCandidates, setAwardCandidates] = useState<StudentProfile[]>([]);
  const [awardSearchError, setAwardSearchError] = useState("");
  const [awardCandidateTotal, setAwardCandidateTotal] = useState(0);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, StudentProfile>>({});
  const [awardCustomType, setAwardCustomType] = useState("");
  const [manualAddInput, setManualAddInput] = useState("");
  const [manualAddLoading, setManualAddLoading] = useState(false);
  const [manualAddError, setManualAddError] = useState("");
  const awardOccurredAtRef = useRef<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(20);
  const [memberDirectory, setMemberDirectory] = useState<{ items: StudentProfile[]; total: number; has_more: boolean } | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryMessage, setDirectoryMessage] = useState("");
  const [directoryRevision, setDirectoryRevision] = useState(0);

  useEffect(() => {
    if (activeTab !== "members" || !token) return;
    let active = true;
    setDirectoryLoading(true);
    const timer = setTimeout(() => {
      api.adminDirectory(token, { search: memberSearch.trim(), page: memberPage, page_size: memberPageSize })
        .then((result) => { if (active) { setMemberDirectory(result); setDirectoryError(""); } })
        .catch((error) => { if (active) setDirectoryError(error instanceof Error ? error.message : "Could not load members."); })
        .finally(() => { if (active) setDirectoryLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [activeTab, token, memberSearch, memberPage, memberPageSize, directoryRevision]);

  useEffect(() => {
    if (activeTab !== "contributions" || !token) {
      return;
    }
    let active = true;
    setCandidatesLoading(true);
    setAwardSearchError("");
    const timer = setTimeout(() => {
      api.adminDirectory(token, { search: awardSearch.trim() || undefined, page_size: 50 })
        .then((result) => {
          if (active) {
            setAwardCandidates(result.items || []);
            setAwardCandidateTotal(result.total);
            setCandidatesLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setAwardCandidates([]);
            setAwardCandidateTotal(0);
            setAwardSearchError(error instanceof Error ? error.message : "Could not load members.");
            setCandidatesLoading(false);
          }
        });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [activeTab, token, awardSearch]);

  const handleSelectAllVisible = () => {
    setSelectedRecipients((prev) => {
      const next = { ...prev };
      for (const m of awardCandidates) {
        const uid = m.id;
        if (uid) next[uid] = m;
      }
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setSelectedRecipients((prev) => {
      const next = { ...prev };
      for (const m of awardCandidates) {
        const uid = m.id;
        if (uid) delete next[uid];
      }
      return next;
    });
  };

  const handleClearAllRecipients = () => {
    setSelectedRecipients({});
  };

  const handleToggleRecipient = (m: StudentProfile) => {
    const uid = m.id;
    if (!uid) return;
    setSelectedRecipients((prev) => {
      const next = { ...prev };
      if (next[uid]) {
        delete next[uid];
      } else {
        next[uid] = m;
      }
      return next;
    });
  };

  const handleRemoveRecipient = (uid: string) => {
    setSelectedRecipients((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleAddManualRecipient = async () => {
    if (!manualAddInput.trim() || !token) return;
    setManualAddLoading(true);
    setManualAddError("");
    try {
      const resolved = await api.getUserProfile(token, manualAddInput.trim());
      const uid = resolved.id;
      if (!uid || uid.includes("@")) throw new Error("Could not resolve a canonical member UID.");
      setSelectedRecipients((prev) => ({ ...prev, [uid]: resolved }));
      setManualAddInput("");
    } catch (err) {
      setManualAddError(err instanceof Error ? err.message : "Member not found.");
    } finally {
      setManualAddLoading(false);
    }
  };

  // Banner File Upload Handler
  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setBannerFile(null);
      setBannerFilePreview(null);
      setSubmitError("Image file size exceeds 5MB limit.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setBannerFile(null);
      setBannerFilePreview(null);
      setSubmitError("Use a PNG, JPG, or WebP image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setBannerFilePreview(result);
      setBannerFile(file);
      setBannerUrl("");
      setSubmitError(null);
    };
    reader.onerror = () => setSubmitError("Could not read this image. Try another file.");
    reader.readAsDataURL(file);
  };

  // Event Poster Upload Handler
  const handleEventFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setEventFile(null);
      setEventFilePreview(null);
      setSubmitError("Image file size exceeds 5MB limit.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setEventFile(null);
      setEventFilePreview(null);
      setSubmitError("Use a PNG, JPG, or WebP image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setEventFilePreview(result);
      setEventFile(file);
      setEventBannerUrl("");
      setSubmitError(null);
    };
    reader.onerror = () => setSubmitError("Could not read this image. Try another file.");
    reader.readAsDataURL(file);
  };

  // Submit 1: Dashboard Featured Banner
  const handleSubmitBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitle.trim() || !bannerDescription.trim()) {
      setSubmitError("Title and description are required.");
      return;
    }
    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const startDateObj = new Date(bannerStartDateTime);
      const endDateObj = bannerEndDateTime ? new Date(bannerEndDateTime) : null;
      if (Number.isNaN(startDateObj.getTime()) || (endDateObj && Number.isNaN(endDateObj.getTime()))) {
        throw new Error("Enter valid banner dates before publishing.");
      }
      if (endDateObj && endDateObj <= startDateObj) {
        throw new Error("The banner end time must be after its start time.");
      }
      const ctaUrl = bannerCtaUrl.trim();
      if (ctaUrl && !isBannerDestination(ctaUrl)) {
        throw new Error("Use a site path starting with / or a full HTTPS URL for the button destination.");
      }
      const imageUrl = bannerFile
        ? (await api.adminUploadEventMedia(token, bannerFile)).url
        : bannerUrl.trim();
      if (bannerFile) {
        setBannerUrl(imageUrl);
        setBannerFile(null);
        setBannerFilePreview(null);
      }
      const durationMinutes = endDateObj
        ? Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / 60000))
        : undefined;

      const payload = {
        title: bannerTitle.trim(),
        description: bannerDescription.trim(),
        event_type: "Featured Banner",
        track: bannerTrack,
        format: bannerFormat,
        schedule: {
          start_time: startDateObj.toISOString(),
          end_time: endDateObj ? endDateObj.toISOString() : undefined,
          duration_minutes: durationMinutes,
        },
        banner_url: imageUrl || undefined,
        banner_badge_text: bannerBadgeText.trim() || undefined,
        banner_cta_text: bannerCtaText.trim() || undefined,
        banner_cta_url: ctaUrl || undefined,
        status: "published" as const,
      };

      const result = await api.adminCreateEvent(token || "", payload);
      setSubmitSuccess(`Dashboard hero banner "${result.title}" published successfully!`);
    } catch (err: unknown) {
      console.error("Failed to publish banner:", err);
      const msg = err instanceof Error ? err.message : "Failed to create banner on the backend.";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit 2: Full Club Event Publisher
  const handleSubmitClubEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventSummary.trim() || !eventType.trim()) {
      setSubmitError("Event title, event type, and summary description are required.");
      return;
    }
    if (eventEligibleBatches.length === 0) {
      setSubmitError("Select at least one eligible graduation batch.");
      return;
    }
    if (eventEligibleBatches.some((batch) => !getEventGraduationBatches().includes(batch))) {
      setSubmitError("The eligible batches have changed. Reload this page and review your selection.");
      return;
    }
    if (!["research", "product", "kaggle", "misc", "all"].includes(eventTrack)) {
      setSubmitError("This event track is not supported by the backend yet. Choose Research, Product, Kaggle, Misc, or All.");
      return;
    }
    if (!["open_to_all", "members_only"].includes(eventAccessScope)) {
      setSubmitError("Invite-only events are not supported by the backend yet. Choose Open to All Students or Club Members Only.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const startDateObj = new Date(eventStartDateTime);
      const endDateObj = eventEndDateTime ? new Date(eventEndDateTime) : null;
      const deadlineDateObj = eventRegDeadline ? new Date(eventRegDeadline) : null;
      if (Number.isNaN(startDateObj.getTime()) || (endDateObj && Number.isNaN(endDateObj.getTime())) || (deadlineDateObj && Number.isNaN(deadlineDateObj.getTime()))) {
        throw new Error("Enter valid event dates before publishing.");
      }
      if (endDateObj && endDateObj <= startDateObj) {
        throw new Error("The event end time must be after its start time.");
      }
      const imageUrl = eventFile
        ? (await api.adminUploadEventMedia(token, eventFile)).url
        : eventBannerUrl.trim();
      if (eventFile) {
        setEventBannerUrl(imageUrl);
        setEventFile(null);
        setEventFilePreview(null);
      }
      const durationMinutes = endDateObj
        ? Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / 60000))
        : undefined;

      const payload = {
        title: eventTitle.trim(),
        slug: eventSlug.trim() || undefined,
        description: eventSummary.trim(),
        detailed_info: eventDetailedInfo.trim() || undefined,
        event_type: eventType.trim(),
        track: eventTrack,
        format: eventFormat,
        venue_info: {
          venue_name: eventVenueName.trim() || undefined,
          room: eventRoom.trim() || undefined,
          meeting_url: eventMeetingUrl.trim() || undefined,
        },
        schedule: {
          start_time: startDateObj.toISOString(),
          end_time: endDateObj ? endDateObj.toISOString() : undefined,
          duration_minutes: durationMinutes,
          registration_deadline: deadlineDateObj?.toISOString(),
        },
        eligibility: {
          access_scope: eventAccessScope,
          allowed_years: eventEligibleBatches,
          allowed_tiers: ["beginner", "advanced", "all"],
          allowed_tracks: ["all"],
          is_mandatory: false,
        },
        participation: {
          mode: eventParticipationMode,
          min_team_size: Number(eventMinTeamSize),
          max_team_size: Number(eventMaxTeamSize),
          max_participants: eventMaxParticipants ? Number(eventMaxParticipants) : undefined,
          requires_event_spg: false,
          spg_auto_disband_days: 3,
        },
        points_reward: {
          attendance_points: Number(eventPointsReward),
          track: eventTrack,
        },
        resources: {
          slides_url: eventSlidesUrl.trim() || undefined,
          discord_thread_id: eventDiscordThread.trim() || undefined,
        },
        banner_url: imageUrl || undefined,
        status: eventStatus,
      };

      const result = await api.adminCreateEvent(token || "", payload);
      setSubmitSuccess(`Club Event "${result.title}" published to calendar and standalone page successfully!`);
    } catch (err: unknown) {
      console.error("Failed to publish club event:", err);
      const msg = err instanceof Error ? err.message : "Failed to publish club event to the backend.";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Merit Award
  const handleAwardMerit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(selectedRecipients).length === 0) {
      setSubmitError("Select at least one member.");
      return;
    }
    if (awardType === "other" && !awardCustomType.trim()) {
      setSubmitError("Enter a name for the other contribution type.");
      return;
    }
    setAwardLoading(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const recipients = { ...selectedRecipients };
      const category = {
        project_milestone: "project_work",
        open_source_pr: "project_work",
        workshop_lead: "teaching",
        community_support: "service",
        attendance: "other",
      }[awardType] || "other";
      const occurredAt = awardOccurredAtRef.current || new Date().toISOString();
      awardOccurredAtRef.current = occurredAt;
      const payload = {
        track: awardTrack,
        category,
        title: {
          project_milestone: "Project milestone",
          open_source_pr: "Open source pull request",
          workshop_lead: "Workshop speaker or lead",
          community_support: "Community support",
          attendance: "Event attendance",
        }[awardType] || awardCustomType.trim(),
        points: Number(awardPoints),
        description: awardReason.trim() || (awardType === "other" ? awardCustomType.trim() : "Administrative merit award"),
        occurred_at: occurredAt,
      };
      const entries = Object.entries(recipients);
      const results: PromiseSettledResult<boolean>[] = [];
      for (let start = 0; start < entries.length; start += 5) {
        const batch = entries.slice(start, start + 5);
        results.push(...await Promise.allSettled(batch.map(async ([uid]) => {
          await api.adminAwardContribution(token, uid, payload);
          return api.adminRecalculateUserPoints(token, uid).then(() => true).catch(() => false);
        })));
      }
      const succeeded = entries.filter((_, index) => results[index].status === "fulfilled").map(([uid]) => uid);
      const failed = entries.filter((_, index) => results[index].status === "rejected").map(([uid]) => uid);
      const stale = results.filter((result) => result.status === "fulfilled" && !result.value).length;
      setSelectedRecipients((current) => Object.fromEntries(Object.entries(current).filter(([uid]) => !succeeded.includes(uid))));
      if (succeeded.length) setSubmitSuccess(`Awarded ${awardPoints} points to ${succeeded.length} member${succeeded.length === 1 ? "" : "s"}.${stale ? ` ${stale} leaderboard total${stale === 1 ? "" : "s"} could not refresh yet.` : ""}`);
      if (failed.length) setSubmitError(`${failed.length} award${failed.length === 1 ? "" : "s"} failed. The failed recipients remain in the form for retry.`);
      if (!failed.length) {
        awardOccurredAtRef.current = null;
        setAwardReason("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to award merit points.";
      setSubmitError(msg);
    } finally {
      setAwardLoading(false);
    }
  };

  // Access check: only admins can view
  if (!profile?.is_admin) {
    return (
      <div className={styles.adminContainer}>
        <div className={styles.unauthorizedCard}>
          <div className={styles.unauthorizedIcon}>
            <MemberIcon name="lock" size={28} />
          </div>
          <h2 style={{ color: "#ffffff", margin: 0 }}>Restricted Access Area</h2>
          <p style={{ color: "#9e9ea4", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
            You do not have administrative privileges to view or manage the Reinforce Club command center.
          </p>
          <Link href="/dashboard" className={styles.switchStudentBtn}>
            <MemberIcon name="chevron-left" size={16} /> Return to Student Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContainer}>
      {/* Top Banner Header */}
      <div className={styles.adminHeader}>
        <div>
          <div className={styles.adminTitleRow}>
            <span className={styles.adminBadge}>Admin Mode</span>
            <span className={styles.liveIndicator}>
              <span className={styles.liveDot} />
              Club administration
            </span>
          </div>
          <h1 className={styles.adminTitle}>Club Command Center</h1>
          <p className={styles.adminSubtitle}>
            Configure dashboard banners, create club events, review SPG proposals, audit student merits, and manage club operations.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            onClick={() => {
              setAdminMode(false);
              router.push("/dashboard");
            }}
            className={styles.switchStudentBtn}
            title="Switch back to student view"
          >
            <MemberIcon name="user" size={16} />
            Switch to Student View
          </button>
        </div>
      </div>

      {submitSuccess && (
        <div className={styles.alertSuccess}>
          <MemberIcon name="check-circle" size={18} />
          {submitSuccess}
        </div>
      )}

      {submitError && (
        <div className={styles.alertError}>
          <MemberIcon name="alert-circle" size={18} />
          {submitError}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DASHBOARD HERO BANNERS */}
      {/* ========================================================================= */}
      {activeTab === "banners" && (
        <div className={styles.managerGrid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <MemberIcon name="image" size={18} />
                  Dashboard Hero Banner Manager
                </h3>
                <div className={styles.cardSubtitle}>
                  Upload image and configure the top 22:9 announcement slider on the student dashboard.
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmitBanner} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Image Upload Dropzone */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Hero Banner Image (Cover)</span>
                  <span className={styles.formLabelHint}>PNG, JPG, WebP up to 5MB</span>
                </label>

                {bannerFilePreview || bannerUrl ? (
                  <div className={styles.imagePreviewBox}>
                    <img
                      src={bannerFilePreview || bannerUrl}
                      alt="Banner Preview"
                      className={styles.imagePreviewImg}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBannerFilePreview(null);
                        setBannerFile(null);
                        setBannerUrl("");
                        if (bannerFileInputRef.current) bannerFileInputRef.current.value = "";
                      }}
                      className={styles.removeImageBtn}
                    >
                      <MemberIcon name="trash" size={13} /> Remove
                    </button>
                  </div>
                ) : (
                  <div
                    className={styles.uploadDropzone}
                    onClick={() => bannerFileInputRef.current?.click()}
                  >
                    <span className={styles.uploadIcon}>
                      <MemberIcon name="image" size={32} />
                    </span>
                    <span className={styles.uploadTextPrimary}>Click to upload hero banner</span>
                    <span className={styles.uploadTextSecondary}>Aspect ratio 16:9 or 22:9 (1200×630px)</span>
                  </div>
                )}

                <input
                  type="file"
                  ref={bannerFileInputRef}
                  onChange={handleBannerFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.fileInputHidden}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Or Banner Asset Path / URL</span>
                </label>
                <input
                  type="text"
                  value={bannerUrl}
                  onChange={(e) => {
                    setBannerUrl(e.target.value);
                    setBannerFile(null);
                    setBannerFilePreview(null);
                    if (bannerFileInputRef.current) bannerFileInputRef.current.value = "";
                  }}
                  placeholder="/banners/reinforce-placeholder.png or https://..."
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={bannerStartDateTime}
                    onChange={(e) => setBannerStartDateTime(e.target.value)}
                    className={styles.formInput}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Date & Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={bannerEndDateTime}
                    onChange={(e) => setBannerEndDateTime(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Displayed Date</label>
                <div className={styles.datetimeHelper}>
                  <MemberIcon name="calendar" size={15} />
                  <span>{bannerDateDisplay}</span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Banner Headline Title</label>
                <input
                  type="text"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g. Reinforce HackSprint 2026"
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Short Summary Description</label>
                <textarea
                  value={bannerDescription}
                  onChange={(e) => setBannerDescription(e.target.value)}
                  placeholder="Summary of the featured event or announcement..."
                  className={styles.formTextarea}
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="banner-badge-text">Badge text (optional)</label>
                  <input id="banner-badge-text" type="text" value={bannerBadgeText}
                    onChange={(e) => setBannerBadgeText(e.target.value)} maxLength={40}
                    placeholder="Featured Banner" className={styles.formInput} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="banner-cta-text">Button text (optional)</label>
                  <input id="banner-cta-text" type="text" value={bannerCtaText}
                    onChange={(e) => setBannerCtaText(e.target.value)} maxLength={40}
                    placeholder="Explore Event →" className={styles.formInput} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="banner-cta-url">Button destination (optional)</label>
                <input id="banner-cta-url" type="text" value={bannerCtaUrl}
                  onChange={(e) => setBannerCtaUrl(e.target.value)} maxLength={2048}
                  placeholder="/dashboard/events or https://example.com/event"
                  className={styles.formInput} />
                <span className={styles.formLabelHint}>Leave blank to open this banner&apos;s event page. Use a site path or HTTPS URL.</span>
              </div>

              <button type="submit" disabled={isSubmitting} className={styles.publishBtn}>
                <MemberIcon name="plus" size={16} />
                {isSubmitting ? "Publishing Banner..." : "Publish Dashboard Hero Banner"}
              </button>
            </form>
          </div>

          {/* Right: Live Preview */}
          <div className={styles.previewWrapper}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>
                    <MemberIcon name="eye" size={18} />
                    Live Student Hero Banner Preview
                  </h3>
                  <div className={styles.cardSubtitle}>
                    Real-time rendering of how this banner appears on the student dashboard hero slider.
                  </div>
                </div>
              </div>

              <div className={styles.livePreviewCard}>
                <div className={styles.livePreviewContent}>
                  <div>
                    <div className={styles.livePreviewTop}>
                      <span className={styles.livePreviewBadge}>{bannerPresentation.badge}</span>
                      <span className={styles.livePreviewDate}>{bannerDateDisplay}</span>
                    </div>
                    <h4 className={styles.livePreviewTitle}>{bannerTitle || "Untitled Announcement"}</h4>
                    <p className={styles.livePreviewDesc}>{bannerDescription || "Description preview..."}</p>
                  </div>
                  <span className={styles.livePreviewCta}>{bannerPresentation.ctaText}</span>
                </div>

                <div className={styles.livePreviewImageSide}>
                  <img
                    src={bannerFilePreview || bannerUrl || "/banners/reinforce-placeholder.png"}
                    alt="Banner Preview"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/banners/reinforce-placeholder.png";
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "#8e8e93", lineHeight: 1.6, marginTop: "8px" }}>
                <strong>Target Surface:</strong> Student Overview Hero Banner Carousel<br />
                <strong>Button destination:</strong> {bannerCtaUrl.trim() || "This banner’s event page"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CLUB EVENTS (STANDALONE PAGE & CALENDAR) */}
      {/* ========================================================================= */}
      {activeTab === "events" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="calendar" size={18} />
                Full Club Event Publisher (Complete Schema)
              </h3>
              <div className={styles.cardSubtitle}>
                Creates a full club event with registration, markdown curriculum, venue, and points reward for the calendar & details page.
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitClubEvent} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Section 1: Basic Info */}
            <div className={styles.formSectionHeading}>1. General Information</div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Event Title</label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => {
                    setEventTitle(e.target.value);
                    if (!eventSlug || eventSlug.startsWith("evt-")) {
                      setEventSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                    }
                  }}
                  placeholder="e.g. Multi-Agent Reinforcement Learning Masterclass"
                  className={styles.formInput}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>URL Slug</span>
                  <span className={styles.formLabelHint}>/dashboard/events/[slug]</span>
                </label>
                <input
                  type="text"
                  value={eventSlug}
                  onChange={(e) => setEventSlug(e.target.value)}
                  placeholder="multi-agent-rl-masterclass"
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Event Type</label>
                <input
                  type="text"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="e.g. Workshop, Hackathon, Meetup"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Track</label>
                <select
                  value={eventTrack}
                  onChange={(e) => setEventTrack(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="research">Research</option>
                  <option value="product">Product</option>
                  <option value="kaggle">Kaggle</option>
                  <option value="misc">Misc</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Format</label>
                <select
                  value={eventFormat}
                  onChange={(e) => setEventFormat(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="offline">Offline (Campus)</option>
                  <option value="online">Online (Discord / Meet)</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Summary Description (Card & Listing View)</label>
              <textarea
                value={eventSummary}
                onChange={(e) => setEventSummary(e.target.value)}
                placeholder="Short 1-2 sentence overview of the event..."
                className={styles.formTextarea}
                rows={2}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Detailed Markdown Curriculum & Specifications</span>
                <span className={styles.formLabelHint}>Supports Markdown headings, lists, code</span>
              </label>
              <textarea
                value={eventDetailedInfo}
                onChange={(e) => setEventDetailedInfo(e.target.value)}
                placeholder="### Curriculum Modules\n1. Deep dive into QMIX\n2. Hands-on coding exercises..."
                className={styles.formTextarea}
                style={{ minHeight: "120px", fontFamily: "monospace" }}
              />
            </div>

            {/* Section 2: Venue & Schedule */}
            <div className={styles.formSectionHeading}>2. Venue & Schedule</div>
            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Venue Name</label>
                <input
                  type="text"
                  value={eventVenueName}
                  onChange={(e) => setEventVenueName(e.target.value)}
                  placeholder="e.g. Guild Main Lab"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Room Number</label>
                <input
                  type="text"
                  value={eventRoom}
                  onChange={(e) => setEventRoom(e.target.value)}
                  placeholder="e.g. Room 402"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Meeting URL (if online)</label>
                <input
                  type="text"
                  value={eventMeetingUrl}
                  onChange={(e) => setEventMeetingUrl(e.target.value)}
                  placeholder="https://discord.gg/reinforce-sst"
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={eventStartDateTime}
                  onChange={(e) => setEventStartDateTime(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>End Date & Time</label>
                <input
                  type="datetime-local"
                  value={eventEndDateTime}
                  onChange={(e) => setEventEndDateTime(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Registration Deadline</label>
                <input
                  type="datetime-local"
                  value={eventRegDeadline}
                  onChange={(e) => setEventRegDeadline(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* Section 3: Eligibility, Participation & Rewards */}
            <div className={styles.formSectionHeading}>3. Participation & Rewards</div>
            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Access Scope</label>
                <select
                  value={eventAccessScope}
                  onChange={(e) => setEventAccessScope(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="open_to_all">Open to All Students</option>
                  <option value="members_only">Club Members Only</option>
                  <option value="invite_only" disabled>Invite Only</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Participation Mode</label>
                <select
                  value={eventParticipationMode}
                  onChange={(e) => setEventParticipationMode(e.target.value as "solo" | "team")}
                  className={styles.formSelect}
                >
                  <option value="solo">Solo Participant</option>
                  <option value="team">Team Based</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Attendance Merit Points</label>
                <input
                  type="number"
                  value={eventPointsReward}
                  onChange={(e) => setEventPointsReward(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 50"
                  className={styles.formInput}
                  min={0}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <span className={styles.formLabel}>Eligible graduation batches</span>
              <div className={styles.batchOptions}>
                {eventGraduationBatches.map((batch) => (
                  <label key={batch} className={styles.batchOption}>
                    <input
                      type="checkbox"
                      checked={eventEligibleBatches.includes(batch)}
                      onChange={(e) => setEventEligibleBatches((selected) =>
                        e.target.checked
                          ? eventGraduationBatches.filter((year) => selected.includes(year) || year === batch)
                          : selected.filter((year) => year !== batch)
                      )}
                    />
                    {batch}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Max Capacity (Slots)</label>
                <input
                  type="number"
                  value={eventMaxParticipants}
                  onChange={(e) => setEventMaxParticipants(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 100"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Min Team Size</label>
                <input
                  type="number"
                  value={eventMinTeamSize}
                  onChange={(e) => setEventMinTeamSize(Number(e.target.value))}
                  className={styles.formInput}
                  disabled={eventParticipationMode === "solo"}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Max Team Size</label>
                <input
                  type="number"
                  value={eventMaxTeamSize}
                  onChange={(e) => setEventMaxTeamSize(Number(e.target.value))}
                  className={styles.formInput}
                  disabled={eventParticipationMode === "solo"}
                />
              </div>
            </div>

            {/* Section 4: Event Poster & Resources */}
            <div className={styles.formSectionHeading}>4. Event Poster & Resources</div>

            {/* Event Poster Upload Dropzone */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Event Banner / Poster Image</span>
                <span className={styles.formLabelHint}>PNG, JPG, WebP up to 5MB</span>
              </label>

              {eventFilePreview || eventBannerUrl ? (
                <div className={styles.imagePreviewBox}>
                  <img
                    src={eventFilePreview || eventBannerUrl}
                    alt="Event Poster Preview"
                    className={styles.imagePreviewImg}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/banners/reinforce-placeholder.png";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEventFilePreview(null);
                      setEventFile(null);
                      setEventBannerUrl("");
                      if (eventFileInputRef.current) eventFileInputRef.current.value = "";
                    }}
                    className={styles.removeImageBtn}
                  >
                    <MemberIcon name="trash" size={13} /> Remove
                  </button>
                </div>
              ) : (
                <div
                  className={styles.uploadDropzone}
                  onClick={() => eventFileInputRef.current?.click()}
                >
                  <span className={styles.uploadIcon}>
                    <MemberIcon name="image" size={32} />
                  </span>
                  <span className={styles.uploadTextPrimary}>Click to upload event banner / poster</span>
                  <span className={styles.uploadTextSecondary}>Recommended 16:9 or 1200×630px</span>
                </div>
              )}

              <input
                type="file"
                ref={eventFileInputRef}
                onChange={handleEventFileChange}
                accept="image/png,image/jpeg,image/webp"
                className={styles.fileInputHidden}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Or Event Banner URL / Path</label>
                <input
                  type="text"
                  value={eventBannerUrl}
                  onChange={(e) => {
                    setEventBannerUrl(e.target.value);
                    setEventFile(null);
                    setEventFilePreview(null);
                    if (eventFileInputRef.current) eventFileInputRef.current.value = "";
                  }}
                  placeholder="/banners/reinforce-placeholder.png or https://..."
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Slides Link URL</label>
                <input
                  type="text"
                  value={eventSlidesUrl}
                  onChange={(e) => setEventSlidesUrl(e.target.value)}
                  placeholder="https://slides.com/..."
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Discord Stage / Thread Link</label>
                <input
                  type="text"
                  value={eventDiscordThread}
                  onChange={(e) => setEventDiscordThread(e.target.value)}
                  placeholder="Discord thread ID or URL"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Publishing Status</label>
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="published">Published (Visible on Calendar)</option>
                  <option value="draft">Draft (Admin Only)</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className={styles.publishBtn}>
              <MemberIcon name="plus" size={16} />
              {isSubmitting ? "Publishing Event..." : "Publish Full Club Event"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "spg" && <AdminTicketsPanel token={token} spgOnly />}

      {activeTab === "tickets" && <AdminTicketsPanel token={token} />}

      {/* TAB 5: Merit Auditing */}
      {activeTab === "contributions" && (
        <div className={`${styles.managerGrid} ${styles.meritGrid}`}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <MemberIcon name="award" size={18} />
                  Award Student Merit Points
                </h3>
                <div className={styles.cardSubtitle}>
                  Directly grant merit points for open-source PRs, hackathons, or workshops.
                </div>
              </div>
            </div>

            <form onSubmit={handleAwardMerit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Member Selection & Search */}
              <div className={styles.recipientSearchContainer}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.formLabel} style={{ marginBottom: 0 }}>
                    Select Recipients ({Object.keys(selectedRecipients).length} Selected)
                  </label>
                  {Object.keys(selectedRecipients).length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllRecipients}
                      className={styles.bulkActionBtn}
                      style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                    >
                      Clear Selection ({Object.keys(selectedRecipients).length})
                    </button>
                  )}
                </div>

                {/* Selected Recipients Chip Tray */}
                {Object.keys(selectedRecipients).length > 0 && (
                  <div className={styles.selectedChipsTray}>
                    {Object.values(selectedRecipients).map((m) => {
                      const uid = m.id;
                      const initials = m.full_name
                        ? m.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                        : "MB";
                      return (
                        <div key={uid} className={styles.recipientChip}>
                          <div className={styles.chipAvatar}>
                            {m.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.avatar_url} alt={m.full_name} className={styles.chipAvatarImg} />
                            ) : (
                              initials
                            )}
                          </div>
                          <span>{m.full_name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipient(uid)}
                            className={styles.chipRemoveBtn}
                            aria-label={`Remove ${m.full_name}`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Search Bar */}
                <div className={styles.recipientSearchBox}>
                  <span className={styles.recipientSearchIcon}>
                    <MemberIcon name="search" size={16} />
                  </span>
                  <input
                    type="search"
                    aria-label="Search members to award"
                    value={awardSearch}
                    onChange={(e) => setAwardSearch(e.target.value)}
                    placeholder="Search by student name or college email..."
                    className={styles.recipientSearchInput}
                  />
                  {awardSearch && (
                    <button
                      type="button"
                      onClick={() => setAwardSearch("")}
                      className={styles.clearSearchBtn}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Bulk Actions Header */}
                <div className={styles.bulkActionBar}>
                  <div className={styles.bulkActionBtns}>
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      disabled={candidatesLoading || awardCandidates.length === 0}
                      className={styles.bulkActionBtn}
                    >
                      Select Visible ({awardCandidates.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllVisible}
                      disabled={candidatesLoading || awardCandidates.length === 0 || !awardCandidates.some(m => Boolean(selectedRecipients[m.id]))}
                      className={styles.bulkActionBtn}
                    >
                      Deselect Visible
                    </button>
                  </div>
                  <span className={styles.selectedCountBadge}>
                    {Object.keys(selectedRecipients).length} selected
                  </span>
                </div>

                {/* Candidate Selection List */}
                <div className={styles.candidateListContainer}>
                  {candidatesLoading ? (
                    <div className={styles.emptyCandidatesText}>Loading members…</div>
                  ) : awardSearchError ? (
                    <div className={styles.emptyCandidatesText} role="alert">{awardSearchError}</div>
                  ) : awardCandidates.length === 0 ? (
                    <div className={styles.emptyCandidatesText}>
                      {awardSearch ? `No members found matching "${awardSearch}".` : "No members found in directory."}
                    </div>
                  ) : (
                    awardCandidates.map((member) => {
                      const uid = member.id;
                      const isSelected = Boolean(selectedRecipients[uid]);
                      const initials = member.full_name
                        ? member.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                        : "MB";
                      return (
                        <button
                          key={uid}
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`Select ${member.full_name}`}
                          onClick={() => handleToggleRecipient(member)}
                          className={`${styles.candidateRow} ${isSelected ? styles.candidateRowSelected : ""}`}
                        >
                          <span className={styles.candidateCheckboxVisual} aria-hidden="true" />
                          <div className={styles.candidateAvatar}>
                            {member.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.avatar_url} alt={member.full_name} className={styles.candidateAvatarImg} />
                            ) : (
                              initials
                            )}
                          </div>
                          <div className={styles.candidateInfo}>
                            <div className={styles.candidateNameRow}>
                              <span className={styles.candidateName}>{member.full_name}</span>
                              <div className={styles.candidateBadges}>
                                {member.is_admin && <span className={`${styles.candidateBadge} ${styles.candidateBadgeAdmin}`}>Admin</span>}
                                {member.role_label?.toLowerCase() === "core" && <span className={`${styles.candidateBadge} ${styles.candidateBadgeCore}`}>Core</span>}
                                {member.tier && member.tier !== "beginner" && <span className={styles.candidateBadge}>{member.tier}</span>}
                              </div>
                            </div>
                            <span className={styles.candidateEmail}>{member.email}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                {!candidatesLoading && !awardSearchError && awardCandidateTotal > awardCandidates.length && (
                  <span className={styles.selectedMembers}>Showing {awardCandidates.length} of {awardCandidateTotal} members. Search to find others.</span>
                )}

                {/* Optional Manual Add Input */}
                <div className={styles.manualAddBox}>
                  <span style={{ fontSize: "11.5px", color: "#8e8e93" }}>
                    Can&apos;t find a member? Add directly by email or Firebase UID:
                  </span>
                  <div className={styles.manualAddRow}>
                    <input
                      type="text"
                      value={manualAddInput}
                      onChange={(e) => { setManualAddInput(e.target.value); setManualAddError(""); }}
                      placeholder="student@sst.scaler.com or UID"
                      className={styles.manualAddInput}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManualRecipient(); } }}
                    />
                    <button
                      type="button"
                      onClick={handleAddManualRecipient}
                      disabled={manualAddLoading || !manualAddInput.trim()}
                      className={styles.manualAddBtn}
                    >
                      {manualAddLoading ? "Searching..." : "+ Add to Selection"}
                    </button>
                  </div>
                  {manualAddError && <span role="alert" style={{ color: "#ef4444", fontSize: "11px" }}>{manualAddError}</span>}
                </div>
              </div>

              {/* Award Configuration: Points, Track, Contribution Type */}
              <div className={styles.formRowThree}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Merit Points (per member)</label>
                  <input
                    type="number"
                    value={awardPoints}
                    onChange={(e) => setAwardPoints(e.target.value === "" ? "" : Number(e.target.value))}
                    className={styles.formInput}
                    min={1}
                    max={500}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Track</label>
                  <select
                    value={awardTrack}
                    onChange={(e) => setAwardTrack(e.target.value as "misc" | "research" | "product" | "kaggle")}
                    className={styles.formSelect}
                  >
                    <option value="misc">General / Misc</option>
                    <option value="research">Research Track</option>
                    <option value="product">Product Track</option>
                    <option value="kaggle">Kaggle Track</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Contribution Type</label>
                  <select
                    value={awardType}
                    onChange={(e) => setAwardType(e.target.value)}
                    className={styles.formSelect}
                  >
                    <option value="project_milestone">Project Milestone</option>
                    <option value="open_source_pr">Open Source PR</option>
                    <option value="workshop_lead">Workshop Speaker / Lead</option>
                    <option value="community_support">Community Support</option>
                    <option value="attendance">Event Attendance</option>
                    <option value="other">Other (custom)</option>
                  </select>
                </div>
              </div>

              {awardType === "other" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Custom contribution type</label>
                  <input
                    className={styles.formInput}
                    value={awardCustomType}
                    onChange={(event) => setAwardCustomType(event.target.value)}
                    maxLength={200}
                    placeholder="e.g. Competition mentor"
                    required
                  />
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Reason / Reference Link</label>
                <input
                  type="text"
                  value={awardReason}
                  onChange={(e) => setAwardReason(e.target.value)}
                  placeholder="Shipped multimodal PR #42 or conducted PyTorch session"
                  className={styles.formInput}
                />
              </div>

              <button
                type="submit"
                disabled={awardLoading || Object.keys(selectedRecipients).length === 0}
                className={styles.publishBtn}
              >
                <MemberIcon name="award" size={16} />
                {awardLoading
                  ? "Awarding Points..."
                  : Object.keys(selectedRecipients).length === 0
                  ? "Select At Least 1 Member"
                  : `Award ${awardPoints} Points to ${Object.keys(selectedRecipients).length} Member${Object.keys(selectedRecipients).length === 1 ? "" : "s"}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: Member Directory */}
      {activeTab === "members" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="users" size={18} />
                Member Directory & Role Management
              </h3>
              <div className={styles.cardSubtitle}>
                Manage membership and roles. Admin access takes effect after the member signs in again.
              </div>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="member-search">Search members by name or email</label>
            <input id="member-search" className={styles.formInput} value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setMemberPage(1); setDirectoryError(""); setDirectoryMessage(""); }} placeholder="Name or college email" />
          </div>
          <LoadingBar loading={directoryLoading} />
          {directoryError && <p role="alert" className={styles.memberMessage}>{directoryError} <button type="button" className={styles.smallAction} onClick={() => { setDirectoryError(""); setDirectoryRevision((value) => value + 1); }}>Retry</button></p>}
          {directoryMessage && <p role="status" className={styles.memberMessage}>{directoryMessage}</p>}
          <div className={styles.memberList}>
            {memberDirectory?.items.map((member) => <MemberRoleRow key={`${member.id}-${member.updated_at}`} member={member} token={token} onSaved={(message) => { setDirectoryMessage(message); setDirectoryRevision((value) => value + 1); }} />)}
            {memberDirectory?.items.length === 0 && !directoryError && !directoryLoading && <p className={styles.cardSubtitle}>No members found.</p>}
          </div>
          {!directoryError && (
            <PaginationBar
              currentPage={memberPage}
              totalItems={memberDirectory?.total ?? 0}
              pageSize={memberPageSize}
              onPageChange={setMemberPage}
              onPageSizeChange={(sz) => {
                setMemberPageSize(sz);
                setMemberPage(1);
              }}
              pageSizeOptions={[20, 50, 100]}
              itemLabel="members"
              disabled={directoryLoading}
            />
          )}
        </div>
      )}

      {(activeTab === "articles" || activeTab === "ideas") && <AdminContentPanel token={token} kind={activeTab} />}
    </div>
  );
}
