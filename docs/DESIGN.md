# Design (source for UI + future Figma handoff)

Status: implemented in `app/` except where marked. Converts 1:1 into a Figma handoff when the core demo is green.

## Principles

- Ingestion-only: the user never types knowledge by hand. Data arrives via uploads, connections, and personas; the user curates tags and states goals.
- Teach the tag model once, then stay out of the way. `personal` vs `shareable` is the product's one novel idea; everything else is standard CRUD.
- Local-first must be visible: the search bar lives in the header on every view. Knowledgebase shows AI-synthesized output only on the Insights side; Synthesis leads with a What-matters-most card (interests + key people from shared knowledge), then short Next steps / Facts cards. What-matters interests/key people are merged into the main profile card line (no separate hero card, no device/entry-count status).
- No dark patterns: destructive actions confirm, the API key is never stored, simulated connections always say simulated.

## First-run onboarding (implemented)

Get-to-know-you flow. Trigger: app opens with no profile, entries, or goals, and no `hyperself.onboarded.v1` flag. Returning workspaces never see it. Replayable from the footer ("Replay tour"), skippable on every step.

- Step 1, Welcome: what Hyperself does in three lines + name input (saved to profile, greets in header).
- Step 2, Privacy promise: the two tags explained with live pill styles; "nothing leaves your browser without your action."
- Step 3, Knowledge sources: account scan, uploads, personas explained; one-click "Scan my accounts", "Link all found", and "Load Maya persona" with status line.
- Step 4, Your Paths: explains insights and actions; "See my Paths" finishes and lands on the Paths tab.

Copy deck (exact strings): "Hyperself never asks you to journal." / "Everything arrives personal." / "Nothing left your browser." / "Personal entries withheld: N" / "Key stays in memory — it is never written to storage." / "Linked {name} (simulated)" / "Scan complete (simulated)" / "may contain leaked data" / "Next step:".

## View specs

Synthesis profile card: circular photo slot (initial fallback), archetype pill tags synthesized from behaviour (e.g. Margin Annotator vs Shelf Cartographer — finishing vs collecting), and a blurb of at most two sentences generated on-device from all uploaded/linked data. Personas ship two decades (2006–2026) of non-linear life arcs with 25+ person networks.

Navigation: main menu (Knowledgebase / Paths / Legacy) sits left-aligned beside the logo; the submenu strip shows Knowledgebase: Synthesis / Network / Import & Connect / Security (right-aligned) and, only when Legacy is selected, Export. Paths has no submenu (insights flow directly, acknowledged listed below). Network carries a D3 graph (user at center, drag to rearrange, click a person for a context modal) that re-renders on every knowledgebase change.

- Knowledgebase → Synthesis subtab: when empty, a pointer to Import & Connect (uploads/links are managed only there); once data exists, an auto-generated Synthesis overview as separate tagged cards (Overview + Focus / People / Care / Money / Sharing / Blind spots; tags: work, people, finance, health, personal — multi-tag per card; loading state on every upload/link/scan change, on-device with stub fallback). No entry list, no source UI. Demo controls (Replay tour, Load persona — Maya/Daniel/Rosa from `app/personas/`, Clear workspace) are hidden: Ctrl/Cmd+Shift+D on desktop, gear button bottom-right on small screens.
- Knowledgebase → Network subtab: slowly revolving D3 graph (user at center; drag pauses the orbit, click opens the person modal with timeline + notes) above a portrait-card grid (initials avatar, name, entry count; click opens the same modal). People arrive via synthesis of uploaded/linked entries — no manual tagging form.
- Knowledgebase → Security subtab (right-aligned on the subtab bar, danger icon + badge counting actionable high-severity insights): per-finding cards from the local scan with next-step suggestions and a Review-in-Paths action; clean/empty states shown when nothing is actionable.
- Knowledgebase → Import & Connect subtab: the two-tile component (sole place uploads/links are managed; (Upload documents | Link an account opening the services modal listing all 11 providers; seeds carry people tags and backdated stamps; Family + Calendar cover the caretaker case: kids' schools, aging-parent welfare, estate). The account-scan engine remains in `connections.ts` for onboarding use.
- Top search bar (every view): plain-language queries over the local knowledgebase — "people I've met on X date" (ISO, named, or relative dates), "people I know who might know about X" (topic evidence per person), keyword fallback. Results show a summary plus people hits (view entries filters the Library) and entry hits (show in Library scrolls to the entry). Local only; Escape clears.
- Paths: local insights over the knowledgebase — stale-data alerts, leaked-data/security findings (tokens, secrets, breach-corpus matches surface as "may contain leaked data" with a next-step action), shareable-exposure review, freshness notes. Each insight offers actions: review in Library, add context via Import, pin, expound (local draft over related entries), mark as reviewed (with undo via show/hide acknowledged). Empty knowledgebase shows Import/persona shortcuts instead.
- Legacy: pack export with a high-findings confirm guard + hash-verified import; "Ask this pack" answers via the on-device engine over imported entries only. Log line reports every outcome.

States: every async action shows working → labeled result. No silent failures; refusals (scrub, validation) always name the reason.

## Visual system (implemented in `app/src/styles.css`)

Figma light-mode navy/lavender system per `figmadesign.md` §3: navy `#05006d` primary text/controls, white surface, `#f8f7fb` wash, `#585875` secondary text, `#d2d1e5` borders, lavender `#a59acb` accents; green only for shareable/success, red for destructive/high findings, amber for warnings. Type: Momo Trust Display (headings/brand) + Inter (body), falling back to the system stack until self-hosted font files land under `app/public/assets/hyperself/fonts/`. Geometry: 76px header, 860px content column, 20px card padding, 8px card radius, 6px input/button radius, 37px buttons, 41px inputs, solid navy modal scrims. No gradients, no glow, no emoji icons (exported SVGs under `app/public/assets/hyperself/`).

## Figma handoff

Handoff lives in `figmadesign.md` (repo root), sourced from the inspected Figma file. For visual fidelity the Figma file wins; this doc and the app follow it. Keep all three in sync.
