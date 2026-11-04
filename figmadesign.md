# Hyperself: Figma Design Handoff

This document is the design handoff for Hyperself: the visual system, screen inventory, and exact copy from the Figma design, written for anyone implementing or reviewing the interface. For how the shipped app behaves today, see [docs/DESIGN.md](docs/DESIGN.md); this handoff remains the source of truth for visual fidelity.

**Handoff status (updated November 2026):** the app has evolved well past the inspected frames — sidebar navigation with Settings and Guide, per-view search, an interactive Timeline, curated knowledge packs, profile photos, and a Spanish interface are all implemented and described in §11. Those implementations extend the visual system below but have not been designed in Figma; §12 lists what a designer should review, decide, and deliver to bring the Figma back in sync. Nothing in §11 changes the tokens or geometry in §3 unless explicitly stated.

**Latest change:** Timeline has been promoted from a Knowledgebase subtab to its own main sidebar view (between Knowledgebase and Paths). The cards that used to sit below its graph — period detail, gap prompts, Add-a-memory — and the people pills under the graph are removed; period, people, and gap-memory details now appear only in the side drawer on click. See §11 Timeline and the updated §12 work list.

## 1. Authority and Scope

Inspected on **2026-10-30**. Visual source of truth: the Hyperself Figma file (screen page `0:1`, design-system page `3:53635`).
This handoff describes the inspected design and its exported reference material. Where the implementation has since evolved (navigation layout, Settings, languages), [docs/DESIGN.md](docs/DESIGN.md) describes the current behavior; the Figma still governs look and feel.

- There are **35 desktop screen/state frames**, each 1200px wide; heights vary with content. Do not force all screens into a 900px viewport.
- The design was exported with a complete screen tree (exact text, node IDs, positions, dimensions, styles, and variable bindings), a design-system inventory, and PNG references for every screen. The runtime assets from that export (icons, artwork, wordmark, fonts) live in `app/public/assets/hyperself/`; the raw export bundle itself is not kept in this repository, and the screen inventory in §4 below records what it contained.
- The exported palette and geometry tokens were resolved Figma variables rounded to 8-bit hex; they are now the CSS custom properties at the top of `app/src/styles.css`.
- Static layouts, status copy, and exported assets do **not** verify backend behavior, encryption, privacy guarantees, offline operation, live integrations, or working interactions.

## 2. Product and Navigation

Hyperself is designed as a local-first personal knowledge and AI workspace. Knowledge arrives through documents, audio, images, folders, linked sources, and personas rather than mandatory journaling.
The intended privacy model distinguishes `personal` material from explicitly approved `shareable` material. Paths and Legacy are intended to use approved shareable knowledge; a screen saying so is not proof of enforcement.

- Original design: a header with the plain **Hyperself** wordmark, Knowledgebase / Paths / Legacy navigation, right-hand search, and an offline badge where shown.
- **Current app (see §11):** the main menu lives in a 248px sidebar — wordmark, greeting, and offline badge at top; Knowledgebase / **Timeline** / Paths / Legacy below; **Guide** and **Settings** pinned at the sidebar bottom. Each view's subsections sit in a horizontal strip at the top of the main view, with Security at the right end; the strip hides on Timeline, Guide, and Settings. On small screens the sidebar collapses into a wrapping top block.
- Search: one search bar for the whole app, moved to the top of each main view (above the overview card on Synthesis; centered over the graph on Network; at the top of Timeline). Placeholder: "Ask your knowledgebase…", with per-view variants ("Search people in your network…" on Network, "Search your timeline…" on Timeline). The illustrated search state uses an audio-budget query and transcript results.
- Knowledgebase submenu: Synthesis / Network / Import & Connect, with Security aligned right. Timeline graduated to its own main sidebar view (between Knowledgebase and Paths) and is not in the inspected frames.
- Paths submenu: Insights / pinned saved-Path tabs, Templates, History, with Security at the right. Nothing is pinned by default in the current app; new Paths appear first as Suggested Paths on Insights. Only **Relationship Rhythms** is pinned in the illustrated populated states.
- Legacy submenu: Export, plus pinned knowledge-pack tabs (see §11). The pane contains export, import, and pack-only question sections, not three separate navigation destinations.
- The Paths badge counts saved Paths plus ready suggestions: initially **3 = 2 saved + 1 Reading Life suggestion**; after starting Reading Life, **3 = 3 saved + 0 suggestions**. Do not count only pinned tabs or double-count a started suggestion.
- Security badge **1** counts the one actionable high-severity finding, not all insight cards. Clear/empty states must not keep a stale actionable badge.
- "Offline · on-device" is a designed state label, not evidence that a service worker or airplane-mode workflow has been tested.

