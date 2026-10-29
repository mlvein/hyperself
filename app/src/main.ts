// UI wiring. Cloud key lives in module memory only — never persisted.
//
// IA: main menu (Knowledgebase / Paths / Legacy) lives in the header;
// the submenu strip sits in the old tab-bar position and shows the
// active section's subsections. Knowledgebase shows AI synthesis only
// (raw entries are never listed), Network owns people tagging after
// synthesis, Paths shows local insights, Legacy handles packs.
import {
  StoreError,
  clearAll,
  createEntry,
  getProfile,
  insertImported,
  listEntries,
  listPeople,
  setEmbeddingStatus,
  setEntryTag,
  setProfile,
  addPersonNote,
  listPersonNotes,
} from './store';
import { PackError, exportPackText, importPackText } from './pack';
import { StubEngine, cleanDraftText, initLocalEngine, isPromptLeak, type LocalEngine } from './engine';
import { embedEntry, embedText, loadVectors } from './embeddings';
import { ingestDoc } from './ingest';
import { isAudioFilename, isAudioMime, transcribeAudioBlob } from './transcribe';
import { isImageFilename, isImageMime, ocrImageBlob, parseExifDate } from './image';
import {
  PROVIDERS,
  connectMany,
  connectProvider,
  isConnected,
  runAccountScan,
} from './connections';
import { runKnowledgeSearch } from './search';
import { analyzeKnowledgebase, buildEssence, buildSynthesisCards, buildSynthesisSections, buildWhatMatters } from './analysis';
import { scanEntry } from './security';
import {
  acknowledge,
  buildInsights,
  loadPathsState,
  togglePin,
  unacknowledge,
  type Insight,
} from './insights';
import * as d3 from 'd3';
import { CENTER_ID, buildNetwork, personContext } from './network';
import { computeArchetypes } from './archetypes';
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
  for (const id of ['knowledge', 'legacy']) {
    el(`subnav-${id}`).hidden = id !== view;
  }
  el('subnavBar').hidden = view === 'paths';
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
  if (empty) {
    // Never let a stale or in-flight synthesis present as user data.
    synthesisKey = '';
    el('archetypePills').innerHTML = '';
    el('profileBlurb').textContent =
      'Your archetypes and story will appear here as Hyperself synthesizes your knowledge.';
    el('synthesisStatus').textContent = '';
    return;
  }
  void maybeSynthesize(entries);
}

function tagChips(tags: string[]): string {
  return `<span class="tagrow">${tags.map((t) => `<span class="tagchip">${escapeHtml(t)}</span>`).join('')}</span>`;
}

function limitTwoSentences(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  return sentences.slice(0, 2).join(' ').trim();
}

function renderProfileCard(blurb: string): void {
  const entries = listEntries();
  const archetypes = computeArchetypes(entries);
  el('archetypePills').innerHTML = archetypes.length
    ? archetypes
        .map(
          (a) =>
            `<span class="archetype-pill" title="${escapeHtml(a.evidence)}">${escapeHtml(a.label)}</span>`,
        )
        .join('')
    : '<span class="hint">No archetypes yet — add more knowledge.</span>';
  const name = getProfile()?.name ?? '';
  el('profileAvatar').textContent = name ? name.slice(0, 1).toUpperCase() : '?';
  el('profileBlurb').textContent = limitTwoSentences(blurb);
}

