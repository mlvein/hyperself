# Backlog

Post-demo-freeze parking lot (per AGENTS.md: anything new after scope freeze lands here, PM prioritizes).

## Deferred from demo week

- **PDF bank statement parsing** — CSV tells the same demo story; add pdf.js on-device extraction + the same parse-review step when prioritized.
- **Health template** — second Path template (health results import, descriptive trends only). Needs the same trust + descriptive-only discipline as Budgeting, plus extra sensitivity review.
- **More Path templates** — only Budgeting shipped; add one at a time with a real fixture each.
- **Native packaging** (Tauri/Electron) — PWA-installable won for the demo; revisit for filesystem storage, larger quotas, OS keychain.
- **Real account connections** — all connections are simulated and labeled; any real integration needs Security review first.

## Decisions pending

- **hyperself.txt in git history** — untracked at HEAD (ignored), but earlier commits still contain it. History rewrite (BFG) only with explicit owner approval; it rewrites shared history.
- **WebAuthn biometric path** — code-complete, needs a verified run on a real device/browser (secure context + platform authenticator). PIN path is the rehearsed fallback.

## Explicitly rejected (do not resurrect without a new decision)

- Prescriptive financial/health advice ("cut X, invest in Y") — descriptive insights only.
- Therapeutic conversation surface (chat therapy, CBT exercises) — Hyperself synthesizes; it does not counsel. See docs/PSYCHOLOGY.md.
- WhatsApp approval loop — GitHub Issues / chat approval instead (AGENTS.md).
- Budget meter / cloud-spend caps in product — that was hackathon-credit tracking, not a feature.