## 3. Visual System and Geometry

Use the current light-mode navy/lavender system, not the previous warm brown/green palette or system-font-only specification.

| Role / CSS token | Resolved value | Application |
|---|---|---|
| `--text-primary`, `--action-primary`, `--surface-strong` | `#05006d` | Navy text, primary controls, strong surfaces |
| `--surface-default` | `#ffffff` | Main surfaces |
| `--surface-wash` | `#f8f7fb` | Header/submenu wash |
| `--text-secondary` | `#585875` | Secondary copy |
| `--border-default` | `#d2d1e5` | Hairlines and input/card borders |
| `--border-accent` | `#a59acb` | Lavender icon strokes and accent borders |
| `--text-accent` | `#65558e` | Accent text |
| `--surface-accent-lavender`, `--surface-accent-yellow` | `#a59acb`, `#ffc508` | Available design-system tokens; not used as surfaces by the 35 screens |
| `--status-info-background` | `#ebebf3` | Neutral/info pills |
| `--action-danger`, `--text-danger` | `#c4142e` | Destructive/high-severity emphasis |
| `--status-danger-background` | `#f6dcd8` | High-severity soft fill |
| `--status-success-background`, `--text-success` | `#dcefe2`, `#1f4d30` | Success/shareable states |
| `--status-warning-background`, `--text-warning` | `#fff1c4`, `#7a5b1e` | Warnings |

Typography: **Momo Trust Display Regular** at 18, 21, 24, and 26px for display/headings/brand; **Inter 400/700** for body, navigation, controls, and captions at 11, 11.5, 12, 13, 14, and 15px as specified in the screen tree.
Shared styles use **150% line height** and zero letter spacing. Do not replace display text with bold Inter or synthesize a bold Momo face.

| Element | Observed geometry |
|---|---|
| Header | 76px high; 24px horizontal and 16px vertical padding |
| Submenu | 51px or 53px high depending on state; use the specific frame |
| Main column | 860px **outer** width, including 20px left/right padding |
| Cards | 820px wide at x=190 in a 1200px frame; normally 20px internal padding, 8px radius |
| Content stack | 16px gaps |
| Standard buttons | 37px high, 8px vertical / 12px horizontal padding, 6px radius |
| Inputs | 41px high, 10px padding, 6px radius; header search is a separate 300 x 40px pattern |
| Standard dialogs | 640px wide, 24px padding, 10px radius, top y=164 |
| First-run panels | 600px wide, 28px padding, top y=146 |
| Pills / avatars | Fully rounded; use individual exported dimensions |
| People cards | 118 x 157px, 44px initials avatar; graph person nodes are 40px diameter |

**Modal scrims in the design are solid, opaque navy**, not translucent backdrops. (Current app: this holds on smaller screens; on wide screens the person/profile panel is a right-hand drawer with no scrim, so the Network graph stays visible underneath.)

Implemented geometry since the inspection (same tokens, new layout facts a designer should adopt or revise): sidebar **248px**, sticky full-height, collapsing to a top block at ≤860px; submenu strip restored at the top of the main view (51px, wash background); Network and Timeline cards **break out of the 860px column** to viewport width minus sidebar and 20px gutters; Timeline plot is **280px** tall inside a horizontally scrollable viewport with per-period widths of 34–132px by granularity; person/profile, timeline-period, and timeline-tag panels are **420px right-hand drawers** (12px left radius, 1px left border, 220ms slide-in, no scrim) at ≥861px and the original navy overlay below that; search over Network is centered, max 520px wide, floating 12px over the graph; profile avatars accept a user photo (square-cropped, circular mask) with the initials fallback unchanged.
The five source tiles are not equal-sized: four **268 x 218px** tiles form a 2-by-2 block on the left; the **260 x 448px** account tile on the right spans **two rows**, with 12px gaps.
These are desktop observations, not a delivered mobile breakpoint specification. Preserve hierarchy when implementing responsive layouts and explicitly QA mobile behavior rather than claiming mobile screens were designed.

## 4. Screen Index

Every row is a separate Figma screen/state frame on page `0:1`. The PNG filenames below are the reference snapshots from the design export (kept with the Figma source, not in this repository). These 35 frames predate the implementation updates in §11 — Timeline, Settings, Guide, knowledge-pack configuration, the sidebar shell, and the drawers have no frames yet and are the first thing a design pass should add (§12).
All widths are 1200px; the height column is in pixels. Use these PNGs for QA, not as runtime page backgrounds.

