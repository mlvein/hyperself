// UI wiring. Cloud key lives in module memory only — never persisted.
//
// IA: search lives in the header; Knowledgebase shows AI synthesis only
// (raw entries are never listed), Network owns people tagging after
// synthesis, Paths shows local insights, Legacy handles packs.
import {
  StoreError,
  addPersonToEntry,
  clearAll,
  createEntry,
  getEntry,
  getProfile,
  insertImported,
  listEntries,
  listPeople,
  removePersonFromEntry,
  setEmbeddingStatus,
  setEntryTag,
  setProfile,
} from './store';
import { PackError, exportPackText, importPackText } from './pack';
import { StubEngine, initLocalEngine, type LocalEngine } from './engine';
import { embedEntry, embedText, loadVectors } from './embeddings';
import { ingestDoc } from './ingest';
import {
  PROVIDERS,
  connectMany,
  connectProvider,
  isConnected,
  runAccountScan,
} from './connections';
import { runKnowledgeSearch } from './search';
import { TAGS_BY_TYPE, analyzeKnowledgebase, buildSynthesisCards } from './analysis';
import { scanEntry } from './security';
import {
  acknowledge,
  buildInsights,
  loadPathsState,
  togglePin,
  unacknowledge,
  type Insight,
} from './insights';
import type { Entry, EntryType, Tag } from './types';

let engine: LocalEngine = new StubEngine();

void initLocalEngine().then(({ engine: ready }) => {
  engine = ready;
});

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Tabs ---

function showView(view: string): void {
  document
    .querySelectorAll('.tabs button')
    .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.view === view));
  for (const section of document.querySelectorAll('main > section')) {
    (section as HTMLElement).hidden = section.id !== `view-${view}`;
  }
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view ?? 'knowledge'));
});

// --- Header greeting ---

function renderGreeting(): void {
  const profile = getProfile();
  el('userGreeting').textContent = profile ? `for ${profile.name}` : '';
}

// --- Knowledgebase synthesis + growth (raw entries are never listed) ---

function currentAnalysis() {
  return analyzeKnowledgebase(
    listEntries(),
    PROVIDERS.filter((p) => isConnected(p.id)).map((p) => p.id),
  );
}

let synthesisKey = '';
let synthesizing = false;

function renderLibrary(): void {
  const entries = listEntries();
  const empty = entries.length === 0;
  el('kbEmpty').hidden = !empty;
  el('kbSynthesis').hidden = empty;
  if (empty) return;
  void maybeSynthesize(entries);
}

function tagChips(tags: string[]): string {
  return `<span class="tagrow">${tags.map((t) => `<span class="tagchip">${escapeHtml(t)}</span>`).join('')}</span>`;
}

function renderSynthesisCards(overviewBody: string, overviewTags: string[]): void {
  const a = currentAnalysis();
  const cards = buildSynthesisCards(listEntries(), a);
  const overview = `<article class="item">
      <header><h3>Overview</h3>${tagChips(overviewTags)}</header>
      <p>${escapeHtml(overviewBody)}</p>
    </article>`;
  el('synthesisCards').innerHTML =
    overview +
    cards
      .map(
        (c) => `<article class="item">
        <header><h3>${escapeHtml(c.title)}</h3>${tagChips(c.tags)}</header>
        <p>${escapeHtml(c.body)}</p>
      </article>`,
      )
      .join('');
}

