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

The app probes the endpoint at load and auto-connects when the server appears (`src/engine.ts`: `ReconnectingEngine`); endpoint/model are configurable in Synthesis → “Local model — Muse Glimmer” and persist locally. With no server, `StubEngine` produces templated drafts from retrieved entries. In-browser Transformers.js still handles MiniLM embeddings and Whisper transcription.

## What's real

- IA: Knowledgebase (Synthesis + Network + Import & Connect + Security) · Paths (Insights, Suggested Paths, Templates, History, Security) · Legacy (packs)
- Ingestion-only Library: uploads, simulated connections, and persona files feed entries; the user curates tags (`personal` default; journal/health/finance/relationship/document can never be shareable) — no manual journaling
- Formats: MD/TXT/CSV (bank statements, review-then-import), PDF text layer, DOCX, RTF, JSON, HTML (incl. Apple Journal), ICS, VCF; audio via on-device Whisper; images via Tesseract OCR + EXIF dating; folder sync with hash dedupe
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
