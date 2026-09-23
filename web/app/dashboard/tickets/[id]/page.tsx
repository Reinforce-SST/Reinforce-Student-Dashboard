"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, STATUS_LABEL, type TicketThread } from "@/lib/api";
import { useMember } from "@/lib/useMember";
import styles from "@/components/dashboard/MemberContent.module.css";

function safeUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useMember();
  const [state, setState] = useState<{ key: string; data?: TicketThread; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${token}:${id}`;
  useEffect(() => {
    let active = true;
    api.ticket(token, id).then(data => { if (active) setState({ key, data }); })
      .catch(error => { if (active) setState({ key, error: error instanceof ApiError && error.status === 404 ? "This ticket is unavailable or does not belong to your verified Discord account." : "The conversation could not be loaded. Please try again." }); });
    return () => { active = false; };
  }, [token, id, key, attempt]);
  const data = state?.key === key ? state.data : undefined;
  const error = state?.key === key ? state.error : undefined;
  return <div className={styles.page}>
    <Link href="/dashboard/tickets" className={styles.muted}>← Your tickets</Link>
    {error ? <div role="alert" className={styles.card}><p>{error}</p><button className={styles.button} onClick={() => { setState(null); setAttempt(value => value + 1); }}>Retry</button></div> : !data ? <p role="status">Loading the conversation…</p> : <>
      <div className={styles.intro}><p className={styles.eyebrow}>{STATUS_LABEL[data.ticket.status]}</p><h1 className={styles.title}>{data.ticket.title}</h1></div>
      <section className={styles.card}><h2>Request details</h2><p className={styles.muted}>{data.ticket.description}</p><dl className={styles.facts}>{data.ticket.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>{data.ticket.close_reason && <p className={styles.muted}>Closed: {data.ticket.close_reason}</p>}{data.ticket.thread_url && safeUrl(data.ticket.thread_url) && <div className={styles.actions}><a href={safeUrl(data.ticket.thread_url)!} target="_blank" rel="noreferrer" className={styles.button}>Continue in Discord</a></div>}</section>
      <section className={styles.card}><h2>Conversation</h2><p className={styles.muted}>Latest 300 messages. Reply in Discord to keep the conversation together.</p>{data.messages.length === 0 ? <p className={styles.muted}>No messages have been synced yet.</p> : data.messages.map(message => <article key={message.id} className={styles.message}><strong>{message.sender_name}</strong>{message.timestamp && <p className={styles.muted}><time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString()}</time></p>}<p>{message.content}</p>{message.attachments.map((url, index) => safeUrl(url) ? <a key={`${url}:${index}`} href={safeUrl(url)!} target="_blank" rel="noreferrer">Attachment {index + 1}</a> : null)}</article>)}</section>
    </>}
  </div>;
}
