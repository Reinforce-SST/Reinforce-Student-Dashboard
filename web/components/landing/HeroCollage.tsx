import Image from "next/image";
import type { ReactNode } from "react";
import mark from "@/public/brand/logo_mark_trim.png";
import { rowDelay, stagger } from "./Primitives";
import MotionToggle from "./MotionToggle";
import styles from "@/app/page.module.css";

function Bar({ size = "m", color = "", index = 0 }: { size?: "s" | "m" | "l"; color?: string; index?: number }) {
  return <div className={`${styles.bar} ${styles[size]} ${styles[color] ?? ""}`} style={rowDelay(index)} />;
}

function PanelCard({ title, position, index, children }: { title: ReactNode; position: string; index: number; children: ReactNode }) {
  return <div className={`${styles.card} ${styles[position]}`} data-animate="card" style={stagger(index)}>
    <h3>{title}</h3>{children}
  </div>;
}

export default function HeroCollage() {
  return <div className={styles.collage}>
    <div className={styles.beam} aria-hidden="true" />
    <div className={styles.collagePanels} role="img" aria-label="Illustration of submissions, leaderboard, tickets, papers and the club ledger. Bars are decorative, not live records.">
      <div aria-hidden="true" className={styles.collageContents}>
        <PanelCard title="Submissions" position="cA" index={0}>
          <Bar size="l" /><Bar index={1} />
          <div className={styles.hl}><Bar size="l" index={2} /><Bar size="s" index={3} /></div>
          <Bar index={4} /><Bar size="s" index={5} />
        </PanelCard>
        <PanelCard title="Leaderboard" position="cB" index={1}>
          <Bar color="gold" size="l" /><Bar color="blue" index={1} /><Bar color="violet" index={2} />
          <Bar color="green" size="s" index={3} /><Bar size="s" index={4} /><Bar index={5} /><Bar color="ember" size="s" index={6} />
        </PanelCard>
        <PanelCard title="Tickets" position="cC" index={2}>
          <Bar /><div className={styles.hl}><Bar size="l" index={1} /><Bar index={2} /></div>
          <Bar size="s" index={3} /><Bar size="l" index={4} />
        </PanelCard>
        <PanelCard title="Papers" position="cD" index={3}>
          <Bar color="violet" size="l" /><Bar index={1} /><Bar size="s" index={2} />
          <Bar color="violet" index={3} /><Bar size="l" index={4} />
        </PanelCard>
        <Image className={styles.mark} src={mark} alt="" sizes="470px" loading="eager" />
        <PanelCard title={<>Ledger <span className={styles.cardNote}>illustrated</span></>} position="cE" index={4}>
          {["Pick a track", "Register a project group", "File a resource request", "Follow the ticket in Discord", "See your records on the web"].map((label, i) => (
            <div className={styles.row} key={label} style={rowDelay(i)}>
              <span className={styles.ic}>0{i + 1}</span><span>{label}</span><i className={styles.line} />
            </div>
          ))}
          <Bar color="gold" size="l" index={6} /><Bar index={7} />
        </PanelCard>
      </div>
    </div>
    <MotionToggle />
  </div>;
}
