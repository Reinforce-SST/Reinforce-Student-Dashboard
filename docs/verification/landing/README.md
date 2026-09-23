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
- Used the real Vercel hostname in preview frames and `/verify` as the only illustrated bot command.
- Labelled dashboard screenshots as interface previews with sample data; collage rows are explicitly an illustration.
- Described the working Discord ticket mirror rather than promising automatic scoring, standing commands or role assignment by track.
- Linked only existing routes/repositories and the existing club contact address. No invented handbook, status page or Discord invite.

## Limits

No live Google sign-in, Discord account linking, signed-in dashboard, Firestore, bot service or backend start was tested. This change does not alter those paths or their configuration. Screenshots of dashboard screens intentionally use the existing reference assets, not live member records. A core-member review is still required before merging.
