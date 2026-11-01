# Backlog

Post-demo-freeze parking lot (per AGENTS.md: anything new after scope freeze lands here, PM prioritizes).

## Deferred from demo week

- **PDF bank statement parsing** — CSV tells the same demo story; add pdf.js on-device extraction + the same parse-review step when prioritized.
- ~~**Health template**~~ — shipped: Health Path (descriptive trends only, never medical advice; health entries always personal). See `app/src/templates.ts` `healthSummary`.
- **More Path templates** — only Budgeting shipped; add one at a time with a real fixture each.
- **Native packaging** (Tauri/Electron) — PWA-installable won for the demo; revisit for filesystem storage, larger quotas, OS keychain.
- **Real account connections** — all connections are simulated and labeled; any real integration needs Security review first.

## Post-demo to-dos (honest weaknesses, tracked 2026-11-01)

- **Install friction** — deep synthesis needs a separately installed local model server (Ollama + 17–20 GB pull, CORS, endpoint check). Post-demo: the Tauri/Electron wrapper (see Deferred) that bundles the runtime and turns setup into a first-launch download with progress.
- **Live integrations** — all account connections are simulated; the export guides bridge the gap for the demo. Real sync needs Security review per provider, starting with whichever source demo users ask for first.
- **Local model ceiling** — a locally served 30B will trail frontier cloud models on raw reasoning. Positioning stays "grounded, cited, private" (golden evals in `docs/EVALS.md` gate quality); revisit model tier/quantization with eval results, never by swapping in a cloud call for personal data.
- **Single-device archive** — no multi-device sync story yet; encrypted backup/restore is the manual bridge. Any sync design must preserve the tag boundary end-to-end (Security decision, not an engineering default).

## Decisions pending

- **hyperself.txt in git history** — untracked at HEAD (ignored), but earlier commits still contain it. History rewrite (BFG) only with explicit owner approval; it rewrites shared history.
- **WebAuthn biometric path** — code-complete, needs a verified run on a real device/browser (secure context + platform authenticator). PIN path is the rehearsed fallback.

## Explicitly rejected (do not resurrect without a new decision)

- Prescriptive financial/health advice ("cut X, invest in Y") — descriptive insights only.
- Therapeutic conversation surface (chat therapy, CBT exercises) — Hyperself synthesizes; it does not counsel. See docs/PSYCHOLOGY.md.
- WhatsApp approval loop — GitHub Issues / chat approval instead (AGENTS.md).
- Budget meter / cloud-spend caps in product — that was hackathon-credit tracking, not a feature.
