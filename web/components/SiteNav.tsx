"use client";

import Link from "next/link";
import LandingNav from "./landing/LandingNav";
import { useEffect, useState } from "react";
import Pill from "./Pill";
import styles from "./SiteNav.module.css";

// Only routes that exist and have real data behind them. Writing, Events,
// Research and Team are in the PRD but have no source yet — no collection, no
// admin entry path — so they are deliberately absent rather than linked to a
// 404 or filled with placeholder content. Add the link when the page is real.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracks", label: "Tracks" },
  { href: "/projects", label: "Projects" },
];

export default function SiteNav({ landing = false }: { landing?: boolean }) {
  return landing ? <LandingNav /> : <DefaultNav />;
}

function DefaultNav() {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    // passive: this listener must never block scrolling.
    const onScroll = () => setCondensed(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.bar} ${condensed ? styles.condensed : ""}`}>
      <nav className={`page ${styles.inner}`} aria-label="Primary">
        <Link href="/" className={styles.brand}>
          Rein<em>force</em>
        </Link>

        <ul className={styles.links}>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={styles.link}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Pill href="/auth" variant="filled">Sign in</Pill>
        </div>
      </nav>
    </header>
  );
}