async function maybeSynthesize(entries: Entry[]): Promise<void> {
  const latest = entries.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), '');
  const key = `${entries.length}:${latest}:${engine.name}`;
  if (synthesizing || key === synthesisKey) return;
  synthesizing = true;
  synthesisKey = key;
  const status = el('synthesisStatus');
  status.textContent = 'Synthesizing on-device…';
  status.classList.add('loading');
  const a = currentAnalysis();
  const facts = [...a.behavior, `Blind spots: ${a.gaps.join(', ') || 'none'}.`].join(' ');
  const overviewTags = [
    ...new Set(
      a.byType
        .filter((t) => t.count > 0)
        .slice(0, 3)
        .flatMap((t) => TAGS_BY_TYPE[t.type]),
    ),
  ];
  renderSynthesisCards('Synthesizing…', overviewTags.length ? overviewTags : ['personal']);
  try {
    const reply = await engine.draft(
      `Give a synthesis overview of my knowledgebase and next steps. Facts: ${facts}`,
      entries.slice(0, 6),
    );
    renderSynthesisCards(reply, overviewTags.length ? overviewTags : ['personal']);
    status.textContent = `Updated just now · synthesized on-device · ${entries.length} entries behind this view`;
  } catch {
    renderSynthesisCards(facts, overviewTags.length ? overviewTags : ['personal']);
    status.textContent = 'Synthesis from local facts · on-device';
  } finally {
    status.classList.remove('loading');
    synthesizing = false;
  }
}

function renderLinkModal(): void {
  el('linkModalList').innerHTML = PROVIDERS.map((p) => {
    const connected = isConnected(p.id);
    return `<div class="provider" data-id="${p.id}">
      <div><strong>${escapeHtml(p.name)}</strong> <span class="hint">${escapeHtml(p.category)}</span><br />
      <span class="meta">${escapeHtml(p.blurb)} · adds ${p.dataKinds.join(', ')}</span></div>
      <button type="button" class="small" data-action="modal-link" ${connected ? 'disabled' : ''}>${connected ? 'Linked' : 'Link'}</button>
    </div>`;
  }).join('');
}

function openLinkModal(): void {
  renderLinkModal();
  el('linkModal').hidden = false;
}

function closeLinkModal(): void {
  el('linkModal').hidden = true;
}

document
  .querySelectorAll<HTMLButtonElement>('.js-link-tile')
  .forEach((tile) => tile.addEventListener('click', openLinkModal));
el('linkModalClose').addEventListener('click', closeLinkModal);
el('linkModal').addEventListener('click', (ev) => {
  if (ev.target === el('linkModal')) closeLinkModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !el('linkModal').hidden) closeLinkModal();
});

el('linkModalList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-action="modal-link"]') as HTMLButtonElement | null;
  const row = (ev.target as HTMLElement).closest('.provider[data-id]');
  if (!btn || !row || btn.disabled) return;
  const id = row.getAttribute('data-id') ?? '';
  btn.textContent = 'Linking…';
  btn.disabled = true;
  window.setTimeout(() => {
    try {
      connectProvider(id);
    } catch {
      // Already linked: the re-render settles state.
    }
    closeLinkModal();
    renderAll();
  }, 600);
});

el('kbUploadTile').addEventListener('click', () => {
  el<HTMLInputElement>('kbFileInput').click();
});

el<HTMLInputElement>('kbFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('kbFileInput');
  if (!input.files || input.files.length === 0) return;
  void ingestFiles(
    input.files,
    el('kbUploadNote'),
    el<HTMLButtonElement>('kbUploadTile'),
    input,
  );
});



// --- Local index (embeddings, silent background work) ---

let indexing = false;
let embedFailed = false;

async function indexPending(auto = false): Promise<void> {
  if (indexing || (auto && embedFailed)) return;
  const targets = listEntries().filter((e) => e.embedding_status !== 'indexed');
  if (targets.length === 0) return;
  indexing = true;
  try {
    for (const entry of targets) {
      await embedEntry(entry);
      setEmbeddingStatus(entry.id, 'indexed');
    }
  } catch {
    embedFailed = true; // keyword search keeps working; retry stays manual-free
  } finally {
    indexing = false;
  }
}

// --- Import tiles (shared by Library empty state + Import & Connect) ---

