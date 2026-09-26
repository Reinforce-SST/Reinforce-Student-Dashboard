"use client";

import { useEffect, type RefObject } from "react";

/** One observer for the whole landing page. Server content stays readable without JS. */
export function useReveal(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-animate]"));
    const frames = new Set<number>();
    let observer: IntersectionObserver | undefined = undefined;

    const finish = () => {
      observer?.disconnect();
      frames.forEach(cancelAnimationFrame);
      frames.clear();
      elements.forEach((el) => { el.dataset.in = "true"; });
      root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        el.textContent = `${el.dataset.count}${el.dataset.suffix ?? ""}`;
      });
    };

    const countUp = (el: HTMLElement) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix ?? "";
      if (!target || media.matches) return;
      const start = performance.now();
      let frame = 0;
      const step = (now: number) => {
        frames.delete(frame);
        const progress = Math.min(1, (now - start) / 1100);
        el.textContent = `${Math.round(target * (1 - (1 - progress) ** 3))}${suffix}`;
        if (progress < 1) {
          frame = requestAnimationFrame(step);
          frames.add(frame);
        }
      };
      frame = requestAnimationFrame(step);
      frames.add(frame);
    };

    if (media.matches || typeof IntersectionObserver === "undefined") {
      finish();
      return;
    }

    root.dataset.motionReady = "true";
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.dataset.in = "true";
        const numeral = el.querySelector<HTMLElement>("[data-count]");
        if (numeral) countUp(numeral);
        observer?.unobserve(el);
      }
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    elements.forEach((el) => observer?.observe(el));

    const onPreference = () => { if (media.matches) finish(); };
    media.addEventListener("change", onPreference);
    return () => {
      observer?.disconnect();
      frames.forEach(cancelAnimationFrame);
      media.removeEventListener("change", onPreference);
      delete root.dataset.motionReady;
    };
  }, [ref]);
}
