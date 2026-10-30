# Figma Handoff — Hyperself

Source of truth: `app/` (implemented PWA) + `docs/DESIGN.md`. Build Figma frames 1:1 from this file; where this file and the app disagree, the app wins and this file gets fixed.

## 1. Product in one line

Local-first personal AI: knowledge arrives via uploads (documents, audio, images, folders), linked accounts, and personas; the user never journals by hand. Two tags govern everything: `personal` (never leaves the device) and `shareable` (user-approved, powers Paths + Legacy). Vault-encrypted on-device storage (PIN + optional biometrics), installable PWA, works offline.

## 2. Navigation (implemented)

- Header (warm wash bar, left-aligned): brand "Hyperself" → main menu (Knowledgebase / Paths / Legacy) beside the logo → search bar pinned right (placeholder: "Ask your knowledgebase…", e.g. "people I've met on Oct 4", "who might know about Figma", "audio budget"). Paths menu label carries a count badge (saved Paths + suggested Paths ready to start; hidden at zero). Offline badge appears when the PWA is offline ("Offline · on-device").
- Submenu strip directly below the header, per active section:
  - Knowledgebase: Synthesis · Network · Import & Connect · Security (Security pushed to the right edge, with actionable-count badge).
  - Paths: Insights · pinned-Path subtabs (one per pinned saved Path, labeled with the Path name) · Templates · Security (Templates + Security at the right edge; Security badge mirrors the Knowledgebase count).
  - Legacy: Export (only shown when Legacy is selected).
- Demo controls (hidden): gear bottom-right on small screens, Ctrl/Cmd+Shift+D on desktop — Replay tour, Load Maya/Daniel/Rosa, Clear workspace.

## 3. Screens

### 3.1 Knowledgebase → Synthesis

Components top to bottom:

1. **Profile card** (replaces any "Synthesis" heading): circular 72px profile-photo slot (dashed border, initial fallback), archetype pill tags (max 4; confirmed ones carry a ✓; hover shows evidence + strength/confidence/trend), and an essence blurb of at most two sentences generated on-device: who the user is at their core, aspirations, potential. The blurb never names people, entry counts, or sources, and never repeats the pill labels. Status line under the blurb shows interests · key people.
   - Archetypes: Bookworm, Book Hoarder, Network Weaver, Caretaker Anchor, Deep Researcher, Method Maker, Serial Pivoter, Night Owl, Early Riser, Wanderer, Keeper of Records, Skill Collector. Reading/finishing vs collecting/TBR signals compete — a hoarder is never labeled Bookworm. Small print: "Playful patterns from your data — not labels, not diagnoses."
2. **Archetype era timeline card** ("How your archetypes changed", only when history spans 7+ years): one line per era (e.g. "2006–2012: … · …") showing which archetypes led then.
3. **Archetype cards** (one per pill): meaning paragraph, "Why this fits: …" evidence, strength bar with "Strength N/100 · Confidence N/100 · Trend: rising/steady/fading/emerging", "Watch for: …", and actions **Confirm / Rename / Not me** (the user is the final authority; renamed labels replace the generated one everywhere, dismissed archetypes never return). Where an archetype seeds a Path (Network Weaver, Bookworm, Book Hoarder), a "Start a Path from this archetype" button appears.
4. **Thematic cards**: People at the center / Care & wellbeing / Money & paperwork, each with category chips (work, people, finance, health, personal).

Deliberately NOT in Synthesis (moved or dropped): trait-dimension scores (computed internally only — never surfaced, to avoid trait-gaming), Facts, Next steps, Focus, Sharing readiness, Blind spots. Blind spots live in Paths (see 3.5); sharing readiness lives at Legacy export / Security.

States:
- Empty: "Nothing to synthesize yet" + hint that uploads/links live in Import & Connect + "Go to Import & Connect" button.
- Loading: blurb placeholder "Synthesizing who you are from everything you have shared…" with pulsing status.
- Fallback (no WebGPU): same cards from local facts.

### 3.2 Knowledgebase → Network

