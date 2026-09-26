import type { Metadata } from "next";
import SpgManagementClient from "./SpgManagementClient";

export const metadata: Metadata = {
  title: "Project Clusters (SPG) · Reinforce SST",
  description: "Manage and monitor Special Project Groups across the Reinforce ecosystem.",
};

export default function Page() {
  return <SpgManagementClient />;
}
