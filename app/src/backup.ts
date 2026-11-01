// Personal backup: the whole knowledgebase in one encrypted file the user
// holds. Encryption uses a backup passphrase chosen at export — deliberately
// independent of the vault PIN, so a lost PIN or a new device does not mean
// a lost archive. The file contains only AES-GCM ciphertext; a wrong
// passphrase fails closed. Restore replaces the current database wholesale.
import { exportDatabase, getProfile, importDatabase, setProfile, StoreError } from './store';
import { decryptJson, encryptJson } from './vault';

export const BACKUP_KIND = 'hyperself-backup';
export const BACKUP_VERSION = 1;
export const MIN_PASSPHRASE_LENGTH = 8;

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unb64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function backupKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 210000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  created_at: string;
  salt: string;
  sealed: string;
}

interface BackupPayload {
  db: unknown;
  profile: { name: string } | null;
}

export async function createBackup(passphrase: string): Promise<{ filename: string; text: string }> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new StoreError(`Backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await backupKey(passphrase, salt);
  const payload: BackupPayload = { db: exportDatabase(), profile: getProfile() };
  const sealed = await encryptJson(key, payload);
  const file: BackupFile = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    salt: b64(salt),
    sealed,
  };
  const stamp = file.created_at.slice(0, 10).replace(/-/g, '');
  return { filename: `hyperself-backup-${stamp}.json`, text: JSON.stringify(file, null, 2) };
}

export function parseBackupFile(text: string): BackupFile {
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(text) as Partial<BackupFile>;
  } catch {
    throw new StoreError('That file is not a Hyperself backup (invalid JSON).');
  }
  if (parsed.kind !== BACKUP_KIND || typeof parsed.sealed !== 'string' || typeof parsed.salt !== 'string') {
    throw new StoreError('That file is not a Hyperself backup.');
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new StoreError(`Unsupported backup version: ${String(parsed.version)}.`);
  }
  return parsed as BackupFile;
}

export async function restoreBackup(text: string, passphrase: string): Promise<{ entries: number }> {
  const file = parseBackupFile(text);
  const key = await backupKey(passphrase, unb64(file.salt));
  let payload: BackupPayload;
  try {
    payload = await decryptJson<BackupPayload>(key, file.sealed);
  } catch {
    throw new StoreError('Wrong passphrase (or the backup file is damaged). Nothing was restored.');
  }
  importDatabase(payload.db);
  if (payload.profile?.name) setProfile(payload.profile.name);
  const entries = Array.isArray((payload.db as { entries?: unknown[] }).entries)
    ? (payload.db as { entries: unknown[] }).entries.length
    : 0;
  return { entries };
}
