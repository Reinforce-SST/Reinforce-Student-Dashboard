"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { MemberProvider } from "@/lib/useMember";
import RequireAuth from "./RequireAuth";
import MemberIcon from "./MemberIcon";
import theme from "./MemberTheme.module.css";
import styles from "./DashboardShell.module.css";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return <div className={theme.theme}><RequireAuth><MemberProvider><DashboardChrome>{children}</DashboardChrome></MemberProvider></RequireAuth></div>;
}
function DashboardChrome({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 901px)");
    const closeOnWide = () => { if (wide.matches) dialog.current?.close(); };
    wide.addEventListener("change", closeOnWide);
    return () => wide.removeEventListener("change", closeOnWide);
  }, []);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, [open]);
  return <div className={styles.shellLayout}>
    <a href="#member-content" className={styles.skip}>Skip to content</a>
    <aside className={styles.desktopSidebar}><Sidebar /></aside>
    <dialog ref={dialog} id="member-drawer" aria-label="Navigation" className={styles.drawer} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.drawerContent}><button className={styles.close} onClick={() => dialog.current?.close()} aria-label="Close navigation"><MemberIcon name="close" /></button><Sidebar onNavigate={() => dialog.current?.close()} /></div>
    </dialog>
    <div className={styles.mainWrapper}><Header menuOpen={open} onMenu={() => { dialog.current?.showModal(); setOpen(true); }} /><main id="member-content" tabIndex={-1} className={styles.contentArea}>{children}</main></div>
  </div>;
}
