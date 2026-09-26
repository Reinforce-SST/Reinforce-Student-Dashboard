# Landing page verification

Verified 2026-09-23 against the production build on `http://127.0.0.1:3002`.

## Commands

From `web/`:

```sh
npm ci --no-audit --no-fund
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
```

All passed. No dependencies or environment variables were added. This stacked PR targets `feat/ledger-web`; the current workflow only triggers on `main`, so local verification is required even though a `web` CI job exists.

## Browser checks

Puppeteer MCP was unavailable in the session. Screenshots and interactions used Playwright MCP with Chromium. `browser-checks.js` is a reusable async function for the MCP `browser_run_code_unsafe` tool's `code` argument; it does not add a project dependency.

| Check | Observed result |
| --- | --- |
| 1440, 768, 390 pixel widths; full-page scroll | No horizontal overflow or unrevealed visible content |
| Collage | Desktop positioning; two columns plus full-width ledger at tablet; one column at mobile |
| Track tabs | Click, Left/Right with wrap, Home/End; one selected/focusable tab and one exposed panel; copy and image change |
| Figures | Intermediate count values observed, final `3`, `100%`, `0`; no replay on scroll-back |
| Navigation | Condenses to 58px visible height past 40px; progress reaches 1 at page end |
| Mobile menu | Opens and follows the joining anchor |
| Buttons, cards, tiles, screenshots, tabs, nav links | Hover exercised: lifts, sheen, warm border, tile rule and nav underline; visible 2px keyboard focus |
| Reduced motion at load and live preference change | Zero running animations; all content and final numbers readable |
| Pause after reduced motion is disabled | Works using the stable landing container |
| JavaScript disabled | All three track panels and final figures readable, no mobile overflow |
| IntersectionObserver unavailable | Content readable and pause control works |
| Public landing network/runtime | Zero API/CDN font requests; zero runtime errors |
| `/tracks`, `/projects` | HTTP 200, existing headings and shared chrome render |
| `/auth?discord_id=123456789012345678` | HTTP 200; query preserved; existing “Not configured” state without Firebase credentials |

Chrome reported unused CSS-preload warnings during Next.js route prefetching. No failing requests or runtime errors were observed in the final page. Continuous decoration was paused with the visible control for repeatable screenshots, after scrolling normally through all entrances.

## Screenshots

- [Desktop, 1440px](desktop.webp)
- [Tablet, 768px](tablet.webp)
- [Mobile, 390px](mobile.webp)

## Content decisions

The approved mockup was ported with these factual corrections from the brief and existing routes:

- Omitted placeholder testimonials, unverified cohort size/application status and the unverified four-minute joining promise.
- Kept only the three structure/policy constants.
- Used the real Vercel hostname in preview frames and `/auth`, the command registered in YUVI's `cogs/auth.py`, in both onboarding instructions.
- Labelled dashboard screenshots as interface previews with sample data; collage rows are explicitly an illustration.
- Described filing and following tickets in Discord. Removed claims that Discord records already appear in the dashboard: the parent branch currently uses an in-memory sample store.
- Linked only existing routes/repositories and the existing club contact address. No invented handbook, status page or Discord invite.
- Pointed the Contributing link at `main` so deleting the parent feature branch will not break it.

## Merge-readiness review

PR #20 remains stacked on PR #7. These landing corrections do not make the combined product ready for release:

- `web/lib/useClubStore.tsx` initializes profiles, tickets and other dashboard data from samples. Updates use local React state, not the API or Firestore. Connect supported screens to authenticated API methods and remove or gate unsupported actions before claiming persistence.
- `server/app/api/v1/endpoints/auth.py` accepts a caller-supplied numeric Discord ID without ownership proof. PR #7's ticket endpoints trust that linked ID for authorization. Fix ownership verification before relying on it to protect member records. This was established from source; no live account linking or cross-member data access was attempted.
- The API address embedded in the deployed production auth page is `https://reinforce-student-dashboard-ue6h.onrender.com/api/v1`. Read-only checks returned health 200, unauthenticated profile/tickets 401, and successful CORS preflights for production and this PR's preview. These checks do not prove authenticated Firestore persistence or bot role assignment.
- The landing delta applies cleanly after the current PR #7 head. After #7 merges, retarget to `main`, rebase the landing commits if needed for the squash merge, and rerun checks against the resulting base. Neither PR was merged during this review.

## Limits

No live Google sign-in, Discord account linking, signed-in dashboard, Firestore persistence, bot role assignment or local backend start was tested. API health/auth rejection/CORS checks were read-only. This change does not alter those paths or their configuration. Screenshots of dashboard screens intentionally use the existing reference assets, not live member records. The blockers above and a core-member review remain required before merging.
