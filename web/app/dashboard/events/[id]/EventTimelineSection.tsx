"use client";

import React, { useState, useEffect } from "react";
import type { TimelineItemSchema } from "@/types/event-matrix";
import { parseDateOrIST } from "@/lib/eventsData";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./EventDetail.module.css";

function formatMilestoneTime(startStr: string, endStr?: string | null): string {
  try {
    const start = parseDateOrIST(startStr);
    if (!start) return startStr;
    const startPart = start.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    if (!endStr) return startPart;
    const end = parseDateOrIST(endStr);
    if (!end) return startPart;
    const endPart = end.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${startPart} – ${endPart}`;
  } catch {
    return startStr;
  }
}

export default function EventTimelineSection({
  timeline,
}: {
  timeline: TimelineItemSchema[];
}) {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!timeline || timeline.length === 0) {
    return (
      <div className={styles.emptyTimelineNotice}>
        <MemberIcon name="clock" size={24} />
        <p>No timeline milestones have been scheduled for this event yet.</p>
      </div>
    );
  }

  // Sort chronologically by start_time
  const sorted = [...timeline].sort((a, b) => {
    const tA = parseDateOrIST(a.start_time)?.getTime() ?? 0;
    const tB = parseDateOrIST(b.start_time)?.getTime() ?? 0;
    return tA - tB;
  });

  return (
    <div className={styles.timelineStepperContainer}>
      {sorted.map((item, index) => {
        const startMs = parseDateOrIST(item.start_time)?.getTime() ?? 0;
        const endMs = item.end_time ? (parseDateOrIST(item.end_time)?.getTime() ?? startMs + 3600000) : startMs + 3600000;

        let status: "completed" | "in_progress" | "upcoming" = "upcoming";
        if (item.status_override) {
          status = item.status_override === "live" ? "in_progress" : item.status_override;
        } else if (now > endMs) {
          status = "completed";
        } else if (now >= startMs && now <= endMs) {
          status = "in_progress";
        }

        const isDeadline = Boolean(item.is_submission_deadline);

        return (
          <div
            key={item.id || index}
            className={`${styles.timelineStepRow} ${
              status === "in_progress"
                ? styles.timelineStepActive
                : status === "completed"
                ? styles.timelineStepCompleted
                : styles.timelineStepUpcoming
            }`}
          >
            {/* Left timeline connector column */}
            <div className={styles.timelineNodeCol}>
              <div
                className={`${styles.timelineNodeCircle} ${
                  status === "in_progress"
                    ? styles.nodeCircleActive
                    : status === "completed"
                    ? styles.nodeCircleCompleted
                    : styles.nodeCircleUpcoming
                }`}
              >
                {status === "completed" ? (
                  <MemberIcon name="check" size={12} />
                ) : status === "in_progress" ? (
                  <span className={styles.pulseDot} />
                ) : (
                  <span className={styles.stepNum}>{index + 1}</span>
                )}
              </div>
              {index < sorted.length - 1 && (
                <div
                  className={`${styles.timelineConnectorLine} ${
                    status === "completed" ? styles.connectorCompleted : ""
                  }`}
                />
              )}
            </div>

            {/* Right milestone content card */}
            <div className={styles.timelineCardContent}>
              <div className={styles.timelineCardHeader}>
                <span className={styles.milestoneTimeBadge}>
                  <MemberIcon name="clock" size={13} />
                  {formatMilestoneTime(item.start_time, item.end_time)}
                </span>

                <div className={styles.milestoneStatusRow}>
                  {isDeadline && (
                    <span className={styles.deadlineBadge}>
                      ⚠️ Submission Deadline
                    </span>
                  )}
                  <span
                    className={`${styles.milestoneStatePill} ${
                      status === "in_progress"
                        ? styles.statePillActive
                        : status === "completed"
                        ? styles.statePillCompleted
                        : styles.statePillUpcoming
                    }`}
                  >
                    {status === "in_progress"
                      ? "⚡ IN PROGRESS"
                      : status === "completed"
                      ? "COMPLETED"
                      : "UPCOMING"}
                  </span>
                </div>
              </div>

              <h3 className={styles.milestoneTitle}>{item.title}</h3>

              {item.description && (
                <p className={styles.milestoneDesc}>{item.description}</p>
              )}

              {item.location_or_link && (
                <div className={styles.milestoneLinkArea}>
                  {item.location_or_link.startsWith("http") ? (
                    <a
                      href={item.location_or_link}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.milestoneActionLink}
                    >
                      <MemberIcon name="external" size={13} />
                      Join Session / Stream ↗
                    </a>
                  ) : (
                    <span className={styles.milestoneVenueText}>
                      <MemberIcon name="location" size={13} />
                      {item.location_or_link}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