| # | Screen / state | Node ID | Height | Reference PNG filename |
|---|---|---|---:|---|
| 1 | Knowledgebase / Synthesis populated | `3:49868` | 2347 | `knowledgebase-synthesis-populated.png` |
| 2 | Knowledgebase / Network, 28 people | `3:50021` | 1644 | `knowledgebase-network-28-people.png` |
| 3 | Network / Priya Shah dialog | `3:50302` | 1644 | `knowledgebase-network-priya-shah-dialog.png` |
| 4 | Knowledgebase / Import & Connect | `3:50671` | 1230 | `knowledgebase-import-connect.png` |
| 5 | Import / Linked services, simulated | `3:50767` | 1230 | `import-connect-linked-services-simulated.png` |
| 6 | Import / Upload image preview | `3:50919` | 1230 | `import-connect-upload-image-preview.png` |
| 7 | Import / Statement review, ready | `3:51059` | 1230 | `import-connect-statement-review-ready-to-import.png` |
| 8 | Import / Statement imported and approved | `3:51208` | 1230 | `import-connect-statement-imported-and-approved.png` |
| 9 | Import / Folder manifest review | `3:51337` | 1230 | `import-connect-folder-sync-manifest-review.png` |
| 10 | Import / Audio transcribing | `3:51477` | 1230 | `import-connect-audio-whisper-transcribing.png` |
| 11 | Import / Audio transcription complete | `3:51601` | 1230 | `import-connect-audio-on-device-transcription-complete.png` |
| 12 | Knowledgebase + Paths / Actionable Security | `3:51735` | 900 | `knowledgebase-paths-security-shared-actionable-finding.png` |
| 13 | Paths / Insights, saved Paths and reviews | `3:51787` | 2349 | `paths-insights-saved-paths-and-reviews.png` |
| 14 | Paths / Relationship Rhythms, pinned | `3:51933` | 1208 | `paths-relationship-rhythms-pinned-detail.png` |
| 15 | Paths / Finance, unpinned | `3:52011` | 1781 | `paths-finance-unpinned-detail.png` |
| 16 | Paths / Reading Life, just started, unpinned | `3:52145` | 1200 | `paths-reading-life-just-started-unpinned.png` |
| 17 | Paths / Templates, Reading Life suggestion | `3:52224` | 900 | `paths-templates-reading-life-suggested.png` |
| 18 | Legacy / Knowledge pack | `3:52282` | 1277 | `legacy-export-knowledge-pack.png` |
| 19 | Legacy / High-severity export confirmation | `3:52357` | 1277 | `legacy-export-high-severity-confirmation.png` |
| 20 | Utility / Audio-budget search results | `3:52456` | 999 | `utility-search-audio-budget-transcripts.png` |
| 21 | First run / Welcome, step 1 | `3:52529` | 900 | `first-run-welcome-step-1.png` |
| 22 | First run / Privacy promise, step 2 | `3:52549` | 900 | `first-run-privacy-promise-step-2.png` |
| 23 | First run / Knowledge sources, step 3 | `3:52576` | 919 | `first-run-knowledge-sources-step-3.png` |
| 24 | First run / Your Paths, step 4 | `3:52616` | 900 | `first-run-your-paths-step-4.png` |
| 25 | Vault / Create PIN | `3:52641` | 900 | `vault-create-pin-first-run.png` |
| 26 | Vault / Optional biometric enrollment | `3:52666` | 900 | `vault-optional-biometric-enrollment-after-pin.png` |
| 27 | Vault / Locked, unlock only | `3:52684` | 900 | `vault-locked-unlock-only.png` |
| 28 | Synthesis / Empty | `3:52708` | 900 | `knowledgebase-synthesis-empty.png` |
| 29 | Synthesis / Loading | `3:52742` | 900 | `knowledgebase-synthesis-loading.png` |
| 30 | Synthesis / Local-facts fallback | `3:52780` | 2383 | `knowledgebase-synthesis-local-facts-fallback.png` |
| 31 | Paths / Empty knowledgebase | `3:52934` | 900 | `paths-insights-empty-knowledgebase.png` |
| 32 | Templates / No related shared data | `3:52966` | 900 | `paths-templates-no-related-shared-data.png` |
| 33 | Security / Clear after review | `3:52997` | 900 | `knowledgebase-paths-security-clear-after-review.png` |
| 34 | Security / Empty knowledgebase | `3:53032` | 900 | `knowledgebase-paths-security-empty-knowledgebase.png` |
| 35 | Import / Scanned PDF refusal | `3:53067` | 1230 | `import-connect-refused-scanned-pdf-explicit-reason.png` |

