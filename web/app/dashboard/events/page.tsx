import type { Metadata } from "next";
import EventsManagementClient from "./EventsManagementClient";

export const metadata: Metadata = {
  title: "Events Calendar · Reinforce SST",
  description: "Sync your schedule with the Reinforce guild's core milestones and workshops.",
};

export default function Page() {
  return <EventsManagementClient />;
}
