# Entry Data Model (Draft v0.1)

Everything in Hyperself keys off entries. Goals, skills, check-ins, and Legacy packs are all views or bundles over entries. If it isn't an entry, it doesn't cross the privacy boundary — because only entries carry the tag that boundary enforces.

## Design principles

1. **`personal` is the default.** Every entry is born personal. Becoming `shareable` requires an explicit user action, logged with timestamp.
2. **Tags are enforced in code, not convention.** The storage layer refuses to serialize `personal` entries for any network call. See `docs/ROUTER_POLICY.md`.
3. **Embeddings inherit the tag.** A `personal` entry's vector never leaves the device either — vectors leak content.
4. **Packs contain copies, not references.** Exporting a Legacy pack snapshots shareable entries at export time. Later edits don't propagate; re-export creates a new pack version.

## Entities

### Entry

The atomic unit of knowledge.

- `id` — UUIDv4, generated on-device
- `type` — one of: `journal` | `goal-note` | `skill` | `health` | `finance` | `relationship` | `finding` | `method` | `research` | `document`
- `title` — short, required (max 140 chars)
- `body` — markdown, required (max 20k chars for MVP)
- `tag` — `personal` (default) | `shareable`
- `tag_history` — append-only list of `{tag, at, actor}` (`actor`: `user` | `import`)
- `goal_ids` — links to goals this entry supports (empty allowed)
- `skill_ids` — links to skills this entry evidences (empty allowed)
- `people` — free-text person names for the network rollup (empty allowed, normalized on write)
- `source` — `typed` | `check-in` | `import` | `upload` | `connection`
- `source_label` — file name, provider name, or pack marker for ingested content (optional)
- `embedding_status` — `pending` | `indexed` | `stale` (body edited after indexing)
- `created_at`, `updated_at` — device-local timestamps, ISO 8601
- `deleted_at` — soft delete; tombstone retained for pack-hash stability

Validation: `health`, `finance`, `relationship`, `journal`, `document` types **cannot** be tagged `shareable` in MVP. (A user can copy content into a `finding`/`method` entry and share that instead — friction is intentional.)

### Goal

A direction, not a task list.

- `id` — UUIDv4
- `title` — required (max 140 chars)
- `description` — markdown, optional
- `tag` — same rules as entry; goals are `personal` by default
- `status` — `active` | `paused` | `achieved` | `abandoned`
- `target_date` — optional date
- `created_at`, `updated_at`

Goal → entry linkage lives on the entry side (`goal_ids`), so deleting a goal never deletes knowledge.

### Check-in

A timestamped self-report against one goal. This is the MVP's only "activity tracking."

- `id` — UUIDv4
- `goal_id` — required, must reference an existing goal
- `at` — timestamp
- `progress` — `behind` | `steady` | `ahead` (user self-report, required)
- `note` — optional markdown (max 2k chars); becomes a linked `goal-note` entry automatically
- `alignment` — derived at read time (see Dashboard), never stored as fact

> Prototype pivot: manual check-ins are removed from the UI — progress history comes from ingested sources instead. The type is retained for a future goal-progress signal.

### Skill

A capability the user claims, evidenced by entries.

- `id` — UUIDv4
- `name` — required (max 80 chars)
- `level` — `learning` | `practicing` | `strong` (self-assessed)
- `tag` — same rules as entry

Skill ↔ entry linkage lives on the entry side (`skill_ids`). The Paths gap view compares skills (have) against goals (want).

### Network (derived, not stored)

No Person table in the prototype. People are free-text `people` tags on entries; `listPeople()` rolls them up into per-person entry lists at read time. Information accrues to a person two ways: tagging an entry (Library) or tagging at import (uploads/paste). Relationship entries conventionally carry their own person. Names are PII: they inherit their entry's tag, and relationship entries can never be shareable.

### Legacy pack (export format)

A versioned snapshot of shareable entries. File: `hyperself-pack-<slug>-<version>.zip`.

- `manifest.json`:
  - `pack_id` — UUIDv4
  - `version` — semver, bumped per export
  - `author_label` — user-chosen display name (no device ids, no emails in MVP)
  - `created_at`
  - `embedding_model` — model id + version used for included vectors (receiver re-indexes if mismatch)
  - `entries` — list of `{entry_id, type, title, sha256}` for verification
  - `entry_count`
- `entries/` — one markdown file per entry (frontmatter: id, type, title, dates)
- `vectors/` — embeddings, same ids; optional (receiver can re-index from text)

Import rules: verify every hash before indexing; imports arrive tagged `shareable` with `source: import` and `actor: import` in tag history; a user may re-tag an imported entry `personal`, never the reverse without editing. Packs MUST NOT contain `personal` entries — the exporter filters and the importer rejects any entry whose frontmatter claims `personal`.

## Storage (MVP)

- SQLite with SQLCipher (encrypted at rest, key in platform keystore) for entries, goals, check-ins, skills.
- Sidecar vector store (sqlite-vec or platform equivalent) for local embeddings; vectors keyed by entry id, tag-checked on every read.
- No server database in MVP. Cloud calls are stateless (see router policy).
- Vectors (implemented): `Xenova/all-MiniLM-L6-v2` embeddings computed on-device, stored in a localStorage sidecar keyed by entry id (`hyperself.vectors.v1`), deleted with their entry, never serialized for network. `embedding_status` transitions `pending → indexed` after embedding; re-index is user-triggered from the Library overview. Known limit: localStorage capacity — OPFS/SQLite migration is the follow-up.

## Open questions (decide before code)

- Do imported entries count toward the receiver's Paths, or display only? (Recommend: display + retrieval, excluded from gap math until user links them.)
- Entry size cap: is 20k chars enough for research imports?
- Multi-device sync: explicitly out of MVP (pack export/import is the sync).
