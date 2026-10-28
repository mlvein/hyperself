# Audit of `hyperself.txt`

Date: 2026-10-27. Source: `hyperself.txt` (76 lines, two note dumps concatenated).

## What the notes do well

- Clear problem/solution framing in the second half ("Pulled from notes").
- Good instinct on privacy as the core differentiator (local-first, selective sharing).
- MVP features 1–3 form a coherent progression: capture → grow → share.
- Agent roster shows awareness that security, scope control, QA, and design each need an owner.

## Findings

### 1. Duplication (merge, don't delete)

The file is two overlapping drafts. "Personal LLM / offline personal data / encrypted sharing / dashboard / goals / paths / legacy / community" appears in both halves with different wording. The README now merges them; the original is frozen for reference.

### 2. Vague or overloaded terms

- **"Personal LLM" / "local LLM built from personal skills"** — never specifies fine-tuning vs. retrieval (RAG). These differ by orders of magnitude in cost and feasibility. MVP must be RAG.
- **"Augments it with the latest and most reliable models"** — undefined routing: which queries stay local, which go to cloud, and what data may travel. Needs an explicit router policy.
- **"Omnichannel application"** — too broad for MVP. One channel must be chosen (recommendation: mobile app via ExecuTorch demo as baseline, or web chat + local sidecar).
- **"Track activity"** — no data sources named. Automatic tracking (apps, screen, wearables) is a separate product; MVP tracking = manual check-ins + journal entries.

### 3. Technical overclaims to reframe

- **"Package and share your LLM"** — shipping per-user model weights is infeasible (size, training cost, privacy leakage through weights). Reframe Legacy as a **knowledge pack**: curated docs + embeddings + metadata, versioned and signed.
- **"Only encrypted data is used when being processed"** — reads as computation on encrypted data (homomorphic encryption), which is infeasible. What is feasible: TLS in transit, encryption at rest, and **selective disclosure** (only shareable-tagged content leaves the device, never personal-tagged).
- **"Connect hyperself data with community to find connections"** — matching engine over private data is post-MVP. MVP version: manual sharing of a Legacy pack (file export/import).

### 4. Scope creep risks

- Hyperlocal community + global connections, moral/physical/legacy dimensions, networking, record keeping, dashboard reports, activity alignment — each is defensible, but together they are 3–4 products. MVP keeps: knowledgebase, one goal loop (check-in → gap → plan), one dashboard view, pack export/import.
- WhatsApp approval loop for the PM agent is a second integration surface (Business API, webhooks, costs). Recommend GitHub Issues or CLI approval for MVP.

### 5. Missing pieces (added in MVP plan)

- Data model: what an entry is, what `personal` vs `shareable` enforces technically.
- Router policy: what runs on-device vs. Meta Model API, and the budget guardrail.
- Eval: how to know Paths advice is good (even 5 golden test cases beat none).
- Threat model: what "private" concretely means (device compromise? cloud logs? pack recipients?).
- Success criteria for the hackathon demo (3-minute story).

---

## Audit #2 (2026-10-27) — owner-trimmed brief

The owner trimmed `hyperself.txt` to the canonical brief (former "Pulled from notes" half). Finding #1 from Audit #1 (duplication) is closed. The substance is unchanged, so the remaining findings stand — reconciled claim-by-claim below against the docs and scaffold.

### Reconciliation: brief says → build does → verdict

