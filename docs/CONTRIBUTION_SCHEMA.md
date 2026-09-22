> ## STATUS: PROPOSED SCHEMA — NOT YET PART OF THE FIRESTORE DATA CONTRACT
>
> The contract in `server/app/schemas/contributions.py`, now implemented by the
> award API (§11). The API reads and writes a `contributions` collection, but that
> collection is **not yet described in** [`DATA_CONTRACT.md`](DATA_CONTRACT.md) and
> still needs the team's approval as a persistence contract.

# Contribution Schema

## 1. Purpose

A contribution records one piece of credited activity — an event, a hackathon
placement, SPG or project work, mentoring, teaching, a blog or trophy item,
club service — so points, the leaderboard and a Verified tag can be derived from
it, audited and recalculated.

## 2. Core invariant

Points are never stored as a running total. They are derived:

```
activity → ContributionRecord (pending) → review → approved → SUM(points) GROUP BY contributor_id
```

Every point traces back to a record of who earned it, for what, and who approved
it; a mistake is fixed by revoking one record. A per-user counter incremented in
place — as PR #7's frontend mock does with `points + 10` — cannot be audited.

## 3. Models

```
ContributionDetails     category, title, description, points, source, event_id, occurred_at
├─ AdminAwardStudent    + spg_id          POST /contributions/award/student/{student_id}
├─ AdminAwardSPG                          POST /contributions/award/spg/{spg_id}
└─ ContributionBase     + contributor_id, spg_id
   ├─ ContributionCreate                  a trusted recorder's input, e.g. the bot
   └─ ContributionRecord  + server-owned lifecycle metadata
AdminRevokeRecord       status_reason     PATCH /contributions/{record_id}/revoke
```

The recipient comes from the path, never the body: `student_id` for a student
award, `spg_id` for an SPG award — the server resolves the SPG's members and
creates one record each, all carrying that `spg_id`. `occurred_at` is required:
it is when the activity happened, not when the award was clicked. A direct award
may be approved at once, but the server sets `status`, `reviewed_by` and
`reviewed_at`; no request can choose them. Revocation takes only a reason; the
revoker and time come from the authenticated caller.

| Field | Owner | Rule |
|---|---|---|
| `contributor_id` | recorder | Non-blank opaque string |
| `category` | recorder | `ContributionCategory` (§4) |
| `title` | recorder | 1–200 characters after trimming |
| `description` | recorder | Optional; 1–2000 characters; required when `category` is `other` |
| `points` | recorder | Strict integer, ≥ 0 (§5) |
| `source` | recorder | Optional `ContributionSource` (§4) |
| `event_id`, `spg_id` | recorder | Optional, independent context (§4) |
| `occurred_at` | recorder | When the activity happened |
| `id` | server | Non-blank |
| `schema_version` | server | Exactly the integer `1` |
| `status` | server | `ContributionStatus` (§6) |
| `recorded_by` | server | The authenticated caller who recorded it |
| `created_at` | server | When it was recorded |
| `reviewed_by`, `reviewed_at` | server | Per lifecycle (§6) |
| `revoked_by`, `revoked_at` | server | Per lifecycle (§6) |
| `status_reason` | server | Per lifecycle (§6) |
| `deduplication_key` | server | Optional (§7) |

- **Unknown fields are rejected, never dropped**, so a `ContributionCreate` that
  sets a server-owned field fails. Unlike `UserDocument`, which tolerates legacy
  keys, this is a new contract: drift should fail loudly.
- **Identifiers are opaque** — no email, Firebase UID or snowflake format is
  assumed. Strings are trimmed; blanks are rejected.
- **Timestamps** need a timezone and are normalised to UTC. JSON renders
  `2026-09-01T10:00:00+00:00`, the `isoformat()` form the users collection
  already holds, not Pydantic's default `Z`. Python-mode dumps keep `datetime`s.
- **`schema_version`** lets a future shape change be migrated deliberately. Only
  the integer `1` passes — `True` and `1.0` compare equal to `1` but are rejected.
