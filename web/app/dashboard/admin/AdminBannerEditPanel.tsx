"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api, type EventSummaryItem, type EventDocument } from "@/lib/api";
import { getBannerPresentation, isBannerDestination } from "@/lib/dashboardData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./Admin.module.css";

function formatBannerDate(startStr: string): string {
  const start = new Date(startStr);
  return startStr && Number.isFinite(start.getTime())
    ? start.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date not set";
}

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

export default function AdminBannerEditPanel({
  token,
  onSaved,
}: {
  token: string;
  onSaved: (msg: string) => void;
}) {
  const [banners, setBanners] = useState<EventSummaryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Search & Filter for List Area
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [badgeText, setBadgeText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [status, setStatus] = useState("published");

  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFilePreview, setBannerFilePreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bannerDateDisplay = formatBannerDate(startDateTime);
  const bannerPresentation = getBannerPresentation({
    id: selectedId,
    slug: "",
    event_type: "Featured Banner",
    banner_badge_text: badgeText,
    banner_cta_text: ctaText,
    banner_cta_url: ctaUrl,
  });

  // Load banners
  const loadBanners = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const res = await api.listEvents(token, { limit: 100 });
      const bannerList = (res.events || []).filter((ev) =>
        ev.event_type?.toLowerCase().includes("banner")
      );
      setBanners(bannerList);
    } catch (e) {
      console.error("Failed to load banners list", e);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Load banner detail
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
        setDescription(ev.description || "");
        setStartDateTime(formatDateTimeInput(ev.schedule?.start_time));
        setEndDateTime(formatDateTimeInput(ev.schedule?.end_time));
        setBadgeText(ev.banner_badge_text || "");
        setCtaText(ev.banner_cta_text || "");
        setCtaUrl(ev.banner_cta_url || "");
        setStatus(ev.status || "published");
        setBannerUrl(ev.banner_url || "");
        setBannerFile(null);
        setBannerFilePreview(null);
      })
      .catch((err) => {
        if (active) setErrorMessage(err instanceof Error ? err.message : "Failed to load banner.");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId, token]);

  const filteredBanners = useMemo(() => {
    return banners.filter((b) => {
      if (filterStatus !== "all" && b.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (b.title || "").toLowerCase().includes(q);
        const matchBadge = (b.banner_badge_text || "").toLowerCase().includes(q);
        return matchTitle || matchBadge;
      }
      return true;
    });
  }, [banners, filterStatus, searchQuery]);

  const getStatusBadgeStyle = (st?: string) => {
    switch (st?.toLowerCase()) {
      case "published":
        return { background: "rgba(34, 197, 94, 0.12)", color: "#22c55e", border: "1px solid rgba(34, 197, 94, 0.3)" };
      case "draft":
        return { background: "rgba(234, 179, 8, 0.12)", color: "#eab308", border: "1px solid rgba(234, 179, 8, 0.3)" };
      case "archived":
        return { background: "rgba(142, 142, 147, 0.12)", color: "#8e8e93", border: "1px solid rgba(142, 142, 147, 0.3)" };
      default:
        return { background: "rgba(142, 142, 147, 0.12)", color: "#8e8e93", border: "1px solid rgba(142, 142, 147, 0.3)" };
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      setErrorMessage("Select a dashboard banner to edit.");
      return;
    }
    if (!title.trim() || !description.trim()) {
      setErrorMessage("Banner title and description are required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const startDateObj = new Date(startDateTime);
      const endDateObj = endDateTime ? new Date(endDateTime) : null;

      if (Number.isNaN(startDateObj.getTime()) || (endDateObj && Number.isNaN(endDateObj.getTime()))) {
        throw new Error("Enter valid banner dates.");
      }
      if (endDateObj && endDateObj <= startDateObj) {
        throw new Error("Banner end time must be after its start time.");
      }

      const dest = ctaUrl.trim();
      if (dest && !isBannerDestination(dest)) {
        throw new Error("Use a site path starting with / or a full HTTPS URL for button destination.");
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
        description: description.trim(),
        event_type: "Featured Banner",
        track: "all",
        format: "offline",
        schedule: {
          start_time: startDateObj.toISOString(),
          end_time: endDateObj ? endDateObj.toISOString() : undefined,
          duration_minutes: durationMinutes,
        },
        banner_url: imageUrl || undefined,
        banner_badge_text: badgeText.trim() || undefined,
        banner_cta_text: ctaText.trim() || undefined,
        banner_cta_url: dest || undefined,
        status,
      };

      const updated = await api.adminUpdateEvent(token, selectedId, payload);
      onSaved(`Dashboard hero banner "${updated.title}" updated successfully!`);
      loadBanners();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update banner.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // VIEW 1: LIST BANNER AREA (When no banner is selected for editing)
  if (!selectedId) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>
              <MemberIcon name="image" size={18} />
              Existing Dashboard Hero Banners Directory
            </h3>
            <div className={styles.cardSubtitle}>
              Browse, inspect, and select any live or past hero banner to modify its image, announcement text, CTA button, or dates.
            </div>
          </div>
          <button
            type="button"
            onClick={loadBanners}
            disabled={loadingList}
            className={styles.viewActionBtn}
            title="Refresh banners list"
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

        {/* Toolbar: Search & Filter Pills */}
        <div className={styles.eventListToolbar}>
          <input
            type="search"
            placeholder="Search banners by title or badge…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.eventSearchInput}
          />

          <div className={styles.statusFilterPills}>
            {["all", "published", "draft", "archived"].map((st) => (
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
            Loading existing dashboard hero banners…
          </div>
        ) : filteredBanners.length === 0 ? (
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
            <MemberIcon name="image" size={32} />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>
              {searchQuery || filterStatus !== "all"
                ? "No banners found matching your search and filter criteria."
                : "No dashboard hero banners created yet."}
            </p>
          </div>
        ) : (
          <div className={styles.eventListGrid}>
            {filteredBanners.map((b) => (
              <article key={b.id} className={styles.eventItemCard}>
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
                        ...getStatusBadgeStyle(b.status),
                      }}
                    >
                      {b.status || "PUBLISHED"}
                    </span>

                    <h4 className={styles.eventItemTitle}>{b.title}</h4>

                    {b.banner_badge_text && (
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
                        {b.banner_badge_text}
                      </span>
                    )}
                  </div>

                  <div className={styles.eventItemMeta}>
                    <span className={styles.eventItemMetaSpan}>
                      <MemberIcon name="clock" size={13} />
                      {formatBannerDate(b.schedule?.start_time || "")}
                    </span>

                    {b.banner_cta_text && (
                      <span className={styles.eventItemMetaSpan}>
                        CTA: <strong>{b.banner_cta_text}</strong> {b.banner_cta_url ? `(${b.banner_cta_url})` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.eventItemActions}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={styles.editActionBtn}
                    title="Edit banner content, CTA, and image"
                  >
                    <MemberIcon name="edit" size={13} />
                    Edit Banner
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // VIEW 2: FULL EDIT FORM & LIVE PREVIEW (When a banner is selected)
  return (
    <div className={styles.managerGrid}>
      {/* Left: Edit Form */}
      <div className={styles.card}>
        {/* Header Banner: Back to List */}
        <div className={styles.editingBannerBox}>
          <div className={styles.editingBannerText}>
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className={styles.backToListBtn}
            >
              ← Back to All Banners
            </button>
            <span>
              <strong>Currently Editing:</strong> {title || "Selected Banner"}
            </span>
          </div>
        </div>

        {loadingDetail && (
          <div style={{ textAlign: "center", padding: "40px", color: "#e5b731" }}>
            Loading banner details…
          </div>
        )}

        {errorMessage && (
          <div className={styles.alertError} style={{ marginBottom: "16px" }}>
            <MemberIcon name="alert-circle" size={18} />
            {errorMessage}
          </div>
        )}

        {!loadingDetail && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Banner Cover Image */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Hero Banner Image</span>
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
                    <MemberIcon name="trash" size={13} /> Remove
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
                  <span className={styles.uploadTextPrimary}>Click to upload new hero banner</span>
                  <span className={styles.uploadTextSecondary}>Aspect ratio 16:9 or 22:9 (1200×630px)</span>
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

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Banner Asset Path / URL</label>
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
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Announcement Headline</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Badge Text (optional)</label>
                <input
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="ANNOUNCEMENT"
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={styles.formTextarea}
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Button Text (optional)</label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="Explore Event →"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Lifecycle Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="published">Published (Active)</option>
                  <option value="draft">Draft (Hidden)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Button Destination URL (optional)</label>
              <input
                type="text"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="/dashboard/events or https://..."
                className={styles.formInput}
              />
              <span className={styles.formLabelHint}>Leave blank to open default event page.</span>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <button type="submit" disabled={isSubmitting} className={styles.publishBtn} style={{ flex: 1 }}>
                <MemberIcon name="check" size={16} />
                {isSubmitting ? "Updating Banner…" : "Update Dashboard Hero Banner"}
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
                Real-time preview of how this banner appears on the student dashboard hero slider.
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
                <h4 className={styles.livePreviewTitle}>{title || "Untitled Announcement"}</h4>
                <p className={styles.livePreviewDesc}>{description || "Description preview..."}</p>
              </div>
              <span className={styles.livePreviewCta}>{bannerPresentation.ctaText}</span>
            </div>

            <div className={styles.livePreviewImageSide}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerFilePreview || bannerUrl || "/banners/reinforce-placeholder.png"}
                alt="Banner Live Preview"
                className={styles.livePreviewImg}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
