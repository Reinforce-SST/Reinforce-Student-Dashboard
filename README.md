<div align="center">

<img src="https://avatars.githubusercontent.com/u/292105225?s=120" width="88" alt="Reinforce Club SST" />

# Reinforce Platform

**The public website, member dashboard, and API for the Reinforce AI/ML club at SST.**

[Website](https://reinforce-student-dashboard.vercel.app) · [YUVI repository](https://github.com/Reinforce-SST/YUVI)

</div>

---

## What this is

One platform, three surfaces:

- **Public website** — who the club is, what it runs, what its members have built
- **Member dashboard** — sign in with your SST Google account; your profile, your
  project groups, your tickets, club resources
- **Admin console** — for core members: content review, events, points, user management

It shares a Firestore database with [**YUVI**](https://github.com/Reinforce-SST/YUVI),
the club's Discord bot. Anything a member files in Discord — an SPG registration, a
resource request, an idea — appears on the website. One source of truth, two front
doors.

> **Deployment note:** `web/` contains the Next.js landing page and member
> dashboard, while the existing Vercel project has served the legacy `client/`
> app. Deploy the integrated API and select `web/` as the Vercel root before
> treating the new sign-in flow as live. See [`docs/verification.md`](docs/verification.md).

## Architecture

```
  Vercel  ──  web client
     │
     ▼
  Render  ──  FastAPI  ──┐
                          ├──  Firestore  (reinforce-sst-bfda8)
  Render  ──  YUVI bot  ──┘
     │
     └──  Discord gateway
```

The browser never touches Firestore directly. Firebase Admin credentials are
server-side only; every read and write goes through the API.

## Stack

| Layer | Technology |
|---|---|
| Website and dashboard | Next.js 16, React 19 |
| Legacy client | React 19, Vite |
| API | FastAPI, Python 3.13+ |
| Database | Cloud Firestore |
| Auth | Firebase Auth — Google OAuth, pinned to `@sst.scaler.com` |
| Hosting | Vercel (frontend), Render (API + bot) |

## Repository layout

```
web/             Next.js public website and member dashboard
client/          Legacy Vite client
server/          FastAPI service
  app/api/       Route handlers
  app/schemas/   Pydantic request/response models
docs/
  DATA_CONTRACT.md   Firestore document shapes shared with the bot — read this first
.github/         PR and issue templates, CI
AGENTS.md        Working context: coupling points, known defects, conventions
CONTRIBUTING.md  How to make a change here
```

## Running locally

**Prerequisites:** Node 20+, Python 3.13+, [`uv`](https://docs.astral.sh/uv/).

```bash
# Website and dashboard
cd web
cp .env.example .env.local    # client configuration from a core member
npm ci
npm run dev                   # http://localhost:3000

# API
cd server
uv sync --locked
# Configure Firebase Admin credentials outside the repository.
uv run uvicorn main:app --reload --port 8080
```

Interactive API docs: <http://localhost:8080/docs>

Credentials are handed out directly by core members. They are never in this
repository, in a Discord message, or in an issue.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version:

- Small, obvious, low-risk change → push straight to `main`
- Anything touching auth, Firestore shape, the bot contract, dependencies, routes,
  or deploy config → open a pull request
- If you are unsure which lane you are in, you are in the PR lane

`main` deploys automatically. Treat it as production, because it is.

## The club

Reinforce is the AI/ML club at Scaler School of Technology. We run competition
tracks, research groups, and product builds, and we publish what we learn.

- Discord — the club server, where SPGs and tickets are filed
- [`Reinforce_Club-SST`](https://github.com/Reinforce-SST/Reinforce_Club-SST) — member project archive
