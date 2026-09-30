"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, type EventSummaryItem, type EventDocument } from "@/lib/api";
import { getEventGraduationBatches } from "@/lib/eventsData";
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
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");

  const [pointsReward, setPointsReward] = useState<number | "">("");
  const [slidesUrl, setSlidesUrl] = useState("");
  const [discordThread, setDiscordThread] = useState("");

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
      // Show events (exclude dashboard hero banners)
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

    api
      .getEvent(selectedId, token)
      .then((ev: EventDocument) => {
        if (!active) return;
        setTitle(ev.title || "");
        setSlug(ev.slug || "");
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
        setMinTeamSize(ev.participation?.min_team_size || 1);
        setMaxTeamSize(ev.participation?.max_team_size || 1);
        setMaxParticipants(ev.participation?.max_participants ?? "");

        setPointsReward(ev.points_reward?.attendance_points ?? "");
        setSlidesUrl(ev.resources?.slides_url || "");
        setDiscordThread(ev.resources?.discord_thread_id || "");

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
          requires_event_spg: false,
          spg_auto_disband_days: 3,
        },
        points_reward: {
          attendance_points: Number(pointsReward || 0),
          track,
        },
        resources: {
          slides_url: slidesUrl.trim() || undefined,
          discord_thread_id: discordThread.trim() || undefined,
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

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>
            <MemberIcon name="edit" size={18} />
            Edit Existing Club Event
          </h3>
          <div className={styles.cardSubtitle}>
            Select any published, ongoing, or draft event to modify its schedule, agenda, venue, capacity, or banner.
          </div>
        </div>
      </div>

      {/* Event Picker Dropdown */}
      <div className={styles.formGroup} style={{ marginBottom: "20px" }}>
        <label className={styles.formLabel}>
          <span>Select Event to Edit</span>
          {loadingList && <span className={styles.formLabelHint}>Refreshing events list…</span>}
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={styles.formSelect}
          style={{ fontSize: "14.5px", padding: "10px 14px", borderColor: selectedId ? "#e5b731" : undefined }}
        >
          <option value="">-- Choose an event ({events.length} available) --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              [{ev.status?.toUpperCase()}] {ev.title} ({ev.track?.toUpperCase()} · {ev.event_type})
            </option>
          ))}
        </select>
      </div>

      {loadingDetail && (
        <div style={{ textAlign: "center", padding: "40px", color: "#e5b731" }}>
          Loading event details…
        </div>
      )}

      {errorMessage && (
        <div className={styles.alertError} style={{ marginBottom: "16px" }}>
          <MemberIcon name="alert-circle" size={18} />
          {errorMessage}
        </div>
      )}

      {!selectedId && !loadingDetail && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "#8e8e93", background: "#18181b", borderRadius: "10px", border: "1px dashed #2e2e34" }}>
          <MemberIcon name="calendar" size={32} />
          <p style={{ marginTop: "12px", fontSize: "14px" }}>
            Select an event from the dropdown above to load and edit its full configuration.
          </p>
        </div>
      )}

      {selectedId && !loadingDetail && (
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
              <label className={styles.formLabel}>Participation Mode</label>
              <select
                value={participationMode}
                onChange={(e) => setParticipationMode(e.target.value as "solo" | "team")}
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

          {/* Submit */}
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
          </div>
        </form>
      )}
    </div>
  );
}
