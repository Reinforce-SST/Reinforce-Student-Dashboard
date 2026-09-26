import Eyebrow from "./Eyebrow";
import styles from "./PageHero.module.css";

type Props = {
  index: string;
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
};

/** The dark header every interior page opens with. */
export default function PageHero({ index, eyebrow, title, lede }: Props) {
  return (
    <section className={`section-dark grid-bg ${styles.hero}`}>
      <div className={`page ${styles.inner}`}>
        <Eyebrow index={index} align="left">{eyebrow}</Eyebrow>
        <h1 className={`display ${styles.title}`}>{title}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>
    </section>
  );
}
