import Image from "next/image";
import Link from "next/link";
import logo from "@/public/brand/logo_main_trim.png";
import styles from "@/app/page.module.css";

const REPO = "https://github.com/Reinforce-SST/Reinforce-Student-Dashboard";
const GROUPS = [
  { title: "Club", links: [["Tracks", "/tracks"], ["Projects", "/projects"], ["How to join", "#joining"]] },
  { title: "Platform", links: [["Dashboard", "/dashboard"], ["Tickets", "/dashboard/tickets"], ["Sign in", "/auth"]] },
  { title: "Open source", links: [["Dashboard repo", REPO], ["YUVI bot", "https://github.com/Reinforce-SST/YUVI"], ["Project archive", "https://github.com/Reinforce-SST/Reinforce_Club-SST"]] },
  { title: "Get help", links: [["Contact the club", "mailto:ai_ml_club@sst.scaler.com"], ["Contributing", `${REPO}/blob/feat/ledger-web/CONTRIBUTING.md`], ["Report an issue", `${REPO}/issues`]] },
];

export default function LandingFooter() {
  return <footer className={styles.foot}>
    <div className={styles.page}>
      <div className={styles.fgGrid}>
        <div className={styles.footerBrand}>
          <Link href="/" aria-label="Reinforce home"><Image src={logo} alt="Reinforce" sizes="100px" /></Link>
          <p className={styles.footerAbout}>The AI/ML club at Scaler School of Technology.</p>
        </div>
        {GROUPS.map((group) => <nav key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul>{group.links.map(([label, href]) => <li key={label}>
            {href.startsWith("https:") ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
              : <Link href={href}>{label}</Link>}
          </li>)}</ul>
        </nav>)}
      </div>
      <div className={styles.fbar}>
        <span>REINFORCE · SST</span><a href="mailto:ai_ml_club@sst.scaler.com">AI_ML_CLUB@SST.SCALER.COM</a>
      </div>
    </div>
  </footer>;
}
