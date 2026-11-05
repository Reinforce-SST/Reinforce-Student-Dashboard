"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { api, type EventSummaryItem, type EventDocument, type LearningResource, type ResourceType } from "@/lib/api";
import {
  getEventGraduationBatches,
  toISTInputString,
  fromISTInputString,
  parseDateOrIST,
  formatEventDisplayDate,
} from "@/lib/eventsData";
import {
  RESOURCE_TYPES,
  eventResourceCategoryPath,
  parseResourceCategoryPath,
  resourceCategoryId,
  resourceFolderLabel,
  resourceFolders,
  resourceTrackForCategory,
} from "@/lib/learningResources";
import MemberIcon from "@/components/dashboard/MemberIcon";
import type {
  CustomFieldSchema,
  EventTrackSchema,
  TeamSettingsSchema,
  TimelineItemSchema,
  SubmissionConfigSchema,
  SubmissionCustomField,
} from "@/types/event-matrix";
import styles from "./Admin.module.css";

export default function AdminEventEditPanel({
  token,
  onSaved,
}: {
  token: string;
  onSaved: (msg: string) => void;
}) {
  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Search & Filter for List Area
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [eventType, setEventType] = useState("");
  const [track, setTrack] = useState("research");
  const [format, setFormat] = useState("offline");
  const [status, setStatus] = useState("published");

  const [venueName, setVenueName] = useState("");
  const [room, setRoom] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");

  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [regDeadline, setRegDeadline] = useState("");

  const [description, setDescription] = useState("");
  const [detailedInfo, setDetailedInfo] = useState("");

  const [accessScope, setAccessScope] = useState("open_to_all");
  const allGraduationBatches = getEventGraduationBatches();
  const [eligibleBatches, setEligibleBatches] = useState<number[]>(getEventGraduationBatches);

  const [participationMode, setParticipationMode] = useState<"solo" | "team">("solo");
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(1);
  const [formsTeamSpg, setFormsTeamSpg] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");

  const [pointsReward, setPointsReward] = useState<number | "">("");
  const [slidesUrl, setSlidesUrl] = useState("");
  const [discordThread, setDiscordThread] = useState("");
  const [poolResources, setPoolResources] = useState<LearningResource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [newResourceCategory, setNewResourceCategory] = useState("");
  const [newResourceType, setNewResourceType] = useState<ResourceType>("other");
  const [isAddingResource, setIsAddingResource] = useState(false);

  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFilePreview, setBannerFilePreview] = useState<string | null>(null);
  const [bannerBadgeText, setBannerBadgeText] = useState("");
  const [bannerCtaText, setBannerCtaText] = useState("RSVP Now");
  const [bannerCtaUrl, setBannerCtaUrl] = useState("");

  // Advanced Hackathon Operations State
  const [customFields, setCustomFields] = useState<CustomFieldSchema[]>([]);
  const [eventTracks, setEventTracks] = useState<EventTrackSchema[]>([]);
  const [allowOpenTrackChange, setAllowOpenTrackChange] = useState(true);
  const [teamSettings, setTeamSettings] = useState<TeamSettingsSchema>({
    allow_team_creation: true,
    require_join_approval: false,
    allow_solo_pool: true,
    lock_rosters_at: null,
    auto_convert_to_spg: false,
  });
  const [timelineItems, setTimelineItems] = useState<TimelineItemSchema[]>([]);
  const [submissionConfig, setSubmissionConfig] = useState<SubmissionConfigSchema>({
    enable_repo_url: true,
    require_repo_url: true,
    enable_slides_url: true,
    require_slides_url: true,
    enable_demo_url: true,
    require_demo_url: true,
    enable_paper_link: true,
    require_paper_link: true,
    enable_notes: true,
    require_notes: false,
    allow_problem_statement_selection: true,
    require_problem_statement: false,
    custom_fields: [],
  });

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load events
  const loadEvents = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const res = await api.listEvents(token, { limit: 100 });
      // Exclude dashboard hero banners
      const filtered = (res.events || []).filter(
        (ev) => !ev.event_type?.toLowerCase().includes("banner")
      );
      setEvents(filtered);
    } catch (e) {
      console.error("Failed to load events list", e);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Load selected event details
  useEffect(() => {
    if (!selectedId || !token) return;
    let active = true;
    setLoadingDetail(true);
    setErrorMessage(null);
    setSelectedResourceIds([]);

    api
      .getEvent(selectedId, token)
      .then((ev: EventDocument) => {
        if (!active) return;
        setTitle(ev.title || "");
        setSlug(ev.slug || "");
        setNewResourceCategory(resourceFolderLabel(eventResourceCategoryPath(ev.slug, ev.title || "Event")));
        setEventType(ev.event_type || "");
        setTrack(ev.track || "research");
        setFormat(ev.format || "offline");
        setStatus(ev.status || "published");

        setVenueName(ev.venue_info?.venue_name || "");
        setRoom(ev.venue_info?.room || "");
        setMeetingUrl(ev.venue_info?.meeting_url || "");

        setStartDateTime(ev.schedule?.start_time || "");
        setEndDateTime(ev.schedule?.end_time || "");
        setRegDeadline(ev.schedule?.registration_deadline || "");

        setDescription(ev.description || "");
        setDetailedInfo(ev.detailed_info || "");

        setAccessScope(ev.eligibility?.access_scope || "open_to_all");
        setEligibleBatches(ev.eligibility?.allowed_years || allGraduationBatches);

        setParticipationMode(ev.participation?.mode || "solo");
        // Load the stored choice. Saving used to hard-code false, which wiped
        // the setting on every edit.
        setFormsTeamSpg(Boolean(ev.participation?.requires_event_spg));
        setMinTeamSize(ev.participation?.min_team_size || 1);
        setMaxTeamSize(ev.participation?.max_team_size || 1);
        setMaxParticipants(ev.participation?.max_participants ?? "");

        setPointsReward(ev.points_reward?.attendance_points ?? "");
        setSlidesUrl(ev.resources?.slides_url || "");
        setDiscordThread(ev.resources?.discord_thread_id || "");
        setSelectedResourceIds(ev.resources?.learning_resource_ids || []);

        setBannerUrl(ev.banner_url || "");
        setBannerBadgeText(ev.banner_badge_text || "");
        setBannerCtaText(ev.banner_cta_text || "RSVP Now");
        setBannerCtaUrl(ev.banner_cta_url || "");
        setBannerFile(null);
        setBannerFilePreview(null);

        setCustomFields(ev.custom_registration_fields || []);
        setEventTracks(ev.event_tracks || []);
        setAllowOpenTrackChange(ev.allow_open_track_change ?? true);
        setTeamSettings(ev.team_settings || {
          allow_team_creation: true,
          require_join_approval: false,
          allow_solo_pool: true,
          lock_rosters_at: null,
          auto_convert_to_spg: false,
        });
        setTimelineItems(ev.timeline || []);
        setSubmissionConfig(
          ev.submission_config || {
            enable_repo_url: true,
            require_repo_url: true,
            enable_slides_url: true,
            require_slides_url: true,
            enable_demo_url: true,
            require_demo_url: true,
            enable_paper_link: true,
            require_paper_link: true,
            enable_notes: true,
            require_notes: false,
            allow_problem_statement_selection: true,
            require_problem_statement: false,
            custom_fields: [],
          }
        );
      })
      .catch((err) => {
        if (active) setErrorMessage(err instanceof Error ? err.message : "Failed to load event.");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId, token]);

  useEffect(() => {
    if (!selectedId || !token) {
      setPoolResources([]);
      setResourcesLoading(false);
      return;
    }
    let active = true;
    setPoolResources([]);
    setResourcesLoading(true);
    api.listLearningResources({ status: "published" }, token)
      .then((result) => { if (active) setPoolResources(result.resources); })
      .catch(() => { if (active) setErrorMessage("The shared resource pool could not be loaded."); })
      .finally(() => { if (active) setResourcesLoading(false); });
    return () => { active = false; };
  }, [selectedId, token]);

  const handleAddPoolResource = async () => {
    if (!newResourceTitle.trim() || !newResourceUrl.trim()) {
      setErrorMessage("Enter a title and web link for the resource.");
      return;
    }
    const categoryPath = parseResourceCategoryPath(newResourceCategory);
    if (!categoryPath.valid) {
      setErrorMessage("Use up to eight folder names separated by /. Each folder name must contain letters or numbers.");
      return;
    }
    setIsAddingResource(true);
    setErrorMessage(null);
    try {
      const created = await api.adminCreateLearningResource(token, {
        title: newResourceTitle.trim(),
        url: newResourceUrl.trim(),
        category_id: categoryPath.categoryId,
        track: resourceTrackForCategory(categoryPath.categoryId),
        type: newResourceType,
        status: "published",
      });
      setPoolResources((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedResourceIds((current) => current.includes(created.id) ? current : [...current, created.id]);
      setNewResourceTitle("");
      setNewResourceUrl("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "The resource could not be added.");
    } finally {
      setIsAddingResource(false);
    }
  };

  // Filtered list
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterStatus !== "all" && ev.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (ev.title || "").toLowerCase().includes(q);
        const matchSlug = (ev.slug || "").toLowerCase().includes(q);
        const matchTrack = (ev.track || "").toLowerCase().includes(q);
        const matchType = (ev.event_type || "").toLowerCase().includes(q);
        return matchTitle || matchSlug || matchTrack || matchType;
      }
      return true;
    });
  }, [events, filterStatus, searchQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image must be under 5MB.");
      return;
    }
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = () => setBannerFilePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBatchToggle = (batch: number) => {
    setEligibleBatches((prev) =>
      prev.includes(batch) ? prev.filter((b) => b !== batch) : [...prev, batch]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      setErrorMessage("Please choose an event to edit.");
      return;
    }
    if (!title.trim() || !description.trim() || !eventType.trim()) {
      setErrorMessage("Event title, event type, and summary description are required.");
      return;
    }
    if (eligibleBatches.length === 0) {
      setErrorMessage("Select at least one eligible graduation batch.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const startDateObj = parseDateOrIST(startDateTime);
      const endDateObj = endDateTime ? parseDateOrIST(endDateTime) : null;
      const deadlineDateObj = regDeadline ? parseDateOrIST(regDeadline) : null;

      if (!startDateObj || Number.isNaN(startDateObj.getTime()) || (endDateObj && Number.isNaN(endDateObj.getTime()))) {
        throw new Error("Enter valid event dates.");
      }
      if (endDateObj && endDateObj <= startDateObj) {
        throw new Error("Event end time must be after its start time.");
      }

      let imageUrl = bannerUrl.trim();
      if (bannerFile) {
        imageUrl = (await api.adminUploadEventMedia(token, bannerFile)).url;
        setBannerUrl(imageUrl);
        setBannerFile(null);
        setBannerFilePreview(null);
      }

      const durationMinutes = endDateObj
        ? Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / 60000))
        : undefined;

      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        detailed_info: detailedInfo.trim() || undefined,
        event_type: eventType.trim(),
        track,
        format,
        venue_info: {
          venue_name: venueName.trim() || undefined,
          room: room.trim() || undefined,
          meeting_url: meetingUrl.trim() || undefined,
        },
        schedule: {
          start_time: startDateObj.toISOString(),
          end_time: endDateObj ? endDateObj.toISOString() : undefined,
          duration_minutes: durationMinutes,
          registration_deadline: deadlineDateObj ? deadlineDateObj.toISOString() : undefined,
        },
        eligibility: {
          access_scope: accessScope,
          allowed_years: eligibleBatches,
          allowed_tiers: ["beginner", "advanced", "all"],
          allowed_tracks: ["all"],
          is_mandatory: false,
        },
        participation: {
          mode: participationMode,
          min_team_size: Number(minTeamSize),
          max_team_size: Number(maxTeamSize),
          max_participants: maxParticipants ? Number(maxParticipants) : undefined,
          requires_event_spg: participationMode === "team" && formsTeamSpg,
          spg_auto_disband_days: 3,
        },
        points_reward: {
          attendance_points: Number(pointsReward || 0),
          track,
        },
        resources: {
          slides_url: slidesUrl.trim() || null,
          discord_thread_id: discordThread.trim() || null,
          learning_resource_ids: selectedResourceIds,
        },
        banner_url: imageUrl || undefined,
        banner_badge_text: bannerBadgeText.trim() || undefined,
        banner_cta_text: bannerCtaText.trim() || undefined,
        banner_cta_url: bannerCtaUrl.trim() || undefined,
        status,
        custom_registration_fields: customFields,
        event_tracks: eventTracks,
        allow_open_track_change: allowOpenTrackChange,
        team_settings: teamSettings,
        timeline: timelineItems,
        submission_config: submissionConfig,
      };

      const updated = await api.adminUpdateEvent(token, selectedId, payload);
      onSaved(`Event "${updated.title}" updated successfully!`);
      loadEvents();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeStyle = (st?: string) => {
    switch (st?.toLowerCase()) {
      case "published":
        return { background: "rgba(34, 197, 94, 0.12)", color: "#22c55e", border: "1px solid rgba(34, 197, 94, 0.3)" };
      case "ongoing":
        return { background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)" };
      case "draft":
        return { background: "rgba(234, 179, 8, 0.12)", color: "#eab308", border: "1px solid rgba(234, 179, 8, 0.3)" };
      case "completed":
        return { background: "rgba(168, 85, 247, 0.12)", color: "#a855f7", border: "1px solid rgba(168, 85, 247, 0.3)" };
      default:
        return { background: "rgba(142, 142, 147, 0.12)", color: "#8e8e93", border: "1px solid rgba(142, 142, 147, 0.3)" };
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>
            <MemberIcon name="calendar" size={18} />
            Existing Club Events Directory
          </h3>
          <div className={styles.cardSubtitle}>
            Browse, inspect, and select any club event to modify its configuration, schedule, agenda, or banner.
          </div>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          disabled={loadingList}
          className={styles.viewActionBtn}
          title="Refresh event list"
        >
          <MemberIcon name="lightning" size={14} />
          {loadingList ? "Refreshing..." : "Refresh List"}
        </button>
      </div>

      {errorMessage && (
        <div className={styles.alertError} style={{ marginBottom: "16px" }}>
          <MemberIcon name="alert-circle" size={18} />
          {errorMessage}
        </div>
      )}

      {/* VIEW 1: LIST EVENT AREA (When no event is selected for editing) */}
      {!selectedId && (
        <div>
          {/* Toolbar: Search & Filter Pills */}
          <div className={styles.eventListToolbar}>
            <input
              type="search"
              placeholder="Search events by title, slug, track, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.eventSearchInput}
            />

            <div className={styles.statusFilterPills}>
              {["all", "published", "draft", "ongoing", "completed", "cancelled"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`${styles.statusFilterPill} ${filterStatus === st ? styles.statusFilterPillActive : ""}`}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {loadingList ? (
            <div style={{ textAlign: "center", padding: "48px", color: "#e5b731" }}>
              Loading existing club events...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "#8e8e93",
                background: "#141416",
                borderRadius: "12px",
                border: "1px dashed #282830",
              }}
            >
              <MemberIcon name="calendar" size={32} />
              <p style={{ marginTop: "12px", fontSize: "14px" }}>
                {searchQuery || filterStatus !== "all"
                  ? "No events found matching your search and filter criteria."
                  : "No events published yet."}
              </p>
            </div>
          ) : (
            <div className={styles.eventListGrid}>
              {filteredEvents.map((ev) => (
                <article key={ev.id} className={styles.eventItemCard}>
                  <div className={styles.eventItemLeft}>
                    <div className={styles.eventItemTitleRow}>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          ...getStatusBadgeStyle(ev.status),
                        }}
                      >
                        {ev.status || "PUBLISHED"}
                      </span>

                      <h4 className={styles.eventItemTitle}>{ev.title}</h4>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#e5b731",
                          background: "rgba(229, 183, 49, 0.1)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                        }}
                      >
                        {ev.track || "ALL"} TRACK
                      </span>

                      {ev.event_type && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#b0b0be",
                            background: "#212126",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {ev.event_type}
                        </span>
                      )}
                    </div>

                    <div className={styles.eventItemMeta}>
                      <span className={styles.eventItemMetaSpan}>
                        <MemberIcon name="clock" size={13} />
                        {formatEventDisplayDate(ev.schedule?.start_time)}
                      </span>

                      <span className={styles.eventItemMetaSpan}>
                        <MemberIcon name="location" size={13} />
                        {(ev.format || "OFFLINE").toUpperCase()}
                        {ev.venue_info?.venue_name ? ` Â· ${ev.venue_info.venue_name}` : ""}
                      </span>

                      {ev.stats?.registered_count !== undefined && (
                        <span className={styles.eventItemMetaSpan}>
                          <MemberIcon name="users" size={13} />
                          {ev.stats.registered_count} RSVP
                        </span>
                      )}

                      <span style={{ color: "#52525b" }}>Slug: /{ev.slug || ev.id}</span>
                    </div>
                  </div>

                  <div className={styles.eventItemActions}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ev.id)}
                      className={styles.editActionBtn}
                      title="Edit event settings, dates, and content"
                    >
                      <MemberIcon name="edit" size={13} />
                      Edit Event
                    </button>

                    <Link
                      href={`/dashboard/events/${ev.slug || ev.id}`}
                      target="_blank"
                      className={styles.viewActionBtn}
                      title="Open public event page in new tab"
                    >
                      <MemberIcon name="external" size={13} />
                      View Page ↗
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: FULL EDIT FORM (When an event is selected from the list) */}
      {selectedId && (
        <div>
          {/* Header Banner: Back to List & Quick Actions */}
          <div className={styles.editingBannerBox}>
            <div className={styles.editingBannerText}>
              <button
                type="button"
                onClick={() => setSelectedId("")}
                className={styles.backToListBtn}
              >
                ← Back to All Events
              </button>
              <span>
                <strong>Currently Editing:</strong> {title || "Selected Event"}
              </span>
            </div>

            <Link
              href={`/dashboard/events/${slug || selectedId}`}
              target="_blank"
              className={styles.viewActionBtn}
            >
              <MemberIcon name="external" size={13} />
              View Live Page ↗
            </Link>
          </div>

          {loadingDetail ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#e5b731" }}>
              Loading event details...
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Box 1: Event Banner & Live Hero Display (TOP SECTION) */}
              <div className={styles.boxCard}>
                <div className={styles.boxHeader}>
                  <div>
                    <h3 className={styles.boxTitle}>
                      <MemberIcon name="image" size={18} />
                      1. Event Banner & Student Dashboard Hero Display
                    </h3>
                    <div className={styles.boxSubtitle}>
                      Upload or update the 16:9 poster and preview exactly how this featured event appears on the student dashboard hero slider.
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
                          <span className={styles.exactCategoryBadge}>
                            {bannerBadgeText.trim() || (eventType ? eventType.toUpperCase() : "EVENT")}
                          </span>
                          <span className={styles.exactFormatBadge}>
                            {format === "offline" ? "OFFLINE (CAMPUS)" : format === "online" ? "ONLINE" : "HYBRID"}
                          </span>
                        </div>
                        <span className={styles.exactFeaturedLabel}>FEATURED</span>
                      </div>

                      <div>
                        <h2 className={styles.exactHeroTitle}>
                          {title.trim() || "Event Title"}
                        </h2>
                        <p className={styles.exactHeroDesc}>
                          {description.trim() || "Event description overview..."}
                        </p>
                      </div>

                      <div className={styles.exactHeroMetaLine}>
                        <MemberIcon name="calendar" size={13} />
                        <span>
                          {[
                            formatEventDisplayDate(startDateTime),
                            venueName.trim() ? `${venueName.trim()}${room.trim() ? ` • ${room.trim()}` : ""}` : "",
                            pointsReward !== "" && Number(pointsReward) > 0 ? `${pointsReward} Merit Pts` : "",
                          ].filter(Boolean).join(" • ") || "Event details to be announced"}
                        </span>
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
                        src={bannerFilePreview || bannerUrl.trim() || "/banners/reinforce-placeholder.png"}
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
                    {bannerFilePreview || bannerUrl ? (
                      <div className={styles.imagePreviewBox}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={bannerFilePreview || bannerUrl}
                          alt="Poster Preview"
                          className={styles.imagePreviewImg}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/banners/reinforce-placeholder.png";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBannerFilePreview(null);
                            setBannerFile(null);
                            setBannerUrl("");
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className={styles.removeImageBtn}
                        >
                          <MemberIcon name="trash" size={13} /> Remove Image
                        </button>
                      </div>
                    ) : (
                      <div
                        className={styles.uploadDropzone}
                        onClick={() => fileInputRef.current?.click()}
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
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/png,image/jpeg,image/webp"
                      className={styles.fileInputHidden}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Or Remote Image URL</label>
                      <input
                        type="text"
                        value={bannerUrl}
                        onChange={(e) => {
                          setBannerUrl(e.target.value);
                          setBannerFile(null);
                          setBannerFilePreview(null);
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
              {/* Section 1: General Info */}
              <div className={styles.formSectionHeading}>1. General Information & Status</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Event Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={styles.formInput}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>URL Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
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
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Track</label>
                  <select
                    value={track}
                    onChange={(e) => setTrack(e.target.value)}
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
                  <label className={styles.formLabel}>Lifecycle Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={styles.formSelect}
                  >
                    <option value="published">Published (Visible)</option>
                    <option value="draft">Draft (Admin Only)</option>
                    <option value="registration_closed">Registration Closed</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Section 2: Date, Time & Venue */}
              <div className={styles.formSectionHeading}>2. Schedule & Venue</div>
              <div className={styles.formRowThree}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={toISTInputString(startDateTime)}
                    onChange={(e) => setStartDateTime(fromISTInputString(e.target.value))}
                    className={styles.formInput}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={toISTInputString(endDateTime)}
                    onChange={(e) => setEndDateTime(fromISTInputString(e.target.value))}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Registration Deadline</label>
                  <input
                    type="datetime-local"
                    value={toISTInputString(regDeadline)}
                    onChange={(e) => setRegDeadline(fromISTInputString(e.target.value))}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formRowThree}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className={styles.formSelect}
                  >
                    <option value="offline">Offline (Campus)</option>
                    <option value="online">Online (Discord / Meet)</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Venue Name</label>
                  <input
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="e.g. Macro Campus / Main Audi"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Room / Meeting Link</label>
                  <input
                    type="text"
                    value={format === "online" ? meetingUrl : room}
                    onChange={(e) => (format === "online" ? setMeetingUrl(e.target.value) : setRoom(e.target.value))}
                    placeholder={format === "online" ? "https://meet.google.com/..." : "Classroom 204"}
                    className={styles.formInput}
                  />
                </div>
              </div>

              {/* Section 3: Agenda & Description */}
              <div className={styles.formSectionHeading}>3. Description & Curriculum</div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Summary Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={styles.formTextarea}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Full Specifications & Curriculum (Markdown)</span>
                </label>
                <textarea
                  value={detailedInfo}
                  onChange={(e) => setDetailedInfo(e.target.value)}
                  rows={6}
                  className={styles.formTextarea}
                  placeholder="Detailed schedule, prerequisites, submission rules..."
                />
              </div>

              {/* Section 4: Eligibility & Capacity */}
              <div className={styles.formSectionHeading}>4. Eligibility & Team Settings</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Access Scope</label>
                  <select
                    value={accessScope}
                    onChange={(e) => setAccessScope(e.target.value)}
                    className={styles.formSelect}
                  >
                    <option value="open_to_all">Open to All Students</option>
                    <option value="members_only">Club Members Only</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="edit-event-mode">Participation Mode</label>
                  <select
                    id="edit-event-mode"
                    value={participationMode}
                    onChange={(e) => {
                      const next = e.target.value as "solo" | "team";
                      // Turning a solo event into a team event starts with groups on,
                      // the same default a new team event gets.
                      if (next === "team" && participationMode === "solo") setFormsTeamSpg(true);
                      setParticipationMode(next);
                    }}
                    className={styles.formSelect}
                  >
                    <option value="solo">Solo (Individual)</option>
                    <option value="team">Team Based</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Eligible Graduation Batches</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "6px" }}>
                  {allGraduationBatches.map((batch) => (
                    <label
                      key={batch}
                      className={`${styles.checkboxPill} ${eligibleBatches.includes(batch) ? styles.checkboxPillActive : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={eligibleBatches.includes(batch)}
                        onChange={() => handleBatchToggle(batch)}
                      />
                      <span>Batch {batch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {participationMode === "team" && (
                <label className={`${styles.checkboxPill} ${formsTeamSpg ? styles.checkboxPillActive : ""}`}>
                  <input
                    type="checkbox"
                    checked={formsTeamSpg}
                    onChange={(e) => setFormsTeamSpg(e.target.checked)}
                  />
                  <span>Form a project group (SPG) for each registered team</span>
                </label>
              )}

              {participationMode === "team" && (
                <div className={styles.formRowThree}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="edit-min-team-size">Min Team Size</label>
                    <input
                      id="edit-min-team-size"
                      aria-label="Min Team Size"
                      type="number"
                      min={1}
                      max={10}
                      value={minTeamSize}
                      onChange={(e) => setMinTeamSize(Number(e.target.value))}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="edit-max-team-size">Max Team Size</label>
                    <input
                      id="edit-max-team-size"
                      aria-label="Max Team Size"
                      type="number"
                      min={1}
                      max={10}
                      value={maxTeamSize}
                      onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Max Event Capacity</label>
                    <input
                      type="number"
                      min={1}
                      value={maxParticipants}
                      onChange={(e) => setMaxParticipants(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Unlimited if blank"
                      className={styles.formInput}
                    />
                  </div>
                </div>
              )}

              {/* Section 5: Points & Media */}
              <div className={styles.formSectionHeading}>5. Points & Cover Banner</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Attendance Merit Points</label>
                  <input
                    type="number"
                    min={0}
                    value={pointsReward}
                    onChange={(e) => setPointsReward(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 20"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Slides / Docs URL</label>
                  <input
                    type="url"
                    value={slidesUrl}
                    onChange={(e) => setSlidesUrl(e.target.value)}
                    placeholder="https://docs.google.com/..."
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formSectionHeading}>6. Shared Learning Links</div>
              <fieldset className={styles.eventResourcePicker}>
                <legend>Links shown on this event</legend>
                <p className={styles.cardSubtitle}>
                  Choose several links from the shared pool. A link can be reused on other events.
                </p>
                {resourcesLoading ? (
                  <p className={styles.cardSubtitle}>Loading shared links...</p>
                ) : poolResources.length ? (
                  <div className={styles.eventResourceOptions}>
                    {poolResources.map((resource) => (
                      <label key={resource.id} className={styles.eventResourceOption}>
                        <input
                          type="checkbox"
                          checked={selectedResourceIds.includes(resource.id)}
                          onChange={(event) => setSelectedResourceIds((current) =>
                            event.target.checked
                              ? [...current, resource.id]
                              : current.filter((id) => id !== resource.id)
                          )}
                          aria-label={`Show ${resource.title} on this event`}
                        />
                        <span className={styles.eventResourceText}>
                          <span>{resource.title}</span>
                          <small>{resourceFolderLabel(resourceCategoryId(resource))} Â· {resource.url}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className={styles.cardSubtitle}>The shared pool has no published links yet.</p>
                )}

                <div className={styles.eventResourceAdd}>
                  <p className={styles.cardSubtitle}>
                    New links are added to the shared pool immediately. Save event changes below to attach them to this event.
                  </p>
                  <div className={styles.formRowThree}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="event-resource-title">Link title</label>
                      <input
                        id="event-resource-title"
                        className={styles.formInput}
                        value={newResourceTitle}
                        onChange={(event) => setNewResourceTitle(event.target.value)}
                        placeholder="e.g. Workshop notes"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="event-resource-url">Web link</label>
                      <input
                        id="event-resource-url"
                        type="url"
                        className={styles.formInput}
                        value={newResourceUrl}
                        onChange={(event) => setNewResourceUrl(event.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="event-resource-category">Category path</label>
                      <input
                        id="event-resource-category"
                        className={styles.formInput}
                        list="event-resource-category-paths"
                        value={newResourceCategory}
                        onChange={(event) => setNewResourceCategory(event.target.value)}
                        placeholder="Events / event name"
                        aria-describedby="event-resource-category-hint"
                      />
                      <datalist id="event-resource-category-paths">
                        {resourceFolders(poolResources).map((folder) => (
                          <option key={folder.id} value={resourceFolderLabel(folder.id)} />
                        ))}
                      </datalist>
                      <small id="event-resource-category-hint" className={styles.formLabelHint}>
                        Use / between nested folders. This event&apos;s folder is preselected.
                      </small>
                    </div>
                  </div>
                  <div className={styles.eventResourceAddActions}>
                    <label className={styles.formGroup} htmlFor="event-resource-type">
                      <span className={styles.formLabel}>Link type</span>
                      <select
                        id="event-resource-type"
                        className={styles.formSelect}
                        value={newResourceType}
                        onChange={(event) => setNewResourceType(event.target.value as ResourceType)}
                      >
                        {RESOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.smallAction}
                      disabled={isAddingResource || !newResourceTitle.trim() || !newResourceUrl.trim()}
                      onClick={handleAddPoolResource}
                    >
                      {isAddingResource ? "Adding link..." : "Add to shared pool"}
                    </button>
                  </div>
                </div>
              </fieldset>



              {/* Section 6: Custom Registration Intake Fields */}
              <div className={styles.formSectionHeading}>6. Custom Registration Intake Fields</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1a1a20", padding: "16px", borderRadius: "8px", border: "1px solid #282832" }}>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#a1a1aa" }}>
                  Prompt attendees or teams for custom logistical, hardware, or problem information during RSVP. Answers automatically hydrate into the Event Matrix.
                </p>

                {/* Quick Presets */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
                    Quick Add Common Questions:
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("mess")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                    >
                      <MemberIcon name="plus" size={12} /> Mess Vendor Preference
                    </button>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("tshirt")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                    >
                      <MemberIcon name="plus" size={12} /> T-Shirt Size
                    </button>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("github")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                    >
                      <MemberIcon name="plus" size={12} /> GitHub / Portfolio URL
                    </button>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("hardware")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                    >
                      <MemberIcon name="plus" size={12} /> Hardware Requirements
                    </button>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("problem")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                    >
                      <MemberIcon name="plus" size={12} /> Problem Statement ID
                    </button>
                    <button
                      type="button"
                      onClick={() => addIntakePreset("blank")}
                      className={styles.secondaryBtn}
                      style={{ fontSize: "12px", padding: "4px 8px", borderColor: "#e5b731", color: "#e5b731" }}
                    >
                      <MemberIcon name="plus" size={12} /> Blank Question
                    </button>
                  </div>
                </div>

                {customFields.map((cf, idx) => (
                  <div
                    key={cf.field_id || idx}
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#e5b731" }}>
                        Field #{idx + 1}: {cf.label || "Untitled Field"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <MemberIcon name="close" size={12} /> Remove
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
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
                          placeholder="e.g. Mess Vendor / T-Shirt Size"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Identifier (Slug)</label>
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
                          placeholder="e.g. mess_vendor"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Type</label>
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
                          <option value="boolean">Boolean Toggle</option>
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
                          <option value="team">Team / Project Level</option>
                        </select>
                      </div>
                    </div>

                    {cf.field_type === "select" && (
                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Options (comma-separated)</label>
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
                          placeholder="e.g. Dominos, Subway, Campus Mess"
                        />
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
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
                        <span>Required to register</span>
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
                        <span>Sync column to Event Matrix</span>
                      </label>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
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
                    ])
                  }
                  className={styles.secondaryBtn}
                  style={{ alignSelf: "flex-start" }}
                >
                  <MemberIcon name="plus" size={13} /> Add Intake Question
                </button>
              </div>

              {/* Section 7: Sub-Tracks & Focus Areas */}
              <div className={styles.formSectionHeading}>7. Problem Tracks & Sub-Themes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1a1a20", padding: "16px", borderRadius: "8px", border: "1px solid #282832" }}>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#a1a1aa" }}>
                  Divide your event or hackathon into specific tracks (e.g., Open Innovation, FinTech, AI Agents). Attendees pick their track during registration.
                </p>

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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "750", color: "#e5b731" }}>
                        Track #{idx + 1}: {tr.name || "Untitled Track"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEventTracks((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <MemberIcon name="close" size={12} /> Remove Track
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
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
                          placeholder="e.g. Autonomous AI Track"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Track Identifier</label>
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
                          placeholder="e.g. autonomous_ai"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Team Capacity Cap</label>
                        <input
                          type="number"
                          min={1}
                          value={tr.max_teams ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : undefined;
                            setEventTracks((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, max_teams: val } : item))
                            );
                          }}
                          className={styles.formInput}
                          placeholder="Unlimited if blank"
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", color: "#8c8c98" }}>Track Description & Problem Statement</label>
                      <textarea
                        rows={2}
                        value={tr.description || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEventTracks((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, description: val } : item))
                          );
                        }}
                        className={styles.formTextarea}
                        placeholder="Brief overview of challenges, criteria, or deliverables..."
                      />
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setEventTracks((prev) => [
                        ...prev,
                        {
                          track_id: `track_${Date.now().toString(36)}`,
                          name: "New Track",
                          description: "",
                        },
                      ])
                    }
                    className={styles.secondaryBtn}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <MemberIcon name="plus" size={13} /> Add Track
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

              {/* Section 8: Team Settings & Roster Locks */}
              <div className={styles.formSectionHeading}>8. Team Governance & Roster Locking</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1a1a20", padding: "16px", borderRadius: "8px", border: "1px solid #282832" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={teamSettings.allow_team_creation ?? true}
                      onChange={(e) =>
                        setTeamSettings((prev) => ({ ...prev, allow_team_creation: e.target.checked }))
                      }
                    />
                    <span>Allow Team Creation</span>
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={teamSettings.require_join_approval ?? false}
                      onChange={(e) =>
                        setTeamSettings((prev) => ({ ...prev, require_join_approval: e.target.checked }))
                      }
                    />
                    <span>Require Join Approval</span>
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={teamSettings.allow_solo_pool ?? true}
                      onChange={(e) =>
                        setTeamSettings((prev) => ({ ...prev, allow_solo_pool: e.target.checked }))
                      }
                    />
                    <span>Allow Solo Pool</span>
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#d4d4d8", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={teamSettings.auto_convert_to_spg ?? false}
                      onChange={(e) =>
                        setTeamSettings((prev) => ({ ...prev, auto_convert_to_spg: e.target.checked }))
                      }
                    />
                    <span>Auto-Convert Teams to SPGs</span>
                  </label>
                </div>

                <div style={{ marginTop: "6px" }}>
                  <label style={{ fontSize: "12px", color: "#8c8c98", display: "block", marginBottom: "4px" }}>
                    Roster Lock Deadline (Disables roster modifications / joins after this timestamp)
                  </label>
                  <input
                    type="datetime-local"
                    value={toISTInputString(teamSettings.lock_rosters_at)}
                    onChange={(e) => {
                      const val = e.target.value ? fromISTInputString(e.target.value) : null;
                      setTeamSettings((prev) => ({ ...prev, lock_rosters_at: val }));
                    }}
                    className={styles.formInput}
                    style={{ maxWidth: "300px" }}
                  />
                </div>
              </div>

              {/* Section 9: Timeline Milestone Stepper */}
              <div className={styles.formSectionHeading}>9. Event Timeline & Milestone Schedule</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1a1a20", padding: "16px", borderRadius: "8px", border: "1px solid #282832" }}>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#a1a1aa" }}>
                  Publish schedule milestones, kickoff dates, checkpoints, stream links, and deliverable submission deadlines.
                </p>

                {timelineItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "750", color: "#e5b731" }}>
                        Milestone #{idx + 1}: {item.title || "Untitled Milestone"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTimelineItems((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <MemberIcon name="close" size={12} /> Remove Milestone
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
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
                          placeholder="e.g. Hacking Starts / Submissions Due"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Start Time</label>
                        <input
                          type="datetime-local"
                          value={toISTInputString(item.start_time)}
                          onChange={(e) => {
                            const val = e.target.value ? fromISTInputString(e.target.value) : "";
                            setTimelineItems((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, start_time: val } : m))
                            );
                          }}
                          className={styles.formInput}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>End Time (Optional)</label>
                        <input
                          type="datetime-local"
                          value={toISTInputString(item.end_time)}
                          onChange={(e) => {
                            const val = e.target.value ? fromISTInputString(e.target.value) : undefined;
                            setTimelineItems((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, end_time: val } : m))
                            );
                          }}
                          className={styles.formInput}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "11px", color: "#8c8c98" }}>Location / Stream URL</label>
                        <input
                          type="text"
                          value={item.location_or_link || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTimelineItems((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, location_or_link: val } : m))
                            );
                          }}
                          className={styles.formInput}
                          placeholder="e.g. Auditorium A or https://youtube.com/..."
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", color: "#8c8c98" }}>Description / Agenda</label>
                      <input
                        type="text"
                        value={item.description || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTimelineItems((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, description: val } : m))
                          );
                        }}
                        className={styles.formInput}
                        placeholder="Key instructions or activities..."
                      />
                    </div>

                    <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#f87171", fontWeight: "650", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.is_submission_deadline)}
                          onChange={(e) =>
                            setTimelineItems((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, is_submission_deadline: e.target.checked } : m))
                            )
                          }
                        />
                        <span>⚠️ Mark as Project Submission Deadline</span>
                      </label>

                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "12px", color: "#8c8c98" }}>Status Override:</span>
                        <select
                          value={item.status_override || ""}
                          onChange={(e) => {
                            const val = e.target.value ? (e.target.value as "completed" | "live" | "upcoming") : undefined;
                            setTimelineItems((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, status_override: val } : m))
                            );
                          }}
                          className={styles.formSelect}
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          <option value="">Auto (Calculate from time)</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="live">Live / In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setTimelineItems((prev) => [
                      ...prev,
                      {
                        id: `milestone_${Date.now().toString(36)}`,
                        title: "New Milestone",
                        start_time: startDateTime || new Date().toISOString(),
                        is_submission_deadline: false,
                      },
                    ])
                  }
                  className={styles.secondaryBtn}
                  style={{ alignSelf: "flex-start" }}
                >
                  <MemberIcon name="plus" size={13} /> Add Timeline Milestone
                </button>
              </div>

              {/* Section 10: Project Deliverables & Submission Form Setup */}
              <div className={styles.formSectionHeading}>10. Project Deliverables & Submission Form Setup</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1c1c21", border: "1px solid #31343a", borderRadius: "10px", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#e5b731", textTransform: "uppercase" }}>
                  Standard Deliverables Configuration
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                  {/* Repo URL */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff" }}>💻 Code Repository URL</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.enable_repo_url ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, enable_repo_url: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.enable_repo_url ?? true)}
                        checked={submissionConfig.require_repo_url ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_repo_url: e.target.checked }))}
                      />
                      <span>Mandatory to submit</span>
                    </label>
                  </div>

                  {/* Slides URL */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff" }}>📊 Presentation Deck / Pitch Slides</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.enable_slides_url ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, enable_slides_url: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.enable_slides_url ?? true)}
                        checked={submissionConfig.require_slides_url ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_slides_url: e.target.checked }))}
                      />
                      <span>Mandatory to submit</span>
                    </label>
                  </div>

                  {/* Live Demo URL */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff" }}>🎥 Live Product Demo Link</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.enable_demo_url ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, enable_demo_url: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.enable_demo_url ?? true)}
                        checked={submissionConfig.require_demo_url ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_demo_url: e.target.checked }))}
                      />
                      <span>Mandatory to submit</span>
                    </label>
                  </div>

                  {/* Research Paper Link */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff" }}>📄 Technical Writeup / Paper Link</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.enable_paper_link ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, enable_paper_link: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.enable_paper_link ?? true)}
                        checked={submissionConfig.require_paper_link ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_paper_link: e.target.checked }))}
                      />
                      <span>Mandatory to submit</span>
                    </label>
                  </div>

                  {/* Submission Notes */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff" }}>📝 Project Brief / Submission Notes</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.enable_notes ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, enable_notes: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.enable_notes ?? true)}
                        checked={submissionConfig.require_notes ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_notes: e.target.checked }))}
                      />
                      <span>Mandatory to submit</span>
                    </label>
                  </div>

                  {/* Idea Jar Picker */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#e5b731" }}>💡 Idea Jar Problem Statement Picker</span>
                      <input
                        type="checkbox"
                        checked={submissionConfig.allow_problem_statement_selection ?? true}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, allow_problem_statement_selection: e.target.checked }))}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#8c8c98", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        disabled={!(submissionConfig.allow_problem_statement_selection ?? true)}
                        checked={submissionConfig.require_problem_statement ?? false}
                        onChange={(e) => setSubmissionConfig((prev) => ({ ...prev, require_problem_statement: e.target.checked }))}
                      />
                      <span>Mandatory for teams to pick a problem</span>
                    </label>
                  </div>
                </div>

                {/* Custom Deliverables */}
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#e5b731", textTransform: "uppercase" }}>
                    Custom Deliverable Fields (e.g. Figma link, Dataset URL, Model weights)
                  </div>

                  {(submissionConfig.custom_fields || []).map((cf, idx) => (
                    <div key={cf.field_id || idx} style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "12px", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto auto", gap: "10px", alignItems: "center" }}>
                      <div>
                        <label style={{ fontSize: "10px", color: "#8c8c98" }}>Field Label</label>
                        <input
                          type="text"
                          value={cf.label}
                          placeholder="e.g. Figma Design Link"
                          onChange={(e) => {
                            const updated = [...(submissionConfig.custom_fields || [])];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setSubmissionConfig((prev) => ({ ...prev, custom_fields: updated }));
                          }}
                          className={styles.formInput}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "10px", color: "#8c8c98" }}>Field Type</label>
                        <select
                          value={cf.field_type}
                          onChange={(e) => {
                            const updated = [...(submissionConfig.custom_fields || [])];
                            updated[idx] = { ...updated[idx], field_type: e.target.value as "url" | "text" };
                            setSubmissionConfig((prev) => ({ ...prev, custom_fields: updated }));
                          }}
                          className={styles.formSelect}
                        >
                          <option value="url">URL Link</option>
                          <option value="text">Text Input</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "10px", color: "#8c8c98" }}>Placeholder</label>
                        <input
                          type="text"
                          value={cf.placeholder || ""}
                          placeholder="https://..."
                          onChange={(e) => {
                            const updated = [...(submissionConfig.custom_fields || [])];
                            updated[idx] = { ...updated[idx], placeholder: e.target.value };
                            setSubmissionConfig((prev) => ({ ...prev, custom_fields: updated }));
                          }}
                          className={styles.formInput}
                        />
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#d4d4d8", marginTop: "14px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={cf.required}
                          onChange={(e) => {
                            const updated = [...(submissionConfig.custom_fields || [])];
                            updated[idx] = { ...updated[idx], required: e.target.checked };
                            setSubmissionConfig((prev) => ({ ...prev, custom_fields: updated }));
                          }}
                        />
                        <span>Required</span>
                      </label>
                      <button
                        type="button"
                        style={{ marginTop: "14px", background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
                        onClick={() => {
                          const updated = (submissionConfig.custom_fields || []).filter((_, i) => i !== idx);
                          setSubmissionConfig((prev) => ({ ...prev, custom_fields: updated }));
                        }}
                        title="Remove Field"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const newField: SubmissionCustomField = {
                        field_id: `deliverable_${Date.now().toString(36)}`,
                        label: "New Deliverable Link",
                        field_type: "url",
                        placeholder: "https://...",
                        required: false,
                      };
                      setSubmissionConfig((prev) => ({
                        ...prev,
                        custom_fields: [...(prev.custom_fields || []), newField],
                      }));
                    }}
                    className={styles.secondaryBtn}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <MemberIcon name="plus" size={12} /> Add Custom Deliverable Field
                  </button>
                </div>
              </div>

              {/* Submit & Cancel */}
              <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.publishBtn}
                  style={{ flex: 1 }}
                >
                  <MemberIcon name="check" size={16} />
                  {isSubmitting ? "Saving Changes..." : "Save Event Changes"}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedId("")}
                  className={styles.viewActionBtn}
                  style={{ padding: "0 24px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
