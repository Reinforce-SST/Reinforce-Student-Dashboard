"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Stagger within a group, in milliseconds. */
  delay?: number;
  as?: ElementType;
  className?: string;
};

/**
 * Fades and lifts its children into view once, when 15% visible.
 *
 * Two deliberate choices:
 *
 * 1. The element is only *armed* (hidden) after this effect runs and confirms
 *    IntersectionObserver exists. If JS never executes, the content stays
 *    visible instead of leaving a permanently blank page — a failure mode that
 *    is very easy to ship and very hard to notice.
 * 2. It unobserves after firing. Replaying the animation every time the user
 *    scrolls back up is the single thing that makes a site feel cheap.
 */
export default function Reveal({ children, delay = 0, as: Tag = "div", className }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    el.dataset.revealArmed = "true";
    el.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
