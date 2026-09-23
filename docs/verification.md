# Member dashboard verification and rollout

## Local checks

- `cd server && uv sync --locked && uv run python -m unittest discover -s tests -v`
- `cd web && npm ci && npm test && npm run lint && npm run build`
- YUVI: `uv sync --locked && uv run python -m unittest discover -s tests -v`

Browser verification uses `web/tests/browser-verification.mjs`, run through Playwright MCP. Puppeteer MCP was unavailable in the authoring session. It injects an isolated Firebase session and intercepts API responses in the browser; production code has no test sign-in bypass. Start the local server with the explicitly fake config:

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=demo-member-review \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-reinforce \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-reinforce.firebaseapp.com \
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 \
npm run dev -- --hostname 127.0.0.1 --port 3107
```

Pass the exported function to a Playwright page (or remove `export default` to use it as an MCP function expression). Set its screenshot directory to your checkout. It covers desktop/mobile layout, focus return and Escape/navigation dismissal, ticket details, unsafe attachment suppression, profile save/reload/failure and preservation of drafts across ID-token refresh, empty/unlinked/error/retry states, unavailable routes, private link preservation through React effect replay, pending Discord roles, and sign-out. Fixture names in screenshots are test data, not production members.

## Coordinated rollout

1. Review and merge this PR into `feat/ledger-web` before #7 is merged into main. PR #20's landing implementation is already part of that branch. This change removes its low-information statistics block; it does not replace the landing design.
2. Recover the YUVI service and confirm its current URL. At research time the known `yuvi-oxug` and `yuvi-182k` Render URLs returned HTTP 503. No production settings were changed in this PR.
3. Ensure both services use the same Firestore project. Set matching `BOT_INTERNAL_SECRET` values on Dashboard API and YUVI. Configure API `YUVI_BOT_URL` to the reachable `/internal/verify-success` endpoint. Without the secret the webhook deliberately fails closed; the website reports role pending.
4. Confirm Firestore client rules deny all access to `discord_link_tokens` and client writes to `users`. These are Admin-SDK-only records. Set an optional Firestore TTL policy on `discord_link_tokens.expires_at` to clean up expired tokens. Code enforces expiry regardless of TTL.
5. Deploy the Dashboard API and `web/` frontend together, then the coordinated YUVI PR. Set the bot's `FRONTEND_AUTH_URL` to the deployed **web** `/auth` route. Set `NEXT_PUBLIC_API_BASE_URL` to the live API `/api/v1` URL (the `-ue6h` health endpoint was reachable during research; the older documented URL was not). Verify Firebase authorized domains for this frontend.
6. Members rerun `/auth`. Old raw-ID links and legacy clients cannot create verified links. Existing records are retained, but ticket access requires fresh ownership proof. A pre-existing conflicting email/Discord pair requires an admin review and unlink; the new flow never silently reassigns it.
7. Test real Google popup sign-in, a fresh private link, a role grant, role retry, profile save/reload, and an owned ticket on the deployed pair. Check Chrome plus an affected Opera/Zen browser and a phone. A blocked popup gives an allow-popups retry message; redirect is intentionally disabled until compatible hosting exists.

The legacy `client/` application remains in the repository. Its raw-ID/direct-bot linking paths are intentionally no longer authorized by these backends. Deploy `web/` as the member experience; do not point YUVI links at the legacy client. Backend tests isolate Firestore and Discord. Browser tests isolate Google and API responses. Live OAuth, production Firestore transactions, and Discord role assignment are not claimed as tested.

## Screenshots

- [Desktop member dashboard](screenshots/member-desktop.png)
- [Mobile member dashboard](screenshots/member-mobile.png)
- [Mobile menu](screenshots/member-mobile-menu.png)
- [Mobile ticket conversation](screenshots/ticket-mobile.png)
- [Mobile landing page](screenshots/landing-mobile.png)

## Review outcome

Self-review and a separate read-only review found two issues before delivery:
reciprocal proof did not validate the primary email, and an ID-token refresh could
unmount the profile form. Both now have regressions observed failing before the
fixes and passing afterward. The final suite has 16 API tests, 6 bot tests,
3 frontend unit tests, and the browser scenarios above. API and YUVI HTTP startup
were checked with synthetic credentials: health 200, unauthenticated tickets 401,
and the unconfigured bot webhook 503. No production member records were changed.
