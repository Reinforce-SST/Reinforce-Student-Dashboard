"use client";

import React, { useState, useEffect } from "react";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
import { api, type InvitationItem } from "@/lib/api";
import styles from "./EventDetail.module.css";

interface InviteTeammatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  type: "event_team" | "spg" | "event_spg";
  targetId: string;
  targetName: string;
  teamName?: string | null;
  eventId?: string | null;
  spgId?: string | null;
  currentMemberUids: string[];
  maxTeamSize: number;
  onInviteSent?: () => void;
}

export default function InviteTeammatesModal({
  isOpen,
  onClose,
  token,
  type,
  targetId,
  targetName,
  teamName,
  eventId,
  spgId,
  currentMemberUids,
  maxTeamSize,
  onInviteSent,
}: InviteTeammatesModalProps) {
  const [selectedMembers, setSelectedMembers] = useState<PickedMember[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<InvitationItem[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadOutgoing = async () => {
    if (!targetId || !token) return;
    setLoadingInvites(true);
    try {
      const invs = await api.listTargetInvitations(token, targetId, "pending");
      setOutgoingInvites(invs);
    } catch {
      // Ignored
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedMembers([]);
      setActionError("");
      setSuccessMsg("");
      void loadOutgoing();
    }
  }, [isOpen, targetId, token]);

  if (!isOpen) return null;

  const pendingUids = outgoingInvites.map((i) => i.invitee_uid);
  const excludeIds = Array.from(new Set([...currentMemberUids, ...pendingUids]));
  const remainingSlots = Math.max(0, maxTeamSize - currentMemberUids.length - outgoingInvites.length);

  const handleSendInvites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMembers.length === 0) return;
    setActionError("");
    setSuccessMsg("");
    setSending(true);

    try {
      for (const m of selectedMembers) {
        await api.createInvitation(token, {
          type,
          target_id: targetId,
          invitee_uid: m.id,
          team_name: teamName || null,
          event_id: eventId || null,
          spg_id: spgId || null,
        });
      }
      setSuccessMsg(`Sent invitation${selectedMembers.length > 1 ? "s" : ""} successfully!`);
      setSelectedMembers([]);
      await loadOutgoing();
      if (onInviteSent) onInviteSent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setSending(false);
    }
  };

  const handleCancelInvite = async (invId: string) => {
    try {
      await api.cancelInvitation(token, invId);
      await loadOutgoing();
      if (onInviteSent) onInviteSent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel invitation.");
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalBox}
        style={{ maxWidth: "560px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(229, 183, 49, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e5b731",
              }}
            >
              <MemberIcon name="plus" size={18} />
            </div>
            <div>
              <h2 className={styles.modalTitle} style={{ color: "#ffffff", fontSize: "16px", margin: 0 }}>
                {type === "spg" ? "Invite Members to SPG" : `Invite Teammates (${teamName || "Team"})`}
              </h2>
              <span style={{ fontSize: "12px", color: "#8c8c98" }}>{targetName}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.modalCloseBtn}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSendInvites} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {actionError && (
            <div style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #f87171", borderRadius: "6px", padding: "10px", color: "#f87171", fontSize: "12.5px" }}>
              {actionError}
            </div>
          )}
          {successMsg && (
            <div style={{ background: "rgba(52, 211, 153, 0.1)", border: "1px solid #34d399", borderRadius: "6px", padding: "10px", color: "#34d399", fontSize: "12.5px" }}>
              {successMsg}
            </div>
          )}

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "12.5px", fontWeight: "600", color: "#d4d4d8" }}>
                Search &amp; Pick Students to Invite
              </label>
              <span style={{ fontSize: "11px", color: "#8c8c98" }}>
                {remainingSlots} open team slot{remainingSlots === 1 ? "" : "s"}
              </span>
            </div>

            {remainingSlots > 0 ? (
              <MemberPicker
                token={token}
                label="Search by student name or batch"
                selected={selectedMembers}
                onChange={setSelectedMembers}
                excludeIds={excludeIds}
                max={remainingSlots}
              />
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "#f87171" }}>
                Your team is currently at maximum capacity. Cancel pending invites or unregister members to invite more.
              </p>
            )}
          </div>

          {selectedMembers.length > 0 && (
            <button
              type="submit"
              disabled={sending}
              style={{
                background: "#e5b731",
                color: "#121214",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: "750",
                cursor: sending ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "4px",
              }}
            >
              {sending ? "Sending Invites..." : `Send Invitation (${selectedMembers.length})`}
            </button>
          )}

          {/* Outgoing Pending Invites */}
          <div style={{ borderTop: "1px solid #27272a", paddingTop: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Pending Outgoing Invites ({outgoingInvites.length})
            </span>

            {loadingInvites ? (
              <p style={{ fontSize: "12px", color: "#71717a", marginTop: "8px" }}>Loading pending invites...</p>
            ) : outgoingInvites.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#71717a", marginTop: "8px" }}>No pending invitations sent yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                {outgoingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#18181c",
                      border: "1px solid #2e2e36",
                      borderRadius: "6px",
                      padding: "8px 12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>
                        {inv.invitee_name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#8c8c98" }}>
                        Invited by {inv.inviter_name}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "11px", color: "#e5b731", background: "rgba(229, 183, 49, 0.12)", padding: "2px 8px", borderRadius: "4px" }}>
                        Pending
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(inv.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#f87171",
                          fontSize: "12px",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className={styles.modalFooter} style={{ padding: "12px 20px" }}>
          <button type="button" onClick={onClose} className={styles.modalCancelBtn}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
