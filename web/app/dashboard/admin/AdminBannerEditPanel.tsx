"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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

  return (
    <div className={styles.managerGrid}>
      {/* Left: Edit Form */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>
              <MemberIcon name="edit" size={18} />
              Edit Existing Dashboard Hero Banner
            </h3>
            <div className={styles.cardSubtitle}>
              Select any live or past hero banner to modify its image, announcement text, CTA button, or dates.
            </div>
          </div>
        </div>

        {/* Banner Selector */}
        <div className={styles.formGroup} style={{ marginBottom: "18px" }}>
          <label className={styles.formLabel}>
            <span>Select Banner to Edit</span>
            {loadingList && <span className={styles.formLabelHint}>Loading banners…</span>}
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={styles.formSelect}
            style={{ fontSize: "14px", padding: "10px 14px", borderColor: selectedId ? "#e5b731" : undefined }}
          >
            <option value="">-- Choose a dashboard banner ({banners.length} available) --</option>
            {banners.map((b) => (
              <option key={b.id} value={b.id}>
                [{b.status?.toUpperCase()}] {b.title}
              </option>
            ))}
          </select>
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

        {!selectedId && !loadingDetail && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#8e8e93", background: "#18181b", borderRadius: "10px", border: "1px dashed #2e2e34" }}>
            <MemberIcon name="image" size={32} />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>
              Select a banner from the dropdown above to load and edit its configuration.
            </p>
          </div>
        )}

        {selectedId && !loadingDetail && (
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

            <button type="submit" disabled={isSubmitting} className={styles.publishBtn}>
              <MemberIcon name="check" size={16} />
              {isSubmitting ? "Updating Banner…" : "Update Dashboard Hero Banner"}
            </button>
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
