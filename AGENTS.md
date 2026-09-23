# AGENTS.md

Operating context for AI coding agents working in this repository. Humans should
read [`CONTRIBUTING.md`](CONTRIBUTING.md) — this file assumes you have read it too
and adds what is not obvious from the code.

---

## What this repository is

The Reinforce Club (SST) platform. Three surfaces, one codebase:

| Surface | State | Path |
|---|---|---|
| Public website | Not built | — |
| Member dashboard | Login + profile only | `client/` |
| Admin console | Not built | — |
| API | Auth routes only | `server/` |

The product specification is the PRD. The gap between the PRD and what exists is
large — roughly 12% of the PRD is implemented. **Do not assume a feature exists
because the PRD describes it.** Check the code.

## Deployment topology

This is the part that surprises people. Three separate services, two repositories,
one shared database.

```
  reinforce-student-dashboard.vercel.app      Vercel   (this repo, client/)
                 │
                 ▼
  reinforce-student-dashboard.onrender.com    Render   (this repo, server/)
                 │
                 ├──────────────► Firestore  project reinforce-sst-bfda8
                 │                              ▲
                 ▼                              │
  yuvi-182k.onrender.com                        │
  + Discord gateway connection         Render   │  (repo: Reinforce-SST/YUVI)
                 └────────────────────────────►─┘
```

The Discord bot is **a different repository** — [`Reinforce-SST/YUVI`](https://github.com/Reinforce-SST/YUVI).
It shares this project's Firestore. It does not share this repository's code, its
types, or its CI. Nothing in this repo will fail to build when you break the bot.

## Critical coupling points

Read these before changing anything structural.

### 1. `/auth` is a bot deep-link target

YUVI builds its verification link as `{FRONTEND_AUTH_URL}#link_token={one-time-token}` and sends
it to members as an ephemeral Discord message. `FRONTEND_AUTH_URL` is an environment
variable **on Render, in the bot's repo** — not in this codebase, not greppable here.

If you move, rename, or gate the route that handles the private link token, member
verification breaks silently for everyone, and nothing in this repo errors. Changing
it requires a coordinated change to the bot's Render environment.

### 2. Firestore is a shared, untyped contract

Both services read and write the same collections with no schema enforcement. A
renamed field does not throw — it reads back as `None` and renders as a blank.

The full document shapes are written down in [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md).
**That file is the source of truth for anything crossing the boundary.** Derive from
it; do not guess field names from the UI.

### 3. The user document is written twice

`server/app/api/v1/endpoints/auth.py` writes the same payload to both
`users/{email}` and `users/{discord_id}`. Linking and unlinking now update both in a transaction. The email document remains
the source of truth for editable profile fields. See docs/DATA_CONTRACT.md.

## Known defects — do not "fix in passing"

These are real and logged. Fixing one is a scoped PR with a description, not a
drive-by edit inside an unrelated change.

- **Developer Test Mode is live in production** (`client/src/App.jsx`). It renders a
  fake authenticated dashboard to any visitor. Contained — the backend rejects the
  simulated token — but it must be gated behind an environment check.
- **Events and Projects tabs render hardcoded fake content.** Invented workshops with
  invented dates, shipped to real users. They have no data source behind them.
- **`allow_origins=["*"]`** on the API (`server/main.py`).
- **Legacy Discord records need reverification.** Raw-ID links no longer grant
  access; members must open a fresh private YUVI token link. See docs/verification.md.
- **`server/app/firebase.py` calls `storage.bucket()` at import time** with an empty
  default. Crashes on import for anyone without the env var set — this is why local
  backend setup fails for new contributors.
- **Empty schema files are committed**: `schemas/blogs.py`, `schemas/events.py`,
  `schemas/tickets.py` are zero bytes. They are placeholders, not deleted code.
- **`utils/ticket_manager.py` in the YUVI repo** references `TicketCategory` without
  importing it — passing a category filter raises `NameError`. Different repo; noted
  because it affects the same collection you will be reading.

## Conventions

- **Never invent content.** No placeholder events, no sample students, no lorem
  ipsum, no plausible-looking data standing in for a missing API. If the data source
  does not exist, the component is not finished. This rule exists because the current
  production site violates it.
- **Verify against the live service, not against the repo.** Both backends are
  publicly reachable and have `/health` and `/openapi.json`. Check what is actually
  deployed before concluding something is missing.
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
