// Local persistence + tag enforcement. localStorage for the scaffold;
// upgrade path is OPFS/SQLite + Web Crypto (see docs/DATA_MODEL.md).
//
// Prototype pivot: no manual journaling. createEntry serves ingestion paths
// (uploads, simulated connections, persona loader); the Library curates.
import { dropVector } from './embeddings';
import type {
  CheckIn,
  Entry,
  EntrySource,
  EntryType,
  Goal,
  GoalStatus,
  OwnershipKind,
  PackEntryPayload,
  SavedPath,
  Skill,
  SkillLevel,
  Tag,
} from './types';
import { NON_SHAREABLE_TYPES } from './types';
import type { ArchetypePreference } from './archetypes';

const KEY = 'hyperself.v1';
const PROFILE_KEY = 'hyperself.profile.v1';
const ENCRYPTED_KEY = 'hyperself.db.v1';

// --- Vault-encrypted storage (active after unlock) ---
// Without a vault key the legacy plaintext path below is used (tests,
// pre-vault data). After activation every save is AES-GCM encrypted.
let vaultKey: CryptoKey | null = null;
let memoryDb: DB | null = null;
let persistChain: Promise<void> = Promise.resolve();

export function isVaultActive(): boolean {
  return vaultKey !== null;
}

export async function activateVault(key: CryptoKey): Promise<void> {
  const { decryptJson, encryptJson } = await import('./vault');
  vaultKey = key;
  const sealed = localStorage.getItem(ENCRYPTED_KEY);
  if (sealed) {
    memoryDb = await decryptJson<DB>(key, sealed);
    memoryDb = {
      entries: (memoryDb.entries ?? []).map((e) => ({ ...e, people: e.people ?? [] })),
      goals: memoryDb.goals ?? [],
      checkins: memoryDb.checkins ?? [],
      skills: memoryDb.skills ?? [],
      personNotes: memoryDb.personNotes ?? {},
      savedPaths: memoryDb.savedPaths ?? [],
      folderFiles: memoryDb.folderFiles ?? {},
      archetypePrefs: memoryDb.archetypePrefs ?? {},
    };
    return;
  }
  // First activation: migrate any legacy plaintext DB, then seal it.
  memoryDb = loadLegacy();
  const toSeal = memoryDb;
  persistChain = persistChain.then(async () => {
    localStorage.setItem(ENCRYPTED_KEY, await encryptJson(key, toSeal));
    localStorage.removeItem(KEY);
  });
  await persistChain;
}

export function lockVault(): void {
  vaultKey = null;
  memoryDb = null;
}

interface DB {
  entries: Entry[];
  goals: Goal[];
  checkins: CheckIn[];
  skills: Skill[];
  personNotes: Record<string, PersonNote[]>;
  savedPaths: SavedPath[];
  folderFiles: Record<string, string>;
  archetypePrefs: Record<string, ArchetypePreference>;
}

export class StoreError extends Error {}

function emptyDB(): DB {
  return { entries: [], goals: [], checkins: [], skills: [], personNotes: {}, savedPaths: [], folderFiles: {}, archetypePrefs: {} };
}

function loadLegacy(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      entries: (parsed.entries ?? []).map((e) => ({ ...e, people: e.people ?? [] })),
      goals: parsed.goals ?? [],
      checkins: parsed.checkins ?? [],
      skills: parsed.skills ?? [],
      personNotes: parsed.personNotes ?? {},
      savedPaths: parsed.savedPaths ?? [],
      folderFiles: parsed.folderFiles ?? {},
      archetypePrefs: parsed.archetypePrefs ?? {},
    };
  } catch {
    return emptyDB();
  }
}

function load(): DB {
  if (vaultKey) return memoryDb ?? emptyDB();
  return loadLegacy();
}

function save(db: DB): void {
  if (vaultKey && memoryDb !== null) {
    memoryDb = db;
    const snapshot = db;
    const key = vaultKey;
    persistChain = persistChain
      .then(async () => {
        const { encryptJson } = await import('./vault');
        localStorage.setItem(ENCRYPTED_KEY, await encryptJson(key, snapshot));
      })
      .catch(() => undefined);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(db));
}

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function assertShareableAllowed(type: EntryType, tag: Tag): void {
  if (tag === 'shareable' && (NON_SHAREABLE_TYPES as readonly string[]).includes(type)) {
    throw new StoreError(
      `Type "${type}" can never be shareable. Copy its content into a finding or method entry to share it.`,
    );
  }
}

function normalizePeople(names: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().slice(0, 80);
    if (name) seen.add(name);
  }
  return [...seen];
}

// --- Profile (get-to-know-you) ---

export interface Profile {
  name: string;
}

export function getProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Profile;
    return parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

