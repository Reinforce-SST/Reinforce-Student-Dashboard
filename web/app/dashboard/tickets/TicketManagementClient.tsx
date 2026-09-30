"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import MemberIcon, { type IconName } from "@/components/dashboard/MemberIcon";
import PaginationBar from "@/components/dashboard/PaginationBar";
import LoadingBar from "@/components/dashboard/LoadingBar";
import { useMember } from "@/lib/useMember";
import { api, type ApiTicketDetail, type TicketSummary, type StudentProfile } from "@/lib/api";
import { loadAllSpgs } from "@/lib/memberData";
import type { SPGRecord } from "@/lib/spgData";
import styles from "./TicketManagement.module.css";

export type TicketCategory =
  | "spg_registration"
  | "resource_request"
  | "compute_resource_request"
  | "learning_resource_request"
  | "support"
  | "idea_jar"
  | "report"
  | "feedback"
  | "misc";

export interface TicketCreatePayload {
  category: TicketCategory;
  title: string;
  description?: string;
  fields: Record<string, unknown>;
  spg_id?: string;
}

export type TicketItem = {
  id: string;
  category: TicketCategory;
  categoryLabel: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
  author: string;
  spg_id?: string;
  thread_url?: string | null;
  fields: Record<string, unknown>;
};

type TicketTypeOption = {
  id: TicketCategory;
  title: string;
  subtitle: string;
  description: string;
  icon: IconName;
  iconClass: string;
  badgeClass: string;
  tabActiveClass: string;
};

const ticketTypeOptions: TicketTypeOption[] = [
  {
    id: "spg_registration",
    title: "SPG Registration / Modification",
    subtitle: "Register team, track & milestones",
    description: "Submit a charter for a new Research, Product, or Kaggle cluster",
    icon: "rocket",
    iconClass: styles.iconSpg,
    badgeClass: styles.catSpg,
    tabActiveClass: styles.modalCatTabActiveSpg,
  },
  {
    id: "resource_request",
    title: "Resource Request",
    subtitle: "GPU, Compute, Cloud & Mentorship",
    description: "Request GPU clusters, cloud credits, or specialized hardware",
    icon: "lightning",
    iconClass: styles.iconResource,
    badgeClass: styles.catResource,
    tabActiveClass: styles.modalCatTabActiveResource,
  },
  {
    id: "support",
    title: "Support & Inquiries",
    subtitle: "Questions, discord & verification",
    description: "Assistance regarding club activities, events, tracks, or guidance",
    icon: "message",
    iconClass: styles.iconSupport,
    badgeClass: styles.catSupport,
    tabActiveClass: styles.modalCatTabActiveSupport,
  },
  {
    id: "idea_jar",
    title: "Idea Jar Proposal",
    subtitle: "Structured project ideas & roadmaps",
    description: "Submit project proposals with difficulty, prerequisites, roadmap and learning outcomes",
    icon: "ideas",
    iconClass: styles.iconIdea,
    badgeClass: styles.catIdea,
    tabActiveClass: styles.modalCatTabActiveIdea,
  },
  {
    id: "feedback",
    title: "Suggestions & Feedback",
    subtitle: "General suggestions & club feedback",
    description: "Propose club improvements, events, workshop topics, or general feedback",
    icon: "message",
    iconClass: styles.iconFeedback,
    badgeClass: styles.catFeedback,
    tabActiveClass: styles.modalCatTabActiveFeedback,
  },
  {
    id: "report",
    title: "Report Issue / Misconduct",
    subtitle: "Confidential dispute & conduct report",
    description: "Confidential report for server/club misconduct or disputes",
    icon: "shield",
    iconClass: styles.iconReport,
    badgeClass: styles.catReport,
    tabActiveClass: styles.modalCatTabActiveReport,
  },
];