1. **"Hyper-local LLM inside an omnichannel application"** → PWA, one channel. HOLD: omnichannel is a vision word, not an MVP scope. Each channel is a full client. Suggested brief wording: "local-first personal AI, starting as a web app."
2. **"Package and share your LLM" (Feature 3)** → Legacy pack (shareable docs + manifest, no weights). HOLD: per-user weights are infeasible on size, cost, and privacy leakage through weights. Suggested wording: "package and share a knowledge pack from your shareable knowledgebase."
3. **"Using Meta's ExecuTorch SDK … local LLM for each user"** → in-browser inference first, ExecuTorch as stretch. HOLD with compromise: added an ExecuTorch spike to `docs/MVP_PLAN.md` (single-platform `.pte` smoke test, 1-day kill criterion). Starting on ExecuTorch burns days 1–3 on native build plumbing before any product code exists; the PWA proves the same privacy story at zero install cost.
4. **"Only encrypted data is used when being processed"** → selective disclosure (personal never leaves; shareable only, over TLS). HOLD: the brief's wording implies homomorphic encryption, which is research-grade. Suggested wording: "only user-approved shareable data is ever sent to online services, over encrypted connections."
5. **PM "sends updates to WhatsApp and waits for approval"** → chat/issues approval. HOLD for MVP: WhatsApp Business API is a second integration surface with its own costs. The approval loop survives; only the channel changes.
6. **Design Manager "maintains figmadesign.md for Figma MCP handoff"** → `docs/DESIGN.md` is the design source now; Figma handoff deferred until the core demo is green. HOLD: a design pipeline before a working demo is premature. DESIGN.md is written to convert 1:1 into a Figma handoff later.

### New finding: no onboarding

The brief describes features but no first-run experience — yet the product's core interaction (personal vs shareable tagging) is novel and must be taught. Added: onboarding flow spec in `docs/DESIGN.md` and a working 4-step first-run tour in the app.

### Suggested `hyperself.txt` edits

Exact replacement lines are listed in the session summary; applying them aligns the brief with the build without losing any vision.

---

## Audit #3 — ingestion-only pivot (owner-directed)

The owner approved all six Audit #2 holds and redirected the product: no manual journaling, ingestion only (uploads + app connections; personas and simulated links for the prototype), onboarding as get-to-know-you.

### Applied

- Removed: entry creation form, check-in UI, skill manager form, sample-data seeder. The Library is now read + curate (tag toggle, delete, source filter).
- Added: profile (name), simulated connections (Notion, Drive, Health, Calendar) through the real store path with `connection` source, get-to-know-you onboarding (name → privacy → sources → first goal).
- Dashboard reframed from streaks/alignment to coverage-by-source + connection status + budget.
- Goal creation retained: stating intent is not journaling.

### Pushbacks

1. **Goal-progress signal is now missing.** Check-ins were the only progress input; uploads won't carry it reliably. Revisit post-prototype (e.g., infer progress from ingested content, or reintroduce a lightweight check-in framed as a goal update, not a journal).
2. **Simulated connections must stay labeled.** Every mock label says "simulated" in the UI and data (`source_label`). Do not demo them as live integrations.
3. **Real OAuth is still the expensive part.** The `parse → chunk → tag → index` pipeline now accepts a new source adapter cleanly, but each live integration remains OAuth + mapping + privacy review. One live integration is the right next scope expansion, not four.

---

## Audit #4 — Paths as insights (owner-directed)

Paths no longer hosts goals, chat, or budget UI. It is now a findings view over the knowledgebase: stale-data alerts, security findings, shareable-exposure review, freshness notes — each with review / add-context / pin / expound / acknowledge actions, and Import shortcuts when the knowledgebase is empty.

### Applied

- New `src/insights.ts` (analyzers + pin/acknowledge state) with `tests/paths.test.cjs`.
- Paths tab rebuilt around insight cards; onboarding ends with a "Your Paths" step.
- Goal creation, cloud plans, Explore chat, and the cap setter UI removed. Their store/router/cloud modules are retained but unreachable from the UI.

### Pushbacks

1. **Parked code needs a verdict.** Goal, cloud-plan, and Explore modules still ship in the bundle with no entry point. Decide post-prototype: delete them or revive them (e.g., goals return as Path outcomes, plans attach to insights).
2. **Insights are rule-based, not LLM.** The UI must keep calling them local analysis/drafts until WebLLM lands. Expound is the honest bridge: same card, real model later.
3. **Acknowledgments can go stale.** Ack state keys on insight ids; editing an entry doesn't clear its ack. Acceptable for prototype; revisit with a "reopened on change" rule later.
