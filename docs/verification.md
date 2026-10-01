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

# End-to-end. Builds and starts the app itself, then drives a real browser.
npx playwright install --with-deps chromium
npm run e2e
```

The end-to-end suite lives in `web/tests/e2e/` and runs in CI. It signs a
member in, walks every dashboard section, and asserts the behaviour that unit
tests cannot reach: header titles, the mobile drawer, master-detail filtering,
RSVP, attachment safety, Discord linking, and the recovery paths for a failed
profile, ticket, event or report load. Every API and Firebase call is fulfilled
in the browser by `web/tests/e2e/fixtures/`, so the suite needs no server, no
credentials and no network.

To reuse an installed Chrome instead of downloading Chromium:

```bash
PLAYWRIGHT_CHANNEL=chrome npm run e2e
```

The suite covers 320px and 390px phones, 768px and 1024px tablets, and desktop,
and fails on any horizontal overflow. What it still cannot prove is that a live
account works: mocked responses verify layout, contracts and error states, not
Firestore permissions, Discord role assignment or ticket thread delivery. Those
remain live acceptance checks. Capture screenshots after UI changes.

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

## 29 September live-site audit follow-up on PR #37

The live-site report found nine issues on the deployed `main` site. These are
branch fixes and local checks; production remains unchanged until the PR is
merged and both web and API are deployed.

| Finding | Branch status |
|---|---|
| F1 ledger 500 and false zero | The contribution query no longer needs a composite Firestore index. Unhandled API errors keep the allowed CORS header. The profile shows a retryable error rather than a zero ledger. |
| F2 other member ledger | A signed-in member reads only approved, display-safe records through `/contributions/public/user/{user_id}`. The private owner/admin route remains restricted. |
| F3 mobile profile overflow | Ledger tabs wrap within the card. The document measured 390 px at a 390 px viewport and 320 px at a 320 px viewport. |
| F4–F7 search, bell, articles, ideas | Implemented earlier in PR #37; validate again with real signed-in content after deployment. |
| F8 SPG membership | A tier no longer presents an inactive account as a club member. The charter explains the leader requirement and links directly to a support ticket for activation. Only an admin can change the membership flag. |
| F9 deployment and bot | This document and the repo deployment map describe the VPS and Vercel surfaces. The API health check returned 200, but YUVI's old Render health URL returned 503. [YUVI PR #13](https://github.com/Reinforce-SST/YUVI/pull/13) is still open; Discord delivery remains unverified. |

The new profile error state and public ledger were rendered in temporary local
fixtures at [390 px](screenshots/audit-2026-09-29/profile-ledger-error-390.png)
and [390 px with an approved entry](screenshots/audit-2026-09-29/public-profile-ledger-390.png).
The [SPG membership guidance](screenshots/audit-2026-09-29/spg-membership-guidance-390.png)
was also rendered at 390 px. Those fixtures were removed after screenshots; no
production account, ticket, or contribution was changed.

After deployment, sign in with an account whose ledger has approved entries.
Confirm `/profile` and another member's profile show their own approved records,
and that a forced API failure shows Retry without a zero claim. Check the
390 px and 320 px ledger and the SPG support link. Do not mark Discord ticket
delivery verified until the YUVI repair is deployed and a real ticket thread
is observed.

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
