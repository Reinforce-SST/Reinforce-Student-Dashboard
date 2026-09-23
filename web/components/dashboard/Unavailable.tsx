import Link from "next/link";
import styles from "./MemberContent.module.css";
export default function Unavailable({ title }: { title: string }) {
  return <section className={`${styles.page} ${styles.card}`}><p className={styles.eyebrow}>Member space</p><h1 className={styles.title}>{title}</h1><p className={styles.muted}>This area is not available on the website yet. Use the club Discord for updates, project groups, and requests.</p><div className={styles.actions}><Link className={styles.button} href="/dashboard">Back to your dashboard</Link><Link className={`${styles.button} ${styles.secondary}`} href="/dashboard/tickets">View your tickets</Link></div></section>;
}
