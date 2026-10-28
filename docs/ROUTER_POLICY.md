# Router Policy (Draft v0.1)

One rule governs all inference: **local by default, cloud by exception, personal never leaves.** This doc is the one-page policy the router enforces in code. If a task isn't listed here, it runs on-device.

## Task routing

Each task maps to exactly one route and one data allowance:

- **Private chat / journaling / Q&A over entries** → in-browser (WebLLM, Llama 3.2 1B). Data: all entries, all tags. Never touches network.
- **Retrieval (RAG)** → in-browser retriever. Data: all entries; tag filter applied before ranking so `personal` vectors are never in a cloud-bound context.
- **Dashboard + alignment signal** → local, rule-based from check-ins (counts and self-reported progress). No model call at all.
- **Skill-vs-goal gap view** → local (retrieval + template). No model call for MVP; upgrade to 1B summarization only if quality fails evals.
- **Action plan generation** → CLOUD (Meta Model API). Allowed data: the single goal + linked entries tagged `shareable` only. `personal` entries are replaced with a stub (`[personal entry withheld: <type>]`) so the model knows something exists without seeing it. Response cached per goal-version.
- **Pack summarization (export preview)** → CLOUD, optional. Allowed data: shareable entries in the pack only. Skippable — export works without it.
- **Golden eval runs** → CLOUD for grading open-ended outputs; fixtures only, never real user entries.
- **Embeddings** → in-browser embedding model (Transformers.js). No cloud embedding endpoint in MVP (vectors leak content and would double-spend the budget).

Fallback: if offline, WebGPU is unavailable, or the budget cap is hit, cloud tasks degrade to the in-browser 1B (or a templated draft if no GPU) with a visible "local draft" label. Cloud is never on the critical path of the demo.

Stretch: native mobile via ExecuTorch reuses this same policy with `engine: 'local'` pointing at the `.pte` model — no policy change needed.

## Enforcement (code sketch, not pseudocode-for.proto)

- `route(task)` returns `{engine: 'local' | 'cloud', data_filter}` from the mapping above. Unknown task → `'local'`.
- `scrub(payload, filter)` runs on every cloud-bound payload: drops all `personal` entries (replacing with stubs), asserts no `health`/`finance`/`relationship`/`journal` content present, and throws on violation — fail closed, never send partial.
- `budget.check(estimated_tokens)` runs before every cloud call; `budget.record(actual_tokens)` after. Over cap → throw `BudgetExhausted`, router falls back to local.
- Every cloud call logs locally: `{at, task, model, input_tokens, output_tokens, est_cost}`. This log is the budget meter's source of truth and is never uploaded.

## Budget

- Internal hackathon cap: **$25 of the $150** (leaves headroom for eval iteration and demo-day retries).
- Cache key: `(task, goal_or_pack_id, content_hash)` — identical inputs never pay twice.
- Plan generation is the only recurring cloud cost; estimate per plan at hackathon scale is cents, so $25 covers hundreds of plans plus evals.
- The budget meter is visible in UI (demo talking point: "this app shows you what your AI costs").

## Privacy claims this policy supports (and wording)

Supported: "Personal entries never leave your device." / "Cloud calls carry only shareable content, with personal entries withheld." / "Core features work offline."
NOT supported — never claim: "encrypted processing," "zero-knowledge," "your data trains nothing" (can't assert for the API provider; instead: "we send only what you approved, per call, visible in the budget log").

## Open questions (decide before code)

- Stub vs. silent drop: does telling the cloud model "a personal entry exists here" leak too much via count/position? (Recommend stubs for MVP; revisit if Security objects.)
- Should plan generation default to cloud or local-first-with-upgrade-button? (Recommend cloud-default with visible local fallback, since plan quality is the demo's wow moment.)
- Log retention for the budget log: session-only or persistent? (Recommend persistent — it's the audit trail.)
