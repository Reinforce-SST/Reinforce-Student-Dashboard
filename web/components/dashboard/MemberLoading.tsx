import Image from "next/image";
import styles from "./DashboardShell.module.css";

export default function MemberLoading({ message }: { message: string }) {
  return <div className={styles.memberLoading} role="status" aria-live="polite">
    <Image
      className={styles.loadingLogo}
      src="/brand/logo_main_trim.png"
      width={2221}
      height={519}
      alt=""
      priority
    />
    <span className={styles.loadingTrack} aria-hidden="true" />
    <p className={styles.loadingMessage}>{message}</p>
  </div>;
}
