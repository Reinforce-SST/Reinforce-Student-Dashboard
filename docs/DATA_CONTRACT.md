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

⚠️ **Written twice.** The API writes the same payload to `users/{email}` *and*
`users/{discord_id}`. Linking and unlinking update the two records transactionally. Profile-only edits use the email document.

- The **website** looks up by lowercased email.
- The **bot** looks up by Discord ID first, then falls back to querying the
  `discord_id` field.

```jsonc
{
  "email":         "student@sst.scaler.com",  // lowercased, trimmed
  "full_name":     "string",
  "avatar_url":    "string | null",
  "firebase_uid":  "string | null",
  "discord_id":    "string | null",           // numeric snowflake, as a string
  "discord_link_version": "1 | null",       // proof from a private YUVI token
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

There is no `role` or `tier` field. RBAC does not exist yet.

---

## `tickets/{auto_id}`

Written by the bot when a member submits a ticket modal in Discord. Document ID is a
Firestore auto-ID, **not** the Discord thread ID.

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
web write path that does not exist yet. Phase 2 fills it.

The website queries the latest 300 messages in descending timestamp order, then reverses them for chronological display. The bot has its own transcript read path.

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

## Access rules

- `report` category tickets are **confidential**. The Discord modal tells members
  they are visible only to core admins. Any mirror of this collection must filter
  `category == "report"` out of member-facing views and gate it behind an admin role
  — which does not exist yet. Until RBAC ships, **do not surface `report` tickets on
  the website at all.**
- Members may only read tickets where `created_by.discord_id` matches their own
  linked Discord ID. Both user documents must carry `discord_link_version == 1` and
  agree on the email and Discord ID. Legacy raw-ID links do not authorize reads.
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

## `discord_link_tokens/{sha256_token}`

YUVI creates a random 32-byte URL-safe token and privately sends it in the
`/auth#link_token=...` fragment. Only its SHA-256 hash is stored as the document ID.
The collection is server-only: client reads/writes must be denied.

| Field | Type / writer |
|---|---|
| `discord_id` | String snowflake from the Discord interaction; YUVI |
| `issued_at` | Native UTC timestamp; YUVI |
| `expires_at` | Native UTC timestamp, ten minutes after issue; YUVI |
| `consumed_by` | Null initially; Firebase UID after consumption; API |
| `email` | Normalized verified SST email after consumption; API |
| `consumed_at` | Native UTC timestamp; API |

The API transaction reads the proof and both user documents before writing any
of them. A repeat from the same UID/email is accepted only while the proof has not
expired and the reciprocal link still exists. Another account, a changed/unlinked
identity, an expired token, or a conflicting pre-existing link is rejected.
Firestore TTL on `expires_at` is optional cleanup, never the authorization check.
The bot webhook requires the existing shared secret plus reciprocal proof before
granting a role. A failed role grant does not undo a proven identity; rerun `/auth`
to get a new private link and retry. See [rollout](verification.md).
