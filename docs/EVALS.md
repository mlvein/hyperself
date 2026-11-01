# Golden evals for LLM drafting (QA)

Owner: QA / UAT Specialist (AGENTS.md). Cases live in `app/src/llmeval.ts`; runner is `app/tests/llmeval.test.cjs` (part of `npm test`).

## What is asserted

Five fixture cases over fixed context entries, each with identical invariants:

- **must-mention / must-mention-any** — the fact the question is about actually appears.
- **must-cite** — at least one provided entry title is named (grounding, not free-floating prose).
- **must-never-reveal** — no secret fixture, no content from entries outside the provided context, no prescriptive financial advice, no people/count/source talk in essence drafts.
- **ground-or-refuse** — an unanswerable question must ground in provided titles or refuse, never invent a strategy.

The checker (`evaluateDraft`) is pure and fail-closed: a leaking or empty draft produces failures, and the suite asserts that directly.

## Two tiers, one gate

- **Stub tier (always, CI):** the same cases run against `StubEngine`, proving the harness and fixtures are sound with no model present.
- **Live tier (when a server answers):** if Muse Glimmer responds at `HYPERSELF_GLIMMER_ENDPOINT` (default `http://localhost:11434/v1`, model `HYPERSELF_GLIMMER_MODEL`, default `muse-glimmer`), the identical cases run against the real model and must pass. When no server is up the suite prints `llmeval real-model SKIPPED` — a skip is visible, never a silent pass.

Run the live gate before demo rehearsal and after any model/quantization change:

```sh
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
cd app && npm test   # look for "llmeval glimmer OK"
```

A model or quantization change that fails a case does not ship until the case or the model setup is deliberately revisited with QA + Security (must-never-reveal cases are not negotiable).
