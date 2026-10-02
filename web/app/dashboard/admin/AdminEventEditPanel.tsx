"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { api, type EventSummaryItem, type EventDocument, type LearningResource, type ResourceType } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
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
import styles from "./Admin.module.css";

function formatDateTimeInput(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  } catch {
    return "";
  }
}

function formatEventDisplayDate(startStr?: string | null): string {
  if (!startStr) return "Date TBD";
  try {
    const d = new Date(startStr);
    if (isNaN(d.getTime())) return startStr;
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return startStr;
  }
}

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

        setStartDateTime(formatDateTimeInput(ev.schedule?.start_time));
        setEndDateTime(formatDateTimeInput(ev.schedule?.end_time));
        setRegDeadline(formatDateTimeInput(ev.schedule?.registration_deadline));

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
        setBannerFile(null);
        setBannerFilePreview(null);
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
      const startDateObj = new Date(startDateTime);
      const endDateObj = endDateTime ? new Date(endDateTime) : null;
      const deadlineDateObj = regDeadline ? new Date(regDeadline) : null;

      if (Number.isNaN(startDateObj.getTime()) || (endDateObj && Number.isNaN(endDateObj.getTime()))) {
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
        status,
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
          {loadingList ? "Refreshing…" : "Refresh List"}
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
              placeholder="Search events by title, slug, track, or type…"
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
              Loading existing club events…
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
                        {ev.venue_info?.venue_name ? ` · ${ev.venue_info.venue_name}` : ""}
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
                ← Back to All Events
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
              Loading event details…
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
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
                    value={startDateTime}
                    onChange={(e) => setStartDateTime(e.target.value)}
                    className={styles.formInput}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={endDateTime}
                    onChange={(e) => setEndDateTime(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Registration Deadline</label>
                  <input
                    type="datetime-local"
                    value={regDeadline}
                    onChange={(e) => setRegDeadline(e.target.value)}
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
                    <label className={styles.formLabel}>Min Team Size</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={minTeamSize}
                      onChange={(e) => setMinTeamSize(Number(e.target.value))}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Max Team Size</label>
                    <input
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
                  <p className={styles.cardSubtitle}>Loading shared links…</p>
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
                          <small>{resourceFolderLabel(resourceCategoryId(resource))} · {resource.url}</small>
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
                        placeholder="https://…"
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
                        Use / between nested folders. This event’s folder is preselected.
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
                      {isAddingResource ? "Adding link…" : "Add to shared pool"}
                    </button>
                  </div>
                </div>
              </fieldset>

              {/* Banner Image */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Event Cover Banner Image</span>
                  <span className={styles.formLabelHint}>PNG, JPG, WebP up to 5MB</span>
                </label>

                {bannerFilePreview || bannerUrl ? (
                  <div className={styles.imagePreviewBox}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    <span className={styles.uploadTextPrimary}>Click to upload new event cover banner</span>
                    <span className={styles.uploadTextSecondary}>16:9 or 22:9 recommended (1200×630px)</span>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.fileInputHidden}
                />

                <input
                  type="text"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="Or enter image URL directly: https://..."
                  className={styles.formInput}
                  style={{ marginTop: "8px" }}
                />
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
                  {isSubmitting ? "Saving Changes…" : "Save Event Changes"}
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
