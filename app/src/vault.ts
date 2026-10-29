// Vault: AES-GCM data key wrapped by (a) a PIN-derived key (PBKDF2) and
// (b) optionally a WebAuthn platform-authenticator PRF key (biometrics).
// The vault key encrypts the local database at rest. WebAuthn without PRF
// support cannot wrap keys, so biometric unlock honestly falls back to PIN.
const META_KEY = 'hyperself.vault.v1';

export interface VaultMeta {
  salt: string;
  wrappedByPin: string;
  wrappedByBio?: string;
  credentialId?: string;
}

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unb64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function hasVault(): boolean {
  try {
    return localStorage.getItem(META_KEY) !== null;
  } catch {
    return false;
  }
}

function readMeta(): VaultMeta {
  const raw = localStorage.getItem(META_KEY);
  if (!raw) throw new Error('No vault on this device yet.');
  return JSON.parse(raw) as VaultMeta;
}

function writeMeta(meta: VaultMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

async function pinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 210000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapKey(wrapper: CryptoKey, key: CryptoKey): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const raw = await subtle.exportKey('raw', key);
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrapper, raw);
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return b64(packed);
}

async function unwrapKey(wrapper: CryptoKey, packedB64: string): Promise<CryptoKey> {
  const packed = unb64(packedB64);
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const raw = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrapper, cipher as BufferSource);
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function createVaultKey(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** First-run setup: create the vault key and wrap it with the user's PIN. */
export async function setupVault(pin: string): Promise<CryptoKey> {
  if (pin.trim().length < 4) throw new Error('PIN must be at least 4 characters.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await createVaultKey();
  const wrapper = await pinKey(pin, salt);
  writeMeta({ salt: b64(salt), wrappedByPin: await wrapKey(wrapper, key) });
  return key;
}

export async function unlockWithPin(pin: string): Promise<CryptoKey> {
  const meta = readMeta();
  const wrapper = await pinKey(pin, unb64(meta.salt));
  try {
    return await unwrapKey(wrapper, meta.wrappedByPin);
  } catch {
    throw new Error('Incorrect PIN.');
  }
}

export function biometricAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials
  );
}

interface PrfResults {
  prf?: { results?: { first?: ArrayBuffer } };
}

/** Enroll platform biometrics (WebAuthn PRF) as an alternative unlock. */
export async function enrollBiometric(vaultKey: CryptoKey): Promise<void> {
  if (!biometricAvailable()) throw new Error('Biometric unlock is not available on this device/browser.');
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as BufferSource,
      rp: { name: 'Hyperself' },
      user: {
        id: globalThis.crypto.getRandomValues(new Uint8Array(16)) as BufferSource,
        name: 'hyperself-user',
        displayName: 'Hyperself user',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      extensions: { prf: { eval: { first: te.encode('hyperself-vault') as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Biometric enrollment was cancelled.');
  const results = cred.getClientExtensionResults() as PrfResults;
  const prfBytes = results.prf?.results?.first;
  if (!prfBytes) {
    throw new Error('This authenticator cannot wrap keys (no PRF support). PIN unlock still works.');
  }
  const wrapper = await subtle.importKey('raw', prfBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]).catch(async () => {
    // PRF output may not be a valid raw AES key length on some platforms; hash it.
    const digest = await subtle.digest('SHA-256', prfBytes);
    return subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });
  const meta = readMeta();
  meta.wrappedByBio = await wrapKey(wrapper, vaultKey);
  meta.credentialId = b64(new Uint8Array(cred.rawId));
  writeMeta(meta);
}

export async function unlockWithBiometric(): Promise<CryptoKey> {
  const meta = readMeta();
  if (!meta.credentialId || !meta.wrappedByBio) {
    throw new Error('Biometric unlock is not enrolled. Use your PIN.');
  }
  if (!biometricAvailable()) throw new Error('Biometrics unavailable here. Use your PIN.');
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      allowCredentials: [{ type: 'public-key', id: unb64(meta.credentialId) as BufferSource }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: te.encode('hyperself-vault') as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Biometric unlock was cancelled.');
  const results = assertion.getClientExtensionResults() as PrfResults;
  const prfBytes = results.prf?.results?.first;
  if (!prfBytes) throw new Error('Biometric key unavailable (no PRF). Use your PIN.');
  let wrapper: CryptoKey;
  try {
    wrapper = await subtle.importKey('raw', prfBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  } catch {
    const digest = await subtle.digest('SHA-256', prfBytes);
    wrapper = await subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  try {
    return await unwrapKey(wrapper, meta.wrappedByBio);
  } catch {
    throw new Error('Biometric unlock failed. Use your PIN.');
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    te.encode(JSON.stringify(value)),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return b64(packed);
}

export async function decryptJson<T>(key: CryptoKey, packedB64: string): Promise<T> {
  const packed = unb64(packedB64);
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
  return JSON.parse(td.decode(plain)) as T;
}
