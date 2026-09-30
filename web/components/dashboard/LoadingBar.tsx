"use client";

import styles from "./LoadingBar.module.css";

interface LoadingBarProps {
  loading: boolean;
  className?: string;
  height?: number | string;
  color?: string;
}

export default function LoadingBar({
  loading,
  className = "",
  height = "3px",
  color,
}: LoadingBarProps) {
  if (!loading) return null;

  return (
    <div
      className={`${styles.container} ${className}`}
      style={{ height }}
      role="progressbar"
      aria-label="Loading content"
      aria-busy="true"
    >
      <div
        className={styles.indicator}
        style={color ? { background: color } : undefined}
      />
    </div>
  );
}