async function ingestFiles(
  files: FileList,
  note: HTMLElement,
  tile: HTMLButtonElement,
  input: HTMLInputElement,
): Promise<void> {
  tile.disabled = true;
  note.textContent = 'Uploading…';
  let total = 0;
  for (const file of Array.from(files)) {
    try {
      total += ingestDoc(file.name, await file.text(), { type: 'research' }).created;
    } catch {
      // Unreadable files are skipped; the count reflects what landed.
    }
  }
  tile.disabled = false;
  input.value = '';
  note.textContent = total > 0 ? `Added ${total} entries — synthesizing…` : 'Nothing readable in those files.';
  renderAll();
}

el('importUploadTile').addEventListener('click', () => {
  el<HTMLInputElement>('importFileInput').click();
});

el<HTMLInputElement>('importFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('importFileInput');
  if (!input.files || input.files.length === 0) return;
  void ingestFiles(
    input.files,
    el('importTileNote'),
    el<HTMLButtonElement>('importUploadTile'),
    input,
  );
});

interface PersonaKB {
  label: string;
  entries: Array<{
    at: string;
    type: EntryType;
    title: string;
    body: string;
    tag: Tag;
    people?: string[];
  }>;
}

async function loadPersona(id = 'maya'): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}personas/${id}.json`);
  if (!res.ok) throw new Error(`Persona file missing (HTTP ${res.status}). Run npm run personas.`);
  const kb = (await res.json()) as PersonaKB & { id?: string };
  const label = kb.id ?? id;
  if (listEntries().some((e) => e.source_label === label)) {
    return 'Persona already loaded — skipping to avoid duplicates.';
  }
  let personal = 0;
  let shareable = 0;
  for (const e of kb.entries) {
    const created = createEntry({
      title: e.title,
      type: e.type,
      body: e.body,
      tag: 'personal',
      source: 'import',
      source_label: label,
      people: e.people ?? [],
      at: `${e.at}T09:00:00`,
    });
    if (e.tag === 'shareable') {
      setEntryTag(created.id, 'shareable', 'import');
      shareable += 1;
    } else {
      personal += 1;
    }
  }
  const first = kb.entries[0]?.at.slice(0, 4) ?? '';
  const last = kb.entries[kb.entries.length - 1]?.at.slice(0, 4) ?? '';
  return (
    `Loaded persona "${kb.label}": ${personal} personal + ${shareable} shareable entries ` +
    `spanning ${first}–${last}. See the synthesis in Library, or open Paths for insights.`
  );
}

el('devPanel').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-persona]') as HTMLButtonElement | null;
  if (!btn) return;
  closeDevPanel();
  void loadPersona(btn.getAttribute('data-persona') ?? 'maya')
    .then(() => renderAll())
    .catch(() => renderAll());
});

// --- Top search (local knowledgebase Q&A) ---

async function runTopSearch(): Promise<void> {
  const box = el('searchResults');
  const query = el<HTMLInputElement>('globalSearch').value.trim();
  if (!query) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  let semantic: { vectors: Record<string, number[]>; queryVector: number[] } | undefined;
  try {
    const vectors = loadVectors();
    if (Object.keys(vectors).length > 0) {
      semantic = { vectors, queryVector: await embedText(query) };
    }
  } catch {
    semantic = undefined; // keyword-only fallback
  }
  const result = runKnowledgeSearch(query, listEntries(), new Date(), semantic);
  const kindLabel =
    result.parsed.kind === 'people-by-date'
      ? 'people by date'
      : result.parsed.kind === 'people-by-topic'
        ? 'people by topic'
        : 'keyword';
  const peopleHtml = result.people
    .map(
      (p) => `<div class="search-hit" data-person="${escapeHtml(p.name)}">
        <header><h3>${escapeHtml(p.name)}</h3><span class="meta">${p.entryIds.length} ${p.entryIds.length === 1 ? 'entry' : 'entries'}</span></header>
        <p class="meta">${escapeHtml(p.why)}</p>
        <div class="row" style="margin-top:0.4rem"><button type="button" class="small" data-action="view-person">View in Network</button></div>
      </div>`,
    )
    .join('');
  const entriesHtml = result.entries
    .map(
      (e) => `<div class="search-hit" data-entry="${e.id}">
        <header><h3>${escapeHtml(e.title)}</h3><span class="meta">${e.type} · ${e.tag}</span></header>
        <p class="meta">${escapeHtml(e.body.slice(0, 180))}${e.body.length > 180 ? '…' : ''}</p>
      </div>`,
    )
    .join('');
  box.innerHTML =
    `<p class="meta">${escapeHtml(result.summary)} <span class="hint">(${kindLabel} · local only)</span></p>` +
    (result.people.length ? `<h3 class="hint">People</h3>${peopleHtml}` : '') +
    (result.entries.length ? `<h3 class="hint">Entries</h3>${entriesHtml}` : '');
  box.hidden = false;
}

el('globalSearchBtn').addEventListener('click', runTopSearch);
el<HTMLInputElement>('globalSearch').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') runTopSearch();
  if (ev.key === 'Escape') {
    el<HTMLInputElement>('globalSearch').value = '';
    el('searchResults').hidden = true;
  }
});

el('searchResults').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-action="view-person"]');
  if (!btn) return;
  showView('knowledge');
  showSub('network');
});

// --- Packs ---

el('exportBtn').addEventListener('click', () => {
  const log = el('packLog');
  void (async () => {
    try {
      const risky = listEntries().filter(
        (e) => e.tag === 'shareable' && scanEntry(e).some((f) => f.level === 'high'),
      );
      if (risky.length > 0) {
        const proceed = confirm(
          `${risky.length} shareable ${risky.length === 1 ? 'entry has' : 'entries have'} HIGH severity findings:\n` +
            risky.map((e) => `• ${e.title}`).join('\n') +
            '\n\nExport anyway?',
        );
        if (!proceed) {
          log.textContent = 'Export cancelled: review high-severity findings in Paths first.';
          return;
        }
      }
      const { filename, json } = await exportPackText(
        listEntries(),
        el<HTMLInputElement>('packAuthor').value,
        el<HTMLInputElement>('packVersion').value,
      );
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      log.textContent = `Exported ${filename} (${JSON.parse(json).manifest.entry_count} entries).`;
    } catch (err) {
      log.textContent = err instanceof Error ? err.message : 'Export failed.';
    }
  })();
});

el('importBtn').addEventListener('click', () => {
  const log = el('packLog');
  const input = el<HTMLInputElement>('packFile');
  const file = input.files?.[0];
  if (!file) {
    log.textContent = 'Choose a pack file first.';
    return;
  }
  void (async () => {
    try {
      const verified = await importPackText(await file.text());
      const count = insertImported(verified.entries, verified.manifest.pack_id);
      log.textContent =
        `Verified pack "${verified.manifest.pack_id}" v${verified.manifest.version} ` +
        `by ${verified.manifest.author_label}: ${count} entries imported as shareable.`;
      renderAll();
    } catch (err) {
      log.textContent =
        err instanceof PackError || err instanceof StoreError ? err.message : 'Import failed.';
    }
  })();
});

el('packAskBtn').addEventListener('click', () => {
  const out = el('packAskOut');
  const query = el<HTMLInputElement>('packAskInput').value.trim();
  if (!query) {
    out.textContent = 'Ask a question about the imported pack first.';
    return;
  }
  const packEntries = listEntries().filter((e) => e.source === 'import');
  if (packEntries.length === 0) {
    out.textContent = 'No pack imported yet. Import a knowledge pack above first.';
    return;
  }
  out.textContent = 'Thinking on-device…';
  const hits = runKnowledgeSearch(query, packEntries).entries;
  void engine
    .draft(query, hits.length ? hits : packEntries.slice(0, 5))
    .then((reply) => {
      out.textContent = reply;
    })
    .catch(() => {
      out.textContent = 'On-device answer failed. Keyword results are in the Library.';
    });
});

// --- Paths (insights over the knowledgebase) ---

let showAcked = false;

function insightCard(insight: Insight, pinned: boolean, acked: boolean): string {
  const labels: Record<string, string> = {
    'goto-library': 'Review in Library',
    'goto-import': 'Add context via Import',
    acknowledge: 'Mark as reviewed',
    expound: 'Expound',
  };
  const buttons = acked
    ? '<button type="button" class="small" data-action="unack">Undo</button>'
    : `${insight.kinds.map((k) => `<button type="button" class="small" data-action="${k}">${labels[k]}</button>`).join('')}` +
      `<button type="button" class="small" data-action="pin">${pinned ? 'Unpin' : 'Pin'}</button>`;
  return `<article class="item${acked ? ' dimmed' : ''}" data-insight="${insight.id}">
    <header><h3>${escapeHtml(insight.title)}</h3><span class="sev-${insight.severity}">${insight.severity}</span></header>
    <p>${escapeHtml(insight.body)}</p>
    <div class="log" data-expound hidden></div>
    <div class="row" style="margin-top:0.5rem">${buttons}</div>
  </article>`;
}

function renderPaths(): void {
  const entries = listEntries();
  const empty = entries.length === 0;
  el('pathsEmpty').hidden = !empty;
  el('pathsContent').hidden = empty;
  if (empty) return;
  const insights = buildInsights(entries);
  const state = loadPathsState();
  const active = insights.filter((i) => state.acked[i.id] === undefined);
  const acked = insights.filter((i) => state.acked[i.id] !== undefined);
  const pinned = active.filter((i) => state.pinned.includes(i.id));
  const rest = active.filter((i) => !state.pinned.includes(i.id));
  const groups: string[] = [];
  if (pinned.length > 0) {
    groups.push(`<h3>Pinned</h3>${pinned.map((i) => insightCard(i, true, false)).join('')}`);
  }
  if (rest.length > 0) {
    groups.push(
      `${pinned.length > 0 ? '<h3>More insights</h3>' : ''}${rest.map((i) => insightCard(i, false, false)).join('')}`,
    );
  }
  el('insightList').innerHTML =
    groups.join('') || '<p class="hint">All clear. Nothing needs your attention.</p>';
  el('ackToggle').textContent = acked.length
    ? `${showAcked ? 'Hide' : 'Show'} acknowledged (${acked.length})`
    : '';
  el('ackedList').hidden = !showAcked;
  el('ackedList').innerHTML = showAcked ? acked.map((i) => insightCard(i, false, true)).join('') : '';
}

function handleInsightClick(ev: Event): void {
  const btn = (ev.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
  const article = (ev.target as HTMLElement).closest('article[data-insight]');
  if (!btn || !article) return;
  const id = article.getAttribute('data-insight') ?? '';
  const action = btn.getAttribute('data-action') ?? '';
  if (action === 'goto-library') {
    showView('knowledge');
    showSub('library');
  } else if (action === 'goto-import') {
    showView('knowledge');
    showSub('import');
  } else if (action === 'pin') {
    togglePin(id);
    renderPaths();
  } else if (action === 'acknowledge') {
    acknowledge(id);
    renderPaths();
  } else if (action === 'unack') {
    unacknowledge(id);
    renderPaths();
  } else if (action === 'expound') {
    const insight = buildInsights(listEntries()).find((i) => i.id === id);
    const out = article.querySelector<HTMLDivElement>('[data-expound]');
    if (!insight || !out) return;
    btn.textContent = 'Expounding…';
    btn.disabled = true;
    const related = listEntries().filter((e) => insight.entryIds.includes(e.id)).slice(0, 5);
    void engine.draft(insight.title, related).then((reply) => {
      // No re-render here: it would wipe the expounded output.
      out.hidden = false;
      out.textContent = `${reply}\n\nAdd more context from the Import & Connect tab to deepen this.`;
      btn.textContent = 'Expound';
      btn.disabled = false;
    });
  }
}

el('insightList').addEventListener('click', handleInsightClick);
el('ackedList').addEventListener('click', handleInsightClick);

el('ackToggle').addEventListener('click', () => {
  showAcked = !showAcked;
  renderPaths();
});

el('pathsImportBtn').addEventListener('click', () => {
  showView('knowledge');
  showSub('import');
});

// --- Onboarding (get to know you) ---

const OB_KEY = 'hyperself.onboarded.v1';
const OB_TITLES = [
  'Welcome to Hyperself',
  'Your privacy, in two tags',
  'Where your knowledge comes from',
  'Your Paths',
];
let obStep = 0;

function obShouldShow(): boolean {
  if (localStorage.getItem(OB_KEY) === '1') return false;
  if (listEntries().length > 0 || getProfile()) {
    localStorage.setItem(OB_KEY, '1'); // returning workspace: never interrupt
    return false;
  }
  return true;
}

function obSaveName(): void {
  const input = document.getElementById('obName') as HTMLInputElement | null;
  const value = input?.value.trim() ?? '';
  if (value) {
    setProfile(value);
    renderGreeting();
  }
}

function obFinish(): void {
  obSaveName();
  localStorage.setItem(OB_KEY, '1');
  el('onboarding').hidden = true;
  renderAll();
}

function obRender(): void {
  el('obTitle').textContent = OB_TITLES[obStep];
  el('obDots').textContent = `Step ${obStep + 1} of ${OB_TITLES.length}`;
  el<HTMLButtonElement>('obBack').disabled = obStep === 0;
  el<HTMLButtonElement>('obNext').textContent = obStep === OB_TITLES.length - 1 ? 'Finish' : 'Next';
  const body = el('obBody');

  if (obStep === 0) {
    const existing = escapeHtml(getProfile()?.name ?? '');
    body.innerHTML =
      '<p>Hyperself is a personal AI that grows from your own knowledge. ' +
      'You connect the apps and documents you already use, it keeps everything private on your device, ' +
      'and it turns what you know into Paths — insights and next steps for where you want to go.</p>' +
      '<p class="hint">This takes under a minute: your name, one privacy idea, your first knowledge, your first Paths.</p>' +
      `<label>What should Hyperself call you? <input id="obName" maxlength="80" value="${existing}" placeholder="Your name" /></label>`;
  } else if (obStep === 1) {
    body.innerHTML =
      '<p><span class="tag-personal">personal</span> stays on this device. Always. It is never sent anywhere.</p>' +
      '<p><span class="tag-shareable">shareable</span> is content you choose to share — findings, methods, research. ' +
      'Only shareable content ever leaves your browser, and only when you act.</p>' +
      '<p class="hint">Everything arrives personal. Health, finance, relationship, journal, and document entries can never be shareable.</p>';
  } else if (obStep === 2) {
    body.innerHTML =
      '<p>Hyperself never asks you to journal. Your knowledge arrives three ways:</p>' +
      '<p><strong>Account scan</strong> — finds your available accounts and previews what each can contribute.<br />' +
      '<strong>Uploads</strong> — drop in documents; they are parsed locally.<br />' +
      '<strong>Personas</strong> — start from a sample life while you connect your own.</p>' +
      '<div class="row"><button type="button" id="obScan">Scan my accounts</button>' +
      '<button type="button" id="obLinkAll">Link all found</button>' +
      '<button type="button" id="obMaya">Load Maya persona</button></div>' +
      '<p id="obSrcDone" class="hint">Prototype scan is simulated — nothing leaves your browser.</p>';
    el('obScan').addEventListener('click', () => {
      const report = runAccountScan();
      el('obSrcDone').textContent =
        `Found ${report.accounts.length} accounts with ${report.totalItems} items` +
        (report.totalLeaks > 0 ? ` (~${report.totalLeaks} with possible leaks — Paths will flag them).` : '.') +
        ' Link all, or finish and pick in Import & Connect.';
    });
    el('obLinkAll').addEventListener('click', () => {
      const ids = PROVIDERS.map((p) => p.id).filter((id) => !isConnected(id));
      if (ids.length === 0) {
        el('obSrcDone').textContent = 'Everything found is already linked.';
        return;
      }
      const { connected } = connectMany(ids);
      el('obSrcDone').textContent = `Linked ${connected.length} accounts (simulated). Leaked-data findings, if any, are actionable in Paths.`;
    });
    el('obMaya').addEventListener('click', () => {
      void loadPersona()
        .then((message) => {
          el('obSrcDone').textContent = message;
        })
        .catch((err: unknown) => {
          el('obSrcDone').textContent = err instanceof Error ? err.message : 'Load failed.';
        });
    });
  } else {
    body.innerHTML =
      '<p>Paths turn your knowledgebase into insights: outdated entries surface as alerts, risks get flagged, ' +
      'and every insight offers an action — review it, add context, pin it, or mark it reviewed.</p>' +
      '<p class="hint">Finish to see your first Paths. If your knowledgebase is empty, you will be pointed to Import.</p>' +
      '<button type="button" id="obPaths">See my Paths</button>';
    el('obPaths').addEventListener('click', () => {
      obFinish();
      showView('paths');
    });
  }
}

el('obBack').addEventListener('click', () => {
  if (obStep > 0) {
    obStep -= 1;
    obRender();
  }
});
el('obNext').addEventListener('click', () => {
  if (obStep === 0) obSaveName();
  if (obStep < OB_TITLES.length - 1) {
    obStep += 1;
    obRender();
  } else {
    obFinish();
  }
});
el('obSkip').addEventListener('click', obFinish);
el('tourBtn').addEventListener('click', () => {
  closeDevPanel();
  obStep = 0;
  el('onboarding').hidden = false;
  obRender();
});

// --- Demo controls (hidden chrome) ---
// Desktop: Ctrl/Cmd+Shift+D toggles. Small screens: gear button, bottom-right.

function closeDevPanel(): void {
  el('devPanel').hidden = true;
}

function toggleDevPanel(): void {
  el('devPanel').hidden = !el('devPanel').hidden;
}

el('devGear').addEventListener('click', toggleDevPanel);
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'd') {
    ev.preventDefault();
    toggleDevPanel();
  }
});

el('clearBtn').addEventListener('click', () => {
  if (confirm('Delete all local Hyperself data? This cannot be undone.')) {
    closeDevPanel();
    clearAll();
    renderAll();
  }
});

function renderAll(): void {
  renderLibrary();
  void indexPending(true);
  renderNetwork();
  renderGreeting();
  renderSecurity();
  renderPaths();
}

// --- Knowledgebase subtabs ---

function showSub(name: string): void {
  document
    .querySelectorAll('.subnav button[data-sub]')
    .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.sub === name));
  el('sub-library').hidden = name !== 'library';
  el('sub-network').hidden = name !== 'network';
  el('sub-import').hidden = name !== 'import';
  el('sub-security').hidden = name !== 'security';
}

document.querySelectorAll<HTMLButtonElement>('.subnav button[data-sub]').forEach((btn) => {
  btn.addEventListener('click', () => showSub(btn.dataset.sub ?? 'library'));
});

// --- Network (people rollups) ---

function renderNetwork(): void {
  // Tagging form: every knowledgebase entry is taggable after synthesis.
  const entries = listEntries();
  const select = el<HTMLSelectElement>('tagEntrySelect');
  const previous = select.value;
  select.innerHTML = entries.length
    ? entries
        .map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`)
        .join('')
    : '<option value="">No entries yet</option>';
  if (entries.some((e) => e.id === previous)) select.value = previous;

  const people = listPeople();
  const list = el('personList');
  if (people.length === 0) {
    list.innerHTML =
      '<p class="hint">No people yet. Tag someone above, or load a persona from the demo controls.</p>';
    return;
  }
  list.innerHTML = people
    .map((p) => {
      const rows = p.entryIds
        .map((id) => getEntry(id))
        .filter((e): e is Entry => e !== undefined)
        .slice(0, 5)
        .map(
          (e) =>
            `<p class="meta">${escapeHtml(e.title)} <button type="button" class="linklike" data-action="untag" data-entry="${e.id}" data-name="${escapeHtml(p.name)}">untag</button></p>`,
        )
        .join('');
      return `<article class="item" data-person="${escapeHtml(p.name)}">
        <header><h3>${escapeHtml(p.name)}</h3><span class="meta">${p.entryIds.length} ${p.entryIds.length === 1 ? 'entry' : 'entries'}</span></header>
        ${rows}
      </article>`;
    })
    .join('');
}

