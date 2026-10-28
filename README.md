# Hyperself — Personal AI for Holistic Growth

> `hyperself.txt` is the owner's canonical brief (trimmed Oct 2026). This README + `docs/` are the scoped engineering interpretation — see Audit #2 in `docs/AUDIT.md` for where they differ and why.

## Problem

AI has disrupted familiar patterns — work, habits, learning — creating fragmentation that is hard to make sense of as the technology advances. People need equilibrium: a way to use AI for holistic growth instead of being scattered by it.

## Solution

A local-first personal AI that augments the user based on their unique skills, experiences, goals, and underutilized talents. Private data stays on-device; only user-approved shareable knowledge ever leaves the device, encrypted.

## Core concepts

- **Personal knowledgebase** — private data (health, finance, relationships, journals). Never leaves the device. Handled only by the on-device model.
- **Shareable knowledgebase** — user's own findings, methods, research. User explicitly marks items shareable. Powers Paths and Legacy.
- **Paths** — growth opportunities generated from shareable knowledge: skill gaps vs. goals, actionable plans, suggested connections.
- **Legacy** — user packages a portable share of their knowledge (knowledge pack, not model weights) so others can learn from it.
- **Hyperlocal community (post-MVP)** — location-based groups connecting globally around improvement. Explicitly out of MVP scope.

## MVP features (scoped — see `docs/MVP_PLAN.md`)

1. **Knowledgebase** — ingestion-only: uploads, app connections, and persona packs feed a local Library; the user curates `personal` vs `shareable` tags, never types entries by hand.
2. **Paths** — goal check-in, skill-vs-goal gap view, one generated action plan per goal.
3. **Legacy (lite)** — export/import a shareable knowledge pack as a versioned file.

## Architecture (MVP)

- In-browser inference via WebLLM (Llama 3.2 1B) for private chat, dashboard, and plan drafts (PWA, zero-install). Native mobile via ExecuTorch is the post-MVP stretch.
- Meta Model API (cloud) only for heavy/optional tasks: plan generation, pack summarization. Personal-tagged content is never sent.
- Retrieval (RAG) over a local vector store — no per-user fine-tuning in MVP.

## Repo layout

- `hyperself.txt` — raw original notes (frozen)
- `docs/AUDIT.md` — audit findings on the original notes
- `docs/MVP_PLAN.md` — feasibility, architecture, improvements
- `docs/DATA_MODEL.md` — entry data model draft (entries, goals, check-ins, skills, packs)
- `docs/ROUTER_POLICY.md` — local/cloud routing and privacy enforcement
- `docs/DESIGN.md` — onboarding-first UI specs, copy deck, states
- `AGENTS.md` — agent roster, prompts, operating rules
- `app/` — PWA scaffold (entries, goals, dashboard, packs, router)
- `docs/GITHUB_SETUP.md` — how to publish this as a public repo

## Status

Pre-code. Docs and scope only; no implementation yet.
