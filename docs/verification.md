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
npm run lint
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

The selected Command Home layout was rendered with a temporary browser fixture
at [320px](screenshots/audit-2026-09-29/mobile-command-home-320.png) and
[390px](screenshots/audit-2026-09-29/mobile-command-home-390.png). The
[admin SPG review form](screenshots/audit-2026-09-29/admin-spg-review-390.png)
was checked at 320px, 390px, and 900px after its request summary and decision
controls were reorganized. These screenshots
verify layout only; authenticated browser and production mutations remain live
acceptance checks.

The no-event overview now hides the hero instead of showing an invented
announcement; compare its [phone](screenshots/audit-2026-09-29/dashboard-no-events-390.png)
and [desktop](screenshots/audit-2026-09-29/dashboard-no-events-desktop.png)
fixtures. The [admin banner form](screenshots/audit-2026-09-29/admin-banner-cleanup-390.png)
predates the optional badge and button fields; recheck its current layout and
preview before rollout. The updated form was checked at
[desktop](screenshots/audit-2026-09-29/admin-banner-publishable-desktop.png) and
[390px](screenshots/audit-2026-09-29/admin-banner-publishable-390.png), and a
[390px student banner](screenshots/audit-2026-09-29/dashboard-custom-banner-390.png)
was rendered from a temporary local fixture. These screenshots verify layout,
not a production publish. The legacy client's [sign-in](screenshots/audit-2026-09-29/legacy-signin-cleanup-390.png)
and [member overview](screenshots/audit-2026-09-29/legacy-overview-cleanup-390.png)
were checked at 390px. The member overview screenshot uses a temporary local
fixture that was removed before the final build.

The notification bell was restored with a data-backed panel. Local fixtures
checked its desktop, 390px, and 320px layouts; unit tests cover the source
filters and destinations. On a signed-in deployment, change a member ticket
status or review a contribution, then refresh the dashboard and confirm the
new item opens the relevant ticket or ledger page. The viewed count is browser-local, not shared
between devices.

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
Dashboard [PR #37](https://github.com/Reinforce-SST/Reinforce-Student-Dashboard/pull/37)
remains open at this check. Branch code and production code may differ.

## Live acceptance after coordinated deployment

Deploy the API before the web admin form for custom banner content. As an admin,
publish one banner with a custom badge, button label, and destination; reload
the student dashboard and confirm the displayed content and button target match
the preview. Also check an older banner still uses its default badge and event
page link.

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
   the actual data. Submit an SPG registration, approve it in Admin → SPG
   Requests, and confirm the new group appears exactly once with the ticket
   marked resolved. For a project group, upload a real proposition PDF. Test
   that a generic status change cannot approve the ticket and rejection saves
   a reason.
6. Check a 2–5 MB event image through the public API. The Storage bucket and
   Nginx `client_max_body_size` must both permit it. A 413 at Nginx is not an
   application validation error.

Record the deployed commit IDs and test ticket ID in the release notes, without
secrets or private content. If any step fails, leave the feature marked as
unverified and keep the older route available until the owner resolves it.
