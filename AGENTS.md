# AGENTS.md

Operating context for AI coding agents working in this repository. Humans should
read [`CONTRIBUTING.md`](CONTRIBUTING.md) — this file assumes you have read it too
and adds what is not obvious from the code.

---

## What this repository is

The Reinforce Club (SST) platform. Three surfaces, one codebase:

| Surface | State | Path |
|---|---|---|
| Public website | Landing page and project/track browsing | `web/` |
| Member dashboard | Auth, profile, tickets, and member navigation | `web/` |
| Legacy frontend | Vite client; still served by the older Vercel URL | `client/` |
| API | Users, tickets, SPGs, events, ideas, blogs, contributions | `server/` |

The product specification is the PRD. **Do not assume a feature exists because
the PRD describes it.** Check the code and deployment.

## Deployment topology

This is the part that surprises people. Multiple deployments, two repositories,
one shared database.

```
  www.reinforce-sst.com                       Vercel   (Next.js web/)
  reinforce-student-dashboard.vercel.app      Vercel   (legacy client/)
                 │
                 ▼
  api.reinforce-sst.com                       VPS      (this repo, server/)
                 │
                 ├──────────────► Firestore  project reinforce-sst-bfda8
                 │                              ▲
                 ▼                              │
  YUVI Discord bot                              │
  + private bridge endpoint            VPS      │  (repo: Reinforce-SST/YUVI)
                 └────────────────────────────►─┘
```

The Discord bot is **a different repository** — [`Reinforce-SST/YUVI`](https://github.com/Reinforce-SST/YUVI).
It shares this project's Firestore. It does not share this repository's code, its
types, or its CI. Nothing in this repo will fail to build when you break the bot.

## Critical coupling points

Read these before changing anything structural.

### 1. `/auth` is a bot deep-link target

YUVI builds its verification link as `{FRONTEND_AUTH_URL}#link_token={one-time-token}`
and sends it as an ephemeral Discord message. The Next.js `/auth` page accepts
both query and fragment tokens. `FRONTEND_AUTH_URL` is an environment
variable on the bot host — not in this codebase, not greppable here.

If you move, rename, or gate the route that handles the private link token, member
verification breaks silently for everyone, and nothing in this repo errors. Changing
it requires a coordinated change to the bot's environment.

### 2. Firestore is a shared, untyped contract

Both services read and write the same collections with no schema enforcement. A
renamed field does not throw — it reads back as `None` and renders as a blank.

The full document shapes are written down in [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md).
**That file is the source of truth for anything crossing the boundary.** Derive from
it; do not guess field names from the UI.

### 3. The user record has bot compatibility aliases

The website's authoritative profile is `users/{firebase_uid}`. Linking writes
`users/{email}` and `users/{discord_id}` aliases for YUVI in one transaction.
Ticket access from a legacy Discord ID requires a reciprocal link; a raw ID
is not ownership proof. See docs/DATA_CONTRACT.md.

## Known defects — do not "fix in passing"

These are real and logged. Fixing one is a scoped PR with a description, not a
drive-by edit inside an unrelated change.

- **Legacy Discord records need reverification.** Raw-ID links no longer grant
  access; members must open a fresh private YUVI token link. See docs/verification.md.
- **The older Vercel URL still selects the Vite client.** The custom domain
  serves `web/`; check both destinations before changing redirects or auth links.
- **YUVI's hosted Render health URL returns 503.** The VPS bot is a separate
  deployment; check its current commit and bridge endpoint before claiming a
  dashboard ticket reached Discord. PR #13 repairs the bridge after a queue merge.

The admin dashboard can approve an SPG registration through the ticket API;
that endpoint is the only HTTP creation path. Generic ticket status changes
cannot approve one. Live deployment still needs an end-to-end check.

## Conventions

- **Never invent content.** No placeholder events, no sample students, no lorem
  ipsum, no plausible-looking data standing in for a missing API. If the data source
  does not exist, the component is not finished. This rule exists because the current
  older Vite client violates it.
- **Verify against the live service, not against the repo.** The public API is
  reachable, while YUVI's hosted Render URL returned 503 on 29 September 2026.
  Check what is actually deployed before concluding something is missing.
- **Read the bot's source before touching shared data.** The bot's models are the
  real schema.
- Conventional Commits, signed, authored by the club member who wrote the code.
- Stage exact paths. Never `git add -A`.
- One logical change per PR.

## Design system

The brand palette derives from the club logo, sampled directly from the asset:

| Token | Hex | Source |
|---|---|---|
| Brand yellow | `#E5B731` | logo mark |
| Surface | `#212121` | logo square |
| Border | `#31343A` | logo edge stroke |

Greyscale background, electric-yellow primary, white accent. Do not introduce a
second accent hue without a decision from the design owner.

## What requires a human decision

Do not resolve these yourself. Ask.

- Anything changing a Firestore field name or collection
- Anything moving or gating `/auth`
- Adding a dependency
- Choosing or changing a licence
- Deleting the legacy `client/` app
- Which `vercel.json` is authoritative (there are two, identical, and the Vercel
  root-directory setting is not visible from the repository)
