import type { Metadata } from "next";
import ResourcesClient from "./ResourcesClient";

export const metadata: Metadata = {
  title: "Learning Resources · Reinforce SST",
  description: "Courses, talks, slides and links the Reinforce team recommends, by track.",
};

export default function Page() {
  return <ResourcesClient />;
}
