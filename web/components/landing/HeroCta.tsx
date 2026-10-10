"use client";

import { LandingButton } from "./Primitives";
import { useAuth } from "@/lib/useAuth";

export default function HeroCta({
  variant = "hero",
}: {
  variant?: "hero" | "closing";
}) {
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);

  if (variant === "closing") {
    return (
      <>
        {isLoggedIn ? (
          <LandingButton href="/dashboard" large>Go to your dashboard</LandingButton>
        ) : (
          <LandingButton href="/auth" large>Join the club</LandingButton>
        )}
        <LandingButton href="https://github.com/Reinforce-SST" variant="ghost" large external>
          Browse the code
        </LandingButton>
      </>
    );
  }

  return (
    <>
      {isLoggedIn ? (
        <LandingButton href="/dashboard" large>Go to your dashboard</LandingButton>
      ) : (
        <LandingButton href="/auth" large>Join the club</LandingButton>
      )}
      <LandingButton href="#ledger" variant="ghost" large>
        See the ledger
      </LandingButton>
    </>
  );
}
