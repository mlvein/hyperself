# Design (source for UI + future Figma handoff)

Status: implemented in `app/` except where marked. Converts 1:1 into a Figma handoff when the core demo is green.

## Principles

- Ingestion-only: the user never types knowledge by hand. Data arrives via uploads, connections, and personas; the user curates tags and states goals.
- Teach the tag model once, then stay out of the way. `personal` vs `shareable` is the product's one novel idea; everything else is standard CRUD.
- Local-first must be visible: the search bar lives in the header on every view (engine and budget meters were removed from the UI; routing/budget logic remains in code). Knowledgebase shows AI-synthesized output only — raw ingested entries are never listed.
- No dark patterns: destructive actions confirm, cloud spend is always labeled, the API key is never stored, simulated connections always say simulated.

## First-run onboarding (implemented)

Get-to-know-you flow. Trigger: app opens with no profile, entries, or goals, and no `hyperself.onboarded.v1` flag. Returning workspaces never see it. Replayable from the footer ("Replay tour"), skippable on every step.

- Step 1, Welcome: what Hyperself does in three lines + name input (saved to profile, greets in header).
- Step 2, Privacy promise: the two tags explained with live pill styles; "nothing leaves your browser without your action."
- Step 3, Knowledge sources: account scan, uploads, personas explained; one-click "Scan my accounts", "Link all found", and "Load Maya persona" with status line.
- Step 4, Your Paths: explains insights and actions; "See my Paths" finishes and lands on the Paths tab.

Copy deck (exact strings): "Hyperself never asks you to journal." / "Everything arrives personal." / "Nothing left your browser." / "Personal entries withheld: N" / "Key stays in memory — it is never written to storage." / "Linked {name} (simulated)" / "Scan complete (simulated)" / "may contain leaked data" / "Next step:".

## View specs

- Knowledgebase → Library subtab: when empty, a two-tile "Add your knowledge" row (Upload documents | Link an account; link opens a modal listing all third-party services); once data exists, an auto-generated Synthesis overview as separate tagged cards (Overview + Focus / People / Care / Money / Sharing / Blind spots; tags: work, people, finance, health, personal — multi-tag per card; loading state on every upload/link/scan change, on-device with stub fallback). No entry list, no source UI. Demo controls (Replay tour, Load persona — Maya/Daniel/Rosa from `app/personas/`, Clear workspace) are hidden: Ctrl/Cmd+Shift+D on desktop, gear button bottom-right on small screens.
- Knowledgebase → Network subtab: tagging card (pick an entry, name a person — tagging happens here, after synthesis) plus per-person synthesized cards (entry count + titles, each with untag).
- Knowledgebase → Security subtab (right-aligned on the subtab bar, danger icon + badge counting actionable high-severity insights): per-finding cards from the local scan with next-step suggestions and a Review-in-Paths action; clean/empty states shown when nothing is actionable.
- Knowledgebase → Import & Connect subtab: the same simplified two-tile component as the Library empty state (Upload documents | Link an account opening the services modal listing all 11 providers; seeds carry people tags and backdated stamps; Family + Calendar cover the caretaker case: kids' schools, aging-parent welfare, estate). The account-scan engine remains in `connections.ts` for onboarding use.
- Top search bar (every view): plain-language queries over the local knowledgebase — "people I've met on X date" (ISO, named, or relative dates), "people I know who might know about X" (topic evidence per person), keyword fallback. Results show a summary plus people hits (view entries filters the Library) and entry hits (show in Library scrolls to the entry). Local only; Escape clears.
- Paths: local insights over the knowledgebase — stale-data alerts, leaked-data/security findings (tokens, secrets, breach-corpus matches surface as "may contain leaked data" with a next-step action), shareable-exposure review, freshness notes. Each insight offers actions: review in Library, add context via Import, pin, expound (local draft over related entries), mark as reviewed (with undo via show/hide acknowledged). Empty knowledgebase shows Import/persona shortcuts instead.
- Legacy: pack export with a high-findings confirm guard + hash-verified import; "Ask this pack" answers via the on-device engine over imported entries only. Log line reports every outcome.

States: every async action shows working → labeled result. No silent failures; refusals (scrub, budget, validation) always name the reason.

## Visual system (implemented in `app/src/styles.css`)

System font stack, white surface, warm gray wash header, ink text, muted secondary text, one green accent for shareable/success, red reserved for destructive/errors and high findings, amber for warnings. 6–8px radii on inputs/cards, 10px on the onboarding dialog. Provider rows are plain bordered panels. No gradients, no glow, no emoji icons.

## Figma handoff (deferred)

When the core demo is green: export these specs + the copy deck + empty/error states per view into `figmadesign.md` for the Figma MCP. Do not start it earlier — the UI is still settling.
