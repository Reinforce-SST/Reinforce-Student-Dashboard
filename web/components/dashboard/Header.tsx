"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMember } from "@/lib/useMember";
import { useAuth } from "@/lib/useAuth";
import MemberIcon from "./MemberIcon";
import styles from "./Header.module.css";

export default function Header({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { profile } = useMember();
  const { signOut } = useAuth();
  const pathname = usePathname();
  const [error, setError] = useState("");
  const section = pathname.startsWith("/profile") ? "Your profile" : pathname.startsWith("/dashboard/tickets") ? "Your tickets" : "Overview";
  const initials = profile.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  return <header className={styles.header}>
    <div className={styles.left}><button className={styles.menu} onClick={onMenu} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="member-drawer"><MemberIcon name="menu" /></button><p className={styles.breadcrumb}><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">/</span><span>{section}</span></p></div>
    <div className={styles.actions}><Link href="/profile" className={styles.profile} aria-label={`Your profile, ${profile.full_name}`}><span className={styles.avatar} aria-hidden="true">{initials}</span><span className={styles.name}>{profile.full_name}</span></Link><button className={styles.signOut} onClick={async () => { try { await signOut(); } catch { setError("Could not sign out. Try again."); } }}>Sign out</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </header>;
}
