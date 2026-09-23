import { LandingButton, MarkerText, Stars, stagger } from "./Primitives";
import styles from "@/app/page.module.css";

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  // The server renders final values. The single page observer animates only the
  // decorative copy; assistive technology always gets the complete number.
  return <>
    <b data-count={value} data-suffix={suffix} aria-hidden="true">{value}{suffix}</b>
    <span className="sr-only">{value}{suffix} </span>
  </>;
}

export default function ClosingSections() {
  return <>
    {/* Constants from the club structure/policy, never an estimated member count. */}
    <section className={`${styles.band} ${styles.alt} ${styles.figures}`} aria-label="Club principles">
      <div className={styles.page}>
        <div className={styles.fig4}>
          {[
            { value: 3, label: "tracks to find your kind of work" },
            { value: 100, suffix: "%", label: "of club repositories public" },
            { value: 0, label: "paid tools required to take part" },
          ].map((stat, index) => <div className={styles.fg} data-animate="figure" key={stat.label} style={stagger(index)}>
            <CountUp value={stat.value} suffix={stat.suffix} /><span>{stat.label}</span>
          </div>)}
        </div>
      </div>
    </section>
    <section className={styles.band} id="joining" aria-labelledby="joining-heading">
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={`${styles.eyebrow} ${styles.rise}`} data-animate="rise">Joining</p>
          <h2 className={`${styles.h2} ${styles.rise}`} id="joining-heading" data-animate="rise" style={stagger(1)}>
            Three steps. <MarkerText index={1}>Your move.</MarkerText>
          </h2>
        </div>
        <ol className={styles.three}>
          <li className={`${styles.tile} ${styles.rise}`} data-animate="rise" style={stagger(2)}>
            <p className={styles.n}>01</p><h3>Sign in</h3>
            <p>Google, with your @sst.scaler.com address. Your college account is your way in.</p>
          </li>
          <li className={`${styles.tile} ${styles.rise}`} data-animate="rise" style={stagger(3)}>
            <p className={styles.n}>02</p><h3>Link Discord</h3>
            <p>Run <code className={styles.inlineCode}>/auth</code> in the club server and follow the private link to connect your account.</p>
          </li>
          <li className={`${styles.tile} ${styles.rise}`} data-animate="rise" style={stagger(4)}>
            <p className={styles.n}>03</p><h3>Pick a track</h3>
            <p>Competitions, products or research. Find a concrete goal and people to work on it with.</p>
          </li>
        </ol>
      </div>
    </section>
    <section className={styles.final} aria-labelledby="close-heading">
      <Stars />
      <span className={styles.x} aria-hidden="true" style={{ left: "20%", top: "26%", animationDelay: ".6s" }}>✕</span>
      <span className={styles.x} aria-hidden="true" style={{ right: "22%", top: "34%", animationDelay: "2.1s" }}>✦</span>
      <div className={`${styles.page} ${styles.layer}`}>
        <h2 id="close-heading"><span className={styles.rise} data-animate="rise">Reinforce</span> <MarkerText>it.</MarkerText></h2>
        <p className={styles.rise} data-animate="rise" style={stagger(1)}>Open to students at SST. No prior ML required, only the willingness to learn in public.</p>
        <div className={`${styles.hctas} ${styles.rise}`} data-animate="rise" style={stagger(2)}>
          <LandingButton href="/auth" large>Join the club</LandingButton>
          <LandingButton href="https://github.com/Reinforce-SST" variant="ghost" large external>Browse the code</LandingButton>
        </div>
      </div>
    </section>
  </>;
}
