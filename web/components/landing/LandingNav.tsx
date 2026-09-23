import Image from "next/image";
import Link from "next/link";
import logo from "@/public/brand/logo_main_trim.png";
import { LandingButton } from "./Primitives";
import styles from "@/app/page.module.css";

const LINKS = [
  { href: "#tracks", label: "Tracks" },
  { href: "/projects", label: "Projects" },
  { href: "#ledger", label: "The ledger" },
  { href: "#joining", label: "Joining" },
];

export default function LandingNav() {
  return <header className={styles.nav} data-landing-nav>
    <nav className={styles.page} aria-label="Primary">
      <Link href="/" className={styles.brand} aria-label="Reinforce home"><Image src={logo} alt="Reinforce" priority sizes="100px" /></Link>
      <ul className={styles.nlinks}>{LINKS.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
      <div className={styles.nsp} />
      <div className={styles.nright}>
        <Link href="/auth" className={styles.signin}>Sign in</Link>
        <span className={styles.ledgerLink}><LandingButton href="#ledger" variant="line">See the ledger</LandingButton></span>
        <LandingButton href="/auth">Join the club</LandingButton>
        <details className={styles.menu}>
          <summary>Menu</summary>
          <ul className={styles.menuLinks}>{LINKS.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
        </details>
      </div>
    </nav>
  </header>;
}