- **Enum values** stay `str` instances in Python-mode dumps and equal their values;
  Firestore's value encoder writes them as plain strings. When formatting one
  into text, use `.value`: `str()` and f-strings give `ContributionStatus.APPROVED`.

## 4. Category, context and source

Three independent things, each with exactly one representation:

- **Category** — what the contributor did.
- **Context** — `event_id` and `spg_id`: the event it happened at and the SPG it
  was done as. Either, both or neither may be set.
- **Source** — what it is about or produced: `project`, `blog` or `trophy_item`.
  Events and SPGs are never sources, so "linked to event X" cannot be said twice.

| Activity | `category` | Context | `source` |
|---|---|---|---|
| Attended event X | `participation` | `event_id=X` | `null` |
| Organised event X | `organizing` | `event_id=X` | `null` |
| Won hackathon H as SPG S, with project P | `achievement` | `event_id=H, spg_id=S` | `project:P` |
| Ran workshop W | `teaching` | `event_id=W` | `null` |
| Delivered a milestone of project P | `project_work` | `spg_id=S` | `project:P` |
| Mentored SPG S | `mentorship` | `spg_id=S` | `null` |
| Published blog B | `content` | — | `blog:B` |
| Added trophy item T | `content` | — | `trophy_item:T` |
| Club operations | `service` | — | `null` |
| Anything else | `other` — description required | any | any |

Context and sources are opaque IDs: `EventRecord` (`schemas/events.py`: `id`,
`name`) and `SPGRecord` (`schemas/spgs.py`: `id`, `name`, `type`, `member_ids`,
`lead_id`, `status`) are minimal placeholders, never embedded in a contribution.
The schema does not check that a referenced entity exists; the endpoint does.
Adding a category or source type is an enum change, coordinated with every reader.

`trophy_item` replaced `library_item` in the backend on the club president's
request. Whether it is a rename or a different concept is an **open product
decision**; `library_item` is not kept as an alias. `blog` follows the existing
`schemas/blogs.py`; PR #7's frontend says "article", but there is one term.

### SPGs

An SPG is Reinforce's common team abstraction. Different workflows use different
types; a contribution references any of them only through `spg_id`.

| `SPGType` | Team formed for |
|---|---|
| `learning` | Structured learning together |
| `project` | Building a project or product |
| `event` | An event hosted or managed by Reinforce |
| `external_event` | An outside hackathon, competition or event |
| `miscellaneous` | Anything legitimate that fits none of the above |

The type is required and never free text. "High value" is importance, not a
type, and has no field yet. `SPGStatus` values remain provisional.

## 5. Points

- Strict integer, `≥ 0`: `0`, `1`, `10`, `250` pass; `True`, `"10"`, `10.0`, `-1` fail.
  `0` records an activity without awarding points.
- No negative points — penalties are not approved; corrections are revocations.
- No maximum, and one field: caps, base/awarded splits and bonuses are points policy.

## 6. Lifecycle

```
pending ──► approved ──► revoked
   └──────► rejected
```

| `status` | `reviewed_by`, `reviewed_at` | `revoked_by`, `revoked_at` | `status_reason` |
|---|---|---|---|
| `pending` | absent | absent | absent |
| `approved` | required | absent | absent |
| `rejected` | required | absent | required |
| `revoked` | required — the original approval is kept | required | required |

The record also enforces `reviewed_at ≥ created_at` and `revoked_at ≥ reviewed_at`,
but does not bound `occurred_at` — future-dated activity is endpoint policy. It
validates one record in isolation: the transition rules shown above need the
previous record, so the endpoint enforces them. Nothing is deleted; rejected and
revoked records remain as audit history.

### Verification

`is_verified` is a read-only property, true exactly when `status` is `approved` —
the same condition as `counts_toward_leaderboard`. It is never stored and cannot
be supplied, so there is no boolean to drift from `status`. It drives the Verified
tag on blogs, trophy items or any other contribution.

