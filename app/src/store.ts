// Local persistence + tag enforcement. localStorage for the scaffold;
// upgrade path is OPFS/SQLite + Web Crypto (see docs/DATA_MODEL.md).
//
// Prototype pivot: no manual journaling. createEntry serves ingestion paths
// (uploads, simulated connections, persona loader); the Library curates.
import { dropVector } from './embeddings';
import type {
  BudgetRecord,
  CheckIn,
  Entry,
  EntrySource,
  EntryType,
  Goal,
  GoalStatus,
  PackEntryPayload,
  Skill,
  SkillLevel,
  Tag,
} from './types';
import { NON_SHAREABLE_TYPES } from './types';

const KEY = 'hyperself.v1';
const PROFILE_KEY = 'hyperself.profile.v1';

interface DB {
  entries: Entry[];
  goals: Goal[];
  checkins: CheckIn[];
  skills: Skill[];
  budget: BudgetRecord[];
}

export class StoreError extends Error {}

function emptyDB(): DB {
  return { entries: [], goals: [], checkins: [], skills: [], budget: [] };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      entries: (parsed.entries ?? []).map((e) => ({ ...e, people: e.people ?? [] })),
      goals: parsed.goals ?? [],
      checkins: parsed.checkins ?? [],
      skills: parsed.skills ?? [],
      budget: parsed.budget ?? [],
    };
  } catch {
    return emptyDB();
  }
}

function save(db: DB): void {
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

// --- Budget log ---

export function listBudget(): BudgetRecord[] {
  return load().budget;
}

export function pushBudget(record: BudgetRecord): void {
  const db = load();
  db.budget.push(record);
  save(db);
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
