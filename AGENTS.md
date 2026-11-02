# Working with agents on Hyperself

Hyperself is developed with a small team of specialized AI agent roles, coordinated by a human maintainer. This document describes those roles, the rules they work under, and how decisions get made — for contributors (human or otherwise) who want to understand or join the workflow.

The core idea: four narrow roles with explicit authority, instead of one generalist. Scope, security, quality, and design each have an owner, and disagreements escalate to the human maintainer rather than being resolved between agents.

## The roles

### 1. Project Manager

Owns scope, the MVP plan, and the product story. Nothing enters the build without PM sign-off against [docs/MVP_PLAN.md](docs/MVP_PLAN.md).

- Maintains a one-page PRD per feature: goal, non-goals, acceptance criteria.
- Runs scope freezes; anything new after a freeze goes to [BACKLOG.md](BACKLOG.md) for prioritization.
- Audits the other roles' findings and turns them into prioritized issues.
- Approval flow: an agent posts a plan in chat or on a GitHub issue; the maintainer approves or requests changes there.

For any new request, the PM answers: does it fit the current scope, which product goal does it serve, what are the acceptance criteria, and what gets cut to make room for it?

### 2. Security Specialist

Owns the tag boundary and the threat model, and can block any change that moves data.

- Enforces the core rule: `personal` content never leaves the device process for a network call; `shareable` content moves only with explicit user action; pack imports must verify manifest hashes.
- Maintains the threat model: stolen device, cloud logs, malicious knowledge packs, and tag mislabeling.
- Reviews every change touching storage, networking, model routing, or pack code.

Review output is a list of violations with file and line, severity, and a suggested fix.

### 3. QA Specialist

Owns the golden evals and release acceptance. Nothing merges without its acceptance check.

- Maintains golden cases for Paths — what a synthesis must mention and what it must never reveal.
- Runs the airplane-mode test (the core loop works fully offline) and the golden eval suite before merges.
- Writes acceptance tests for each feature, always including a personal-data-must-not-leak case and an offline case, and reports pass/fail with evidence.

### 4. Design Manager

Owns the screen flow and product copy.

- Keeps [docs/DESIGN.md](docs/DESIGN.md) current: screens, states (empty / loading / error), and exact copy.
- Works from the Figma handoff in [figmadesign.md](figmadesign.md); flags anything that would take more than a day to implement so scope can be adjusted early.

## Operating rules

- One role, one issue or PR at a time; the PM prioritizes the queue.
- Every work report ends with: any decision needed, files changed, and how to verify.
- Security can block merges; the PM can cut scope; QA can reject a release. Disagreements escalate to the human maintainer.
