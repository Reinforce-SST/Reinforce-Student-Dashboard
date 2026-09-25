# Member dashboard refinement

The dashboard and sign-in page now follow the landing page's warm dark palette,
brand yellow, Plus Jakarta Sans typography and compact button shapes. The overview
prioritizes recent requests, with account details alongside them. Tickets use
readable rows with search and status filters; profile fields are grouped by purpose.
No mock records, new dependencies, database fields or backend endpoints were added.

Normal landing-page sign-in now opens `/dashboard` after `/users/sync` succeeds.
Failed sync stays on `/auth` with retry. Private Discord links keep their completion
or pending-role message visible, and invalid links retain their recovery guidance.
The route and private-token contract are unchanged.

PR #22 was merged into #7 during this work. This branch is stacked directly on
the updated #7 (`feat/ledger-web`). Review and merge the design branch into #7
before the coordinated API/web/YUVI rollout.

## Verification

- Web lint, TypeScript, three unit tests, and production build pass.
- Playwright MCP screenshots were captured and visually reviewed (Puppeteer MCP
  is unavailable). Browser scenarios use Firebase/API fixtures, with no production
  bypass. They cover desktop Sign in and mobile Join the club routing, failed sync
  and retry, search/filter/clear, private-link preservation, pending roles, profile
  save/reload/failure, token refresh, navigation, focus return, and sign-out.
- Layout checked at 320, 390, 768, 1024 and 1440px with no horizontal overflow.
- No uncaught browser errors in the verification run.

Live Google OAuth and Discord role assignment have not been verified. The live
`-ue6h` API health endpoint is reachable, but its OpenAPI schema still requires
`discord_id` instead of the pending PR's `link_token`. The documented YUVI service
is suspended (503). Deploying the frontend alone cannot complete private linking.
Use the coordinated rollout in [verification.md](verification.md).

## Screenshots

The review member and ticket are isolated browser fixtures.

- [Previous desktop](https://github.com/Reinforce-SST/Reinforce-Student-Dashboard/blob/eaff8302f64087055d830a9d8030fdd1be704aca/docs/screenshots/member-desktop.png)
- [Updated desktop](screenshots/member-desktop.png)
- [Updated mobile](screenshots/member-mobile.png)
- [Mobile navigation](screenshots/member-mobile-menu.png)
- [Ticket search and filters](screenshots/tickets-mobile.png)
- [Ticket conversation](screenshots/ticket-mobile.png)
- [Profile on desktop](screenshots/profile-desktop.png)
- [Profile on mobile](screenshots/profile-mobile.png)
- [Sign-in on mobile](screenshots/auth-mobile.png)
