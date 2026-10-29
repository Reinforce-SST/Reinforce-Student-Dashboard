# Contributing to the Reinforce Platform

This repository runs the Reinforce Club platform: the public website, the member
dashboard, and the FastAPI service that the YUVI Discord bot talks to.

**Real students use this.** Their college email, their Discord identity, and their
project records live behind it. Treat `main` as production, because it is — every
merge deploys automatically.

Read this once before your first change. It is short on purpose.

---

## 1. The two lanes

We do not require a pull request for everything. Small, obvious, low-blast-radius
changes can go straight to `main`. Anything that can break a user, a deploy, or
another person's work goes through a PR.

If you are unsure which lane you are in, **you are in the PR lane.**

### Lane A — push directly to `main`

Allowed when **all** of these are true:

- Fewer than ~50 changed lines, across no more than 3 files
- No new dependency added or removed
- No change to authentication, authorisation, or anything under `server/app/api/`
- No change to a Firestore collection, document shape, or field name
- No new page, route, or API endpoint
- No change to CI, deploy config, or environment variables
- The app still builds and runs locally after your change

Typical Lane A work: fixing a typo, correcting copy, adjusting spacing or a colour
token, updating a doc, adding an image asset, bumping a patch version.

### Lane B — open a pull request

Required if **any** of these are true:

- It touches auth, sessions, tokens, roles, or permissions
- It touches Firestore: a new collection, a renamed field, a changed document shape
- It changes an API request or response shape that the frontend or the bot depends on
- It adds or removes a dependency
- It adds a page, a route, or an endpoint
- It changes the design system (tokens, typography, shared components)
- It touches CI, `vercel.json`, Render config, or any environment variable
- It is larger than roughly 50 lines or 3 files
- You are new to the repository and this is your first change

> **The bot contract is always Lane B.** The YUVI Discord bot reads and writes the
> same Firestore project this API does. A field rename here silently breaks the bot
> in a different repository, with no build error to warn you. See
> [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md).

---

## 2. Branches

Branch off `staging` (or `main` for critical production hotfixes). Name it `type/short-description`:

```
feat/events-page
fix/discord-link-race
chore/upgrade-vite
docs/contributing
refactor/dashboard-layout
```

Do not work directly on someone else's branch without telling them.

## 3. Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). The type prefix is
not decoration — it is how we read the history when something breaks at 2am.

```
feat(dashboard): add SPG mirror view
fix(auth): stop verification retry on 4xx from bot webhook
chore(deps): bump firebase-admin to 7.6.1
docs(readme): document Render environment variables
```

Rules:

- **Sign your commits.** `git commit -S`. Configure signing once and forget it:
  <https://docs.github.com/authentication/managing-commit-signature-verification>
- **Commit under your own identity.** Every commit must be authored by the club
  member who wrote it. Do not add co-authors who did not write the code, and do not
  attribute commits to tooling.
- One logical change per commit. If your commit message needs the word "and", it is
  probably two commits.
- Never force-push to `main`. Never rewrite history someone else has pulled.

## 4. Pull requests

Fill in the template. It is four questions and it exists so the reviewer does not
have to reverse-engineer your intent from the diff.

**Before you open it, self-review your own diff.** Read every line as if someone
else wrote it. Most review comments we leave are things the author would have caught
by reading their own change once.

A PR is ready when:

- [ ] The frontend builds (`npm run build`) and the linter passes (`npm run lint`)
- [ ] The backend starts without errors
- [ ] You have manually exercised the change in a browser, and said so in the PR
- [ ] Screenshots or a screen recording are attached for any visual change
- [ ] No secrets, `.env` files, or service account keys are in the diff
- [ ] No debug logging, commented-out code, or placeholder content is left behind
- [ ] The description says what you tested and what you did **not** test

**Scope discipline:** one PR, one purpose. If you notice an unrelated bug while
working, open an issue for it — do not fold the fix into your PR. Mixed PRs are the
single most common reason review stalls here.

**Staging files:** add the exact paths you changed. Do not use `git add -A` or
`git add .` — that is how `.env` files and scratch notes end up in public history.

### Review

- One approval from a core member merges it
- Anything touching auth, Firestore shape, or the bot contract needs a second pair
  of eyes
- Squash-merge. The PR title becomes the commit message, so write it properly
- The author merges after approval, not the reviewer

---

## 5. Hard rules

These are not style preferences. Breaking one of these is a revert, not a comment.

1. **Never commit secrets.** No `.env`, no `serviceAccountKey.json`, no tokens, no
   Discord bot token, no Firebase private key. If you commit one by accident, say so
   immediately and rotate it — removing the commit is not enough, it is already in
   the reflog and in anyone's clone.
2. **Never ship placeholder content to production.** No lorem ipsum, no invented
   events, no fake names, no hardcoded sample data rendered as if it were real. If
   the data source does not exist yet, the feature is not ready to merge.
3. **Never expose a developer or test bypass in a production build.** Gate it behind
   an environment check.
4. **Never rename or repurpose a Firestore field** without updating the YUVI bot in
   the same change window, and announcing it.
5. **Never break `/auth`.** The bot deep-links members to that route to verify. If it
   moves, the bot's `FRONTEND_AUTH_URL` must move with it, in the same change window.

## 6. Local setup

```bash
# Frontend
cd client
cp .env.example .env     # ask a core member for the values
npm install
npm run dev

# Backend
cd server
uv sync
# place serviceAccountKey.json here — ask a core member, never commit it
uv run uvicorn main:app --reload --port 8080
```

Credentials are handed out by core members directly. They are never in the repo, in
Discord messages, or in an issue.

## 7. Getting unstuck

Ask in the club Discord before spending a second day blocked. A five-minute question
is cheaper than a day of guessing. Open an issue for anything that outlives the
conversation.
