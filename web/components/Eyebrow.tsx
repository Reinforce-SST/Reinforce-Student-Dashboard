import styles from "./Eyebrow.module.css";

type Props = {
  /** Section number, e.g. "01". Rendered after a brand-coloured slash. */
  index?: string;
  children: React.ReactNode;
  align?: "left" | "center";
};

/** `/ 01 · SECTION LABEL` — the mono rule that announces every Ledger section. */
export default function Eyebrow({ index, children, align = "center" }: Props) {
  return (
    <p className={`mono ${styles.eyebrow} ${align === "center" ? styles.center : ""}`}>
      <span className={styles.slash}>/</span>
      {index ? <span className={styles.index}>{index}</span> : null}
      {index ? <span className={styles.dot}>·</span> : null}
      <span>{children}</span>
    </p>
  );
}