export function setProfile(name: string): Profile {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new StoreError('Name is required.');
  const profile = { name: trimmed };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

// --- Entries ---

export function listEntries(): Entry[] {
  return load()
    .entries.filter((e) => e.deleted_at === null)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function getEntry(id: string): Entry | undefined {
  return load().entries.find((e) => e.id === id && e.deleted_at === null);
}

export function createEntry(input: {
  title: string;
  type: EntryType;
  body: string;
  tag?: Tag;
  goal_ids?: string[];
  source?: EntrySource;
  source_label?: string;
  source_hash?: string;
  ownership?: OwnershipKind;
  people?: string[];
  /** Backdate stamp. Persona loader only — lets simulated history span weeks. */
  at?: string;
}): Entry {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new StoreError('Title is required.');
  if (title.length > 140) throw new StoreError('Title must be 140 characters or less.');
  if (!body) throw new StoreError('Body is required.');
  if (body.length > 20000) throw new StoreError('Body must be 20k characters or less.');
  if (input.at !== undefined && Number.isNaN(Date.parse(input.at))) {
    throw new StoreError('Invalid timestamp.');
  }
  const tag: Tag = input.tag ?? 'personal';
  assertShareableAllowed(input.type, tag);

  const db = load();
  const stamp = input.at ?? now();
  const entry: Entry = {
    id: uid(),
    type: input.type,
    title,
    body,
    tag,
    tag_history: [{ tag, at: stamp, actor: 'user' }],
    goal_ids: input.goal_ids ?? [],
    skill_ids: [],
    source: input.source ?? 'typed',
    source_label: input.source_label,
    source_hash: input.source_hash,
    ownership: input.ownership ?? 'mine',
    people: normalizePeople(input.people ?? []),
    embedding_status: 'pending',
    created_at: stamp,
    updated_at: stamp,
    deleted_at: null,
  };
  db.entries.push(entry);
  save(db);
  return entry;
}

export function setEntryTag(id: string, tag: Tag, actor: 'user' | 'import' = 'user'): Entry {
  const db = load();
  const entry = db.entries.find((e) => e.id === id && e.deleted_at === null);
  if (!entry) throw new StoreError('Entry not found.');
  assertShareableAllowed(entry.type, tag);
  entry.tag = tag;
  entry.tag_history.push({ tag, at: now(), actor });
  entry.updated_at = now();
  save(db);
  return entry;
}

export function listEntriesByLabel(label: string): Entry[] {
  return load().entries.filter((e) => e.deleted_at === null && e.source_label === label);
}

export function deleteEntriesByLabel(label: string): number {
  const db = load();
  let count = 0;
  for (const e of db.entries) {
    if (e.deleted_at === null && e.source_label === label) {
      e.deleted_at = now();
      count += 1;
      dropVector(e.id);
    }
  }
  if (count) save(db);
  return count;
}

export function getFolderManifest(): Record<string, string> {
  return { ...load().folderFiles };
}

export function setFolderManifest(manifest: Record<string, string>): void {
  const db = load();
  db.folderFiles = { ...manifest };
  save(db);
}

export function deleteEntry(id: string): void {
  const db = load();
  const entry = db.entries.find((e) => e.id === id && e.deleted_at === null);
  if (!entry) throw new StoreError('Entry not found.');
  entry.deleted_at = now();
  save(db);
  dropVector(id);
}

export function setEmbeddingStatus(
  id: string,
  status: Entry['embedding_status'],
): Entry {
  const db = load();
  const entry = db.entries.find((e) => e.id === id && e.deleted_at === null);
  if (!entry) throw new StoreError('Entry not found.');
  entry.embedding_status = status;
  save(db);
  return entry;
}

/** Keyword fallback until in-browser embeddings land. Never used for cloud calls. */
export function searchEntries(query: string, limit = 5): Entry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored = listEntries().map((e) => {
    const title = e.title.toLowerCase();
    const body = e.body.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 3;
      if (body.includes(t)) score += 1;
    }
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.e);
}

// --- Goals ---

export function listGoals(): Goal[] {
  return load().goals.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function createGoal(input: { title: string; description?: string }): Goal {
  const title = input.title.trim();
  if (!title) throw new StoreError('Goal title is required.');
  const db = load();
  const stamp = now();
  const goal: Goal = {
    id: uid(),
    title,
    description: (input.description ?? '').trim(),
    tag: 'personal',
    tag_history: [{ tag: 'personal', at: stamp, actor: 'user' }],
    status: 'active',
    target_date: null,
    created_at: stamp,
    updated_at: stamp,
  };
  db.goals.push(goal);
  save(db);
  return goal;
}

export function setGoalStatus(id: string, status: GoalStatus): Goal {
  const db = load();
  const goal = db.goals.find((g) => g.id === id);
  if (!goal) throw new StoreError('Goal not found.');
  goal.status = status;
  goal.updated_at = now();
  save(db);
  return goal;
}

// --- Skills (read by future gap view; no manual UI in prototype) ---

export function listSkills(): Skill[] {
  return load().skills;
}

export function createSkill(input: { name: string; level: SkillLevel }): Skill {
  const name = input.name.trim();
  if (!name) throw new StoreError('Skill name is required.');
  const db = load();
  const stamp = now();
  const skill: Skill = {
    id: uid(),
    name,
    level: input.level,
    tag: 'personal',
    tag_history: [{ tag: 'personal', at: stamp, actor: 'user' }],
    created_at: stamp,
  };
  db.skills.push(skill);
  save(db);
  return skill;
}

export interface PersonNote {
  at: string;
  text: string;
}

export function listPersonNotes(name: string): PersonNote[] {
  return [...(load().personNotes[name] ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function addPersonNote(name: string, text: string): PersonNote {
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new StoreError('Note is empty.');
  const db = load();
  const note: PersonNote = { at: now(), text: clean };
  db.personNotes[name] = [...(db.personNotes[name] ?? []), note];
  save(db);
  return note;
}

// --- People (network) ---

export function addPersonToEntry(id: string, name: string): Entry {
  const db = load();
  const entry = db.entries.find((e) => e.id === id && e.deleted_at === null);
  if (!entry) throw new StoreError('Entry not found.');
  entry.people = normalizePeople([...(entry.people ?? []), name]);
  entry.updated_at = now();
  save(db);
  return entry;
}

export function removePersonFromEntry(id: string, name: string): Entry {
  const db = load();
  const entry = db.entries.find((e) => e.id === id && e.deleted_at === null);
  if (!entry) throw new StoreError('Entry not found.');
  entry.people = (entry.people ?? []).filter((p) => p !== name);
  entry.updated_at = now();
  save(db);
  return entry;
}

export interface PersonRollup {
  name: string;
  entryIds: string[];
}

export function listPeople(): PersonRollup[] {
  const byName = new Map<string, string[]>();
  for (const e of listEntries()) {
    for (const name of e.people ?? []) {
      const ids = byName.get(name) ?? [];
      ids.push(e.id);
      byName.set(name, ids);
    }
  }
  return [...byName.entries()]
    .map(([name, entryIds]) => ({ name, entryIds }))
    .sort((a, b) => b.entryIds.length - a.entryIds.length || a.name.localeCompare(b.name));
}

// --- Saved Paths (persistent, user-owned workspaces) ---

export function listSavedPaths(): SavedPath[] {
  return [...load().savedPaths].sort((a, b) =>
    a.pinned === b.pinned ? (a.created_at < b.created_at ? 1 : -1) : a.pinned ? -1 : 1,
  );
}

export function createSavedPath(input: { name: string; query: string; templateId?: string; archetypeId?: string; pinned?: boolean }): SavedPath {
  const name = input.name.trim().slice(0, 80);
  const query = input.query.trim().slice(0, 200);
  if (!name) throw new StoreError('Path name is required.');
  if (!query) throw new StoreError('Path query is required.');
  const db = load();
  const path: SavedPath = {
    id: uid(),
    name,
    query,
    templateId: input.templateId,
    archetypeId: input.archetypeId,
    pinned: input.pinned ?? true,
    created_at: now(),
  };
  db.savedPaths.push(path);
  save(db);
  return path;
}

export function deleteSavedPath(id: string): void {
  const db = load();
  db.savedPaths = db.savedPaths.filter((p) => p.id !== id);
  save(db);
}

export function setSavedPathPinned(id: string, pinned: boolean): SavedPath {
  const db = load();
  const path = db.savedPaths.find((p) => p.id === id);
  if (!path) throw new StoreError('Path not found.');
  path.pinned = pinned;
  save(db);
  return path;
}

// --- Archetype preferences (user is final authority on labels) ---

export function getArchetypePreferences(): Record<string, ArchetypePreference> {
  return { ...load().archetypePrefs };
}

export function setArchetypePreference(
  id: string,
  preference: Omit<ArchetypePreference, 'updated_at'>,
): Record<string, ArchetypePreference> {
  const cleanId = id.trim().slice(0, 80);
  if (!cleanId) throw new StoreError('Archetype id is required.');
  const db = load();
  db.archetypePrefs = {
    ...db.archetypePrefs,
    [cleanId]: {
      status: preference.status,
      customLabel: preference.customLabel?.trim().slice(0, 60) || undefined,
      updated_at: now(),
    },
  };
  save(db);
  return { ...db.archetypePrefs };
}

// --- Pack import ---

export function insertImported(payloads: PackEntryPayload[], packId: string): number {
  const db = load();
  const stamp = now();
  let count = 0;
  for (const p of payloads) {
    db.entries.push({
      id: uid(),
      type: p.type,
      title: p.title,
      body: p.body,
      tag: 'shareable',
      tag_history: [{ tag: 'shareable', at: stamp, actor: 'import' }],
      goal_ids: [],
      skill_ids: [],
      source: 'import',
      source_pack: packId,
      people: [],
      embedding_status: 'pending',
      created_at: stamp,
      updated_at: stamp,
      deleted_at: null,
    });
    count += 1;
  }
  save(db);
  return count;
}

// --- Reset ---

export function clearAll(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PROFILE_KEY);
}
