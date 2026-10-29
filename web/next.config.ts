import type { NextConfig } from "next";

// Pulls the configured API origin into connect-src instead of hardcoding it,
// since it's a per-environment env var (local / staging / prod all differ).
function originOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`
  : "";

// The reinforce-sst.com family covers prod + the separate staging API host
// even when NEXT_PUBLIC_API_BASE_URL points somewhere else for a given build.
const connectSrc = ["'self'", "https://*.reinforce-sst.com", "https://*.googleapis.com", apiOrigin, firebaseAuthDomain]
  .filter(Boolean)
  .join(" ");

// Firebase Auth's popup sign-in flow (signInWithPopup, web/app/auth/AuthClient.tsx)
// uses a helper iframe against the project's own authDomain.
const frameSrc = ["'self'", firebaseAuthDomain].filter(Boolean).join(" ");

// 'unsafe-inline' on script-src, not a nonce: Next's documented nonce pattern
// requires every page to render dynamically (no static generation, no ISR,
// no CDN caching - confirmed against this app's own build, which statically
// prerenders the landing page and most of the dashboard shell). That's a
// sitewide performance trade not justified here, because this app has no
// inline-script injection vector for 'unsafe-inline' to reopen in the first
// place: no dangerouslySetInnerHTML, no raw HTML passthrough anywhere
// (react-markdown renders member-authored Markdown and never executes raw
// HTML - see ArticleMarkdown.tsx), so there's nowhere attacker-controlled
// content could land inside an executable <script> tag regardless of this
// directive. The CSP still earns its keep via connect-src/frame-src/img-src/
// object-src/frame-ancestors below.
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Article/idea Markdown lets members link an image from any host (see
  // ArticleMarkdown.tsx), so img-src can't be a fixed host allowlist.
  "img-src 'self' https: data:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  `frame-src ${frameSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Next generates its own AGENTS.md/CLAUDE.md here. The repository already
  // has a curated AGENTS.md at the root; a second, generated one in web/
  // would shadow it for anyone working in this directory.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
