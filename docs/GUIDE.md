# Hyperself guide

The longer explanations behind the one-line summaries in the [README](../README.md). The same content is available inside the app under **Guide**, at the bottom of the sidebar.

## How Hyperself works

Hyperself brings the archive you already have — documents, bank statements, journals, photos, recordings, calendars, and contacts, spanning years of non-linear change — together in one place on your device. You never journal by hand. Everything arrives through Import & Connect as uploads, folder syncs, simulated account links (clearly labeled simulated — no real third-party integration yet), or exports you download from your other services.

Each item is classified by you — Mine, Shared with me, or Reference. Reference material stays searchable but never shapes your Synthesis, archetypes, or essence. Classification is your declaration; Hyperself never claims to verify ownership.

On-device synthesis then reads across that archive. Local structured extraction at ingest links what you bring: people already in your knowledgebase are auto-linked when mentioned, recurring new names are cautiously auto-tagged, and entries auto-link to matching goals and evidenced skills. Every tag stays removable, and extraction is deterministic — no model is involved.

## Knowledgebase

- **Synthesis** — a profile card with archetype pills and a two-sentence essence generated on-device from everything you have uploaded. Archetypes (Margin Annotator vs Shelf Cartographer, Keeper of Threads, Compass Resetter, and more — novel coinages tied to familiar patterns, not stock labels) explain the evidence behind each label, show how they changed across the years of your archive, and let you Confirm, Rename, or dismiss ("Not me") any label. You are the final authority. Nothing diagnostic, nothing clinical.
- **Network** — a full-width graph with you at the center. Click a person for their shared timeline, key moments, how long you have known each other, and private notes; click the center circle for your own profile card and timeline. People come from tags applied at import or upload (including on images) plus the local extraction above.
- **Timeline** — your knowledgebase over time, with a Summarized / Uploaded data toggle. Summarized is a full-width, interactive, horizontally scrollable chart at the top of the view: zoom from years down to quarters, months, and days (as far as your data supports), use the overlaid filters to view one entry type or one kind of analysis tag, click any period to inspect its entries, and click any analysis tag to open its details in a side panel — spikes in what you provided, lulls in recording, the dominant type of each period, and when people in your network first appear. Where a long gap is found — a year at first, tightening to six then three months as your archive grows — Hyperself prompts you to add a memory from that time, typed or dictated by microphone and transcribed on-device. Memories are personal entries, dated inside the gap, so the timeline fills in as you remember.
- **Import & Connect** — the only place uploads and links are managed. Documents (Markdown/text, CSV bank statements with review-then-import, PDF text layer, DOCX, RTF, JSON, HTML including Apple Journal exports, ICS calendars, VCF contacts, password-protected and scanned PDFs), audio transcribed fully on-device and searchable, images with on-device OCR and EXIF dating, and folder sync with content-hash dedupe and change detection. Can't link a service? Per-service export guides (Notion, Drive, Gmail, Slack, GitHub, LinkedIn, X, Apple Health, Calendar, Contacts, family portals) show how to download your data and upload it instead; ZIP exports are unpacked locally, exactly as downloaded.
- **Security** — local scanning of everything you upload (secrets, contact details, stale data, crisis language handled supportively and non-diagnostically), with actionable findings. Scanning never sends anything anywhere.

## Paths: surfaced when they make sense

Paths are focused views over your knowledge — Finance, Health, Relationship Rhythms, Reading Life, and Paths you save from your own searches ("Ask anything in the search bar and save the answer as a Path").

Hyperself's approach is deliberately quiet. No Path is pinned by default and nothing is pushed at you. A new Path first appears as a **Suggested Path** on Insights, only when your knowledge is already ready for it: Finance after enough finance entries exist (category spend, monthly trend, recurring costs), Health after health records arrive (activity, sleep, check-ups, including Apple Health exports), Relationship Rhythms when enough people appear across your entries, Reading Life from your reading signals. The Templates view lists every template with what you have and what it still needs, so nothing is hidden — it just isn't surfaced until it makes sense.

