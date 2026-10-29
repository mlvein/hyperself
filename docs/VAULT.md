# Vault & Unlock (Demo Week — Day 1)

Status: implemented. Goal: sensitive documents (bank statements, health results) can only be trusted to Hyperself if storage is encrypted at rest and unlock feels native.

## Design

- **Data key:** random AES-GCM 256 key generated on device (`app/src/vault.ts`). The local database is stored as sealed JSON under `hyperself.db.v1`; first activation migrates legacy plaintext data, seals it, then deletes the plaintext copy.
- **PIN unlock (always available):** PIN → PBKDF2 (210k iterations, SHA-256) → wrapping key → unwraps the data key. Wrong PIN fails closed ("Incorrect PIN."). Minimum 4 characters.
- **Biometric unlock (progressive):** WebAuthn platform authenticator with the PRF extension. The PRF output wraps the data key, so the fingerprint/Face ID genuinely unwraps the vault — it is not just a UI gate. Authenticators without PRF support get an honest message and keep PIN unlock.
- **Gate:** the app renders no user data until unlock. Setup flow: create PIN → optional "Enable biometrics" → continue.

## Demo notes & limits

- WebAuthn requires a secure context (localhost or HTTPS) and a platform authenticator; rehearse the PIN path as fallback on the demo machine.
- Forgotten PIN + no biometrics = unrecoverable vault by design; say this out loud in the demo, it is the trust story.
- Store writes encrypt asynchronously after unlock; reads come from the unlocked in-memory copy.
- Tests: `tests/vault.test.cjs` covers PIN wrap/unwrap, ciphertext opacity, wrong-PIN failure. The WebAuthn ceremony itself needs a real browser + authenticator to verify.