It means **"this contribution was reviewed and approved by Reinforce"** — not that
Reinforce certifies the underlying content as factually correct. If a blog or
trophy entity later gets its own editorial review, that entity owns that state;
it is not duplicated here. Blogs have no review workflow yet.

```python
ContributionRecord(contributor_id="user_123", category="content",
                   title="Published an ML guide", points=20,
                   source={"type": "blog", "id": "blog_456"},
                   status="approved", ...)        # is_verified, counts: True, True
# The same record while pending                   # is_verified, counts: False, False
# A trophy item: category="content",
#   source={"type": "trophy_item", "id": "trophy_789"}, status="approved"
```

## 7. Deduplication

`deduplication_key` is an optional, server-owned idempotency aid — not the record
ID, and not unique-enforced by the schema. The server sets it only when the
activity has a deterministic identity, so a bot processing the same attendance
twice produces the same key. Illustrations only; the endpoint decides the format
(built from enum `.value`s):

```
attendance:event123:user123
blog:blog456:user123
trophy_item:trophy789:user123
project_work:project12:milestone7:user123
spg_award:spg001:<award id>:user123
```

Otherwise it is `null` and review catches duplicates. No uniqueness is derived
from contributor, category and source: work on one project in September and
again in October is two legitimate records.

## 8. Leaderboard derivation

A contributor's points are the `SUM(points)` of their records whose read-only
`counts_toward_leaderboard` property is true — exactly when `status` is
`approved`. The property is never stored, and there is no leaderboard model,
stored total or cache. Time windows (by `occurred_at`), per-track or per-category
boards and tie-breaking are query decisions. PR #7's mock columns are all
derivable — `articlesCount` from `content`, `eventWinsCount` from `achievement`
with an `event_id`, `spgCount` from distinct `spg_id`s — though its `name` and
`track` need `users`, and `tier` does not exist yet. An SPG award is never a
total on the SPG: it is one record per member, each summed like any other.
`StudentResponse.points` is this sum, computed on read — never a stored counter.

## 9. Immutability

Once recorded, the content fields (§3, recorder-owned) are treated as immutable;
only lifecycle fields change, through review and revocation. A correction is a
rejection (if pending) or revocation (if approved) plus a new record. There is no
`updated_at`: each lifecycle change carries its own timestamp. The schema does not
enforce this — if approved for persistence, the write paths must.

## 10. Endpoint Parity Checklist

For comparing Aryan's endpoint contract against this schema:

- [ ] **Contributor identifier semantics** — `contributor_id`, opaque; which identity it holds is open (§12)
- [ ] **Category enum values** — exactly the nine in §4
- [ ] **Source representation** — nested `{type, id}` for `project`, `blog`, `trophy_item` only
- [ ] **Context representation** — `event_id` and `spg_id`, never an event or SPG source
- [ ] **Title/description constraints** — §3, including `other` requiring a description
- [ ] **Strict points behaviour** — §5
- [ ] **Request-owned fields** — the recorder fields in §3, and nothing else
- [ ] **Server-owned fields** — never accepted from a request
- [ ] **Timestamp serialization** — timezone required, UTC, `+00:00`
- [ ] **Status values** — `pending`, `approved`, `rejected`, `revoked`
- [ ] **Lifecycle rules** — the table in §6
- [ ] **Deduplication key ownership** — server-set only; key format per activity
- [ ] **Error semantics** — schema failures surface as FastAPI 422; agree codes for duplicate keys, invalid transitions and missing sources
- [ ] **Source existence validation** — done by the endpoint, before recording
- [ ] **Authorization for recorder/reviewer** — who may record, review and revoke; needs RBAC
- [ ] **Review/revoke transition behaviour** — enforced by the endpoint, per §6
- [ ] **Verified-tag presentation derives from status** — never a stored or accepted `is_verified`
- [ ] **Blog/trophy source naming matches endpoint contracts** — `blog` and `trophy_item`

Known mismatches in the endpoints as of `backend@c0c9680`, for Aryan to align:

- The award endpoints do not pass `occurred_at`, so record validation fails; they
  must take it from the request.
