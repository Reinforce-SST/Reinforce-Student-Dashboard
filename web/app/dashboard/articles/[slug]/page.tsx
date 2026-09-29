import DiscoveryDetail from "../../DiscoveryDetail";

export const metadata = { title: "Article" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DiscoveryDetail kind="articles" id={slug} />;
}