## 5. Knowledgebase Hierarchy and Demo Content

### Synthesis

Stack: profile card, archetype era timeline, three archetype cards, then People at the center / Care & wellbeing / Money & paperwork thematic cards.
The profile is **Maya**, with a circular **M** initials avatar, confirmed Bookworm / Network Weaver / Deep Researcher pills, an essence paragraph, interests, and 28 key people. (Current app: the avatar accepts a user-uploaded profile photo — square-cropped to a 256px copy stored locally — and the archetype set has since been renamed in the app, e.g. Bookworm became the Margin Annotator vs Shelf Cartographer pair; see [docs/DESIGN.md](docs/DESIGN.md). The frames below record the original design content.)
Essence: "You turn curiosity into understanding and make room for others along the way. Moving from teaching into research, you’re building a life where careful inquiry can have a wider impact."
Interests: reading, learning sciences, community. Disclaimer: "Playful patterns from your data — not labels, not diagnoses."

| Archetype | Strength | Confidence | Trend |
|---|---:|---:|---|
| Bookworm | 88/100 | 94/100 | steady |
| Network Weaver | 82/100 | 89/100 | rising |
| Deep Researcher | 79/100 | 86/100 | rising |

Era content: **2006–2012** Bookworm / Early Riser; **2013–2018** Bookworm / Caretaker Anchor; **2019–2022** Network Weaver / Bookworm; **2023–2026** Deep Researcher / Network Weaver / Bookworm.
Each archetype has meaning, "Why this fits", a strength bar, explicit strength/confidence/trend, "Watch for", and Confirm / Rename / Not me actions. Bookworm and Network Weaver show a Path-start action.
Do not substitute internal trait-dimension scores for these visible pattern scores. Exact evidence paragraphs and thematic copy are in `data/screens.json`.
Empty state routes to Import & Connect; loading says "Synthesizing who you are from everything you have shared…"; local-facts fallback is its own full-height reference.

### Network and Person Dialog

The screen contains "Your network", a user-centered graph, explanatory copy, and a wrapping grid of **28 people**, not photographic portraits.
Graph nodes and people cards use initials; names, counts, connecting lines, timeline dots, and bars should remain structured DOM/SVG rather than flattened screenshots.
(Current app: the graph card is full-width with **no header or description**, the search bar floats centered over the graph, the centre node shows the user's uploaded profile photo when set, person details open in the 420px right-hand drawer from §3 (navy overlay on small screens), and clicking the centre circle opens the user's own profile card with archetypes, essence, and their timeline in the same drawer.)
Priya Shah has **64 entries = Calendar 28 + Documents 31 + Images 5**, a **12-year** relationship, and **24 shared moments, 2014–2026**.
Shared connections: **Jonah Reed 12**, **Elena Rossi 8**, **Sam Okafor 5** shared entries. Do not confuse these with their whole-person entry counts.
Dialog hierarchy: person heading and duration, entry-type pills, Relationships, You + Priya timeline, Key moments, dated Notes, and note composer.
Key moments include meeting at Northbank School in 2014, starting the neighborhood reading group in 2019, and collaborating on the learning-sciences research proposal in 2024.
The visible note dated 24 October 2026 says Priya mentioned her new research group at the last catch-up. Persistence and graph manipulation remain implementation work.

## 6. Import & Connect States

The base surface places ownership/attestation above the five source tiles, followed by "Uploads & linked sources".
Ownership choices: Mine / Shared with me / Reference (not about me). Attestation: "They're mine, or I have the right to keep them".
"Classification is your declaration — Hyperself never claims to verify ownership." Reference material is intended to remain searchable without feeding personal synthesis.
Listed source examples include `october-2026.csv`, Research notes (18 local files), and Calendar (Simulated, 36 entries, "Updated 27 Oct"). These are demo labels, not supplied user documents.

- Documents advertise `.md .txt .csv .html .pdf .docx .rtf .json .ics .vcf`; PDF copy specifies text-layer-only import and statement review before import.
- Audio advertises mp3 / wav / m4a / aac / ogg / webm / flac / opus. Whisper/on-device labels express the intended processing model.
- Folder tile describes content-hash deduplication and tombstoning removals. The delivered state is **manifest review**, not a designed finished-sync screen.
- Linked-services dialog labels providers as **Simulated**; do not replace this with claims of authenticated live account access.
- Image preview shows **`reading-group.jpg`** and **`conference-note.png`**, optional Priya Shah tagging, and a non-blocking possible-author/ownership mismatch warning. Both previews are vector mock document cards, not real photographs or uploaded files.
- The Security sample instead names **`conference-receipt.png`**. This is a different filename; do not silently rename the preview or treat it as the same source.

