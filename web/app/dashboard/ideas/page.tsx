import DiscoveryClient from "../DiscoveryClient";

export const metadata = { title: "Idea Jar" };

export default function Page() {
  return <DiscoveryClient kind="ideas" />;
}
