"use client";

import React, { useState, useRef, useEffect } from "react";
import { type AttendeeProfile } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventDetail.module.css";

export default function StudentHoverCard({
  profile,
  fallbackId,
  children,
}: {
  profile?: AttendeeProfile | null;
  fallbackId: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // Open after hovering for 1 second (1000ms)
    timerRef.current = setTimeout(() => {
      setShow(true);
    }, 1000);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const name = profile?.full_name || fallbackId;
  const initial = (name[0] || "?").toUpperCase();

  return (
    <div
      className={styles.hoverTargetWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {show && (
        <div className={styles.hoverCardPopover} role="tooltip">
          <div className={styles.hoverCardTopRow}>
            <div className={styles.hoverAvatar}>
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={name}
                  className={styles.hoverAvatarImg}
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            <div className={styles.hoverIdentity}>
              <div className={styles.hoverFullName}>{name}</div>
              {profile?.email && <div className={styles.hoverEmail}>{profile.email}</div>}
            </div>
          </div>

          <div className={styles.hoverPillsRow}>
            {profile?.batch_year && (
              <span className={styles.hoverBatchPill}>Batch {profile.batch_year}</span>
            )}
            <span className={styles.hoverTierPill}>
              {profile?.role_label || (profile?.tier ? profile.tier.toUpperCase() : "MEMBER")}
            </span>
            {profile?.points !== undefined && (
              <span className={styles.hoverPointsPill}>
                ⭐ {profile.points} PTS
              </span>
            )}
          </div>

          {profile?.bio && (
            <p className={styles.hoverBio}>{profile.bio}</p>
          )}

          <div className={styles.hoverUidRow}>
            <MemberIcon name="shield" size={11} />
            <span className={styles.hoverUidText}>UID: {fallbackId}</span>
          </div>
        </div>
      )}
    </div>
  );
}
