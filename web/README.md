# web
deployment for /web: https://reinforce-student-dashboard-xi.vercel.app/
The Reinforce platform front end — public site, member dashboard, and the
`/auth` route the Discord bot deep-links to.

Next.js App Router, TypeScript, CSS Modules. Design tokens live in
[`app/globals.css`](app/globals.css); read the header comment there before
changing any colour.

## Running it

```bash
cp .env.example .env.local     # values come from a core member
npm install
npm run dev                    # http://localhost:3000
```

The API must be running too — see [`../server`](../server). Without it the
public pages render fine but the dashboard has nothing to read.

## Layout

```
app/
  page.tsx          landing
  auth/             sign-in + Discord linking  <-- bot deep-link target
  dashboard/        member dashboard, mirrors Discord activity
components/         design-system primitives
lib/
  firebase.ts       client SDK, Google provider pinned to @sst.scaler.com
  api.ts            typed client for the Reinforce API
  useAuth.ts        auth state + token
```

## Two things not to break

**`/auth` is a deep-link target.** The bot sends members to
`{FRONTEND_AUTH_URL}#link_token={private-token}`. The page also accepts
`?link_token` for compatibility. The variable lives on Render in
the bot's repository. Moving or gating this route breaks verification silently.

**The palette is fixed.** `#E5B731` on dark, `#886A11` on light — the same hue,
darkened so it passes contrast on paper. Do not add a second accent colour.

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and [`../AGENTS.md`](../AGENTS.md).
