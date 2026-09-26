"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import logo from "@/public/brand/logo_main_trim.png";
import { useMember } from "@/lib/useMember";
import MemberIcon, { type IconName } from "./MemberIcon";
import styles from "./Sidebar.module.css";

type NavLink = {
  href: string;
  label: string;
  icon: IconName;
};

const mainMenuLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/spg", label: "SPG Management", icon: "spg" },
  { href: "/dashboard/tickets", label: "Ticket System", icon: "tickets" },
  { href: "/dashboard/events", label: "Events Planner", icon: "events" },
  { href: "/dashboard/articles", label: "Article Hub", icon: "articles" },
];

const resourceLinks: NavLink[] = [
  { href: "/dashboard/ideas", label: "Idea Jar", icon: "ideas" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "leaderboard" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile } = useMember();

  const initials = profile?.full_name
    ? profile.full_name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "JC";

  return (
    <div className={styles.sidebar}>
      <Link href="/" onClick={onNavigate} className={styles.logoLink}>
        <Image
          src={logo}
          priority
          sizes="140px"
          alt="Reinforce SST"
          className={styles.logoImage}
        />
      </Link>

      <div className={styles.navGroup}>
        <span className={styles.groupHeader}>MAIN MENU</span>
        <nav aria-label="Main Navigation" className={styles.navList}>
          {mainMenuLinks.map(({ href, label, icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`${styles.navItem} ${active ? styles.active : ""}`}
              >
                <MemberIcon name={icon} size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.navGroup}>
        <span className={styles.groupHeader}>RESOURCES</span>
        <nav aria-label="Resources Navigation" className={styles.navList}>
          {resourceLinks.map(({ href, label, icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`${styles.navItem} ${active ? styles.active : ""}`}
              >
                <MemberIcon name={icon} size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Member Badge & Level Card */}
      <div className={styles.memberCard}>
        <div className={styles.memberCardTop}>
          <span className={styles.tierBadge}>ADVANCED MEMBER</span>
          <span className={styles.tierShield}>
            <MemberIcon name="shield" size={16} />
          </span>
        </div>
        <p className={styles.pointsText}>240 Points earned</p>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: "68%" }} />
        </div>
        <Link
          href="/profile"
          onClick={onNavigate}
          className={styles.profileRow}
        >
          <span className={styles.avatarCircle}>{initials}</span>
          <span className={styles.viewProfileText}>View Profile</span>
        </Link>
      </div>
    </div>
  );
}
