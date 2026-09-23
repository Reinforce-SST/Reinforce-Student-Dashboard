import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import LandingMotion from "@/components/landing/LandingMotion";
import WorkSections from "@/components/landing/WorkSections";
import HeroCollage from "@/components/landing/HeroCollage";
import { LandingButton, MarkerText, Stars, stagger } from "@/components/landing/Primitives";
import styles from "./page.module.css";

/** Marketing content only: no authenticated API requests or invented figures. */
export default function Home() {
  return <LandingMotion>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <div className={styles.progress} data-progress aria-hidden="true" />
    <SiteNav landing />
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="hero-heading">
        <Stars />
        <span className={styles.x} aria-hidden="true" style={{ left: "14%", top: "22%" }}>✕</span>
        <span className={styles.x} aria-hidden="true" style={{ right: "16%", top: "18%", animationDelay: "1.3s" }}>✕</span>
        <div className={`${styles.page} ${styles.layer}`}>
          <a href="#tracks" className={`${styles.ann} ${styles.rise}`} data-animate="rise" style={stagger(0)}>
            Find your people <b>Explore three tracks <i aria-hidden="true">→</i></b>
          </a>
          <h1 className={styles.big} id="hero-heading">
            <span className={`${styles.rise} ${styles.block}`} data-animate="rise" style={stagger(1)}>Code it, ship it,</span>
            <MarkerText index={1}>get scored</MarkerText>
          </h1>
          <p className={`${styles.hsub} ${styles.rise}`} data-animate="rise" style={stagger(3)}>
            The AI/ML club at SST. Real competitions, open-source products, and research you can reproduce.
          </p>
          <div className={`${styles.hctas} ${styles.rise}`} data-animate="rise" style={stagger(4)}>
            <LandingButton href="/auth" large>Join the club</LandingButton>
            <LandingButton href="#ledger" variant="ghost" large>See the ledger</LandingButton>
          </div>
          <p className={`${styles.hfine} ${styles.rise}`} data-animate="rise" style={stagger(5)}>Google sign-in · @sst.scaler.com only</p>
        </div>
        <div className={`${styles.page} ${styles.layer}`}><HeroCollage /></div>
      </section>
      <section className={styles.strip} aria-label="Platforms we work on">
        <div className={styles.page}>
          <p className={`${styles.mono} ${styles.rise}`} data-animate="rise">Where the work actually happens</p>
          <div className={`${styles.srow} ${styles.rise}`} data-animate="rise" style={stagger(1)}>
            {["Kaggle", "GitHub", "Hugging Face", "arXiv", "Colab", "Discord"].map((name) => <span key={name}>{name}</span>)}
          </div>
        </div>
      </section>
      <WorkSections />
    </main>
    <SiteFooter />
  </LandingMotion>;
}
