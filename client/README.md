# Legacy Vite client

This is the older React/Vite frontend. The
[main Reinforce site](https://www.reinforce-sst.com/) now serves the Next.js
app in [`web/`](../web/). The older
[Vercel URL](https://reinforce-student-dashboard.vercel.app/) still serves this
client as of 29 September 2026.

Keep it until the team has checked redirects, auth links, and any remaining
traffic. New member and admin features belong in `web/`, not here. The known
developer test mode and hardcoded Events/Projects content in this client are
legacy defects; do not use it to verify production member workflows.

```bash
npm ci
npm run dev
npm run build
```

See the [repository overview](../README.md) and
[rollout checklist](../docs/verification.md).
