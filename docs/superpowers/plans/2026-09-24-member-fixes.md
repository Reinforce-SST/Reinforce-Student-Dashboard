# Verified member dashboard implementation plan

> Execute inline using superpowers:executing-plans. The user approved implementation of the recommended design; do not add another approval round.

**Goal:** Resolve the Discord-chat failures with real, securely scoped member data and usable mobile navigation.
**Architecture:** YUVI issues hashed one-time tokens in the shared Firestore database. The API consumes them transactionally and exposes authenticated profile/ticket data to the Next.js dashboard.
**Tech Stack:** Python/FastAPI/Firebase Admin, Next.js/React/TypeScript, existing Firebase JS SDK.
**Spec:** ../specs/2026-09-24-member-fixes-design.md

## Global Constraints
- No new runtime dependencies, no production writes, no merges.
- No fake production data; preserve landing design.
- Signed commits with existing user identity, no tooling coauthors.
- Two coordinated PRs, Dashboard stacked on #7.

## Review Focus
- Stolen/replayed/expired token cannot link a second account.
- Legacy or inconsistent user documents cannot authorize ticket access.
- Deliberate popup dismissal does not navigate away.
- Failure to persist or grant a role is visible and retryable.
- Narrow screens and long real content do not overflow.

## Tasks
1. Secure shared identity contract (both repositories).
   - [x] Add Python unittest regressions for token issuer/consumer, ownership, expiry, idempotent retries, conflicts, unlink and bot webhook validation; observe failure.
   - [x] Implement `discord_link_tokens`, SHA-256 IDs, ten-minute expiry and atomic consumption; `discord_link_version=1` on both user documents.
   - [x] Replace numeric linking payload with `link_token`, guard webhook with existing secret and reciprocal database proof, allow role retry.
   - [x] Run tests and document rollout/data contract.
2. API ticket correctness.
   - [x] Regress >100 owned records with reports/newest record after cap, >300 messages, legacy links and foreign/hidden detail.
   - [x] Filter/sort before cap, newest messages in chronological display; enforce reciprocal proof.
   - [x] Run server unittest suite.
3. Frontend auth and real data.
   - [x] Regress popup cancellation/error handling using Node test runner and TypeScript compilation.
   - [x] Remove redirect fallback and subscribe immediately to refreshed ID tokens; consume fragment token with retry-safe API requests.
   - [x] Replace mock store with member API state, profile edit/save, read-only ticket list/detail, explicit loading/error/empty states.
   - [x] Replace unsupported page contents, remove mock data/local writes and fake notifications/search.
4. Mobile and landing copy.
   - [x] Implement drawer navigation with focus, Escape/backdrop/navigation close and sign-out.
   - [x] Simplify low-information landing statistics copy and compact the mobile block.
   - [x] Run lint/build and browser checks at 390 and 1440 pixels, including API failure/empty/unlinked cases; save screenshots.
5. Verification and delivery.
   - [x] Add CI tests including PRs targeting feat/ledger-web; run complete relevant checks and backend startup.
   - [x] Review full diff, obtain fresh whole-branch review, fix substantive findings with regression tests.
   - [ ] Stage exact paths, sign commits, verify authorship/signatures, push branches and create linked PRs with validation and rollout notes. Do not merge.
