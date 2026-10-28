// Network graph data: the user at the center, people around them.
// Edges: user->person weighted by mentions; person<->person weighted by
// entries that mention them together. Pure functions — D3 renders this.
import type { Entry } from './types';

export const CENTER_ID = '__you';

export interface NetworkNode {
  id: string;
  label: string;
  count: number;
  center?: boolean;
}

export interface NetworkLink {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  links: NetworkLink[];
}

export function buildNetwork(entries: Entry[], centerLabel: string): NetworkGraph {
  const live = entries.filter((e) => e.deleted_at === null);
  const counts = new Map<string, number>();
  const shared = new Map<string, number>();
  for (const e of live) {
    const people = [...new Set(e.people ?? [])];
    for (const name of people) counts.set(name, (counts.get(name) ?? 0) + 1);
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const key = [people[i], people[j]].sort().join('\u0000');
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }
  const nodes: NetworkNode[] = [
    { id: CENTER_ID, label: centerLabel, count: live.length, center: true },
    ...[...counts.entries()]
      .map(([name, count]) => ({ id: name, label: name, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  ];
  const links: NetworkLink[] = nodes
    .slice(1)
    .map((node) => ({ source: CENTER_ID, target: node.id, weight: node.count }));
  for (const [key, weight] of shared.entries()) {
    const [source, target] = key.split('\u0000');
    links.push({ source, target, weight });
  }
  return { nodes, links };
}

export interface TimelineMoment {
  at: string;
  title: string;
  type: string;
  people: string[];
  /** Key moments involve other people or mark a life turning point. */
  key: boolean;
}

export interface PersonContext {
  name: string;
  entryCount: number;
  types: string[];
  firstSeen: string;
  lastSeen: string;
  connectedTo: Array<{ name: string; shared: number }>;
  entries: Array<{ title: string; type: string; at: string }>;
  timeline: TimelineMoment[];
}

export function personContext(entries: Entry[], name: string): PersonContext {
  const mine = entries
    .filter((e) => e.deleted_at === null && (e.people ?? []).includes(name))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const sharedCounts = new Map<string, number>();
  for (const e of mine) {
    for (const other of e.people ?? []) {
      if (other !== name) sharedCounts.set(other, (sharedCounts.get(other) ?? 0) + 1);
    }
  }
  const dates = mine.map((e) => e.updated_at.slice(0, 10)).sort();
  return {
    name,
    entryCount: mine.length,
    types: [...new Set(mine.map((e) => e.type))],
    firstSeen: dates[0] ?? '',
    lastSeen: dates[dates.length - 1] ?? '',
    connectedTo: [...sharedCounts.entries()]
      .map(([n, shared]) => ({ name: n, shared }))
      .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name)),
    entries: mine.slice(0, 8).map((e) => ({
      title: e.title,
      type: e.type,
      at: e.updated_at.slice(0, 10),
    })),
    timeline: [...mine]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      .map((e) => ({
        at: e.created_at.slice(0, 10),
        title: e.title,
        type: e.type,
        people: (e.people ?? []).filter((p) => p !== name),
        key:
          (e.people ?? []).length > 1 ||
          e.type === 'relationship' ||
          e.type === 'goal-note',
      })),
  };
}
