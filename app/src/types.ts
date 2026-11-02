// Canonical domain types. Mirrors docs/DATA_MODEL.md (Draft v0.1).

export type Tag = 'personal' | 'shareable';

export type EntryType =
  | 'journal'
  | 'goal-note'
  | 'skill'
  | 'health'
  | 'finance'
  | 'relationship'
  | 'finding'
  | 'method'
  | 'research'
  | 'document';

/** Types that can never be tagged shareable in MVP. Friction is intentional. */
export const NON_SHAREABLE_TYPES: readonly EntryType[] = [
  'journal',
  'health',
  'finance',
  'relationship',
  'document',
];

export interface TagEvent {
  tag: Tag;
  at: string;
  actor: 'user' | 'import';
}

export type EntrySource = 'typed' | 'check-in' | 'import' | 'upload' | 'connection';

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  body: string;
  tag: Tag;
  tag_history: TagEvent[];
  goal_ids: string[];
  skill_ids: string[];
  people: string[];
  source: EntrySource;
  source_pack?: string;
  source_label?: string;
  /** Content hash for import dedupe/sync (set by ingestion only). */
  source_hash?: string;
  /** User-declared provenance: mine (default), shared with me, or reference. Reference never feeds essence/archetypes. */
  ownership?: OwnershipKind;
  embedding_status: 'pending' | 'indexed' | 'stale';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type OwnershipKind = 'mine' | 'shared' | 'reference';

export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  description: string;
  tag: Tag;
  tag_history: TagEvent[];
  status: GoalStatus;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export type CheckInProgress = 'behind' | 'steady' | 'ahead';

export interface CheckIn {
  id: string;
  goal_id: string;
  at: string;
  progress: CheckInProgress;
  note_entry_id: string | null;
}

export type SkillLevel = 'learning' | 'practicing' | 'strong';

export interface Skill {
  id: string;
  name: string;
  level: SkillLevel;
  tag: Tag;
  tag_history: TagEvent[];
  created_at: string;
}

export interface SavedPath {
  id: string;
  name: string;
  query: string;
  templateId?: string;
  /** Archetype lens that seeded this Path, when any. */
  archetypeId?: string;
  pinned: boolean;
  created_at: string;
}

/** A user-curated knowledge pack definition (Legacy). The pack file is
 * regenerated from live entries on each export; this record is its
 * settings, so updating a pack is one click with the same curation. */
export interface KnowledgePack {
  id: string;
  name: string;
  author: string;
  version: string;
  /** True: only expertise entries (findings/methods/research/skills or
   * skill-evidenced). False: every shareable entry. */
  expertiseOnly: boolean;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  lastExportedAt: string | null;
  lastEntryCount: number | null;
}

export interface PackEntrySummary {
  entry_id: string;
  type: EntryType;
  title: string;
  sha256: string;
}

export interface PackManifest {
  pack_id: string;
  version: string;
  author_label: string;
  created_at: string;
  embedding_model: string;
  entries: PackEntrySummary[];
  entry_count: number;
}

/** Pack entry payload. No tag field: the importer assigns shareable + source import. */
export interface PackEntryPayload {
  id: string;
  type: EntryType;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface PackFile {
  manifest: PackManifest;
  entries: PackEntryPayload[];
}