- **Network graph card** ("Your network"): D3 force graph, user node at center (dark circle; all avatar circles uniform 20px radius, photo clipped inside or initials fallback), spokes weighted by mention count, cross-links for co-mentioned people. Slowly revolves around the user (~0.02°/frame; pauses on drag; off with prefers-reduced-motion). Names hidden until hover of that specific node. Drag nodes to rearrange (positions remembered by name); click a person node or card to open the person modal. Graph re-renders on every knowledgebase change.
- **Portrait card grid**: wrapping flex grid of 118px, 3:4 portrait cards (44px initials avatar, name, entry count). No taglines, no untag buttons. Click opens the same person modal.
- **Person modal** (overlay dialog): "You've known each other for X years" (or "under a year"), entry types, Relationships (shared connections with counts), D3 "You + Person" relationship timeline (all shared moments as dots; key moments — shared/other-people, relationship, and goal entries — as larger green dots with year labels), ★ Key moments list, Notes (dated bubbles) + comment box at the bottom (textarea + Add note, persists on-device). Close: button, overlay click, Escape.

### 3.3 Knowledgebase → Import & Connect

Sole place uploads and links are managed. Five equal tiles in a 2× grid (Link an account spans the three-row height on the right):
- **Link an account**: opens services modal listing all providers, each marked simulated.
- **Upload documents**: .md/.txt/.csv (statements get a review-then-import flow with totals preview), .html (Apple Journal exports parsed to dated journal entries), .pdf (text layer only; scanned PDFs are refused with a reason), .docx, .rtf, .json, .ics (calendar events), .vcf (contacts).
- **Upload audio**: mp3/wav/m4a/aac/ogg/webm/flac/opus; transcribed fully on-device with Whisper, staged progress notes, then searchable entries. Header queries with audio intent ("audio …", "recording …") return transcripts only.
- **Sync a folder**: File System Access where available, folder-picker fallback; content-hash dedupe, then manifest diff (added/changed/removed shown; removed files tombstoned).
- **Upload image**: opens a modal (drag-and-drop or browse) → preview grid → optional tag-a-person field (only here, never on the main import form) → Import. OCR on-device (Tesseract.js), dated from EXIF when present, people auto-tagged from text + manual tag.

Ownership row above the tiles: "These uploads are: Mine | Shared with me | Reference (not about me)" selector + "They're mine, or I have the right to keep them" attestation checkbox (remembered). Reference material stays searchable but never feeds Synthesis, archetypes, or essence. A non-blocking warning appears when an upload's signals mismatch the user's profile. Classification is the user's declaration — Hyperself never claims to verify ownership.

### 3.4 Knowledgebase → Security (also mirrored in Paths → Security)

Right-aligned submenu item with red badge counting actionable (high-severity) insights; the same content appears under Paths → Security. Per-finding cards (title, severity, message, suggestion, "Review in Paths"); image uploads are flagged here for inappropriate or compromising content; local crisis-language detection surfaces supportive resources, never diagnoses. Empty state: "No actionable security insights. Your uploaded knowledge looks clean."; empty-KB state points to Import & Connect.

### 3.5 Paths

Submenu: Insights · pinned-Path subtabs · Templates · Security (see section 2).

**Insights pane:**
- **Your Paths** cards: saved Paths with ask, template name, archetype lens ("Lens: Network Weaver"), actions Open / Pin-Unpin / Delete. Pinning creates the Path's subtab above.
- **Insight cards** over the knowledgebase: stale-data alerts, leaked-data/security findings, coverage **blind-spot** insight (names the missing entry type with one concrete attached "Next step: …" routing to Import), archetype-lensed insights ("For your Network Weaver side: …" pill; suppressed if the user dismissed that archetype), shareable-exposure review, freshness notes. Each card: severity chip, body, optional Next step line, actions (Review in Synthesis, Add context via Import, Expound, Pin/Unpin, Mark as reviewed). Pinned group first, then the rest; Acknowledged list at the bottom with Undo.
- Finance Paths stay **hidden entirely** (card, subtab, badge count) until financial data has been shared; nothing is deleted — the Path reappears when finance entries exist.

