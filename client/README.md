# Legacy Vite client

This is the older React/Vite frontend. The
[main Reinforce site](https://www.reinforce-sst.com/) now serves the Next.js
app in [`web/`](../web/). The older
[Vercel URL](https://reinforce-student-dashboard.vercel.app/) still serves this
client as of 29 September 2026.

Keep it until the team has checked redirects, auth links, and any remaining
traffic. New member and admin features belong in `web/`, not here. The legacy
client provides sign-in and basic profile editing; events and SPGs link to the
main site. Discord verification requires YUVI's private `/auth` link on the
main site. Raw Discord IDs cannot verify an account.

```bash
npm ci
npm run dev
npm run build
```

See the [repository overview](../README.md) and
[rollout checklist](../docs/verification.md).
