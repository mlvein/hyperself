# Hyperself — your life's archive, understood privately

**Your scattered life archive, understood: decades of documents, statements, journals, and photos brought together in one encrypted place on your device — revealing who you have been, who you are, and the Paths to where you could go next. Private. Offline. Never uploaded.**

Most personal data is fragmented across documents, statements, journals, calendars, photos, and recordings, spanning years of non-linear change. Hyperself brings that archive together locally, synthesizes what it says about you, and turns it into Paths: concrete, descriptive next views of your finances, relationships, reading life, and more. You never journal by hand, and nothing personal ever leaves the device.

## What is built

### Knowledgebase

- **Synthesis** — a profile card with archetype pills (Margin Annotator vs Shelf Cartographer, Keeper of Threads, Compass Resetter, and more — novel coinages tied to familiar patterns, not stock labels) and a two-sentence essence generated on-device from everything you have uploaded. Archetype cards explain the evidence behind each label, show how your archetypes changed across the years of your archive, and let you Confirm, Rename, or dismiss (“Not me”) any label — you are the final authority. Nothing diagnostic, nothing clinical.
- **Network** — a D3 graph with you at the center: uniform avatar circles (photo or initials), names on hover only, slow orbit that pauses when you drag. Person cards open a modal with your shared timeline, key moments, known-for duration (“you've known each other for X years”), and private notes. People come from tags you apply at import or upload (including on images), plus local structured extraction at ingest: people already in your knowledgebase are auto-linked when mentioned, recurring new names are cautiously auto-tagged, and entries auto-link to matching goals and evidenced skills (`src/extract.ts`, deterministic and on-device — every tag stays removable).
- **Import & Connect** — the only place uploads and links are managed:
  - Documents: Markdown/text, CSV bank statements (review-then-import), PDF (text layer), DOCX, RTF, JSON, HTML (including Apple Journal exports), ICS calendars, VCF contacts.
  - Audio recordings transcribed fully on-device (Whisper) and searchable (“audio …” queries).
  - Images with on-device OCR (Tesseract.js), EXIF dating, and person tagging, flagged in Security if they look inappropriate or compromising.
  - Folder sync with content-hash dedupe and change detection across re-scans.
  - Simulated account links for the demo (clearly labeled simulated; no real third-party integration yet).
  - **Can't link? Export it yourself**: per-service download guides in Import & Connect (Notion, Drive, Gmail, Slack, GitHub, LinkedIn, X, Apple Health, Calendar, Contacts, family portals). ZIP exports upload as downloaded — unpacked locally — including Gmail MBOX, Apple Health XML, Slack JSON, and X archive data. See `docs/EXPORT_GUIDES.md`.
  - Every upload is classified by you — Mine, Shared with me, or Reference. Reference material stays searchable but never shapes your Synthesis. Classification is your declaration; Hyperself never claims to verify ownership.
- **Security** — local scanning of everything you upload (secrets, contact details, stale data, crisis language handled supportively and non-diagnostically), with actionable findings and a right-edge badge in both Knowledgebase and Paths.

### Paths

- Ask anything in the search bar and save the answer as a Path. No Path is pinned by default; pin one yourself and it becomes a subtab beside Insights, Templates, History, and Security.
- New Paths first appear as **Suggested Paths on Insights**, only when you have already shared related data — nothing is pushed at you: **Finance** (from bank statements: category spend, monthly trend, recurring costs; hidden until finance data exists, descriptive only, never advice), **Health** (activity, sleep, and check-up records incl. Apple Health exports; descriptive only, never medical advice), **Relationship Rhythms** (who has gone quiet, descriptively), **Reading Life** (finished vs collected). Templates lists every template with what you have and what it still needs.
- Insights include archetype-lensed notes (“For your Keeper of Threads side: Ana has gone quiet”). Expound, pin, mark reviewed, or dismiss each one — everything you approved or dismissed collects in **History**, where it can be restored.

### Legacy

Export a hash-verified knowledge pack of shareable entries only, import packs from others, and ask questions answered on-device from pack entries alone. Personal entries can never enter a pack.
- **Personal backup**: export your whole knowledgebase (personal included) as one file encrypted with its own backup passphrase — separate from your vault PIN, so a lost PIN or new device does not lose your archive — and restore it wholesale on any install.

### Trust model

- **Offline-first PWA**: installable; the core loop (import, search, insights, Paths) works in airplane mode after first load. Deep synthesis uses a model server on the same device (below), which also works offline once its weights are downloaded.
- **Vault**: AES-GCM encrypted storage unlocked by PIN, with optional biometric unlock (WebAuthn PRF) that genuinely unwraps the key. A forgotten PIN without biometrics is unrecoverable by design.
- **Two tags govern everything**: `personal` never leaves the device; `shareable` is explicit, per entry, and health/finance/journal/relationship/document entries can never be shareable.

## Run it

```sh
cd app
npm install
npm run dev    # http://localhost:5173
npm test       # 24 focused suites over the real store/parsers/analyzers
npm run build  # typecheck + production build
```

Deep synthesis (optional) runs on Muse Glimmer served on this device — install Ollama, then:

```sh
ollama pull llama3.2:3b   # light tier, ~2 GB — right for most laptops
# 24 GB+ machines can use the deep tier instead: ollama pull muse-glimmer (~17–20 GB)
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

The app connects automatically (Settings → “Local model — on this device”, at the bottom of the sidebar, shows setup help; Synthesis shows the active model). With no server running, drafts fall back to templated local text — every other feature works regardless.

Demo personas (Maya, Daniel, Rosa — 20-year non-linear arcs, 26–29-person networks) load from the gear menu (bottom-right, or Ctrl/Cmd+Shift+D). Demo script: `docs/DEMO_SCRIPT.md`.

## How Hyperself is different

Plenty of tools help you take notes, record your day, or chat with an assistant. Hyperself is built for a different job: bringing the data you already have — scattered across the services you use — together in one private place, and turning it into an understanding of your patterns, relationships, and next steps.

| | Hyperself | Note & second-brain apps | Capture & recall tools | Built-in platform AI |
|---|---|---|---|---|
| Core job | Understand your life archive | Organize notes you write | Record everything you do | Assist inside one ecosystem |
| Data in | Imports and exports from the services you already use | Notes you capture yourself | Continuous screen/audio recording | That platform's own apps |
| Where AI runs | On your device, with an open local model | The provider's cloud | Varies | The provider's cloud |
| Privacy model | A built-in tag boundary: personal never leaves the device | Account settings and policies | Recording consent controls | Platform policy |
| Sharing | Optional packs of shareable entries only, hash-verified | Document sharing | Clip export | Ecosystem sharing |
| Timescale | Years to decades of your history | Current projects | Recent recall | The current session |

What that means in practice:

- **Your data comes to you, not the other way around.** Instead of asking you to start journaling in yet another app, Hyperself assembles your archive from exports and imports of the tools you already use — and includes step-by-step guides for getting your data out of each one.
- **Private by construction, not by preference.** Every entry is tagged `personal` or `shareable`, sensitive kinds can never be shared, and personal data is processed only on your device. There is no account and nothing to leak from a server, because there is no server holding your archive.
- **Understanding, not just answers.** Beyond search, Hyperself surfaces long-term patterns — archetypes you can confirm, rename, or reject; relationships that have gone quiet; Paths suggested only when your data supports them. It describes; it does not prescribe, diagnose, or counsel.
- **Yours to keep.** Your archive lives on your device, your model is open and replaceable, and you can export an encrypted backup only you can open. If Hyperself disappeared tomorrow, your data would not.

In short: note apps are where you write your life down. Hyperself is where the record of your life — from everywhere, kept private — helps you see who you are and what might come next.

## Honest limits

- Account connections are simulated for the demo; real integrations are future work.
- Scanned/image-only PDFs have no text layer and are refused with a reason; legacy `.doc`/`.xls` and EPUB are not parsed.
- LLM drafting uses Muse Glimmer (Meta's open-weight 30B) served locally via Ollama/llama.cpp/vLLM on the same device; it auto-connects when the server appears and falls back to templated local synthesis without it. Embeddings (MiniLM) and transcription (Whisper) still run in-browser.
- Archetypes are playful, evidence-backed patterns inferred locally — not personality tests, diagnoses, or labels you did not approve.

## Repo layout

- `app/` — Vite/TypeScript PWA (store, vault, ingest/parsers, synthesis/archetypes, network, paths, security, psych guardrails)
- `docs/` — `MVP_PLAN.md`, `DESIGN.md`, `DATA_MODEL.md`, `PATHS.md`, `VAULT.md`, `PSYCHOLOGY.md`, `DEMO_SCRIPT.md`, `ROUTER_POLICY.md`, `AUDIT.md`
- `figmadesign.md` — Figma handoff mirroring the implemented UI
- `AGENTS.md` — agent roster and operating rules

## Status

Working demo build: vault unlock, offline PWA, synthesis/archetypes, network, multi-format import (documents/audio/images/folders), Paths with suggested templates (Finance, Relationship Rhythms, Reading Life) and a History of approved/dismissed insights, security scanning, and pack export/import — covered by `npm test` and CI. Deep synthesis runs on a locally served Muse Glimmer; cloud routing modules exist behind the privacy router for shareable-only tasks; the demo loop runs fully on-device.
