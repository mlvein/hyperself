# MVP Plan: Feasibility, Budget, Architecture

## Ground rules

- **Web-first, local-first.** MVP is a PWA: in-browser inference (WebLLM, Llama 3.2 1B) + local storage. No training anywhere — per-user fine-tuning is OUT for MVP. Native mobile via ExecuTorch (Llama 3.2 1B/3B quantized, inference only) is the post-MVP stretch, not the starting point.
- **$150 Meta Model API credits** = roughly tens of millions of tokens on efficient models (one report cites ~35M output tokens on Muse Spark-class pricing). Generous for a 10-day hackathon **if** cloud calls are reserved for heavy/optional tasks with caching. It is NOT enough to route every chat turn or to fine-tune.
- Therefore the architecture is: **on-device default, cloud exception, with a budget guardrail.**

## Feasible for MVP

- **Knowledgebase (personal vs shareable tags).** Local storage (OPFS/SQLite) + local embeddings + RAG over in-browser Llama 3.2 1B (WebLLM). Tag enforcement in code: `personal` entries are never serialized for network calls. Feasible and the foundation of everything else.
- **Goal loop (check-in → gap → plan).** Manual check-ins + journaling; gap view is retrieval + templated comparison; plan generation is the one justified cloud call (or in-browser 1B for the demo). Feasible.
- **Single dashboard view.** One screen: goals, recent entries, alignment signal (rule-based from check-ins, not ML inference over behavior). Feasible.
- **Legacy lite (knowledge pack export/import).** A versioned `.zip`/`.json` of shareable entries + embeddings + manifest. No model weights move. Feasible and demo-friendly (user A exports, user B imports and chats over it).
- **Privacy baseline.** Encrypted local storage (OPFS/SQLite + Web Crypto), TLS, tag-based selective disclosure, no cloud logging of personal content, "airplane-mode test" (core features work offline). Feasible.

## Not feasible / out of MVP (with pushback)

- **Per-user fine-tuned LLM.** Pushback: training cost, on-device training unsupported, weight distribution size, and privacy leakage through weights. Do RAG; revisit LoRA adapters post-hackathon.
- **Sharing full model weights (Legacy as "your LLM").** Pushback: gigabytes per user, no infra for it, weights can memorize private data. Ship knowledge packs instead.
- **Compute on encrypted data.** Pushback: homomorphic encryption is research-grade, not hackathon-grade. Ship selective disclosure + standard encryption, and word privacy claims carefully.
- **Automatic activity tracking + alignment notifications.** Pushback: no sources defined; OS/health integrations are each multi-day efforts with permissions review. Ship manual check-ins; one scripted demo of a notification if time allows.
- **Community matching / hyperlocal LLMs.** Pushback: needs user base, moderation, matching eval — a second product. Ship manual pack exchange; describe community as the roadmap slide.
- **Omnichannel.** Pushback: each channel is a full client. Ship ONE: recommend mobile (ExecuTorch LLaMA demo app as starting point) or web chat. WhatsApp-in-the-loop approvals also deferred (see AGENTS.md).
- **Cloud fine-tuning or heavy cloud pipelines on the $150.** Pushback: burns budget fast and contradicts the privacy story. Cap cloud spend (e.g., $20–30 for the whole hackathon), cache aggressively, demo primarily on-device.

## Implementation status (2026-10-27)

WebLLM is now wired: `app/src/engine.ts` runs `Llama-3.2-1B-Instruct-q4f16_1-MLC` in a web worker via `@mlc-ai/web-llm` when WebGPU is present, with the templated `StubEngine` as automatic fallback; embeddings run on-device via `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`) with vectors in local storage and hybrid keyword+cosine retrieval. Legacy packs record the real embedding model id and support on-device Q&A over imported entries. Still open: encrypted OPFS/SQLite storage (vectors grow `localStorage` pressure), golden evals for LLM output quality, and the ExecuTorch spike below.

## Suggested architecture (MVP)

1. **Client (one channel):** PWA chat + entries + goals + dashboard. Works offline; zero-install judging via URL.
2. **In-browser local engine:** WebLLM Llama 3.2 1B; OPFS/SQLite storage; in-browser embeddings (Transformers.js); retriever with tag filter (`personal` never leaves the browser for network).
3. **Router:** local-first. Cloud (Meta Model API) only for: plan generation, pack summarization, eval runs. Every cloud call strips `personal` content and logs token usage to a local budget meter.
4. **Budget meter:** hard cap in config (e.g., $25), visible in UI; blocks cloud calls past cap. This is both a cost control and a demo talking point.
5. **Legacy pack:** `manifest.json` (version, author, entry hashes) + entries + embeddings. Import = verify + index locally.

## Suggested improvements over the original notes

1. Define the entry data model first (fields, tags, retention) — everything keys off it.
2. Write the router policy as a table of task → local/cloud → data allowed. One page, enforced in code.
3. Add 5–10 golden eval cases for Paths quality ("given this goal + entries, plan must mention X, must never reveal Y").
4. Write the threat model in half a page: device stolen, cloud logs, malicious pack import, tag mislabeling — and what mitigates each.
5. Pick the 3-minute demo story now: capture entry → check in → get plan → export pack → import on second device. Cut anything not on that path.
6. Rename "share your LLM" to "share your knowledge pack" everywhere to avoid the overclaim.
7. Defer WhatsApp, Figma MCP pipeline, and community to stretch goals with explicit triggers (only if core demo is green by day 7).
8. ExecuTorch spike (stretch): single-platform `.pte` smoke test — export Llama 3.2 1B, chat in the demo app on one physical device. Kill criterion: not chatting within 1 day → cut, keep the PWA story.

## 10-day shape (suggested)

- Days 1–2: data model, tag enforcement, local RAG baseline in-browser.
- Days 3–4: goal loop + dashboard; router + budget meter.
- Days 5–6: Legacy pack export/import; golden evals.
- Day 7: hard scope freeze; threat-model pass; on-device-first demo rehearsal.
- Days 8–9: hardening, QA sweep, demo script + video.
- Day 10: buffer + submission.
