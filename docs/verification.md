# Verification and rollout

This checklist separates code checks from live behavior. A green build or
`/health` response does not prove Firebase sign-in, Firestore permissions,
Discord role assignment, or ticket thread delivery.

## Verified from code and local fixtures

Run from a fresh checkout:

```bash
cd server
uv sync --locked
uv run --locked pytest -q
uv run --locked python -m compileall -q app main.py

cd ../web
npm ci
npm test
npm run lint
npm run build

cd ../client
npm ci
npm run build
```

The dashboard's browser checks should cover 320px and 390px phones, 768px and
1024px tablets, and desktop. Check the overview, profile, SPG and ticket
screens, admin forms, article and idea lists, detail links, and search. Mocked
API responses can verify layout and error states; they cannot prove a live
account works. Capture screenshots after UI changes.

The 29 September mobile layout pass used a temporary local member fixture that
was removed before the final build. See the [Idea Jar](screenshots/audit-2026-09-29/ideas-mobile.png),
[admin merit form](screenshots/audit-2026-09-29/admin-merit-mobile.png), and
[profile](screenshots/audit-2026-09-29/profile-mobile.png) screenshots. These
show layout and empty states, not production data or successful mutations.

## Live topology checked 29 September 2026

| Check | Result |
|---|---|
| [`www.reinforce-sst.com`](https://www.reinforce-sst.com/) | HTTP 200; Next.js HTML |
| [`api.reinforce-sst.com/health`](https://api.reinforce-sst.com/health) | HTTP 200 |
| [`yuvi-182k.onrender.com/health`](https://yuvi-182k.onrender.com/health) | HTTP 503 |
| Older [`reinforce-student-dashboard.vercel.app`](https://reinforce-student-dashboard.vercel.app/) | Legacy Vite HTML |

YUVI [PR #10](https://github.com/Reinforce-SST/YUVI/pull/10) is merged, but
the later queue merge broke its ticket endpoint on `main`; the repair is
[YUVI PR #13](https://github.com/Reinforce-SST/YUVI/pull/13). Do not treat the
dashboard-to-Discord bridge as live until that repair is deployed and tested.
Dashboard [PR #35](https://github.com/Reinforce-SST/Reinforce-Student-Dashboard/pull/35)
also remains open at this check. Branch code and production code may differ.

## Live acceptance after coordinated deployment

1. Confirm `web/` points to the intended API and both backends use the same
   Firebase project. Set `YUVI_BOT_URL` and the same `BOT_INTERNAL_SECRET` on
   the API and bot. YUVI's `FRONTEND_AUTH_URL` must point to the Next.js `/auth`
   route. Deny client reads of `discord_link_tokens` in Firestore rules.
2. Sign in with a real `@sst.scaler.com` account. Reload the profile, save a
   harmless edit, and check that it persists. Test sign-out and a phone browser.
3. Run `/auth` in Discord and open the private link. Confirm the Verified Member
   role, then retry `/auth` to check idempotence. Never paste the private link
   or an ID token into an issue or log.
4. From that linked account, create a small dashboard ticket. Confirm exactly
   one private Discord thread, a correct owner, and message relay both ways.
   Check `report` tickets remain confidential. Test a failed bot callback and
   its visible retry path.
5. Confirm the admin claim using a fresh token. Review tickets, publish one
   test event or article, approve a test idea, and check member pages reflect
   the actual data. A registration ticket is only a request; creating an SPG
   remains a separate admin operation.
6. Check a 2–5 MB event image through the public API. The Storage bucket and
   Nginx `client_max_body_size` must both permit it. A 413 at Nginx is not an
   application validation error.

Record the deployed commit IDs and test ticket ID in the release notes, without
secrets or private content. If any step fails, leave the feature marked as
unverified and keep the older route available until the owner resolves it.