function renderSynthesisCards(_overviewBody = ''): void {
  void _overviewBody;
  const a = currentAnalysis();
  const cards = buildSynthesisCards(listEntries(), a);
  const s = buildSynthesisSections(listEntries(), a);
  const bullets = (items: string[]): string =>
    items.map((i) => `<p class="meta">• ${escapeHtml(i)}</p>`).join('');
  const archetypeCards = computeArchetypes(listEntries())
    .map(
      (arch) => `<article class="item archetype-card">
        <header><h3>${escapeHtml(arch.label)}</h3><span class="archetype-pill">Archetype</span></header>
        <p>${escapeHtml(arch.meaning)}</p>
        <p class="meta">Why this fits: ${escapeHtml(arch.evidence)}.</p>
        <p class="meta">Watch for: ${escapeHtml(arch.watchFor)}</p>
      </article>`,
    )
    .join('');
  const sections =
    `<article class="item"><header><h3>Next steps</h3></header>${bullets(s.nextSteps)}</article>` +
    `<article class="item"><header><h3>Facts</h3></header>${bullets(s.facts)}</article>`;
  el('synthesisCards').innerHTML =
    archetypeCards +
    cards
      .map(
        (c) => `<article class="item">
        <header><h3>${escapeHtml(c.title)}</h3>${tagChips(c.tags)}</header>
        <p>${escapeHtml(c.body)}</p>
      </article>`,
      )
      .join('') +
    sections;
}

/** One-line summary merged into the main synthesis (profile) card. */
function mattersLine(entries: Entry[]): string {
  const matters = buildWhatMatters(entries);
  const parts: string[] = [];
  if (matters.interests.length) parts.push(`Interests: ${matters.interests.join(' · ')}`);
  if (matters.people.length) parts.push(`Key people: ${matters.people.join(' · ')}`);
  return parts.length ? parts.join('  ·  ') : matters.headline;
}