**Path detail pane** (opens from a subtab or Open): Finance (spending by category bars, monthly trend, recurring costs, descriptive "What stands out" — never prescriptive advice), Relationship Rhythms (most-recently-mentioned people, gone-quiet 90+ days, descriptive only), Reading Life (finished vs collected signals with balance bar). Non-template Paths open their saved ask in search.

**Templates pane:** only templates Hyperself suggests from already-shared data appear here (Have/Needs readiness checklist + Start button): Finance (bank-statement CSV; created unpinned by default), Relationship Rhythms (Network Weaver), Reading Life (Bookworm/Book Hoarder). Empty state: "No suggested Paths yet. Hyperself suggests a Path only when you have shared related data — nothing is pushed at you before then."

Empty state: "No Paths yet" + "Import or link data" button.

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

### 3.8 Vault lock + PWA

First run: create PIN (PBKDF2-wrapped AES-GCM key); optional biometric enrollment (WebAuthn PRF) that genuinely unwraps the key. Locked state shows only the unlock overlay — no user data renders. Forgotten PIN without biometrics is unrecoverable by design. Installable PWA (manifest + service worker, versioned cache); offline badge in the header when offline; core loop (unlock, Synthesis, Network, Paths) works in airplane mode.

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
- Layout: header flex (start-aligned, wraps); content column max-width 860px, 1.25rem padding; cards stacked with 0.75–1rem gaps; import tiles in a 2-column grid; people grid wraps at 118px cards. Count badges: 0.72rem pill, danger bg for security, neutral for Paths.
- Motion: single pulsing "loading" opacity animation; graph orbit + hover fade (120ms); everything disabled under `prefers-reduced-motion`.

## 5. Copy deck (exact strings)

- "Hyperself never asks you to journal." / "Everything arrives personal." / "Nothing left your browser."
- Synthesis empty: "Nothing to synthesize yet" / "Add documents or link accounts in Import & Connect — uploads and linked data are managed there. Your synthesis will appear here automatically."
- Archetypes: "Playful patterns from your data — not labels, not diagnoses." / Buttons "Confirm" · "Rename" · "Not me" · "Start a Path from this archetype".
- Network: "You are the center. People connect through entries that mention them together. Drag to rearrange; click a person for context. The graph updates automatically as your knowledgebase grows." / Modal: "You've known each other for X years." / "Notes stay on this device, attached to this person."
- Paths empty: "No Paths yet" / "Paths grow from your knowledgebase, and yours is empty. Import documents or link an app to begin."
- Paths insights: "Blind spot: no {type} knowledge yet" with "Next step:" lines; "Mark as reviewed" (acknowledge); "may contain leaked data" for high findings.
- Templates empty: "No suggested Paths yet. Hyperself suggests a Path only when you have shared related data — nothing is pushed at you before then."
- Import ownership: "Reference (not about me)" / "They're mine, or I have the right to keep them" / "Classification is your declaration — Hyperself never claims to verify ownership."
- Legacy export hint: "Exports shareable entries only, with a hash-verified manifest. Personal entries never leave. You'll be asked before exporting entries with high-severity findings."
- Audio: "Upload audio" / "Recordings transcribed on-device" / "Transcribed … into N entries — find it via search (try "audio")."
- Refusals always name the reason (no silent failures): e.g. "Nothing to export: no entries are tagged shareable.", "Recording is too short to transcribe.", "No speech was detected in that recording.", scanned PDF: no text layer.

## 6. Demo data for mockups

Personas (demo controls) span 2006–2026 with non-linear arcs and 26–29-person networks: Maya (teacher → researcher; Bookworm), Daniel (support → founder; Book Hoarder), Rosa (carer → coordinator; Caretaker Anchor). Use these for realistic graph/profile/era-timeline frames.

## 7. Out of scope for this handoff

Native mobile (ExecuTorch stretch), Figma component library/auto-layout system, dark mode, and real account integrations (all connections are simulated and labeled as such).
