<div align="center">

<img src="https://avatars.githubusercontent.com/u/292105225?s=120" width="80" alt="Reinforce Club SST" />

# Reinforce Platform

**A home for the AI/ML club at Scaler School of Technology.**

[Website](https://www.reinforce-sst.com/) · [API status](https://api.reinforce-sst.com/health) · [Discord bot](https://github.com/Reinforce-SST/YUVI) · [Contributing](CONTRIBUTING.md)

</div>

---

The public site, member workspace, and FastAPI service live here. Members can
explore events and project groups, manage a profile, file and follow tickets,
read articles, submit ideas, and see contribution history. Admins can manage
members, publish events and banners, award merit points, review tickets and
ideas, and publish articles.

## Current status

| Surface | Address | Status checked 29 September 2026 |
|---|---|---|
| Next.js website | [reinforce-sst.com](https://www.reinforce-sst.com/) | Serving the integrated frontend |
| FastAPI | [api.reinforce-sst.com](https://api.reinforce-sst.com/health) | Health endpoint returned 200 |
| YUVI hosted endpoint | [YUVI health](https://yuvi-182k.onrender.com/health) | Returned 503; Discord bridge is not verified live |
| Older Vercel URL | [reinforce-student-dashboard.vercel.app](https://reinforce-student-dashboard.vercel.app/) | Still serves the legacy Vite client |

These checks establish availability, not a complete signed-in workflow. The
dashboard ticket bridge and Discord role grant still require an end-to-end test
with a real linked member. See [verification and rollout](docs/verification.md).
In the pending dashboard changes, an admin can approve an SPG registration in
the Admin Console. Approval creates one group and resolves its ticket together;
ordinary status changes cannot approve a registration. This still needs a live
signed-in review after deployment.

## How it fits together

```text
Next.js web/ ──► FastAPI server/ ──► Firestore
                        ▲                ▲
                        │                │
                 YUVI Discord bot ───────┘
```

YUVI lives in a [separate repository](https://github.com/Reinforce-SST/YUVI).
The API and bot share Firestore document shapes, documented in the
[data contract](docs/DATA_CONTRACT.md). Firebase Admin credentials stay on the
servers; the browser calls the API with a Firebase ID token.

| Directory | Purpose |
|---|---|
| [`web/`](web/) | Next.js public site, `/auth`, dashboard, admin console |
| [`server/`](server/) | FastAPI routes and Firestore services |
| [`client/`](client/) | Legacy Vite client at the older Vercel URL |
| [`docs/`](docs/) | Data contract, workflows, and verification |

## Run locally

Use Node 20+, Python 3.13+, and [uv](https://docs.astral.sh/uv/).
Configuration examples contain names and safe defaults, never credentials.

```bash
cd server
cp .env.example .env                 # fill in your own Firebase configuration
uv sync --locked
uv run uvicorn main:app --reload --port 8080
```

In another terminal:

```bash
cd web
cp .env.example .env.local           # fill in Firebase web configuration
npm ci
npm run dev                           # http://localhost:3000
```

The API docs are at <http://localhost:8080/docs>. To verify a change, run
`uv run --locked pytest -q` in `server/` and `npm test && npm run lint && npm run build`
in `web/`. Local tests use fixtures; they do not exercise Discord or production
Firestore.

## Before changing shared behavior

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [Firestore data contract](docs/DATA_CONTRACT.md),
and [YUVI's source](https://github.com/Reinforce-SST/YUVI). Keep `/auth` compatible
with YUVI's private `#link_token=` link. Admin API access requires the verified
Firebase `admin` claim; Core and custom role labels are display metadata.
