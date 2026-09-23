"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReveal } from "./useReveal";
import styles from "@/app/page.module.css";

export default function LandingMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>("[data-landing-nav]");
    const progress = root.querySelector<HTMLElement>("[data-progress]");
    let frame = 0;
    const update = () => {
      frame = 0;
      nav?.toggleAttribute("data-condensed", window.scrollY > 40);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      if (progress) progress.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <div ref={ref} className={styles.landing} data-landing>{children}</div>;
}
