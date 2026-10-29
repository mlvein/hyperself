# Figma Handoff — Hyperself

Source of truth: `app/` (implemented PWA) + `docs/DESIGN.md`. Build Figma frames 1:1 from this file; where this file and the app disagree, the app wins and this file gets fixed.

## 1. Product in one line

Local-first personal AI: knowledge arrives via uploads (documents + audio), linked accounts, and personas; the user never journals by hand. Two tags govern everything: `personal` (never leaves the device) and `shareable` (user-approved, powers Paths + Legacy).

## 2. Navigation (implemented)

- Header (warm wash bar, left-aligned): brand "Hyperself" → main menu (Knowledgebase / Paths / Legacy) beside the logo → search bar pinned right (placeholder: "Ask your knowledgebase…", e.g. "people I've met on Oct 4", "who might know about Figma", "audio budget").
- Submenu strip directly below the header, per active section:
  - Knowledgebase: Synthesis · Network · Import & Connect · Security (Security pushed to the right edge, with actionable-count badge).
  - Legacy: Export (only shown when Legacy is selected).
  - Paths: no submenu (insights flow directly; acknowledged list at the bottom).
- Demo controls (hidden): gear bottom-right on small screens, Ctrl/Cmd+Shift+D on desktop — Replay tour, Load Maya/Daniel/Rosa, Clear workspace.

## 3. Screens

### 3.1 Knowledgebase → Synthesis

Components top to bottom:

1. **Profile card** (replaces any "Synthesis" heading): circular 72px profile-photo slot (dashed border, initial fallback), archetype pill tags, and a blurb of at most two sentences generated on-device from all uploaded/linked data. Status line under the blurb ("Synthesizing on-device…", "Updated just now · synthesized on-device · N entries behind this view").
   - Archetypes (pill tags, hover = evidence): Bookworm, Book Hoarder, Network Weaver, Caretaker Anchor, Deep Researcher, Method Maker, Serial Pivoter, Night Owl, Early Riser, Wanderer, Keeper of Records, Skill Collector. Reading/finishing vs collecting/TBR signals compete — a hoarder is never labeled Bookworm. Max 4 pills.
2. **What matters most** card: headline + Interests (top shared entry types) + Key people, from shared knowledge only.
3. **Insights** card: short on-device narrative (≤ ~280 chars).
4. **Tagged insight cards**: Focus / People at the center / Care & wellbeing / Money & paperwork / Sharing readiness / Blind spots, each with category chips (work, people, finance, health, personal).
5. **Next steps** card (bulleted actions), **Facts** card (counts, freshness, people, index coverage). No entry list at the bottom.

States:
- Empty: "Nothing to synthesize yet" + hint that uploads/links live in Import & Connect + "Go to Import & Connect" button.
- Loading: blurb placeholder "Synthesizing who you are from everything you have shared…" with pulsing status.
- Fallback (no WebGPU): same cards from local facts; status reads "Synthesis from local facts · on-device".

### 3.2 Knowledgebase → Network

- **Network graph card** ("Your network"): D3 force graph, user node at center (dark circle; all avatar circles uniform 20px radius, photo clipped inside or initials fallback), spokes weighted by mention count, cross-links for co-mentioned people. Slowly revolves around the user (~0.02°/frame; pauses on drag; off with prefers-reduced-motion). Names hidden until hover of that specific node. Drag nodes to rearrange (positions remembered by name); click a person node or card to open the person modal. Graph re-renders on every knowledgebase change.
- **Portrait card grid**: wrapping flex grid of 118px, 3:4 portrait cards (44px initials avatar, name, entry count). No taglines, no untag buttons. Click opens the same person modal.
- **Person modal** (overlay dialog): "You've known each other for X years" (or "under a year"), entry types, Relationships (shared connections with counts), D3 "You + Person" relationship timeline (all shared moments as dots; key moments — shared/other-people, relationship, and goal entries — as larger green dots with year labels), ★ Key moments list, Notes (dated bubbles) + comment box at the bottom (textarea + Add note, persists on-device). Close: button, overlay click, Escape.

### 3.3 Knowledgebase → Import & Connect

- Sole place uploads and links are managed. Tiles: Upload documents (.md/.txt) | Link an account (opens services modal listing all providers, each marked simulated) | Upload audio (mp3/wav/m4a/aac/ogg/webm/flac/opus; transcribed fully on-device with Whisper, staged progress notes, then searchable entries).
- Audio search: header queries with audio intent ("audio …", "recording …") return transcripts only.

### 3.4 Knowledgebase → Security

