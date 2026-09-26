"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import MemberIcon, { type IconName } from "@/components/dashboard/MemberIcon";
import styles from "./TicketManagement.module.css";

export type TicketCategory =
  | "spg_registration"
  | "resource_request"
  | "support"
  | "idea_jar"
  | "report"
  | "feedback"
  | "misc";

export interface TicketCreatePayload {
  category: TicketCategory;
  title: string;
  description?: string;
  fields: Record<string, any>;
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
  fields: Record<string, any>;
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
    title: "Idea Jar & Suggestions",
    subtitle: "Submit project ideas & feedback",
    description: "Propose new concepts, features, or workshops for the club",
    icon: "ideas",
    iconClass: styles.iconIdea,
    badgeClass: styles.catIdea,
    tabActiveClass: styles.modalCatTabActiveIdea,
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

const initialTickets: TicketItem[] = [
  {
    id: "tkt_e4a89b01",
    category: "resource_request",
    categoryLabel: "Resource Request",
    title: "Request for 4x A100 GPU Cluster Compute for SPG Autonomous Drone Swarms",
    description:
      "High-throughput compute allocation requested for distributed RL policy iterations before NeurIPS deadline.",
    priority: "medium",
    status: "in_progress",
    createdAt: "2 hours ago",
    updatedAt: "30 mins ago",
    author: "Julian Chen",
    spg_id: "spg_drone_swarms",
    fields: {
      "SPG Name": "Autonomous Drone Swarms (SP-1)",
      "Resources Requested": "4x NVIDIA A100 (80GB SXM) for 250 compute hours",
      "Progress Proof": "https://github.com/reinforce-sst/drone-swarm-rl",
      "Justification": "Targeting NeurIPS 2025 Workshop on Multi-Agent Systems",
    },
  },
  {
    id: "tkt_7bc23f99",
    category: "spg_registration",
    categoryLabel: "SPG Registration",
    title: "SPG Charter: Vision-Language Grounding Cluster (Kaggle Track)",
    description:
      "Registering new 4-member Kaggle Track team targeting spatial grounding challenge on multimodal video.",
    priority: "medium",
    status: "open",
    createdAt: "Yesterday",
    updatedAt: "Yesterday",
    author: "Julian Chen",
    fields: {
      "Project Name & Track": "Vision-Language Grounding (Kaggle Track)",
      "Team Members": "Julian Chen (@julian), Aryan K (@aryan), Tanya L (@tanya)",
      "Duration & Frequency": "8 Weeks, Bi-weekly sprint syncs on Tuesdays & Fridays",
      "Summary & Goals": "Aiming for Kaggle Grandmaster medal in Multimodal Video Grounding 2025",
    },
  },
  {
    id: "tkt_2d91ca84",
    category: "support",
    categoryLabel: "Support & Inquiries",
    title: "YUVI Discord Bot Role Sync & Cluster Telemetry Key",
    description:
      "Assistance needed verifying Discord link token to unlock telemetry stats on the member dashboard.",
    priority: "medium",
    status: "resolved",
    createdAt: "Sep 20, 2024",
    updatedAt: "Sep 21, 2024",
    author: "Julian Chen",
    fields: {
      Subject: "Discord YUVI Link Verification",
      Details: "Private token generated on bot did not trigger role sync webhook.",
      "Discord Handle": "julian_chen#8921",
    },
  },
];

export default function TicketManagementClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(initialTickets[0]?.id || "");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");

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
    "report",
  ];

  const currentCategory: TicketCategory =
    urlCategoryParam && validCategories.includes(urlCategoryParam)
      ? urlCategoryParam
      : "spg_registration";

  const [selectedCategory, setSelectedCategory] = useState<TicketCategory>(currentCategory);

  useEffect(() => {
    if (urlCategoryParam && validCategories.includes(urlCategoryParam)) {
      setSelectedCategory(urlCategoryParam);
    }
  }, [urlCategoryParam]);

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSpgId, setFormSpgId] = useState("spg_drone_swarms");

  const [spgTrack, setSpgTrack] = useState<"research" | "product" | "kaggle" | "general">("research");
  const [spgMembers, setSpgMembers] = useState("Julian Chen (@julian), Alex M (@alex)");
  const [spgDuration, setSpgDuration] = useState("8 Weeks (Weekly Sprints)");
  const [spgGoals, setSpgGoals] = useState("Implement baseline architecture, submit research preprint to arXiv");

  const [resSpgName, setResSpgName] = useState("Autonomous Drone Swarms (SP-1)");
  const [resRequested, setResRequested] = useState("4x NVIDIA A100 (80GB SXM) Cluster (200 GPU Hours)");
  const [resProgressProof, setResProgressProof] = useState("https://github.com/reinforce-sst/drone-swarm-rl");
  const [resJustification, setResJustification] = useState("Required for scaling policy exploration to 10M environment steps");

  const [supportSubject, setSupportSubject] = useState("Discord Role & Cluster Key Access");
  const [supportDetails, setSupportDetails] = useState("Need assistance linking private YUVI token for bot permissions");
  const [discordHandle, setDiscordHandle] = useState("julian_chen#8921");

  const [ideaTrack, setIdeaTrack] = useState<"research" | "product" | "kaggle" | "general">("product");
  const [ideaOverview, setIdeaOverview] = useState("Decentralized GPU pooling client for student workstation nodes");

  const [reportIncident, setReportIncident] = useState("Code of Conduct / SPG Collaboration Dispute");
  const [reportDetails, setReportDetails] = useState("Confidential summary of the incident and parties involved");
  const [partiesInvolved, setPartiesInvolved] = useState("Confidential");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const closeModal = () => {
    router.push(pathname, { scroll: false });
  };

  const openModalWithCategory = (cat: TicketCategory) => {
    setSelectedCategory(cat);
    router.push(`${pathname}?create=true&category=${cat}`, { scroll: false });
  };

  const handleSwitchModalCategory = (cat: TicketCategory) => {
    setSelectedCategory(cat);
    router.push(`${pathname}?create=true&category=${cat}`, { scroll: false });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const buildTicketCreatePayload = (): TicketCreatePayload => {
    let fieldsObj: Record<string, any> = {};

    if (selectedCategory === "spg_registration") {
      fieldsObj = {
        "Project Name & Track": `${formTitle || "Untitled Project"} (${spgTrack.toUpperCase()} Track)`,
        "Team Members": spgMembers,
        "Duration & Frequency": spgDuration,
        "Summary & Goals": spgGoals,
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
      fieldsObj = {
        "Idea Title": formTitle || "Untitled Idea",
        Track: `${ideaTrack.toUpperCase()} Track`,
        Overview: ideaOverview,
      };
    } else if (selectedCategory === "report") {
      fieldsObj = {
        "Incident Summary": reportIncident,
        "Report Details": reportDetails,
        "Parties Involved": partiesInvolved,
        "Is Confidential": true,
      };
    }

    const payload: TicketCreatePayload = {
      category: selectedCategory,
      title: formTitle.trim() || "Untitled Ticket",
      description: formDescription.trim() ? formDescription.trim() : undefined,
      fields: fieldsObj,
    };

    if (selectedCategory === "resource_request" || selectedCategory === "spg_registration") {
      if (formSpgId.trim()) {
        payload.spg_id = formSpgId.trim();
      }
    }

    return payload;
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const payload = buildTicketCreatePayload();
      const typeOption = ticketTypeOptions.find((t) => t.id === selectedCategory)!;

      const randomHex = Math.random().toString(16).substring(2, 10);
      const newTicket: TicketItem = {
        id: `tkt_${randomHex}`,
        category: payload.category,
        categoryLabel: typeOption.title,
        title: payload.title,
        description: payload.description || "No description provided.",
        priority: "medium",
        status: "open",
        createdAt: "Just now",
        updatedAt: "Just now",
        author: "Julian Chen",
        spg_id: payload.spg_id,
        fields: payload.fields,
      };

      setTickets([newTicket, ...tickets]);
      setSelectedTicketId(newTicket.id);
      setFormTitle("");
      setFormDescription("");
      setIsSubmitting(false);
      closeModal();
      setSuccessMessage(`Ticket created successfully (${newTicket.id})!`);
      setTimeout(() => setSuccessMessage(""), 4500);
    }, 400);
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = filterStatus === "all" || t.status === filterStatus;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

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
            + New Ticket
          </button>
        </div>
      </div>

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
          <span className={styles.statLabel}>Avg Response Time</span>
          <span className={styles.statValue}>&lt; 4h</span>
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

          <div className={styles.ticketsList}>
            {filteredTickets.map((ticket) => (
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
                No tickets matching your filter criteria.
              </div>
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
                    {Object.entries(selectedTicket.fields).map(([key, value]) => (
                      <div key={key} className={styles.fieldRow}>
                        <span className={styles.fieldKey}>{key}:</span>
                        <span className={styles.fieldVal}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discord Thread Bridge Banner */}
              <div className={styles.discordBridgeBanner}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MemberIcon name="message" size={16} />
                  <span>
                    Discord Thread Sync Active (<code>#ticket-{selectedTicket.id}</code>)
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontFamily: "var(--font-mono, monospace)",
                    color: "#b0baff",
                  }}
                >
                  Live Thread
                </span>
              </div>
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
            <div className={styles.modalCatSwitcher} role="tablist">
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
                    Title
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
                      ? "e.g., Confidential Code of Conduct Incident Report"
                      : selectedCategory === "idea_jar"
                      ? "e.g., Decentralized GPU pooling platform"
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
                    Description
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
                  placeholder="Detailed context and rationale for this ticket."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Category-Specific Form Fields */}
              {selectedCategory === "spg_registration" && (
                <>
                  <div className={styles.fieldsRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-spg-track">
                        Track
                      </label>
                      <select
                        id="modal-spg-track"
                        className={styles.selectInput}
                        value={spgTrack}
                        onChange={(e) => setSpgTrack(e.target.value as any)}
                      >
                        <option value="research">Research Track (Red)</option>
                        <option value="product">Product Track (Green)</option>
                        <option value="kaggle">Kaggle Track (Blue)</option>
                        <option value="general">General Track</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="modal-spg-duration">
                        Duration & Frequency
                      </label>
                      <input
                        id="modal-spg-duration"
                        type="text"
                        className={styles.textInput}
                        value={spgDuration}
                        onChange={(e) => setSpgDuration(e.target.value)}
                        placeholder="e.g. 8 Weeks, Weekly syncs"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-spg-members">
                      Team Members
                    </label>
                    <input
                      id="modal-spg-members"
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. Julian Chen (@julian), Aryan K (@aryan)"
                      value={spgMembers}
                      onChange={(e) => setSpgMembers(e.target.value)}
                    />
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
                        onChange={(e) => setFormSpgId(e.target.value)}
                      >
                        <option value="spg_drone_swarms">SP-1 Autonomous Drone Swarms</option>
                        <option value="spg_decentralized_compute">SP-2 Decentralized Compute</option>
                        <option value="spg_llm_benchmark">SPG-3 LLM Benchmark 2025</option>
                        <option value="spg_quantum_gate">SPG-X Quantum Gate Sim</option>
                      </select>
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
                        onChange={(e) => setResSpgName(e.target.value)}
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
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-idea-track">
                      Domain Track
                    </label>
                    <select
                      id="modal-idea-track"
                      className={styles.selectInput}
                      value={ideaTrack}
                      onChange={(e) => setIdeaTrack(e.target.value as any)}
                    >
                      <option value="research">Research Track</option>
                      <option value="product">Product Track</option>
                      <option value="kaggle">Kaggle Track</option>
                      <option value="general">General Club Idea</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-idea-overview">
                      Project / Idea Overview
                    </label>
                    <textarea
                      id="modal-idea-overview"
                      className={styles.textareaInput}
                      placeholder="Describe your proposal, architecture concept, or community initiative"
                      value={ideaOverview}
                      onChange={(e) => setIdeaOverview(e.target.value)}
                    />
                  </div>
                </>
              )}

              {selectedCategory === "report" && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-report-incident">
                      Incident Summary
                    </label>
                    <input
                      id="modal-report-incident"
                      type="text"
                      className={styles.textInput}
                      value={reportIncident}
                      onChange={(e) => setReportIncident(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-report-details">
                      Report Details
                    </label>
                    <textarea
                      id="modal-report-details"
                      className={styles.textareaInput}
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="modal-report-parties">
                      Parties Involved
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
