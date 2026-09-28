"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMember } from "@/lib/useMember";
import MemberIcon from "./MemberIcon";
import MemberNotifications from "./MemberNotifications";
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
  "/dashboard/search": "Search",
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
  search: "Search",
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
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const section = pathname === "/profile" ? "profile" : pathname.split("/")[2] || "";
  const pageTitle = titles[pathname] || titles[`/dashboard/${section}`] || "Dashboard Overview";
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
        <button type="button" className={styles.mobileSearchButton} aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)}><MemberIcon name="search" size={18} /></button>
        <form role="search" className={`${styles.searchWrapper} ${searchOpen ? styles.searchOpen : ""}`} onSubmit={(event) => { event.preventDefault(); if (!searchQuery.trim()) return; router.push(`/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`); setSearchOpen(false); }}>
          <span className={styles.searchIcon}>
            <MemberIcon name="search" size={16} />
          </span>
          <input
            type="search"
            aria-label="Search projects, tickets, ideas, and articles"
            placeholder="Search projects, tickets, ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </form>

        <MemberNotifications />

        {/* User Profile Pill */}
        <Link
          href="/profile"
          className={styles.userPill}
          aria-label={`View profile for ${displayName}`}
        >
          <div className={styles.userText}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userTrack}>{profile.is_admin ? "ADMIN" : profile.role_label?.toUpperCase() || (profile.tier ? `${profile.tier.toUpperCase()} MEMBER` : "MEMBER")}</span>
          </div>
          <div className={styles.userAvatar}>
            {profile?.avatar_url && profile.avatar_url !== failedAvatarUrl ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className={styles.avatarImg}
                onError={() => setFailedAvatarUrl(profile.avatar_url || null)}
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
