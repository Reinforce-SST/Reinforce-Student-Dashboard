import { Suspense } from "react";
import type { Metadata } from "next";
import ManageSpgsClient from "./ManageSpgsClient";

export const metadata: Metadata = {
  title: "Manage SPGs | Reinforce Club",
  description: "Special Project Groups management console for club administrators.",
};

export default function ManageSpgsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px 20px", color: "#8c8c98", textAlign: "center" }}>Loading SPG Console…</div>}>
      <ManageSpgsClient />
    </Suspense>
  );
}
