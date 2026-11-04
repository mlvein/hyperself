# Hyperself — 3-Minute Demo Script (DRAFT)

Status: draft for review. The rehearsed 4-minute version remains in [DEMO_SCRIPT.md](DEMO_SCRIPT.md) until this cut passes 3 full rehearsals.
Target: 180 seconds wall-clock, ~230 spoken words — the rest is clicks, loads, and pauses where the screen does the talking. One story only: **offline statement → private Path → a lifetime understood.**

## Before you walk on (not timed)

- Production build (`npm run build && npm run preview`), not `npm run dev`.
- Load the preview once **online**: let the service worker install (`hyperself-v19`), load Maya once so `personas/maya.json` is cached, and pre-warm Whisper assets.
- Vault created on this browser profile, PIN + biometrics both enrolled.
- `demo/demo-statement.csv` one click away. Notifications and sleep off. Backup recording playing-ready.

---

### Beat 1 — The promise (0:00–0:20)

**On screen:** Installed PWA icon. Open Hyperself, turn **airplane mode on live**. The sidebar shows **Offline · on-device**.

> "This is Hyperself — your life's archive, understood privately. Everything you're about to see works with the network completely off. Nothing I show you leaves this device."

### Beat 2 — Unlock (0:20–0:45)

**On screen:** Vault lock screen → unlock with fingerprint.

> "My archive is encrypted on this device, and my fingerprint unwraps it. There's no account and no server holding my data. So there's nothing to breach."

*Fallback, say it while doing it:* "And where biometrics aren't available, a PIN unwraps the same vault."

### Beat 3 — Knowledge in (0:45–1:20)

**On screen:** Import & Connect → **Upload documents** → pick `demo/demo-statement.csv`. Land on the **parse-review step** and pause.

> "On a plane, I drop in a bank statement. Hyperself reads it right here: eighteen of eighteen transactions, categorised — and if a row had failed, it would tell me honestly. Nothing imports until I confirm."

**On screen:** Click **Confirm import**.

### Beat 4 — Ask becomes a Path (1:20–2:00)

**On screen:** In the search bar ask **"where does my money go?"**, then click **Save as Path**. Open **Paths → Budgeting**: totals, category bars, monthly trend, recurring costs (Rent 3×, Netflix 3×), "What stands out."

> "An ask isn't a one-off answer. It becomes a Path — a living view that updates as I add data. Spent, received, what's recurring, what stands out. And notice what it never does: it never tells me what to cut. It shows me my money clearly. The decisions stay mine."

### Beat 5 — A lifetime, understood (2:00–2:40)

**On screen:** Load **Maya** from demo controls (Ctrl/Cmd+Shift+D) → **Synthesis**, then **Network**.

> "That's one statement. Now imagine twenty-eight years of it. This is Maya — a lifetime of documents, journals and records, all on-device. Hyperself sees who she has been, who she is, and the paths to what's next. This graph is her people, with her at the centre. Every one of these entries is tagged: personal never leaves this device — only what she chooses to share ever can."

**On screen:** Hover a person, click centre circle briefly if it lands cleanly. Do not open drawers you cannot close in 5 seconds.

### Close (2:40–3:00)

**On screen:** Return to the sidebar. **Offline · on-device** badge visible.

> "Private by architecture, not by policy. Encrypted on my device, unlocked by my fingerprint, useful with the network off. That's Hyperself."

Stop. Do not add a roadmap slide to the spoken close; hold it for Q&A.

---

## What was cut from the 4-minute version, and why

| Cut | Why it survives the cut |
|---|---|
| Install beat as its own step | Folded into Beat 1; the icon is shown, not explained |
| Synthesis archetype deep-dive | One line in Beat 5; archetype pills stay visible on screen |
| Legacy pack export/import | One clause in Beat 5 ("only what she chooses to share"); demo it in Q&A |
| Security-scan beat | Dropped; keep as Q&A backup if a judge asks about imports |
| Suggested Paths / Templates | Dropped; Budgeting carries the Paths story alone |

## Fallbacks (rehearse out loud)

- **Biometrics stall** → PIN line above, keep moving. The encryption point stands.
- **Local model cold or absent** → say nothing. Budgeting and Paths are rule-based; Synthesis falling back to templated local text is still on-device and still true.
- **Maya not cached offline** → skip Beat 5's load, narrate over the Budgeting Path and close 20 seconds early. Never troubleshoot on stage.
- **Total stage failure** → switch to the backup recording and narrate over it.

## Rehearsal gate

Run this exact cut 3 times on the exact demo build. Any failure = fix or cut that beat, then restart the count. See the airplane-mode checklist in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
