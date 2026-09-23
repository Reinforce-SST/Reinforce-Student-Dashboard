"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import logo from "@/public/brand/logo_main_trim.png";
import MemberIcon from "./MemberIcon";
import styles from "./Sidebar.module.css";

const links = [
  { href: "/dashboard", label: "Overview", icon: "overview" },
  { href: "/dashboard/tickets", label: "Your tickets", icon: "tickets" },
  { href: "/profile", label: "Your profile", icon: "profile" },
] as const;

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <div className={styles.sidebar}>
    <Link href="/" onClick={onNavigate} className={styles.logoLink}><Image src={logo} priority sizes="148px" alt="Reinforce home" className={styles.logoImage} /></Link>
    <nav aria-label="Member navigation" className={styles.navList}>{links.map(({ href, label, icon }) => {
      const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${styles.navItem} ${active ? styles.active : ""}`}><MemberIcon name={icon} />{label}</Link>;
    })}</nav>
    <div className={styles.resources}><p className={styles.sectionHeader}>Around the club</p><Link className={styles.navItem} href="/tracks" onClick={onNavigate}>Explore tracks<MemberIcon name="external" /></Link><Link className={styles.navItem} href="/projects" onClick={onNavigate}>Club projects<MemberIcon name="external" /></Link></div>
    <div className={styles.footer}><p>Reinforce Club</p><span>Scaler School of Technology</span><Link href="/" onClick={onNavigate}>Back to the website</Link></div>
  </div>;
}
