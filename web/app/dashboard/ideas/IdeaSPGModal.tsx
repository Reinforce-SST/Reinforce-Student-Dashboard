"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, type IdeaDetail } from "@/lib/api";
import { type SPGRecord } from "@/lib/spgData";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./IdeaSPGModal.module.css";

interface IdeaSPGModalProps {
  idea: IdeaDetail;
  isOpen: boolean;
  onClose: () => void;
}

export default function IdeaSPGModal({ idea, isOpen, onClose }: IdeaSPGModalProps) {
  const { token, profile } = useMember();

  const [mySpgs, setMySpgs] = useState<SPGRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingSpgId, setProcessingSpgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ spgId: string; text: string } | null>(null);

  const loadMySpgs = useCallback(async () => {
    if (!token || !profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch SPGs where current user is a member/lead (or all if admin)
      const res = await api.listSpgs(token, { limit: 100 });
      const visible = (res.items || []).filter((spg: any) =>
        Boolean(
          profile.is_admin ||
          spg.lead_id === profile.id ||
          spg.member_ids?.includes(profile.id)
        )
      );
      setMySpgs(visible as unknown as SPGRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your project groups.");
    } finally {
      setLoading(false);
    }
  }, [token, profile]);

  useEffect(() => {
    if (isOpen) {
      void loadMySpgs();
      setStatusMessage(null);
      setError(null);
    }
  }, [isOpen, loadMySpgs]);

  if (!isOpen) return null;

  const handleAttach = async (spgId: string) => {
    if (!token) return;
    setProcessingSpgId(spgId);
    setError(null);
    setStatusMessage(null);
    try {
      await api.attachSpgIdea(token, spgId, idea.id);
      setMySpgs((prev) =>
        prev.map((s) => (s.id === spgId ? { ...s, idea_id: idea.id } : s))
      );
      setStatusMessage({ spgId, text: "✓ Idea attached to team and synced with Event Matrix!" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach idea.");
    } finally {
      setProcessingSpgId(null);
    }
  };

  const handleDetach = async (spgId: string) => {
    if (!token) return;
    setProcessingSpgId(spgId);
    setError(null);
    setStatusMessage(null);
    try {
      await api.attachSpgIdea(token, spgId, null);
      setMySpgs((prev) =>
        prev.map((s) => (s.id === spgId ? { ...s, idea_id: undefined } : s))
      );
      setStatusMessage({ spgId, text: "Problem statement detached from team." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach idea.");
    } finally {
      setProcessingSpgId(null);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px" }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <span className={styles.headerPill}>
              <MemberIcon name="ideas" size={13} />
              Attach to Project Group (SPG)
            </span>
            <h2 className={styles.modalTitle}>Attach this Idea to Your Team</h2>
            <p className={styles.modalSubtitle}>
              Connect <strong>{idea.title}</strong> directly to one of your active project clusters or hackathon teams.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className={styles.modalForm} style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Target Idea Info Card */}
          <div className={styles.attachedIdeaCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: "750", color: "#e5b731", textTransform: "uppercase" }}>
                Target Idea Jar Proposal
              </span>
              <span className={styles.ideaTrackBadge}>
                {idea.track || "GENERAL"}
              </span>
            </div>
            <div style={{ fontWeight: "800", fontSize: "0.95rem", color: "#ffffff", marginTop: "2px" }}>
              {idea.title}
            </div>
            {idea.description && (
              <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "#a1a1aa", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {idea.description}
              </p>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", color: "#f87171", fontSize: "0.82rem" }}>
              {error}
            </div>
          )}

          {/* SPGs List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: "750", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Your Project Groups & Teams ({mySpgs.length})
            </div>

            {loading ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#71717a", fontSize: "0.85rem" }}>
                Loading your project groups…
              </div>
            ) : mySpgs.length === 0 ? (
              <div style={{ background: "#1c1c22", border: "1px dashed #31343a", borderRadius: "10px", padding: "24px", textAlign: "center" }}>
                <MemberIcon name="users" size={24} />
                <p style={{ color: "#d4d4d8", fontSize: "0.88rem", fontWeight: "700", margin: "8px 0 4px 0" }}>
                  No Active Project Groups Found
                </p>
                <p style={{ color: "#8c8c98", fontSize: "0.78rem", margin: 0, lineHeight: 1.5 }}>
                  You are not currently enrolled in any active project groups. You can charter a new group through tickets or join an existing hackathon team.
                </p>
                <Link
                  href={`/dashboard/tickets?category=spg_registration&idea=${encodeURIComponent(idea.id)}`}
                  className={styles.submitBtn}
                  style={{ display: "inline-flex", textDecoration: "none", marginTop: "14px", fontSize: "0.8rem", padding: "6px 14px", width: "fit-content" }}
                >
                  Propose New SPG for this Idea →
                </Link>
              </div>
            ) : (
              mySpgs.map((spg) => {
                const isThisIdeaAttached = spg.idea_id === idea.id;
                const isDifferentIdeaAttached = Boolean(spg.idea_id && spg.idea_id !== idea.id);
                const isBusy = processingSpgId === spg.id;
                const isLead = spg.lead_id === profile?.id;
                const feedback = statusMessage?.spgId === spg.id ? statusMessage.text : null;

                return (
                  <div
                    key={spg.id}
                    style={{
                      background: isThisIdeaAttached ? "rgba(229, 183, 49, 0.05)" : "#18181d",
                      border: `1px solid ${isThisIdeaAttached ? "#e5b731" : "#2b2e35"}`,
                      borderRadius: "10px",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: "800", fontSize: "0.95rem", color: "#ffffff" }}>
                            {spg.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: "800",
                              background: isLead ? "rgba(229, 183, 49, 0.2)" : "rgba(255, 255, 255, 0.08)",
                              color: isLead ? "#e5b731" : "#d4d4d8",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {isLead ? "LEAD" : "MEMBER"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: "750",
                              background: "#232328",
                              color: "#8c8c98",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              textTransform: "uppercase",
                            }}
                          >
                            {spg.track || "GENERAL"}
                          </span>
                        </div>

                        {spg.description && (
                          <p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "#8c8c98", lineHeight: 1.4 }}>
                            {spg.description}
                          </p>
                        )}
                      </div>

                      {/* State Badge */}
                      {isThisIdeaAttached ? (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: "800",
                            background: "rgba(52, 211, 153, 0.15)",
                            color: "#34d399",
                            border: "1px solid rgba(52, 211, 153, 0.3)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          ✓ CURRENTLY ATTACHED
                        </span>
                      ) : isDifferentIdeaAttached ? (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: "750",
                            background: "rgba(251, 191, 36, 0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(251, 191, 36, 0.3)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          HAS ANOTHER PROBLEM
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: "#71717a",
                          }}
                        >
                          No problem attached
                        </span>
                      )}
                    </div>

                    {feedback && (
                      <div style={{ fontSize: "0.78rem", color: "#34d399", fontWeight: "700" }}>
                        {feedback}
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                      {isThisIdeaAttached ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDetach(spg.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(239, 68, 68, 0.5)",
                            color: "#f87171",
                            fontSize: "0.78rem",
                            fontWeight: "750",
                            padding: "5px 12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isBusy ? "Detaching…" : "Detach Idea"}
                        </button>
                      ) : isDifferentIdeaAttached ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDetach(spg.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid #3f424c",
                              color: "#d4d4d8",
                              fontSize: "0.78rem",
                              fontWeight: "700",
                              padding: "5px 10px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            Delete Attached
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleAttach(spg.id)}
                            style={{
                              background: "#e5b731",
                              border: "1px solid #e5b731",
                              color: "#000000",
                              fontSize: "0.78rem",
                              fontWeight: "800",
                              padding: "5px 12px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            {isBusy ? "Reattaching…" : "Replace & Attach This Idea"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAttach(spg.id)}
                          style={{
                            background: "#e5b731",
                            border: "1px solid #e5b731",
                            color: "#000000",
                            fontSize: "0.78rem",
                            fontWeight: "800",
                            padding: "5px 14px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <MemberIcon name="plus" size={13} />
                          {isBusy ? "Attaching…" : "Attach to this SPG"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
}
