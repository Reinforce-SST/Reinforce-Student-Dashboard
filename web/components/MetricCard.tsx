import styles from "./MetricCard.module.css";

type Props = {
  /** Small mono label, upper left. */
  label: string;
  /** Small mono label, upper right. */
  tag?: string;
  /** The figure itself. Set in the display serif at large size. */
  value: string;
  /** Unit that sits beside the figure, e.g. "comps". */
  unit?: string;
  children: React.ReactNode;
};

/**
 * A figure set in Instrument Serif against a small sans unit, over a dashed
 * rule. The element that makes the page read like a publication.
 *
 * Every value passed here must be countable from Firestore or GitHub. If a
 * number cannot be counted, cut the card — do not estimate it.
 */
export default function MetricCard({ label, tag, value, unit, children }: Props) {
  return (
    <article className={styles.card}>
      <header className={`mono ${styles.head}`}>
        <span>{label}</span>
        {tag ? <span>{tag}</span> : null}
      </header>
      <p className={styles.figure}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </p>
      <p className={styles.body}>{children}</p>
    </article>
  );
}
