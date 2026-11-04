# Hyperself app

Vite/TypeScript PWA implementing the MVP docs. Local-first: parsing, retrieval, insights, and drafting never touch a remote network; the only model calls go to a Muse Glimmer server on the same device.

## Run

```sh
cd app
npm install
npm run dev
```

Open the printed local URL in a browser (default http://localhost:5173/).

`npm run build` typechecks and produces a production build. `npm test` runs 24 focused suites over the real store, parsers, and analyzers.

## Deep synthesis (optional, local)

Synthesis/Expound drafting uses Muse Glimmer (Meta open-weight 30B) served on this device via any OpenAI-compatible local server:

```sh
ollama pull muse-glimmer
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

The app probes the endpoint at load and auto-connects when the server appears (`src/engine.ts`: `ReconnectingEngine`); endpoint/model are configurable in Settings → “Local model — on this device” (sidebar, bottom) and persist locally; Synthesis shows the active model with a link to Settings. With no server, `StubEngine` produces templated drafts from retrieved entries. Embeddings come from Meta Llama (`llama3.2:3b`) on that same local server; transcription runs Meta's wav2vec 2.0 in-browser via Transformers.js, and image OCR runs through Muse Glimmer vision on the local server. Every model called at runtime is a Meta model — the engine allowlist (`isMetaModel`) refuses anything else.

## What's real

- IA: sidebar navigation — Knowledgebase (Synthesis + Network + Import & Connect + Security) · Paths (Insights, Suggested Paths, Templates, History, Security) · Legacy (packs) · Settings at the sidebar bottom (local model, privacy shortcuts, interface language: English / Español for UI chrome — entries are never translated)
- Ingestion-only Library: uploads, simulated connections, and persona files feed entries; the user curates tags (`personal` default; journal/health/finance/relationship/document can never be shareable) — no manual journaling
- Formats: MD/TXT/CSV (bank statements, review-then-import), PDF text layer, DOCX, RTF, JSON, HTML (incl. Apple Journal), ICS, VCF; audio via on-device Meta wav2vec 2.0; images via Muse Glimmer OCR + EXIF dating; folder sync with hash dedupe
- Vault (`src/vault.ts`): AES-GCM sealed storage, PIN (PBKDF2) unwrap, optional WebAuthn PRF biometrics
- Vulnerability layer (`src/security.ts`): local-only heuristic scan per entry with severity pills, summary card, and export confirm guard
- Router (`src/router.ts`): task routing + `scrubForCloud` (fail-closed) for shareable pack tasks. Online reasoning exists only as Augmented Paths (`src/augmented.ts`, derived profile + BYO key); the former caller-less cloud plan generator was removed
- Paths (`src/insights.ts`, `src/templates.ts`): stale/security/exposure/fresh analyzers with stable ids; pin/acknowledge/dismiss state in `hyperself.paths.v1`; no Path pinned by default; template suggestions surface on Insights; History holds approved + dismissed insights
- Pack export/import (`src/pack.ts`): hash-verified JSON, importer rejects personal-tagged payloads
- Personas: `npm run personas` builds Maya/Daniel/Rosa into `public/personas/*.json`, loaded through the real store path

## What's stubbed (next steps)

- `src/store.ts`: localStorage (vault-sealed) stands in for OPFS/SQLite
- Pack `.zip` packaging (manifest shape is final; only the container changes)
- Real third-party account integrations (connections are simulated and labeled)

## Doc map

- `../docs/DATA_MODEL.md` → `src/types.ts`, `src/store.ts`
- `../docs/ROUTER_POLICY.md` → `src/router.ts`, `src/augmented.ts`, `src/engine.ts`
- `../docs/MVP_PLAN.md` → scope rules enforced above
