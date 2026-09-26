"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import logo from "@/public/brand/logo_main_trim.png";
import { useMember } from "@/lib/useMember";
import { useAdminMode } from "@/lib/useAdminMode";
import MemberIcon, { type IconName } from "./MemberIcon";
import styles from "./Sidebar.module.css";

type NavLink = {
  href: string;
  label: string;
  icon: IconName;
};

const studentMainMenuLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/spg", label: "SPG Management", icon: "spg" },
  { href: "/dashboard/tickets", label: "Ticket System", icon: "tickets" },
  { href: "/dashboard/events", label: "Events Planner", icon: "events" },
  { href: "/dashboard/articles", label: "Article Hub", icon: "articles" },
];

const studentResourceLinks: NavLink[] = [
  { href: "/dashboard/ideas", label: "Idea Jar", icon: "ideas" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "leaderboard" },
];

const adminCoreLinks: NavLink[] = [
  { href: "/dashboard/admin?tab=banners", label: "Dashboard Banners", icon: "image" },
  { href: "/dashboard/admin?tab=events", label: "Club Events", icon: "calendar" },
  { href: "/dashboard/admin?tab=spg", label: "SPG Approvals", icon: "spg" },
  { href: "/dashboard/admin?tab=tickets", label: "Ticket Console", icon: "tickets" },
  { href: "/dashboard/admin?tab=contributions", label: "Merit Auditing", icon: "award" },
];

const adminDirectoryLinks: NavLink[] = [
  { href: "/dashboard/admin?tab=members", label: "Member Directory", icon: "users" },
  { href: "/dashboard/admin?tab=articles", label: "Article Publisher", icon: "articles" },
  { href: "/dashboard/admin?tab=ideas", label: "Idea Jar Review", icon: "ideas" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useMember();
  const { isAdmin, isAdminMode, setAdminMode } = useAdminMode();

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

      {/* Admin / Student Role Switcher (Visible to users with admin privileges) */}
      {isAdmin && (
        <div className={styles.modeSwitchWrapper} role="tablist" aria-label="Dashboard Role Mode Switcher">
          <button
            type="button"
            className={`${styles.modeSwitchBtn} ${!isAdminMode ? styles.modeSwitchBtnActive : ""}`}
            onClick={() => {
              setAdminMode(false);
              if (pathname.startsWith("/dashboard/admin")) {
                router.push("/dashboard");
              }
            }}
          >
            <MemberIcon name="profile" size={13} />
            <span>Student</span>
          </button>
          <button
            type="button"
            className={`${styles.modeSwitchBtn} ${isAdminMode ? styles.modeSwitchBtnAdminActive : ""}`}
            onClick={() => {
              setAdminMode(true);
              router.push("/dashboard/admin");
            }}
          >
            <MemberIcon name="lightning" size={13} />
            <span>Admin</span>
          </button>
        </div>
      )}

      {/* Navigation Groups depending on Mode */}
      {isAdminMode ? (
        <>
          <div className={styles.navGroup}>
            <span className={styles.groupHeader}>OPERATIONS &amp; SETUP</span>
            <nav aria-label="Admin Core Navigation" className={styles.navList}>
              {adminCoreLinks.map(({ href, label, icon }) => {
                const isExact = pathname === href;
                const isSub = href.includes("?tab=") && pathname === "/dashboard/admin";
                // URL matching
                const active = href === "/dashboard/admin" ? pathname === href : pathname.startsWith(href.split("?")[0]);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
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
            <span className={styles.groupHeader}>COMMUNITY &amp; CONTENT</span>
            <nav aria-label="Admin Community Navigation" className={styles.navList}>
              {adminDirectoryLinks.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={styles.navItem}
                >
                  <MemberIcon name={icon} size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Admin Mode Badge & Switch to Student Footer */}
          <div className={styles.adminStatusCard}>
            <div className={styles.adminStatusHeader}>
              <span className={styles.adminBadge}>⚡ ADMIN CONSOLE</span>
              <span className={styles.onlineDot} title="Authorized Admin" />
            </div>
            <p className={styles.adminSubtitle}>
              {profile?.full_name || "Lead Admin"}
            </p>
            <button
              type="button"
              onClick={() => {
                setAdminMode(false);
                router.push("/dashboard");
              }}
              className={styles.exitAdminBtn}
            >
              ← Student Dashboard
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.navGroup}>
            <span className={styles.groupHeader}>MAIN MENU</span>
            <nav aria-label="Main Navigation" className={styles.navList}>
              {studentMainMenuLinks.map(({ href, label, icon }) => {
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
              {studentResourceLinks.map(({ href, label, icon }) => {
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
              <span className={styles.tierBadge}>
                {profile?.tier ? `${profile.tier.toUpperCase()} MEMBER` : "ACTIVE MEMBER"}
              </span>
              <span className={styles.tierShield}>
                <MemberIcon name="shield" size={16} />
              </span>
            </div>
            <p className={styles.pointsText}>
              {profile?.points?.total ?? 0} Points earned
            </p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${Math.min(100, Math.max(10, ((profile?.points?.total ?? 0) / 400) * 100))}%`,
                }}
              />
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
        </>
      )}
    </div>
  );
}