el('tagPersonBtn').addEventListener('click', () => {
  const entryId = el<HTMLSelectElement>('tagEntrySelect').value;
  const name = el<HTMLInputElement>('tagPersonInput').value.trim();
  if (!entryId || !name) {
    el('tagNote').textContent = 'Pick an entry and type a name first.';
    return;
  }
  try {
    addPersonToEntry(entryId, name);
    el<HTMLInputElement>('tagPersonInput').value = '';
    el('tagNote').textContent = `Tagged ${name}. They now appear in your network below.`;
    renderAll();
  } catch (err) {
    el('tagNote').textContent = err instanceof Error ? err.message : 'Tag failed.';
  }
});

el('personList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-action="untag"]');
  if (!btn) return;
  try {
    removePersonFromEntry(
      btn.getAttribute('data-entry') ?? '',
      btn.getAttribute('data-name') ?? '',
    );
    renderAll();
  } catch {
    // Entry vanished between render and click; the re-render settles it.
    renderAll();
  }
});

// --- Security subtab (actionable insights + badge) ---

function renderSecurity(): void {
  const entries = listEntries();
  const actionable: Array<{ title: string; message: string; suggestion: string }> = [];
  let warn = 0;
  for (const e of entries) {
    for (const f of scanEntry(e)) {
      if (f.level === 'high') {
        actionable.push({ title: e.title, message: f.message, suggestion: f.suggestion });
      } else if (f.level === 'warn') {
        warn += 1;
      }
    }
  }
  const badge = el('secBadge');
  badge.hidden = actionable.length === 0;
  badge.textContent = String(actionable.length);
  el('securitySummary').innerHTML =
    entries.length === 0
      ? '<p class="hint">No knowledge uploaded yet — link an account in Library and findings will appear here.</p>'
      : `<p>${actionable.length} actionable ${actionable.length === 1 ? 'insight' : 'insights'} · ${warn} warnings across ${entries.length} entries.</p>`;
  el('securityList').innerHTML = actionable.length
    ? actionable
        .slice(0, 10)
        .map(
          (h) => `<article class="item">
        <header><h3>${escapeHtml(h.title)}</h3><span class="sev-high">high</span></header>
        <p><strong>${escapeHtml(h.message)}.</strong> ${escapeHtml(h.suggestion)}</p>
        <div class="row" style="margin-top:0.5rem"><button type="button" class="small" data-action="sec-paths">Review in Paths</button></div>
      </article>`,
        )
        .join('')
    : entries.length > 0
      ? '<p class="hint">No actionable security insights. Your uploaded knowledge looks clean.</p>'
      : '';
}

el('securityList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-action="sec-paths"]');
  if (!btn) return;
  showView('paths');
});

renderAll();

if (obShouldShow()) {
  el('onboarding').hidden = false;
  obRender();
}
