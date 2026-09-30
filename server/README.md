# Reinforce API

FastAPI and Firestore service for the [Reinforce Platform](../README.md). The
Next.js dashboard and the separate [YUVI bot](https://github.com/Reinforce-SST/YUVI)
both depend on its shared data contract.

## Local setup

Requires Python 3.13+ and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
uv sync --locked
uv run uvicorn main:app --reload --port 8080
```

Configure Firebase Admin credentials outside Git. The API reference is at
<http://localhost:8080/docs>; public health is `GET /health`.

```bash
uv run --locked pytest -q
uv run --locked python -m compileall -q app main.py
```

Tests use Firestore doubles and do not write to the live database.

## API areas

| Prefix | Purpose |
|---|---|
| `/api/v1/users` | Member profiles, directory, Discord linking, admin roles |
| `/api/v1/tickets` | Member requests, conversations, status |
| `/api/v1/spgs` | Project groups and reports |
| `/api/v1/events` | Events, registrations, attendance, media |

Event create and update accept optional `banner_badge_text`,
`banner_cta_text`, and `banner_cta_url` fields for the dashboard hero.
The list and detail responses return them. Older event documents need no
migration; see the [Firestore contract](../docs/DATA_CONTRACT.md).
| `/api/v1/contributions` | Auditable merit records and leaderboard |
| `/api/v1/ideas` | Idea submission, voting, moderation |
| `/api/v1/blogs` | Published articles |

The [Firestore contract](../docs/DATA_CONTRACT.md) defines cross-repository
fields. The [SPG workflow](../docs/SPG_WORKFLOW.md) distinguishes registration
tickets from actual project-group creation. `POST /api/v1/tickets/{id}/approve-spg`
is the admin-only creation path. It reads the stored registration, validates its
UIDs and optional proposition PDF, then resolves the ticket and creates the
group in one Firestore transaction. A generic ticket status change cannot
approve a registration.

## Deployment notes

Set the Firebase project and Storage bucket on the API host. The dashboard API
uses `YUVI_BOT_URL` and a matching `BOT_INTERNAL_SECRET` for private bot
callbacks. The same secret must be configured on YUVI. Image uploads also need
a Storage bucket and an Nginx request-body limit above the 5 MB application
limit. See [admin setup](../docs/ADMIN_ROLES.md) and
[rollout verification](../docs/verification.md).

Admin access is checked from the verified Firebase custom claim `admin: true`.
The Firestore `is_admin` field is for display and cannot grant API access.
