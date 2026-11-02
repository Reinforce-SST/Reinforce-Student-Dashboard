"use client";

import React, { useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import type {
  CustomFieldSchema,
  EventTrackSchema,
  TeamSettingsSchema,
  TimelineItemSchema,
} from "@/types/event-matrix";
import styles from "./Admin.module.css";

interface AdminEventCreatePanelProps {
  token: string;
  onCreated: (message: string, slugOrId?: string) => void;
  onError: (message: string) => void;
}

function formatBannerDate(startStr: string): string {
  if (!startStr) return "Upcoming Event";
  const start = new Date(startStr);
  return Number.isFinite(start.getTime())
    ? start.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date not set";
}

function formatBannerTime(startStr: string): string {
  if (!startStr) return "";
  const start = new Date(startStr);
  return Number.isFinite(start.getTime())
    ? start.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}

export default function AdminEventCreatePanel({
  token,
  onCreated,
  onError,
}: AdminEventCreatePanelProps) {
  // --- Section 1: Banner & Hero Poster ---
  const [eventBannerUrl, setEventBannerUrl] = useState("");
  const [eventFilePreview, setEventFilePreview] = useState<string | null>(null);
  const [eventFile, setEventFile] = useState<File | null>(null);
  const [bannerBadgeText, setBannerBadgeText] = useState("");
  const [bannerCtaText, setBannerCtaText] = useState("RSVP Now");
  const [bannerCtaUrl, setBannerCtaUrl] = useState("");
  const eventFileInputRef = useRef<HTMLInputElement>(null);

  // --- Section 2: General Information ---
  const [eventTitle, setEventTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [eventType, setEventType] = useState("Workshop");
  const [eventTrack, setEventTrack] = useState("research");
  const [eventFormat, setEventFormat] = useState("offline");
  const [eventSummary, setEventSummary] = useState("");
  const [eventDetailedInfo, setEventDetailedInfo] = useState("");
  const [curriculumTab, setCurriculumTab] = useState<"edit" | "preview">("edit");

  // --- Section 3: Venue & Schedule ---
  const [eventVenueName, setEventVenueName] = useState("Guild Main Lab");
  const [eventRoom, setEventRoom] = useState("Room 402");
  const [eventMeetingUrl, setEventMeetingUrl] = useState("");
  const [eventStartDateTime, setEventStartDateTime] = useState("");
  const [eventEndDateTime, setEventEndDateTime] = useState("");
  const [eventRegDeadline, setEventRegDeadline] = useState("");

  // --- Section 4: Participation & Eligibility ---
  const [eventAccessScope, setEventAccessScope] = useState("open_to_all");
  const eventGraduationBatches = getEventGraduationBatches();
  const [eventEligibleBatches, setEventEligibleBatches] = useState<number[]>(getEventGraduationBatches);
  const [eventParticipationMode, setEventParticipationMode] = useState<"solo" | "team">("solo");
  const [eventMinTeamSize, setEventMinTeamSize] = useState(1);
  const [eventMaxTeamSize, setEventMaxTeamSize] = useState(1);
  const [eventMaxParticipants, setEventMaxParticipants] = useState<number | "">("");
  const [eventFormsTeamSpg, setEventFormsTeamSpg] = useState(true);
  const [eventPointsReward, setEventPointsReward] = useState<number | "">(50);

  // --- Section 5: Custom Registration Form Builder ---
  const [customFields, setCustomFields] = useState<CustomFieldSchema[]>([]);

  // --- Section 6: Open Tracks / Themes ---
  const [eventTracks, setEventTracks] = useState<EventTrackSchema[]>([]);
  const [allowOpenTrackChange, setAllowOpenTrackChange] = useState(true);

  // --- Section 7: Team Governance & Roster Locking ---
  const [teamSettings, setTeamSettings] = useState<TeamSettingsSchema>({
    allow_team_creation: true,
    require_join_approval: true,
    allow_solo_pool: false,
    lock_rosters_at: null,
    auto_convert_to_spg: false,
  });

  // --- Section 8: Timeline Milestones Schedule ---
  const [timelineItems, setTimelineItems] = useState<TimelineItemSchema[]>([]);

  // --- Section 9: Publishing & External Resources ---
  const [eventSlidesUrl, setEventSlidesUrl] = useState("");
  const [eventDiscordThread, setEventDiscordThread] = useState("");
  const [eventStatus, setEventStatus] = useState("published");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle poster image pick
  const handleEventFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onError("Banner image must be 5MB or smaller.");
      return;
    }
    setEventFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setEventFilePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Duration in hours/minutes
  const durationLabel = useMemo(() => {
    if (!eventStartDateTime || !eventEndDateTime) return null;
    const start = new Date(eventStartDateTime).getTime();
    const end = new Date(eventEndDateTime).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    const totalMinutes = Math.round((end - start) / 60000);
    const days = Math.floor(totalMinutes / 1440);
    if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours} hours`;
    return `${mins} minutes`;
  }, [eventStartDateTime, eventEndDateTime]);

  // Live banner presentation metadata for exact student dashboard preview
  const activePosterSrc =
    eventFilePreview ||
    eventBannerUrl.trim() ||
    "/banners/reinforce-placeholder.png";

  const effectiveBadge =
    bannerBadgeText.trim() ||
    (eventType ? eventType.toUpperCase() : "EVENT");

  const effectiveFormat =
    eventFormat === "offline"
      ? "OFFLINE (CAMPUS)"
      : eventFormat === "online"
      ? "ONLINE"
      : "HYBRID";

  const metaLineParts: string[] = [];
  const dateStr = formatBannerDate(eventStartDateTime);
  if (dateStr) metaLineParts.push(dateStr);
  const timeStr = formatBannerTime(eventStartDateTime);
  if (timeStr) metaLineParts.push(`${timeStr} IST`);
  if (eventVenueName.trim()) {
    metaLineParts.push(eventVenueName.trim() + (eventRoom.trim() ? ` • ${eventRoom.trim()}` : ""));
  }
  if (eventPointsReward !== "" && Number(eventPointsReward) > 0) {
    metaLineParts.push(`${eventPointsReward} Merit Pts`);
  }
  const effectiveMetaLine = metaLineParts.join(" • ") || "Event details to be announced";

  // Quick preset adder for registration intake questions
  const addIntakePreset = (preset: "mess" | "tshirt" | "github" | "hardware" | "problem" | "blank") => {
    switch (preset) {
      case "mess":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: "mess_vendor",
            label: "Mess Vendor Preference",
            field_type: "select",
            options: ["Subway", "Dominos", "Campus Mess", "Other"],
            required: true,
            applies_to: "individual",
            sync_to_matrix: true,
          },
        ]);
        break;
      case "tshirt":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: "tshirt_size",
            label: "T-Shirt Size",
            field_type: "select",
            options: ["S", "M", "L", "XL", "XXL"],
            required: true,
            applies_to: "individual",
            sync_to_matrix: true,
          },
        ]);
        break;
      case "github":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: "github_profile",
            label: "GitHub Profile / Portfolio URL",
            field_type: "url",
            required: false,
            applies_to: "individual",
            sync_to_matrix: true,
          },
        ]);
        break;
      case "hardware":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: "hardware_requirements",
            label: "Hardware / Kit Requirements",
            field_type: "text",
            required: false,
            applies_to: "team",
            sync_to_matrix: true,
          },
        ]);
        break;
      case "problem":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: "problem_statement_id",
            label: "Selected Problem Statement ID",
            field_type: "text",
            required: false,
            applies_to: "team",
            sync_to_matrix: true,
          },
        ]);
        break;
      case "blank":
        setCustomFields((prev) => [
          ...prev,
          {
            field_id: `custom_${Date.now().toString(36)}`,
            label: "New Question",
            field_type: "text",
            required: false,
            applies_to: "individual",
            sync_to_matrix: true,
          },
        ]);
        break;
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventTitle.trim() || !eventSummary.trim() || !eventType.trim()) {
      onError("Event title, event type, and summary description are required.");
      return;
    }
    if (eventEligibleBatches.length === 0) {
      onError("Select at least one eligible graduation batch.");
      return;
    }
    if (!eventStartDateTime) {
      onError("Start date & time is required.");
      return;
    }

    const startDateObj = new Date(eventStartDateTime);
    const endDateObj = eventEndDateTime ? new Date(eventEndDateTime) : null;
    const deadlineDateObj = eventRegDeadline ? new Date(eventRegDeadline) : null;

    if (
      isNaN(startDateObj.getTime()) ||
      (endDateObj && isNaN(endDateObj.getTime())) ||
      (deadlineDateObj && isNaN(deadlineDateObj.getTime()))
    ) {
      onError("Enter valid event dates before publishing.");
      return;
    }
    if (endDateObj && endDateObj <= startDateObj) {
      onError("The event end time must be after its start time.");
      return;
    }

    setIsSubmitting(true);

    try {
      let finalImageUrl = eventBannerUrl.trim();
      if (eventFile) {
        const uploadRes = await api.adminUploadEventMedia(token, eventFile);
        finalImageUrl = uploadRes.url;
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
          requires_event_spg: eventParticipationMode === "team" && eventFormsTeamSpg,
          spg_auto_disband_days: 3,
        },
        points_reward: {
          attendance_points: Number(eventPointsReward || 0),
          track: eventTrack,
        },
        resources: {
          slides_url: eventSlidesUrl.trim() || undefined,
          discord_thread_id: eventDiscordThread.trim() || undefined,
        },
        banner_url: finalImageUrl || undefined,
        banner_badge_text: bannerBadgeText.trim() || undefined,
        banner_cta_text: bannerCtaText.trim() || undefined,
        banner_cta_url: bannerCtaUrl.trim() || undefined,
        custom_registration_fields: customFields,
        event_tracks: eventTracks,
        allow_open_track_change: allowOpenTrackChange,
        team_settings: teamSettings,
        timeline: timelineItems,
        status: eventStatus,
      };

      const result = await api.adminCreateEvent(token, payload);
      onCreated(
        `Event "${result.title}" created successfully ${
          eventStatus === "draft" ? "(Saved in Draft Mode)" : "(Published to Calendar)"
        }!`,
        result.slug || result.id
      );
    } catch (err: unknown) {
      console.error("Failed to create event:", err);
      const msg = err instanceof Error ? err.message : "Failed to create event.";
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* =========================================================================
          BOX 1: EVENT BANNER & EXACT DASHBOARD HERO PREVIEW (TOP SECTION)
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="image" size={18} />
              1. Event Banner & Student Dashboard Hero Display
            </h3>
            <div className={styles.boxSubtitle}>
              Upload a 16:9 poster and preview exactly how this featured event appears on the student dashboard hero slider.
            </div>
          </div>
          <span className={styles.boxBadge}>TOP HERO DISPLAY</span>
        </div>

        {/* 1:1 Exact Dashboard Hero Banner Live Preview */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#e5b731", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            Live Student Overview Banner Preview (Exact Replica)
          </div>

          <div className={styles.exactHeroBanner}>
            <div className={styles.exactHeroContent}>
              <div className={styles.exactHeroTopRow}>
                <div className={styles.exactHeroBadges}>
                  <span className={styles.exactCategoryBadge}>{effectiveBadge}</span>
                  <span className={styles.exactFormatBadge}>{effectiveFormat}</span>
                </div>
                <span className={styles.exactFeaturedLabel}>FEATURED</span>
              </div>

              <div>
                <h2 className={styles.exactHeroTitle}>
                  {eventTitle.trim() || "Multi-Agent Reinforcement Learning Masterclass"}
                </h2>
                <p className={styles.exactHeroDesc}>
                  {eventSummary.trim() ||
                    "Deep dive into cooperative and competitive multi-agent systems with hands-on labs and real-time execution."}
                </p>
              </div>

              <div className={styles.exactHeroMetaLine}>
                <MemberIcon name="calendar" size={13} />
                <span>{effectiveMetaLine}</span>
              </div>

              <div className={styles.exactHeroActionRow}>
                <button type="button" className={styles.exactHeroPrimaryBtn}>
                  {bannerCtaText.trim() || "RSVP Now"}
                </button>
                <span className={styles.exactHeroSecondaryLink}>View details →</span>
              </div>
            </div>

            <div className={styles.exactHeroPosterFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePosterSrc}
                alt="Live Event Banner"
                className={styles.exactHeroPosterImg}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/banners/reinforce-placeholder.png";
                }}
              />
            </div>
          </div>
        </div>

        {/* Upload Controls & Hero Customization */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <span>Upload Poster Image</span>
              <span className={styles.formLabelHint}>PNG, JPG, WebP up to 5MB (16:9 recommended)</span>
            </label>
            {eventFilePreview || eventBannerUrl ? (
              <div className={styles.imagePreviewBox}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={eventFilePreview || eventBannerUrl}
                  alt="Poster Preview"
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
                  <MemberIcon name="trash" size={13} /> Remove Image
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
                <span className={styles.uploadTextSecondary}>16:9 ratio recommended (e.g. 1200×675px)</span>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Or Remote Image URL</label>
              <input
                type="text"
                value={eventBannerUrl}
                onChange={(e) => {
                  setEventBannerUrl(e.target.value);
                  setEventFile(null);
                  setEventFilePreview(null);
                }}
                placeholder="/banners/reinforce-placeholder.png or https://..."
                className={styles.formInput}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Hero Badge Label</span>
                  <span className={styles.formLabelHint}>Overrides default</span>
                </label>
                <input
                  type="text"
                  value={bannerBadgeText}
                  onChange={(e) => setBannerBadgeText(e.target.value)}
                  placeholder="e.g. MASTERCLASS, HACKATHON"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Hero CTA Button Text</label>
                <input
                  type="text"
                  value={bannerCtaText}
                  onChange={(e) => setBannerCtaText(e.target.value)}
                  placeholder="RSVP Now / Register"
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Hero Button Destination URL</span>
                <span className={styles.formLabelHint}>Default points to /dashboard/events/[slug]</span>
              </label>
              <input
                type="text"
                value={bannerCtaUrl}
                onChange={(e) => setBannerCtaUrl(e.target.value)}
                placeholder="/dashboard/events/my-event"
                className={styles.formInput}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          BOX 2: GENERAL INFORMATION
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="info" size={18} />
              2. General Information
            </h3>
            <div className={styles.boxSubtitle}>
              Provide core titles, slugs, club track category, and detailed curriculum specifications.
            </div>
          </div>
          <span className={styles.boxBadge}>ESSENTIALS</span>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Event Title *</label>
            <input
              type="text"
              value={eventTitle}
              onChange={(e) => {
                setEventTitle(e.target.value);
                if (!eventSlug || eventSlug.startsWith("evt-") || eventSlug === eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
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
            <label className={styles.formLabel}>Event Type *</label>
            <input
              type="text"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. Workshop, Hackathon, Meetup"
              className={styles.formInput}
              required
            />
            <div className={styles.presetBtnGroup} style={{ marginTop: "6px" }}>
              {["Workshop", "Hackathon", "Meetup", "Contest", "AMA"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEventType(t)}
                  className={styles.presetBtn}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Track Category</label>
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
          <label className={styles.formLabel}>Summary Description (Card & Listing View) *</label>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label className={styles.formLabel} style={{ margin: 0 }}>
              <span>Detailed Markdown Curriculum & Specifications</span>
              <span className={styles.formLabelHint}>Supports headings, lists, code, prerequisites</span>
            </label>
            <div className={styles.modeSwitchContainer}>
              <button
                type="button"
                onClick={() => setCurriculumTab("edit")}
                className={`${styles.modeSwitchBtn} ${curriculumTab === "edit" ? styles.modeSwitchBtnActive : ""}`}
              >
                Markdown Editor
              </button>
              <button
                type="button"
                onClick={() => setCurriculumTab("preview")}
                className={`${styles.modeSwitchBtn} ${curriculumTab === "preview" ? styles.modeSwitchBtnActive : ""}`}
              >
                Preview
              </button>
            </div>
          </div>

          {curriculumTab === "edit" ? (
            <textarea
              value={eventDetailedInfo}
              onChange={(e) => setEventDetailedInfo(e.target.value)}
              placeholder="### Curriculum Modules&#10;1. Deep dive into QMIX & MADDPG&#10;2. Multi-Agent Gym Environments&#10;3. Final live challenge"
              className={styles.formTextarea}
              style={{ minHeight: "140px", fontFamily: "monospace" }}
            />
          ) : (
            <div
              style={{
                minHeight: "140px",
                background: "#141416",
                border: "1px solid #31343a",
                borderRadius: "8px",
                padding: "16px",
                color: "#d4d4d8",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
              }}
            >
              {eventDetailedInfo.trim() || "(No detailed markdown specifications provided yet)"}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          BOX 3: VENUE & SCHEDULE
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="calendar" size={18} />
              3. Venue & Schedule
            </h3>
            <div className={styles.boxSubtitle}>
              Configure timing, registration deadlines, and physical/online location coordinates.
            </div>
          </div>
          {durationLabel && <span className={styles.boxBadge}>⏱ {durationLabel}</span>}
        </div>

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
            <label className={styles.formLabel}>Room / Lab Number</label>
            <input
              type="text"
              value={eventRoom}
              onChange={(e) => setEventRoom(e.target.value)}
              placeholder="e.g. Room 402"
              className={styles.formInput}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Meeting URL (if online/hybrid)</label>
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
            <label className={styles.formLabel}>Start Date & Time *</label>
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
      </div>

      {/* =========================================================================
          BOX 4: PARTICIPATION, TEAMS & ELIGIBILITY
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="award" size={18} />
              4. Participation, Teams & Eligibility
            </h3>
            <div className={styles.boxSubtitle}>
              Set solo/team constraints, batch eligibility, capacity limits, and attendance merit awards.
            </div>
          </div>
          <span className={styles.boxBadge}>
            {eventParticipationMode === "team" ? "TEAM EVENT" : "SOLO EVENT"}
          </span>
        </div>

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
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="create-participation-mode">Participation Mode</label>
            <select
              id="create-participation-mode"
              aria-label="Participation Mode"
              value={eventParticipationMode}
              onChange={(e) => {
                const mode = e.target.value as "solo" | "team";
                setEventParticipationMode(mode);
                if (mode === "solo") {
                  setEventMinTeamSize(1);
                  setEventMaxTeamSize(1);
                } else {
                  setEventMinTeamSize(2);
                  setEventMaxTeamSize(4);
                }
              }}
              className={styles.formSelect}
            >
              <option value="solo">Solo Participant</option>
              <option value="team">Team Based (Hackathons / Project Groups)</option>
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
          <span className={styles.formLabel}>Eligible Graduation Batches</span>
          <div className={styles.batchOptions}>
            {eventGraduationBatches.map((batch) => (
              <label key={batch} className={styles.batchOption}>
                <input
                  type="checkbox"
                  checked={eventEligibleBatches.includes(batch)}
                  onChange={(e) =>
                    setEventEligibleBatches((selected) =>
                      e.target.checked
                        ? eventGraduationBatches.filter((y) => selected.includes(y) || y === batch)
                        : selected.filter((y) => y !== batch)
                    )
                  }
                />
                Class of {batch}
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
              placeholder="e.g. 100 (Leave blank for unlimited)"
              className={styles.formInput}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="create-min-team-size">Min Team Size</label>
            <input
              id="create-min-team-size"
              aria-label="Min Team Size"
              type="number"
              value={eventMinTeamSize}
              onChange={(e) => setEventMinTeamSize(Number(e.target.value))}
              className={styles.formInput}
              disabled={eventParticipationMode === "solo"}
              min={1}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="create-max-team-size">Max Team Size</label>
            <input
              id="create-max-team-size"
              aria-label="Max Team Size"
              type="number"
              value={eventMaxTeamSize}
              onChange={(e) => setEventMaxTeamSize(Number(e.target.value))}
              className={styles.formInput}
              disabled={eventParticipationMode === "solo"}
              min={1}
            />
          </div>
        </div>

        {eventParticipationMode === "team" && (
          <label className={styles.batchOption} style={{ marginTop: "4px" }}>
            <input
              type="checkbox"
              aria-label="Form a project group (SPG) for each registered team"
              checked={eventFormsTeamSpg}
              onChange={(e) => setEventFormsTeamSpg(e.target.checked)}
            />
            <span>Form a project group (SPG) for each registered team</span>
          </label>
        )}
      </div>

      {/* =========================================================================
          BOX 5: DYNAMIC REGISTRATION FORM BUILDER (CUSTOM INTAKE QUESTIONS)
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="edit" size={18} />
              5. Registration Form Builder (Custom Intake Questions)
            </h3>
            <div className={styles.boxSubtitle}>
              Design custom questions asked during participant registration. Responses sync automatically to the Event Matrix and CSV export.
            </div>
          </div>
          <span className={styles.boxBadge}>
            {customFields.length} {customFields.length === 1 ? "QUESTION" : "QUESTIONS"} CONFIGURED
          </span>
        </div>

        {/* Quick Presets */}
        <div>
          <label style={{ fontSize: "11px", fontWeight: "700", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
            Quick Add Common Questions:
          </label>
          <div className={styles.presetBtnGroup}>
            <button
              type="button"
              onClick={() => addIntakePreset("mess")}
              className={styles.presetBtn}
            >
              <MemberIcon name="plus" size={12} /> Mess Vendor Preference
            </button>
            <button
              type="button"
              onClick={() => addIntakePreset("tshirt")}
              className={styles.presetBtn}
            >
              <MemberIcon name="plus" size={12} /> T-Shirt Size
            </button>
            <button
              type="button"
              onClick={() => addIntakePreset("github")}
              className={styles.presetBtn}
            >
              <MemberIcon name="plus" size={12} /> GitHub / Portfolio URL
            </button>
            <button
              type="button"
              onClick={() => addIntakePreset("hardware")}
              className={styles.presetBtn}
            >
              <MemberIcon name="plus" size={12} /> Hardware Requirements
            </button>
            <button
              type="button"
              onClick={() => addIntakePreset("problem")}
              className={styles.presetBtn}
            >
              <MemberIcon name="plus" size={12} /> Problem Statement ID
            </button>
            <button
              type="button"
              onClick={() => addIntakePreset("blank")}
              className={styles.presetBtn}
              style={{ borderColor: "#e5b731", color: "#e5b731" }}
            >
              <MemberIcon name="plus" size={12} /> Blank Question
            </button>
          </div>
        </div>

        {/* Question Cards List */}
        {customFields.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              background: "#141416",
              borderRadius: "8px",
              border: "1px dashed #31343a",
              color: "#8c8c98",
              fontSize: "13px",
            }}
          >
            No custom intake questions added. Standard registrations will collect basic user profile info.
            <div style={{ marginTop: "8px" }}>
              Click any of the preset buttons above to add questions like Mess Vendor, T-Shirt Size, or Kit Needs.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {customFields.map((cf, idx) => (
              <div
                key={cf.field_id || idx}
                style={{
                  background: "#141416",
                  border: "1px solid #31343a",
                  borderRadius: "10px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#141416", background: "#e5b731", padding: "2px 6px", borderRadius: "4px" }}>
                      Q{idx + 1}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                      {cf.label || "Untitled Question"}
                    </span>
                    <span style={{ fontSize: "11px", color: "#8c8c98" }}>({cf.field_id})</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <MemberIcon name="trash" size={13} /> Delete
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#8c8c98" }}>Question Label</label>
                    <input
                      type="text"
                      value={cf.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: val } : item))
                        );
                      }}
                      className={styles.formInput}
                      placeholder="e.g. Mess Vendor Preference"
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "#8c8c98" }}>Field ID (slug)</label>
                    <input
                      type="text"
                      value={cf.field_id}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, field_id: val } : item))
                        );
                      }}
                      className={styles.formInput}
                      placeholder="mess_vendor"
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "#8c8c98" }}>Field Type</label>
                    <select
                      value={cf.field_type}
                      onChange={(e) => {
                        const val = e.target.value as CustomFieldSchema["field_type"];
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, field_type: val } : item))
                        );
                      }}
                      className={styles.formSelect}
                    >
                      <option value="text">Short Text</option>
                      <option value="select">Dropdown Select</option>
                      <option value="boolean">Boolean Toggle (Yes / No)</option>
                      <option value="url">URL Link</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "#8c8c98" }}>Applies To</label>
                    <select
                      value={cf.applies_to}
                      onChange={(e) => {
                        const val = e.target.value as "individual" | "team";
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, applies_to: val } : item))
                        );
                      }}
                      className={styles.formSelect}
                    >
                      <option value="individual">Each Individual Member</option>
                      <option value="team">Whole Team / Project Level</option>
                    </select>
                  </div>
                </div>

                {cf.field_type === "select" && (
                  <div>
                    <label style={{ fontSize: "11px", color: "#8c8c98" }}>
                      Dropdown Options (comma-separated list)
                    </label>
                    <input
                      type="text"
                      value={(cf.options || []).join(", ")}
                      onChange={(e) => {
                        const opts = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, options: opts } : item))
                        );
                      }}
                      className={styles.formInput}
                      placeholder="e.g. Subway, Dominos, Campus Mess"
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: "20px", marginTop: "2px" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cf.required}
                      onChange={(e) =>
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, required: e.target.checked } : item))
                        )
                      }
                    />
                    <span>Required to complete registration</span>
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cf.sync_to_matrix}
                      onChange={(e) =>
                        setCustomFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, sync_to_matrix: e.target.checked } : item))
                        )
                      }
                    />
                    <span>Auto-create column in Event Matrix</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          BOX 6: SUB-TRACKS & THEMES (HACKATHONS)
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="rocket" size={18} />
              6. Internal Tracks & Problem Statements (Optional)
            </h3>
            <div className={styles.boxSubtitle}>
              Create themed tracks (e.g. FinTech, AI Agents) with optional team limits for hackathons.
            </div>
          </div>
          <span className={styles.boxBadge}>
            {eventTracks.length} {eventTracks.length === 1 ? "TRACK" : "TRACKS"}
          </span>
        </div>

        {eventTracks.map((tr, idx) => (
          <div
            key={tr.track_id || idx}
            style={{
              background: "#141416",
              border: "1px solid #31343a",
              borderRadius: "8px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#e5b731" }}>
                Track #{idx + 1}: {tr.name || "Untitled Track"}
              </span>
              <button
                type="button"
                onClick={() => setEventTracks((prev) => prev.filter((_, i) => i !== idx))}
                style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px" }}
              >
                <MemberIcon name="close" size={12} /> Remove
              </button>
            </div>

            <div className={styles.formRowThree}>
              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>Track Name</label>
                <input
                  type="text"
                  value={tr.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEventTracks((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                    );
                  }}
                  className={styles.formInput}
                  placeholder="e.g. FinTech & DeFi"
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>Track ID</label>
                <input
                  type="text"
                  value={tr.track_id}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                    setEventTracks((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, track_id: val } : item))
                    );
                  }}
                  className={styles.formInput}
                  placeholder="fintech"
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>Max Teams Cap (optional)</label>
                <input
                  type="number"
                  value={tr.max_teams || ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                    setEventTracks((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, max_teams: val } : item))
                    );
                  }}
                  className={styles.formInput}
                  placeholder="Unlimited"
                />
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <button
            type="button"
            onClick={() =>
              setEventTracks((prev) => [
                ...prev,
                {
                  track_id: `track_${Date.now().toString(36)}`,
                  name: `Track ${prev.length + 1}`,
                  description: "",
                },
              ])
            }
            className={styles.presetBtn}
          >
            <MemberIcon name="plus" size={12} /> Add Sub-Track
          </button>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={allowOpenTrackChange}
              onChange={(e) => setAllowOpenTrackChange(e.target.checked)}
            />
            <span>Allow teams to change tracks before the registration deadline</span>
          </label>
        </div>
      </div>

      {/* =========================================================================
          BOX 7: TEAM GOVERNANCE & ROSTER LOCKING
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="lock" size={18} />
              7. Team Governance & Roster Locking
            </h3>
            <div className={styles.boxSubtitle}>
              Control invite codes, solo matching pools, and lock rosters before judging begins.
            </div>
          </div>
          <span className={styles.boxBadge}>GOVERNANCE</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <label className={styles.batchOption}>
            <input
              type="checkbox"
              checked={teamSettings.allow_team_creation}
              onChange={(e) =>
                setTeamSettings((prev) => ({ ...prev, allow_team_creation: e.target.checked }))
              }
            />
            Allow participants to create teams
          </label>

          <label className={styles.batchOption}>
            <input
              type="checkbox"
              checked={teamSettings.require_join_approval}
              onChange={(e) =>
                setTeamSettings((prev) => ({ ...prev, require_join_approval: e.target.checked }))
              }
            />
            Require team invite code to join
          </label>

          <label className={styles.batchOption}>
            <input
              type="checkbox"
              checked={teamSettings.allow_solo_pool}
              onChange={(e) =>
                setTeamSettings((prev) => ({ ...prev, allow_solo_pool: e.target.checked }))
              }
            />
            Enable &quot;Looking for Team&quot; solo matching pool
          </label>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <span>Roster Lock Timestamp (Deadline)</span>
              <span className={styles.formLabelHint}>Members cannot swap or leave teams after this date</span>
            </label>
            <input
              type="datetime-local"
              value={teamSettings.lock_rosters_at ? teamSettings.lock_rosters_at.slice(0, 16) : ""}
              onChange={(e) =>
                setTeamSettings((prev) => ({
                  ...prev,
                  lock_rosters_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                }))
              }
              className={styles.formInput}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Auto-convert to SPG</label>
            <label className={styles.batchOption} style={{ marginTop: "10px" }}>
              <input
                type="checkbox"
                checked={teamSettings.auto_convert_to_spg}
                onChange={(e) =>
                  setTeamSettings((prev) => ({ ...prev, auto_convert_to_spg: e.target.checked }))
                }
              />
              Automatically mint SPGs for all teams when rosters lock
            </label>
          </div>
        </div>
      </div>

      {/* =========================================================================
          BOX 8: TIMELINE & MILESTONES SCHEDULE
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="clock" size={18} />
              8. Event Timeline & Milestone Schedule
            </h3>
            <div className={styles.boxSubtitle}>
              Set up live stages, checkpoints, and submission deadlines for participants.
            </div>
          </div>
          <span className={styles.boxBadge}>
            {timelineItems.length} {timelineItems.length === 1 ? "STAGE" : "STAGES"}
          </span>
        </div>

        {timelineItems.map((item, idx) => (
          <div
            key={item.id || idx}
            style={{
              background: "#141416",
              border: item.is_submission_deadline ? "1px solid rgba(229, 183, 49, 0.4)" : "1px solid #31343a",
              borderRadius: "8px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#141416", background: "#e5b731", padding: "2px 6px", borderRadius: "4px" }}>
                  Stage {idx + 1}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#ffffff" }}>
                  {item.title || "Untitled Stage"}
                </span>
                {item.is_submission_deadline && (
                  <span style={{ fontSize: "10.5px", fontWeight: "700", color: "#f87171", background: "rgba(248, 113, 113, 0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                    SUBMISSION DEADLINE
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTimelineItems((prev) => prev.filter((_, i) => i !== idx))}
                style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px" }}
              >
                <MemberIcon name="close" size={12} /> Remove
              </button>
            </div>

            <div className={styles.formRowThree}>
              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>Milestone Title</label>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTimelineItems((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, title: val } : m))
                    );
                  }}
                  className={styles.formInput}
                  placeholder="e.g. Checkpoint 1: Mentoring"
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>Start Time</label>
                <input
                  type="datetime-local"
                  value={item.start_time ? item.start_time.slice(0, 16) : ""}
                  onChange={(e) => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : "";
                    setTimelineItems((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, start_time: val } : m))
                    );
                  }}
                  className={styles.formInput}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#8c8c98" }}>End Time (optional)</label>
                <input
                  type="datetime-local"
                  value={item.end_time ? item.end_time.slice(0, 16) : ""}
                  onChange={(e) => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : "";
                    setTimelineItems((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, end_time: val } : m))
                    );
                  }}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={item.is_submission_deadline}
                  onChange={(e) =>
                    setTimelineItems((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, is_submission_deadline: e.target.checked } : m))
                    )
                  }
                />
                <span>This stage is the project submission deadline</span>
              </label>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setTimelineItems((prev) => [
              ...prev,
              {
                id: `stage_${Date.now().toString(36)}`,
                title: `Milestone ${prev.length + 1}`,
                start_time: eventStartDateTime ? new Date(eventStartDateTime).toISOString() : new Date().toISOString(),
                is_submission_deadline: false,
              },
            ])
          }
          className={styles.presetBtn}
          style={{ width: "fit-content" }}
        >
          <MemberIcon name="plus" size={12} /> Add Milestone Stage
        </button>
      </div>

      {/* =========================================================================
          BOX 9: PUBLISHING STATUS & EXTERNAL RESOURCES
          ========================================================================= */}
      <div className={styles.boxCard}>
        <div className={styles.boxHeader}>
          <div>
            <h3 className={styles.boxTitle}>
              <MemberIcon name="check-circle" size={18} />
              9. External Links & Publishing Controls
            </h3>
            <div className={styles.boxSubtitle}>
              Link presentation slides, Discord threads, and select Draft Mode for internal testing.
            </div>
          </div>
          <span className={styles.boxBadge}>
            {eventStatus === "draft" ? "🔒 DRAFT MODE" : "PUBLIC"}
          </span>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Slides Link URL</label>
            <input
              type="text"
              value={eventSlidesUrl}
              onChange={(e) => setEventSlidesUrl(e.target.value)}
              placeholder="https://slides.com/... or Google Slides"
              className={styles.formInput}
            />
          </div>
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
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            <span>Publishing Mode</span>
            <span className={styles.formLabelHint}>Draft events are strictly visible to admins only</span>
          </label>
          <select
            value={eventStatus}
            onChange={(e) => setEventStatus(e.target.value)}
            className={styles.formSelect}
          >
            <option value="published">Published (Live & Visible on Calendar)</option>
            <option value="draft">🔒 Draft Mode (Admin Only - for Workflow & Matrix Testing)</option>
          </select>
        </div>

        {eventStatus === "draft" && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(229, 183, 49, 0.08)",
              border: "1px solid rgba(229, 183, 49, 0.3)",
              borderRadius: "8px",
              fontSize: "12.5px",
              color: "#e5b731",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <MemberIcon name="lock" size={14} />
            <span>
              <strong>Draft Mode Active:</strong> Non-admin students will receive a 404. Admins can view the full event, test RSVP intake questions, and test the Event Matrix privately.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.publishBtn}
          style={{ marginTop: "10px" }}
        >
          <MemberIcon name="plus" size={16} />
          {isSubmitting
            ? "Publishing Event..."
            : eventStatus === "draft"
            ? "Create Event (Save as Draft)"
            : "Publish Full Club Event"}
        </button>
      </div>
    </form>
  );
}