Statement review: **`october-2026.csv`, 1–29 October 2026, USD, 42 rows validated**; income **$4,200.00**, spending **$2,860.00**, net **$1,340.00**.
Five preview rows are illustrative, not the full ledger: 01 Oct Salary / Income **+$4,200.00**; 02 Oct Rent / Housing **−$1,250.00**; 03 Oct Market / Groceries **−$86.40**; 05 Oct Rail pass / Transport **−$110.00**; 06 Oct Bookshop / Books **−$42.00**.
"Showing 5 of 42 rows. Totals include all rows." Do not derive full totals or categories from these five rows alone.
The subsequent approved state explicitly shows **42 imported entries approved as shareable** and the same totals; approval is not export. The initial arrival is personal.
Folder manifest: **18 checked = 2 added + 1 changed + 1 removed + 14 unchanged**. Do not turn unchanged files into new entries.
Audio: **`budget-conversation.m4a`, 12 min 08 sec**, transcribing **65% / 7 min 53 sec processed**; completed state shows **8.4 MB**, full 12:08 processed, and **6 entries**.
Search has **3 transcript results** dated 27 October 2026, with ranges **00:42–01:18**, **04:10–05:02**, **09:25–10:04**. Six generated entries do not mean six visible search matches.
Scanned-PDF refusal: "archive-scan.pdf has no text layer. Scanned PDFs cannot be imported as documents." Preserve an explicit refusal reason, not a generic success toast.
There is no designed generic completed-upload state, finished folder-sync state, or real fixture upload file in the exported bundle.

## 7. Paths and Security

Insights hierarchy: Your Paths saved cards; archetype-lensed/pinned insight grouping; high-severity, freshness, coverage, shareable-exposure, and finance observations; acknowledged content with Undo.
Saved Relationship Rhythms is pinned; Finance is saved but unpinned. Reading Life begins as a template suggestion, then becomes saved **unpinned**, leaving only Relationship Rhythms as a pinned subtab.
Actions such as Open / Pin / Unpin / Delete / Expound / Mark as reviewed are designed affordances, not tested persistence or routing.
Original product rule: Finance must be hidden from cards, tabs, and counts until relevant approved financial data exists, without deleting the saved Path. This gating is an **engineering requirement**, not demonstrated by the populated Finance state alone.
Templates show related-data readiness and Start; the no-related-data screen avoids premature suggestions. Custom saved-ask Paths and a rename workflow are not separately designed.

Relationship Rhythms shows recent mentions (Priya 28 Oct / 64 entries; Jonah 26 Oct / 62; Elena 24 Oct / 60; Sam 21 Oct / 58), a "Gone quiet · 90+ days" group, and descriptive observations.
Missing mentions do not prove a relationship changed or ended. The screen explicitly says calendar coverage ends in June while documents continue through October.

Finance uses the same October statement as import: income **$4,200**, spending **$2,860**, net **$1,340**, **41 outgoing transactions / 42 total entries**.
Categories: **Housing $1,250; Groceries $520; Transport $310; Dining $240; Other $200; Utilities $180; Books $160**. Their sum is **$2,860**.
Monthly spending: **August $2,640 / September $2,780 / October $2,860**. Recurring costs: **Rent $1,250 + Internet $55 + Streaming $15 = $1,320/month**; these are part of spending, not extra spending.
Observations include housing at 44% and increases of $80 versus September / $220 versus August. This is descriptive sample material, not financial advice or a complete financial picture.
Reading Life: **18 finished + 7 collected = 25 signals**, balance **72% / 28%**; finished reading, collected titles, and interpretation follow. Keep the newly saved state unpinned.

Security is a shared Knowledgebase/Paths destination with one high-severity sample image finding, review guidance, and local-check caveats.
The `conference-receipt.png` sample may contain a home address and account identifier; the copy explicitly says this is **not a confirmed exposure**.
Clear-after-review and empty-knowledgebase states are distinct; the latter should direct users toward adding knowledge, not imply actual scanning has occurred.
Preserve uncertainty and supportive, non-diagnostic language. Security status must not be presented as proof that data left the device.

**Known copy discrepancy:** Synthesis / Care & wellbeing mentions "Recent calendar records" and protected time; Insights and Relationship Rhythms say the latest calendar entry is June 2026.
Keep the inspected text for fidelity and flag the discrepancy for product review; do not silently invent newer events. Calendar's **"Updated 27 Oct"** source badge concerns source/import updating, not the freshness of event dates.

