"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import dashboard from "@/reference/dashboard.png";
import groups from "@/reference/spg_browse.png";
import profile from "@/reference/profile.png";
import { LandingButton, ShotFrame, stagger } from "./Primitives";
import styles from "@/app/page.module.css";

// Copy follows /tracks. Screenshots illustrate the interface, not live track records.
const TRACKS = [
  {
    id: "competitive", name: "Competitive AI", title: "Kaggle, with a cohort",
    body: "Real competitions, real leaderboards, real deadlines. You learn by being scored against thousands of strangers on a problem nobody has solved for you.",
    points: ["Validation that survives contact with unseen data", "Reading a leaderboard without fooling yourself", "Working under a deadline you do not control"],
    image: dashboard, alt: "Reinforce member dashboard interface with sample data", path: "/dashboard",
  },
  {
    id: "product", name: "Product", title: "Build it. Put it in front of people.",
    body: "Take something from an idea to deployed. Users, bugs, feedback — the parts of engineering that only show up once real people touch your work.",
    points: ["Shipping something you then have to maintain", "Reading a bug report from someone who is not you", "Making decisions with incomplete information"],
    image: groups, alt: "Student project groups interface with sample projects", path: "/dashboard/spg",
  },
  {
    id: "research", name: "Research", title: "Read it. Reproduce it. Find the gaps.",
    body: "Pick a paper. Reproduce it. Find where it breaks. Write up what you learned. The skill that separates using a model from understanding one.",
    points: ["Reading a paper closely enough to implement it", "Telling a real result from a lucky seed", "Writing up a negative result honestly"],
    image: profile, alt: "Member profile interface with sample data", path: "/profile",
  },
];

export default function TrackTabs() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % TRACKS.length; break;
      case "ArrowLeft": next = (index + TRACKS.length - 1) % TRACKS.length; break;
      case "Home": next = 0; break;
      case "End": next = TRACKS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  };

  return <>
    <noscript>
      <style>{`.${styles.tabs}{display:none}.${styles.split}[hidden]{display:grid;margin-top:40px}`}</style>
    </noscript>
    <div className={`${styles.tabs} ${styles.rise}`} role="tablist" aria-label="Club tracks" data-animate="rise" style={stagger(3)}>
      {TRACKS.map((track, index) => <button type="button" role="tab" key={track.id}
        id={`tab-${track.id}`} aria-controls={`panel-${track.id}`} aria-selected={index === active}
        tabIndex={index === active ? 0 : -1} className={index === active ? styles.on : undefined}
        ref={(node) => { buttons.current[index] = node; }}
        onClick={() => setActive(index)} onKeyDown={(event) => onKeyDown(event, index)}>{track.name}</button>)}
    </div>
    {TRACKS.map((track, index) => <div className={styles.split} role="tabpanel" key={track.id}
      id={`panel-${track.id}`} aria-labelledby={`tab-${track.id}`} tabIndex={0} hidden={index !== active}>
      <div className={styles.rise} data-animate="rise" style={stagger(4)}>
        <h3>{track.title}</h3><p>{track.body}</p>
        <ul className={styles.ticks}>{track.points.map((point) => <li key={point}>{point}</li>)}</ul>
        <LandingButton href="/tracks" variant="line">Explore the tracks</LandingButton>
      </div>
      <ShotFrame image={track.image} alt={track.alt} path={track.path} index={5} />
    </div>)}
  </>;
}
