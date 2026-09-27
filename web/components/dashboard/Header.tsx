"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMember } from "@/lib/useMember";
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
  "/dashboard/admin": "Admin Command Center",
  "/profile": "Member Profile",
};

const mobileTitles: Record<string, string> = {
  "": "Dashboard",
  spg: "SPGs",
  tickets: "Tickets",
  events: "Events",
  articles: "Articles",
  ideas: "Ideas",
  leaderboard: "Leaderboard",
  admin: "Admin",
  profile: "Profile",
};

export default function Header({
  onMenu,
  menuOpen,
}: {
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const { profile } = useMember();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);

  const pageTitle = titles[pathname] || "Dashboard Overview";
  const section = pathname === "/profile" ? "profile" : pathname.split("/")[2] || "";
  const mobileTitle = mobileTitles[section] || "Dashboard";

  const initials = profile?.full_name
    ? profile.full_name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "M";

  const displayName = profile?.full_name || "Member";

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          className={styles.menuBtn}
          onClick={onMenu}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="member-drawer"
        >
          <MemberIcon name="menu" size={20} />
        </button>
        <h1 className={styles.pageTitle}>
          <span className={styles.desktopTitle}>{pageTitle}</span>
          <span className={styles.mobileTitle}>{mobileTitle}</span>
        </h1>
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
            <span className={styles.userTrack}>{profile.tier ? `${profile.tier.toUpperCase()} MEMBER` : "MEMBER"}</span>
          </div>
          <div className={styles.userAvatar}>
            {profile?.avatar_url && !avatarFailed ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className={styles.avatarImg}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              initials
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
