# Firestore Data Contract

**Firebase project:** `reinforce-sst-bfda8`

This document is the boundary between two repositories that share one database:

- `Reinforce-SST/Reinforce-Student-Dashboard` — website, dashboard, API (this repo)
- `Reinforce-SST/YUVI` — Discord bot

Firestore enforces no schema. A renamed field does not raise — it reads back as
`None` and renders as a blank cell. **This file is the contract. Derive from it.**

Every shape below was read out of the bot's source (`models/ticket.py`,
`utils/ticket_manager.py`, `views/ticket_modals.py`, `utils/user_manager.py`), not
inferred from the UI.

---

## `users/{doc_id}`

The website's canonical member record is `users/{firebase_uid}`. During the
YUVI compatibility window, a successful `/auth` link also writes
`users/{lowercased_email}` and `users/{discord_id}` aliases in the same Firestore
transaction. The bot looks up those aliases; the website reads profile fields
from the UID record. A raw `discord_id` in any single document is **not** proof
that the member owns that Discord account. Legacy email-keyed profile fields
are copied to the UID record on first sign-in, but a Discord link migrates only
when both aliases agree on `firebase_uid`, email, ID, and link version.

```jsonc
{
  "email":         "student@sst.scaler.com",  // lowercased, trimmed
  "full_name":     "string",
  "avatar_url":    "string | null",
  "firebase_uid":  "string | null",
  "discord_id":    "string | null",           // numeric snowflake, as a string
  "discord_link_version": 1,                 // present only on proven links
  "is_verified":   false,
  "verified_at":   "ISO-8601 | null",
  "created_at":    "ISO-8601",
  "updated_at":    "ISO-8601",
  "last_login":    "ISO-8601",
  "skills":        ["string"],
  "social_links":  { "github": null, "kaggle": null, "discord": null, "linkedin": null }
}
```

Timestamps here are **ISO-8601 strings**, written by the API with
`datetime.now(timezone.utc).isoformat()`. This differs from the tickets collection —
see the warning below.

The UID-keyed profile also stores `is_member`, `tier`, `batch_year`, and
the cached per-track `points` map. `is_admin` in this profile is display metadata
only; API authorization comes exclusively from the verified Firebase
`admin == true` custom claim.

## `discord_link_tokens/{sha256(token)}`

YUVI issues a private, short-lived `/auth#link_token=...` URL. The browser sends
that opaque token to `/users/verify-discord`; it never sends a raw Discord ID as
identity proof. The API consumes the hashed token and writes the UID member plus
the email and Discord aliases atomically. The token stores `discord_id`,
`expires_at`, and, after use, `consumed_by`, `email`, and `consumed_at`. An expired
or differently consumed token cannot link an account. A repeated request from
the same member may retry the bot role notification while the aliases remain
consistent.

Unlinking clears the UID and email link markers and removes the matching Discord
alias. Existing unproven links need a fresh private YUVI token.

---

## `tickets/{auto_id}`

Written by the bot when a member submits a ticket modal in Discord, or by the API
when a member creates one in the dashboard. The bot uses a Firestore auto-ID; the
API uses a `tkt_` ID. Neither uses the Discord thread ID.

Dashboard-created documents use Firebase UID reference fields
(`created_by_uid`, `assigned_to_uid`, and `closed_by_uid`). Older bot-created
documents use the nested `TicketUser` objects below. Readers must accept both
shapes. The YUVI bridge resolves `created_by_uid` through `users/{uid}.discord_id`
before adding the member to the private thread.
Legacy Discord tickets are visible on the member dashboard only when the UID
record and both aliases prove the same link. Confidential `report` tickets are
omitted from the member list and detail responses.

