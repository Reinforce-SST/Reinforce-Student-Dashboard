import type { Metadata } from "next";
import Eyebrow from "@/components/Eyebrow";
import PageHero from "@/components/PageHero";
import Pill from "@/components/Pill";
import Reveal from "@/components/Reveal";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import styles from "./tracks.module.css";

export const metadata: Metadata = {
  title: "Tracks",
  description:
    "Competitive AI, Product and Research — the three tracks at Reinforce, how project groups work, and what the club can fund.",
};

/**
 * Content here describes how the club actually operates: the three tracks are
 * the ones the Discord bot registers project groups against, and the resource
 * categories are the ones its request form accepts. Nothing is aspirational.
 */
const TRACKS = [
  {
    index: "01",
    name: "Competitive AI",
    kicker: "Kaggle",
    lede: "Scored against thousands of people, every day, on a problem nobody has solved for you.",
    body: [
      "You enter real competitions as a team. There is a public leaderboard you can see and a private one you cannot, and the gap between them is where most of the learning happens — it is how you find out whether you built something that generalises or something that memorised.",
      "Start on a beginner competition where the problem is well-posed and the baseline is public. Move to featured competitions when placing stops feeling like luck.",
    ],
    learn: ["Validation that survives contact with unseen data", "Reading a leaderboard without fooling yourself", "Working under a deadline you do not control"],
  },
  {
    index: "02",
    name: "Product",
    kicker: "Build and ship",
    lede: "Idea to deployed, in front of people who will tell you it is broken.",
    body: [
      "Take something from nothing to running in production. Users, bugs, feedback, uptime — the parts of engineering that only show up once real people touch your work, and that no course assignment can simulate.",
      "The platform this club runs on was built this way, by members, in the open. So was the Discord bot that registers your project group.",
    ],
    learn: ["Shipping something you then have to maintain", "Reading a bug report from someone who is not you", "Making decisions with incomplete information"],
  },
  {
    index: "03",
    name: "Research",
    kicker: "Read, reproduce, extend",
    lede: "Pick a paper. Reproduce it. Find where it breaks.",
    body: [
      "Take a paper apart and rebuild it from scratch. Most papers do not reproduce cleanly on the first attempt, and working out why — a missing preprocessing step, an undocumented hyperparameter, a different evaluation split — is the actual skill.",
      "Then write up what you found, including the parts that did not work. That write-up is often more useful to the next person than the result itself.",
    ],
    learn: ["Reading a paper closely enough to implement it", "Telling a real result from a lucky seed", "Writing up a negative result honestly"],
  },
];

export default function TracksPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          index="01"
          eyebrow="Three ways in"
          title={<>Pick the one that sounds <em>hardest.</em></>}
          lede="You are not locked in, and you can be in more than one. Nobody here started knowing this — the tracks exist to give you a concrete goal and people to work on it with, not to sort you."
        />

        <section className={`section-paper on-light ${styles.wrap}`}>
          <div className="page">
            {TRACKS.map((track, i) => (
              // Reveal renders the <article> itself rather than wrapping it. A
              // wrapper div would make every .track both :first-child and
              // :last-child of its own parent, so the first/last rules would
              // apply to all three and every separator would vanish.
              <Reveal as="article" key={track.index} delay={i * 60} className={styles.track}>
                <div className={styles.trackHead}>
                    <p className={`mono ${styles.trackIndex}`}>{track.index} — {track.kicker}</p>
                    <h2 className={styles.trackName}>{track.name}</h2>
                    <p className={styles.trackLede}>{track.lede}</p>
                </div>

                <div className={styles.trackBody}>
                  {track.body.map((para) => (
                    <p key={para.slice(0, 32)} className={styles.para}>{para}</p>
                  ))}

                  <p className={`mono ${styles.learnLabel}`}>What you come away with</p>
                  <ul className={styles.learn}>
                    {track.learn.map((item) => (
                      <li key={item} className={styles.learnItem}>{item}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How a project group works — the mechanics, taken from the bot's flow */}
        <section className={`section-paper-2 on-light ${styles.wrap}`}>
          <div className="page">
            <Reveal>
              <Eyebrow index="02" align="left">How a project group works</Eyebrow>
              <h2 className={styles.sectionTitle}>
                A track is a lane. <span className={styles.accent}>An SPG is the work.</span>
              </h2>
              <p className={styles.sectionLede}>
                A Student Project Group is a small team formed around one concrete goal in one
                track. You register it in the club Discord and it takes about two minutes.
              </p>
            </Reveal>

            <Reveal delay={60}>
              <dl className={styles.spec}>
                <div>
                  <dt className={`mono ${styles.specKey}`}>What you register</dt>
                  <dd className={styles.specVal}>
                    Project name and track, who is on the team, how long you expect it to take and
                    how often you will report, and what you are actually trying to do.
                  </dd>
                </div>
                <div>
                  <dt className={`mono ${styles.specKey}`}>What it gets you</dt>
                  <dd className={styles.specVal}>
                    A space to work in, a reporting cadence that keeps the project alive, and the
                    standing to request club resources.
                  </dd>
                </div>
                <div>
                  <dt className={`mono ${styles.specKey}`}>What the club can fund</dt>
                  <dd className={styles.specVal}>
                    GPU and compute time, hardware, API credits, and mentorship. Requests are for
                    registered groups and ask for proof of progress — a repository, a demo, a
                    previous milestone.
                  </dd>
                </div>
                <div>
                  <dt className={`mono ${styles.specKey}`}>No idea yet?</dt>
                  <dd className={styles.specVal}>
                    The Idea Jar holds projects people thought were worth building but will not get
                    to themselves, each tagged with a track and what you would learn. Take one out.
                  </dd>
                </div>
              </dl>
            </Reveal>
          </div>
        </section>

        <section className={`section-dark grid-bg ${styles.cta}`}>
          <div className={`page ${styles.ctaInner}`}>
            <Reveal>
              <h2 className={`display ${styles.ctaTitle}`}>
                You do not need to pick <em>correctly.</em>
              </h2>
              <p className={styles.ctaBody}>
                Join one, try it for a term, move if it is not for you. Being in the wrong track for
                six weeks costs you nothing; not starting costs you the year.
              </p>
              <div className={styles.ctaRow}>
                <Pill href="/auth" variant="filled">Verify with your SST email</Pill>
                <Pill href="/projects">See what members built</Pill>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
