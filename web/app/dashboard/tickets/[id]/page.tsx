"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition, type KeyboardEvent } from "react";
import {
  api,
  ApiError,
  STATUS_LABEL,
  CATEGORY_LABEL,
  type TicketThread,
  type TicketStatus,
} from "@/lib/api";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import styles from "./TicketDetail.module.css";

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return "Unknown date";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function formatRelativeTime(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const past = new Date(isoStr).getTime();
    const diff = Math.floor((Date.now() - past) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return formatDate(isoStr);
  } catch {
    return "";
  }
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { token, profile } = useMember();

  const [state, setState] = useState<{
    key: string;
    data?: TicketThread;
    error?: string;
  } | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [replyContent, setReplyContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [, startTransition] = useTransition();

  const key = `${token}:${id}`;

  const loadTicket = () => {
    let active = true;
    api
      .ticket(token, id)
      .then((data) => {
        if (active) setState({ key, data });
      })
      .catch((error) => {
        if (active) {
          setState({
            key,
            error:
              error instanceof ApiError && error.status === 404
                ? "This ticket is unavailable or you do not have permission to view it."
                : "The ticket conversation could not be loaded. Please try again.",
          });
        }
      });
    return () => {
      active = false;
    };
  };

  useEffect(() => {
    return loadTicket();
  }, [token, id, key, attempt]);

  const data = state?.key === key ? state.data : undefined;
  const error = state?.key === key ? state.error : undefined;

  const handleSendReply = async () => {
    const trimmed = replyContent.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setActionError("");
    try {
      const newMsg = await api.postTicketMessage(token, id, trimmed);
      setReplyContent("");
      startTransition(() => {
        setState((current) => {
          if (!current?.data) return current;
          return {
            ...current,
            data: {
              ...current.data,
              messages: [
                ...current.data.messages,
                {
                  id: newMsg.id,
                  sender_name:
                    newMsg.sender_name ||
                    profile?.full_name ||
                    (profile?.is_admin ? "Club Staff" : "Member"),
                  sender_role: profile?.is_admin ? "admin" : "user",
                  content: newMsg.content,
                  attachments: newMsg.attachments || [],
                  timestamp: newMsg.timestamp || new Date().toISOString(),
                  source: "web",
                },
              ],
            },
          };
        });
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to post message. Please try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSendReply();
    }
  };

  const handleClaimTicket = async () => {
    if (!profile?.id || isClaiming) return;
    setIsClaiming(true);
    setActionError("");
    try {
      await api.adminAssignTicket(token, id, profile.id);
      setAttempt((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to claim ticket.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleStatusChange = async (nextStatus: TicketStatus) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setActionError("");
    try {
      await api.adminUpdateTicketStatus(token, id, nextStatus);
      setAttempt((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update ticket status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCloseTicket = async () => {
    const reason = window.prompt("Reason for closing this ticket (optional):");
    if (reason === null) return;
    setIsUpdatingStatus(true);
    setActionError("");
    try {
      await api.closeTicket(token, id, reason || undefined);
      setAttempt((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to close ticket.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <Link href="/dashboard/tickets" className={styles.backLink}>
            <MemberIcon name="chevron-left" />
            Back to tickets
          </Link>
        </div>
        <div className={styles.card} role="alert">
          <p style={{ color: "#f87171", margin: "0.5rem 0" }}>{error}</p>
          <button
            className={styles.claimButton}
            style={{ width: "auto", alignSelf: "flex-start" }}
            onClick={() => {
              setState(null);
              setAttempt((v) => v + 1);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <Link href="/dashboard/tickets" className={styles.backLink}>
            <MemberIcon name="chevron-left" />
            Back to tickets
          </Link>
        </div>
        <div className={styles.card} style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "#a1a1aa" }}>Loading ticket console...</p>
        </div>
      </div>
    );
  }

  const { ticket, messages } = data;
  const statusClass =
    ticket.status === "open"
      ? styles.statusOpen
      : ticket.status === "in_progress"
      ? styles.statusInProgress
      : ticket.status === "resolved"
      ? styles.statusResolved
      : styles.statusClosed;

  const priorityClass =
    ticket.priority === "urgent"
      ? styles.priorityUrgent
      : ticket.priority === "high"
      ? styles.priorityHigh
      : ticket.priority === "low"
      ? styles.priorityLow
      : styles.priorityMedium;

  const threadUrl =
    ticket.thread_url ||
    ticket.discord_meta?.thread_url ||
    (ticket.discord_meta?.guild_id && ticket.discord_meta?.thread_id
      ? `https://discord.com/channels/${ticket.discord_meta.guild_id}/${ticket.discord_meta.thread_id}`
      : null);

  const creatorName = ticket.created_by_name || "Club Member";
  const creatorEmail = ticket.created_by_email;
  const assignedName = ticket.assigned_to_name;
  const assignedEmail = ticket.assigned_to_email;
  const isAssigned = Boolean(ticket.assigned_to_uid);

  return (
    <div className={styles.container}>
      {/* Top Navigation */}
      <div className={styles.topBar}>
        <Link href="/dashboard/tickets" className={styles.backLink}>
          <MemberIcon name="chevron-left" />
          Back to tickets
        </Link>
        <span className={styles.ticketIdBadge}>{ticket.id}</span>
      </div>

      {/* Header Banner */}
      <div className={styles.headerCard}>
        <div className={styles.metaPills}>
          <span className={`${styles.statusPill} ${statusClass}`}>
            <span className={styles.statusDot} />
            {STATUS_LABEL[ticket.status] || ticket.status}
          </span>
          <span className={styles.categoryPill}>
            <MemberIcon name="tag" />
            {CATEGORY_LABEL[ticket.category] || ticket.category.replace(/_/g, " ")}
          </span>
          <span className={`${styles.priorityPill} ${priorityClass}`}>
            <MemberIcon name="flame" />
            Priority: {ticket.priority ? ticket.priority.toUpperCase() : "MEDIUM"}
          </span>
        </div>

        <h1 className={styles.ticketTitle}>{ticket.title}</h1>
        {ticket.description && (
          <p className={styles.ticketDescription}>{ticket.description}</p>
        )}

        {/* Discord Thread Status Banner */}
        {threadUrl && safeUrl(threadUrl) ? (
          <div className={styles.discordBanner}>
            <div className={styles.discordInfo}>
              <div className={styles.discordIcon}>
                <MemberIcon name="discord" />
              </div>
              <div>
                <strong>Discord Thread Active</strong>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#a1a1aa" }}>
                  This ticket has a dedicated private thread on Discord. Messages sync both ways.
                </p>
              </div>
            </div>
            <a
              href={safeUrl(threadUrl)!}
              target="_blank"
              rel="noreferrer"
              className={styles.discordButton}
            >
              <MemberIcon name="discord" />
              Open Thread in Discord
              <MemberIcon name="external" />
            </a>
          </div>
        ) : (
          <div
            className={styles.discordBanner}
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              borderColor: "rgba(255, 255, 255, 0.07)",
            }}
          >
            <div className={styles.discordInfo}>
              <div style={{ color: "#71717a" }}>
                <MemberIcon name="info" />
              </div>
              <div>
                <strong style={{ color: "#d4d4d8" }}>Web Dashboard Conversation</strong>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#71717a" }}>
                  Active directly on the Reinforce console. You can chat and follow up with staff below.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <div className={styles.closedReasonBox} role="alert">
          {actionError}
        </div>
      )}

      {/* Main Two Column Layout */}
      <div className={styles.layout}>
        {/* Left Column: Conversation Timeline & Reply Box */}
        <div className={styles.conversationSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="message" />
              Conversation Thread
            </h2>
            <span className={styles.messageCount}>
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.messageList}>
            {messages.length === 0 ? (
              <div className={styles.emptyMessages}>
                <MemberIcon name="message" />
                <p style={{ margin: 0, fontWeight: 500, color: "#d4d4d8" }}>
                  No messages posted yet
                </p>
                <p style={{ margin: 0, fontSize: "0.825rem" }}>
                  Reply below to start the conversation with the review team.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isStaff =
                  msg.sender_role === "admin" ||
                  msg.sender_role === "lead" ||
                  msg.sender_name?.toLowerCase().includes("admin") ||
                  msg.sender_name?.toLowerCase().includes("lead");
                const isDiscord = msg.source === "discord";

                return (
                  <article
                    key={msg.id}
                    className={`${styles.messageItem} ${
                      isStaff ? styles.messageItemStaff : ""
                    }`}
                  >
                    <div
                      className={`${styles.avatarCircle} ${
                        isStaff ? styles.avatarStaff : ""
                      }`}
                    >
                      {getInitials(msg.sender_name)}
                    </div>
                    <div className={styles.messageBody}>
                      <div className={styles.messageMeta}>
                        <span className={styles.senderName}>{msg.sender_name}</span>
                        <span
                          className={`${styles.roleTag} ${
                            isStaff ? styles.roleTagStaff : styles.roleTagMember
                          }`}
                        >
                          {isStaff ? "Staff Team" : "Member"}
                        </span>
                        <span className={styles.sourcePill}>
                          {isDiscord ? (
                            <>
                              <MemberIcon name="discord" />
                              via Discord
                            </>
                          ) : (
                            <>via Web</>
                          )}
                        </span>
                        {msg.timestamp && (
                          <span className={styles.timestamp} title={formatDate(msg.timestamp)}>
                            {formatRelativeTime(msg.timestamp)}
                          </span>
                        )}
                      </div>
                      <div className={styles.messageContent}>{msg.content}</div>

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={styles.attachmentsList}>
                          {msg.attachments.map((attUrl, idx) =>
                            safeUrl(attUrl) ? (
                              <a
                                key={`${attUrl}-${idx}`}
                                href={safeUrl(attUrl)!}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.attachmentLink}
                              >
                                <MemberIcon name="external" />
                                Attachment {idx + 1}
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Reply Composer */}
          <div className={styles.composerCard}>
            <textarea
              className={styles.textarea}
              placeholder="Type a message or response to this ticket... (Ctrl+Enter to send)"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              rows={3}
            />
            <div className={styles.composerFooter}>
              <span className={styles.composerHint}>
                Press <strong>Ctrl + Enter</strong> to post.
              </span>
              <button
                className={styles.sendButton}
                onClick={handleSendReply}
                disabled={isSending || !replyContent.trim()}
              >
                <MemberIcon name="arrow-right" />
                {isSending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Metadata & Sidebar Cards */}
        <aside className={styles.sidebarColumn}>
          {/* Card 1: Opened By / Author Info */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="user" />
                Ticket Author
              </h3>
            </div>
            <div className={styles.userProfileRow}>
              {ticket.created_by_avatar ? (
                <img
                  src={ticket.created_by_avatar}
                  alt={creatorName}
                  className={styles.profileAvatar}
                />
              ) : (
                <div className={styles.avatarFallback}>{getInitials(creatorName)}</div>
              )}
              <div className={styles.userInfo}>
                <span className={styles.userName} title={creatorName}>
                  {creatorName}
                </span>
                {creatorEmail && (
                  <span className={styles.userEmail} title={creatorEmail}>
                    {creatorEmail}
                  </span>
                )}
                <span className={styles.userTime}>
                  Opened {formatDate(ticket.created_at)}
                  {ticket.created_at ? ` · ${formatRelativeTime(ticket.created_at)}` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Attending Admin / Reviewer */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="shield" />
                Attending Staff
              </h3>
              {isAssigned && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "#e5b731",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  Active Reviewer
                </span>
              )}
            </div>

            {isAssigned ? (
              <div className={styles.userProfileRow}>
                {ticket.assigned_to_avatar ? (
                  <img
                    src={ticket.assigned_to_avatar}
                    alt={assignedName || "Admin"}
                    className={styles.profileAvatar}
                  />
                ) : (
                  <div className={`${styles.avatarFallback} ${styles.avatarReviewer}`}>
                    {getInitials(assignedName || "Admin")}
                  </div>
                )}
                <div className={styles.userInfo}>
                  <span className={styles.userName} title={assignedName || "Club Lead"}>
                    {assignedName || "Club Staff"}
                  </span>
                  {assignedEmail && (
                    <span className={styles.userEmail} title={assignedEmail}>
                      {assignedEmail}
                    </span>
                  )}
                  <span className={styles.userTime} style={{ color: "#34d399" }}>
                    ● Currently attending to this ticket
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.unassignedState}>
                <p className={styles.unassignedText}>
                  No staff member has claimed or been assigned to this ticket yet.
                </p>
                {profile?.is_admin && (
                  <button
                    className={styles.claimButton}
                    onClick={handleClaimTicket}
                    disabled={isClaiming}
                  >
                    <MemberIcon name="shield" />
                    {isClaiming ? "Claiming ticket..." : "Claim this ticket"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Card 3: Admin Actions (Visible to Admins) */}
          {profile?.is_admin && (
            <div className={`${styles.card} ${styles.adminControlCard}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle} style={{ color: "#e5b731" }}>
                  <MemberIcon name="shield" />
                  Admin Controls
                </h3>
              </div>

              <div className={styles.controlField}>
                <label className={styles.controlLabel}>Transition Status</label>
                <select
                  className={styles.selectInput}
                  value={ticket.status}
                  disabled={isUpdatingStatus}
                  onChange={(e) => void handleStatusChange(e.target.value as TicketStatus)}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {ticket.status !== "closed" && (
                <button
                  className={styles.closeTicketButton}
                  onClick={handleCloseTicket}
                  disabled={isUpdatingStatus}
                >
                  Close Ticket
                </button>
              )}
            </div>
          )}

          {/* Card 4: Request Details */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <MemberIcon name="tickets" />
                Request Details
              </h3>
            </div>

            {ticket.fields && ticket.fields.length > 0 ? (
              <div className={styles.detailsList}>
                {ticket.fields.map((field) => (
                  <div key={field.label} className={styles.detailRow}>
                    <span className={styles.detailLabel}>{field.label}</span>
                    <span className={styles.detailValue}>{field.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#71717a", fontSize: "0.825rem", margin: 0 }}>
                No structured fields were provided with this ticket.
              </p>
            )}

            {ticket.close_reason && (
              <div className={styles.closedReasonBox}>
                <strong>Closed Reason:</strong> {ticket.close_reason}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