function formatTicketDate(value?: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function toTicketItem(summary: TicketSummary, detail?: ApiTicketDetail): TicketItem {
  const category = summary.category;
  return {
    id: summary.id,
    category,
    categoryLabel: ticketTypeOptions.find((option) => option.id === category)?.title ?? category.replaceAll("_", " "),
    title: summary.title,
    description: detail?.description || "No description provided.",
    priority: detail?.priority || summary.priority || "medium",
    status: summary.status,
    createdAt: formatTicketDate(summary.created_at),
    updatedAt: formatTicketDate(summary.updated_at),
    author: "You",
    spg_id: detail?.spg_id || summary.spg_id || undefined,
    thread_url: detail?.discord_meta?.thread_url || summary.thread_url,
    fields: detail?.fields || {},
  };
}

export default function TicketManagementClient() {
  const { token, profile } = useMember();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketError, setTicketError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, searchQuery]);

  useEffect(() => {
    let active = true;
    api.myTickets(token)
      .then((items) => {
        if (!active) return;
        setTickets(items.map((item) => toTicketItem(item)));
        setSelectedTicketId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || "");
        setTicketError("");
      })
      .catch(() => {
        if (!active) return;
        setTickets([]);
        setTicketError("Your tickets could not be loaded. Try again.");
      })
      .finally(() => { if (active) setLoadingTickets(false); });
    return () => { active = false; };
  }, [token, retryCount]);

  useEffect(() => {
    if (!selectedTicketId) return;
    let active = true;
    api.ticketDetail(token, selectedTicketId)
      .then((detail) => {
        if (active) setTickets((items) => items.map((item) => item.id === detail.id ? toTicketItem(detail, detail) : item));
      })
      .catch(() => { if (active) setTicketError("Ticket details could not be loaded."); });
    return () => { active = false; };
  }, [token, selectedTicketId]);

  const isModalOpen =
    searchParams.get("create") === "true" ||
    searchParams.has("category") ||
    searchParams.has("type") ||
    searchParams.has("new");

  const urlCategoryParam = (searchParams.get("category") ||
    searchParams.get("type") ||
    searchParams.get("create")) as TicketCategory | null;

  const validCategories: TicketCategory[] = [
    "spg_registration",
    "resource_request",
    "support",
    "idea_jar",
    "feedback",
    "report",
  ];

  const currentCategory: TicketCategory =
    urlCategoryParam && validCategories.includes(urlCategoryParam)
      ? urlCategoryParam
      : "spg_registration";

  const selectedCategory = currentCategory;

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSpgId, setFormSpgId] = useState("");
  const [memberSpgs, setMemberSpgs] = useState<SPGRecord[]>([]);
  const [memberSpgsLoading, setMemberSpgsLoading] = useState(true);
  const [memberSpgsError, setMemberSpgsError] = useState("");

  const [spgTrack, setSpgTrack] = useState<"research" | "product" | "kaggle" | "general">("research");
  const [spgLeader, setSpgLeader] = useState<StudentProfile | null>(null);
  const [isChangingLeader, setIsChangingLeader] = useState(false);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [leaderCandidates, setLeaderCandidates] = useState<StudentProfile[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [leaderSearchError, setLeaderSearchError] = useState("");

  const [selectedTeamMembers, setSelectedTeamMembers] = useState<Record<string, StudentProfile>>({});
  const [memberSearch, setMemberSearch] = useState("");
  const [memberCandidates, setMemberCandidates] = useState<StudentProfile[]>([]);
  const [memberCandidatesLoading, setMemberCandidatesLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState("");
  const [manualMemberInput, setManualMemberInput] = useState("");
  const [manualMemberLoading, setManualMemberLoading] = useState(false);
  const [manualMemberError, setManualMemberError] = useState("");

  const [spgDurationDays, setSpgDurationDays] = useState<number | "">("");
  const [spgFrequencyDays, setSpgFrequencyDays] = useState<number | "">("");
  const [spgGoals, setSpgGoals] = useState("");

  const [resSpgName, setResSpgName] = useState("");
  const [resRequested, setResRequested] = useState("");
  const [resProgressProof, setResProgressProof] = useState("");
  const [resJustification, setResJustification] = useState("");

  const [supportSubject, setSupportSubject] = useState("");
  const [supportDetails, setSupportDetails] = useState("");
  const [discordHandle, setDiscordHandle] = useState("");

  const [ideaTrack, setIdeaTrack] = useState<"research" | "product" | "kaggle" | "general">("product");
  const [ideaDifficulty, setIdeaDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [ideaOverview, setIdeaOverview] = useState("");
  const [ideaPrerequisites, setIdeaPrerequisites] = useState<string[]>([]);
  const [newPrereq, setNewPrereq] = useState("");
  const [ideaRoadmap, setIdeaRoadmap] = useState<string[]>([]);
  const [newRoadmapStep, setNewRoadmapStep] = useState("");
  const [ideaLearningOutcomes, setIdeaLearningOutcomes] = useState<string[]>([]);
  const [newOutcome, setNewOutcome] = useState("");

  const [feedbackTopic, setFeedbackTopic] = useState("");
  const [feedbackComments, setFeedbackComments] = useState("");

  const [partiesInvolved, setPartiesInvolved] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!isModalOpen || selectedCategory !== "resource_request") return;
    let active = true;
    setMemberSpgsLoading(true);
    loadAllSpgs(token)
      .then((groups) => {
        if (!active) return;
        const memberId = profile.id;
        const ownedGroups = memberId ? groups.filter((group) => group.lead_id === memberId || group.member_ids.includes(memberId)) : [];
        setMemberSpgs(ownedGroups);
        setFormSpgId((current) => ownedGroups.some((group) => group.id === current) ? current : "");
        setMemberSpgsError("");
      })
      .catch(() => {
        if (!active) return;
        setMemberSpgs([]);
        setFormSpgId("");
        setMemberSpgsError("Project groups could not be loaded. Enter the SPG name below, or try again later.");
      })
      .finally(() => { if (active) setMemberSpgsLoading(false); });
    return () => { active = false; };
  }, [isModalOpen, selectedCategory, token, profile.id]);

  // Set default team leader to current user once profile is ready
  useEffect(() => {
    if (profile?.id && !spgLeader) {
      setSpgLeader(profile);
    }
  }, [profile, spgLeader]);

  // Leader candidate search (strictly club members)
  useEffect(() => {
    if (!isModalOpen || selectedCategory !== "spg_registration" || !isChangingLeader || !token) return;
    let active = true;
    setLeaderLoading(true);
    setLeaderSearchError("");
    const timer = setTimeout(() => {
      api.browseUsers(token, {
        search: leaderSearch.trim() || undefined,
        is_member: true,
        page_size: 50,
      })
        .then((res) => {
          if (active) {
            setLeaderCandidates(res.items || []);
            setLeaderLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setLeaderCandidates([]);
            setLeaderSearchError(error instanceof Error ? error.message : "Could not search club members.");
            setLeaderLoading(false);
          }
        });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [isModalOpen, selectedCategory, isChangingLeader, leaderSearch, token]);

  // Team member candidate search
  useEffect(() => {
    if (!isModalOpen || selectedCategory !== "spg_registration" || !token) return;
    let active = true;
    setMemberCandidatesLoading(true);
    setMemberSearchError("");
    const timer = setTimeout(() => {
      api.browseUsers(token, {
        search: memberSearch.trim() || undefined,
        page_size: 50,
      })
        .then((res) => {
          if (active) {
            setMemberCandidates(res.items || []);
            setMemberCandidatesLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setMemberCandidates([]);
            setMemberSearchError(error instanceof Error ? error.message : "Could not search members.");
            setMemberCandidatesLoading(false);
          }
        });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [isModalOpen, selectedCategory, memberSearch, token]);

  const selectSpgLeader = (member: StudentProfile) => {
    setSpgLeader(member);
    setSelectedTeamMembers((current) => {
      const next = { ...current };
      delete next[member.id];
      return next;
    });
    setIsChangingLeader(false);
    setLeaderSearch("");
    setSubmitError("");
  };

  const handleToggleMember = (m: StudentProfile) => {
    const uid = m.id;
    if (!uid) return;
    if (spgLeader?.id === uid) {
      setSubmitError("The designated team leader cannot also be added as a team member.");
      return;
    }
    if (!selectedTeamMembers[uid] && Object.keys(selectedTeamMembers).length >= 6) {
      setSubmitError("An SPG can have at most 6 team members.");
      return;
    }
    setSubmitError("");
    setSelectedTeamMembers((prev) => {
      const next = { ...prev };
      if (next[uid]) {
        delete next[uid];
      } else {
        next[uid] = m;
      }
      return next;
    });
  };

  const handleRemoveMember = (uid: string) => {
    setSelectedTeamMembers((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleAddManualMember = async () => {
    if (!manualMemberInput.trim() || !token) return;
    setManualMemberLoading(true);
    setManualMemberError("");
    try {
      const res = await api.getUserProfile(token, manualMemberInput.trim());
      const uid = res.id;
      if (!uid || uid.includes("@")) throw new Error("Could not resolve a canonical member UID.");
      if (spgLeader?.id === uid) {
        throw new Error("This user is already designated as the team leader.");
      }
      if (Object.keys(selectedTeamMembers).length >= 6 && !selectedTeamMembers[uid]) {
        throw new Error("Maximum 6 team members allowed.");
      }
      setSelectedTeamMembers((prev) => ({ ...prev, [uid]: res }));
      setManualMemberInput("");
    } catch (err) {
      setManualMemberError(err instanceof Error ? err.message : "Member not found.");
    } finally {
      setManualMemberLoading(false);
    }
  };

  const handleAddPrereq = () => {
    const raw = newPrereq.trim();
    if (!raw) return;
    const lines = raw.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•0-9.]+\s*/, "")).filter(Boolean);
    setIdeaPrerequisites((prev) => {
      const next = [...prev];
      for (const line of lines) {
        if (!next.includes(line)) next.push(line);
      }
      return next;
    });
    setNewPrereq("");
  };

  const handleRemovePrereq = (index: number) => {
    setIdeaPrerequisites((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddRoadmapStep = () => {
    const raw = newRoadmapStep.trim();
    if (!raw) return;
    const lines = raw.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•0-9.]+\s*/, "")).filter(Boolean);
    setIdeaRoadmap((prev) => [...prev, ...lines]);
    setNewRoadmapStep("");
  };

  const handleRemoveRoadmapStep = (index: number) => {
    setIdeaRoadmap((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddOutcome = () => {
    const raw = newOutcome.trim();
    if (!raw) return;
    const lines = raw.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•0-9.]+\s*/, "")).filter(Boolean);
    setIdeaLearningOutcomes((prev) => {
      const next = [...prev];
      for (const line of lines) {
        if (!next.includes(line)) next.push(line);
      }
      return next;
    });
    setNewOutcome("");
  };

  const handleRemoveOutcome = (index: number) => {
    setIdeaLearningOutcomes((prev) => prev.filter((_, i) => i !== index));
  };

  const closeModal = () => {
    router.push(pathname, { scroll: false });
  };

  const openModalWithCategory = (cat: TicketCategory) => {
    router.push(`${pathname}?create=true&category=${cat}`, { scroll: false });
  };

  const handleSwitchModalCategory = (cat: TicketCategory) => {
    router.push(`${pathname}?create=true&category=${cat}`, { scroll: false });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        router.push(pathname, { scroll: false });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, router, pathname]);

  const buildTicketCreatePayload = (): TicketCreatePayload => {
    let fieldsObj: Record<string, unknown> = {};

    if (selectedCategory === "spg_registration") {
      const leaderUid = spgLeader?.id || profile.id || "";
      const memberUids = Object.keys(selectedTeamMembers).filter((id) => id !== leaderUid);
      const trackLabel = spgTrack === "research" ? "Research Track" : spgTrack === "product" ? "Product Track" : spgTrack === "kaggle" ? "Kaggle Track" : "General Track";
      const leaderName = spgLeader?.full_name || profile.full_name || "Member";

      fieldsObj = {
        "Project Name": formTitle.trim() || "Untitled Project",
        "Track": trackLabel,
        "track": spgTrack,
        "Team Leader UID": leaderUid,
        "leader_uid": leaderUid,
        "Team Leader": `${leaderName} (${leaderUid})`,
        "Team Member UIDs": memberUids,
        "member_uids": memberUids,
        "Team Members": memberUids.length > 0
          ? memberUids.map((id) => selectedTeamMembers[id]?.full_name ? `${selectedTeamMembers[id].full_name} (${id})` : id).join(", ")
          : "None",
        "Duration (Days)": Number(spgDurationDays),
        "duration_days": Number(spgDurationDays),
        "Report Frequency (Days)": Number(spgFrequencyDays),
        "frequency_days": Number(spgFrequencyDays),
        "Summary & Goals": spgGoals.trim(),
        "Project Name & Track": `${formTitle.trim() || "Untitled Project"} (${trackLabel})`,
      };
    } else if (selectedCategory === "resource_request") {
      fieldsObj = {
        "SPG Name": resSpgName,
        "Resources Requested": resRequested,
        "Progress Proof": resProgressProof,
        "Justification": resJustification,
      };
    } else if (selectedCategory === "support") {
      fieldsObj = {
        Subject: supportSubject || formTitle,
        Details: supportDetails,
        "Discord Handle": discordHandle,
      };
    } else if (selectedCategory === "idea_jar") {
      const difficultyLabel = ideaDifficulty === "beginner" ? "Beginner" : ideaDifficulty === "advanced" ? "Advanced" : "Intermediate";
      fieldsObj = {
        "Idea Title": formTitle || "Untitled Idea",
        Track: `${ideaTrack.toUpperCase()} Track`,
        track: ideaTrack,
        Difficulty: difficultyLabel,
        difficulty: ideaDifficulty,
        Overview: ideaOverview,
        Prerequisites: ideaPrerequisites.length > 0 ? ideaPrerequisites.map((p) => `• ${p}`).join("\n") : "None specified",
        "Rough Roadmap": ideaRoadmap.length > 0 ? ideaRoadmap.map((r, i) => `${i + 1}. ${r}`).join("\n") : "None specified",
        "Learning Outcomes": ideaLearningOutcomes.length > 0 ? ideaLearningOutcomes.map((o) => `• ${o}`).join("\n") : "None specified",
        prerequisites: ideaPrerequisites,
        rough_roadmap: ideaRoadmap,
        learning_outcomes: ideaLearningOutcomes,
      };
    } else if (selectedCategory === "feedback") {
      fieldsObj = {
        "Feedback Topic": feedbackTopic.trim() || formTitle.trim() || "General Feedback",
        "Feedback Details": feedbackComments.trim() || formDescription.trim(),
      };
    } else if (selectedCategory === "report") {
      fieldsObj = {
        ...(partiesInvolved.trim() ? { "Parties Involved": partiesInvolved.trim() } : {}),
        "Is Confidential": true,
      };
    }

    const payload: TicketCreatePayload = {
      category: selectedCategory,
      title: formTitle.trim() || "Untitled Ticket",
      description: formDescription.trim() ? formDescription.trim() : undefined,
      fields: fieldsObj,
    };

    if (selectedCategory === "resource_request") {
      if (formSpgId.trim() && memberSpgs.some((group) => group.id === formSpgId)) {
        payload.spg_id = formSpgId.trim();
      }
    }

    return payload;
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setSubmitError("Please enter a ticket title.");
      return;
    }

    if (selectedCategory === "spg_registration") {
      if (!spgLeader?.id) {
        setSubmitError("Team leader is mandatory.");
        return;
      }
      if (!spgLeader.is_member) {
        setSubmitError(`The team leader (${spgLeader.full_name || spgLeader.id}) needs active club membership. Choose an active member or ask a club admin to update their membership.`);
        return;
      }
      if (spgDurationDays === "" || !Number.isInteger(spgDurationDays) || spgDurationDays <= 0 || spgDurationDays > 730) {
        setSubmitError("Please enter a valid estimated duration in days (e.g. 60).");
        return;
      }
      if (spgFrequencyDays === "" || !Number.isInteger(spgFrequencyDays) || spgFrequencyDays <= 0 || spgFrequencyDays > 180) {
        setSubmitError("Please enter a valid reporting frequency in days (e.g. 14).");
        return;
      }
      if (Object.keys(selectedTeamMembers).length > 6) {
        setSubmitError("An SPG may have at most 6 team members.");
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const payload = buildTicketCreatePayload();
      const created = await api.createTicket(token, payload);
      if (created.category !== "report") {
        setTickets((items) => [toTicketItem(created, created), ...items]);
        setSelectedTicketId(created.id);
      }
      setFormTitle("");
      setFormDescription("");
      setFormSpgId("");
      setResSpgName("");
      setSpgDurationDays("");
      setSpgFrequencyDays("");
      setSpgGoals("");
      setSelectedTeamMembers({});
      setSpgLeader(profile);
      setIsChangingLeader(false);
      setIdeaOverview("");
      setIdeaPrerequisites([]);
      setNewPrereq("");
      setIdeaRoadmap([]);
      setNewRoadmapStep("");
      setIdeaLearningOutcomes([]);
      setNewOutcome("");
      setFeedbackTopic("");
      setFeedbackComments("");
      setPartiesInvolved("");
      closeModal();
      setSuccessMessage(created.category === "report" ? "Confidential report submitted to the club team." : `Ticket created successfully (${created.id})!`);
      setTimeout(() => setSuccessMessage(""), 4500);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Ticket could not be created. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = filterStatus === "all" || t.status === filterStatus;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const paginatedTickets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, page, pageSize]);

  const getCategoryBadgeClass = (category: TicketCategory) => {
    const opt = ticketTypeOptions.find((t) => t.id === category);
    return opt?.badgeClass || styles.catSupport;
  };

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];
  const activeCategoryOption = ticketTypeOptions.find((t) => t.id === selectedCategory)!;

  return (
    <div className={styles.pageContainer}>
      {/* Header & Controls */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>TICKET SYSTEM & DISPATCH</h1>
          <p className={styles.pageSubtitle}>
            Submit and track member requests, compute allocations, project charters, and support inquiries.
          </p>
        </div>

        <div className={styles.headerActions}>
          {successMessage && (
            <div
              style={{
                background: "rgba(74, 222, 128, 0.15)",
                border: "1px solid rgba(74, 222, 128, 0.3)",
                color: "#4ade80",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: "750",
              }}
            >
              ✓ {successMessage}
            </div>
          )}

          <button
            type="button"
            className={styles.newTicketBtn}
            onClick={() => openModalWithCategory("spg_registration")}
          >
            <MemberIcon name="plus" size={16} />
            New Ticket
          </button>
        </div>
      </div>

      {ticketError && (
        <p role="alert">
          {ticketError} <button type="button" onClick={() => { setLoadingTickets(true); setRetryCount((count) => count + 1); }}>Retry</button>
        </p>
      )}

      {/* Quick Category Dispatch Bar */}
      <section className={styles.categoryBarSection} aria-label="Dispatch by category">
        <span className={styles.sectionLabel}>Quick Dispatch by Category</span>
        <div className={styles.categoryGrid}>
          {ticketTypeOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={styles.categoryCardBtn}
              onClick={() => openModalWithCategory(opt.id)}
            >
              <div className={`${styles.catIconCircle} ${opt.iconClass}`}>
                <MemberIcon name={opt.icon} size={18} />
              </div>
              <div className={styles.catCardText}>
                <span className={styles.catCardTitle}>{opt.title.split(" / ")[0]}</span>
                <span className={styles.catCardSub}>{opt.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Top Metrics Row */}
      <section className={styles.statsGrid} aria-label="Ticket System Overview Metrics">
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Open Tickets</span>
          <span className={`${styles.statValue} ${styles.statOpen}`}>
            {tickets.filter((t) => t.status === "open").length.toString().padStart(2, "0")}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>In Progress</span>
          <span className={`${styles.statValue} ${styles.statProgress}`}>
            {tickets.filter((t) => t.status === "in_progress").length.toString().padStart(2, "0")}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Resolved</span>
          <span className={`${styles.statValue} ${styles.statResolved}`}>
            {tickets.filter((t) => t.status === "resolved").length.toString().padStart(2, "0")}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Tickets</span>
          <span className={styles.statValue}>{tickets.length.toString().padStart(2, "0")}</span>
        </div>
      </section>

      {/* Main 2-Column Interface: Queue List on Left + Selected Ticket Detail on Right */}
      <div className={styles.mainLayout}>
        {/* Left Column: Tickets Queue List */}
        <section className={styles.queueColumn} aria-label="Your Tickets Queue">
          <div className={styles.queueControls}>
            <div className={styles.filterPills} role="tablist">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "open", label: "Open" },
                  { id: "in_progress", label: "In Progress" },
                  { id: "resolved", label: "Resolved" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`${styles.filterPillBtn} ${
                    filterStatus === tab.id ? styles.filterPillActive : ""
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>
                <MemberIcon name="search" size={14} />
              </span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search your tickets"
              />
            </div>
          </div>

          <LoadingBar loading={loadingTickets} />
          <div className={styles.ticketsList}>
            {paginatedTickets.map((ticket) => (
              <article
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className={`${styles.ticketCard} ${
                  selectedTicketId === ticket.id ? styles.ticketCardSelected : ""
                }`}
              >
                <div className={styles.ticketTopRow}>
                  <div className={styles.categoryGroup}>
                    <span
                      className={`${styles.categoryTag} ${getCategoryBadgeClass(ticket.category)}`}
                    >
                      {ticket.categoryLabel}
                    </span>
                    <span className={styles.ticketId}>{ticket.id}</span>
                  </div>

                  <span className={`${styles.priorityTag} ${styles.prioMedium}`}>
                    {ticket.priority.toUpperCase()}
                  </span>
                </div>

                <h2 className={styles.ticketTitle}>{ticket.title}</h2>
                <p className={styles.ticketDesc}>{ticket.description}</p>

                <div className={styles.ticketFooter}>
                  <span className={styles.statusIndicator}>
                    <span
                      className={`${styles.statusDot} ${
                        ticket.status === "open"
                          ? styles.dotOpen
                          : ticket.status === "in_progress"
                          ? styles.dotInProgress
                          : styles.dotResolved
                      }`}
                    />
                    {ticket.status === "open"
                      ? "Pending Review"
                      : ticket.status === "in_progress"
                      ? "In Progress"
                      : "Resolved"}
                  </span>
                  <span>{ticket.updatedAt}</span>
                </div>
              </article>
            ))}

            {filteredTickets.length === 0 && (
              <div
                style={{
                  background: "#141416",
                  border: "1px dashed #232328",
                  borderRadius: "14px",
                  padding: "36px 20px",
                  textAlign: "center",
                  color: "#7e7e88",
                  fontSize: "0.82rem",
                }}
              >
                {loadingTickets ? "Loading your tickets…" : "No tickets matching your filter criteria."}
              </div>
            )}

            {!loadingTickets && filteredTickets.length > 0 && (
              <PaginationBar
                currentPage={page}
                totalItems={filteredTickets.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
                pageSizeOptions={[10, 20, 50]}
                itemLabel="tickets"
                disabled={loadingTickets}
              />
            )}
          </div>
        </section>

        {/* Right Column: Selected Ticket Full Detail Inspector */}
        <section className={styles.detailPanel} aria-label="Ticket Inspection View">
          {selectedTicket ? (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.detailTopMeta}>
                  <div className={styles.categoryGroup}>
                    <span
                      className={`${styles.categoryTag} ${getCategoryBadgeClass(
                        selectedTicket.category
                      )}`}
                    >
                      {selectedTicket.categoryLabel}
                    </span>
                    <span className={styles.ticketId}>{selectedTicket.id}</span>
                    {selectedTicket.spg_id && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontFamily: "var(--font-mono, monospace)",
                          background: "#1c1c22",
                          border: "1px solid #282832",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          color: "#9da3ae",
                        }}
                      >
                        Project Group: {selectedTicket.spg_id}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className={`${styles.priorityTag} ${styles.prioMedium}`}>
                      PRIORITY: {selectedTicket.priority.toUpperCase()}
                    </span>
                    <span className={styles.statusIndicator}>
                      <span
                        className={`${styles.statusDot} ${
                          selectedTicket.status === "open"
                            ? styles.dotOpen
                            : selectedTicket.status === "in_progress"
                            ? styles.dotInProgress
                            : styles.dotResolved
                        }`}
                      />
                      {selectedTicket.status === "open"
                        ? "Open"
                        : selectedTicket.status === "in_progress"
                        ? "In Progress"
                        : "Resolved"}
                    </span>
                  </div>
                </div>

                <h2 className={styles.detailTitle}>{selectedTicket.title}</h2>
              </div>

              <div className={styles.detailSection}>
                <span className={styles.sectionLabel}>Ticket Description</span>
                <p className={styles.detailDesc}>{selectedTicket.description}</p>
              </div>

              {selectedTicket.fields && Object.keys(selectedTicket.fields).length > 0 && (
                <div className={styles.detailSection}>
                  <span className={styles.sectionLabel}>
                    Ticket Details & Specifications
                  </span>
                  <div className={styles.fieldsTable}>
                    {Object.entries(selectedTicket.fields)
                      .filter(([key, val]) => {
                        if (!val) return false;
                        if (key === "Incident Summary" && val === selectedTicket.title) return false;
                        if (key === "Report Details" && val === selectedTicket.description) return false;
                        return true;
                      })
                      .map(([key, value]) => (
                        <div key={key} className={styles.fieldRow}>
                          <span className={styles.fieldKey}>{key}:</span>
                          <span className={styles.fieldVal}>{String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {selectedTicket.thread_url && <div className={styles.discordBridgeBanner}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MemberIcon name="message" size={16} />
                  <span>Discord ticket thread</span>
                </div>
                <a href={selectedTicket.thread_url} target="_blank" rel="noopener noreferrer">Open thread</a>
              </div>}
            </>
          ) : (
            <div style={{ color: "#787884", textAlign: "center", padding: "40px" }}>
              Select a ticket from the queue to inspect details.
            </div>
          )}
        </section>
      </div>

      {/* ==========================================================================
          POPUP MODAL FORM
          ========================================================================== */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-ticket-title"
        >
          <div className={styles.modalContainer}>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={closeModal}
              aria-label="Close ticket form"
            >
              ✕
            </button>

            <div className={styles.modalHeader}>
              <h2 id="modal-ticket-title" className={styles.modalTitle}>
                <MemberIcon name={activeCategoryOption.icon} size={22} />
                Create Ticket · {activeCategoryOption.title.split(" / ")[0]}
              </h2>
              <p className={styles.modalSubtitle}>
                Fill in the details below to submit your request to the club leads.
              </p>
            </div>

            {/* Category Switcher Tabs inside Modal */}
            <div
              className={styles.modalCatSwitcher}
              role="tablist"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              {ticketTypeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === opt.id}
                  onClick={() => handleSwitchModalCategory(opt.id)}
                  className={`${styles.modalCatTab} ${
                    selectedCategory === opt.id
                      ? `${styles.modalCatTabActive} ${opt.tabActiveClass}`
                      : ""
                  }`}
                >
                  <MemberIcon name={opt.icon} size={14} />
                  <span>{opt.title.split(" / ")[0]}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleCreateTicket} className={styles.fieldsStack}>
              {/* Field: Title */}
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.inputLabel} htmlFor="ticket-modal-title">
                    {selectedCategory === "report" ? "Incident Summary / Title" : "Title"}
                  </label>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "#6a6a75",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {formTitle.length}/200
                  </span>
                </div>
                <input
                  id="ticket-modal-title"
                  type="text"
                  required
                  maxLength={200}
                  className={styles.textInput}
                  placeholder={
                    selectedCategory === "spg_registration"
                      ? "e.g., SPG Charter: Vision-Language Grounding"
                      : selectedCategory === "resource_request"
                      ? "e.g., Request for 4x A100 GPU Cluster Allocation"
                      : selectedCategory === "report"
                      ? "e.g., Incident Summary: Harassment or Code of Conduct concern"
                      : selectedCategory === "idea_jar"
                      ? "e.g., Decentralized GPU pooling platform"
                      : selectedCategory === "feedback"
                      ? "e.g., Suggestion for weekly paper reading groups"
                      : "e.g., Summary of request or inquiry"
                  }
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* Field: Description */}
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.inputLabel} htmlFor="ticket-modal-desc">
                    {selectedCategory === "report" ? "Detailed Incident Report" : "Description"}
                  </label>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "#6a6a75",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {formDescription.length}/2000
                  </span>
                </div>
                <textarea
                  id="ticket-modal-desc"
                  maxLength={2000}
                  className={styles.textareaInput}
                  placeholder={
                    selectedCategory === "report"
                      ? "Provide all relevant details, timeline, context, and impact. This report is strictly confidential and visible only to club executive leads."
                      : "Detailed context and rationale for this ticket."
                  }
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Category-Specific Form Fields */}
              {selectedCategory === "spg_registration" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-spg-track">
                      Track
                    </label>
                    <select
                      id="modal-spg-track"
                      className={styles.selectInput}
                      value={spgTrack}
                      onChange={(e) => setSpgTrack(e.target.value as typeof spgTrack)}
                    >
                      <option value="research">Research Track</option>
                      <option value="product">Product Track</option>
                      <option value="kaggle">Kaggle Track</option>
                      <option value="general">General Track</option>
                    </select>
                  </div>

                  {/* Team Leader Section */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className={styles.inputLabel} style={{ marginBottom: 0 }}>
                        Team Leader <span style={{ color: "#e5b731" }}>*</span>
                      </label>
                      <span style={{ fontSize: "11px", color: "#8e8e93" }}>
                        Mandatory (Club Member)
                      </span>
                    </div>

                    {/* Selected Leader Display Card */}
                    {spgLeader && !isChangingLeader && (
                      <div className={`${styles.leaderCard} ${!spgLeader.is_member ? styles.leaderCardWarning : ""}`}>
                        <div className={styles.leaderInfo}>
                          <div className={styles.leaderAvatar}>
                            {spgLeader.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={spgLeader.avatar_url} alt={spgLeader.full_name} className={styles.leaderAvatarImg} />
                            ) : (
                              spgLeader.full_name?.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "LD"
                            )}
                          </div>
                          <div className={styles.leaderMeta}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span className={styles.leaderName}>{spgLeader.full_name || "Unknown"}</span>
                              {spgLeader.id === profile.id && (
                                <span className={styles.candidateBadge} style={{ color: "#e5b731", background: "rgba(229, 183, 49, 0.15)" }}>You</span>
                              )}
                            </div>
                            <span className={styles.leaderEmail}>{spgLeader.email || spgLeader.id}</span>
                            <div className={styles.leaderBadges}>
                              {spgLeader.is_member ? (
                                <span className={`${styles.candidateBadge} ${styles.candidateBadgeMember}`}>✓ Club Member</span>
                              ) : (
                                <span className={`${styles.candidateBadge} ${styles.candidateBadgeAdmin}`}>Membership pending</span>
                              )}
                              {spgLeader.is_admin && <span className={`${styles.candidateBadge} ${styles.candidateBadgeAdmin}`}>Admin</span>}
                              {spgLeader.tier && spgLeader.tier !== "beginner" && <span className={styles.candidateBadge}>{spgLeader.tier}</span>}
                            </div>
                          </div>
                        </div>

                        <div className={styles.leaderActionBtns}>
                          {spgLeader.id !== profile.id && (
                            <button
                              type="button"
                              onClick={() => selectSpgLeader(profile)}
                              className={styles.leaderResetBtn}
                              title="Reset to myself"
                            >
                              Reset to Me
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsChangingLeader(true)}
                            className={styles.leaderChangeBtn}
                          >
                            Change Leader
                          </button>
                        </div>
                      </div>
                    )}

                    {!spgLeader?.is_member && spgLeader && (
                      <div className={styles.nonMemberWarning}>
                        <MemberIcon name="alert-circle" size={14} />
                        <span>The leader needs active club membership. Choose an active member or <Link href="/dashboard/tickets?category=support">request activation through a support ticket</Link>.</span>
                      </div>
                    )}

                    {/* Changing Leader Search Picker */}
                    {isChangingLeader && (
                      <div className={styles.recipientSearchContainer}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff" }}>
                            Search & Select New Team Leader
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsChangingLeader(false)}
                            style={{ background: "none", border: "none", color: "#8e8e93", cursor: "pointer", fontSize: "12px" }}
                          >
                            Cancel
                          </button>
                        </div>

                        <div className={styles.recipientSearchBox}>
                          <span className={styles.recipientSearchIcon}>
                            <MemberIcon name="search" size={14} />
                          </span>
                          <input
                            type="search"
                            aria-label="Search for a team leader"
                            value={leaderSearch}
                            onChange={(e) => setLeaderSearch(e.target.value)}
                            placeholder="Search club members by name or email..."
                            className={styles.recipientSearchInput}
                            autoFocus
                          />
                          {leaderSearch && (
                            <button
                              type="button"
                              onClick={() => setLeaderSearch("")}
                              className={styles.clearSearchBtn}
                              aria-label="Clear leader search"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className={styles.candidateListContainer}>
                          {leaderLoading ? (
                            <div className={styles.emptyCandidatesText}>Searching club members…</div>
                          ) : leaderSearchError ? (
                            <div className={styles.emptyCandidatesText} role="alert">{leaderSearchError}</div>
                          ) : leaderCandidates.length === 0 ? (
                            <div className={styles.emptyCandidatesText}>
                              {leaderSearch ? `No members found matching "${leaderSearch}".` : "No members found."}
                            </div>
                          ) : (
                            leaderCandidates.map((m) => {
                              const initials = m.full_name
                                ? m.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                                : "MB";
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => selectSpgLeader(m)}
                                  className={styles.candidateRow}
                                >
                                  <div className={styles.candidateAvatar}>
                                    {m.avatar_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={m.avatar_url} alt={m.full_name} className={styles.candidateAvatarImg} />
                                    ) : (
                                      initials
                                    )}
                                  </div>
                                  <div className={styles.candidateInfo}>
                                    <div className={styles.candidateNameRow}>
                                      <span className={styles.candidateName}>{m.full_name}</span>
                                      <div className={styles.candidateBadges}>
                                        {m.is_member && <span className={`${styles.candidateBadge} ${styles.candidateBadgeMember}`}>Member</span>}
                                        {m.is_admin && <span className={`${styles.candidateBadge} ${styles.candidateBadgeAdmin}`}>Admin</span>}
                                        {m.tier && m.tier !== "beginner" && <span className={styles.candidateBadge}>{m.tier}</span>}
                                      </div>
                                    </div>
                                    <span className={styles.candidateEmail}>{m.email || m.id}</span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Team Members Section */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className={styles.inputLabel} style={{ marginBottom: 0 }}>
                        Team Members (Optional, up to 6)
                      </label>
                      <span style={{ fontSize: "11px", color: Object.keys(selectedTeamMembers).length >= 6 ? "#e5b731" : "#8e8e93" }}>
                        {Object.keys(selectedTeamMembers).length} / 6 selected
                      </span>
                    </div>

                    <div className={styles.recipientSearchContainer}>
                      {/* Selected Chips */}
                      {Object.keys(selectedTeamMembers).length > 0 && (
                        <div className={styles.selectedChipsTray}>
                          {Object.values(selectedTeamMembers).map((m) => {
                            const initials = m.full_name
                              ? m.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                              : "MB";
                            return (
                              <div key={m.id} className={styles.recipientChip}>
                                <div className={styles.chipAvatar}>
                                  {m.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={m.avatar_url} alt={m.full_name} className={styles.chipAvatarImg} />
                                  ) : (
                                    initials
                                  )}
                                </div>
                                <span>{m.full_name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(m.id || "")}
                                  className={styles.chipRemoveBtn}
                                  aria-label={`Remove ${m.full_name}`}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Search Input */}
                      <div className={styles.recipientSearchBox}>
                        <span className={styles.recipientSearchIcon}>
                          <MemberIcon name="search" size={14} />
                        </span>
                        <input
                          type="search"
                          aria-label="Search for team members"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Search collaborators by name or email..."
                          className={styles.recipientSearchInput}
                        />
                        {memberSearch && (
                          <button
                            type="button"
                            onClick={() => setMemberSearch("")}
                            className={styles.clearSearchBtn}
                            aria-label="Clear member search"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Candidate List */}
                      <div className={styles.candidateListContainer}>
                        {memberCandidatesLoading ? (
                          <div className={styles.emptyCandidatesText}>Searching members…</div>
                        ) : memberSearchError ? (
                          <div className={styles.emptyCandidatesText} role="alert">{memberSearchError}</div>
                        ) : memberCandidates.length === 0 ? (
                          <div className={styles.emptyCandidatesText}>
                            {memberSearch ? `No members found matching "${memberSearch}".` : "No members found."}
                          </div>
                        ) : (
                          memberCandidates
                            .filter((m) => m.id !== spgLeader?.id)
                            .map((m) => {
                              const isSelected = Boolean(m.id && selectedTeamMembers[m.id]);
                              const initials = m.full_name
                                ? m.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
                                : "MB";
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  aria-label={`Select ${m.full_name}`}
                                  onClick={() => handleToggleMember(m)}
                                  className={`${styles.candidateRow} ${isSelected ? styles.candidateRowSelected : ""}`}
                                >
                                  <span className={styles.candidateCheckboxVisual} aria-hidden="true" />
                                  <div className={styles.candidateAvatar}>
                                    {m.avatar_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={m.avatar_url} alt={m.full_name} className={styles.candidateAvatarImg} />
                                    ) : (
                                      initials
                                    )}
                                  </div>
                                  <div className={styles.candidateInfo}>
                                    <div className={styles.candidateNameRow}>
                                      <span className={styles.candidateName}>{m.full_name}</span>
                                      <div className={styles.candidateBadges}>
                                        {m.is_member && <span className={`${styles.candidateBadge} ${styles.candidateBadgeMember}`}>Member</span>}
                                        {m.is_admin && <span className={`${styles.candidateBadge} ${styles.candidateBadgeAdmin}`}>Admin</span>}
                                        {m.tier && m.tier !== "beginner" && <span className={styles.candidateBadge}>{m.tier}</span>}
                                      </div>
                                    </div>
                                    <span className={styles.candidateEmail}>{m.email || m.id}</span>
                                  </div>
                                </button>
                              );
                            })
                        )}
                      </div>

                      {/* Manual Add by UID or Email */}
                      <div className={styles.manualAddBox}>
                        <span style={{ fontSize: "11px", color: "#8e8e93" }}>
                          Can&apos;t find a teammate? Add directly by email or Firebase UID:
                        </span>
                        <div className={styles.manualAddRow}>
                          <input
                            type="text"
                            value={manualMemberInput}
                            onChange={(e) => { setManualMemberInput(e.target.value); setManualMemberError(""); }}
                            placeholder="student@sst.scaler.com or UID"
                            className={styles.manualAddInput}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManualMember(); } }}
                          />
                          <button
                            type="button"
                            onClick={handleAddManualMember}
                            disabled={manualMemberLoading || !manualMemberInput.trim()}
                            className={styles.manualAddBtn}
                          >
                            {manualMemberLoading ? "Finding..." : "+ Add"}
                          </button>
                        </div>
                        {manualMemberError && <span style={{ color: "#ef4444", fontSize: "11px" }}>{manualMemberError}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Duration & Frequency (Separated Fields) */}
                  <div className={styles.fieldsRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-spg-duration">
                        Estimated Duration (Days) <span style={{ color: "#e5b731" }}>*</span>
                      </label>
                      <input
                        id="modal-spg-duration"
                        type="number"
                        min={1}
                        max={730}
                        step={1}
                        className={styles.textInput}
                        value={spgDurationDays}
                        onChange={(e) => setSpgDurationDays(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 60"
                        required
                      />
                      <span className={styles.fieldHelper}>Total expected run time in days.</span>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-spg-frequency">
                        Report Frequency (Days) <span style={{ color: "#e5b731" }}>*</span>
                      </label>
                      <input
                        id="modal-spg-frequency"
                        type="number"
                        min={1}
                        max={180}
                        step={1}
                        className={styles.textInput}
                        value={spgFrequencyDays}
                        onChange={(e) => setSpgFrequencyDays(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 14"
                        required
                      />
                      <span className={styles.fieldHelper}>Submit progress reports every N days.</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-spg-goals">
                      Summary & Goals
                    </label>
                    <input
                      id="modal-spg-goals"
                      type="text"
                      className={styles.textInput}
                      placeholder="Key milestones, target output, or repository link"
                      value={spgGoals}
                      onChange={(e) => setSpgGoals(e.target.value)}
                    />
                  </div>
                </>
              )}

              {selectedCategory === "resource_request" && (
                <>
                  <div className={styles.fieldsRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-res-spg-id">
                        Linked Project Group
                      </label>
                      <select
                        id="modal-res-spg-id"
                        className={styles.selectInput}
                        value={formSpgId}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          setFormSpgId(selectedId);
                          if (selectedId) setResSpgName(memberSpgs.find((group) => group.id === selectedId)?.name || "");
                        }}
                      >
                        <option value="">{memberSpgsLoading ? "Loading project groups…" : "Select a project group (optional)"}</option>
                        {memberSpgs.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                      {memberSpgsError && <p role="alert">{memberSpgsError}</p>}
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-res-spg-name">
                        SPG Name
                      </label>
                      <input
                        id="modal-res-spg-name"
                        type="text"
                        className={styles.textInput}
                        value={resSpgName}
                        onChange={(e) => {
                          setResSpgName(e.target.value);
                          if (formSpgId && memberSpgs.find((group) => group.id === formSpgId)?.name !== e.target.value) setFormSpgId("");
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-res-requested">
                      Resources Requested
                    </label>
                    <input
                      id="modal-res-requested"
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. 4x NVIDIA A100 (80GB SXM) Cluster (200 GPU Hours)"
                      value={resRequested}
                      onChange={(e) => setResRequested(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-res-proof">
                      Progress & Proof of Work
                    </label>
                    <input
                      id="modal-res-proof"
                      type="text"
                      className={styles.textInput}
                      placeholder="GitHub repo URL, baseline model results, or prototype link"
                      value={resProgressProof}
                      onChange={(e) => setResProgressProof(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-res-just">
                      Justification & Deliverables
                    </label>
                    <input
                      id="modal-res-just"
                      type="text"
                      className={styles.textInput}
                      placeholder="Target conference / deadline / benchmark justification"
                      value={resJustification}
                      onChange={(e) => setResJustification(e.target.value)}
                    />
                  </div>
                </>
              )}

              {selectedCategory === "support" && (
                <>
                  <div className={styles.fieldsRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-support-subject">
                        Subject
                      </label>
                      <input
                        id="modal-support-subject"
                        type="text"
                        className={styles.textInput}
                        value={supportSubject}
                        onChange={(e) => setSupportSubject(e.target.value)}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-discord-handle">
                        Discord Handle
                      </label>
                      <input
                        id="modal-discord-handle"
                        type="text"
                        className={styles.textInput}
                        value={discordHandle}
                        onChange={(e) => setDiscordHandle(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-support-details">
                      Details
                    </label>
                    <input
                      id="modal-support-details"
                      type="text"
                      className={styles.textInput}
                      value={supportDetails}
                      onChange={(e) => setSupportDetails(e.target.value)}
                    />
                  </div>
                </>
              )}

              {selectedCategory === "idea_jar" && (
                <>
                  <div className={styles.fieldsRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-idea-track">
                        Domain Track
                      </label>
                      <select
                        id="modal-idea-track"
                        className={styles.selectInput}
                        value={ideaTrack}
                        onChange={(e) => setIdeaTrack(e.target.value as typeof ideaTrack)}
                      >
                        <option value="research">Research Track</option>
                        <option value="product">Product Track</option>
                        <option value="kaggle">Kaggle Track</option>
                        <option value="general">General Club Idea</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-idea-difficulty">
                        Difficulty Level
                      </label>
                      <select
                        id="modal-idea-difficulty"
                        className={styles.selectInput}
                        value={ideaDifficulty}
                        onChange={(e) => setIdeaDifficulty(e.target.value as typeof ideaDifficulty)}
                      >
                        <option value="beginner">Beginner (Introductory / Foundational)</option>
                        <option value="intermediate">Intermediate (Standard SPG / Club)</option>
                        <option value="advanced">Advanced (Cutting-Edge / Specialized)</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-idea-overview">
                      Problem Statement / Concept Overview
                    </label>
                    <textarea
                      id="modal-idea-overview"
                      className={styles.textareaInput}
                      placeholder="Describe the problem, proposed solution or concept, and why it matters"
                      value={ideaOverview}
                      onChange={(e) => setIdeaOverview(e.target.value)}
                    />
                  </div>

                  {/* Field: Prerequisites List Builder */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className={styles.inputLabel} htmlFor="modal-idea-new-prereq">
                        Prerequisites (Required skills, tools, or knowledge)
                      </label>
                      <span style={{ fontSize: "11px", color: ideaPrerequisites.length > 0 ? "#e5b731" : "#8e8e93" }}>
                        {ideaPrerequisites.length} added
                      </span>
                    </div>
                    <div className={styles.itemAddRow}>
                      <input
                        id="modal-idea-new-prereq"
                        type="text"
                        className={styles.textInput}
                        placeholder="e.g. PyTorch basics, Linear Algebra, Docker (type and click +)"
                        value={newPrereq}
                        onChange={(e) => setNewPrereq(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPrereq();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={styles.itemAddBtn}
                        onClick={handleAddPrereq}
                        disabled={!newPrereq.trim()}
                        title="Add prerequisite"
                      >
                        <MemberIcon name="plus" size={15} />
                      </button>
                    </div>
                    {ideaPrerequisites.length > 0 && (
                      <div className={styles.itemListTray}>
                        {ideaPrerequisites.map((p, idx) => (
                          <div key={idx} className={styles.itemChip}>
                            <span>{p}</span>
                            <button
                              type="button"
                              className={styles.itemRemoveBtn}
                              onClick={() => handleRemovePrereq(idx)}
                              aria-label={`Remove ${p}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Field: Rough Roadmap Step-by-Step List Builder */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className={styles.inputLabel} htmlFor="modal-idea-new-roadmap">
                        Rough Roadmap (Key milestones / sequential phases)
                      </label>
                      <span style={{ fontSize: "11px", color: ideaRoadmap.length > 0 ? "#e5b731" : "#8e8e93" }}>
                        {ideaRoadmap.length} steps added
                      </span>
                    </div>
                    <div className={styles.itemAddRow}>
                      <input
                        id="modal-idea-new-roadmap"
                        type="text"
                        className={styles.textInput}
                        placeholder="e.g. Phase 1: Literature review & baseline benchmarking (type and click +)"
                        value={newRoadmapStep}
                        onChange={(e) => setNewRoadmapStep(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddRoadmapStep();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={styles.itemAddBtn}
                        onClick={handleAddRoadmapStep}
                        disabled={!newRoadmapStep.trim()}
                        title="Add roadmap step"
                      >
                        <MemberIcon name="plus" size={15} />
                      </button>
                    </div>
                    {ideaRoadmap.length > 0 && (
                      <div className={styles.roadmapListStack}>
                        {ideaRoadmap.map((step, idx) => (
                          <div key={idx} className={styles.roadmapStepRow}>
                            <span className={styles.roadmapStepNumber}>{idx + 1}</span>
                            <span className={styles.roadmapStepText}>{step}</span>
                            <button
                              type="button"
                              className={styles.itemRemoveBtn}
                              onClick={() => handleRemoveRoadmapStep(idx)}
                              aria-label={`Remove step ${idx + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Field: Learning Outcomes List Builder */}
                  <div className={styles.formGroup}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className={styles.inputLabel} htmlFor="modal-idea-new-outcome">
                        Learning Outcomes (Core takeaways & deliverables)
                      </label>
                      <span style={{ fontSize: "11px", color: ideaLearningOutcomes.length > 0 ? "#e5b731" : "#8e8e93" }}>
                        {ideaLearningOutcomes.length} added
                      </span>
                    </div>
                    <div className={styles.itemAddRow}>
                      <input
                        id="modal-idea-new-outcome"
                        type="text"
                        className={styles.textInput}
                        placeholder="e.g. Distributed PyTorch training, ArXiv preprint (type and click +)"
                        value={newOutcome}
                        onChange={(e) => setNewOutcome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddOutcome();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={styles.itemAddBtn}
                        onClick={handleAddOutcome}
                        disabled={!newOutcome.trim()}
                        title="Add learning outcome"
                      >
                        <MemberIcon name="plus" size={15} />
                      </button>
                    </div>
                    {ideaLearningOutcomes.length > 0 && (
                      <div className={styles.itemListTray}>
                        {ideaLearningOutcomes.map((o, idx) => (
                          <div key={idx} className={styles.itemChip}>
                            <span>{o}</span>
                            <button
                              type="button"
                              className={styles.itemRemoveBtn}
                              onClick={() => handleRemoveOutcome(idx)}
                              aria-label={`Remove outcome ${o}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedCategory === "feedback" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-feedback-topic">
                      Suggestion / Feedback Topic
                    </label>
                    <input
                      id="modal-feedback-topic"
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. Hackathon timeline, Discord channel structure, Workshop suggestions"
                      value={feedbackTopic}
                      onChange={(e) => setFeedbackTopic(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-feedback-comments">
                      Details & Constructive Suggestions
                    </label>
                    <textarea
                      id="modal-feedback-comments"
                      className={styles.textareaInput}
                      placeholder="Share your thoughts, suggestions for improvement, or recommendations for the club leadership"
                      value={feedbackComments}
                      onChange={(e) => setFeedbackComments(e.target.value)}
                      rows={5}
                    />
                  </div>
                </>
              )}

              {selectedCategory === "report" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-report-parties">
                      Parties Involved (Optional)
                    </label>
                    <input
                      id="modal-report-parties"
                      type="text"
                      className={styles.textInput}
                      placeholder="Names, Discord tags, or SPG cluster ID"
                      value={partiesInvolved}
                      onChange={(e) => setPartiesInvolved(e.target.value)}
                    />
                  </div>

                  <div className={styles.confidentialBadge}>
                    <MemberIcon name="shield" size={18} />
                    <span>
                      <strong>Confidential:</strong> Hidden from public queues. Visible only to club executive leads and submitter.
                    </span>
                  </div>
                </>
              )}



              {submitError && <p role="alert">{submitError}</p>}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                  {isSubmitting ? "Creating..." : "Submit Ticket →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
