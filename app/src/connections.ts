// Simulated third-party connections (prototype showcase).
// Each link yields canned entries through the real store path:
// created personal, promoted only where the seed says shareable.
// Nothing here touches a network; every label says simulated.
//
// The account scan below is the onboarding "thorough scan": it pretends to
// discover the user's available accounts on this device and reports what data
// each one can contribute. All discovery is canned and local — the value is
// the UX flow (scan → review → link), not real OS integration.
import { StoreError, createEntry, deleteEntry, listEntries, setEntryTag } from './store';
import { scanEntry } from './security';
import type { EntryType, Tag } from './types';

export interface ProviderSeed {
  type: EntryType;
  title: string;
  body: string;
  tag: Tag;
  /** People tagged on the entry at import. */
  people?: string[];
  /** Backdate stamp so simulated history spans days/weeks (search-by-date). */
  daysAgo?: number;
}

export interface Provider {
  id: string;
  name: string;
  blurb: string;
  category: string;
  /** Simulated account identifier shown in the scan (never a real account). */
  accountHint: string;
  /** Data kinds this provider can contribute (simulated). */
  dataKinds: string[];
  seeds: ProviderSeed[];
}

export const PROVIDERS: Provider[] = [
  {
    id: 'notion',
    name: 'Notion',
    blurb: 'Pages and notes (simulated)',
    category: 'Notes & docs',
    accountHint: 'maya@workspace (simulated)',
    dataKinds: ['pages', 'notes', 'tasks'],
    seeds: [
      {
        type: 'finding',
        title: 'Q3 retro: ship smaller slices',
        body: 'Teams that shipped weekly reported calmer launches than teams that shipped monthly. Slice size predicted calm better than headcount did.',
        tag: 'shareable',
        daysAgo: 21,
      },
      {
        type: 'research',
        title: 'Competitor notes: Linear vs Asana',
        body: 'Linear wins on speed and keyboard flow; Asana wins on onboarding and templates. Open question: which matters more for a team of five?',
        tag: 'personal',
        daysAgo: 12,
      },
      {
        type: 'method',
        title: 'Weekly review in 25 minutes',
        body: 'Ten minutes clearing inboxes, ten reviewing the week against goals, five writing next week down. Timer visible, phone away.',
        tag: 'shareable',
        daysAgo: 3,
      },
    ],
  },
  {
    id: 'drive',
    name: 'Google Drive',
    blurb: 'Docs and decks (simulated)',
    category: 'Notes & docs',
    accountHint: 'maya@gmail.com (simulated)',
    dataKinds: ['docs', 'decks', 'comments'],
    seeds: [
      {
        type: 'research',
        title: 'Book notes: Thinking in Systems (draft)',
        body: 'Stocks, flows, feedback loops. Key line: the purpose of a system is what it does. Draft — revisit chapter 4.',
        tag: 'personal',
        daysAgo: 30,
      },
      {
        type: 'finding',
        title: 'One question per slide',
        body: 'Every deck that landed well this year answered exactly one question per slide. Two questions on a slide meant neither got answered.',
        tag: 'shareable',
        daysAgo: 9,
      },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    blurb: 'Email threads and receipts (simulated)',
    category: 'Communication',
    accountHint: 'maya@gmail.com (simulated)',
    dataKinds: ['threads', 'receipts', 'introductions'],
    seeds: [
      {
        type: 'relationship',
        title: 'Intro: Dana Whitfield (advisor)',
        body: 'Dana Whitfield introduced over email by Marcus Chen on the thread "Intro: Maya x Dana". Dana advises career-switchers on portfolios. Reply with two time slots. Contact: dana@example.com.',
        tag: 'personal',
        people: ['Dana Whitfield'],
        daysAgo: 6,
      },
      {
        type: 'document',
        title: 'Receipt: design course enrolment',
        body: 'Order #88121 — Interaction Design foundation course, $189. Receipt emailed October. Password for the course portal is still the temporary one: password: Temp-4821-reset — change it before sharing anything.',
        tag: 'personal',
        daysAgo: 14,
      },
      {
        type: 'finding',
        title: 'Email triage that sticks',
        body: 'Archive-first inbox: if a thread needs no reply in 48h it gets archived, not starred. Stars are only for threads with a promised date.',
        tag: 'shareable',
        daysAgo: 2,
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    blurb: 'Team chat and threads (simulated)',
    category: 'Communication',
    accountHint: '@maya · design-friends (simulated)',
    dataKinds: ['messages', 'threads', 'shared links'],
    seeds: [
      {
        type: 'journal',
        title: 'Design-friends: portfolio crit night',
        body: 'Thursday crit with Ana Reyes and Tom Becker — brought the checkout case study. Ana flagged spacing rhythm on mobile; Tom suggested cutting the second exploration. Next crit in two weeks.',
        tag: 'personal',
        people: ['Ana Reyes', 'Tom Becker'],
        daysAgo: 4,
      },
      {
        type: 'document',
        title: 'Pinned: deploy webhook (rotate me)',
        body: 'Someone pasted the staging deploy hook in #general again: xoxb-190312-FAKE-TOKEN-DO-NOT-USE. Do not share this. Rotate it and delete the message.',
        tag: 'personal',
        daysAgo: 11,
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'Repos, PRs, and gists (simulated)',
    category: 'Work & code',
    accountHint: '@maya-builds (simulated)',
    dataKinds: ['repos', 'PRs', 'gists', 'issues'],
    seeds: [
      {
        type: 'research',
        title: 'Portfolio site: build notes',
        body: 'Eleventy + plain CSS, deploys from main. Learned: image shortcodes beat manual srcset; keep the case-study layout to one column under 720px.',
        tag: 'personal',
        daysAgo: 8,
      },
      {
        type: 'document',
        title: 'Gist: deploy script (contains secret)',
        body: 'Draft deploy script with a hardcoded token still in it: ghp_FAKESECRET1234567890abcdef — committed by accident. Rotate the token, purge history, never share this file.',
        tag: 'personal',
        daysAgo: 16,
      },
      {
        type: 'method',
        title: 'PR self-review checklist',
        body: 'Before requesting review: diff-read top to bottom, run the demo path once, delete dead code, and rewrite the PR title as the decision it makes.',
        tag: 'shareable',
        daysAgo: 5,
      },
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    blurb: 'Network and conversations (simulated)',
    category: 'Network',
    accountHint: 'Maya R. · 480 connections (simulated)',
    dataKinds: ['connections', 'messages', 'posts'],
    seeds: [
      {
        type: 'relationship',
        title: 'Elena Marsh — hiring manager',
        body: 'Elena Marsh hires product designers at Northwind. Connected after the portfolio review night; she likes decision-story case studies. Follow up when draft one is ready. Reach: elena@example.com, 415-555-0188.',
        tag: 'personal',
        people: ['Elena Marsh'],
        daysAgo: 7,
      },
      {
        type: 'finding',
        title: 'Posts that earned replies',
        body: 'Two posts earned real conversations: the teardown checklist and the auto-layout notes. Both were specific, short, and ended with one question.',
        tag: 'shareable',
        daysAgo: 1,
      },
    ],
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    blurb: 'Posts and bookmarks (simulated)',
    category: 'Network',
    accountHint: '@maya_notes (simulated)',
    dataKinds: ['posts', 'bookmarks', 'follows'],
    seeds: [
      {
        type: 'research',
        title: 'Bookmark: empty-state patterns thread',
        body: 'Thread by @uxthreads: empty states should teach the next action, not apologize for the void. Saved 6 examples for the case study.',
        tag: 'personal',
        people: ['Tom Becker'],
        daysAgo: 10,
      },
      {
        type: 'finding',
        title: 'Shipping notes in public',
        body: 'Posting one teardown a week doubled profile visits and brought two mentor intros. Public notes compound; drafts do not.',
        tag: 'shareable',
        daysAgo: 13,
      },
    ],
  },
  {
    id: 'health',
    name: 'Apple Health',
    blurb: 'Activity and sleep (simulated)',
    category: 'Health & finance',
    accountHint: 'This iPhone (simulated)',
    dataKinds: ['steps', 'sleep', 'workouts'],
    seeds: [
      {
        type: 'health',
        title: 'October activity summary',
        body: 'Averaged 6,400 steps a day. Best week had three morning walks; worst week had none. Mornings are the lever.',
        tag: 'personal',
        daysAgo: 2,
      },
      {
        type: 'health',
        title: 'Sleep notes',
        body: 'Six weeks averaging 6h40m. Late screens correlate with the worst nights. Experiment: charger stays in the kitchen.',
        tag: 'personal',
        daysAgo: 15,
      },
    ],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Events and focus time (simulated)',
    category: 'Schedule',
    accountHint: 'maya@gmail.com calendar (simulated)',
    dataKinds: ['events', 'attendees', 'focus blocks'],
    seeds: [
      {
        type: 'goal-note',
        title: 'Meeting load vs maker time',
        body: 'Fourteen hours of meetings last week, nine of them without an agenda. Protecting Wednesday as a no-meeting day starting now.',
        tag: 'personal',
        daysAgo: 6,
      },
      {
        type: 'finding',
        title: 'No-meeting Wednesdays doubled deep work',
        body: 'Three Wednesdays in: shipped more in those three days than in the other twelve combined. The bar for breaking the rule is now very high.',
        tag: 'shareable',
        daysAgo: 20,
      },
      {
        type: 'journal',
        title: 'Coffee with Priya — portfolio review',
        body: 'Met Priya Nair downtown to walk through the case-study draft. Her verdict: lead with the constraint, cut the second exploration, name the tradeoff. Next coffee in two weeks.',
        tag: 'personal',
        people: ['Priya Nair'],
        daysAgo: 4,
      },
      {
        type: 'journal',
        title: 'School pickup + dentist run',
        body: 'Picked up Sofia Hale at 3pm, dentist at 4 — no cavities, next cleaning in six months. Leo Hale stayed with Nora Hale. Note: winter pickup moves to the north gate from December.',
        tag: 'personal',
        people: ['Sofia Hale', 'Leo Hale', 'Nora Hale'],
        daysAgo: 1,
      },
      {
        type: 'journal',
        title: "Dad's cardiology appointment",
        body: 'Drove Robert Hale to the cardiology follow-up. Blood pressure stable, one dosage lowered. Next visit in three months; bring the updated medication list.',
        tag: 'personal',
        people: ['Robert Hale'],
        daysAgo: 9,
      },
      {
        type: 'document',
        title: 'Estate lawyer consult notes',
        body: 'First consult with Harper & Cole for Nora and Robert Hale: will review existing wills, set up powers of attorney, list all accounts. Homework: gather statements before the November follow-up.',
        tag: 'personal',
        people: ['Nora Hale', 'Robert Hale'],
        daysAgo: 33,
      },
    ],
  },
  {
    id: 'family',
    name: 'Family',
    blurb: 'Kids, school, and elder care (simulated)',
    category: 'Family & care',
    accountHint: 'Hale household (simulated)',
    dataKinds: ['school', 'appointments', 'care logs', 'estate docs'],
    seeds: [
      {
        type: 'relationship',
        title: 'Sofia Hale — Lincoln Elementary, 3rd grade',
        body: 'Teacher: Ms. Okafor. Pickup list: me, Nora Hale, Tom Becker (backup). School office: 415-555-0147. Winter concert December 12 — arrival by 6pm.',
        tag: 'personal',
        people: ['Sofia Hale'],
        daysAgo: 18,
      },
      {
        type: 'document',
        title: 'School forms due Friday',
        body: 'Permission slip for the science museum trip, updated allergy form, lunch balance $24.50. Forms are in the backpack folder; sign and return by Friday.',
        tag: 'personal',
        people: ['Sofia Hale', 'Leo Hale'],
        daysAgo: 2,
      },
      {
        type: 'relationship',
        title: 'Leo Hale — preschool + swim',
        body: 'Leo Hale, 4. Preschool Tue/Thu mornings; swim lessons Saturdays at the Y. Loves the blue goggles, hates the cold pool. Next milestone: parent observation day.',
        tag: 'personal',
        people: ['Leo Hale'],
        daysAgo: 12,
      },
      {
        type: 'health',
        title: "Mom's medication list",
        body: 'Nora Hale current list (verified with pharmacist): morning blood-pressure pill, evening vitamin D, weekly pill box filled Sundays. Keep this list with the insurance card.',
        tag: 'personal',
        people: ['Nora Hale'],
        daysAgo: 7,
      },
      {
        type: 'journal',
        title: 'Caretaker log: appointments week',
        body: 'Monday: Sofia dentist. Wednesday: Robert cardiology. Friday: school forms + grocery run for Nora. Everything fit because Wednesday stayed meeting-free — protect that pattern.',
        tag: 'personal',
        people: ['Sofia Hale', 'Robert Hale', 'Nora Hale'],
        daysAgo: 5,
      },
      {
        type: 'document',
        title: "Parents' estate plan — annual review",
        body: 'Review checklist: wills (last signed 2019), powers of attorney, beneficiary designations, home insurance, safe-deposit inventory. This review is overdue — book the Harper & Cole follow-up.',
        tag: 'personal',
        people: ['Nora Hale', 'Robert Hale'],
        daysAgo: 120,
      },
    ],
  },
  {
    id: 'contacts',
    name: 'Contacts',
    blurb: 'People and relationships (simulated)',
    category: 'Network',
    accountHint: '128 contacts on device (simulated)',
    dataKinds: ['contacts', 'birthdays', 'notes'],
    seeds: [
      {
        type: 'relationship',
        title: 'Tom Becker — frontend friend',
        body: 'Tom Becker, frontend engineer, met at the web meetup. Knows accessibility and CSS layout deeply. Offered to pair on the portfolio build.',
        tag: 'personal',
        people: ['Tom Becker'],
        daysAgo: 25,
      },
      {
        type: 'relationship',
        title: 'Priya Nair — mentor (contact card)',
        body: 'Priya Nair, product designer, six years. Birthday March 14. Prefers email over calls. Coffee every few weeks.',
        tag: 'personal',
        people: ['Priya Nair'],
        daysAgo: 40,
      },
    ],
  },
];

const CONN_KEY = 'hyperself.connections.v1';
const SCAN_KEY = 'hyperself.scan.v1';

export interface Connection {
  id: string;
  connectedAt: string;
}

export function listConnections(): Connection[] {
  try {
    const raw = localStorage.getItem(CONN_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Connection[]).filter((c) => PROVIDERS.some((p) => p.id === c.id));
  } catch {
    return [];
  }
}

function saveConnections(conns: Connection[]): void {
  localStorage.setItem(CONN_KEY, JSON.stringify(conns));
}

export function isConnected(id: string): boolean {
  return listConnections().some((c) => c.id === id);
}

export function labelFor(id: string): string {
  const provider = PROVIDERS.find((p) => p.id === id);
  return provider ? `${provider.name} (simulated)` : id;
}

function stampDaysAgo(daysAgo?: number): string | undefined {
  if (daysAgo === undefined) return undefined;
  const d = new Date(Date.now() - daysAgo * 86400000);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function connectProvider(id: string): { created: number; name: string } {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new StoreError('Unknown provider.');
  if (isConnected(id)) throw new StoreError(`${provider.name} is already linked.`);
  for (const seed of provider.seeds) {
    const created = createEntry({
      title: seed.title,
      type: seed.type,
      body: seed.body,
      tag: 'personal',
      source: 'connection',
      source_label: labelFor(id),
      people: seed.people ?? [],
      at: stampDaysAgo(seed.daysAgo),
    });
    if (seed.tag === 'shareable') setEntryTag(created.id, 'shareable');
  }
  const conns = listConnections();
  conns.push({ id, connectedAt: new Date().toISOString() });
  saveConnections(conns);
  return { created: provider.seeds.length, name: provider.name };
}

export function connectMany(ids: string[]): { connected: string[]; skipped: string[] } {
  const connected: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    if (isConnected(id)) {
      skipped.push(id);
      continue;
    }
    try {
      connectProvider(id);
      connected.push(id);
    } catch {
      skipped.push(id);
    }
  }
  return { connected, skipped };
}

export function disconnectProvider(id: string): { removed: number; name: string } {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new StoreError('Unknown provider.');
  let removed = 0;
  for (const e of listEntries()) {
    if (e.source === 'connection' && e.source_label === labelFor(id)) {
      deleteEntry(e.id);
      removed += 1;
    }
  }
  saveConnections(listConnections().filter((c) => c.id !== id));
  return { removed, name: provider.name };
}

// --- Thorough account scan (simulated, local-only) ---

export interface ScannedAccount {
  id: string;
  name: string;
  category: string;
  account: string;
  dataKinds: string[];
  items: number;
  /** How many seed items would trip a HIGH local finding (leak preview). */
  leakHints: number;
  connected: boolean;
}

export interface ScanReport {
  at: string;
  accounts: ScannedAccount[];
  totalItems: number;
  totalLeaks: number;
}

const SCAN_STAMP = new Date().toISOString();

function countLeakHints(provider: Provider): number {
  let n = 0;
  for (const seed of provider.seeds) {
    const findings = scanEntry({
      id: `scan:${provider.id}`,
      type: seed.type,
      title: seed.title,
      body: seed.body,
      tag: 'personal',
      tag_history: [],
      goal_ids: [],
      skill_ids: [],
      people: seed.people ?? [],
      source: 'connection',
      embedding_status: 'pending',
      created_at: SCAN_STAMP,
      updated_at: SCAN_STAMP,
      deleted_at: null,
    });
    if (findings.some((f) => f.level === 'high')) n += 1;
  }
  return n;
}

/** Simulate discovering every linkable account on this device. Local-only. */
export function runAccountScan(): ScanReport {
  const accounts = PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    account: p.accountHint,
    dataKinds: p.dataKinds,
    items: p.seeds.length,
    leakHints: countLeakHints(p),
    connected: isConnected(p.id),
  }));
  const report: ScanReport = {
    at: new Date().toISOString(),
    accounts,
    totalItems: accounts.reduce((s, a) => s + a.items, 0),
    totalLeaks: accounts.reduce((s, a) => s + a.leakHints, 0),
  };
  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify(report));
  } catch {
    // Non-fatal: scan results are a convenience, not source data.
  }
  return report;
}

export function getLastScan(): ScanReport | null {
  try {
    const raw = localStorage.getItem(SCAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanReport;
    if (!Array.isArray(parsed.accounts)) return null;
    return parsed;
  } catch {
    return null;
  }
}
