# Integrated website, API, and bot rollout

## Local verification

- `cd server && uv sync --locked && uv run python -m unittest discover -s tests -t . -q`
- `cd server && uv run python -m compileall -q app main.py`
- `cd web && npm ci && npm test && npm run lint && npm run build`
- `cd client && npm ci && npm run build` (legacy client remains until the
  Vercel project uses `web/`)

`web/tests/browser-verification.mjs` runs against the local Next.js dev server
using an isolated Firebase session and intercepted API responses. It exercises
the current `/users/*` and `/tickets/*` responses, landing sign-in to dashboard,
private Discord token, profile save and failure recovery, ticket list/detail,
desktop/mobile layout, and navigation. It takes screenshots. Puppeteer MCP was
not available in the authoring environment; the same script ran in headless
Chrome through Playwright. Browser fixtures do not bypass production auth.

Start the test server with deliberately fake client configuration:

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=demo-member-review \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-reinforce \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-reinforce.firebaseapp.com \
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 \
npm run dev -- --hostname 127.0.0.1 --port 3107
```

The browser script exports a `verify(page, screenshotsDir)` function for a
Playwright page. Its API and Google responses are fixtures, not production data.

## Coordinated deployment

1. Review the integration PR into `main`. It contains the frontend work from
   #7 and #23 plus the backend branch. Merging #23 alone into #7 does not deploy
   the backend.
2. Deploy the API from this branch and the Next.js `web/` app together. The
   existing Vercel project has served the legacy `client/` Vite app; change its
   root directory to `web/` when the team is ready for the Next.js site. The
   root and `client/vercel.json` files contain Vite rewrites and are not valid
   configuration for the Next.js app.
3. Use the same Firebase project in API and web. Configure `NEXT_PUBLIC_API_BASE_URL`
   with the deployed API's `/api/v1` URL, and authorize the frontend domain in
   Firebase Authentication. Enable Google sign-in when the team is ready.
4. Merge and deploy YUVI's secure-link PR #9 and ticket-bridge PR #10 as a
   coordinated bot release. Point `FRONTEND_AUTH_URL` to the deployed Next.js
   `/auth` page. Set matching `BOT_INTERNAL_SECRET` values on both backends and
   `YUVI_BOT_URL` to the reachable bot webhook. The frontend accepts both query
   and fragment `link_token` URLs; YUVI #9 issues fragment URLs.
5. Deny client access to `discord_link_tokens` and client writes to `users` in
   Firestore rules. Existing raw-ID links must be reverified through YUVI `/auth`.
   Conflicting aliases require an admin review; the API refuses to reassign one.
6. On the deployed pair, test a real Google sign-in, dashboard redirect, private
   `/auth` link, role grant and retry, profile save/reload, and an owned Discord
   ticket. Include an affected Opera/Zen browser and a phone. Confirm the API
   health endpoint and bot availability before directing members to the site.

The backend tests and browser fixtures never touch production Firestore or the
Discord gateway. A passing PR check does not establish that the live sign-in,
Firestore transaction, bot webhook, or production Vercel routing works.