async function maybeSynthesize(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  const latest = entries.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), '');
  const key = `${entries.length}:${latest}:${engine.name}`;
  if (synthesizing || key === synthesisKey) return;
  synthesizing = true;
  synthesisKey = key;
  const status = el('synthesisStatus');
  status.textContent = 'Synthesizing…';
  status.classList.add('loading');
  const a = currentAnalysis();
  const archetypes = computeArchetypes(entries);
  const essence = buildEssence(entries, archetypes);
  const facts = [
    essence.summary,
    ...essence.traits,
    ...(essence.aspirations.length ? [`Aspirations: ${essence.aspirations.join(' ')}`] : []),
    ...(essence.potential.length ? [`Potential: ${essence.potential.join(' ')}`] : []),
  ].join(' ');
  const archetypeFacts = archetypes.map((x) => x.meaning.split('.')[0]).join('; ');
  renderSynthesisCards('Synthesizing…');
  renderProfileCard('Synthesizing who you are from everything you have shared…');
  try {
    const reply = await engine.draft(
      `Describe my essence as a person in a maximum of two sentences: who I am at my core, what I aspire to, and my potential. ` +
        `Use second person. Never mention other people by name, entry counts, data sources, or how much I have uploaded. ` +
        `Essence: ${facts} Archetypes: ${archetypeFacts || 'none yet'}.`,
      entries.slice(0, 6),
    );
    if (listEntries().length === 0) return; // workspace cleared mid-synthesis
    const cleaned = cleanDraftText(reply.replace(/\n\nNothing left your browser\.?$/, ''));
    const usable = cleaned.length > 0 && !isPromptLeak(cleaned) && !cleaned.startsWith('From ');
    const localBlurb = essence.summary;
    renderProfileCard(usable ? cleaned : localBlurb);
    renderSynthesisCards(usable ? cleaned : facts);
    status.textContent = mattersLine(entries);
  } catch {
    const matters = buildWhatMatters(entries);
    renderProfileCard(`${matters.headline} ${facts}`);
    renderSynthesisCards(facts);
    status.textContent = mattersLine(entries);
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

el('synthImportBtn').addEventListener('click', () => {
  showView('knowledge');
  showSub('knowledge', 'import');
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

// --- Import tiles (managed only in Import & Connect) ---

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

el('imageUploadTile').addEventListener('click', () => {
  el<HTMLInputElement>('imageFileInput').click();
});

el<HTMLInputElement>('imageFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('imageFileInput');
  if (!input.files || input.files.length === 0) return;
  const note = el('imageNote');
  const tile = el<HTMLButtonElement>('imageUploadTile');
  const manualPerson = el<HTMLInputElement>('imagePersonInput').value.trim();
  void (async () => {
    tile.disabled = true;
    let done = 0;
    for (const file of Array.from(input.files ?? [])) {
      if (!isImageFilename(file.name) && !isImageMime(file.type)) {
        note.textContent = `"${file.name}" is not an image — skipped.`;
        continue;
      }
      try {
        const exifDate = parseExifDate(await file.arrayBuffer());
        const at = exifDate ?? new Date(file.lastModified || Date.now()).toISOString();
        const text = await ocrImageBlob(file, (status) => {
          note.textContent = `${file.name}: ${status}`;
        });
        const known = listPeople()
          .map((person) => person.name)
          .filter((name) => text.toLowerCase().includes(name.toLowerCase()));
        const people = [...new Set([...(manualPerson ? [manualPerson] : []), ...known])];
        const body = text
          ? `[Image transcript: ${file.name}]\n\n${text}`
          : `[Image: ${file.name}] No readable text found in this image.`;
        const { created } = ingestDoc(file.name, body, { people, at });
        done += created;
        const flags = listEntries()
          .filter((e) => e.source_label === file.name)
          .flatMap((e) => scanEntry(e))
          .filter((f) => f.level === 'high' || f.level === 'warn');
        note.textContent =
          `Imported "${file.name}" dated ${at.slice(0, 10)}${exifDate ? ' (from EXIF)' : ''}` +
          (people.length ? `, tagged ${people.join(', ')}` : '') +
          ' — see them in Network.' +
          (flags.length
            ? ` Security flag: ${flags.map((f) => f.message).join('; ')}. Review in Knowledgebase → Security.`
            : '');
      } catch (err) {
        note.textContent =
          err instanceof Error ? `"${file.name}": ${err.message}` : `"${file.name}": image import failed.`;
      }
    }
    tile.disabled = false;
    input.value = '';
    if (done > 0) renderAll();
  })();
});

el('audioUploadTile').addEventListener('click', () => {
  el<HTMLInputElement>('audioFileInput').click();
});

el<HTMLInputElement>('audioFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('audioFileInput');
  if (!input.files || input.files.length === 0) return;
  const note = el('audioNote');
  const tile = el<HTMLButtonElement>('audioUploadTile');
  void (async () => {
    tile.disabled = true;
    let done = 0;
    for (const file of Array.from(input.files ?? [])) {
      if (!isAudioFilename(file.name) && !isAudioMime(file.type)) {
        note.textContent = `"${file.name}" is not an audio file — skipped.`;
        continue;
      }
      try {
        const transcript = await transcribeAudioBlob(file, (text) => {
          note.textContent = `${file.name}: ${text}`;
        });
        const { created } = ingestDoc(
          file.name,
          `[Audio transcript: ${file.name}]\n\n${transcript}`,
        );
        done += created;
        note.textContent = `Transcribed "${file.name}" into ${created} ${created === 1 ? 'entry' : 'entries'} — find it via search (try "audio").`;
      } catch (err) {
        note.textContent =
          err instanceof Error ? `"${file.name}": ${err.message}` : `"${file.name}": transcription failed.`;
      }
    }
    tile.disabled = false;
    input.value = '';
    if (done > 0) renderAll();
  })();
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
    `spanning ${first}–${last}. See Synthesis, or open Paths for insights.`
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
  showSub('knowledge', 'network');
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
      out.textContent = 'On-device answer failed. Keyword results are in Synthesis.';
    });
});

// --- Paths (insights over the knowledgebase) ---

