import type { Metadata } from "next";
import { Suspense } from "react";
import TicketManagementClient from "./TicketManagementClient";

export const metadata: Metadata = {
  title: "Ticket System & Dispatch · Reinforce SST",
  description: "Submit and track member requests, compute grants, charters, and confidential reports.",
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "40px 20px", color: "#8c8c96", textAlign: "center" }}>
          Loading ticket dispatch system...
        </div>
      }
    >
      <TicketManagementClient />
    </Suspense>
  );
}