Insights include archetype-lensed notes ("For your Keeper of Threads side: Ana has gone quiet"). Expound, pin, mark reviewed, or dismiss each one; everything approved or dismissed collects in History, where it can be restored. Paths describe what your data shows — never financial or medical advice, diagnoses, or counseling.

A note on words: locally, Paths and synthesis read across *all* the knowledge you chose to bring into Hyperself, including personal entries, because processing happens on your device. The personal/shareable tag governs what may *leave* the device, below — not what local features may use.

## Augmented Paths (optional, online)

For deeper reasoning about how you learn, research, and work, a Path can be augmented by Meta's Muse Spark online model (Meta Model API). This is optional, paid-tier by design, and off until you use it.

Hyperself first builds a derived pattern profile: confirmed archetype labels, skill counts from the platform lexicon, and reading/research pattern labels. It never includes entries, names, dates, or text. You preview the exact payload, approve it for that one destination (the provider endpoint allowlist is enforced), and supply your own provider key, held for the session only. Revoke consent and forget the key at any time from the Path. The profile describes your patterns; it is minimized, not anonymous — the consent sheet says so before anything is sent.

## Privacy: two tags govern everything

Every entry is `personal` or `shareable`. Personal entries never leave the device — not for synthesis, not in packs, not anywhere. Sensitive kinds (health, finance, journal, relationship, and document entries) can never be made shareable at all. Shareable entries are the only ones that can enter an exported knowledge pack; packs are hash-verified on import, and pack questions are answered on-device from pack entries alone.

Your whole archive, personal entries included, can be exported as one encrypted backup protected by its own backup passphrase — separate from your vault PIN, so a lost PIN or a new device does not lose your archive — and restored wholesale on any install.

The vault itself is AES-GCM encrypted storage unlocked by PIN, with optional biometric unlock (WebAuthn PRF) that genuinely unwraps the key. A forgotten PIN without biometrics is unrecoverable by design.

## Local models

Synthesis drafts come from a model served on this device, over an OpenAI-compatible localhost endpoint (Ollama, llama.cpp, or vLLM). A light tier (llama3.2:3b, about 2 GB) suits laptops and smaller machines; a deep tier (Muse Glimmer 30B, Meta's open-weight model) needs roughly 24 GB or more of RAM. The app auto-connects when the server appears; choose endpoint and model in Settings (sidebar, bottom), and Synthesis shows which model is active. With no server running, drafts fall back to templated local synthesis and every other feature works regardless. Embeddings come from Meta Llama (llama3.2:3b) on that same local server, transcription runs Meta's wav2vec 2.0 in-browser, and image OCR runs through Muse Glimmer on the local server. Every model Hyperself calls at runtime is a Meta model: non-Meta model names are refused by the engine allowlist, and Augmented Paths accept only the Meta Model API.

## Legacy

Keep several knowledge packs, each with its own settings — name, author, version, and curation. Curate a pack to only your expertise: findings, methods, research, and skill-evidenced entries (anything linked to a skill you have evidenced). Or include every shareable entry. Pin the packs you maintain and they appear as tabs in Legacy, exactly like pinned Paths. Exporting rebuilds the pack file from your current entries with the same settings, and the card remembers when it was last exported and with how many entries — so updating a pack you have shared is one click. Packs are hash-verified snapshots of shareable entries only; personal entries can never enter one. Import packs from others, and ask questions answered on-device from pack entries alone.

## Language

The interface is available in English and Spanish, switchable in Settings. Your entries are never translated or sent anywhere for translation, and synthesis prompts stay in English for now.

## Demo personas

Maya, Daniel, and Rosa are fictional people with 20-year non-linear arcs and 26–29-person networks, built to show what synthesis looks like over decades of data. Load them from the demo controls (gear, bottom-right, or Ctrl/Cmd+Shift+D). See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the rehearsed walkthrough.

## Honest limits

- Account connections are simulated; real integrations are future work, each gated by a Security review.
- Legacy `.doc`/`.xls` and EPUB files are not parsed; every other common export format is, with an explicit reason when something is refused.
- A locally served model will trail frontier cloud models on raw reasoning. Quality is gated by golden evals ([EVALS.md](EVALS.md)): what a synthesis must mention, and what it must never reveal.
