"use client";
import Link from "next/link";
import { useState } from "react";
import { useMember } from "@/lib/useMember";
import { useAuth } from "@/lib/useAuth";
import styles from "./Header.module.css";

export default function Header({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { profile } = useMember();
  const { signOut } = useAuth();
  const [error, setError] = useState("");
  return <header className={styles.header}>
    <div className={styles.left}><button className={styles.menu} onClick={onMenu} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="member-drawer">☰ <span>Menu</span></button><span className={styles.title}>Member space</span></div>
    <div className={styles.actions}><Link href="/profile" className={styles.profile}>{profile.full_name}</Link><button className={styles.signOut} onClick={async () => { try { await signOut(); } catch { setError("Could not sign out. Try again."); } }}>Sign out</button>{error && <span role="alert">{error}</span>}</div>
  </header>;
}
