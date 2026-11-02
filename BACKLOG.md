# Roadmap & backlog

Where Hyperself is headed, what is intentionally out of scope, and the known limitations we are transparent about. New ideas land here first and are prioritized by the Project Manager role (see [AGENTS.md](AGENTS.md)).

## Recently shipped

- **PDF bank statements** — statement-like PDFs route through the same review-then-import flow as CSV; other PDFs still ingest as documents.
- **Health Path** — descriptive trends from your own health records, never medical advice. Health entries are always personal.
- **Sidebar navigation with Settings** — main menu in a sidebar, subsections in a strip at the top of each view, and Settings (local model, privacy, language) at the sidebar bottom.
- **Per-view search** — one search bar at the top of every main view, including centered over the Network graph.
- **Multi-language interface** — English and Spanish UI, switchable in Settings. Your entries are never translated or sent anywhere.

## Planned

- **More Path templates** — added one at a time, each with a real fixture proving it works before it ships.
- **Native packaging** — the installable web app comes first; a desktop wrapper (Tauri/Electron) would add deeper filesystem integration, larger storage quotas, and OS keychain support.
- **Real account connections** — connections in the current release are simulated and labeled as such. Each real integration goes through a Security review before any data moves.

## Known limitations

We would rather name these than oversell:

- **Setup for deep synthesis** — the optional deep local model needs a local model server installed separately (Ollama plus a one-time model download). The native wrapper above is the planned fix: a first-launch download with progress, no terminal required.
- **Simulated integrations** — until real connections pass Security review, the in-app export guides show you how to download your own data from each service and import it instead. Nothing about that path sends data anywhere.
- **Local model capability** — a locally served model will trail frontier cloud models on raw reasoning. Hyperself's answer is to stay grounded, cited, and private, with quality gated by the golden evals in [docs/EVALS.md](docs/EVALS.md) — never by quietly sending personal data to a cloud model.
- **Single-device archive** — there is no multi-device sync yet; the encrypted backup/restore is the bridge. Any future sync design must preserve the personal/shareable tag boundary end to end, and that is a Security decision before it is an engineering one.

## Verification in progress

- **WebAuthn biometric unlock** — implemented; being verified on real devices and browsers (secure context plus platform authenticator). The PIN path is the supported fallback.

## Out of scope by design

These are decisions, not gaps:

- **Prescriptive financial or health advice** — Hyperself describes what your data shows; it does not tell you what to do with your money or your health.
- **Therapy or counseling surfaces** — Hyperself synthesizes your knowledge; it is not a therapist. See [docs/PSYCHOLOGY.md](docs/PSYCHOLOGY.md).
- **Cloud processing of personal entries** — personal data is synthesized on your device. The optional Augmented Paths feature works only on a derived, user-approved pattern profile, never on entries.