function insightCard(insight: Insight, pinned: boolean, acked: boolean): string {
  const labels: Record<string, string> = {
    'goto-library': 'Review in Synthesis',
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
  el('ackedList').innerHTML = acked.length
    ? acked.map((i) => insightCard(i, false, true)).join('')
    : '<p class="hint">Nothing acknowledged yet.</p>';
}

function handleInsightClick(ev: Event): void {
  const btn = (ev.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
  const article = (ev.target as HTMLElement).closest('article[data-insight]');
  if (!btn || !article) return;
  const id = article.getAttribute('data-insight') ?? '';
  const action = btn.getAttribute('data-action') ?? '';
  if (action === 'goto-library') {
    showView('knowledge');
    showSub('knowledge', 'library');
  } else if (action === 'goto-import') {
    showView('knowledge');
    showSub('knowledge', 'import');
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

el('pathsImportBtn').addEventListener('click', () => {
  showView('knowledge');
  showSub('knowledge', 'import');
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
    localStorage.removeItem(OB_KEY);
    synthesisKey = '';
    renderAll();
    if (obShouldShow()) {
      el('onboarding').hidden = false;
      obRender();
    }
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

// --- Submenus (strip in the old tab-bar position) ---

const SUB_PANES: Record<string, Record<string, string>> = {
  knowledge: { library: 'sub-library', network: 'sub-network', import: 'sub-import', security: 'sub-security' },
  legacy: { export: 'sub-export' },
};

function showSub(view: string, name: string): void {
  document
    .querySelectorAll(`#subnav-${view} button[data-sub]`)
    .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.sub === name));
  const panes = SUB_PANES[view] ?? {};
  for (const [key, id] of Object.entries(panes)) {
    el(id).hidden = key !== name;
  }
}

document.querySelectorAll<HTMLButtonElement>('#subnavBar .subnav button[data-sub]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const group = btn.closest('.subnav')?.id.replace('subnav-', '') ?? 'knowledge';
    showSub(group, btn.dataset.sub ?? 'library');
  });
});

// --- Network (people rollups) ---

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function renderNetwork(): void {
  const entries = listEntries();
  renderNetworkGraph(entries);
  const people = listPeople();
  const list = el('personList');
  if (people.length === 0) {
    list.innerHTML =
      '<p class="hint">No people yet. Add knowledge in Import &amp; Connect, or load a persona from the demo controls.</p>';
    return;
  }
  list.innerHTML = people
    .map(
      (p) => `<button type="button" class="person-card" data-person-card="${escapeHtml(p.name)}" aria-label="Open ${escapeHtml(p.name)}">
        <span class="person-avatar">${escapeHtml(initialsOf(p.name))}</span>
        <span class="person-name">${escapeHtml(p.name)}</span>
        <span class="meta">${p.entryIds.length} ${p.entryIds.length === 1 ? 'entry' : 'entries'}</span>
      </button>`,
    )
    .join('');
}

interface SimNode {
  id: string;
  label: string;
  count: number;
  center?: boolean;
  photo?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

const savedPositions = new Map<string, { x: number; y: number }>();
let networkSim: d3.Simulation<SimNode, undefined> | undefined;
let networkTimer: d3.Timer | undefined;
let orbitDragging = false;

let modalPerson = '';

function renderPersonNotes(name: string): void {
  const notes = listPersonNotes(name);
  el('personNotesList').innerHTML = notes.length
    ? notes
        .map(
          (note) =>
            `<div class="note-bubble"><p>${escapeHtml(note.text)}</p><span class="meta">${escapeHtml(note.at.slice(0, 10))}</span></div>`,
        )
        .join('')
    : '<p class="hint">No notes yet. Add the first one below.</p>';
}

function renderPersonTimeline(name: string): void {
  const host = el('personTimeline');
  host.innerHTML = '';
  const ctx = personContext(listEntries(), name);
  if (ctx.timeline.length === 0) return;
  const you = getProfile()?.name ?? 'You';
  const width = Math.max(320, host.clientWidth || 500);
  const height = 120;
  const times = ctx.timeline.map((m) => Date.parse(m.at));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const x = (at: string): number => 30 + ((Date.parse(at) - min) / span) * (width - 60);
  const svg = d3.select(host).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', `Relationship timeline for ${name}`);
  svg.append('text').attr('x', 30).attr('y', 18).attr('font-size', '11px')
    .text(`${you} + ${name}`);
  svg.append('line')
    .attr('x1', 30).attr('x2', width - 30).attr('y1', 62).attr('y2', 62)
    .attr('stroke', '#c9c2b4').attr('stroke-width', 2);
  const dots = svg.append('g').selectAll<SVGCircleElement, (typeof ctx.timeline)[number]>('circle')
    .data(ctx.timeline).join('circle')
    .attr('cx', (d) => x(d.at))
    .attr('cy', 62)
    .attr('r', (d) => (d.key ? 9 : 5))
    .attr('fill', (d) => (d.key ? '#2e6b46' : '#ece8e0'))
    .attr('stroke', '#1c1a17')
    .attr('cursor', 'pointer');
  dots.append('title').text((d) => `${d.at} — ${d.title} (${d.type})`);
  svg.append('g').selectAll('text')
    .data(ctx.timeline.filter((m) => m.key).slice(0, 4)).join('text')
    .attr('x', (d) => x(d.at)).attr('y', 92)
    .attr('text-anchor', 'middle').attr('font-size', '10px')
    .text((d) => d.at.slice(0, 4));
}

function openPersonModal(name: string): void {
  modalPerson = name;
  const ctx = personContext(listEntries(), name);
  el('personModalName').textContent = ctx.name;
  const shared = ctx.connectedTo.length
    ? ctx.connectedTo.map((c) => `${escapeHtml(c.name)} (${c.shared} shared)`).join(', ')
    : 'no shared connections yet';
  const keyMoments = ctx.timeline
    .filter((m) => m.key)
    .slice(0, 5)
    .map(
      (m) =>
        `<p class="meta">★ ${escapeHtml(m.at)} — ${escapeHtml(m.title)} <span>· ${escapeHtml(m.type)}${m.people.length ? ` · with ${m.people.map(escapeHtml).join(', ')}` : ''}</span></p>`,
    )
    .join('');
  const knownMs = ctx.firstSeen ? Date.now() - Date.parse(ctx.firstSeen) : 0;
  const knownYears = Math.floor(knownMs / (365.25 * 86400000));
  const knownText =
    knownYears >= 1
      ? ` — you've known each other for ${knownYears} ${knownYears === 1 ? 'year' : 'years'}.`
      : ctx.firstSeen
        ? ' — you\'ve known each other for under a year.'
        : '.';
  el('personModalBody').innerHTML =
    `<p>${ctx.entryCount} ${ctx.entryCount === 1 ? 'entry mentions' : 'entries mention'} ${escapeHtml(ctx.name)}` +
    knownText +
    `</p><p class="meta">Types: ${escapeHtml(ctx.types.join(', ') || '—')}</p>` +
    `<p class="meta">Relationships: ${shared}</p>` +
    `<div id="personTimeline" class="person-timeline" aria-label="Relationship timeline"></div>` +
    (keyMoments ? `<h3 class="ov-sub">Key moments</h3>${keyMoments}` : '') +
    `<h3 class="ov-sub">Notes</h3><div id="personNotesList"></div>` +
    `<div class="comment-box"><textarea id="personNoteInput" rows="2" maxlength="500" placeholder="Add a note about ${escapeHtml(ctx.name)}…"></textarea>` +
    `<button type="button" id="personNoteBtn" class="small">Add note</button></div>` +
    '<p class="hint">Notes stay on this device, attached to this person.</p>';
  el('personModal').hidden = false;
  renderPersonTimeline(name);
  renderPersonNotes(name);
  el('personNoteBtn').addEventListener('click', () => {
    const input = el<HTMLTextAreaElement>('personNoteInput');
    const text = input.value.trim();
    if (!text) return;
    addPersonNote(modalPerson, text);
    input.value = '';
    renderPersonNotes(modalPerson);
  });
}

function closePersonModal(): void {
  el('personModal').hidden = true;
}

el('personModalClose').addEventListener('click', closePersonModal);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !el('personModal').hidden) closePersonModal();
});
el('personModal').addEventListener('click', (ev) => {
  if (ev.target === el('personModal')) closePersonModal();
});

