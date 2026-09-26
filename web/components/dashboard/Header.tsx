"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMember } from "@/lib/useMember";
import { useAuth } from "@/lib/useAuth";
import MemberIcon from "./MemberIcon";
import styles from "./Header.module.css";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard Overview",
  "/dashboard/spg": "SPG Management",
  "/dashboard/tickets": "Ticket System",
  "/dashboard/events": "Events Planner",
  "/dashboard/articles": "Article Hub",
  "/dashboard/ideas": "Idea Jar",
  "/dashboard/leaderboard": "Club Leaderboard",
  "/profile": "Member Profile",
};

export default function Header({
  onMenu,
  menuOpen,
}: {
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const { profile } = useMember();
  const { signOut } = useAuth();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const pageTitle = titles[pathname] || "Dashboard Overview";

  const initials = profile?.full_name
    ? profile.full_name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "JC";

  const displayName = profile?.full_name || "Julian Chen";

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          className={styles.menuBtn}
          onClick={onMenu}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="member-drawer"
        >
          <MemberIcon name="menu" size={20} />
        </button>
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
      </div>

      <div className={styles.right}>
        {/* Search Bar */}
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>
            <MemberIcon name="search" size={16} />
          </span>
          <input
            type="text"
            placeholder="Search projects, tickets, ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Notifications Icon Button */}
        <button
          className={styles.iconButton}
          aria-label="Notifications"
          title="Notifications"
        >
          <MemberIcon name="bell" size={18} />
          <span className={styles.badgeDot} />
        </button>

        {/* User Profile Pill */}
        <Link
          href="/profile"
          className={styles.userPill}
          aria-label={`View profile for ${displayName}`}
        >
          <div className={styles.userText}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userTrack}>RESEARCH TRACK</span>
          </div>
          <div className={styles.userAvatar}>{initials}</div>
        </Link>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
    </header>
  );
}
