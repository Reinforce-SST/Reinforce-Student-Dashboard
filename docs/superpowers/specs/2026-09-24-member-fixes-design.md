# Verified member dashboard

Approved by the user on 2026-09-24: option 2, coordinated Dashboard and YUVI PRs.

## Behavior
- Keep the merged landing design. Shorten the low-information statistics block on mobile.
- Use Google popup sign-in; cancellation returns to idle, blocked popups give an actionable retry. Do not redirect into the known cross-origin storage failure.
- YUVI issues a private, random 256-bit link token, valid for ten minutes. Store only its SHA-256 hash in `discord_link_tokens`. Pass the token in `/auth#link_token=...`.
- The API atomically consumes the token and updates both existing user documents. Same-user retries are idempotent. Reject expiry, replay by another user, and conflicting proven identities. Reject raw Discord IDs. Existing links must be reverified; ticket authorization checks proof version 1 and reciprocal email/Discord documents.
- Require the existing internal webhook secret and a matching proven database link before granting a Discord role. `/auth` can issue another token to retry a failed role grant. Report role status accurately.
- Profile and tickets use the API. Profile edits persist to Firestore. Ticket details show the latest conversation. Hide confidential reports and foreign tickets. Sort visible tickets before applying the cap; take the latest 300 messages and display chronologically.
- Remove production mock data and local-only writes. Unsupported routes explain availability and direct members to Discord. Only supported routes appear in navigation.
- Use a mobile drawer with keyboard dismissal, focus handling, and no reserved sidebar width. Preserve the existing black/yellow visual language.

## Boundaries
No new runtime dependencies. Tests use Python unittest and Node's built-in test runner with the existing TypeScript compiler. No merges, production configuration changes, or real member-data writes. Signed commits use the user's existing Git identity and no tooling coauthors. Dashboard PR targets `feat/ledger-web`; YUVI PR targets `main`.

## Rollout
Deploy Dashboard API and web together, then YUVI in the same window. Old `?discord_id=` links instruct the member to rerun `/auth`. Both servers need the same existing `BOT_INTERNAL_SECRET`, Firestore project, and a reachable configured bot URL. The known YUVI URLs returned 503 during research; service recovery and live Google/Discord acceptance remain deployment tasks. Firestore client rules must deny direct client access to link-token documents. Expired documents may be deleted by TTL on `expires_at`; expiry is enforced in code even without TTL.

## Validation
Regression tests for token expiry/replay/conflicts, reciprocal ownership, confidential tickets, query caps, blocked/cancelled popup behavior, persistence failures, and unavailable data. Lint/build, backend startup without live writes, and browser checks/screenshots at desktop and phone sizes. Review every diff before signed commits and PR creation.

## Research
- https://firebase.google.com/docs/auth/web/redirect-best-practices (Option 2: popup)
- https://firebase.google.com/docs/firestore/manage-data/transactions
- Dashboard PR #7 at bd105e9 and YUVI main at a2398d0.
