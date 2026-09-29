import { Suspense } from "react";
import SearchClient from "./SearchClient";

export const metadata = { title: "Search" };

export default function Page() {
  return <Suspense fallback={<p>Searching…</p>}><SearchClient /></Suspense>;
}
