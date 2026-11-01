# Augmented Paths — design (pre-implementation)

Status: PM approved (post-demo scope) and Security approved with conditions, 2026-11-01. The conditions below are binding acceptance criteria; the Router Policy amendment is enacted in `docs/ROUTER_POLICY.md`.

## Approvals (2026-11-01)

**PM — approved, post-demo.** Fits MVP? No — and that is fine: this is the first post-demo monetization design and must not touch demo scope or rehearsal. Demo beat served: none (by design). Eligible v1 Path kinds confirmed: Learning/Research asks only. What gets cut to fit: hosted billing/accounts (deferred), all other Path kinds, mobile-specific augmented UX. Acceptance criteria stand as written below, plus the Security conditions.

**Security — approved with binding conditions.** No entry text, vectors, or scrubbed-entry payloads may ever be inputs to this tier. Conditions:

1. Archetype labels sent are platform labels only; user-renamed (custom) labels are never sent.
2. Skill names sent are platform lexicon names only; user-created skill names are excluded in v1.
3. The BYO provider key is never persisted in plaintext localStorage: session-memory by default; when the vault is active it may be stored sealed in the vault. The key never enters packs or backups (backups export the database only — keep it that way).
4. v1 destinations are allowlisted (`api.baseten.co`); any other host requires an explicit per-host confirmation showing the hostname in the consent sheet.
5. `request.ask` stays capped at 120 chars of plain text (validator-enforced).
6. Consent revocation deletes consent records and the stored key (the kill switch); removing the key disables the tier entirely.
7. Augmented outputs are stored as personal data, excluded from packs and shareable contexts. (Inclusion in the user's own encrypted backup is acceptable.)

## Goal (PM)

A paid, opt-in tier inside Paths: frontier online models reason over how the user learns, researches, and works — sequencing learning paths and research strategies fitted to the user's actual patterns. It exists because a local 30B (or 3B on laptops) cannot match frontier reasoning, and some users will pay for that gap.

Demo beat it serves: none for the current demo. This is the first post-demo monetization design; it must not destabilize the local demo story.

## Non-goals

- No raw entries, titles, bodies, names, or free text ever leave the device in this tier.
- No personal-life inference online (relationships, health, finance stay local-only, always).
- No Hyperself-hosted backend, accounts, or billing in v1.
- No change to the local tiers, the tag boundary, or pack sharing.

## What is sent: the derived learning profile (DLP)

Built locally from synthesis outputs — never from entry text. Exact schema (v1):

```json
{
  "kind": "hyperself-augmented-paths",
  "version": 1,
  "archetypes": [{ "label": "Margin Annotator", "strength": "established" }],
  "skills": [{ "name": "Research", "entries": 14 }, { "name": "Writing", "entries": 6 }],
  "patterns": {
    "finishing_vs_collecting": "finishing-leaning",
    "reading_signals": 21,
    "research_signals": 18,
    "active_months": 9,
    "entries_by_type": { "research": 22, "finding": 11, "method": 5 }
  },
  "request": { "ask": "sequence a learning path for research leadership", "path_name": "Learning" }
}
```

Rules:

- **Allowlist, not denylist.** The payload is constructed field-by-field from this schema; a validator (`assertDerivedOnly`) rejects any key outside it and any string longer than 120 chars outside `request.ask`. A golden test feeds it entry text and requires failure.
- **Aggregates only.** Counts, ratios, trend words, confirmed archetype labels (user-confirmed only — never "not me" or unconfirmed), skill names the platform itself maintains, and the user's own ask for this Path. No dates finer than a month count, no entry ids, no people.
- **Derived is still personal.** UI copy says so plainly: "This profile describes your patterns. It contains no entries, names, or text from your knowledgebase."

## Flow

1. User opens a saved Path (or starts an ask) and chooses **Augment this Path** (paid tier, visibly distinct from local Expound).
2. The app builds the DLP locally and shows a **consent sheet**: the exact JSON, a plain-language summary of each field, the destination host, and the model. Send / Cancel. First send per destination always shows the sheet; a "remember for this destination" option may skip it later, revocable in the same card.
3. The browser calls the provider directly with the **user's own API key** (BYO key, stored only in local device storage, never in the vault export or packs). v1 target: Baseten (Spark-class models); the endpoint is OpenAI-compatible, matching the existing local-server client shape.
4. The reply renders inside the Path, badged **Augmented · inference**, with the model name and date. It is stored locally as personal data attached to the Path — never shareable, never in packs, excluded from backup only by the user's normal backup choice.
5. Any failure (no key, provider error, validator rejection) fails closed with a plain message. Local Expound remains available and unchanged.

## Claim wording (proposed)

Supported after this ships:

- "Personal entries never leave your device." (unchanged — Augmented Paths do not send entries)
- "Augmented Paths (optional, paid) send only a derived pattern profile — counts and pattern labels, no entries or names — only to the provider you choose, only when you approve the exact payload."

Forbidden, still:

- "Everything stays on your device" as a blanket claim once this tier is enabled anywhere in marketing copy; scope it: "by default / in local mode."
- Any suggestion the derived profile is anonymous. It is minimized and consented, not anonymized.

## Router Policy amendment (proposal for Security)

- New task: `augmented-path`, cloud-allowed **only** with (a) a payload passing `assertDerivedOnly`, (b) an explicit per-destination consent record, (c) a user-supplied provider key. Entries, vectors, and shareable-scrub payloads are not valid inputs to this task; `scrubForCloud` is not reused (entries are never in scope).
- Token log records: destination host, model, payload byte size, timestamp. Never payload contents.
- Security review checklist before merge: validator tests, consent-sheet copy, key storage (device-only, excluded from packs/backups), failure modes, and a kill switch (removing the key disables the tier entirely).

## Acceptance criteria (QA)

- Golden: a payload containing any entry title/body/name fails `assertDerivedOnly` (fail-closed test in CI).
- Golden: with no key or an unreachable provider, Augmented fails closed and local Expound still works.
- Golden: the consent sheet shows the exact bytes that are then sent (hash equality in test).
- Golden: augmented output renders with the inference badge and never appears in a pack export or shareable context.
- Live tier (manual, pre-release): one real Baseten call with a fixture persona produces a learning-path reply judged for groundedness against the DLP only.

## Risks & open decisions

- **BYO-key UX** is developer-flavored; acceptable for v1's paid-early-adopter scope, revisited if the tier proves demand (hosted tier would need accounts/billing — a separate decision).
- **Provider drift:** model names/pricing change; the tier must degrade to "unavailable" copy, never silently switch models.
- **Profile sensitivity creep:** any schema addition (new field) requires the same Security review as a new data type. The schema is versioned for this reason.
- Decisions taken 2026-11-01: Security approved the Router amendment + claim wording with the conditions above; PM confirmed Learning/Research as the only v1 eligible Path kinds. Next gate: implementation against the acceptance criteria.