- They read `deduplication_key` from the request; the server must generate it.
- The SPG award finds members through `users.spg_ids`, a second copy of SPG
  membership beside `SPGRecord.member_ids`; one must be the source.
- The SPG award does not set `spg_id` on the records it creates.
- `award.source` may no longer be an event or SPG; use `event_id` / `spg_id`.
- Revoke writes a raw update instead of a validated `ContributionRecord`.
- Records are stored with `model_dump(mode="json")` — timestamps as strings —
  while Python-mode dumps keep native timestamps; persistence must pick one.

## 11. Runtime behaviour

The award workflow is implemented in `app/services/contributions.py`, with thin
handlers in `app/api/v1/endpoints/contributions.py`. The service is the shared
entry point so the admin site and the Discord bot cannot drift apart.

| Route | Access | Notes |
|---|---|---|
| `POST /api/v1/contributions/award/student/{student_id}` | admin | One approved record |
| `POST /api/v1/contributions/award/spg/{spg_id}` | admin | One record per existing SPG member, all or none |
| `PATCH /api/v1/contributions/{record_id}/revoke` | admin | Keeps the record, stops the points |
| `GET /api/v1/contributions` | admin | Filter by contributor, SPG, event, status, category |
| `GET /api/v1/contributions/me` | signed in | The caller's own history |
| `GET /api/v1/contributions/{record_id}` | owner or admin | Someone else's answers 404, not 403 |
| `GET /api/v1/contributions/leaderboard` | signed in | Summed from approved records |

- **Admin** is the Firebase custom claim `admin`, and only the boolean `true`
  passes. Provisioning that claim is an environment step, not something the API
  grants. There is no document-based fallback: it fails closed.
- **`contributor_id` is the lowercased email.** The path identifier may be an
  email, a `users` document id or a Firebase UID; it is resolved to that one
  form before any record exists, and an unknown identifier is a 404. This
  follows the current DATA_CONTRACT and is deliberately not a migration.
- **Deduplication is server-owned.** The key is a SHA-256 of the normalised
  award (target kind, contributor, category, points, title, `occurred_at`,
  event, SPG, source) and is also the document id, so the same award can only
  occupy one document. Reading and writing inside one transaction is what makes
  two concurrent retries safe; a repeat returns the existing record.
- **An SPG award is one transaction** for every member, so it cannot half-apply.
  Members come from `SPGRecord.member_ids`, never from a field on user
  documents. An unresolvable member stops the whole award. SPGs are read
  through `app/services/spgs.py` and never created here.
- **Timestamps are stored as native datetimes,** not JSON strings, and render as
  ISO-8601 in responses.
- **Every stored document is validated** through `ContributionRecord` on the way
  in and on the way out, including revocation, which is rebuilt and validated
  before it is written.
- **Listing is always bounded:** 20 by default, 100 at most, with a cursor.

## 12. Open Decisions

1. Which identity the actor fields hold — follows the canonical-identity decision in
   [`BACKEND_DATA_MODEL_PROPOSAL.md`](BACKEND_DATA_MODEL_PROPOSAL.md).
2. Persistence: whether and where records live, e.g. a top-level `contributions/{id}`.
3. How `deduplication_key` uniqueness is enforced; whether a rejected or revoked key may recur.
4. Who may record; whether students self-submit, e.g. via the ticket → review lifecycle.
5. Whether some records, such as bot-recorded attendance, are approved automatically.
6. Points policy: per-category defaults, caps, penalties.
7. Leaderboard windows, track segmentation and tie-breaking.
8. HTTP error codes for business-rule failures.
9. Whether a reviewer may adjust points while pending, or must reject and re-record.
10. Maximum lengths for `status_reason` and `deduplication_key` — none set yet.
11. `trophy_item` vs `library_item`: a rename, or two different concepts (§4).
12. Whether `SPGRecord`'s provisional statuses stand, and whether SPGs later need a
    separate tier or priority field.
13. Event type, status and dates, once an event workflow exists.
14. How an SPG completion request (report → review → award) is modelled. It is a
    request for review, not a contribution; only the resulting award is.
