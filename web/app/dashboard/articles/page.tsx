import DiscoveryClient from "../DiscoveryClient";

export const metadata = { title: "Article Hub" };

export default function Page() {
  return <DiscoveryClient kind="articles" />;
}
