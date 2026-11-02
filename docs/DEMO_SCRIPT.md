# Demo Script & Airplane-Mode Rehearsal (Demo Week — Day 7)

Status: scope frozen. Anything not in this script goes to BACKLOG.md.

## The story (one sentence)

"I install Hyperself, unlock it with my fingerprint, drop in a bank statement — offline, on a plane — and it becomes a Budgeting Path that shows me my money clearly. Nothing left my device."

## Timed script (~4 minutes)

### Beat 0 — Install (20s, can be pre-done)
- Show the installed PWA icon. Say: "Hyperself is a downloadable web app. It installs like a native app, and everything I'm about to show works with the network completely off."
- Turn on **airplane mode** live. The header shows **"Offline · on-device"**.

### Beat 1 — Unlock (30s)
- Open the app → vault lock screen. Unlock with biometrics (fallback line if it hesitates: "And where biometrics aren't available, a PIN unwraps the same vault — let me show you" → PIN unlock).
- Talking point: "My data is encrypted at rest with AES-GCM. The key never leaves this device, and there's no account, no server, nothing to breach. Forget the PIN with no biometrics enrolled and even I can't get in — that's the point."

### Beat 2 — Knowledge in (40s)
- Load a persona from demo controls (Maya) for the Synthesis/Network colour, OR go straight to the statement if time is tight. Preferred order for the money story: statement first.
- Import & Connect → **Upload documents** → pick `demo/demo-statement.csv`.
- Pause on the **parse-review step**: "It found 18 of 18 transactions, categorized them, and would have told me honestly if some rows failed. Nothing imported until I confirm."

### Beat 3 — Ask → Path (60s)
- Confirm import. In the header search, ask: **"where does my money go?"**
- Show results, click **Save as Path**. Say: "An ask isn't a one-off answer anymore. It becomes a persistent Path, pinned here, that updates as I add data."
- Open **Paths → Budgeting**: spent/received/net, category bars, monthly trend, recurring costs (Rent 3×, Netflix 3×), and "What stands out" — descriptive insights only.
- Line: "Notice what it doesn't do: it never tells me what to cut. It shows me my money clearly; the decisions stay mine."

### Beat 4 — Why this is Hyperself, not a budgeting app (60s)
- Paths also shows **"Hyperself suggests: Budgeting"** was offered from the data itself (skip if already created live; point at the template card + readiness checklist: Have/Needs, no manual setup).
- Knowledgebase → **Synthesis**: profile card with archetype pills (Maya: Margin Annotator) and a two-sentence essence blurb — "who I am, what I aspire to, my potential. Not my data sources. Not my network. My essence."
- Knowledgebase → **Network**: slowly revolving graph, you at the centre; hover a name, click a person for the timeline modal + notes.
- If time: **Security** badge — an imported image with an ID document gets flagged. "Even my imports are screened locally."

### Close (20s)
- "Private by architecture, not by policy. Encrypted on my device, unlocked by my fingerprint, useful with the network off. That's Hyperself."

## Airplane-mode rehearsal checklist

Run the full script **3 times** on the exact demo build before demo day. Any failure = fix or cut that beat.

### Pre-flight (once, before rehearsals)
- [ ] `cd app && npm test` — all suites green on this machine.
- [ ] `npm run build && npm run preview` — rehearse against the **production build**, not `npm run dev`.
- [ ] Start the local model server: `OLLAMA_ORIGINS=* ollama serve` with `muse-glimmer` pulled, and warm it (`curl localhost:11434/v1/models`) so the first synthesis is not a cold start. In the app, confirm Settings (sidebar, bottom) → "Local model — on this device" reports connected; Synthesis shows the active model under the profile card.
- [ ] Load the preview URL once **online**: let the service worker install (`hyperself-v7` cache) and pre-warm the in-browser Whisper assets. The Budgeting beat itself needs no model at all; with the Glimmer server stopped, drafts honestly fall back to templated local text.
- [ ] Create the vault; enroll **both** PIN and biometrics on the demo machine/browser profile.
- [ ] Copy `demo/demo-statement.csv` somewhere one click away; close unrelated tabs/apps.
- [ ] Charge + plug in; disable OS notifications/sleep.

### Each rehearsal run
- [ ] Clear workspace (demo controls) → reload → vault setup/unlock works both ways (biometric, then PIN).
- [ ] Airplane mode ON → "Offline · on-device" badge visible → full script completes with zero network.
- [ ] Statement review shows 18/18 parsed, categories + totals correct (Spent 3,007.47 · Received 7,500.00 across Jan–Mar).
- [ ] Save-as-Path → Budgeting detail renders bars, trend, recurring (Rent, Netflix), and descriptive insights with no prescriptive language.
- [ ] Load Maya → Synthesis archetypes + blurb read like a person, Network graph revolves, person modal opens.
- [ ] Lock/reload mid-demo → data persists inside the vault.

### Fallbacks (rehearse saying these)
- Biometrics stall → "PIN unwraps the same vault" → PIN unlock, keep moving.
- Model still loading → Budgeting and Paths are rule-based and unaffected; show those, return to Synthesis after.
- Browser without WebAuthn → PIN-only story; the encryption point stands.
- Total stage failure → play the backup recording (record one clean rehearsal on Day 7), narrate live over it.

## Freeze rules
- No new features after this doc. Bug-fixes only, each followed by one full rehearsal run.
- Bump `CACHE_VERSION` in `app/public/sw.js` for any build change after pre-warming, or the demo machine will serve the old shell.
