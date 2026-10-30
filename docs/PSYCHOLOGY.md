# Psychology-Informed Data Handling

Status: implemented (scoped from the pre-build audit of CosmicStack's mental-health skill and the OpenClaw psychologist skill — principles adapted as original code, no skill text copied; licenses were unclear).

## What was adopted

1. **Prompt principles** (`app/src/psych.ts` → engine + cloud system prompts): validate before perspective, describe patterns and never diagnose, "private assistant, not a therapist", no confidentiality promises beyond the device, encourage real-world support.
2. **Crisis detection** (`detectCrisisSignals`, run inside the local security scanner over every entry): explicit self-harm ideation → high finding; hopelessness language → gentle warn. Suggestions carry resources (US 988 call/text; Crisis Text Line HOME to 741741; findahelpline.org internationally). Fully local pattern-matching — distress data is never sent anywhere, and detection runs inside the existing Security/Paths finding pipeline.
3. **Archetype guardrails:** meanings stay descriptive; the profile card states "Playful patterns from your data — not labels, not diagnoses." A golden test asserts archetype copy never uses diagnostic language.

## What was deliberately not adopted

Therapeutic conversation (active-listening chat, CBT exercises) as a product surface. Hyperself synthesizes; it does not counsel. Diagnosis, treatment framing, and confidential-therapy promises are out of scope permanently.

## Tests

`tests/psych.test.cjs` (crisis high/warn, idiom false-positives, principle contents), crisis case in `tests/security.test.cjs`, must-never-diagnose in `tests/golden.test.cjs`.
