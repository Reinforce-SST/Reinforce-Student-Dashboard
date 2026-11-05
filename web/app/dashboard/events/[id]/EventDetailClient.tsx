"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useMember } from "@/lib/useMember";
import { api } from "@/lib/api";
import MemberIcon from "@/components/dashboard/MemberIcon";
import MemberPicker, { type PickedMember } from "@/components/dashboard/MemberPicker";
import {
  type EventDocument,
  type LearningResource,
  type EventRegistration,
  type IdeaSummary,
  type TeamPoolMemberSummary,
} from "@/lib/api";
import type { EventSubmissionPayload, TimelineItemSchema } from "@/types/event-matrix";
import { formatEventDuration, getEventGraduationBatches, parseDateOrIST } from "@/lib/eventsData";
import EventAttendeesPanel from "./EventAttendeesPanel";
import EventAttendancePanel from "./EventAttendancePanel";
import EventTimelineSection from "./EventTimelineSection";
import RsvpIntakeModal from "./RsvpIntakeModal";
import ProjectSubmissionModal from "./ProjectSubmissionModal";
import EditResponsesModal from "./EditResponsesModal";
import AttachProblemModal from "@/components/dashboard/AttachProblemModal";
import CancelRegistrationModal from "./CancelRegistrationModal";
import LockRosterModal from "./LockRosterModal";
import InviteTeammatesModal from "./InviteTeammatesModal";
import type { InvitationItem } from "@/lib/api";
import ArticleMarkdown from "@/components/dashboard/ArticleMarkdown";
import styles from "./EventDetail.module.css";

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      const lower = inner.toLowerCase();
      let trackStyle: React.CSSProperties | undefined;
      if (lower.includes("research")) {
        trackStyle = { color: "#f87171", fontWeight: 750 };
      } else if (lower.includes("product")) {
        trackStyle = { color: "#4ade80", fontWeight: 750 };
      } else if (lower.includes("kaggle")) {
        trackStyle = { color: "#38c8ff", fontWeight: 750 };
      }
      return (
        <strong key={i} className={styles.mdBold} style={trackStyle}>
          {inner}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "#1c1c22",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "var(--brand, #E5B731)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.85em",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(md?: string | null) {
  if (!md) {
    return <p className={styles.mdParagraph}>No additional specifications published for this event yet.</p>;
  }
  return <ArticleMarkdown content={md} />;
}

export default function EventDetailClient({ event }: { event: EventDocument }) {
  const { token, profile } = useMember();
  const isAdmin = Boolean(profile?.is_admin);
  const [activeTab, setActiveTab] = useState<"overview" | "team" | "timeline" | "attendees" | "attendance">("overview");
  const [myEventTeamInvites, setMyEventTeamInvites] = useState<InvitationItem[]>([]);
  const [refreshingInvites, setRefreshingInvites] = useState(false);
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [newTeamNameInput, setNewTeamNameInput] = useState("");
  const [savingTeamName, setSavingTeamName] = useState(false);
  const [lockingRoster, setLockingRoster] = useState(false);

  const [isRegistered, setIsRegistered] = useState(false);
  const [myRegistration, setMyRegistration] = useState<EventRegistration | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teammates, setTeammates] = useState<PickedMember[]>([]);
  const minTeamSize = Math.max(1, event.participation?.min_team_size ?? 1);
  const maxTeamSize = Math.max(1, event.participation?.max_team_size ?? 1);
  const [registeredCount, setRegisteredCount] = useState(event.stats?.registered_count ?? 0);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [linkedResources, setLinkedResources] = useState<LearningResource[]>([]);
  const [linkedResourcesLoading, setLinkedResourcesLoading] = useState(false);
  const [linkedResourcesError, setLinkedResourcesError] = useState(false);
  const linkedResourceIdsKey = (event.resources?.learning_resource_ids ?? []).join("|");

  // Modals & Interactive States
  const [showRsvpModal, setShowRsvpModal] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showEditResponsesModal, setShowEditResponsesModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachedIdea, setAttachedIdea] = useState<IdeaSummary | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [switchingTrack, setSwitchingTrack] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [memberProfilesMap, setMemberProfilesMap] = useState<Record<string, { full_name?: string; avatar_url?: string }>>({});
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockModalError, setLockModalError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingEventInvite, setPendingEventInvite] = useState<InvitationItem | null>(null);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [outgoingTeamInvites, setOutgoingTeamInvites] = useState<InvitationItem[]>([]);

  // Team Formation & Merge Hub State
  const [squadNameInput, setSquadNameInput] = useState("");
  const [squadTrackInput, setSquadTrackInput] = useState("");
  const [squadSubmitting, setSquadSubmitting] = useState(false);
  const [squadActionError, setSquadActionError] = useState<string | null>(null);

  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinCodeBusy, setJoinCodeBusy] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  const [poolQuery, setPoolQuery] = useState("");
  const [debouncedPoolQuery, setDebouncedPoolQuery] = useState("");
  const [onlyLooking, setOnlyLooking] = useState(false);
  const [poolMembers, setPoolMembers] = useState<TeamPoolMemberSummary[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [invitingUid, setInvitingUid] = useState<string | null>(null);
  const [inviteSuccessMap, setInviteSuccessMap] = useState<Record<string, boolean>>({});
  const [mergeBusyId, setMergeBusyId] = useState<string | null>(null);

  // Debounced search query for registered peers pool
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPoolQuery(poolQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [poolQuery]);

  
  const handleManualRefreshInvites = useCallback(async () => {
    if (!token || !event?.id) return;
    setRefreshingInvites(true);
    try {
      const [invs, freshReg] = await Promise.all([
        api.listMyInvitations(token, "pending"),
        api.myEventRegistration(token, event.id).catch(() => null),
      ]);
      const eventSpecific = (invs || []).filter(
        (i) => i.target_id === event.id || i.event_id === event.id
      );
      setMyEventTeamInvites(eventSpecific);
      setPendingEventInvite(eventSpecific[0] || null);

      if (freshReg?.is_registered && freshReg.registration) {
        setMyRegistration(freshReg.registration);
        setIsRegistered(true);
        setRegistrationStatus(freshReg.registration.status || "registered");
      }
    } catch (err) {
      console.error("Failed to refresh invitations", err);
    } finally {
      setRefreshingInvites(false);
    }
  }, [token, event?.id]);

  useEffect(() => {
    if (!token || !event?.id) return;
    handleManualRefreshInvites();
  }, [token, event?.id, handleManualRefreshInvites]);

  const handleSaveTeamName = async () => {
    if (!token || !event?.id || !newTeamNameInput.trim()) return;
    setSavingTeamName(true);
    try {
      const res = await api.createOrUpdateTeam(token, event.id, {
        team_name: newTeamNameInput.trim(),
        selected_track_id: myRegistration?.selected_track_id,
        team_custom_responses: myRegistration?.team_custom_responses,
      });
      setMyRegistration(res);
      setEditingTeamName(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update team name.");
    } finally {
      setSavingTeamName(false);
    }
  };

  const handleLockRoster = () => {
    setLockModalError("");
    setShowLockModal(true);
  };

  const handleConfirmLockRoster = async () => {
    if (!token || !event?.id || lockingRoster) return;
    setLockingRoster(true);
    setLockModalError("");
    try {
      const res = await api.lockTeamRoster(token, event.id);
      setMyRegistration(res);
      setShowLockModal(false);
    } catch (err) {
      setLockModalError(err instanceof Error ? err.message : "Failed to lock squad roster.");
    } finally {
      setLockingRoster(false);
    }
  };

  const [publishingDraft, setPublishingDraft] = useState(false);

  const handlePublishDraftEvent = async () => {
    if (!token || !event?.id || publishingDraft) return;
    setPublishingDraft(true);
    try {
      await api.adminUpdateEventStatus(token, event.id, "published");
      event.status = "published";
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish event.");
    } finally {
      setPublishingDraft(false);
    }
  };

  const handleUnlockRoster = async () => {
    if (!token || !event?.id || lockingRoster) return;
    setLockingRoster(true);
    try {
      const res = await api.unlockTeamRoster(token, event.id);
      setMyRegistration(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to unlock squad roster.");
    } finally {
      setLockingRoster(false);
    }
  };

  const eventIdStr = event?.id || "";
  const tokenStr = token || "";

  // Registered peers pool query with strict primitive dependency guardrail
  useEffect(() => {
    if (!tokenStr || !eventIdStr || !isRegistered || event.participation?.mode !== "team") {
      setPoolMembers([]);
      return;
    }
    let active = true;
    setPoolLoading(true);
    setPoolError(null);
    api
      .getTeamPool(tokenStr, eventIdStr, debouncedPoolQuery || undefined, onlyLooking)
      .then((res) => {
        if (!active) return;
        setPoolMembers(res.members || []);
      })
      .catch((err) => {
        if (!active) return;
        setPoolError(err instanceof Error ? err.message : "Failed to load registered peers pool.");
      })
      .finally(() => {
        if (!active) return;
        setPoolLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tokenStr, eventIdStr, debouncedPoolQuery, onlyLooking, isRegistered]);

  const refreshRegistration = useCallback(async () => {
    if (!tokenStr || !eventIdStr) return;
    try {
      const res = await api.myEventRegistration(tokenStr, eventIdStr);
      setIsRegistered(res.is_registered);
      setMyRegistration(res.registration);
      setRegistrationStatus(res.registration?.status || "");
    } catch (e) {
      console.error(e);
    }
  }, [tokenStr, eventIdStr]);

  const handleCreateSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenStr || !eventIdStr || !squadNameInput.trim()) return;
    setSquadSubmitting(true);
    setSquadActionError(null);
    try {
      const updated = await api.createOrUpdateTeam(tokenStr, eventIdStr, {
        team_name: squadNameInput.trim(),
        selected_track_id: squadTrackInput || undefined,
        looking_for_team: true,
      });
      setMyRegistration(updated);
      setSquadNameInput("");
      await refreshRegistration();
    } catch (err) {
      setSquadActionError(err instanceof Error ? err.message : "Failed to create squad.");
    } finally {
      setSquadSubmitting(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenStr || !eventIdStr || !joinCodeInput.trim()) return;
    setJoinCodeBusy(true);
    setJoinCodeError(null);
    try {
      const updated = await api.mergeTeam(tokenStr, eventIdStr, {
        invite_code: joinCodeInput.trim().toUpperCase(),
      });
      setMyRegistration(updated);
      setJoinCodeInput("");
      await refreshRegistration();
    } catch (err) {
      setJoinCodeError(err instanceof Error ? err.message : "Failed to join squad.");
    } finally {
      setJoinCodeBusy(false);
    }
  };

  const handleAcceptMergeInvite = async (inviteId: string) => {
    if (!tokenStr || !eventIdStr) return;
    setMergeBusyId(inviteId);
    try {
      const updated = await api.mergeTeam(tokenStr, eventIdStr, { invite_id: inviteId });
      setMyRegistration(updated);
      await refreshRegistration();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to accept merge invite.");
    } finally {
      setMergeBusyId(null);
    }
  };

  const handleDeclineMergeInvite = async (inviteId: string) => {
    if (!tokenStr || !eventIdStr) return;
    try {
      await api.declineTeamInvite(tokenStr, eventIdStr, inviteId);
      await refreshRegistration();
    } catch (err) {
      console.error(err);
    }
  };

  const handleInviteCandidate = async (targetUid: string) => {
    if (!tokenStr || !eventIdStr) return;
    setInvitingUid(targetUid);
    try {
      await api.inviteTeamMember(tokenStr, eventIdStr, targetUid);
      setInviteSuccessMap((prev) => ({ ...prev, [targetUid]: true }));
      await refreshRegistration();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send merge invite.");
    } finally {
      setInvitingUid(null);
    }
  };

  const handleLeaveSquad = async () => {
    if (!tokenStr || !eventIdStr) return;
    const confirmed = window.confirm(
      "Are you sure you want to leave your current squad? You will return to solo registered state without cancelling your event RSVP."
    );
    if (!confirmed) return;
    setRegistrationBusy(true);
    try {
      const updated = await api.leaveTeam(tokenStr, eventIdStr);
      setMyRegistration(updated);
      await refreshRegistration();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to leave squad.");
    } finally {
      setRegistrationBusy(false);
    }
  };

  useEffect(() => {
    if (!token || !event?.id || !isRegistered) return;
    let active = true;
    api.listTargetInvitations(token, event.id, "pending").then((invs) => {
      if (!active) return;
      setOutgoingTeamInvites(invs);
    }).catch(() => {});
    return () => { active = false; };
  }, [token, event?.id, isRegistered, showInviteModal]);

  useEffect(() => {
    if (!token || !event?.id) return;
    let active = true;
    api.listMyInvitations(token, "pending").then((invs) => {
      if (!active) return;
      const match = invs.find((i) => i.target_id === event.id || i.event_id === event.id);
      setPendingEventInvite(match || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [token, event?.id, isRegistered]);

  useEffect(() => {
    if (!token || !myRegistration) return;
    const uidsToFetch = new Set<string>();
    const leadUid = myRegistration.user_id;
    if (leadUid && !myRegistration.user_profile?.full_name && !memberProfilesMap[leadUid]) {
      uidsToFetch.add(leadUid);
    }
    const memberUids = myRegistration.member_uids || [];
    for (const u of memberUids) {
      if (!u || memberProfilesMap[u]) continue;
      const cached = myRegistration.member_profiles?.find((p) => p.id === u);
      if (!cached || !cached.full_name || cached.full_name === u) {
        uidsToFetch.add(u);
      }
    }
    if (uidsToFetch.size === 0) return;

    uidsToFetch.forEach((uid) => {
      api.getUserProfile(token, uid)
        .then((prof) => {
          if (prof?.full_name) {
            setMemberProfilesMap((prev) => ({
              ...prev,
              [uid]: { full_name: prof.full_name, avatar_url: prof.avatar_url || undefined },
            }));
          }
        })
        .catch(() => {});
    });
  }, [token, myRegistration, memberProfilesMap]);

  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Active Milestone computation
  const activeTimelineStage = useMemo(() => {
    if (!event.timeline || event.timeline.length === 0 || !currentTime) return null;
    const now = currentTime;
    const sorted = [...event.timeline].sort(
      (a, b) => (parseDateOrIST(a.start_time)?.getTime() ?? 0) - (parseDateOrIST(b.start_time)?.getTime() ?? 0)
    );
    // 1. Current in-progress milestone
    const current = sorted.find((m) => {
      if (m.status_override === "live") return true;
      const s = parseDateOrIST(m.start_time)?.getTime() ?? 0;
      const e = m.end_time ? (parseDateOrIST(m.end_time)?.getTime() ?? s + 3600000) : s + 3600000;
      return now >= s && now <= e;
    });
    if (current) return { item: current, isCurrent: true };

    // 2. Next upcoming milestone
    const upcoming = sorted.find((m) => {
      if (m.status_override === "upcoming") return true;
      const s = parseDateOrIST(m.start_time)?.getTime() ?? 0;
      return s > now;
    });
    if (upcoming) return { item: upcoming, isCurrent: false };

    return null;
  }, [event.timeline, currentTime]);

  useEffect(() => {
    const deadline = event.schedule?.registration_deadline;
    const deadlineTime = parseDateOrIST(deadline)?.getTime();
    const check = () => setDeadlinePassed(Boolean(deadlineTime && deadlineTime <= Date.now()));
    const initial = setTimeout(check, 0);
    const interval = setInterval(check, 60_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [event.schedule?.registration_deadline]);

  useEffect(() => {
    if (!token || !event?.id) return;
    let active = true;
    api.myEventRegistration(token, event.id).then((result) => {
      if (active) {
        setIsRegistered(result.is_registered);
        setMyRegistration(result.registration);
        setRegistrationStatus(result.registration?.status || "");
      }
    }).catch(() => { if (active) setRegistrationError("Registration status could not be loaded."); })
      .finally(() => { if (active) setRegistrationLoading(false); });
    return () => { active = false; };
  }, [token, event.id]);

  useEffect(() => {
    const ideaId =
      (myRegistration as any)?.submission?.problem_statement_id ||
      (myRegistration as any)?.problem_statement_id ||
      (myRegistration as any)?.idea_id;
    if (ideaId && token) {
      api
        .getIdea(ideaId, token)
        .then((res) => setAttachedIdea(res as unknown as IdeaSummary))
        .catch(() => setAttachedIdea(null));
    } else {
      setAttachedIdea(null);
    }
  }, [myRegistration, token]);

  useEffect(() => {
    let active = true;
    if (!linkedResourceIdsKey) {
      setLinkedResources([]);
      setLinkedResourcesError(false);
      setLinkedResourcesLoading(false);
      return () => { active = false; };
    }
    setLinkedResourcesLoading(true);
    setLinkedResourcesError(false);
    api.getEventLearningResources(event.id, token)
      .then((result) => { if (active) setLinkedResources(result.resources); })
      .catch(() => { if (active) setLinkedResourcesError(true); })
      .finally(() => { if (active) setLinkedResourcesLoading(false); });
    return () => { active = false; };
  }, [token, event.id, linkedResourceIdsKey]);

  const handleConfirmCancelRegistration = async () => {
    setRegistrationBusy(true);
    setRegistrationError("");
    try {
      await api.cancelEventRegistration(token, event.id);
      setIsRegistered(false);
      setMyRegistration(null);
      setRegistrationStatus("");
      setOutgoingTeamInvites([]);
      setTeammates([]);
      setShowCancelModal(false);
      const refreshed = await api.getEvent(event.id, token);
      setRegisteredCount(refreshed.stats?.registered_count ?? Math.max(0, registeredCount - 1));
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to cancel registration.");
    } finally {
      setRegistrationBusy(false);
    }
  };

  const handleAcceptInvite = async (invId: string) => {
    setInvitationBusy(true);
    try {
      await api.acceptInvitation(token, invId);
      setPendingEventInvite(null);
      const [regRes, freshEvent] = await Promise.all([
        api.myEventRegistration(token, event.id),
        api.getEvent(event.id, token),
      ]);
      if (regRes.is_registered && regRes.registration) {
        setIsRegistered(true);
        setMyRegistration(regRes.registration);
        setRegistrationStatus(regRes.registration.status);
      }
      setRegisteredCount(freshEvent.stats?.registered_count ?? registeredCount);
    } catch (err: unknown) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to accept invitation.");
    } finally {
      setInvitationBusy(false);
    }
  };

  const handleDeclineInvite = async (invId: string) => {
    setInvitationBusy(true);
    try {
      await api.declineInvitation(token, invId);
      setPendingEventInvite(null);
    } catch (err: unknown) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to decline invitation.");
    } finally {
      setInvitationBusy(false);
    }
  };

  const handleToggleRsvp = async () => {
    if (registrationBusy || registrationLoading) return;
    setRegistrationError("");

    if (isRegistered) {
      setShowCancelModal(true);
      return;
    }

    const hasCustomFields = (event.custom_registration_fields?.length ?? 0) > 0;
    const hasTracks = (event.event_tracks?.length ?? 0) > 0;

    // If event has custom intake questions or tracks, open the modal for detailed intake answers
    if (hasCustomFields || hasTracks) {
      setShowRsvpModal(true);
      return;
    }

    setRegistrationBusy(true);
    try {
      const memberUids = teammates.map((member) => member.id);
      if (event.participation?.mode === "team" && !teamName.trim()) {
        setRegistrationError("Enter a team name before registering.");
        return;
      }
      // The team counts you; the server enforces the same rule.
      if (event.participation?.mode === "team" && memberUids.length + 1 < minTeamSize) {
        setRegistrationError(`This event needs teams of at least ${minTeamSize}. Add ${minTeamSize - 1 - memberUids.length} more ${minTeamSize - 1 - memberUids.length === 1 ? "teammate" : "teammates"}.`);
        return;
      }
      const result: any = await api.registerForEvent(
        token,
        event.id,
        event.participation?.mode === "team" ? { team_name: teamName.trim(), member_uids: memberUids } : {}
      );
      setIsRegistered(true);
      setRegistrationStatus(result.status || "registered");
      setMyRegistration(result);
      api.myEventRegistration(token, event.id).then((fresh) => {
        if (fresh.is_registered && fresh.registration) {
          setMyRegistration(fresh.registration);
        }
      });
      const refreshed = await api.getEvent(event.id, token);
      setRegisteredCount(refreshed.stats?.registered_count ?? registeredCount + 1);
    } catch (err) {
      // Server messages name members by account ID; show the teammate's name.
      const message = err instanceof Error ? err.message : "Registration could not be completed.";
      setRegistrationError(teammates.reduce((text, member) => text.split(member.id).join(member.full_name), message));
    } finally {
      setRegistrationBusy(false);
    }
  };

  const handleSwitchTrack = async (newTrackId: string) => {
    if (!token || switchingTrack) return;
    let currentReg = myRegistration;
    if (!currentReg?.id) {
      try {
        const fresh = await api.myEventRegistration(token, event.id);
        if (fresh.registration) {
          currentReg = fresh.registration;
          setMyRegistration(fresh.registration);
        }
      } catch {
        // continue
      }
    }
    if (!currentReg?.id) {
      setRegistrationError("Could not locate registration record to switch tracks.");
      return;
    }
    setSwitchingTrack(true);
    setRegistrationError("");
    try {
      const res = await api.updateRegistrationTrack(token, event.id, currentReg.id, newTrackId);
      setMyRegistration((prev) => (prev ? { ...prev, selected_track_id: res.selected_track_id } : prev));
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to switch track.");
    } finally {
      setSwitchingTrack(false);
    }
  };

  const handleAttachEventProblem = async (ideaId: string | null) => {
    if (!token || !event?.id) return;
    try {
      const res = await api.attachEventIdea(token, event.id, ideaId);
      setMyRegistration((prev: any) => {
        if (!prev) return prev;
        const prevSub = prev.submission || {};
        return {
          ...prev,
          idea_id: ideaId,
          problem_statement_id: ideaId,
          submission: {
            ...prevSub,
            problem_statement_id: ideaId,
          },
        };
      });
      if (ideaId && res?.idea) {
        setAttachedIdea(res.idea as unknown as IdeaSummary);
      } else if (!ideaId) {
        setAttachedIdea(null);
      }
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Failed to update problem statement.");
    }
  };

  const getTrackChipClass = (track: string) => {
    switch (track) {
      case "research":
        return styles.trackChipResearch;
      case "product":
        return styles.trackChipProduct;
      case "kaggle":
        return styles.trackChipKaggle;
      default:
        return styles.trackChipMisc;
    }
  };

  const formattedStartTime = event.schedule?.start_time
    ? (parseDateOrIST(event.schedule.start_time)?.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }) ?? "TBD")
    : "TBD";

  const formattedDeadline = event.schedule?.registration_deadline
    ? (parseDateOrIST(event.schedule.registration_deadline)?.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) ?? "No deadline specified")
    : "No deadline specified";

  const durationMinutes = event.schedule?.duration_minutes ?? (
    event.schedule?.start_time && event.schedule?.end_time
      ? Math.max(0, Math.round(((parseDateOrIST(event.schedule.end_time)?.getTime() ?? 0) - (parseDateOrIST(event.schedule.start_time)?.getTime() ?? 0)) / 60000))
      : null
  );

  const capacity = event.participation?.max_participants;
  const eligibleYears = event.eligibility?.allowed_years;
  const legacyDefaultYears = eligibleYears?.length === 4 && [1, 2, 3, 4].every((year) => eligibleYears.includes(year));
  const displayedBatches = legacyDefaultYears ? getEventGraduationBatches() : eligibleYears;
  const fillPercent = capacity ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;
  const isDraftMode = event.status === "draft";
  const registrationOpen =
    ((event.status === "published" || event.status === "ongoing") || (isAdmin && isDraftMode)) &&
    !deadlinePassed;

  return (
    <div className={styles.pageContainer}>
      {/* Back Link & Breadcrumb */}
      {isAdmin && isDraftMode && (
        <div
          style={{
            background: "rgba(229, 183, 49, 0.12)",
            border: "1px solid rgba(229, 183, 49, 0.4)",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(229, 183, 49, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#E5B731",
                flexShrink: 0,
              }}
            >
              <MemberIcon name="sparkles" size={18} />
            </div>
            <div>
              <div style={{ color: "#ffffff", fontWeight: "800", fontSize: "14px" }}>
                This Event is currently in Draft Mode (Admin View)
              </div>
              <div style={{ color: "#a1a1aa", fontSize: "12px", marginTop: "2px" }}>
                Draft events are hidden from club members. Convert to an active live event to open registration.
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={publishingDraft}
            onClick={handlePublishDraftEvent}
            style={{
              background: "#E5B731",
              color: "#121214",
              border: "none",
              borderRadius: "8px",
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: "800",
              cursor: publishingDraft ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 10px rgba(229, 183, 49, 0.3)",
            }}
          >
            <MemberIcon name="sparkles" size={14} />
            {publishingDraft ? "Publishing Live..." : "Publish Event (Convert to Live) 🚀"}
          </button>
        </div>
      )}
      <div className={styles.backRow}>
        <Link href="/dashboard/events" className={styles.backBtn}>
          ← Back to Events Planner
        </Link>

        <div className={styles.statusChipsRow}>
          {isDraftMode ? (
            <span className={styles.draftStatusChip} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <MemberIcon name="lock" size={12} />
              DRAFT MODE (ADMIN ONLY)
            </span>
          ) : (
            <span className={styles.formatChip}>{(event.format || "ONLINE").toUpperCase()}</span>
          )}
          <span className={getTrackChipClass(event.track || "misc")}>
            {(event.track || "GENERAL").toUpperCase()} TRACK
          </span>
          <span className={styles.typeChip}>{(event.event_type || "EVENT").toUpperCase()}</span>
        </div>
      </div>

      {/* Incoming Event Team Invitation Banner */}
      {pendingEventInvite && !isRegistered && (
        <div
          style={{
            background: "rgba(229, 183, 49, 0.08)",
            border: "1px solid rgba(229, 183, 49, 0.4)",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#e5b731",
                color: "#141416",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "800",
                fontSize: "15px",
              }}
            >
              ✉
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "750", color: "#ffffff" }}>
                Team Invitation: Join &quot;{pendingEventInvite.team_name || "Team"}&quot;
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa" }}>
                Invited by {pendingEventInvite.inviter_name} ({pendingEventInvite.inviter_email || "Lead"})
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              disabled={invitationBusy}
              onClick={() => handleAcceptInvite(pendingEventInvite.id)}
              style={{
                background: "#e5b731",
                color: "#141416",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: "750",
                cursor: "pointer",
              }}
            >
              {invitationBusy ? "Joining..." : "Accept & Join Team"}
            </button>
            <button
              type="button"
              disabled={invitationBusy}
              onClick={() => handleDeclineInvite(pendingEventInvite.id)}
              style={{
                background: "#27272a",
                color: "#d4d4d8",
                border: "1px solid #3f3f46",
                borderRadius: "6px",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Hero Banner Card */}
      <section className={styles.heroBanner} aria-label="Event Hero Banner">
        <div className={styles.heroGlow} />

        <div className={event.banner_url ? styles.heroLayoutGrid : styles.heroLayoutSingle}>
          {event.banner_url && (
            <div className={styles.eventCoverWrapper}>
              <img
                src={event.banner_url}
                alt={event.title}
                className={styles.eventCoverImage}
              />
            </div>
          )}

          {/* Right 50% Side Panel: Heading, Description, and Buttons */}
          <div className={styles.heroSidePanel}>
            <div className={styles.heroTopMeta}>
              <h1 className={styles.eventTitle}>{event.title}</h1>
              {activeTimelineStage && (
                <div className={styles.activeMilestonePill}>
                  <span className={styles.pulseDot} />
                  <span>
                    <strong>{activeTimelineStage.isCurrent ? "Active Stage:" : "Next Stage:"}</strong>{" "}
                    {activeTimelineStage.item.title}
                  </span>
                </div>
              )}
            </div>

            {isDraftMode && (
              <div className={styles.draftModeAlertBanner}>
                <MemberIcon name="shield" size={14} />
                <span>
                  <strong>Admin Draft Mode:</strong> This event is invisible to regular members. Admins can test registration, matrix operations, and deliverables workflows.
                </span>
              </div>
            )}

            {event.description && (
              <p className={styles.eventSubtitle}>{event.description}</p>
            )}

            <div className={styles.heroActionRow}>
              <button
                type="button"
                className={isRegistered ? styles.joinedButton : styles.rsvpButton}
                onClick={handleToggleRsvp}
                disabled={registrationBusy || registrationLoading || (!isRegistered && !registrationOpen)}
              >
                {isRegistered ? (
                  <>
                    <MemberIcon name="check" size={16} />
                    {registrationStatus === "waitlisted" ? "Waitlisted" : "Registered"} (Cancel RSVP)
                  </>
                ) : (
                  <>
                    <MemberIcon name="plus" size={16} />
                    {!registrationOpen
                      ? "Registration Closed"
                      : isDraftMode
                      ? event.participation?.mode === "team"
                        ? "Test Register Team (Draft)"
                        : "Test RSVP (Draft)"
                      : event.participation?.mode === "team"
                      ? "Register Team"
                      : "RSVP for Event"}
                  </>
                )}
              </button>

              {/* Registration Count & Status Beside the RSVP Button */}
              <div className={styles.regStatusPill}>
                <span className={styles.regCountText}>
                  <MemberIcon name="users" size={14} />
                  <strong>{registeredCount}</strong>
                  {capacity ? ` / ${capacity}` : ""} Registered
                </span>
                <span className={styles.regStatusDivider}>•</span>
                <span
                  className={
                    isRegistered
                      ? registrationStatus === "waitlisted"
                        ? styles.statusWaitlisted
                        : styles.statusRegistered
                      : !registrationOpen
                      ? styles.statusClosed
                      : styles.statusOpen
                  }
                >
                  {isRegistered
                    ? registrationStatus === "waitlisted"
                      ? "Waitlisted"
                      : "✓ Registered"
                    : !registrationOpen
                    ? "Closed"
                    : isDraftMode
                    ? "Draft (Admin Test)"
                    : "RSVP Open"}
                </span>
              </div>

              {event.venue_info?.meeting_url && (
                <a
                  href={event.venue_info.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.discordThreadLink}
                >
                  <MemberIcon name="discord" size={16} />
                  Open Meeting
                </a>
              )}

              {(isAdmin || event.can_access_matrix) && (
                <Link
                  href={`/dashboard/events/${encodeURIComponent(event.slug || event.id)}/matrix`}
                  className={styles.heroMatrixLink}
                  title="Open live Event Matrix in a dedicated view"
                >
                  <MemberIcon name="table" size={15} />
                  Open Event Matrix ↗
                </Link>
              )}
            </div>

            {/* Registered attendee metadata: Team Invite Code, Track Switcher, Roster Lock */}
            {isRegistered && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                {myRegistration?.invite_code && (
                  <div className={styles.teamInvitePill}>
                    <span>Team Code:</span>
                    <span className={styles.inviteCodeMono}>{myRegistration.invite_code}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (myRegistration?.invite_code) {
                          navigator.clipboard.writeText(myRegistration.invite_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }
                      }}
                      className={styles.copyCodeBtn}
                      title="Copy team invite code"
                    >
                      <MemberIcon name="tag" size={11} />
                      {copiedCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}

                {event.team_settings?.lock_rosters_at && (
                  <div className={styles.rosterLockWarning}>
                    <MemberIcon name="clock" size={12} />
                    <span>
                      {currentTime > 0 && currentTime >= (parseDateOrIST(event.team_settings.lock_rosters_at)?.getTime() ?? 0)
                        ? " Rosters Locked"
                        : `Rosters lock ${parseDateOrIST(event.team_settings.lock_rosters_at)?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) ?? ""}`}
                    </span>
                  </div>
                )}

                {event.event_tracks && event.event_tracks.length > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#8c8c98" }}>Track:</span>
                    <select
                      value={myRegistration?.selected_track_id || ""}
                      onChange={(e) => handleSwitchTrack(e.target.value)}
                      disabled={switchingTrack}
                      style={{
                        background: "#18181c",
                        border: "1px solid #31343a",
                        color: "#e5b731",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">-- No Track --</option>
                      {event.event_tracks.map((tr) => (
                        <option key={tr.track_id} value={tr.track_id}>
                          {tr.name} {tr.max_teams ? `(Cap: ${tr.max_teams})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {event.participation?.mode === "team" && registrationOpen && !isRegistered && (
              <div className={styles.teamInputBlock}>
                <input
                  aria-label="Team name"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={styles.teamFieldInput}
                />
                {maxTeamSize > 1 && (
                  <MemberPicker
                    token={token}
                    label="Teammates"
                    selected={teammates}
                    onChange={setTeammates}
                    excludeIds={profile?.id ? [profile.id] : []}
                    max={maxTeamSize - 1}
                  />
                )}
                <span className={styles.teamHintText}>
                  You are included automatically.{" "}
                  {minTeamSize === maxTeamSize
                    ? `Teams have exactly ${maxTeamSize} ${maxTeamSize === 1 ? "member" : "members"}.`
                    : `Teams have ${minTeamSize}-${maxTeamSize} members.`}
                </span>
              </div>
            )}

            {registrationError && (
              <p role="alert" className={styles.regErrorAlert}>
                {registrationError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Event Details Navigation Tabs */}
      <div className={styles.eventTabsBar}>
        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "overview" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <MemberIcon name="calendar" size={15} />
          Overview & Specifications
        </button>

        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "team" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("team")}
        >
          <MemberIcon name="users" size={15} />
          Team & Submissions
          {(myRegistration?.pending_invites?.length || 0) + myEventTeamInvites.length > 0 && (
            <span className={styles.tabCountBadge}>
              {(myRegistration?.pending_invites?.length || 0) + myEventTeamInvites.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "timeline" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          <MemberIcon name="clock" size={15} />
          Timeline & Milestones
          {event.timeline && event.timeline.length > 0 && (
            <span className={styles.tabCountBadge}>{event.timeline.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.eventTabBtn} ${activeTab === "attendees" ? styles.eventTabBtnActive : ""}`}
          onClick={() => setActiveTab("attendees")}
        >
          <MemberIcon name="users" size={15} />
          Registered Attendees & SPGs
          {registeredCount > 0 && <span className={styles.tabCountBadge}>{registeredCount}</span>}
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`${styles.eventTabBtn} ${activeTab === "attendance" ? styles.eventTabBtnActive : ""}`}
            onClick={() => setActiveTab("attendance")}
          >
            <MemberIcon name="shield" size={15} />
            Attendance Management (Admin)
          </button>
        )}


      </div>

      {/* TAB 1: OVERVIEW & SPECIFICATIONS */}
      {activeTab === "overview" && (
        <div className={styles.mainGrid}>
        {/* Left Main Column */}
        <div className={styles.contentColumn}>
          {/* Registered Team Shortcut Banner */}
          {isRegistered && (
            <div className={styles.teamShortcutBanner}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <MemberIcon name="users" size={22} />
                <div>
                  <div style={{ fontWeight: "750", color: "#ffffff", fontSize: "13.5px" }}>
                    You are registered for this event!
                  </div>
                  <div style={{ color: "#a1a1aa", fontSize: "12px", marginTop: "2px" }}>
                    Manage squad rosters, lock your team to mint an Event SPG, and submit deliverables in Team & Submissions.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className={styles.shortcutTabBtn}
              >
                Open Team & Submissions →
              </button>
            </div>
          )}

          {/* Detailed Overview */}
          <section className={styles.sectionCard} aria-label="Event Detailed Overview">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="articles" size={18} />
              Event Agenda & Specifications
            </h2>
            <div className={styles.sectionBody}>
              {renderMarkdown(event.detailed_info || event.description)}
            </div>
          </section>

          {/* Participation & Team Formation (SPG) */}
          <section className={styles.sectionCard} aria-label="Participation Guidelines">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="users" size={18} />
              Participation & SPG Formation
            </h2>

            <div className={styles.spgInfoBox}>
              <div className={styles.spgHeader}>
                <span className={styles.spgTag}>
                  {event.participation?.mode === "team" ? "TEAM EVENT" : "SOLO PARTICIPATION"}
                </span>
                {event.participation?.requires_event_spg && (
                  <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: "750" }}>
                    ✓ Auto-provisions temporary Event SPG
                  </span>
                )}
              </div>

              <div className={styles.spgRuleList}>
                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Team Size</span>
                  <span className={styles.ruleVal}>
                    {event.participation?.mode === "team"
                      ? `${event.participation.min_team_size ?? 1} - ${event.participation.max_team_size ?? 1} Members`
                      : "Individual (Solo)"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>SPG Auto-Disband</span>
                  <span className={styles.ruleVal}>
                    {event.participation?.requires_event_spg
                      ? `${event.participation?.spg_auto_disband_days || 3} Days after event`
                      : "N/A"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Access Scope</span>
                  <span className={styles.ruleVal}>
                    {event.eligibility?.access_scope === "invite_only" ? "Invite Only" :
                      event.eligibility?.access_scope === "members_only" ? "Members Only" : "Open to All Students"}
                  </span>
                </div>

                <div className={styles.spgRuleItem}>
                  <span className={styles.ruleLabel}>Eligibility</span>
                  <span className={styles.ruleVal}>
                    {displayedBatches?.length
                      ? `${legacyDefaultYears || displayedBatches.every((year) => year >= 1900) ? "Batches" : "Years"}: ${displayedBatches.join(", ")}`
                      : "All Batches"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Resources & Downloads */}
          <section className={styles.sectionCard} aria-label="Event Artifacts & Materials">
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="tag" size={18} />
              Event Materials & Links
            </h2>

            <div className={styles.resourcesList}>
              {event.resources?.slides_url && (
                <a
                  href={event.resources.slides_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span> Presentation Slides & Technical Brief</span>
                  <span>Open Slides →</span>
                </a>
              )}
              {event.resources?.writeup_url && (
                <a
                  href={event.resources.writeup_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span> Starter Repository & Notebooks</span>
                  <span>GitHub →</span>
                </a>
              )}
              {event.resources?.recording_url && (
                <a
                  href={event.resources.recording_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span> Workshop Video Recording</span>
                  <span>Watch →</span>
                </a>
              )}
              {linkedResources.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resourceLinkItem}
                >
                  <span>{resource.title}</span>
                  <span>Open link →</span>
                </a>
              ))}
              {linkedResourcesLoading && (
                <p style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                  Loading shared links…
                </p>
              )}
              {linkedResourcesError && (
                <p role="status" style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                  Shared event links could not be loaded.
                </p>
              )}
              {!event.resources?.slides_url &&
                !event.resources?.writeup_url &&
                !event.resources?.recording_url && (
                !linkedResourcesLoading && !linkedResourcesError && linkedResources.length === 0 && (
                  <p style={{ color: "#8c8c98", fontSize: "0.82rem", margin: 0 }}>
                    No event materials have been published yet.
                  </p>
                ))}
            </div>
          </section>
        </div>

        {/* Right Sidebar Column */}
        <aside className={styles.sidebarColumn} aria-label="Event Key Details Sidebar">
          {/* Merit Reward Card */}
          <div className={styles.pointsRewardCard}>
            <div className={styles.pointsTextGroup}>
              <span className={styles.pointsLabel}>Merit Points Reward</span>
              <span className={styles.pointsAmount}>
                +{event.points_reward?.attendance_points ?? 0} PTS
              </span>
            </div>
            <MemberIcon name="award" size={28} />
          </div>

          {/* Registration Form Responses Card (Right Sidebar for Registered Attendees) */}
          {isRegistered && (
            (event.custom_registration_fields?.length ?? 0) > 0 ||
            Boolean(myRegistration?.custom_responses && Object.keys(myRegistration.custom_responses).length > 0) ||
            Boolean(myRegistration?.team_name)
          ) && (
            <section className={styles.intakeCard} style={{ padding: "18px" }} aria-label="Registration Form Answers">
              <div className={styles.intakeHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: "15px" }}>
                    <MemberIcon name="tag" size={16} />
                    Registration Form Responses
                  </h2>
                  <span
                    className={styles.deliverablesStatusTag}
                    style={{
                      background: "rgba(229, 183, 49, 0.12)",
                      color: "#e5b731",
                      border: "1px solid rgba(229, 183, 49, 0.3)",
                      fontSize: "10.5px",
                      padding: "2px 7px",
                    }}
                  >
                    ✓ Intake Recorded
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEditResponsesModal(true)}
                  className={styles.editIntakeBtn}
                  title="Edit your submitted answers for this event"
                >
                  <MemberIcon name="edit" size={13} />
                  Edit Responses
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Team Name Response (for team events) */}
                {event.participation?.mode === "team" && myRegistration?.team_name && (
                  <div className={styles.intakeFieldBox} style={{ padding: "12px 14px" }}>
                    <div className={styles.intakeFieldHeader}>
                      <span className={styles.intakeFieldLabel}>TEAM NAME</span>
                      <span
                        className={styles.intakeFieldScope}
                        style={{
                          background: "rgba(229, 183, 49, 0.12)",
                          color: "#e5b731",
                          border: "1px solid rgba(229, 183, 49, 0.3)",
                        }}
                      >
                        Team
                      </span>
                    </div>
                    <div className={styles.intakeFieldValue} style={{ fontWeight: "700", color: "#f4f4f5" }}>
                      <span>{myRegistration.team_name}</span>
                    </div>
                  </div>
                )}

                {/* Custom registration fields */}
                {event.custom_registration_fields?.map((cf) => {
                  const val =
                    cf.applies_to === "team"
                      ? myRegistration?.custom_responses?.[cf.field_id]
                      : myRegistration?.member_responses?.[profile?.id || ""]?.[cf.field_id] ??
                        myRegistration?.custom_responses?.[cf.field_id];

                  const hasVal = val !== undefined && val !== null && val !== "";

                  return (
                    <div key={cf.field_id} className={styles.intakeFieldBox} style={{ padding: "12px 14px" }}>
                      <div className={styles.intakeFieldHeader}>
                        <span className={styles.intakeFieldLabel}>{cf.label.toUpperCase()}</span>
                        <span
                          className={styles.intakeFieldScope}
                          style={{
                            background:
                              cf.applies_to === "team"
                                ? "rgba(229, 183, 49, 0.12)"
                                : "rgba(56, 189, 248, 0.12)",
                            color: cf.applies_to === "team" ? "#e5b731" : "#38bdf8",
                            border: `1px solid ${
                              cf.applies_to === "team"
                                ? "rgba(229, 183, 49, 0.3)"
                                : "rgba(56, 189, 248, 0.3)"
                            }`,
                          }}
                        >
                          {cf.applies_to === "team" ? "Team" : "Individual"}
                        </span>
                      </div>

                      <div className={styles.intakeFieldValue}>
                        {!hasVal ? (
                          <span className={styles.intakeFieldValueEmpty}>Not provided</span>
                        ) : cf.field_type === "boolean" ? (
                          <span>{val ? "✓ Yes, Confirmed" : "✕ No"}</span>
                        ) : cf.field_type === "url" ? (
                          <a
                            href={String(val)}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.intakeFieldLink}
                          >
                            <span>📎</span>
                            <span>{String(val)}</span>
                          </a>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quick Specs */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={16} />
              Schedule & Location
            </h2>

            <div className={styles.specList}>
              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="calendar" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Date & Start Time</span>
                  <span className={styles.specValue}>{formattedStartTime}</span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="clock" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Estimated Duration</span>
                  <span className={styles.specValue}>
                    {formatEventDuration(durationMinutes)}
                  </span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="location" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>Venue / Stage</span>
                  <span className={styles.specValue}>
                    {event.venue_info?.venue_name ||
                      (event.format === "online" ? "Online; link to be announced" : "Venue to be announced")}
                    {event.venue_info?.room ? ` (${event.venue_info.room})` : ""}
                  </span>
                </div>
              </div>

              <div className={styles.specItem}>
                <div className={styles.specIcon}>
                  <MemberIcon name="shield" size={16} />
                </div>
                <div className={styles.specContent}>
                  <span className={styles.specLabel}>RSVP Deadline</span>
                  <span className={styles.specValue}>{formattedDeadline}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Participation Stats */}
          <div className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="users" size={16} />
              Registration Status
            </h2>

            <div className={styles.statsWidget}>
              <div className={styles.statRow}>
                <span style={{ color: "#8c8c98" }}>Confirmed Attendees</span>
                <span className={styles.statValueMono}>
                  {registeredCount}{capacity ? ` / ${capacity}` : ""}
                </span>
              </div>

              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${fillPercent}%` }} />
              </div>

              <div className={styles.statRow}>
                <span style={{ color: "#8c8c98" }}>Average Rating</span>
                <span
                  style={{
                    color: "var(--brand, #E5B731)",
                    fontWeight: "800",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {event.stats?.feedback_count ? `⭐ ${(event.stats.average_rating ?? 0).toFixed(1)} / 5.0` : "No ratings yet"}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      )}

      {/* TAB 2: TIMELINE & MILESTONES */}
      
      {/* TAB 2: TEAM & SUBMISSIONS */}
      {activeTab === "team" && (
        <div className={styles.teamTabGrid}>
          {/* Main Area: Deliverables & Team Squad */}
          <div className={styles.teamMainArea}>
            {!isRegistered ? (
              <div className={styles.notRegisteredTeamNotice}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                  <div className={styles.noticeIconCircle}>
                    <MemberIcon name="users" size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "#ffffff", fontWeight: "800" }}>
                      Team Formation & Submissions Hub
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#a1a1aa" }}>
                      Every participant registers individually first. Once registered, this hub unlocks squad creation, teammate invite codes, peer merging, and project deliverables submission.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleRsvp}
                  className={styles.registerNowBtn}
                >
                  <MemberIcon name="plus" size={16} />
                  {event.participation?.mode === "team" ? "Register for Event (Team Mode)" : "RSVP for Event"}
                </button>
              </div>
            ) : (
              <>
                {/* Phase 2: Team Formation & Merge Hub (For Team Events) */}
          {isRegistered && (event.participation?.mode === "team" || Boolean(myRegistration?.team_id || myRegistration?.team_name)) && (() => {
            const hasSquad = Boolean(myRegistration?.team_id);
            const squadMembers = myRegistration?.member_uids || (profile?.id ? [profile.id] : []);
            const squadSize = hasSquad ? squadMembers.length : 1;
            const isLeader = Boolean(myRegistration?.is_team_leader) || (squadMembers.length > 0 && squadMembers[0] === profile?.id) || (Boolean(myRegistration?.team_name) && squadSize <= 1);
            const isEligibleSquad = squadSize >= minTeamSize;
            const isFullSquad = squadSize >= maxTeamSize;
            const pendingInvites = myRegistration?.pending_invites || [];

            return (
              <section
                className={styles.deliverablesCard}
                style={{ borderColor: "#3f424c", marginBottom: "16px", background: "#141416" }}
                aria-label="Team Formation and Merge Hub"
              >
                {/* 1. Squad Status Header */}
                <div className={styles.deliverablesHeader} style={{ flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                      <MemberIcon name="users" size={18} />
                      {hasSquad ? (
                        <>
                          Squad: {editingTeamName ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="text"
                              value={newTeamNameInput}
                              onChange={(e) => setNewTeamNameInput(e.target.value)}
                              className={styles.teamFieldInput}
                              style={{ padding: "4px 8px", fontSize: "13px", width: "160px" }}
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={savingTeamName || !newTeamNameInput.trim()}
                              onClick={handleSaveTeamName}
                              className={styles.inviteAcceptBtn}
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                            >
                              {savingTeamName ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTeamName(false)}
                              className={styles.inviteDeclineBtn}
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ color: "#E5B731" }}>{myRegistration?.team_name || "Active Squad"}</strong>
                            <button
                              type="button"
                              onClick={() => {
                                setNewTeamNameInput(myRegistration?.team_name || "");
                                setEditingTeamName(true);
                              }}
                              style={{
                                background: "rgba(229, 183, 49, 0.15)",
                                border: "1px solid rgba(229, 183, 49, 0.4)",
                                color: "#E5B731",
                                cursor: "pointer",
                                borderRadius: "4px",
                                padding: "3px 8px",
                                fontSize: "11.5px",
                                fontWeight: "750",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Edit squad name"
                            >
                              <MemberIcon name="edit" size={12} />
                              Edit
                            </button>
                          </span>
                        )}
                        </>
                      ) : (
                        <span>Solo Participant <span style={{ color: "#a1a1aa", fontSize: "14px", fontWeight: "normal" }}>(Registered Pool)</span></span>
                      )}
                    </h2>

                    {/* Status Badge */}
                    {!hasSquad || (squadSize === 1 && minTeamSize > 1) ? (
                      <span
                        style={{
                          background: "rgba(229, 183, 49, 0.15)",
                          color: "#E5B731",
                          border: "1px solid rgba(229, 183, 49, 0.4)",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "800",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ⚠️ SOLO / UNASSIGNED (1/{minTeamSize} min required)
                      </span>
                    ) : !isEligibleSquad ? (
                      <span
                        style={{
                          background: "rgba(245, 158, 11, 0.15)",
                          color: "#f59e0b",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "800",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ⏳ SQUAD FORMING ({squadSize}/{minTeamSize} min required)
                      </span>
                    ) : (
                      <span
                        style={{
                          background: "rgba(74, 222, 128, 0.15)",
                          color: "#4ade80",
                          border: "1px solid rgba(74, 222, 128, 0.4)",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "800",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ✓ ELIGIBLE SQUAD ({squadSize}/{maxTeamSize} Members)
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {hasSquad && (
                      myRegistration?.roster_locked ? (
                        <button
                          type="button"
                          disabled={lockingRoster}
                          onClick={handleUnlockRoster}
                          style={{
                            background: "rgba(229, 183, 49, 0.15)",
                            color: "#E5B731",
                            border: "1px solid rgba(229, 183, 49, 0.4)",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            fontWeight: "800",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          {lockingRoster ? (
                            "Unlocking..."
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <MemberIcon name="unlock" size={12} /> Unlock / Edit Roster
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={lockingRoster || !isEligibleSquad}
                          onClick={handleLockRoster}
                          title={!isEligibleSquad ? `Requires minimum of ${minTeamSize} members to lock roster` : undefined}
                          style={{
                            background: isEligibleSquad ? "#E5B731" : "#27272a",
                            color: isEligibleSquad ? "#141416" : "#71717a",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            fontWeight: "800",
                            cursor: isEligibleSquad ? "pointer" : "not-allowed",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          {lockingRoster ? (
                            "Locking..."
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <MemberIcon name="lock" size={12} /> Lock Squad Roster & Form SPG
                            </span>
                          )}
                        </button>
                      )
                    )}

                    {myRegistration?.spg_id && (
                      <Link
                        href={`/dashboard/spg/${encodeURIComponent(myRegistration.spg_id)}`}
                        className={styles.openSubmissionModalBtn}
                        style={{ textDecoration: "none", background: "rgba(229, 183, 49, 0.15)", color: "#e5b731", border: "1px solid rgba(229, 183, 49, 0.3)" }}
                      >
                        <MemberIcon name="sparkles" size={13} />
                        View Team SPG →
                      </Link>
                    )}

                    {hasSquad && (
                      <button
                        type="button"
                        onClick={handleLeaveSquad}
                        style={{
                          background: "rgba(244, 63, 94, 0.12)",
                          color: "#f43f5e",
                          border: "1px solid rgba(244, 63, 94, 0.3)",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "11.5px",
                          fontWeight: "750",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        Leave Squad
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setRegistrationError("");
                        setShowCancelModal(true);
                      }}
                      style={{
                        background: "rgba(248, 113, 113, 0.1)",
                        color: "#f87171",
                        border: "1px solid rgba(248, 113, 113, 0.25)",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "11.5px",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <MemberIcon name="trash" size={12} />
                      Cancel RSVP
                    </button>
                  </div>
                </div>

                {/* 2. Incoming Merge Invites Tray */}
                {pendingInvites.length > 0 && (
                  <div
                    style={{
                      background: "rgba(229, 183, 49, 0.08)",
                      border: "1px solid rgba(229, 183, 49, 0.4)",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      marginTop: "12px",
                    }}
                  >
                    <div style={{ fontSize: "11.5px", fontWeight: "800", color: "#E5B731", textTransform: "uppercase", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>✉</span> Incoming Squad Merge Invites ({pendingInvites.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {pendingInvites.map((inv) => (
                        <div
                          key={inv.invite_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            background: "#1c1c22",
                            border: "1px solid #31343a",
                            padding: "8px 12px",
                            borderRadius: "6px",
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: "750", color: "#ffffff", fontSize: "13px" }}>
                              &quot;{inv.from_team_name}&quot;
                            </span>
                            <span style={{ fontSize: "12px", color: "#a1a1aa", marginLeft: "6px" }}>
                              invited you to merge (Leader: {inv.from_leader_name})
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              disabled={mergeBusyId === inv.invite_id}
                              onClick={() => handleAcceptMergeInvite(inv.invite_id)}
                              style={{
                                background: "#E5B731",
                                color: "#121214",
                                border: "none",
                                borderRadius: "4px",
                                padding: "4px 10px",
                                fontSize: "11.5px",
                                fontWeight: "800",
                                cursor: "pointer",
                              }}
                            >
                              {mergeBusyId === inv.invite_id ? "Merging..." : "Accept & Merge"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeclineMergeInvite(inv.invite_id)}
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                color: "#a1a1aa",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "4px",
                                padding: "4px 10px",
                                fontSize: "11.5px",
                                fontWeight: "700",
                                cursor: "pointer",
                              }}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Main Two-Column Formation Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginTop: "14px" }}>
                  
                  {/* Left Column: My Squad or Create/Join */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {hasSquad ? (
                      <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase" }}>
                            Squad Roster ({squadSize}/{maxTeamSize})
                          </span>
                          {myRegistration?.selected_track_id && (
                            <span style={{ fontSize: "10.5px", fontWeight: "750", background: "rgba(229, 183, 49, 0.15)", color: "#E5B731", padding: "2px 6px", borderRadius: "4px" }}>
                              Track: {myRegistration.selected_track_id}
                            </span>
                          )}
                        </div>

                        {/* Monospace Invite Code */}
                        {myRegistration?.invite_code && (
                          <div style={{ background: "#0e0e11", border: "1px solid #282a30", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontSize: "10px", color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>Squad Invite Code</div>
                              <code style={{ fontSize: "16px", fontWeight: "850", color: "#E5B731", letterSpacing: "0.1em" }}>
                                {myRegistration.invite_code}
                              </code>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (myRegistration?.invite_code) {
                                  navigator.clipboard.writeText(myRegistration.invite_code);
                                  setCopiedCode(true);
                                  setTimeout(() => setCopiedCode(false), 2000);
                                }
                              }}
                              className={styles.copyCodeBtn}
                              style={{ padding: "5px 10px", fontSize: "11.5px" }}
                            >
                              {copiedCode ? "✓ Copied" : "Copy Code "}
                            </button>
                          </div>
                        )}

                        {/* Roster List */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {squadMembers.map((uid) => {
                            const leaderUid = (myRegistration?.is_team_leader && profile?.id) ? profile.id : (squadMembers.length > 0 ? squadMembers[0] : profile?.id);
                            const isThisLeader = uid === leaderUid;
                            const prof = memberProfilesMap[uid] || myRegistration?.member_profiles?.find((p) => p.id === uid);
                            const name = uid === profile?.id ? `${profile.full_name || "You"} (You)` : (prof?.full_name || `Member ${uid.slice(0, 5)}`);
                            return (
                              <div
                                key={uid}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: "#1c1c22",
                                  padding: "7px 10px",
                                  borderRadius: "6px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div
                                    style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: isThisLeader ? "#E5B731" : "#2b2e35",
                                      color: isThisLeader ? "#141416" : "#ffffff",
                                      fontWeight: "800",
                                      fontSize: "11px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {isThisLeader ? "L" : "M"}
                                  </div>
                                  <span style={{ fontSize: "13px", fontWeight: isThisLeader ? "750" : "500", color: "#ffffff" }}>
                                    {name}
                                  </span>
                                </div>
                                <span style={{ fontSize: "10px", fontWeight: "750", color: isThisLeader ? "#E5B731" : "#71717a" }}>
                                  {isThisLeader ? "LEADER" : "MEMBER"}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Problem Statement Card */}
                        <div style={{ marginTop: "14px", borderTop: "1px solid #23252b", paddingTop: "12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase" }}>
                              Problem Statement (Idea Jar)
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAttachModal(true)}
                              style={{
                                background: "rgba(229, 183, 49, 0.12)",
                                border: "1px solid rgba(229, 183, 49, 0.3)",
                                color: "#E5B731",
                                fontSize: "11px",
                                fontWeight: "750",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              {attachedIdea ? "Change" : "+ Pick Problem"}
                            </button>
                          </div>
                          {attachedIdea ? (
                            <div style={{ fontSize: "12.5px", color: "#e4e4e7" }}>
                              <strong style={{ color: "#ffffff" }}>{attachedIdea.title}</strong>
                            </div>
                          ) : (
                            <div style={{ fontSize: "12px", color: "#71717a" }}>
                              No problem statement linked yet. Pick an approved problem to sync to Matrix.
                            </div>
                          )}
                        </div>

                        {/* Team Custom Intake Questions (Hardware, Repository, Pitch, etc.) */}
                        {(() => {
                          const teamQuestions = (event.custom_registration_fields || []).filter(
                            (cf) => cf.applies_to === "team"
                          );
                          if (teamQuestions.length === 0) return null;
                          return (
                            <div style={{ marginTop: "14px", borderTop: "1px solid #23252b", paddingTop: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase" }}>
                                  Team Intake Details ({teamQuestions.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowEditResponsesModal(true)}
                                  style={{
                                    background: "rgba(229, 183, 49, 0.12)",
                                    border: "1px solid rgba(229, 183, 49, 0.3)",
                                    color: "#E5B731",
                                    fontSize: "11px",
                                    fontWeight: "750",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Edit Answers
                                </button>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {teamQuestions.map((tq) => {
                                  const val = myRegistration?.custom_responses?.[tq.field_id];
                                  const hasVal = val !== undefined && val !== null && val !== "";
                                  return (
                                    <div
                                      key={tq.field_id}
                                      style={{
                                        background: "#121215",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid #282a30",
                                        fontSize: "12px",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", color: "#a1a1aa", fontSize: "11px", marginBottom: "2px" }}>
                                        <span>{tq.label} {tq.required && <span style={{ color: "#ef4444" }}>*</span>}</span>
                                        {tq.required && !hasVal && (
                                          <span style={{ color: "#f87171", fontSize: "10px", fontWeight: "750" }}>
                                            Required before submit
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ color: hasVal ? "#ffffff" : "#71717a", fontWeight: hasVal ? "600" : "normal" }}>
                                        {hasVal ? String(val) : "Not answered yet"}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      /* Solo State: Create Squad OR Merge via Code */
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {/* Option A: Create Squad */}
                        <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase", marginBottom: "10px" }}>
                            Option A: Create Your Squad
                          </div>
                          {squadActionError && (
                            <div style={{ color: "#f87171", fontSize: "12px", marginBottom: "8px" }}>
                              {squadActionError}
                            </div>
                          )}
                          <form onSubmit={handleCreateSquad} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <input
                              type="text"
                              placeholder="Squad Name (e.g. Cyber Knights)"
                              value={squadNameInput}
                              onChange={(e) => setSquadNameInput(e.target.value)}
                              className={styles.teamFieldInput}
                              required
                            />
                            {event.event_tracks && event.event_tracks.length > 0 && (
                              <select
                                value={squadTrackInput}
                                onChange={(e) => setSquadTrackInput(e.target.value)}
                                className={styles.fieldSelect}
                              >
                                <option value="">-- Choose Track (Optional) --</option>
                                {event.event_tracks.map((t) => (
                                  <option key={t.track_id} value={t.track_id}>{t.name}</option>
                                ))}
                              </select>
                            )}
                            <button
                              type="submit"
                              disabled={squadSubmitting || !squadNameInput.trim()}
                              style={{
                                background: "#E5B731",
                                color: "#121214",
                                border: "none",
                                borderRadius: "6px",
                                padding: "8px 14px",
                                fontSize: "12px",
                                fontWeight: "800",
                                cursor: "pointer",
                                marginTop: "4px",
                              }}
                            >
                              {squadSubmitting ? "Creating Squad..." : "Create Squad & Get Code →"}
                            </button>
                          </form>
                        </div>

                        {/* Option B: Join via Code */}
                        <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase", marginBottom: "10px" }}>
                            Option B: Join Squad with Code
                          </div>
                          {joinCodeError && (
                            <div style={{ color: "#f87171", fontSize: "12px", marginBottom: "8px" }}>
                              {joinCodeError}
                            </div>
                          )}
                          <form onSubmit={handleJoinByCode} style={{ display: "flex", gap: "8px" }}>
                            <input
                              type="text"
                              placeholder="6-Digit Team Code"
                              maxLength={6}
                              value={joinCodeInput}
                              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                              className={styles.teamFieldInput}
                              style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: "750" }}
                              required
                            />
                            <button
                              type="submit"
                              disabled={joinCodeBusy || joinCodeInput.trim().length !== 6}
                              style={{
                                background: "rgba(229, 183, 49, 0.15)",
                                color: "#E5B731",
                                border: "1px solid rgba(229, 183, 49, 0.4)",
                                borderRadius: "6px",
                                padding: "8px 14px",
                                fontSize: "12px",
                                fontWeight: "800",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {joinCodeBusy ? "Joining..." : "Join Squad"}
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Scoped Registered Peers Pool ("Find & Merge Registered Peers") */}
                  <div style={{ background: "#151518", border: "1px solid #2b2e35", borderRadius: "8px", padding: "14px", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase" }}>
                        Find & Merge Registered Peers
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11.5px", color: "#a1a1aa", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={onlyLooking}
                          onChange={(e) => setOnlyLooking(e.target.checked)}
                          style={{ accentColor: "#E5B731" }}
                        />
                        Looking for squad only
                      </label>
                    </div>

                    {/* Search Input */}
                    <div style={{ position: "relative", marginBottom: "10px" }}>
                      <input
                        type="text"
                        placeholder="Search registered peers by name or email..."
                        value={poolQuery}
                        onChange={(e) => setPoolQuery(e.target.value)}
                        className={styles.teamFieldInput}
                        style={{ paddingLeft: "10px", fontSize: "12.5px" }}
                      />
                    </div>

                    {/* Pool Listing */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, maxHeight: "320px", overflowY: "auto" }}>
                      {poolLoading ? (
                        <div style={{ padding: "16px", textAlign: "center", color: "#71717a", fontSize: "12.5px" }}>
                          Scanning registered attendees...
                        </div>
                      ) : poolError ? (
                        <div style={{ padding: "12px", color: "#f87171", fontSize: "12px" }}>
                          {poolError}
                        </div>
                      ) : poolMembers.length === 0 ? (
                        <div style={{ padding: "20px", textAlign: "center", color: "#71717a", fontSize: "12.5px" }}>
                          No matching registered peers found.
                        </div>
                      ) : (
                        poolMembers.map((cand) => {
                          const candTeamSize = cand.current_team_size || 1;
                          const combinedSize = squadSize + candTeamSize;
                          const isOverflow = combinedSize > maxTeamSize;
                          const wasInvited = Boolean(inviteSuccessMap[cand.uid]);

                          return (
                            <div
                              key={cand.uid}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: "#1c1c22",
                                border: "1px solid #282a30",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                gap: "10px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                <div
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background: "#2b2e35",
                                    color: "#E5B731",
                                    fontWeight: "800",
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {(cand.full_name || "M").slice(0, 1).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {cand.full_name}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#8c8c98" }}>
                                    {cand.team_name ? (
                                      <span>Squad: &quot;{cand.team_name}&quot; ({candTeamSize}/{maxTeamSize})</span>
                                    ) : (
                                      <span>Solo Attendee • 1/{maxTeamSize}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={isOverflow || wasInvited || invitingUid === cand.uid}
                                onClick={() => handleInviteCandidate(cand.uid)}
                                title={isOverflow ? `Combined size (${combinedSize}) exceeds cap of ${maxTeamSize}` : undefined}
                                style={{
                                  background: wasInvited ? "rgba(74, 222, 128, 0.15)" : isOverflow ? "#1e1e24" : "rgba(229, 183, 49, 0.15)",
                                  color: wasInvited ? "#4ade80" : isOverflow ? "#52525b" : "#E5B731",
                                  border: `1px solid ${wasInvited ? "rgba(74, 222, 128, 0.3)" : isOverflow ? "#2e2e36" : "rgba(229, 183, 49, 0.3)"}`,
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  fontWeight: "750",
                                  cursor: isOverflow || wasInvited ? "not-allowed" : "pointer",
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                }}
                              >
                                {wasInvited ? "✓ Invited" : isOverflow ? "Cap Full" : invitingUid === cand.uid ? "Inviting..." : "+ Invite to Merge"}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Project Deliverables Card (For Registered Attendees) */}
          {isRegistered && (() => {
            const hasDeliverablesSubmitted = Boolean(
              myRegistration?.submission && (
                myRegistration.submission.submitted_at ||
                myRegistration.submission.repo_url ||
                myRegistration.submission.slides_url ||
                myRegistration.submission.demo_url ||
                myRegistration.submission.paper_link ||
                (myRegistration.submission.custom_fields && Object.keys(myRegistration.submission.custom_fields).length > 0)
              )
            );

            return (
              <section className={styles.deliverablesCard} aria-label="Project Deliverables">
                <div className={styles.deliverablesHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                      <MemberIcon name="articles" size={18} />
                      Project Deliverables & Submission
                    </h2>
                    <span
                      className={`${styles.deliverablesStatusTag} ${
                        hasDeliverablesSubmitted
                          ? styles.statusSubmitted
                          : styles.statusPending
                      }`}
                    >
                      {hasDeliverablesSubmitted
                        ? "✓ Submitted"
                        : "Submission Pending"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSubmissionModal(true)}
                    className={styles.openSubmissionModalBtn}
                  >
                    <MemberIcon name={hasDeliverablesSubmitted ? "edit" : "plus"} size={14} />
                    {hasDeliverablesSubmitted
                      ? "Update Deliverables"
                      : "Submit Project Deliverables"}
                  </button>
                </div>

                {hasDeliverablesSubmitted && myRegistration?.submission ? (
                  <div className={styles.deliverablesLinksList}>
                    {myRegistration.submission.repo_url && (
                      <a
                        href={myRegistration.submission.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.deliverableLinkItem}
                      >
                        <span></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Repository
                        </span>
                      </a>
                    )}
                    {myRegistration.submission.slides_url && (
                      <a
                        href={myRegistration.submission.slides_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.deliverableLinkItem}
                      >
                        <span></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Pitch Slides
                        </span>
                      </a>
                    )}
                    {myRegistration.submission.demo_url && (
                      <a
                        href={myRegistration.submission.demo_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.deliverableLinkItem}
                      >
                        <span></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Live Demo
                        </span>
                      </a>
                    )}
                    {myRegistration.submission.paper_link && (
                      <a
                        href={myRegistration.submission.paper_link}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.deliverableLinkItem}
                      >
                        <span></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Paper / Writeup
                        </span>
                      </a>
                    )}
                    {myRegistration.submission.custom_fields &&
                      Object.entries(myRegistration.submission.custom_fields).map(([k, v]) => {
                        if (!v) return null;
                        const href = String(v).startsWith("http") ? String(v) : `https://${v}`;
                        return (
                          <a
                            key={k}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.deliverableLinkItem}
                          >
                            <span>📎</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {k}: {String(v)}
                            </span>
                          </a>
                        );
                      })}
                    {myRegistration.submission.notes && (
                      <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "#a1a1aa", gridColumn: "1 / -1" }}>
                        <strong>Notes:</strong> {myRegistration.submission.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "13px", color: "#8c8c98" }}>
                    No deliverables submitted yet. Upload your repository, pitch slides, or demo before the submission deadline.
                  </p>
                )}
              </section>
            );
          })()}


              </>
            )}
            <section className={styles.sectionCard} aria-label="Participation Rules">
              <h2 className={styles.sectionTitle}>
                <MemberIcon name="users" size={18} />
                Squad & Participation Rules
              </h2>
              <div className={styles.spgInfoBox}>
                <div className={styles.spgHeader}>
                  <span className={styles.spgTag}>
                    {event.participation?.mode === "team" ? "TEAM EVENT" : "SOLO PARTICIPATION"}
                  </span>
                  {event.participation?.requires_event_spg && (
                    <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: "750" }}>
                      ✓ Auto-provisions temporary Event SPG
                    </span>
                  )}
                </div>
                <div className={styles.spgRuleList}>
                  <div className={styles.spgRuleItem}>
                    <span className={styles.ruleLabel}>Team Size Cap</span>
                    <span className={styles.ruleVal}>
                      {event.participation?.mode === "team"
                        ? `${event.participation.min_team_size ?? 1} - ${event.participation.max_team_size ?? 1} Members`
                        : "Solo (1 Member)"}
                    </span>
                  </div>
                  <div className={styles.spgRuleItem}>
                    <span className={styles.ruleLabel}>SPG Auto-Disband</span>
                    <span className={styles.ruleVal}>
                      {event.participation?.requires_event_spg
                        ? `${event.participation?.spg_auto_disband_days || 3} Days after event`
                        : "N/A"}
                    </span>
                  </div>
                  <div className={styles.spgRuleItem}>
                    <span className={styles.ruleLabel}>Access Scope</span>
                    <span className={styles.ruleVal}>
                      {event.eligibility?.access_scope === "invite_only" ? "Invite Only" :
                        event.eligibility?.access_scope === "members_only" ? "Members Only" : "Open to All Students"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Side Column: Invitations Column Beside Team Page */}
          <aside className={styles.invitesColumn} aria-label="Invitations to You">
            <div className={styles.invitesHeader}>
              <h3 className={styles.invitesTitle}>
                <MemberIcon name="mail" size={16} />
                <span>Invitations to You</span>
                {(myRegistration?.pending_invites?.length || 0) + myEventTeamInvites.length > 0 && (
                  <span className={styles.invitesBadge}>
                    {(myRegistration?.pending_invites?.length || 0) + myEventTeamInvites.length}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={handleManualRefreshInvites}
                disabled={refreshingInvites}
                className={styles.refreshInvitesBtn}
                title="Refresh incoming squad and event invitations"
              >
                <span className={refreshingInvites ? styles.spinningIcon : ""} style={{ display: "inline-flex" }}><MemberIcon name="refresh" size={13} /></span>
                <span>{refreshingInvites ? "Refreshing..." : "Refresh"}</span>
              </button>
            </div>

            {/* List incoming invites */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(myRegistration?.pending_invites || []).length > 0 &&
                (myRegistration?.pending_invites || []).map((inv) => (
                  <div key={inv.invite_id} className={styles.inviteItemCard}>
                    <div className={styles.inviteCardBadge}>Squad Merge Request</div>
                    <div className={styles.inviteTeamName}>
                      &quot;{inv.from_team_name}&quot;
                    </div>
                    <div className={styles.inviteSubtitle}>
                      From leader: <strong style={{ color: "#ffffff" }}>{inv.from_leader_name}</strong>
                    </div>
                    <div className={styles.inviteActionsRow}>
                      <button
                        type="button"
                        disabled={mergeBusyId === inv.invite_id}
                        onClick={() => handleAcceptMergeInvite(inv.invite_id)}
                        className={styles.inviteAcceptBtn}
                      >
                        {mergeBusyId === inv.invite_id ? "Merging..." : "Accept & Merge"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineMergeInvite(inv.invite_id)}
                        className={styles.inviteDeclineBtn}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}

              {myEventTeamInvites.length > 0 &&
                myEventTeamInvites.map((inv) => (
                  <div key={inv.id} className={styles.inviteItemCard}>
                    <div className={styles.inviteCardBadge}>Team Invitation</div>
                    <div className={styles.inviteTeamName}>
                      &quot;{inv.team_name || "Event Team"}&quot;
                    </div>
                    <div className={styles.inviteSubtitle}>
                      Invited by <strong style={{ color: "#ffffff" }}>{inv.inviter_name}</strong> ({inv.inviter_email || "Lead"})
                    </div>
                    <div className={styles.inviteActionsRow}>
                      <button
                        type="button"
                        disabled={invitationBusy}
                        onClick={() => handleAcceptInvite(inv.id)}
                        className={styles.inviteAcceptBtn}
                      >
                        {invitationBusy ? "Joining..." : "Accept & Join"}
                      </button>
                      <button
                        type="button"
                        disabled={invitationBusy}
                        onClick={() => handleDeclineInvite(inv.id)}
                        className={styles.inviteDeclineBtn}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}

              {(myRegistration?.pending_invites?.length || 0) + myEventTeamInvites.length === 0 && (
                <div className={styles.invitesEmptyState}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px", color: "#71717a" }}><MemberIcon name="inbox" size={32} /></div>
                  <div style={{ fontWeight: "750", color: "#ffffff", fontSize: "13px" }}>
                    No Pending Invitations
                  </div>
                  <p style={{ color: "#8c8c98", fontSize: "11.5px", margin: "4px 0 10px", lineHeight: "1.4" }}>
                    When team leads or peers invite you to merge, their invitations will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={handleManualRefreshInvites}
                    disabled={refreshingInvites}
                    className={styles.checkInvitesBtn}
                  >
                    Check Again
                  </button>
                </div>
              )}
            </div>

            {/* Quick Squad Code Box */}
            {myRegistration?.invite_code && (
              <div className={styles.quickCodeCard}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: "800", color: "#8c8c98" }}>
                  Your Squad Invite Code
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                  <code className={styles.quickCodeDisplay}>{myRegistration.invite_code}</code>
                  <button
                    type="button"
                    onClick={() => {
                      if (myRegistration?.invite_code) {
                        navigator.clipboard.writeText(myRegistration.invite_code);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }
                    }}
                    className={styles.quickCopyBtn}
                  >
                    {copiedCode ? <><MemberIcon name="check" size={12} /> Copied</> : <><MemberIcon name="copy" size={12} /> Copy</>}
                  </button>
                </div>
                <div style={{ fontSize: "10.5px", color: "#71717a", marginTop: "6px" }}>
                  Give this 6-character code to registered peers so they can join your squad directly.
                </div>
              </div>
            )}

            {/* Outgoing Invites Sent */}
            {outgoingTeamInvites.length > 0 && (
              <div className={styles.outgoingInvitesBox}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: "#8c8c98", textTransform: "uppercase", marginBottom: "8px" }}>
                  Sent by Your Squad ({outgoingTeamInvites.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {outgoingTeamInvites.map((out) => (
                    <div key={out.id} className={styles.outgoingItem}>
                      <span style={{ fontSize: "12px", color: "#e4e4e7" }}>{out.invitee_name}</span>
                      <span style={{ fontSize: "10px", color: "#E5B731", background: "rgba(229,183,49,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
{activeTab === "timeline" && (
        <section className={styles.sectionCard} aria-label="Event Timeline">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <h2 className={styles.sectionTitle}>
              <MemberIcon name="clock" size={18} />
              Event Milestone Schedule & Deadlines
            </h2>
          </div>
          <EventTimelineSection timeline={event.timeline || []} />
        </section>
      )}

      {/* TAB 3: REGISTERED ATTENDEES & SPGS */}
      {activeTab === "attendees" && (
        <section className={styles.sectionCard} aria-label="Registered Attendees">
          <EventAttendeesPanel eventId={event.id} token={token} />
        </section>
      )}

      {/* TAB 4: ADMIN ATTENDANCE MANAGEMENT */}
      {activeTab === "attendance" && isAdmin && (
        <section className={styles.sectionCard} aria-label="Attendance Console">
          <EventAttendancePanel
            eventId={event.id}
            token={token}
            attendancePoints={event.points_reward?.attendance_points ?? 0}
          />
        </section>
      )}

      {/* Dynamic RSVP Intake Modal */}
      <RsvpIntakeModal
        isOpen={showRsvpModal}
        onClose={() => setShowRsvpModal(false)}
        event={event}
        token={token}
        currentUserId={profile?.id || ""}
        initialTeamName={teamName}
        onSuccess={(res: any) => {
          setIsRegistered(true);
          setRegistrationStatus(res?.status || "registered");
          setMyRegistration(res?.registration || res);
          api.myEventRegistration(token, event.id).then((fresh) => {
            if (fresh.is_registered && fresh.registration) {
              setMyRegistration(fresh.registration);
            }
          });
          api.getEvent(event.id, token).then((refreshed) => {
            setRegisteredCount(refreshed.stats?.registered_count ?? registeredCount + 1);
          });
        }}
      />

      {/* Project Deliverables Submission Modal */}
      <ProjectSubmissionModal
        isOpen={showSubmissionModal}
        onClose={() => setShowSubmissionModal(false)}
        eventId={event.id}
        eventTitle={event.title}
        timeline={event.timeline}
        initialSubmission={myRegistration?.submission}
        submissionConfig={event.submission_config}
        teamCustomFields={(event.custom_registration_fields || []).filter((cf) => cf.applies_to === "team")}
        initialTeamResponses={myRegistration?.custom_responses || {}}
        token={token}
        onSuccess={(savedSubmission) => {
          setMyRegistration((prev) => (prev ? { ...prev, submission: savedSubmission } : prev));
        }}
      />

      {/* Attach Problem Statement Modal */}
      <AttachProblemModal
        isOpen={showAttachModal}
        onClose={() => setShowAttachModal(false)}
        token={token}
        currentIdeaId={
          (myRegistration as any)?.submission?.problem_statement_id ||
          (myRegistration as any)?.problem_statement_id ||
          (myRegistration as any)?.idea_id
        }
        onSelectIdea={(ideaId) => void handleAttachEventProblem(ideaId)}
        title="Select Event Problem Statement"
      />

      {/* Edit Registration Responses Modal */}
      <EditResponsesModal
        isOpen={showEditResponsesModal}
        onClose={() => setShowEditResponsesModal(false)}
        event={event}
        token={token}
        currentUserId={profile?.id || ""}
        initialTeamName={myRegistration?.team_name || ""}
        initialResponses={
          event.custom_registration_fields?.reduce((acc, cf) => {
            const val =
              cf.applies_to === "team"
                ? myRegistration?.custom_responses?.[cf.field_id]
                : myRegistration?.member_responses?.[profile?.id || ""]?.[cf.field_id] ??
                  myRegistration?.custom_responses?.[cf.field_id];
            if (val !== undefined && val !== null) {
              acc[cf.field_id] = val;
            }
            return acc;
          }, {} as Record<string, any>) || {}
        }
        onSuccess={(updatedUserResponses, updatedCustom, newTeamName) => {
          setMyRegistration((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              team_name: newTeamName !== undefined ? newTeamName : prev.team_name,
              custom_responses: { ...prev.custom_responses, ...(updatedCustom || {}) },
              member_responses: {
                ...prev.member_responses,
                [profile?.id || ""]: {
                  ...(prev.member_responses?.[profile?.id || ""] || {}),
                  ...updatedUserResponses,
                },
              },
            };
          });
          api.myEventRegistration(token, event.id).then((fresh) => {
            if (fresh.is_registered && fresh.registration) {
              setMyRegistration(fresh.registration);
            }
          });
        }}
      />

      {/* Cancel Registration Confirmation Modal with SPG Deletion Warning */}
      <CancelRegistrationModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancelRegistration}
        isTeamLead={myRegistration?.user_id === profile?.id}
        teamName={myRegistration?.team_name}
        hasSpg={Boolean(myRegistration?.spg_id)}
        eventTitle={event.title}
        loading={registrationBusy}
        error={registrationError}
      />

      {/* Lock Squad Roster & Form SPG Modal */}
      <LockRosterModal
        isOpen={showLockModal}
        onClose={() => setShowLockModal(false)}
        onConfirm={handleConfirmLockRoster}
        teamName={myRegistration?.team_name}
        squadSize={myRegistration?.member_uids?.length || 1}
        minTeamSize={minTeamSize}
        eventTitle={event.title}
        loading={lockingRoster}
        error={lockModalError}
      />

      {/* Team Invitation Modal */}
      <InviteTeammatesModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        token={token}
        type={myRegistration?.spg_id ? "event_spg" : "event_team"}
        targetId={event.id}
        targetName={event.title}
        teamName={myRegistration?.team_name}
        eventId={event.id}
        spgId={myRegistration?.spg_id || null}
        currentMemberUids={myRegistration?.member_uids || [myRegistration?.user_id || ""]}
        maxTeamSize={event.participation?.max_team_size || 4}
        onInviteSent={() => {
          api.myEventRegistration(token, event.id).then((fresh) => {
            if (fresh.is_registered && fresh.registration) {
              setMyRegistration(fresh.registration);
            }
          });
          api.listTargetInvitations(token, event.id, "pending").then((invs) => {
            setOutgoingTeamInvites(invs);
          }).catch(() => {});
        }}
      />
    </div>
  );
}
