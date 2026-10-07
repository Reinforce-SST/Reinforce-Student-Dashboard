"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type EventDocument } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import EventDetailClient from "./EventDetailClient";
import styles from "./EventDetail.module.css";

export default function EventDetailLoader({ eventId }: { eventId: string }) {
  const { token } = useMember();
  const [event, setEvent] = useState<EventDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .getEvent(eventId, token)
      .then((result) => {
        if (active) {
          setEvent(result);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Event details could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, eventId, retry]);

  if (loading) {
    return (
      <main className={styles.pageContainer} aria-busy="true" aria-label="Loading event">
        {/* Top Back Row Skeleton */}
        <div className={styles.backRow}>
          <div className={`${styles.skeletonBackBtn} ${styles.shimmer}`} />
          <div className={styles.statusChipsRow}>
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
            <div className={`${styles.skeletonChip} ${styles.shimmer}`} />
          </div>
        </div>

        {/* Hero Banner Card Skeleton */}
        <section className={styles.heroBanner}>
          <div className={styles.heroGlow} />
          <div className={styles.heroLayoutGrid}>
            {/* Left Image Placeholder */}
            <div className={`${styles.skeletonHeroCover} ${styles.shimmer}`} />

            {/* Right Side Panel */}
            <div className={styles.heroSidePanel}>
              <div className={`${styles.skeletonHeroTitle} ${styles.shimmer}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "4px 0" }}>
                <div className={`${styles.skeletonHeroSubtitle} ${styles.shimmer}`} />
                <div className={`${styles.skeletonHeroSubtitleShort} ${styles.shimmer}`} />
              </div>
              <div className={styles.heroActionRow} style={{ marginTop: "12px" }}>
                <div className={`${styles.skeletonHeroBtn} ${styles.shimmer}`} />
                <div className={`${styles.skeletonHeroPill} ${styles.shimmer}`} />
              </div>
            </div>
          </div>
        </section>

        {/* Tab Bar Skeleton */}
        <div className={styles.eventTabsBar}>
          <div className={`${styles.skeletonTabBtn} ${styles.shimmer}`} />
          <div className={`${styles.skeletonTabBtn} ${styles.shimmer}`} />
        </div>

        {/* Main Grid Skeleton */}
        <div className={styles.mainGrid}>
          {/* Left Column Skeleton */}
          <div className={styles.contentColumn}>
            {/* Agenda Card Skeleton */}
            <div className={styles.sectionCard}>
              <div className={`${styles.skeletonSectionTitle} ${styles.shimmer}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} />
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} />
                <div className={`${styles.skeletonLineMedium} ${styles.shimmer}`} />
                <div className={`${styles.skeletonLineShort} ${styles.shimmer}`} />
              </div>
            </div>

            {/* Participation Card Skeleton */}
            <div className={styles.sectionCard}>
              <div className={`${styles.skeletonSectionTitle} ${styles.shimmer}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} />
                <div className={`${styles.skeletonLineMedium} ${styles.shimmer}`} />
              </div>
            </div>
          </div>

          {/* Right Sidebar Skeleton */}
          <aside className={styles.sidebarColumn}>
            {/* Points Reward Card Skeleton */}
            <div className={`${styles.skeletonRewardCard} ${styles.shimmer}`} />

            {/* Quick Specs Card Skeleton */}
            <div className={styles.sectionCard}>
              <div className={`${styles.skeletonSectionTitle} ${styles.shimmer}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={styles.skeletonSpecRow}>
                    <div className={`${styles.skeletonSpecIcon} ${styles.shimmer}`} />
                    <div className={styles.skeletonSpecTextGroup}>
                      <div className={`${styles.skeletonLineShort} ${styles.shimmer}`} />
                      <div className={`${styles.skeletonLineMedium} ${styles.shimmer}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.backRow}>
          <Link href="/dashboard/events" className={styles.backBtn}>
            ← Back to Events Planner
          </Link>
        </div>
        <div className={styles.errorCard} role="alert">
          <div className={styles.errorIcon}>
            <MemberIcon name="alert-circle" size={36} />
          </div>
          <h2 className={styles.errorTitle}>{error || "Event not found."}</h2>
          <p className={styles.errorDescription}>
            The requested event may have been removed, postponed, or you may not have network access right now.
          </p>
          <div className={styles.errorActionRow}>
            <button
              type="button"
              className={styles.errorRetryBtn}
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              Try Again
            </button>
            <Link href="/dashboard/events" className={styles.errorBackLink}>
              View All Events
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <EventDetailClient event={event} />;
}

