> ## STATUS: PROPOSAL — NOT YET PART OF THE FIRESTORE DATA CONTRACT
>
> Nothing proposed here exists. No proposed collection or field has been created in
> Firestore, and no code reads or writes one. [`DATA_CONTRACT.md`](DATA_CONTRACT.md)
> remains the only description of what is stored today.
>
> A proposal becomes real only after a team decision, a coordinated change in the
> [YUVI](https://github.com/Reinforce-SST/YUVI) bot, and an update to
> `DATA_CONTRACT.md` — in the same change window.

# Backend Data Model Proposal

Findings and designs are labelled with one of two tags:

- **CURRENT OBSERVATION** — true today, read from source on 2026-09-22: this
  repository at `backend@4317b5c` and YUVI at `main@a37f812`. No production data
  was read. Nothing observed here is fixed by this document.
- **PROPOSED CHANGE** — a design for discussion. Not implemented.

---

## 1. Observations about the current data

### 1.1 `users/{email}` and `users/{discord_id}` hold different data

**CURRENT OBSERVATION.** `POST /api/v1/auth/verify-discord` writes one eight-field
payload, with `merge=True`, to both documents:

`email`, `full_name`, `avatar_url`, `firebase_uid`, `discord_id`, `is_verified`,
`verified_at`, `updated_at`

`users/{email}` additionally receives `created_at`, `last_login`, `skills` and
`social_links` from `sync-user` and `me`. `users/{discord_id}` never does. So the
two documents are not copies — the Discord-keyed one is a subset. After linking,
sign-ins and profile edits touch only `users/{email}`, so `full_name`, `avatar_url`
and `updated_at` drift apart between the two over time.

Linking also overwrites `full_name` and `avatar_url` on `users/{email}` with the
values from the Google token, discarding any edit made through `PUT /auth/profile`.

The stored shape is modelled as `UserDocument` in `server/app/schemas/users.py`,
with the four sign-in fields optional for this reason.

### 1.2 Unlinking leaves the two documents inconsistent

**CURRENT OBSERVATION.** There are two unlink paths, and neither keeps the two
documents consistent.

| Path | `users/{email}` | `users/{discord_id}` |
|---|---|---|
| Website — `POST /api/v1/auth/unlink-discord` | `discord_id: null`, `is_verified: false` | deleted, as a second, separate write |
| Bot — admin `/unlink` (`UserManager.unlink_user`) | **untouched** | deleted |

After a bot unlink, `users/{email}` still holds the Discord ID and
`is_verified: true`. The bot's own lookup (`UserManager.get_user`) falls back to
querying `discord_id == ...`, finds that document, and reports the member as
still linked. The website also still shows them as linked.

When there is no `users/{discord_id}` document, the bot instead sets
`discord_id: null` on whichever document the query finds, and leaves
`is_verified` as it was.

If the website's second write fails, the lookup document is orphaned and the bot
keeps treating the member as linked.

### 1.3 `verified_at` is never cleared

**CURRENT OBSERVATION.** Neither unlink path clears `verified_at`. An unlinked
member can hold `is_verified: false` together with a `verified_at` timestamp. The
bot's `/whois` displays `verified_at` as the verification date. `verified_at`
alone cannot be read as "is verified".

### 1.4 The verified role falls back to a role name

**CURRENT OBSERVATION.** YUVI's `POST /internal/verify-success` grants the role in
`VERIFIED_ROLE_ID`. If that variable is unset or the role is missing, it grants the
first guild role named (case-insensitively) `verified member`, `verified`, or
**`member`**. Admin `/unlink` removes the role only by `VERIFIED_ROLE_ID`, with no
fallback.

Today, "verified" means *linked an `@sst.scaler.com` Google account*. It does not
mean *on the official club roster*. Nothing distinguishes the two.

### 1.5 `app_data` is an undocumented collection

**CURRENT OBSERVATION.** YUVI's `cogs/db.py` exposes `/db-push` and `/db-fetch`,
which write and read `app_data/{key}`:

```jsonc
{ "value": "string", "updated_by": "discord snowflake", "updated_at": "<SERVER_TIMESTAMP>" }
```

It is not in `DATA_CONTRACT.md`. The source has no permission check on either
command, and replies are not ephemeral. Discord-side command permissions may
restrict them; that is configured in the guild and not visible from source. No
name proposed below collides with it.

### 1.6 Legacy keys are read but never written

**CURRENT OBSERVATION.** The API reads `picture` as a fallback for `avatar_url`.
The bot reads `name` as a fallback for `full_name`, and `id` before `discord_id`
in `/whois-email`. None are in the contract and no current code writes them.
Whether any stored document still has them is unknown — that needs a read of
production data, which this document did not do.

### 1.7 The bot also looks tickets up by thread ID as a document ID

**CURRENT OBSERVATION.** After the two documented queries
(`thread_id == ...`, `discord_meta.thread_id == ...`), `ticket_manager` tries
`tickets/{thread_id}` as a document ID. The contract says ticket IDs are
Firestore auto-IDs, so older tickets may have been keyed differently. Unverified.

### 1.8 What this repository does not yet model for tickets

**CURRENT OBSERVATION.** Open PR #7 adds `TicketCategory`, `TicketStatus` and
response models (`TicketSummary`, `TicketDetail`, a response-side
`TicketMessage`) in `server/app/schemas/tickets.py`. The *stored* shape from
`DATA_CONTRACT.md` is still not modelled anywhere in this repository:

- `TicketPriority` — `low | medium | high | urgent`
- `TicketUser` — including `discriminator` and `email`
- `DiscordMeta`
- the stored ticket — `priority`, `closed_by`, `discord_meta`, and the mirrored
  `thread_id` / `guild_id`
- the stored message — `sender_id`, `discord_message_id`
- `sender_role` (`user | admin | lead | bot`) and `source` (`discord | web`)

The bot itself parses leniently: an unknown category reads as `misc`, an unknown
status as `open`, an unknown priority as `medium`.

**PROPOSED CHANGE.** After PR #7 merges, add these as stored-shape models that
reuse PR #7's enums rather than duplicating them. Enum validation would be
strict, because the contract defines the allowed values. How an endpoint handles an
unknown historical value is a separate decision (§9).

---

## 2. Cross-cutting design

### 2.1 Canonical IDs

**CURRENT OBSERVATION.** A person has up to two document IDs (email, Discord
snowflake). Tickets identify people by `created_by.discord_id`. A club member who
has never signed in to the website has no `users` document at all.

**PROPOSED CHANGE.**

- New entities would use Firestore auto-IDs, as tickets do. The document ID
  would be the identifier and would not be repeated inside the document (so
  `spg_id`, `project_id`, `update_id` and `idea_id` below are document IDs, not
  stored fields). Where a collection-group query needs a parent's ID, that ID
  would be stored explicitly.
- People would be referenced by **lowercased SST email** in new collections. It
  is the only identifier every member has from day one — before website sign-in,
  before Discord linking — and it is already the primary `users` document ID.
  `discord_id` would be stored alongside only where the bot needs it.
- Trade-off: email is personal data, and would appear in document references and
  any URL built from them. `firebase_uid` is opaque but exists only after first
  website sign-in; `discord_id` exists only after linking.

Revisit when the duplicate `users` documents are consolidated (§3.4).

### 2.2 Timestamps

**CURRENT OBSERVATION.** `users` stores ISO-8601 strings, which the API returns
as they are. `tickets`, `messages` and `app_data` store Firestore server
timestamps; PR #7 converts ticket and message timestamps to ISO-8601 strings at
the API boundary.

**PROPOSED CHANGE.**

- New collections would store Firestore server timestamps (`SERVER_TIMESTAMP`):
  the server's clock, native ordering and range queries, and the convention the
  bot already uses for everything it writes.
- API responses would always serialise ISO-8601 with an explicit offset — the
  `datetime.isoformat()` form, matching the strings `users` already holds.
- `users` would keep ISO strings. Changing its stored type is a contract change
  for the bot. Any field added to `users` (such as `member_verified_at`) would
  follow the document's existing string convention.

### 2.3 Lifecycle: ticket → review → canonical record

**CURRENT OBSERVATION.** SPG registrations and Idea Jar submissions exist only as
tickets. The `fields` map holds free text keyed by modal labels. No record
outlives the ticket, and nothing structured is extracted from it.

**PROPOSED CHANGE.** One pattern for every intake that becomes a lasting record:

1. A member files a ticket in Discord. The bot writes `tickets/{id}` — unchanged.
2. A core member reviews it.
3. On approval, the API would create the canonical record with
   `source_ticket_id` pointing back to the ticket.
4. The ticket would stay the *workflow* record: the conversation, the status,
   who handled it. The canonical document would be the *accepted entity*.

Rules:

- **Review state would live on the ticket.** A canonical record would exist only
  after acceptance, so it would need no `pending` or `rejected` status. A
  rejected request would be a ticket closed with a `close_reason`.
- Creation would be idempotent: at most one canonical record per ticket.
- `report` tickets would never become canonical records.
- The API does not write tickets today (PR #7: "This API never writes to the
  tickets collection"). Resolving a ticket on approval from the website would be
  a new write path — see §9.
- Admin review would need RBAC, which does not exist yet. RBAC is a prerequisite
  for every flow in this section.

---

## 3. Membership verification

### 3.1 The gap

**CURRENT OBSERVATION.** `is_verified` means *has an SST Google account and linked
Discord*. There is no notion of *official club member*, and the Discord role that
verification grants is presented to members as "Verified Member" (§1.4).

**PROPOSED CHANGE.** Two separate states:

| State | Meaning | Source |
|---|---|---|
| verified | SST Google account linked to a Discord account | existing `is_verified` |
| member | on the official club roster | roster, imported by an admin |

Only *member* would earn the Discord `@Member` role.

### 3.2 Where membership state would live

**PROPOSED CHANGE.** The roster would arrive as a CSV or from another admin
source. Under every option:

- **The roster file is never committed**, never attached to an issue, and never
  posted in Discord.
- It would be uploaded through a future admin-only, server-side endpoint, parsed
  in memory, and only lowercased emails would be kept.

#### Option A — roster collection *(recommended)*

```jsonc
// member_roster/{email}   — PROPOSED, does not exist; fields are illustrative
{
  "email":    "string",          // lowercased; also the document ID
  "source":   "csv_import",      // csv_import | manual
  "added_at": "<SERVER_TIMESTAMP>",
  "added_by": "string"           // email of the admin who imported it
}
```

Plus a cached projection on both `users` documents:

```jsonc
"is_member":          false,          // PROPOSED
"member_verified_at": "ISO-8601 | null"  // PROPOSED — string, per users' convention
```

`sync-user` and `verify-discord` would look the email up in the roster and set
the projection.

#### Option B — state only on `users`

`is_member` and `member_verified_at` would live on `users`, and an import would
set them directly.

#### Trade-offs

| | A — roster collection | B — users only |
|---|---|---|
| **Member with no `users` document yet** | Held in the roster; picked up at first sign-in | Nowhere to store it. Either create placeholder `users` documents for people who never signed in — breaking the assumption that a `users` document means a sign-in, and returned by the bot's `/whois-email` as if it did — or drop those members and re-import later |
| Source of truth | One roster document per member | Two `users` documents per linked member, which can drift (§1.2) |
| Removal from roster | Delete one document, recompute the projection | Find and update every `users` document for that person |
| Reads | Roster lookup at sign-in and link time | Single document read |
| Surface area | One new collection of emails — server-only, protected like `users` | No new collection |

The first row is the main reason for recommending Option A. Many official members
will not have signed in to the website when the roster is first imported, and
Option B has no clean place to record them. The choice itself is open (§9).

### 3.3 Keeping the two `users` documents consistent

**PROPOSED CHANGE.** While both documents exist:

- Every write that touches linking or membership would write both documents in
  one atomic `WriteBatch`.
- Where a write depends on a read — "set `is_member` if the email is on the
  roster" — it would use a transaction instead.
- Unlink would update `users/{email}` and delete `users/{discord_id}` in the same
  batch, and clear `verified_at`. On the website that would address §1.2 and
  §1.3. The bot's `/unlink` would need the equivalent change in YUVI.
- Unlinking would not change `is_member`. Membership would follow the roster,
  not the Discord link; only the `@Member` role on the unlinked Discord account
  would be removed.

### 3.4 Longer term

**CURRENT OBSERVATION.** AGENTS.md lists consolidating to one document per person
as a known, separate task.

**PROPOSED CHANGE.** None here. Consolidation would change the bot's primary
lookup, so it needs its own decision and a coordinated YUVI change. Nothing
above depends on it.

### 3.5 YUVI implications

**PROPOSED CHANGE**, all in the YUVI repository:

- A separate `MEMBER_ROLE_ID`. Remove the name-based fallback for both roles, and
  fail closed when a role ID is unset. With a real `Member` role in
  the guild, today's fallback could grant it to every verified student.
- Grant `@Member` only when the member is on the roster: either the API passes
  `is_member` in the `verify-success` payload, or the bot reads Firestore (§9).
- Revoke `@Member` when someone leaves the roster: an API-to-bot call, or a
  periodic reconciliation run by the bot (§9).
- `/auth`'s "already linked" check would read `is_verified` instead of treating
  any found document as linked, as it does today.

---

## 4. Student Project Groups (SPGs)

**CURRENT OBSERVATION.** An SPG exists only as a `spg_registration` ticket with
free-text `Project Name & Track`, `Team Members`, `Duration & Frequency` and
`Summary & Goals`. The category label is "SPG Registration / Modification", so the
same category carries both new registrations and changes. Resource requests
refer to an SPG by a free-text `SPG Name`.

**PROPOSED CHANGE.** `spgs/{spg_id}`, created on approval of a registration ticket:

| Field | Type | Notes |
|---|---|---|
| `name` | string | From `Project Name & Track` |
| `track` | string | From `Project Name & Track` — *added beyond the initial field list* |
| `lead_user_id` | string | Person reference (§2.1) |
| `member_ids` | string[] | The reviewer would resolve free-text `Team Members` into references at approval |
| `project_id` | string \| null | Denormalised pointer; see §5 |
| `status` | enum | e.g. `active \| paused \| completed \| disbanded` — no `pending` (§2.3) |
| `reporting_frequency` | enum | e.g. `weekly \| biweekly \| monthly`, normalised from `Duration & Frequency` |
| `source_ticket_id` | string | The registration ticket — *added beyond the initial field list* |
| `created_at`, `updated_at` | server timestamp | §2.2 |

The ticket would be the request; the `spgs` document would be the canonical
accepted group.

A later `spg_registration` ticket may be a modification. Approving it would
update the existing document; `source_ticket_id` would keep pointing at the
original registration. Whether to keep a history of modifying tickets is open (§9).

Linking resource requests to `spg_id` instead of free text would be a bot change.

---

## 5. Projects

**CURRENT OBSERVATION.** No project record exists. The dashboard's Projects tab
renders hardcoded content with no data source (AGENTS.md known defect).

**PROPOSED CHANGE.** `projects/{project_id}`:

| Field | Type | Notes |
|---|---|---|
| `spg_id` | string | The owning SPG. Canonical side of the relationship |
| `title` | string | |
| `description` | string | |
| `github_url` | string \| null | URL |
| `demo_url` | string \| null | URL |
| `stage` | enum | Build phase, e.g. `ideation \| building \| testing \| shipped` |
| `status` | enum | Lifecycle, e.g. `active \| on_hold \| archived` |
| `blockers` | string \| null | Current snapshot; history lives in updates (§6) |
| `next_milestone` | string \| null | Current snapshot |
| `support_needed` | string \| null | Current snapshot |
| `created_at`, `updated_at` | server timestamp | |

Two-way pointers (`spgs.project_id` and `projects.spg_id`) can drift, like the
duplicate user documents. `projects.spg_id` would be canonical. `spgs.project_id`
would be kept only if an SPG has exactly one project, and written in the same
batch as the project. Cardinality is open (§9).

Which fields appear on the public website — `blockers` and `support_needed` are
arguably internal — is open (§9).

---

## 6. Project updates

**PROPOSED CHANGE.** A subcollection,
`projects/{project_id}/project_updates/{update_id}`:

| Field | Type | Notes |
|---|---|---|
| `project_id` | string | Repeated so a collection-group query can return it |
| `spg_id` | string | Repeated for collection-group queries by SPG |
| `submitted_by` | string | Person reference (§2.1) |
| `progress` | string | |
| `blockers` | string \| null | |
| `next_steps` | string \| null | |
| `created_at` | server timestamp | |

- A subcollection mirrors `tickets/{id}/messages`. It would be named
  `project_updates`, not `updates`, because collection-group queries match by
  name across the whole database and a generic name will collide.
- Deleting a project does **not** delete its subcollection in Firestore; the API
  would have to do that explicitly.
- Updates would be append-only. A correction would be a new update.
- Creating an update would also overwrite the project's snapshot fields
  (`blockers`, `next_milestone`, `support_needed`, `updated_at`) in the same
  batch.

The alternative is a top-level `project_updates` collection (§9).

---

## 7. Idea Jar

**CURRENT OBSERVATION.** An idea is an `idea_jar` ticket with `Idea Title`,
`Track` and `Overview`. Nothing else is captured.

**PROPOSED CHANGE.** `ideas/{idea_id}`, created when a moderator accepts an idea:

| Field | Type | Notes |
|---|---|---|
| `title` | string | From `Idea Title` |
| `track` | string | From `Track` |
| `description` | string | From `Overview` |
| `difficulty` | enum | e.g. `beginner \| intermediate \| advanced` — set by the moderator |
| `prerequisites` | string[] | Set by the moderator |
| `learning_objectives` | string[] | Set by the moderator |
| `roadmap` | string[] | Ordered steps — set by the moderator |
| `submitted_by` | TicketUser | Copied from the ticket's `created_by` (see below) |
| `status` | enum | e.g. `draft \| published \| archived` — no `pending` or `rejected` (§2.3) |
| `source_ticket_id` | string | *Added beyond the initial field list* |
| `created_at`, `updated_at` | server timestamp | |

Idea submission ticket → moderation → approved canonical idea → YUVI could query
and display it.

- `draft` would let a moderator fill in the fields the modal never collected
  before the idea is visible.
- Idea Jar submitters are identified by Discord and may have no `users` document,
  so `submitted_by` would copy the ticket's `created_by` snapshot rather than a
  person reference. Whether submitters are credited publicly is open (§9).
- The bot would read `ideas` where `status == "published"`, ordered by
  `created_at`. That would need a composite index. The bot would stay read-only
  on `ideas`.

---

## 8. Access and privacy

**CURRENT OBSERVATION.** These rules are in `DATA_CONTRACT.md` today and would
apply unchanged to every proposal above:

- `report` tickets are confidential and never surfaced on the website.
- RBAC does not exist yet.
- The browser never reads Firestore. Firebase Admin credentials stay server-side.

**PROPOSED CHANGE.** The proposal adds three rules, stated in full above:
`report` tickets would never become canonical records (§2.3); every review flow
would wait for RBAC (§2.3); and a roster collection, if adopted, would be
server-only and never returned in bulk, with no roster file or email export in
this repository (§3.2).

---

## 9. Open decisions

None of these are decided. The last column is this proposal's leaning, not a
decision. Rows marked **YUVI** need a coordinated bot change.

| # | Decision | Options | Leaning |
|---|---|---|---|
| 1 | Canonical identity for people in new collections | Lowercased email / `firebase_uid` / `discord_id` (§2.1) | Email, until consolidation |
| 2 | Handling the duplicate `users` documents | Keep both, with batched writes (§3.3) / consolidate to one document (§3.4) — **YUVI** | Batch in the interim; consolidate as its own task |
| 3 | Membership source of truth, and whether `member_roster` exists | Roster collection + projection on `users` / state on `users` only (§3.2) | Roster collection |
| 4 | Timestamp representation in new collections | Server timestamp / ISO-8601 string (§2.2) | Server timestamp |
| 5 | Approval lifecycle | Ticket → review → canonical record (§2.3) / tickets remain the only record | Canonical records, once RBAC exists |
| 6 | Who writes ticket status on approval | API, as a new write path / bot remains sole writer — **YUVI** | Open |
| 7 | SPG ↔ project cardinality | One project per SPG / many (§5) | Open; decides whether `spgs.project_id` exists |
| 8 | SPG modification history | `source_ticket_id` only / also a list of modifying tickets (§4) | Open |
| 9 | Project updates placement | Subcollection / top-level collection (§6) | Subcollection |
| 10 | Idea Jar canonical storage | `ideas` collection (§7) / ideas stay as tickets only | `ideas` collection, submitter as a ticket snapshot |
| 11 | Project and idea visibility | Which fields are public; whether idea submitters are credited | Open |
| 12 | `@Member` grant | `verify-success` payload carries membership / bot reads Firestore — **YUVI** | Open |
| 13 | `@Member` revocation | API-to-bot call / periodic bot reconciliation — **YUVI** | Open |
| 14 | Role-name fallback | Keep / remove — **YUVI** | Remove (§3.5) |
| 15 | Unknown or historical enum values at the API | Reject / skip / map | Open; stored-shape models validate strictly (§1.8) |
| 16 | Enum values for new collections | SPG `status`, `reporting_frequency`, project `stage` / `status`, idea `status` / `difficulty` | The examples above are starting points only |
| 17 | Recording observations in `DATA_CONTRACT.md` | `app_data` (§1.5); the `users/{discord_id}` subset (§1.1) | Yes, in a separate contract PR |
