# Reinforce web

The Next.js public website, member dashboard, and admin console for the
[Reinforce Platform](../README.md). The `/auth` route also completes private
Discord account links issued by [YUVI](https://github.com/Reinforce-SST/YUVI).

[Live site](https://www.reinforce-sst.com/) · [API](https://api.reinforce-sst.com/health) · [Rollout checks](../docs/verification.md)

## Develop

Use Node 20+ and start the [API](../server/README.md) on port 8080.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Configure the Firebase web values and `NEXT_PUBLIC_API_BASE_URL` in `.env.local`.
Open <http://localhost:3000>. The public landing page can render without the
API; member pages need a real college sign-in and the API.

```bash
npm test
npm run lint
npm run build
```

## Pages and ownership

| Location | Behavior |
|---|---|
| `app/page.tsx` | Public club site |
| `app/auth/` | Google sign-in and Discord link redemption |
| `app/dashboard/` | Member activity, SPGs, tickets, events, articles, ideas, leaderboard |
| `app/dashboard/admin/` | Authorized member, event, ticket, idea, article and merit tools |
| `lib/api.ts` | Typed HTTP calls to the FastAPI service |

The admin SPG tab reviews registration details, accepts a proposition PDF for
project groups, and approves the request through the ticket API. Approval
creates a group and resolves its ticket in one transaction. The member home
offers three mobile layouts (A/B/C) for review; the selected layout is saved
in that browser. The current feature boundaries are in
[verification.md](../docs/verification.md).

**Keep `/auth` stable.** YUVI sends `#link_token=` on its private verification
link; the page also accepts the older query form. Changing the route requires
a coordinated bot configuration change. Design tokens live in
[`app/globals.css`](app/globals.css).