```jsonc
{
  "category":     "spg_registration",   // enum, see below
  "title":        "string",
  "description":  "string",
  "fields":       { "...": "..." },     // category-specific, see below
  "status":       "open",               // enum, see below
  "priority":     "medium",             // low | medium | high | urgent
  "created_by":   { /* TicketUser */ },
  "assigned_to":  { /* TicketUser */ } , // null until claimed
  "closed_by":    { /* TicketUser */ },  // null until closed
  "close_reason": "string | null",
  "discord_meta": { /* DiscordMeta */ },
  "thread_id":    "string | null",       // mirrored from discord_meta
  "guild_id":     "string | null",       // mirrored from discord_meta
  "created_at":   "<SERVER_TIMESTAMP>",
  "updated_at":   "<SERVER_TIMESTAMP>",
  "closed_at":    "<SERVER_TIMESTAMP> | null"
}
```

### `TicketUser`

```jsonc
{ "discord_id": "string", "username": "string", "discriminator": "string | null",
  "email": "string | null", "avatar_url": "string | null" }
```

### `DiscordMeta`

```jsonc
{ "guild_id": "string", "channel_id": "string", "thread_id": "string",
  "panel_message_id": "string | null", "control_message_id": "string | null" }
```

### Enums

| `category` | Label |
|---|---|
| `spg_registration` | 🚀 SPG Registration / Modification |
| `resource_request` | ⚡ Resource Request |
| `support` | 💬 Support & General Inquiries |
| `idea_jar` | 💡 Idea Jar & Suggestions |
| `report` | 🛡️ Report Issue / Misconduct |
| `misc` | 📦 General / Misc |

| `status` | Label |
|---|---|
| `open` | 🟢 Open |
| `in_progress` | 🟡 In Progress |
| `resolved` | 🔵 Resolved |
| `closed` | 🔴 Closed |

`priority` is `low | medium | high | urgent`. The bot never sets it to anything but
`medium` today — nothing in the Discord flow captures priority.

---

## `tickets/{ticket_id}/messages/{auto_id}`

The Discord thread conversation, mirrored message by message in real time.

```jsonc
{
  "sender_id":          "string",
  "sender_name":        "string",
  "sender_avatar":      "string | null",
  "sender_role":        "user",      // user | admin | lead | bot
  "source":             "discord",   // discord | web
  "content":            "string",
  "attachments":        ["url"],
  "timestamp":          "<SERVER_TIMESTAMP>",
  "discord_message_id": "string | null"
}
```

`source` already distinguishes `discord` from `web`. The bot's schema anticipated a
web write path. Dashboard messages use `sender_uid`; older Discord messages use
`sender_id`. API readers normalize either field into `sender_uid` on the wire.
They also preserve `sender_name` when YUVI supplied it.

Ordered by `timestamp` ascending. The bot caps reads at 300 messages.

---

## `ideas/{idea_id}`

The dashboard and bot historically used different names for the same values.
During the compatibility window, writers set both names and readers accept either:

| Dashboard field | Legacy YUVI field | Meaning |
|---|---|---|
| `is_verified` | `is_approved` | visible in the public idea feed |
| `rough_roadmap` | `roadmap` | ordered implementation steps |
| `created_by_uid` | `created_by.discord_id` | submitting member identity |
| `approved_by_uid` | `approved_by.discord_id` | approving admin identity |

YUVI's `other` track maps to the dashboard's `misc` track at the API boundary.
New YUVI writes resolve linked Discord IDs to Firebase UIDs when the user profile
is available. Existing legacy documents remain readable without a migration.

---

## `event_slugs/{sha256(slug)}`

Internal reservation documents keep event slugs unique under concurrent admin
creates and updates. Each document stores `slug`, `event_id`, and `updated_at`.
Event readers continue to resolve slugs from `events/{event_id}.slug`; clients do
not read this collection directly.

---

## `fields` — the category-specific payload

`fields` is a free-form map. **Its keys are human-readable strings with spaces and
ampersands**, not snake_case identifiers. They come from the Discord modal labels.

