import tickets from "@/reference/tickets.png";
import TrackTabs from "./TrackTabs";
import { MarkerText, ShotFrame, Stars, rowDelay, stagger } from "./Primitives";
import styles from "@/app/page.module.css";

export default function WorkSections() {
  return <>
    <section className={styles.band} id="tracks" aria-labelledby="tracks-heading">
      <Stars faint />
      <div className={`${styles.page} ${styles.layer}`}>
        <div className={styles.center}>
          <p className={`${styles.eyebrow} ${styles.rise}`} data-animate="rise">Three tracks</p>
          <h2 className={`${styles.h2} ${styles.rise}`} id="tracks-heading" data-animate="rise" style={stagger(1)}>
            Pick a lane. <MarkerText index={1}>Get ranked.</MarkerText>
          </h2>
          <p className={`${styles.lede} ${styles.rise}`} data-animate="rise" style={stagger(2)}>
            Not a syllabus and not a lecture series. Competitions, products and papers — each track has its own definition of done.
          </p>
        </div>
        <TrackTabs />
      </div>
    </section>
    <section className={`${styles.band} ${styles.alt}`} id="ledger" aria-labelledby="ledger-heading">
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={`${styles.eyebrow} ${styles.rise}`} data-animate="rise">The ledger</p>
          <h2 className={`${styles.h2} ${styles.rise}`} id="ledger-heading" data-animate="rise" style={stagger(1)}>
            Do the work. <MarkerText index={1}>It counts.</MarkerText>
          </h2>
          <p className={`${styles.lede} ${styles.rise}`} data-animate="rise" style={stagger(2)}>
            Start in Discord. Register a project group, request resources or share an idea through the club bot. Keep updates and discussion with the ticket.
          </p>
        </div>
        <ol className={`${styles.three} ${styles.threeSpaced}`}>
          {[
            ["Do the work", "A competition entry, a paper reproduction, a pull request. Pick a concrete goal and build towards it."],
            ["It gets recorded", "Register a project group or file a request through the club’s Discord bot. Keep the discussion with the work."],
            ["Keep it moving", "Follow your ticket in Discord and add updates to the conversation as the work progresses."],
          ].map(([title, body], index) => <li key={title} className={`${styles.tile} ${styles.rise}`} data-animate="rise" style={stagger(index + 3)}>
            <p className={styles.n}>STEP 0{index + 1}</p><h3>{title}</h3><p>{body}</p>
          </li>)}
        </ol>
        <ShotFrame image={tickets} alt="Ticket system interface showing sample requests and statuses" path="/dashboard/tickets" index={6} wide />
      </div>
    </section>
    <section className={`${styles.band} ${styles.deep}`} aria-labelledby="bot-heading">
      <Stars faint />
      <div className={`${styles.page} ${styles.layer}`}>
        <div className={`${styles.split} ${styles.botSplit}`}>
          <div className={styles.rise} data-animate="rise">
            <p className={styles.eyebrow}>YUVI, the club bot</p>
            <h2 className={`${styles.h2} ${styles.botTitle}`} id="bot-heading">Onboarding starts with <MarkerText>one command</MarkerText></h2>
            <p>The bot sends you a private link to the site. Sign in with your college email to connect your Discord identity to your club record.</p>
            <ul className={styles.ticks}>
              <li>Google sign-in pinned to @sst.scaler.com</li>
              <li>One linked identity across Discord and the web</li>
              <li>Project groups and resource requests through the club bot</li>
            </ul>
          </div>
          <div className={`${styles.code} ${styles.rise}`} data-animate="code" style={stagger(1)}>
            <div className={styles.cb}>Discord · verification flow</div>
            <pre><code>
              <span className={styles.ln} style={rowDelay(0)}><span className={styles.c1}>/auth</span></span>
              <span className={styles.ln} style={rowDelay(1)}><span className={styles.c2}>↳ Open your private verification link</span></span>
              <span className={styles.ln} style={rowDelay(2)}>reinforce-student-dashboard-xi.vercel.app</span>
              <span className={styles.ln} style={rowDelay(3)}><span className={styles.c1}>/auth</span></span>
              <span className={styles.ln} style={rowDelay(4)}>{" "}</span>
              <span className={styles.ln} style={rowDelay(5)}><span className={styles.c2}>Sign in with your SST Google account.</span></span>
              <span className={styles.ln} style={rowDelay(6)}><span className={styles.c2}>Follow the prompts to link Discord.</span> <span className={styles.cur} aria-hidden="true" /></span>
            </code></pre>
          </div>
        </div>
      </div>
    </section>
  </>;
}
