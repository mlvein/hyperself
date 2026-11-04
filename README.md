# Hyperself — your life's archive, understood privately

**Your scattered life archive, understood: decades of documents, statements, journals, and photos brought together in one encrypted place on your device — revealing who you have been, who you are, and the Paths to where you could go next. Private. Offline. Never uploaded.**

And it surfaces Paths only when your knowledge is ready for them — nothing is pushed at you, and nothing personal ever leaves the device.

No journaling by hand. No account. No server holding your archive. Longer explanations live in the [guide](docs/GUIDE.md) — also inside the app, under **Guide** at the bottom of the sidebar.

## Run it

```sh
cd app
npm install
npm run dev    # http://localhost:5173
npm test       # focused suites over the real store/parsers/analyzers
npm run build  # typecheck + production build
```

Deep synthesis (optional) runs on a model served on this device:

```sh
ollama pull llama3.2:3b   # light tier, ~2 GB — right for most laptops
# 24 GB+ machines can use the deep tier instead: ollama pull muse-glimmer (~17–20 GB)
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

The app connects automatically; choose the model in Settings (sidebar, bottom). With no server running, drafts fall back to templated local text and every other feature works. Demo personas (Maya, Daniel, Rosa — fictional, two decades each) load with Ctrl/Cmd+Shift+D.

## Every runtime model is a Meta model

Hyperself only ever calls Meta models at runtime — Muse Code was used to write the code, never as the app's brain:

- **Synthesis, search answers, pack Q&A, image OCR** — Muse Glimmer (deep) or Llama 3.2 (light), Meta open weights served on your device.
- **Embeddings** — Meta Llama (`llama3.2:3b`) on that same local server. No server, no embeddings: search degrades to keyword-only rather than calling a non-Meta model.
- **Voice transcription** — Meta's wav2vec 2.0, in-browser.
- **Augmented Paths (the one online feature)** — Muse Spark through the Meta Model API, over a derived pattern profile only.

This is enforced in code, not just documented: the engine allowlist refuses any non-Meta model a server offers or a user configures, and Augmented Paths refuse any destination other than `api.meta.ai` and any non-Muse model.

## What it does

- **Synthesis** — a profile with archetypes you can confirm, rename, or reject, and an essence written on-device from everything you brought.
- **Network** — a full-width graph with you at the center; click a person (or the center circle, for your own timeline) for shared history and private notes.
- **Import & Connect** — documents, statements, audio, images, folders, and per-service export guides for when an account can't link. Everything is parsed on your device.
- **Paths** — Finance, Health, Relationship Rhythms, Reading Life, and Paths saved from your own searches. Suggested only when your data supports them; descriptive only, never advice.
- **Augmented Paths** — optional online depth from Meta's Muse Spark (Meta Model API) over a derived pattern profile you preview and approve. Never entries, names, or text.
- **Legacy** — hash-verified packs of shareable entries only, plus an encrypted whole-archive backup only you can open.

## Privacy in one paragraph

Every entry is `personal` or `shareable`. Personal entries never leave the device, and sensitive kinds can never be shared at all. The vault is encrypted (PIN, optional biometrics), the core loop works offline, and the only online feature — Augmented Paths — sends a minimized pattern profile to Meta's Muse Spark via the Meta Model API, only after you approve the exact payload, with your own Meta API key. Details: [guide](docs/GUIDE.md).

## How Hyperself is different

| | Hyperself | Note & second-brain apps | Capture & recall tools | Built-in platform AI |
|---|---|---|---|---|
| Core job | Understand your life archive | Organize notes you write | Record everything you do | Assist inside one ecosystem |
| Data in | Imports from services you already use | Notes you capture yourself | Continuous recording | That platform's own apps |
| Where AI runs | On your device, open local model | Provider's cloud | Varies | Provider's cloud |
| Timescale | Years to decades of your history | Current projects | Recent recall | The current session |

In short: note apps are where you write your life down. Hyperself is where the record of your life — from everywhere, kept private — helps you see who you are and what might come next.

## Honest limits

Account connections are simulated (real ones need a Security review each); a local model trails frontier cloud models on raw reasoning, so quality is gated by golden evals; no multi-device sync yet — encrypted backup is the bridge. Full list: [BACKLOG.md](BACKLOG.md).

## Repo layout

- `app/` — Vite/TypeScript PWA
- `docs/` — start with [GUIDE.md](docs/GUIDE.md); also `MVP_PLAN.md`, `DESIGN.md`, `DATA_MODEL.md`, `PATHS.md`, `VAULT.md`, `EVALS.md`
- `figmadesign.md` — Figma design handoff
- `AGENTS.md` — how the project works with agent roles

## Status

Working build: vault unlock, offline PWA, synthesis/archetypes, network, multi-format import, Paths with suggestions and History, Augmented Paths, security scanning, pack export/import, English/Spanish interface — covered by `npm test` and CI.