| Category | Keys, in intended order |
|---|---|
| `spg_registration` | `Project Name & Track`, `Team Members`, `Duration & Frequency`, `Summary & Goals` |
| `resource_request` | `SPG Name`, `Resources Requested`, `Progress Proof`, `Justification` |
| `idea_jar` | `Idea Title`, `Track`, `Overview` |
| `support` | `Subject`, `Details` |
| `misc` | `Subject`, `Details` |
| `report` | `Incident Summary`, `Report Details` |

> ### ⚠️ Firestore does not preserve map key order
>
> The bot builds `fields` as an ordered Python dict, but Firestore stores maps with
> keys sorted **lexicographically**. Reading `fields` back and rendering
> `Object.entries()` in order produces, for an SPG registration:
>
> `Duration & Frequency → Project Name & Track → Summary & Goals → Team Members`
>
> which is not the order the member filled it in, and reads as nonsense.
>
> **The frontend must hold an explicit display-order list per category** and render
> against that, falling back to alphabetical for unknown keys so a new bot category
> degrades gracefully instead of disappearing.

---

## `spgs/{spg_id}`

Student Project Groups. **Written only by this API** — the bot does not read or
write this collection. Full workflow in [`SPG_WORKFLOW.md`](SPG_WORKFLOW.md).

Document ID is derived from the approved registration ticket so that approving
the same ticket twice cannot create two groups:
`"spg_" + sha256("spg_registration:" + source_ticket_id)[:24]`.

```jsonc
{
  "id":                       "spg_1f2e...",      // equals the document ID
  "name":                     "string",           // 1-200, trimmed
  "description":              "string | null",    // <= 2000
  "type":                     "project",          // learning | project | event | external_event | miscellaneous
  "track":                    "research",         // kaggle | product | research | general
  "visibility":               "private",          // public | private; an event SPG is always public
  "member_ids":               ["<firebase_uid>"], // >= 1, no duplicates, UIDs only
  "lead_id":                  "<firebase_uid>",   // must be one of member_ids
  "status":                   "active",           // active | paused | completed | disbanded
  "created_by":               "<firebase_uid> | null",
  "created_at":               "ISO-8601 | null",
  "updated_at":               "ISO-8601 | null",
  "completed_at":             "ISO-8601 | null",  // unused until completion exists
  "proposition_document_url": "string | null",    // required for type=project at creation
  "source_ticket_id":         "string | null"     // the spg_registration ticket
}
```

⚠️ **`member_ids` holds Firebase UIDs, never emails or Discord IDs.** Because
`users` is keyed three ways (see above), membership is validated by requiring
the user document's `id` field to equal its own document ID — which only the
`users/{uid}` profile writer sets. An email-keyed or Discord-keyed document is
not an identity and is rejected.

There is no `users.spg_ids`. `member_ids` is the only membership source.
`progress` and a separate `health` field are **not** stored; both are derived
for display.

Server-owned fields are nullable so documents written before this workflow
existed still validate on read. **A newly created SPG always has a
`source_ticket_id`**: creation goes through `create_spg()`, which requires one
and derives the document ID from it. It is nullable here only for the older
documents that predate the rule.

**Readers:** this API, and the contribution SPG award, which reads `member_ids`
to write one contribution per member.

---

## `spg_reports/{report_id}`

Append-only report history. **Written only by this API.**

A report is filed in one of two formats and the member chooses: a structured
**form** stored here in Firestore, or an uploaded **PDF** kept in Firebase
Storage. Both are this one shape in this one collection, and both share a
single sequence per SPG.

