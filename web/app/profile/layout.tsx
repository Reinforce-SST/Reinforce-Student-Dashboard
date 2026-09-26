import React from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const metadata = {
  title: "Profile · Reinforce",
  description: "Your Reinforce Student Profile and verified track record",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
