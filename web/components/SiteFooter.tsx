import Link from "next/link";
import LandingFooter from "./landing/LandingFooter";
import styles from "./SiteFooter.module.css";

const REPOS = [
  { href: "https://github.com/Reinforce-SST/Reinforce-Student-Dashboard", label: "Platform" },
  { href: "https://github.com/Reinforce-SST/YUVI", label: "YUVI bot" },
  { href: "https://github.com/Reinforce-SST/Reinforce_Club-SST", label: "Project archive" },
];

export default function SiteFooter({ landing = false }: { landing?: boolean }) {
  if (landing) return <LandingFooter />;
  return (
    <footer className={styles.footer}>
      <div className={`page ${styles.inner}`}>
        <div>
          <p className={styles.brand}>Rein<em>force</em></p>
          <p className={styles.line}>The AI/ML club at Scaler School of Technology.</p>
        </div>

        <nav className={styles.cols} aria-label="Footer">
          <div>
            {/* Same rule as the nav: only pages that exist. */}
            <p className={`mono ${styles.colhead}`}>Club</p>
            <Link className={styles.a} href="/tracks">Tracks</Link>
            <Link className={styles.a} href="/projects">Projects</Link>
            <Link className={styles.a} href="/auth">Sign in</Link>
          </div>
          <div>
            <p className={`mono ${styles.colhead}`}>Open source</p>
            {REPOS.map((r) => (
              <a key={r.href} className={styles.a} href={r.href} target="_blank" rel="noreferrer noopener">
                {r.label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      <div className={`page ${styles.base}`}>
        <span className="mono">Reinforce · SST</span>
        <a className="mono" href="mailto:ai_ml_club@sst.scaler.com">ai_ml_club@sst.scaler.com</a>
      </div>
    </footer>
  );
}
