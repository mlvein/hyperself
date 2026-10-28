# Public GitHub Repo Setup

## Warning: current git state

`hyperself/` currently sits inside a parent repo (`Desktop/Github/` with remote `ingrained-creature-trainer.git`) that contains many unrelated projects. Do NOT publish that. Hyperself needs its own fresh repo.

## Steps

1. **Create the repo (public, empty):**
   `gh repo create hyperself --public --description "Local-first personal AI for holistic growth" --clone`
   (or create `mlvein/hyperself` on github.com without README/license, then clone it).
2. **Copy this folder's contents** (`hyperself.txt`, `README.md`, `docs/`, `AGENTS.md`, `app/`, `.gitignore`, `LICENSE`) into the fresh clone — not the `.git` from the parent, just the files.
3. **Verify hygiene files:** root `LICENSE` (MIT) and `.gitignore` (OS + secrets + `*.pte` weights), plus `app/.gitignore` (`node_modules/`, `dist/`, `.test-compiled/`). Confirm no journals, API keys, or personal data are staged (`git status`, review every file). Note: `app/src/connections.ts` contains a `[REDACTED]` placeholder token in a fictional seed fixture — safe, not a real secret.
4. **First commit:** `git add -A && git commit -m "docs: consolidated vision, audit, MVP plan, agents" && git push -u origin main`.
5. **Repo settings (github.com):** About section + topics (`llama`, `executorch`, `on-device-ai`, `hackathon`); branch protection on `main` (require PR + security-agent review note); enable Issues with labels `scope`, `security`, `demo`, `stretch`.
6. **Hackathon extras:** `BACKLOG.md` for post-freeze ideas, `demo/` folder for the script + video, and a `CREDITS.md` noting Meta Model API usage if rules require disclosure.

## Privacy check before every push

This project handles personal data by design — the repo must never contain real journals, health/finance entries, API keys, `*.pte` weights, or exported Legacy packs with real content. Use fixtures only.
