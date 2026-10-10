import { Suspense } from "react";
import type { Metadata } from "next";
import SpgManagementClient from "./SpgManagementClient";

export const metadata: Metadata = {
  title: "Project Clusters (SPG) · Reinforce SST",
  description: "Manage and monitor Special Project Groups across the Reinforce ecosystem.",
};

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: "40px 20px", color: "#8c8c98", textAlign: "center" }}>Loading SPG directory…</div>}>
      <SpgManagementClient />
    </Suspense>
  );
}