function renderNetworkGraph(entries: Entry[]): void {
  const host = el('networkGraph');
  const centerLabel = getProfile()?.name ?? 'You';
  const graph = buildNetwork(entries, centerLabel);
  el('networkGraphEmpty').hidden = graph.nodes.length > 1;
  host.innerHTML = '';
  if (networkSim) networkSim.stop();
  if (networkTimer) networkTimer.stop();
  if (graph.nodes.length <= 1) return;
  const width = Math.max(320, host.clientWidth || 760);
  const height = 420;
  const nodes: SimNode[] = graph.nodes.map((node) => ({
    ...node,
    ...(savedPositions.get(node.id) ?? {}),
  }));
  const links = graph.links.map((l) => ({ ...l })) as unknown as Array<{
    source: string | SimNode;
    target: string | SimNode;
    weight: number;
  }>;
  const svg = d3.select(host).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', `Network graph centered on ${centerLabel}`);
  const orbit = svg.append('g');
  let orbitAngle = 0;
  const link = orbit.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#c9c2b4')
    .attr('stroke-width', (d) => Math.min(4, 1 + d.weight * 0.5));
  const sim = d3.forceSimulation<SimNode>(nodes)
    .force('link', d3.forceLink<SimNode, (typeof links)[number]>(links).id((d) => d.id).distance(130))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide<SimNode>().radius(28));
  networkSim = sim;
  const node = orbit.append('g').selectAll<SVGGElement, SimNode>('g').data(nodes).join('g')
    .attr('class', 'node')
    .attr('cursor', 'pointer')
    .call(
      d3.drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => {
          orbitDragging = true;
          if (!ev.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
          (d as SimNode & { __moved?: boolean }).__moved = false;
        })
        .on('drag', (ev, d) => {
          d.fx = ev.x; d.fy = ev.y;
          (d as SimNode & { __moved?: boolean }).__moved = true;
          savedPositions.set(d.id, { x: ev.x, y: ev.y });
        })
        .on('end', (ev, d) => {
          orbitDragging = false;
          if (!ev.active) sim.alphaTarget(0);
          if (!d.center) { d.fx = null; d.fy = null; }
        }),
    );
  const AVATAR_R = 20;
  const defs = svg.append('defs');
  nodes.forEach((d, i) => {
    defs.append('clipPath').attr('id', `avatar-clip-${i}`)
      .append('circle').attr('r', AVATAR_R);
    void d;
  });
  node.append('circle')
    .attr('r', AVATAR_R)
    .attr('fill', (d) => (d.center ? '#1c1a17' : '#dcefe2'))
    .attr('stroke', (d) => (d.center ? '#1c1a17' : '#2e6b46'))
    .attr('stroke-width', 1.5);
  node.append('g')
    .attr('clip-path', (_d, i) => `url(#avatar-clip-${i})`)
    .append('image')
    .attr('href', (d) => d.photo ?? '')
    .attr('x', -AVATAR_R).attr('y', -AVATAR_R)
    .attr('width', AVATAR_R * 2).attr('height', AVATAR_R * 2)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .style('display', (d) => (d.photo ? null : 'none'));
  node.append('text')
    .attr('class', 'node-initials')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', '11px')
    .attr('font-weight', '700')
    .attr('fill', (d) => (d.center ? '#ffffff' : '#1f4d30'))
    .style('display', (d) => (d.photo ? 'none' : null))
    .text((d) => initialsOf(d.label));
  node.append('text')
    .attr('class', 'node-name')
    .attr('text-anchor', 'middle')
    .attr('y', -28)
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .text((d) => d.label);
  node.append('title').text((d) => d.label);
  node.on('click', (_ev, d) => {
    if ((d as SimNode & { __moved?: boolean }).__moved || d.center) return;
    openPersonModal(d.label);
  });
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  networkTimer = d3.timer(() => {
    if (orbitDragging || reducedMotion) return;
    orbitAngle = (orbitAngle + 0.02) % 360;
    orbit.attr('transform', `rotate(${orbitAngle} ${width / 2} ${height / 2})`);
    node.selectAll('text').attr('transform', `rotate(${-orbitAngle})`);
  });
  sim.on('tick', () => {
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });
}

el('personList').addEventListener('click', (ev) => {
  const card = (ev.target as HTMLElement).closest('[data-person-card]');
  if (!card) return;
  openPersonModal(card.getAttribute('data-person-card') ?? '');
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
      ? '<p class="hint">No knowledge uploaded yet — link an account in Import & Connect and findings will appear here.</p>'
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
