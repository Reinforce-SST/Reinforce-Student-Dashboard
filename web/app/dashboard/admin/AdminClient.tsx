"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { useAdminMode } from "@/lib/useAdminMode";
import { api } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
import MemberIcon from "@/components/dashboard/MemberIcon";
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

function formatScheduleDisplay(startStr: string, endStr?: string): string {
  if (!startStr) return "UPCOMING";
  try {
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return startStr;
    const startMonth = start.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const startDay = start.getDate();
    const startYear = start.getFullYear();
    const startTime = start.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    if (!endStr) {
      return `${startMonth} ${startDay}, ${startYear} · ${startTime}`;
    }

    const end = new Date(endStr);
    if (isNaN(end.getTime())) {
      return `${startMonth} ${startDay}, ${startYear} · ${startTime}`;
    }

    const endMonth = end.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const endDay = end.getDate();
    const endYear = end.getFullYear();
    const endTime = end.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    if (startDay === endDay && startMonth === endMonth && startYear === endYear) {
      return `${startMonth} ${startDay}, ${startYear} · ${startTime} – ${endTime}`;
    } else {
      return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
    }
  } catch {
    return startStr;
  }
}

export default function AdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, token } = useMember();
  const { isAdminMode, setAdminMode } = useAdminMode();

  const tabParam = (searchParams.get("tab") as AdminTab) || "banners";
  const [activeTab, setActiveTab] = useState<AdminTab>(tabParam);

  useEffect(() => {
    if (searchParams.get("tab")) {
      setActiveTab(searchParams.get("tab") as AdminTab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    router.push(`/dashboard/admin?tab=${tab}`);
  };

  // --- TAB 1: Dashboard Hero Banner State ---
  const [bannerBadge, setBannerBadge] = useState("");
  const [bannerStartDateTime, setBannerStartDateTime] = useState("");
  const [bannerEndDateTime, setBannerEndDateTime] = useState("");
  const bannerDateDisplay = formatScheduleDisplay(bannerStartDateTime, bannerEndDateTime);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerDescription, setBannerDescription] = useState("");
  const [bannerCtaText, setBannerCtaText] = useState("");
  const [bannerCtaLink, setBannerCtaLink] = useState("");
  const [bannerTrack, setBannerTrack] = useState("all");
  const [bannerFormat, setBannerFormat] = useState("offline");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFilePreview, setBannerFilePreview] = useState<string | null>(null);

  // --- TAB 2: Full Club Event Publisher State ---
  const [eventTitle, setEventTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [eventType, setEventType] = useState("Workshop");
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
  const [eventStatus, setEventStatus] = useState("published");

  // Status & Refs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const eventFileInputRef = useRef<HTMLInputElement>(null);

  // Merit Award State
  const [awardEmail, setAwardEmail] = useState("");
  const [awardPoints, setAwardPoints] = useState<number | "">(25);
  const [awardReason, setAwardReason] = useState("");
  const [awardType, setAwardType] = useState("project_milestone");
  const [awardLoading, setAwardLoading] = useState(false);

  // Banner File Upload Handler
  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("Image file size exceeds 5MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setBannerFilePreview(result);
      setBannerUrl(result);
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  // Event Poster Upload Handler
  const handleEventFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("Image file size exceeds 5MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setEventFilePreview(result);
      setEventBannerUrl(result);
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  // Submit 1: Dashboard Featured Banner
  const handleSubmitBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitle.trim() || !bannerDescription.trim()) {
      setSubmitError("Title and description are required.");
      return;
    }
    if (bannerBadge.trim() || bannerCtaText.trim() || bannerCtaLink.trim()) {
      setSubmitError("Custom badge and CTA fields are preview-only until the backend supports them. Clear these fields to publish with the standard event link.");
      return;
    }
    if (bannerUrl.startsWith("data:")) {
      setSubmitError("Upload the banner to a hosted image URL first; this image is only a local preview.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const startDateObj = new Date(bannerStartDateTime);
      const endDateObj = bannerEndDateTime ? new Date(bannerEndDateTime) : null;
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
        banner_url: bannerUrl || undefined,
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
    if (!eventTitle.trim() || !eventSummary.trim()) {
      setSubmitError("Event title and summary description are required.");
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
    if (eventBannerUrl.startsWith("data:")) {
      setSubmitError("Upload the poster to a hosted image URL first; this image is only a local preview.");
      return;
    }
    if (!["research", "product", "kaggle", "misc", "all"].includes(eventTrack)) {
      setSubmitError("This event track is not supported by the backend yet. Choose Research, Product, Kaggle, or General Community.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const startDateObj = new Date(eventStartDateTime);
      const endDateObj = eventEndDateTime ? new Date(eventEndDateTime) : null;
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
          registration_deadline: eventRegDeadline ? new Date(eventRegDeadline).toISOString() : undefined,
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
        banner_url: eventBannerUrl || undefined,
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
    if (!awardEmail.trim()) {
      setSubmitError("Student email or user ID is required.");
      return;
    }
    setAwardLoading(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const recipient = await api.getUserProfile(token || "", awardEmail.trim());
      if (!recipient.id) throw new Error("The member could not be resolved to a user ID.");
      const category = {
        project_milestone: "project_work",
        open_source_pr: "project_work",
        workshop_lead: "teaching",
        community_support: "service",
        attendance: "other",
      }[awardType] || "other";
      await api.adminAwardContribution(token || "", recipient.id, {
        track: "misc",
        category,
        title: {
          project_milestone: "Project milestone",
          open_source_pr: "Open source pull request",
          workshop_lead: "Workshop speaker or lead",
          community_support: "Community support",
          attendance: "Event attendance",
        }[awardType] || "Administrative merit award",
        points: Number(awardPoints),
        description: awardReason || "Administrative merit award",
        occurred_at: new Date().toISOString(),
      });
      setSubmitSuccess(`Successfully awarded ${awardPoints} merits to ${awardEmail}!`);
      setAwardEmail("");
      setAwardReason("");
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

      {/* Tabs Navigation */}
      <div className={styles.tabsNav} role="tablist">
        <button
          onClick={() => {
            setSubmitSuccess(null);
            setSubmitError(null);
            handleTabChange("banners");
          }}
          className={`${styles.tabButton} ${activeTab === "banners" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="image" size={16} />
          Dashboard Banners
          <span className={styles.tabBadge}>Hero Slider</span>
        </button>

        <button
          onClick={() => {
            setSubmitSuccess(null);
            setSubmitError(null);
            handleTabChange("events");
          }}
          className={`${styles.tabButton} ${activeTab === "events" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="calendar" size={16} />
          Club Events
        </button>

        <button
          onClick={() => handleTabChange("spg")}
          className={`${styles.tabButton} ${activeTab === "spg" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="spg" size={16} />
          SPG Approvals
        </button>

        <button
          onClick={() => handleTabChange("tickets")}
          className={`${styles.tabButton} ${activeTab === "tickets" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="tickets" size={16} />
          Ticket Console
        </button>

        <button
          onClick={() => handleTabChange("contributions")}
          className={`${styles.tabButton} ${activeTab === "contributions" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="award" size={16} />
          Merit Auditing
        </button>

        <button
          onClick={() => handleTabChange("members")}
          className={`${styles.tabButton} ${activeTab === "members" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="users" size={16} />
          Member Directory
        </button>

        <button
          onClick={() => handleTabChange("articles")}
          className={`${styles.tabButton} ${activeTab === "articles" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="articles" size={16} />
          Articles
        </button>

        <button
          onClick={() => handleTabChange("ideas")}
          className={`${styles.tabButton} ${activeTab === "ideas" ? styles.tabButtonActive : ""}`}
        >
          <MemberIcon name="ideas" size={16} />
          Idea Jar
        </button>
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
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="/banners/reinforce-placeholder.png or https://..."
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Badge Tag</label>
                  <input
                    type="text"
                    value={bannerBadge}
                    onChange={(e) => setBannerBadge(e.target.value)}
                    placeholder="e.g. NEW EVENT, HACKATHON"
                    className={styles.formInput}
                  />
                </div>
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
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Date & Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={bannerEndDateTime}
                    onChange={(e) => setBannerEndDateTime(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Calculated Display Date</label>
                  <div className={styles.datetimeHelper}>
                    <MemberIcon name="calendar" size={15} />
                    <span>{bannerDateDisplay}</span>
                  </div>
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
                  <label className={styles.formLabel}>CTA Button Text</label>
                  <input
                    type="text"
                    value={bannerCtaText}
                    onChange={(e) => setBannerCtaText(e.target.value)}
                    placeholder="Join Session →"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>CTA Destination Link</label>
                  <input
                    type="text"
                    value={bannerCtaLink}
                    onChange={(e) => setBannerCtaLink(e.target.value)}
                    placeholder="/dashboard/events"
                    className={styles.formInput}
                  />
                </div>
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
                      <span className={styles.livePreviewBadge}>{bannerBadge || "ANNOUNCEMENT"}</span>
                      <span className={styles.livePreviewDate}>{bannerDateDisplay}</span>
                    </div>
                    <h4 className={styles.livePreviewTitle}>{bannerTitle || "Untitled Announcement"}</h4>
                    <p className={styles.livePreviewDesc}>{bannerDescription || "Description preview..."}</p>
                  </div>
                  <span className={styles.livePreviewCta}>{bannerCtaText || "Join →"}</span>
                </div>

                <div className={styles.livePreviewImageSide}>
                  <img
                    src={bannerUrl || "/banners/reinforce-placeholder.png"}
                    alt="Banner Preview"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/banners/reinforce-placeholder.png";
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "#8e8e93", lineHeight: 1.6, marginTop: "8px" }}>
                <strong>Target Surface:</strong> Student Overview Hero Banner Carousel<br />
                <strong>Stored Object:</strong> <code>title</code>, <code>description</code>, <code>banner_url</code>, <code>schedule</code>.
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
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="Workshop">Workshop</option>
                  <option value="Hackathon">Hackathon</option>
                  <option value="Meetup">Meetup</option>
                  <option value="Fireside Chat">Fireside Chat</option>
                  <option value="AMA">AMA</option>
                  <option value="Keynote">Keynote</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Track</label>
                <select
                  value={eventTrack}
                  onChange={(e) => setEventTrack(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="research">Research Track</option>
                  <option value="ai_ml">AI / ML</option>
                  <option value="kaggle">Kaggle Track</option>
                  <option value="product">Product Track</option>
                  <option value="systems">Systems Track</option>
                  <option value="web3">Web3 Track</option>
                  <option value="misc">General Community</option>
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
                  <option value="invite_only">Invite Only</option>
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
                  onChange={(e) => setEventBannerUrl(e.target.value)}
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

      {/* TAB 3: SPG Approvals */}
      {activeTab === "spg" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="spg" size={18} />
                Student Project Group (SPG) Proposal Approvals
              </h3>
              <div className={styles.cardSubtitle}>
                Review incoming research and project proposals from students.
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "40px 20px", color: "#8e8e93" }}>
            <MemberIcon name="spg" size={36} />
            <p style={{ marginTop: "12px", fontSize: "14px", color: "#ffffff" }}>
              No pending SPG proposals awaiting approval.
            </p>
            <p style={{ fontSize: "12.5px", maxWidth: "440px", margin: "0 auto" }}>
              New student research proposals submitted via the SPG module will automatically appear here for review and compute allocation.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: Ticket Console */}
      {activeTab === "tickets" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="tickets" size={18} />
                Ticket Support & Resolution Console
              </h3>
              <div className={styles.cardSubtitle}>
                Track and resolve student tickets for compute access, club questions, and verification.
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "40px 20px", color: "#8e8e93" }}>
            <MemberIcon name="tickets" size={36} />
            <p style={{ marginTop: "12px", fontSize: "14px", color: "#ffffff" }}>
              No open student support tickets.
            </p>
            <p style={{ fontSize: "12.5px", maxWidth: "440px", margin: "0 auto" }}>
              Student queries and compute access requests submitted to the ticket console will appear here in real-time.
            </p>
          </div>
        </div>
      )}

      {/* TAB 5: Merit Auditing */}
      {activeTab === "contributions" && (
        <div className={styles.managerGrid}>
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

            <form onSubmit={handleAwardMerit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Student Email / User ID</label>
                <input
                  type="text"
                  value={awardEmail}
                  onChange={(e) => setAwardEmail(e.target.value)}
                  placeholder="student@sst.scaler.com"
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Merit Points</label>
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
                  <label className={styles.formLabel}>Contribution Type</label>
                  <select
                    value={awardType}
                    onChange={(e) => setAwardType(e.target.value)}
                    className={styles.formSelect}
                  >
                    <option value="project_milestone">Project Milestone (100 pts)</option>
                    <option value="open_source_pr">Open Source PR (50 pts)</option>
                    <option value="workshop_lead">Workshop Speaker / Lead (75 pts)</option>
                    <option value="community_support">Community Support (25 pts)</option>
                    <option value="attendance">Event Attendance (10 pts)</option>
                  </select>
                </div>
              </div>

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
                disabled={awardLoading}
                className={styles.publishBtn}
              >
                <MemberIcon name="award" size={16} />
                {awardLoading ? "Awarding Points..." : "Award Merits"}
              </button>
            </form>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <MemberIcon name="check-circle" size={18} />
                  Pending Contribution Submissions
                </h3>
                <div className={styles.cardSubtitle}>
                  Submissions logged by students waiting for admin review.
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", padding: "30px 10px", color: "#8e8e93" }}>
              <MemberIcon name="check-circle" size={32} />
              <p style={{ marginTop: "10px", fontSize: "13px" }}>
                All student contribution logs are currently audited and up to date!
              </p>
            </div>
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
                Manage student verification, batch cohorts, and admin permissions.
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "40px 20px", color: "#8e8e93" }}>
            <MemberIcon name="users" size={36} />
            <p style={{ marginTop: "12px", fontSize: "14px", color: "#ffffff" }}>
              Member directory sync connected to Firestore.
            </p>
            <p style={{ fontSize: "12.5px", maxWidth: "440px", margin: "0 auto" }}>
              Batch roles, discord linkages, and access levels are maintained directly through authoritative user records.
            </p>
          </div>
        </div>
      )}

      {/* TAB 7 & 8: Articles and Ideas */}
      {(activeTab === "articles" || activeTab === "ideas") && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>
                <MemberIcon name={activeTab} size={18} />
                {activeTab === "articles" ? "Article Hub Editorial Pipeline" : "Idea Jar Moderation"}
              </h3>
              <div className={styles.cardSubtitle}>
                Manage peer-reviewed articles, tutorials, and community ideas.
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "40px 20px", color: "#8e8e93" }}>
            <MemberIcon name={activeTab} size={36} />
            <p style={{ marginTop: "12px", fontSize: "14px", color: "#ffffff" }}>
              {activeTab === "articles"
                ? "Article editorial pipeline is ready."
                : "Idea moderation pipeline is ready."}
            </p>
            <p style={{ fontSize: "12.5px", maxWidth: "480px", margin: "0 auto" }}>
              Connect with authors, assign peer reviewers, and feature top pieces on the landing page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
