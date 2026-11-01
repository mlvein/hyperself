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

## Personal backup (user-held)

Legacy → “Personal backup” exports the whole database (personal entries included) as one JSON file whose payload is AES-GCM encrypted with a **backup passphrase** (PBKDF2, 210k iterations — `app/src/backup.ts`). The passphrase is deliberately independent of the vault PIN: a lost PIN or a new device does not lose the archive, and a lost backup passphrase loses only the backup. Restore decrypts, validates, and replaces the workspace wholesale; restored entries are marked `pending` so vectors re-index on the new device. Wrong passphrases fail closed and change nothing. Covered by `tests/backup.test.cjs` (no plaintext in file, wrong-pass no-op, restore replaces).
