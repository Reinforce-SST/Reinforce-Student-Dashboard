"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";

export default function MotionToggle() {
  const [paused, setPaused] = useState(false);
  return <button type="button" className={styles.pause} aria-pressed={paused} onClick={(event) => {
    const next = !paused;
    event.currentTarget.closest("[data-landing]")?.toggleAttribute("data-paused", next);
    setPaused(next);
  }}>{paused ? "Resume motion" : "Pause motion"}</button>;
}