## 8. Legacy, First Run, and Vault

Legacy stacks Export knowledge pack, Import knowledge pack, and Ask this pack. Author **Maya**, version **1.0.0**, **184 shareable entries**, and **1 high-severity finding** are the illustrated export values.
Intended export scope is **184 shareable / 0 personal entries**; a high-severity confirmation state precedes export. Hash verification and filtering require runtime tests, not just matching labels.
Import example: `maya-research-pack-1.0.0.hyperself`; "Verified"; pack ID **`maya-research-2026`**, version **1.0.0**, author **Maya**, **24 entries imported**.
Question: "What did Maya research in 2024?" The example answer describes learning sciences, collaborative reading, and classroom discussion. **Ask this pack must use imported pack entries only**, not the owner's wider vault.

First run has four distinct panels: Welcome/name, Privacy promise, Knowledge sources, Your Paths. Sources offers Scan my accounts / Link all found / Load Maya persona with simulated-source status.
Privacy copy includes "Everything arrives personal." and "Nothing left your browser." These are product promises to implement and validate, not verified outcomes of this handoff.
Vault has three separate states: create a PIN of at least six digits with confirmation; optional biometric enrollment after PIN; locked/unlock-only surface without visible personal workspace data.
Vault copy names PBKDF2-protected AES-GCM keys, local credential-based biometric unlocking, no stored fingerprint/face data, and unrecoverability without PIN or enrolled biometrics. The design does not prove these mechanisms work.

## 9. Assets and Runtime Usage

**There are no real raster image fills anywhere in the inspected screens and no photographs.** Use CSS/DOM initials avatars; do not invent stock photos or real document uploads.
Graphs, timelines, category bars, progress, and balance visuals should be dynamic DOM/SVG. A reference PNG is not an interactive chart or a runtime background.
Brand usage is the plain Hyperself wordmark. Design-system scratch logo studies and its `CODE_INSTANCE` are not used by the screens and are excluded from runtime assets.

| Bundle item | Use |
|---|---|
| `icons/*.svg` | Exported UI icons; use manifest dimensions and source mapping |
| `artwork/reading-group-preview.svg` | 290 x 145 vector mock thumbnail for `reading-group.jpg` |
| `artwork/conference-note-preview.svg` | 290 x 145 vector mock thumbnail for `conference-note.png` |
| `artwork/hyperself-wordmark.svg` | 104 x 32 outlined-text wordmark; no font dependency inside this SVG |
| `references/*.png` | All 35 desktop-state QA references, not runtime UI |
| `tokens.css` | Resolved light-mode color, spacing, radius, and font-family tokens |
| `fonts/fonts.css` and local WOFF2 files | Self-hosted fonts; CSS URLs resolve relative to this directory |
| `data/*.json`, `manifest.json` | Build/reference metadata and provenance, not live vault data |

Base icon names: `file-text`, `audio-lines`, `folder-sync`, `image`, `link`, `search`, `square-check`, `circle-check`, `x`, `pin`, `fingerprint`, `shield-check`, `route`, `files`, `lock-keyhole`, `image-up`, `calendar-days`, `mail`, `folder`, `star`.
Use `icons/<name>.svg` for the base export. For additional fingerprint sizes or other variants, resolve the actual path through the manifest; do not hardcode a total SVG count or hash-suffixed filenames.
SVG colors are baked into exported fill/stroke attributes. CSS `color` on an `<img>` does **not** recolor them. Preserve exported colors by default; if inlining for controlled recoloring, update attributes intentionally and namespace clip/mask IDs to avoid collisions between repeated SVGs.

Font delivery includes **Inter Latin variable 400–700** and **Momo Trust Display Regular Latin WOFF2**, `fonts.css`, and OFL license files. Fonts are downloaded from public Google Fonts, **not extracted from Figma**.
Exact download URLs and checksums are in `data/fonts.json`; matching family names does not establish identical font-binary versions to those used by Figma.
Keep the supplied licenses with redistributed fonts. These are Latin subsets; additional languages require appropriately licensed extra subsets and glyph-coverage testing. Do not assume full multilingual coverage.
The exported assets live in `app/public/assets/hyperself/` in this repository, so relative font filenames resolve locally. Serve the files locally rather than relying on Google Fonts at runtime.

```html
<link rel="stylesheet" href="/assets/hyperself/tokens.css">
<link rel="stylesheet" href="/assets/hyperself/fonts/fonts.css">
<img src="/assets/hyperself/artwork/hyperself-wordmark.svg"
     width="104" height="32" alt="Hyperself">
<button type="button">
  <img src="/assets/hyperself/icons/file-text.svg" width="24" height="24" alt="">
  Upload documents
</button>
```

