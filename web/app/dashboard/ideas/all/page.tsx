import type { Metadata } from "next";
import { Suspense } from "react";
import AllIdeasClient from "./AllIdeasClient";
import LoadingBar from "@/components/dashboard/LoadingBar";

export const metadata: Metadata = {
  title: "All Proposals & Community Ideas · Reinforce SST",
  description: "Browse, search, and filter all community proposals, concepts, and project initiatives.",
};

export default function AllIdeasPage() {
  return (
    <Suspense fallback={<LoadingBar loading={true} />}>
      <AllIdeasClient />
    </Suspense>
  );
}

