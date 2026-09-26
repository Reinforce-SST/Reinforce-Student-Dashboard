import Link from "next/link";
import { CATEGORY_LABEL, STATUS_LABEL, type TicketSummary } from "@/lib/api";
import styles from "./MemberContent.module.css";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
export default function TicketList({ tickets }: { tickets: TicketSummary[] }) {
  return <ul className={styles.list}>{tickets.map(ticket => {
    const updated = ticket.updated_at || ticket.created_at;
    const date = updated ? new Date(updated) : null;
    return <li key={ticket.id}><Link className={styles.row} href={`/dashboard/tickets/${encodeURIComponent(ticket.id)}`}>
      <div><strong>{ticket.title}</strong><div className={styles.rowMeta}><span>{CATEGORY_LABEL[ticket.category] ?? "General"}</span>{date && !Number.isNaN(date.getTime()) && <time dateTime={updated!}>Updated {dateFormat.format(date)}</time>}</div></div>
      <span className={styles.badge} data-status={ticket.status}>{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
    </Link></li>;
  })}</ul>;
}