Right-aligned submenu item with red badge counting actionable (high-severity) insights. Per-finding cards (title, severity, message, suggestion, "Review in Paths"); empty state "No actionable security insights. Your uploaded knowledge looks clean."; empty-KB state points to Import & Connect.

### 3.5 Paths (no submenu)

Insight cards over the knowledgebase: stale-data alerts, leaked-data/security findings, shareable-exposure review, freshness notes. Each card: severity chip, body, actions (Review in Synthesis, Add context via Import, Expound, Pin/Unpin, Mark as reviewed). Pinned group first, then the rest; Acknowledged list at the bottom with Undo. Empty state: "No Paths yet" + "Import or link data" button. Note: Path insight text references "Mark as reviewed" (acknowledge) and shows "may contain leaked data" for high findings.

### 3.6 Legacy → Export (single pane, stacked)

1. Export knowledge pack: Author label + Version inputs, Export button; exports shareable entries only with hash-verified manifest; high-severity findings trigger a confirm dialog first.
2. Import knowledge pack: file picker + "Verify and import"; result log line (verified pack id/version/author + count, or the exact refusal reason).
3. Ask this pack: question input + Ask; answers on-device from imported entries only; log output area.

### 3.7 Onboarding (first run, modal)

Trigger: no profile, entries, or goals, and no `hyperself.onboarded.v1` flag; returning workspaces never see it. Skippable; replayable from demo controls ("Replay tour").

1. Welcome: what Hyperself does + name input (greets in header).
2. Privacy promise: the two tags with live pill styles.
3. Knowledge sources: account scan, uploads, personas; buttons "Scan my accounts", "Link all found", "Load Maya persona" with status line.
4. Your Paths: insights explained; "See my Paths" finishes and lands on Paths.

## 4. Visual system (from `app/src/styles.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1c1a17` | text, user node, borders-on-hover |
| `--muted` | `#5f5a52` | secondary text |
| `--line` | `#ddd8cf` | borders |
| `--bg` | `#ffffff` | surface |
| `--wash` | `#f2efe9` | header strip, hero card, note bubbles |
| `--accent` | `#2e6b46` | shareable/success, archetype pills border |
| `--danger` | `#a33b2e` | destructive, high findings, security badge |
| pill green | bg `#dcefe2`, text `#1f4d30` | archetype pills, person avatars, graph people nodes |
| severity | high `#f6dcd8`/`--danger`, warn `#f3e8cf`/`#7a5b1e`, info `#ece8e0`, ok pill green | finding chips |

- Type: system stack (ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial); line-height 1.5. No custom display font, no gradients, no glow, no emoji icons (inline SVG only).
- Radii: 6px inputs/buttons, 8px cards, 10px dialogs, 999px pills/avatars.
- Layout: header flex (start-aligned, wraps); content column max-width 860px, 1.25rem padding; cards stacked with 0.75–1rem gaps; add-tiles in a 2-column grid; people grid wraps at 118px cards.
- Motion: single pulsing "loading" opacity animation; graph orbit + hover fade (120ms); everything disabled under `prefers-reduced-motion`.

## 5. Copy deck (exact strings)

- "Hyperself never asks you to journal." / "Everything arrives personal." / "Nothing left your browser."
- Synthesis empty: "Nothing to synthesize yet" / "Add documents or link accounts in Import & Connect — uploads and linked data are managed there. Your synthesis will appear here automatically."
- Network: "You are the center. People connect through entries that mention them together. Drag to rearrange; click a person for context. The graph updates automatically as your knowledgebase grows." / Modal: "You've known each other for X years." / "Notes stay on this device, attached to this person."
- Paths empty: "No Paths yet" / "Paths grow from your knowledgebase, and yours is empty. Import documents or link an app to begin."
- Legacy export hint: "Exports shareable entries only, with a hash-verified manifest. Personal entries never leave. You'll be asked before exporting entries with high-severity findings."
- Audio: "Upload audio" / "Recordings transcribed on-device" / "Transcribed … into N entries — find it via search (try "audio")."
- Refusals always name the reason (no silent failures): e.g. "Nothing to export: no entries are tagged shareable.", "Recording is too short to transcribe.", "No speech was detected in that recording."

## 6. Demo data for mockups

Personas (demo controls) span 2006–2026 with non-linear arcs and 26–29-person networks: Maya (teacher → researcher; Bookworm), Daniel (support → founder; Book Hoarder), Rosa (carer → coordinator; Caretaker Anchor). Use these for realistic graph/profile frames.

## 7. Out of scope for this handoff

Native mobile (ExecuTorch stretch), Figma component library/auto-layout system, dark mode, and real account integrations (all connections are simulated and labeled as such).