```jsonc
{
  "id":              "rep_9a8b...",     // equals the document ID
  "spg_id":          "spg_1f2e...",
  "report_type":     "progress",        // progress | final  — what it is about
  "report_format":   "form",            // form | pdf        — how it was filed
  "heading":         "Week two progress",      // required, both formats
  "short_description": "Baseline trained.",    // required, both formats
  "sequence_number": 1,                 // >= 1, per SPG, monotonic, never reused

  // report_format == "pdf" only
  "pdf_url":         "https://firebasestorage.googleapis.com/...",

  // report_format == "form" only
  "summary":         "string",          // required for a form report
  "milestones":      ["string"],        // may be empty
  "blockers":        "string | null",
  "next_steps":      "string | null",

  "submitted_by":    "<firebase_uid>",
  "submitted_at":    "ISO-8601",
  "status":          "pending",         // pending | verified
  "verified_by":     "<firebase_uid> | null",
  "verified_at":     "ISO-8601 | null"
}
```

**Conditional invariants** — a record carries one format's content, never both:

| `report_format` | Required | Must be absent |
|---|---|---|
| `pdf` | `pdf_url` | `summary`, `blockers`, `next_steps`; `milestones` empty |
| `form` | `summary` | `pdf_url` |

`heading` and `short_description` are required for both, because the dashboard
lists every report the same way regardless of format.

`report_type` and `report_format` are independent. All four combinations are
valid: a `final` report may be a form, a `progress` report may be a PDF.

**Other invariants**

- `verified_by` and `verified_at` are both set exactly when `status == "verified"`,
  and `verified_at >= submitted_at`
- a stored report is never overwritten; a correction is a new report with the
  next sequence number
- form and PDF reports draw from **one** sequence per SPG, not one each
- submitting or verifying a report **awards no points and creates no
  contribution** — that is a separate admin decision in the contribution
  workflow

Timestamps here are ISO-8601 strings, matching `users` rather than `tickets`.

### Storage paths

```
spgs/{spg_id}/reports/{report_id}.pdf
spgs/registrations/{request_id}/proposition.pdf
```

Server-generated from IDs the server created. A client filename never reaches
a storage path.

### Ticket linkage

SPG registration is meant to raise an `spg_registration` ticket (see the
`tickets` category table above) that a reviewer approves, and the approval
creates the `spgs` document, recording the ticket in `source_ticket_id`.

The dashboard ticket write path now exists. There is still no HTTP route that
approves an SPG registration ticket into an SPG; `create_spg()` remains the
internal service that approval will call once that workflow is implemented.

---

## Access rules

- `report` category tickets are **confidential**. The Discord modal tells members
  they are visible only to core admins. Any mirror of this collection must filter
  `category == "report"` out of member-facing views and gate it behind an admin role
  through the Firebase `admin == true` custom claim.
- Members may only read tickets where `created_by_uid` is their Firebase UID or
  where legacy `created_by.discord_id` matches their linked Discord ID.
- Firebase Admin credentials are server-side only. The browser never reads Firestore
  directly; every read goes through the FastAPI service.

## Timestamp inconsistency

| Collection | Type |
|---|---|
| `users` | ISO-8601 **string** |
| `tickets`, `messages` | Firestore **server timestamp** |

These serialise differently over JSON. Normalise at the API boundary — pick one wire
format (ISO-8601 string) and convert in the response model, so the frontend never
has to branch on which collection a date came from.

## Existing query paths

Indexes the bot already relies on. Do not break them:

- `tickets` where `thread_id == ...` limit 1
- `tickets` where `discord_meta.thread_id == ...` limit 1
- `tickets` where `status in ["open", "in_progress"]`
- `tickets` where `created_by.discord_id == ...`
- `users` where `discord_id == ...` limit 1
- `users` where `email == ...` limit 1

Added by the SPG workflow. These are API-side only; the bot does not use them,
but they need composite indexes in Firestore:

- `spgs` where `status ==` / `type ==` / `track ==` / `visibility ==`, and any
  two of those combined
- `spg_reports` where `spg_id ==` order by `sequence_number`
- `spg_reports` where `spg_id ==` and `report_type ==` order by `sequence_number`

`report_format` is stored but never filtered on — the report list is not
segmented by format — so it needs no index. A field existing is not a reason
to index it.

There is no `firestore.indexes.json` in this repository, so these must be
created by whoever owns the Firebase console.
