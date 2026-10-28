# Hyperself app (scaffold)

PWA implementing the MVP docs: entries, goals, check-ins, dashboard, Legacy packs, router + budget meter. Local-first: chat, retrieval, and dashboard never touch the network.

## Run

```sh
cd app
npm install
npm run dev
```

Open the printed local URL in a browser (default http://localhost:5173/).

`npm run build` typechecks and produces a production build.

## What's real

- IA: Knowledgebase (Library + Network + Import & Connect) · Paths (local insights with pin/acknowledge/expound actions) · Legacy (packs)
- Ingestion-only Library: uploads, simulated connections (Notion, Drive, Health, Calendar), and persona packs feed entries; the user curates tags (`personal` default; journal/health/finance/relationship can never be shareable) and states goals — no manual journaling
- Vulnerability layer (`src/security.ts`): local-only heuristic scan per entry (secrets, contact details, staleness, shared-exposure) with severity pills, a summary card, and an export confirm guard
- Get-to-know-you onboarding: name profile, privacy explainer, one-click persona/connection seeding, first goal
- Router (`src/router.ts`): task routing, `scrubForCloud` (fail-closed), budget cap + meter
- Cloud plan generation (`src/cloud.ts`, parked): OpenAI-compatible POST, prompt cache, token/cost logging — modules retained, no UI entry point since the Paths rebuild
- Local insights (`src/insights.ts`): stale/security/exposure/fresh analyzers with stable ids, pin + acknowledge state in `hyperself.paths.v1`
- Pack export/import (`src/pack.ts`): hash-verified JSON, importer rejects personal-tagged payloads
- Ingestion (`src/ingest.ts`): `.md`/`.txt` upload + paste, local chunking with heading context, people tagging; sample persona via `npm run personas` (Maya, 37 entries over 6 simulated weeks incl. official docs, health records, work notes, and a 4-person network — loaded through the real store path)
- Network: free-text `people` tags on entries (Library chips, import tagging), per-person rollups with Library filtering; `document` type added to never-shareable list
- Keyword retrieval fallback; local templated drafts in chat and as cloud fallback

## What's stubbed (next steps)

- `src/engine.ts`: `StubEngine` stands in for WebLLM (`npm i @mlc-ai/web-llm`, implement `loadWebLLMEngine`)
- `src/store.ts`: localStorage stands in for OPFS/SQLite + Web Crypto
- `PLACEHOLDER_RATES` in `src/router.ts`: replace with real Meta.dev pricing
- Pack `.zip` packaging (manifest shape is final; only the container changes)

## Doc map

- `../docs/DATA_MODEL.md` → `src/types.ts`, `src/store.ts`
- `../docs/ROUTER_POLICY.md` → `src/router.ts`, `src/cloud.ts`, `src/engine.ts`
- `../docs/MVP_PLAN.md` → scope and budget rules enforced above
