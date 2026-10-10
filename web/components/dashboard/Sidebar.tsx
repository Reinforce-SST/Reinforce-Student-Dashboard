"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  { href: "/dashboard/resources", label: "Learning Resources", icon: "book" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "leaderboard" },
];

const adminCoreLinks: NavLink[] = [
  { href: "/dashboard/admin/banners", label: "Dashboard Banners", icon: "image" },
  { href: "/dashboard/admin/events", label: "Club Events", icon: "calendar" },
  { href: "/dashboard/admin/manage-spgs", label: "SPG Management", icon: "spg" },
  { href: "/dashboard/admin/tickets", label: "Ticket Console", icon: "tickets" },
  { href: "/dashboard/admin/contributions", label: "Merit Auditing", icon: "award" },
];

const adminDirectoryLinks: NavLink[] = [
  { href: "/dashboard/admin/members", label: "Member Directory", icon: "users" },
  { href: "/dashboard/admin/articles", label: "Article Publisher", icon: "articles" },
  { href: "/dashboard/admin/ideas", label: "Idea Jar Review", icon: "ideas" },
  { href: "/dashboard/admin/resources", label: "Learning Resources", icon: "book" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile: _profile } = useMember();
  const { isAdmin, isAdminMode, setAdminMode } = useAdminMode();

  return (
    <div className={styles.sidebar}>
      <Link href="/dashboard" onClick={onNavigate} className={styles.logoLink}>
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
                const tabKey = href.split("/").pop();
                const active =
                  pathname === href ||
                  pathname.startsWith(href + "/") ||
                  (href === "/dashboard/admin/banners" && pathname === "/dashboard/admin" && (!searchParams.get("tab") || searchParams.get("tab") === "banners")) ||
                  (pathname === "/dashboard/admin" && searchParams.get("tab") === tabKey);

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
            <span className={styles.groupHeader}>COMMUNITY &amp; CONTENT</span>
            <nav aria-label="Admin Community Navigation" className={styles.navList}>
              {adminDirectoryLinks.map(({ href, label, icon }) => {
                const tabKey = href.split("/").pop();
                const active =
                  pathname === href ||
                  pathname.startsWith(href + "/") ||
                  (pathname === "/dashboard/admin" && searchParams.get("tab") === tabKey);

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
        </>
      )}
    </div>
  );
}