```css
body { font-family: var(--font-body); font-weight: 400; line-height: 1.5; color: var(--text-primary); }
h1, h2, h3, .display { font-family: var(--font-display); font-weight: 400; line-height: 1.5; }
button, input, textarea { font-family: var(--font-body); }
.strong { font-weight: 700; }
```

Use actual text for accessible control labels and meaningful alt text for informative thumbnails; decorative icons get empty alt text. Set heading sizes per screen rather than inheriting browser defaults.
If an offline core loop is required, include the local fonts, SVGs, CSS, and required application code/model assets in the offline caching strategy and test cold/warm offline behavior. Exporting assets alone does not supply this.
The JSON and PNG references contain **fictional sample data** (the Maya persona and her network, invented for design and demo purposes). They are build references, not a real user's vault: never auto-import or autoload them into real workspaces. Production fixture handling must be explicit.

## 10. Keeping the Design and App in Sync

Re-exports happen from the Figma workspace (the exporter is a build-time tool and is not part of this repository or the app's runtime). After any re-export, reconcile the screen inventory, reference dimensions, resolved tokens, and asset/font manifests against this handoff, and update the runtime assets in `app/public/assets/hyperself/` deliberately — never copy stale hashes or variant suffixes into code.

The product requirements the design expresses — personal-by-default ingestion, explicit shareable approval, no personal data in exports, local processing, an encrypted local vault, and offline operation — are implemented and tested in the app; [docs/DESIGN.md](docs/DESIGN.md) and [docs/EVALS.md](docs/EVALS.md) describe how each is verified. This handoff on its own is a design reference, not a claim about runtime behavior.

Not covered by the original design delivery: custom Path creation, a finished generic-upload state, finished folder-sync screens, and mobile breakpoints. The app implements these by extending the same visual system; treat this document as their style reference, not their specification.

## 11. Implementation Updates Since the 2026-10-30 Inspection

Everything below is implemented, tested, and shipped in the app. None of it has Figma frames yet; each item notes the design decision a handoff should confirm or revise.

### Navigation shell (replaces the header design)

- 248px sidebar: wordmark, greeting, offline badge; Knowledgebase / Paths / Legacy; Guide and Settings pinned at the bottom. Subsections returned to a horizontal strip at the top of the main view after a period nested in the sidebar — the strip layout (Security at the right end) matches the original submenu intent better at current scale. Collapse behavior at ≤860px is implemented, not designed.
- **Settings** (sidebar bottom): local model selection — light/deep tier buttons, endpoint, model, connection status, setup disclosure — plus privacy shortcuts and the language switcher. Synthesis keeps a one-line "Local model: … · Change in Settings" status.
- **Guide** (just above Settings): long-form explanations — how Hyperself works, Paths surfacing, Augmented Paths consent, privacy tags, knowledge packs, Timeline, models, language. Mirrors `docs/GUIDE.md`.

### Search

- One search bar, moved (never duplicated) to the top of each main view; sticky on Synthesis above the overview card; centered and floating over the Network graph; per-view placeholders; typed queries survive view switches. Results still render above the content with Save-as-Path.

### Network (extends frames 2–3)

- Full-bleed graph card, no header/description, taller simulation area, resize-aware. Centre node carries the user's profile photo; person and self details use the right-hand drawer (wide) / navy overlay (small) pattern from §3.

### Timeline (new view; no frames)

- Timeline is its own main sidebar view, between Knowledgebase and Paths (it began as a Knowledgebase subtab). Summarized: full-bleed interactive D3 bar chart (axis component, count labels, gridlines) — spike periods yellow, silent gap periods pale, green dot where a person was first met; horizontally scrollable at fixed per-period widths. Uploaded data: every entry in date order. Designed November 2026 in Figma section `48:59569` (Years/Quarters/Months/Days, filtered, drawers, gap-memory states, empty archive; desktop + mobile) and implemented to match: Timeline heading with Summarized/Uploaded toggle and zoom caption, floating type+kind filter pills, first-meeting legend, and the 420px drawer with header Close.
- Analysis tags as chips below the chart: spike, lull, gap, and type-mix ("Mostly research in Jun 2024") only. There are deliberately **no people pills**: a green dot on the chart marks a first meeting, and who was met appears only inside the period drawer on click. Kind toggles dim non-matching periods; type toggles rescale the chart to one entry type; type toggles and zoom controls float over the graph.
- Zoom: Years → Quarters → Months → Days, capped at 1,200 periods so long archives stop at a legible level.
- Clicking a period or a **tag** opens its details in the same 420px drawer pattern — including the people first met in that stretch, who no longer appear as pills under the graph. There are no cards below the graph.
- Gap prompts: silent stretches at/over the threshold (12 months, tightening to 6 then 3 as the archive grows) are tagged as gaps; clicking the tag (or a silent period) opens the drawer with a memory form — typed or dictated by microphone (on-device transcription) — saved as a personal entry dated inside the gap.

### Legacy: curated knowledge packs (extends frame 18)

- Multiple named packs, each with settings: name, author label, version, and **Expertise only** curation (findings, methods, research, skills, and skill-evidenced entries) or all shareable entries. Live "N of M shareable would be exported" counts; last-exported date and count are remembered, so updating a shared pack is one click. Pinned packs appear as Legacy subtabs, mirroring pinned Paths. The one-off author/version export form is gone.

### Profile photo

- Upload/remove on the Synthesis profile card; square center-crop to a 256px JPEG copy stored in the local database (covered by vault encryption and backups); the source file is never referenced. Shown on the overview avatar, the Network centre node, and the self profile drawer. Initials fallback unchanged.

### Interface language

- English / Spanish switcher in Settings. Chrome strings only (navigation, submenus, Settings, search, Guide headings are static English in-app); user entries are never translated, and synthesis prompts remain English — the Settings note says exactly that in both languages. Spanish label lengths have not been design-reviewed (see §12).

### Paths (confirms frames 13–17 with changes)

- Nothing pinned by default, Finance included. Suggested Paths on Insights with readiness gating; History (approved + dismissed, restorable) beside Templates; augmented (online, derived-profile-only, exact-payload consent) detail for eligible Paths.

## 12. Design Handoff Prep

For the designer picking this up: the goal is to bring Figma back in sync with the shipped app without breaking the visual system in §3. Work through this list in order.

**New frames to design (in priority order)**

1. App shell: sidebar with the four-item main menu — Knowledgebase / **Timeline** / Paths / Legacy — (expanded + ≤860px collapsed), submenu strip with pinned Path/pack tabs, Settings, and Guide — empty, populated, and Spanish-label states.
2. Timeline as a main view: summarized chart at year/quarter/month/day densities with overlay filter and zoom states; period drawer and tag drawer (including the people-met section that replaced the pills); gap-memory form inside the drawer with recording/transcribing states; zero-gap and empty-archive states. No frames for anything below the graph — by design there is nothing there; confirm that emptiness reads as intentional.
3. Network as shipped: full-bleed graph, centered floating search, self profile drawer, photo vs initials centre node.
4. Legacy pack configuration: pack cards (never exported / exported / pinned / selected), expertise toggle on/off counts, create-pack flow, delete confirmation.
5. Profile photo: upload affordance, replace/remove, and the avatar in its three homes (overview, graph centre, self drawer).

**Decisions needed (implemented defaults to confirm or revise)**

- Full-bleed breakout for Network/Timeline cards vs the 860px column — keep, or design a max-width?
- 420px no-scrim drawer on wide screens vs the original opaque navy scrim — the app chose visibility of the graph underneath; confirm for Timeline tags as well as people.
- Zoom cap (1,200 periods) and per-period widths (34–132px); day-level tick labeling on dense archives.
- Overlay controls floating on the graph (Network search, Timeline filters/zoom) vs docked toolbars.
- Spanish string lengths in the sidebar and strip; whether Templates/History/Security need shorter Spanish labels.
- Gap-memory tone inside the drawer: the form opens on a gap tag or silent period — confirm it invites rather than nags, and that hiding it behind a click doesn't bury the feature.
- People discoverability without pills: a 3.5px green dot plus drawer content is the only signal that a period holds a first meeting — confirm that is findable enough, or design a stronger affordance.

**Handoff checklist**

- [ ] New frames above added to the Figma screen page, named to match §4's convention, and appended to the §4 index with node IDs and heights.
- [ ] Tokens unchanged, or any change recorded in §3 with resolved values.
- [ ] Drawer, overlay, and full-bleed behaviors specified as states, not just statics (hover, selected period, recording, transcribing, disabled zoom ends).
- [ ] Mobile (≤860px) states for every new frame — this is still the largest designed-vs-implemented gap.
- [ ] This document updated: §4 index extended, §11 items marked designed, §12 decisions recorded with outcomes.
- [ ] `docs/DESIGN.md` and this handoff agree; where they differ, the difference is called out rather than silent.
