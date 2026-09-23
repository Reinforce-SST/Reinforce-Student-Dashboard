# Reinforce landing page implementation plan

**Goal:** Replace `/` with the approved warm black and gold landing page, stacked on PR #7.
**Spec:** `/data/Downloads/Reinforce-Landing-Implementation-Brief.md`, the adjacent proposal PDF and HTML mockup (approved 2026-09-23).
**Architecture:** Server-rendered marketing content, one scoped client motion boundary, and accessible client track tabs. CSS Modules port the approved mockup; existing public chrome gets an opt-in landing presentation so other routes retain their styling.
**Stack:** Existing Next.js, React and TypeScript; no new dependencies.

## Constraints and decisions

- Base: published PR #7 head `e4edc0b`, not the three unrelated local dashboard commits.
- Worktree: `/home/laterabhi/Projects/reinforce-landing-page`; branch: `feat/landing-page`; PR base: `feat/ledger-web`.
- Preserve `/auth`, API, Firestore, legacy client and deployment configuration.
- No API requests from the landing page; join actions link to `/auth`.
- Trim existing brand images; use existing real UI screenshots, visibly labelled as sample data.
- Omit quotes and cohort count; remove unverified application status, time-to-join claims, fictional bot commands and domains.
- Use Caveat through next/font as directed by the approved brief.
- Keep Reveal and the default Pill appearance for their existing consumers.
- Animate transforms and opacity; use transform layers for the marker wipe and nav contraction (the mockup itself animates clip-path and height, contrary to the brief's performance requirement).
- Reduced motion, missing IntersectionObserver and disabled JavaScript must preserve readable final content.
- Exact-path staging, signed commits using the configured member identity, no tooling co-authors.

## Tasks

- [x] 1. Port hero, collage and motion foundation. Add scoped palette, self-hosted Caveat, trimmed assets, and optional landing navigation. Browser-check hero, narrow collage layout, scroll chrome and reduced motion.
- [x] 2. Port tracks, ledger and YUVI. Accessible tabs swap copy and screenshot; keyboard Left/Right/Home/End works. Static screenshots use next/image. Only `/verify` is shown. Check real links and absence of API requests.
- [x] 3. Port policy figures, joining, close and footer. Figures animate once with final values available without JS. Omit unavailable testimonials and cohort count. Verify the entire page at 1440, 768 and 390 pixels, hover/focus states and existing public/auth routes.
- [x] 4. Run lint/build, inspect full diff, obtain a fresh code review, capture screenshots and prepare every PR template section. Verify signed author-only commits and the exact stacked range before publishing.

## Review focus

1. Navigation after scroll restoration and resizing must retain accurate progress and visible links.
2. Keyboard tabs must move focus and selection together, with correctly associated panels.
3. Reduced motion enabled before or during entry must stop loops/counting and reveal terminal lines.
4. JavaScript disabled or observer unavailable must leave all substantive copy and numbers visible.
5. A mobile viewport or long real deployment hostname must not overflow the page or hide controls.

## Verification record

Baseline at `e4edc0b`: `npm ci --no-audit --no-fund`, `npm run lint` and `npm run build` passed. No environment credentials needed for the public page. Browser MCP available: Playwright (Puppeteer unavailable).

Final verification: lint/build passed after all product changes. Playwright MCP exercised the production build at 1440/768/390, all tabs/keys, hover/focus, once-only count-up, nav contraction and progress. Reduced motion produced zero running animations and final figures; no-JS exposed all track panels; missing IntersectionObserver preserved content and pause. No API requests or browser runtime errors. Existing /tracks, /projects and /auth deep-link route return 200; auth shows its existing unconfigured state without credentials.

Fresh review found two fallback bugs (pause root in reduced-motion/observer fallback; no-JS hidden track panels). Both were reproduced before their fixes and verified afterwards. Focused follow-up review found no new concrete issues. Evidence and reproducible browser checks are in `docs/verification/landing/`.
