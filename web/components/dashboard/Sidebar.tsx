"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const links = [["/dashboard", "Overview"], ["/dashboard/tickets", "Your tickets"], ["/profile", "Your profile"]];
  return <div className={styles.sidebar}>
    <Link href="/" onClick={onNavigate} className={styles.logoLink}><Image src="/brand/logo_main_trim.png" priority width={190} height={52} alt="Reinforce home" className={styles.logoImage} /></Link>
    <p className={styles.sectionHeader}>MEMBER SPACE</p>
    <nav aria-label="Member navigation" className={styles.navList}>{links.map(([href, label]) => {
      const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${styles.navItem} ${active ? styles.active : ""}`}>{label}</Link>;
    })}</nav>
    <div className={styles.resources}><p className={styles.sectionHeader}>EXPLORE</p><Link className={styles.navItem} href="/tracks" onClick={onNavigate}>Club tracks</Link><Link className={styles.navItem} href="/projects" onClick={onNavigate}>Projects</Link></div>
    <p className={styles.note}>Create requests and keep the conversation going in the club Discord.</p>
  </div>;
}
