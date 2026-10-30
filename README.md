# Hyperself — your life's archive, understood privately

**Your scattered life archive, understood: decades of documents, statements, journals, and photos brought together in one encrypted place on your device — revealing who you have been, who you are, and the Paths to where you could go next. Private. Offline. Never uploaded.**

Most personal data is fragmented across documents, statements, journals, calendars, photos, and recordings, spanning years of non-linear change. Hyperself brings that archive together locally, synthesizes what it says about you, and turns it into Paths: concrete, descriptive next views of your finances, relationships, reading life, and more. You never journal by hand, and nothing personal ever leaves the device.

## What is built

### Knowledgebase

- **Synthesis** — a profile card with archetype pills (Bookworm vs Book Hoarder, Network Weaver, Serial Pivoter, and more) and a two-sentence essence generated on-device from everything you have uploaded. Archetype cards explain the evidence behind each label, show how your archetypes changed across the years of your archive, and let you Confirm, Rename, or dismiss (“Not me”) any label — you are the final authority. Nothing diagnostic, nothing clinical.
- **Network** — a D3 graph with you at the center: uniform avatar circles (photo or initials), names on hover only, slow orbit that pauses when you drag. Person cards open a modal with your shared timeline, key moments, known-for duration (“you've known each other for X years”), and private notes. Tag people on images at upload; Hyperself finds them in your texts automatically.
- **Import & Connect** — the only place uploads and links are managed:
  - Documents: Markdown/text, CSV bank statements (review-then-import), PDF (text layer), DOCX, RTF, JSON, HTML (including Apple Journal exports), ICS calendars, VCF contacts.
  - Audio recordings transcribed fully on-device (Whisper) and searchable (“audio …” queries).
  - Images with on-device OCR (Tesseract.js), EXIF dating, and person tagging, flagged in Security if they look inappropriate or compromising.
  - Folder sync with content-hash dedupe and change detection across re-scans.
  - Simulated account links for the demo (clearly labeled simulated; no real third-party integration yet).
  - Every upload is classified by you — Mine, Shared with me, or Reference. Reference material stays searchable but never shapes your Synthesis. Classification is your declaration; Hyperself never claims to verify ownership.
- **Security** — local scanning of everything you upload (secrets, contact details, stale data, crisis language handled supportively and non-diagnostically), with actionable findings and a right-edge badge in both Knowledgebase and Paths.

### Paths

- Ask anything in the search bar and save the answer as a pinned Path; pinned Paths become subtabs beside Insights, Templates, and Security.
- Templates are suggested only when you have already shared related data — nothing is pushed at you: **Finance** (from bank statements: category spend, monthly trend, recurring costs; hidden until finance data exists, descriptive only, never advice), **Relationship Rhythms** (who has gone quiet, descriptively), **Reading Life** (finished vs collected).
- Insights carry one concrete next step each — including coverage blind spots (“no finance knowledge yet → import a statement”) and archetype-lensed notes (“For your Network Weaver side: Ana has gone quiet”). Pin, expound, or mark reviewed.

### Legacy

Export a hash-verified knowledge pack of shareable entries only, import packs from others, and ask questions answered on-device from pack entries alone. Personal entries can never enter a pack.

### Trust model

- **Offline-first PWA**: installable, works in airplane mode after first load.
- **Vault**: AES-GCM encrypted storage unlocked by PIN, with optional biometric unlock (WebAuthn PRF) that genuinely unwraps the key. A forgotten PIN without biometrics is unrecoverable by design.
- **Two tags govern everything**: `personal` never leaves the device process; `shareable` is explicit, per entry, and health/finance/journal/relationship/document entries can never be shareable.

## Run it

```sh
cd app
npm install
npm run dev    # http://localhost:5173
npm test       # 24 focused suites over the real store/parsers/analyzers
npm run build  # typecheck + production build
```

Demo personas (Maya, Daniel, Rosa — 20-year non-linear arcs, 26–29-person networks) load from the gear menu (bottom-right, or Ctrl/Cmd+Shift+D). Demo script: `docs/DEMO_SCRIPT.md`.

## Honest limits

- Account connections are simulated for the demo; real integrations are future work.
- Scanned/image-only PDFs have no text layer and are refused with a reason; legacy `.doc`/`.xls` and EPUB are not parsed.
- On-device LLM drafting uses WebLLM (WebGPU) where available and falls back to local fact-based synthesis without it.
- Archetypes are playful, evidence-backed patterns inferred locally — not personality tests, diagnoses, or labels you did not approve.

## Repo layout

- `app/` — Vite/TypeScript PWA (store, vault, ingest/parsers, synthesis/archetypes, network, paths, security, psych guardrails)
- `docs/` — `MVP_PLAN.md`, `DESIGN.md`, `DATA_MODEL.md`, `PATHS.md`, `VAULT.md`, `PSYCHOLOGY.md`, `DEMO_SCRIPT.md`, `ROUTER_POLICY.md`, `AUDIT.md`
- `figmadesign.md` — Figma handoff mirroring the implemented UI
- `AGENTS.md` — agent roster and operating rules

## Status

Working demo build: vault unlock, offline PWA, synthesis/archetypes, network, multi-format import (documents/audio/images/folders), Paths with templates (Finance, Relationship Rhythms, Reading Life), security scanning, and pack export/import — covered by `npm test` and CI. Cloud routing modules exist behind the privacy router for shareable-only tasks; the demo loop runs fully on-device.
