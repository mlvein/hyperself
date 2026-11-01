# Router Policy (Draft v0.1)

One rule governs all inference: **local by default, cloud by exception, personal never leaves.** This doc is the one-page policy the router enforces in code. If a task isn't listed here, it runs on-device.

## Task routing

Each task maps to exactly one route and one data allowance:

- **Private chat / journaling / Q&A over entries** → in-browser (WebLLM, Llama 3.2 1B). Data: all entries, all tags. Never touches network.
- **Retrieval (RAG)** → in-browser retriever. Data: all entries; tag filter applied before ranking so `personal` vectors are never in a cloud-bound context.
- **Dashboard + alignment signal** → local, rule-based from check-ins (counts and self-reported progress). No model call at all.
- **Skill-vs-goal gap view** → local (retrieval + template). No model call for MVP; upgrade to 1B summarization only if quality fails evals.
- **Action plan generation** → LOCAL (tiered on-device model; see engine tiers). Data: goal + linked entries on-device. The former cloud plan generator (`src/cloud.ts`) was removed 2026-11-01: it had no callers and its role is covered locally, with Augmented Paths as the only online reasoning tier (derived profile only).
- **Pack summarization (export preview)** → CLOUD, optional. Allowed data: shareable entries in the pack only. Skippable — export works without it.
- **Golden eval runs** → CLOUD for grading open-ended outputs; fixtures only, never real user entries.
- **Embeddings** → in-browser embedding model (Transformers.js). No cloud embedding endpoint in MVP (vectors leak content).
- **Augmented Paths (post-demo, paid, opt-in)** → CLOUD via the user's own provider key. Allowed data: a Derived Learning Profile only (platform archetype labels, lexicon skill counts, pattern aggregates, the user's ask) that passes `assertDerivedOnly`, sent only after per-destination consent with an exact-payload preview, only to allowlisted hosts. Entries, vectors, and `scrubForCloud` payloads are never valid inputs. See `docs/AUGMENTED_PATHS.md` for the schema and binding Security conditions.

Fallback: if the local model server is unavailable, drafting degrades to templated local drafts with an honest label. Cloud (Augmented Paths only) is never on the critical path of the demo.

Stretch: native mobile via ExecuTorch reuses this same policy with `engine: 'local'` pointing at the `.pte` model — no policy change needed.

## Enforcement (code sketch, not pseudocode-for.proto)

- `route(task)` returns `{engine: 'local' | 'cloud', data_filter}` from the mapping above. Unknown task → `'local'`.
- `scrub(payload, filter)` runs on every cloud-bound payload: drops all `personal` entries (replacing with stubs), asserts no `health`/`finance`/`relationship`/`journal` content present, and throws on violation — fail closed, never send partial.
- Cache key: `(task, goal_or_pack_id, content_hash)` — identical inputs are never sent twice.

## Privacy claims this policy supports (and wording)

Supported: "Personal entries never leave your device." / "Cloud calls carry only shareable content, with personal entries withheld." / "Core features work offline." / "Augmented Paths (optional) send only a derived pattern profile — no entries or names — to the provider you choose, only when you approve the exact payload." Once Augmented Paths ships, blanket "everything stays on your device" marketing copy is not supported; scope it to local mode/default.
NOT supported — never claim: "encrypted processing," "zero-knowledge," "your data trains nothing" (can't assert for the API provider; instead: "we send only what you approved, per call").

## Open questions (decide before code)

- Stub vs. silent drop: does telling the cloud model "a personal entry exists here" leak too much via count/position? (Recommend stubs for MVP; revisit if Security objects.)
- Should plan generation default to cloud or local-first-with-upgrade-button? (Recommend cloud-default with visible local fallback, since plan quality is the demo's wow moment.)
