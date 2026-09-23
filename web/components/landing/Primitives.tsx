import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import Pill from "@/components/Pill";
import styles from "@/app/page.module.css";

export const stagger = (index: number) => ({ "--i": index }) as CSSProperties;
export const rowDelay = (index: number) => ({ "--j": index }) as CSSProperties;

export function MarkerText({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return <span className={styles.marker} data-animate="marker" style={stagger(index)}>
    <span className={styles.markerWindow}><span className={styles.markerInk}>{children}</span></span>
  </span>;
}

export function LandingButton({ children, href, variant = "solid", large = false, external = false }: {
  children: ReactNode; href: string; variant?: "solid" | "line" | "ghost"; large?: boolean; external?: boolean;
}) {
  const appearance = { solid: styles.btnSolid, line: styles.btnLine, ghost: styles.btnGhost }[variant];
  return <Pill href={href} variant={variant === "solid" ? "filled" : "ghost"} external={external}
    className={`${styles.btn} ${appearance} ${large ? styles.btnLg : ""}`}>{children}</Pill>;
}

export function Stars({ faint = false }: { faint?: boolean }) {
  return <div className={styles.stars} aria-hidden="true" style={faint ? { opacity: 0.35 } : undefined} />;
}

export function ShotFrame({ image, alt, path, index = 0 }: {
  image: StaticImageData; alt: string; path: string; index?: number;
}) {
  return <figure className={`${styles.shot} ${styles.rise}`} data-animate="rise" style={stagger(index)}>
    <div className={styles.barTop} aria-hidden="true">
      <i className={styles.dot} /><i className={styles.dot} /><i className={styles.dot} />
      <span className={styles.url}>reinforce-student-dashboard-xi.vercel.app{path}</span>
    </div>
    <Image src={image} alt={alt} sizes="(max-width: 800px) 100vw, 1140px" placeholder="blur" />
    <figcaption className={styles.shotCaption}>Interface preview · sample data</figcaption>
  </figure>;
}
