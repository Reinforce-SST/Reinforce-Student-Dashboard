import LandingNav from "./landing/LandingNav";

// Every public page shares the landing navigation. The `landing` prop is kept
// so existing call sites compile; it no longer changes anything.
export default function SiteNav(_props?: { landing?: boolean }) {
  return <LandingNav />;
}
