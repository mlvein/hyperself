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
  activateVault,
  createSavedPath,
  deleteEntriesByLabel,
  getFolderManifest,
  setFolderManifest,
  deleteSavedPath,
  listSavedPaths,
  setSavedPathPinned,
  clearArchetypePreference,
  getArchetypePreferences,
  setArchetypePreference,
} from './store';
import { PackError, exportPackText, importPackText } from './pack';
import { StubEngine, cleanDraftText, initLocalEngine, isPromptLeak, loadGlimmerConfig, probeGlimmer, saveGlimmerConfig, type LocalEngine } from './engine';
import { embedEntry, embedText, loadVectors } from './embeddings';
import { hashContent, ingestDoc } from './ingest';
import { diffFolder, isSyncablePath, nextManifest } from './foldersync';
import { isHtmlFilename, parseJournalHtml } from './html';
import { docxToText, extensionOf, healthXmlToText, jsonToText, mboxToText, parseIcs, parseVcf, pdfToText, rtfToText, unzipTextEntries } from './formats';
import { EXPORT_GUIDES } from './guides';
import { isAudioFilename, isAudioMime, transcribeAudioBlob } from './transcribe';
import { isImageFilename, isImageMime, ocrImageBlob, parseExifDate } from './image';
import { budgetInsights, monthlyTotals, parseStatement, recurringCosts, summarizeTransactions, transactionsFromEntries, type StatementParse } from './budget';
import { PATH_TEMPLATES, availablePathCount, isBudgetingQuery, readingLifeSummary, relationshipRhythms, suggestTemplates, templateById, templateForArchetype, templateReadiness, visibleSuggestedTemplates } from './templates';
import {
  biometricAvailable,
  enrollBiometric,
  hasVault,
  setupVault,
  unlockWithBiometric,
  unlockWithPin,
} from './vault';
import {
  PROVIDERS,
  connectMany,
  connectProvider,
  isConnected,
  runAccountScan,
} from './connections';
import { runKnowledgeSearch } from './search';
import { analyzeKnowledgebase, buildEssence, buildSynthesisCards, buildWhatMatters } from './analysis';
import { scanEntry } from './security';
import {
  acknowledge,
  buildInsights,
  dismissInsight,
  loadPathsState,
  togglePin,
  unacknowledge,
  undismissInsight,
  type Insight,
} from './insights';
import * as d3 from 'd3';
import { CENTER_ID, buildNetwork, personContext } from './network';
import { applyArchetypePreferences, computeArchetypeTimeline, computeArchetypes } from './archetypes';
import type { Entry, EntryType, Tag } from './types';

let engine: LocalEngine = new StubEngine();

async function connectEngine(): Promise<void> {
  const status = document.getElementById('glimmerStatus');
  const { engine: ready, notice } = await initLocalEngine();
  engine = ready;
  if (status) status.textContent = notice;
  synthesisKey = ''; // force re-synthesis with the (possibly new) engine
}

void connectEngine();

{
  const cfg = loadGlimmerConfig();
  const endpointInput = document.getElementById('glimmerEndpoint') as HTMLInputElement | null;
  const modelInput = document.getElementById('glimmerModel') as HTMLInputElement | null;
  if (endpointInput) endpointInput.value = cfg.endpoint;
  if (modelInput) modelInput.value = cfg.model;
  document.getElementById('glimmerSaveBtn')?.addEventListener('click', () => {
    saveGlimmerConfig({
      endpoint: endpointInput?.value ?? '',
      model: modelInput?.value ?? '',
    });
    const status = document.getElementById('glimmerStatus');
    if (status) status.textContent = 'Reconnecting to the local model server…';
    void connectEngine().then(() => {
      if (listEntries().length > 0) void maybeSynthesize(listEntries());
    });
  });
  document.getElementById('glimmerCheckBtn')?.addEventListener('click', () => {
    const status = document.getElementById('glimmerStatus');
    if (status) status.textContent = 'Checking the local model server…';
    const entered = saveGlimmerConfig({
      endpoint: endpointInput?.value ?? '',
      model: modelInput?.value ?? '',
    });
    void probeGlimmer(entered).then((ok) => {
      if (!status) return;
      if (!ok) {
        status.textContent =
          'Could not reach the local model server yet. Finish the steps under “Set up deep synthesis” below, then check again.';
        return;
      }
      status.textContent = 'Connected — Muse Glimmer is running on this device.';
      void connectEngine().then(() => {
        if (listEntries().length > 0) void maybeSynthesize(listEntries());
      });
    });
  });
  document.getElementById('glimmerCopyBtn')?.addEventListener('click', () => {
    const copyStatus = document.getElementById('glimmerCopyStatus');
    const text = document.getElementById('glimmerCommands')?.textContent ?? '';
    const done = (): void => {
      if (copyStatus) copyStatus.textContent = 'Copied. Paste into Terminal, then press Enter.';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        if (copyStatus) copyStatus.textContent = 'Copy failed — select the commands above and copy them manually.';
      });
    } else if (copyStatus) {
      copyStatus.textContent = 'Select the commands above and copy them manually.';
    }
  });
}

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
  for (const id of ['knowledge', 'legacy', 'paths']) {
    el(`subnav-${id}`).hidden = id !== view;
  }
  el('subnavBar').hidden = false;
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


function visibleArchetypes(limit = 4) {
  return applyArchetypePreferences(computeArchetypes(listEntries(), 8), getArchetypePreferences()).slice(0, limit);
}

function archetypeLensLabel(archetypeId: string | undefined): string {
  if (!archetypeId) return '';
  const visible = visibleArchetypes(8).find((a) => a.id === archetypeId);
  if (visible) return visible.label;
  const template = templateForArchetype(archetypeId);
  return template?.archetypeLabel ?? archetypeId.replace(/-/g, ' ');
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
  const archetypes = visibleArchetypes();
  el('archetypePills').innerHTML = archetypes.length
    ? archetypes
        .map(
          (a) =>
            `<span class="archetype-pill" title="${escapeHtml(a.evidence)} · Strength ${a.strength}/100 · Confidence ${a.confidence}/100 · ${escapeHtml(a.trend)}">${escapeHtml(a.label)}${a.confirmed ? ' ✓' : ''}</span>`,
        )
        .join('')
    : '<span class="hint">No archetypes yet — add more knowledge.</span>';
  const name = getProfile()?.name ?? '';
  const pills = el('archetypePills');
  if (archetypes.length && !pills.querySelector('.archetype-note')) {
    pills.insertAdjacentHTML(
      'beforeend',
      '<span class="hint archetype-note">Playful patterns from your data — not labels, not diagnoses.</span>',
    );
  }
  el('profileAvatar').textContent = name ? name.slice(0, 1).toUpperCase() : '?';
  el('profileBlurb').textContent = limitTwoSentences(blurb);
}

function renderSynthesisCards(_overviewBody = ''): void {
  void _overviewBody;
  const a = currentAnalysis();
  const cards = buildSynthesisCards(listEntries(), a);
  const archetypeCards = visibleArchetypes()
    .map((arch) => {
      const template = templateForArchetype(arch.id);
      return `<article class="item archetype-card" data-archetype-card="${arch.id}">
        <header><h3>${escapeHtml(arch.label)}</h3><span class="archetype-pill">${arch.confirmed ? 'Confirmed archetype' : 'Archetype'}</span></header>
        <p>${escapeHtml(arch.meaning)}</p>
        <p class="meta">Why this fits: ${escapeHtml(arch.evidence)}.</p>
        <p class="meta">Strength ${arch.strength}/100 · Confidence ${arch.confidence}/100 · Trend: ${escapeHtml(arch.trend)}</p>
        <div class="budget-bar" aria-hidden="true"><span style="width:${arch.strength}%"></span></div>
        <p class="meta">Watch for: ${escapeHtml(arch.watchFor)}</p>
        <div class="row" style="margin-top:0.5rem">
          <button type="button" class="small" data-archetype-action="confirm" data-archetype-id="${arch.id}">${arch.confirmed ? 'Confirmed' : 'Confirm'}</button>
          <button type="button" class="small" data-archetype-action="rename" data-archetype-id="${arch.id}">Rename</button>
          <button type="button" class="small" data-archetype-action="dismiss" data-archetype-id="${arch.id}">Not me</button>
          ${template ? `<button type="button" class="small" data-archetype-path="${arch.id}">Start a Path from this archetype</button>` : ''}
        </div>
      </article>`;
    })
    .join('');
  const eras = computeArchetypeTimeline(listEntries());
  const timelineCard = eras.length > 1
    ? `<article class="item"><header><h3>How your archetypes changed</h3></header>${eras.map((era) => `<p class="meta"><strong>${escapeHtml(era.label)}:</strong> ${applyArchetypePreferences(era.archetypes, getArchetypePreferences()).map((a) => escapeHtml(a.label)).join(' · ') || 'Patterns forming'}</p>`).join('')}</article>`
    : '';
  el('synthesisCards').innerHTML =
    timelineCard +
    archetypeCards +
    cards
      .map(
        (c) => `<article class="item">
        <header><h3>${escapeHtml(c.title)}</h3>${tagChips(c.tags)}</header>
        <p>${escapeHtml(c.body)}</p>
      </article>`,
      )
      .join('');
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
  const archetypes = visibleArchetypes();
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
    const cleaned = cleanDraftText(reply.replace(/\n\nNothing left (your browser|this device)\.?$/, ''));
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
    const gs = document.getElementById('glimmerStatus');
    if (gs && /muse-glimmer/.test(engine.name)) {
      gs.textContent = 'Muse Glimmer connected on this device (local server).';
    }
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

type OwnershipKind = import('./types').OwnershipKind;

function currentOwnership(): OwnershipKind {
  const value = el<HTMLSelectElement>('ownershipSelect').value;
  return value === 'shared' || value === 'reference' ? value : 'mine';
}

function attested(): boolean {
  return el<HTMLInputElement>('attestCheck').checked;
}

const ATTEST_KEY = 'hyperself.attested.v1';
el<HTMLInputElement>('attestCheck').checked = localStorage.getItem(ATTEST_KEY) === '1';
el<HTMLInputElement>('attestCheck').addEventListener('change', () => {
  localStorage.setItem(ATTEST_KEY, attested() ? '1' : '0');
});

/** Ingest already-extracted text by extension (uploads and ZIP members share this). */
async function ingestTextContent(label: string, ext: string, raw: string): Promise<number> {
  if (ext === 'ics') {
    const events = parseIcs(raw);
    let created = 0;
    for (const ev of events.slice(0, 200)) {
      created += ingestDoc(label, `# ${ev.title}\n${ev.description ?? ''}${ev.location ? `\nLocation: ${ev.location}` : ''}`, {
        type: 'journal',
        at: ev.date,
      }).created;
    }
    return created;
  }
  if (ext === 'vcf') {
    const contacts = parseVcf(raw);
    if (!contacts.length) throw new Error('no contacts');
    const body = contacts.map((c) => `- ${c.name}${c.org ? ` · ${c.org}` : ''}${c.email ? ` · ${c.email}` : ''}${c.phone ? ` · ${c.phone}` : ''}`).join('\n');
    return ingestDoc(label, `# Contacts import\n\n${body}`, { type: 'relationship', ownership: currentOwnership() }).created;
  }
  if (ext === 'rtf') return ingestDoc(label, rtfToText(raw), { ownership: currentOwnership() }).created;
  if (ext === 'json' || ext === 'js') {
    const converted = jsonToText(raw, label);
    if (!converted) throw new Error('no readable text');
    return ingestDoc(label, converted, { ownership: currentOwnership() }).created;
  }
  if (ext === 'mbox') {
    const converted = mboxToText(raw);
    if (!converted) throw new Error('no readable mail');
    return ingestDoc(label, converted, { ownership: currentOwnership() }).created;
  }
  if (ext === 'xml') {
    const converted = healthXmlToText(raw);
    if (!converted) throw new Error('no readable records');
    return ingestDoc(label, converted, { type: 'health', ownership: currentOwnership() }).created;
  }
  return ingestDoc(label, raw, { type: 'research', ownership: currentOwnership() }).created;
}

async function ingestFormattedFile(file: File, label: string): Promise<number> {
  const ext = extensionOf(file.name);
  const note = el('importTileNote');
  if (ext === 'zip') {
    const members = await unzipTextEntries(file);
    if (!members.length) throw new Error('no readable files in archive');
    let created = 0;
    for (const member of members) {
      try {
        created += await ingestTextContent(`${label} / ${member.name}`, extensionOf(member.name), member.text);
      } catch {
        // One unreadable member never blocks the rest of the export.
      }
    }
    if (!created) throw new Error('no readable files in archive');
    return created;
  }
  if (ext === 'pdf') {
    const text = await pdfToText(file, (status) => { note.textContent = `${file.name}: ${status}`; });
    if (!text.trim()) throw new Error('no text layer');
    return ingestDoc(label, text, { ownership: currentOwnership() }).created;
  }
  if (ext === 'docx') {
    const text = await docxToText(file, (status) => { note.textContent = `${file.name}: ${status}`; });
    if (!text.trim()) throw new Error('no readable text');
    return ingestDoc(label, text, { ownership: currentOwnership() }).created;
  }
  return ingestTextContent(label, ext, await file.text());
}

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
      if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        showStatementReview(file.name, parseStatement(await file.text()));
        continue;
      }
      if (isHtmlFilename(file.name)) {
        const page = parseJournalHtml(await file.text(), file.name);
        total += ingestDoc(file.name, page.text, {
          type: 'journal',
          at: page.date ?? undefined,
          ownership: currentOwnership(),
        }).created;
        continue;
      }
      total += await ingestFormattedFile(file, file.name);
    } catch {
      // Unreadable files are skipped; the count reflects what landed.
    }
  }
  tile.disabled = false;
  input.value = '';
  if (!attested() && total > 0) {
    note.textContent += ' Tip: tick the attestation above to record that these are yours to keep.';
  }
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

// --- Export guides: download-your-own-data backup for every service ---
function renderExportGuides(): void {
  el('exportGuideList').innerHTML = EXPORT_GUIDES.map(
    (g) => `<details class="guide">
      <summary><strong>${escapeHtml(g.service)}</strong> <span class="hint">${escapeHtml(g.arrivesAs)}</span></summary>
      <p class="meta">Where: ${escapeHtml(g.where)}</p>
      <ol class="hint">${g.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      <p class="meta">Reads: ${g.formats.map((f) => `.${escapeHtml(f)}`).join(' · ')}</p>
      <div class="row"><button type="button" class="small" data-guide-upload="${escapeHtml(g.providerId)}">Upload ${escapeHtml(g.service)} export</button></div>
    </details>`,
  ).join('');
}
renderExportGuides();

el('exportGuideList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-guide-upload]');
  if (!btn) return;
  el<HTMLInputElement>('importFileInput').click();
});

let pendingStatement: { name: string; parsed: StatementParse } | null = null;

function showStatementReview(name: string, parsed: StatementParse): void {
  pendingStatement = { name, parsed };
  const summary = summarizeTransactions(parsed.transactions);
  el('statementStats').textContent =
    parsed.parsedRows === 0
      ? `Could not parse "${name}". We need columns for date, description, and amount (or debit/credit). Nothing was imported.`
      : `Found ${parsed.parsedRows} of ${parsed.totalRows} transactions in "${name}"` +
        (parsed.unparsedRows ? ` (${parsed.unparsedRows} could not be parsed and will be skipped)` : '') +
        `. Spent ${summary.spent.toFixed(2)} · received ${summary.received.toFixed(2)}.` +
        (summary.byCategory.length
          ? ` Top categories: ${summary.byCategory.slice(0, 3).map((c) => `${c.category} ${c.total.toFixed(2)}`).join(', ')}.`
          : '') +
        ' Review, then import.';
  el('statementPreview').innerHTML = parsed.transactions
    .slice(0, 6)
    .map(
      (t) =>
        `<article class="item"><header><h3>${escapeHtml(t.description)}</h3><span class="meta">${t.amount.toFixed(2)}</span></header><p class="meta">${escapeHtml(t.date)} · ${escapeHtml(t.category)}</p></article>`,
    )
    .join('');
  el('statementConfirmBtn').toggleAttribute('disabled', parsed.parsedRows === 0);
  el('statementReview').hidden = false;
}

el('statementCancelBtn').addEventListener('click', () => {
  pendingStatement = null;
  el('statementReview').hidden = true;
});

el('statementConfirmBtn').addEventListener('click', () => {
  if (!pendingStatement) return;
  const { name, parsed } = pendingStatement;
  for (const t of parsed.transactions) {
    ingestDoc(name, `# ${t.description}\nAmount: ${t.amount.toFixed(2)} · Category: ${t.category} · Date: ${t.date}`, {
      type: 'finance',
      at: `${t.date}T12:00:00`,
    });
  }
  el('statementStats').textContent =
    `Imported ${parsed.parsedRows} transactions from "${name}" as dated finance entries. ` +
    'Ask "where does my money go?" in search, then save it as a Finance Path.';
  el('statementPreview').innerHTML = '';
  pendingStatement = null;
  renderAll();
});

let pendingImages: File[] = [];
let pendingImageUrls: string[] = [];

function openImageModal(): void {
  el('imageModal').hidden = false;
}
function closeImageModal(): void {
  el('imageModal').hidden = true;
  for (const url of pendingImageUrls) URL.revokeObjectURL(url);
  pendingImageUrls = [];
  pendingImages = [];
  el('imagePreview').innerHTML = '';
  el('imagePreviewWrap').hidden = true;
  el<HTMLInputElement>('imageFileInput').value = '';
  el('imageModalNote').textContent = '';
}

interface FolderCandidate {
  path: string;
  read: () => Promise<string>;
}

async function syncFolderCandidates(candidates: FolderCandidate[]): Promise<void> {
  const note = el('importTileNote');
  note.textContent = 'Scanning folder…';
  const readable: Array<{ path: string; text: string; hash: string }> = [];
  for (const c of candidates) {
    if (!isSyncablePath(c.path)) continue;
    try {
      const text = await c.read();
      readable.push({ path: c.path, text, hash: hashContent(text) });
    } catch {
      // Unreadable files are skipped and counted below as not imported.
    }
  }
  const manifest = getFolderManifest();
  const diff = diffFolder(manifest, readable);
  let imported = 0;
  for (const path of [...diff.added, ...diff.changed]) {
    const item = readable.find((r) => r.path === path);
    if (!item) continue;
    if (/\.csv$/i.test(path)) {
      const parsed = parseStatement(item.text);
      for (const t of parsed.transactions) {
        ingestDoc(path, `# ${t.description}\nAmount: ${t.amount.toFixed(2)} · Category: ${t.category} · Date: ${t.date}`, {
          type: 'finance',
          at: `${t.date}T12:00:00`,
        });
      }
      imported += parsed.parsedRows;
    } else if (isHtmlFilename(path)) {
      const page = parseJournalHtml(item.text, path.split('/').pop() ?? path);
      imported += ingestDoc(path, page.text, {
        type: 'journal',
        at: page.date ?? undefined,
      }).created;
    } else if (['pdf', 'docx', 'ics', 'vcf'].includes(extensionOf(path))) {
      // Binary formats need the Upload documents path (proper parsers +
      // progress). Calendar/contact text formats fall through below.
      if (extensionOf(path) === 'ics') {
        for (const ev of parseIcs(item.text).slice(0, 200)) {
          imported += ingestDoc(path, `# ${ev.title}\n${ev.description ?? ''}`, {
            type: 'journal',
            at: ev.date,
          }).created;
        }
      } else if (extensionOf(path) === 'vcf') {
        const contacts = parseVcf(item.text);
        if (contacts.length) {
          imported += ingestDoc(path, `# Contacts import\n\n${contacts.map((c) => `- ${c.name}`).join('\n')}`, {
            type: 'relationship',
          }).created;
        }
      }
      // pdf/docx in folders: counted in the manifest, not ingested raw.
    } else if (extensionOf(path) === 'rtf') {
      imported += ingestDoc(path, rtfToText(item.text)).created;
    } else if (extensionOf(path) === 'json') {
      const converted = jsonToText(item.text, path.split('/').pop() ?? path);
      if (converted) imported += ingestDoc(path, converted).created;
    } else {
      imported += ingestDoc(path, item.text).created;
    }
  }
  for (const path of diff.removed) deleteEntriesByLabel(path);
  setFolderManifest(nextManifest(readable));
  note.textContent =
    `Folder synced: ${diff.added.length} new, ${diff.changed.length} changed, ${diff.removed.length} removed, ` +
    `${diff.unchanged} unchanged. ${imported} ${imported === 1 ? 'entry' : 'entries'} updated. Changed files replace their old entries — never duplicates.`;
  renderAll();
}

interface DirHandleLike {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<DirHandleLike | { kind: 'file'; name: string; getFile: () => Promise<File> }>;
}

async function walkDirectory(
  dir: DirHandleLike,
  prefix: string,
  out: FolderCandidate[],
): Promise<void> {
  for await (const handle of dir.values()) {
    const path = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === 'directory') {
      await walkDirectory(handle as DirHandleLike, path, out);
    } else if (handle.kind === 'file') {
      const fileHandle = handle as { getFile: () => Promise<File> };
      out.push({ path, read: async () => (await fileHandle.getFile()).text() });
    }
  }
}

el('folderSyncTile').addEventListener('click', () => {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirHandleLike> }).showDirectoryPicker;
  if (typeof picker === 'function') {
    void picker()
      .then(async (dir) => {
        const out: FolderCandidate[] = [];
        await walkDirectory(dir, dir.name, out);
        await syncFolderCandidates(out);
      })
      .catch(() => undefined); // user cancelled
    return;
  }
  el<HTMLInputElement>('folderInput').click();
});

el<HTMLInputElement>('folderInput').setAttribute('webkitdirectory', '');
el<HTMLInputElement>('folderInput').setAttribute('multiple', '');
el<HTMLInputElement>('folderInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('folderInput');
  if (!input.files) return;
  const candidates: FolderCandidate[] = Array.from(input.files).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    read: () => file.text(),
  }));
  input.value = '';
  void syncFolderCandidates(candidates);
});

el('imageUploadTile').addEventListener('click', openImageModal);
el('imageModalClose').addEventListener('click', closeImageModal);
el('imageModal').addEventListener('click', (ev) => {
  if (ev.target === el('imageModal')) closeImageModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !el('imageModal').hidden) closeImageModal();
});
el('imageBrowseBtn').addEventListener('click', () => {
  el<HTMLInputElement>('imageFileInput').click();
});

function stageImages(files: File[]): void {
  const valid = files.filter((f) => isImageFilename(f.name) || isImageMime(f.type));
  const skipped = files.length - valid.length;
  pendingImages = [...pendingImages, ...valid];
  el('imagePreview').innerHTML = pendingImages
    .map((file) => {
      const url = URL.createObjectURL(file);
      pendingImageUrls.push(url);
      return `<figure><img src="${url}" alt="" /><figcaption>${escapeHtml(file.name)}</figcaption></figure>`;
    })
    .join('');
  el('imagePreviewWrap').hidden = pendingImages.length === 0;
  el('imageModalNote').textContent =
    pendingImages.length === 0
      ? 'No readable images in that selection.'
      : `${pendingImages.length} ${pendingImages.length === 1 ? 'image' : 'images'} ready. Tag a person (optional), then import.` +
        (skipped ? ` ${skipped} non-image ${skipped === 1 ? 'file' : 'files'} skipped.` : '');
}

el<HTMLInputElement>('imageFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('imageFileInput');
  if (input.files) stageImages(Array.from(input.files));
  input.value = '';
});

const dropZone = el('imageDropZone');
dropZone.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (ev) => {
  ev.preventDefault();
  dropZone.classList.remove('drag-over');
  if (ev.dataTransfer?.files) stageImages(Array.from(ev.dataTransfer.files));
});

el('imageImportBtn').addEventListener('click', () => {
  if (pendingImages.length === 0) return;
  const note = el('imageModalNote');
  const btn = el<HTMLButtonElement>('imageImportBtn');
  const manualPerson = el<HTMLInputElement>('imagePersonInput').value.trim();
  const files = [...pendingImages];
  void (async () => {
    btn.disabled = true;
    let done = 0;
    const notes: string[] = [];
    for (const file of files) {
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
          .flatMap((e) => scanEntry(e, getProfile()?.name))
          .filter((f) => f.level === 'high' || f.level === 'warn');
        notes.push(
          `Imported "${file.name}" dated ${at.slice(0, 10)}${exifDate ? ' (from EXIF)' : ''}` +
            (people.length ? `, tagged ${people.join(', ')}` : '') +
            (flags.length
              ? `. Security flag: ${flags.map((f) => f.message).join('; ')} — review in Security.`
              : '.'),
        );
      } catch (err) {
        notes.push(`"${file.name}": ${err instanceof Error ? err.message : 'image import failed.'}`);
      }
    }
    btn.disabled = false;
    if (done > 0) {
      el('imageNote').textContent = notes.join(' ');
      closeImageModal();
      el('imageNote').textContent = notes.join(' ') + ' See them in Network.';
      renderAll();
    } else {
      note.textContent = notes.join(' ');
    }
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
    `<div class="row"><button type="button" class="small" data-action="save-path">Save as Path</button><span class="hint">Pinned in Paths for easy access</span></div>` +
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
  const saveBtn = (ev.target as HTMLElement).closest('button[data-action="save-path"]');
  if (saveBtn) {
    const query = el<HTMLInputElement>('globalSearch').value.trim();
    if (!query) return;
    const budgeting = isBudgetingQuery(query);
    createSavedPath({
      name: budgeting ? 'Finance' : query.slice(0, 60),
      query,
      templateId: budgeting ? 'budgeting' : undefined,
    });
    showView('paths');
    renderPaths();
    return;
  }
  const btn = (ev.target as HTMLElement).closest('button[data-action="view-person"]');
  if (!btn) return;
  showView('knowledge');
  showSub('knowledge', 'network');
});


// --- Archetype agency + archetype-seeded Paths ---

el('synthesisCards').addEventListener('click', (ev) => {
  const pathBtn = (ev.target as HTMLElement).closest('button[data-archetype-path]') as HTMLButtonElement | null;
  if (pathBtn) {
    const archetypeId = pathBtn.getAttribute('data-archetype-path') ?? '';
    const template = templateForArchetype(archetypeId);
    if (!template) return;
    const existing = listSavedPaths().find((x) => x.templateId === template.id);
    const created = existing ?? createSavedPath({ name: template.name, query: template.suggestedQuery, templateId: template.id, archetypeId });
    showView('paths');
    renderPaths();
    showSub('paths', 'path', created.id);
    renderTemplateDetail(created.id);
    return;
  }
  const btn = (ev.target as HTMLElement).closest('button[data-archetype-action]') as HTMLButtonElement | null;
  if (!btn) return;
  const id = btn.getAttribute('data-archetype-id') ?? '';
  const action = btn.getAttribute('data-archetype-action');
  const current = visibleArchetypes(8).find((a) => a.id === id);
  if (!id || !current) return;
  if (action === 'confirm') {
    setArchetypePreference(id, { status: 'confirmed', customLabel: current.customLabel });
  } else if (action === 'dismiss') {
    if (!confirm(`Dismiss “${current.label}”? Hyperself will stop showing it for this workspace.`)) return;
    setArchetypePreference(id, { status: 'dismissed' });
  } else if (action === 'rename') {
    const next = prompt('What should Hyperself call this pattern?', current.label);
    if (next === null) return;
    const clean = next.trim().slice(0, 60);
    if (!clean) return;
    setArchetypePreference(id, { status: 'confirmed', customLabel: clean });
  } else {
    return;
  }
  synthesisKey = '';
  renderAll();
});

// --- Packs ---

el('exportBtn').addEventListener('click', () => {
  const log = el('packLog');
  void (async () => {
    try {
      const risky = listEntries().filter(
        (e) => e.tag === 'shareable' && scanEntry(e, getProfile()?.name).some((f) => f.level === 'high'),
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

type InsightHistoryKind = 'approved' | 'dismissed';

function insightCard(
  insight: Insight,
  pinned: boolean,
  acked: boolean,
  history?: { kind: InsightHistoryKind | 'archetype-dismissed'; at?: string },
): string {
  const labels: Record<string, string> = {
    'goto-library': 'Review in Synthesis',
    'goto-import': 'Add context via Import',
    acknowledge: 'Mark as reviewed',
    expound: 'Expound',
  };
  let buttons: string;
  let historyLine = '';
  if (history?.kind === 'approved') {
    buttons = '<button type="button" class="small" data-action="unack">Undo</button>';
    historyLine = `<p class="meta">Approved${history.at ? ` · ${escapeHtml(history.at.slice(0, 10))}` : ''}</p>`;
  } else if (history?.kind === 'dismissed') {
    buttons = '<button type="button" class="small" data-action="undismiss">Restore</button>';
    historyLine = `<p class="meta">Dismissed${history.at ? ` · ${escapeHtml(history.at.slice(0, 10))}` : ''}</p>`;
  } else if (history?.kind === 'archetype-dismissed') {
    buttons = `<button type="button" class="small" data-action="restore-archetype" data-archetype-id="${escapeHtml(insight.archetypeId ?? '')}">Restore</button>`;
    historyLine = '<p class="meta">Dismissed · archetype marked “Not me”</p>';
  } else if (acked) {
    buttons = '<button type="button" class="small" data-action="unack">Undo</button>';
  } else {
    buttons =
      `${insight.kinds.map((k) => `<button type="button" class="small" data-action="${k}">${labels[k]}</button>`).join('')}` +
      '<button type="button" class="small" data-action="dismiss">Dismiss</button>' +
      `<button type="button" class="small" data-action="pin">${pinned ? 'Unpin' : 'Pin'}</button>`;
  }
  return `<article class="item${history || acked ? ' dimmed' : ''}" data-insight="${insight.id}">
    <header><h3>${escapeHtml(insight.title)}</h3><span class="sev-${insight.severity}">${insight.severity}</span></header>
    ${insight.archetypeId ? `<p><span class="archetype-pill">Lens: ${escapeHtml(archetypeLensLabel(insight.archetypeId))}</span></p>` : ''}
    <p>${escapeHtml(insight.body)}</p>
    ${historyLine}
    ${insight.nextStep ? `<p class="meta"><strong>Next step:</strong> ${escapeHtml(insight.nextStep)}</p>` : ''}
    <div class="log" data-expound hidden></div>
    <div class="row" style="margin-top:0.5rem">${buttons}</div>
  </article>`;
}

function renderAllTemplates(): void {
  const entries = listEntries();
  el('allTemplateList').innerHTML = PATH_TEMPLATES.map((t) => {
    const readiness = templateReadiness(entries, t);
    const checklist = [
      ...readiness.have.map((h) => `<p class="meta">Have: ${escapeHtml(h)}</p>`),
      ...readiness.missing.map((m) => `<p class="meta">Needs: ${escapeHtml(m)}</p>`),
    ].join('');
    return `<article class="item">
      <header><h3>${escapeHtml(t.name)}</h3></header>
      <p>${escapeHtml(t.description)}</p>
      ${checklist}
      <p class="meta">Creates: ${t.scaffold.map(escapeHtml).join(' · ')}</p>
      <p class="meta">${readiness.ready ? 'Ready — find it under Suggested Paths on Insights.' : 'Not ready yet — add the data above and it will be suggested on Insights.'}</p>
    </article>`;
  }).join('');
}

function pathDisplayName(path: { name: string; templateId?: string }): string {
  return path.templateId === 'budgeting' ? 'Finance' : path.name;
}

function renderSavedPaths(): void {
  const entries = listEntries();
  const saved = listSavedPaths();
  // The Finance Path stays hidden until financial data has been shared.
  const financeCount = entries.filter((e) => e.type === 'finance').length;
  const displaySaved = saved.filter((x) => x.templateId !== 'budgeting' || financeCount > 0);
  el('savedPathList').innerHTML = displaySaved.length
    ? displaySaved
        .map(
          (path) => `<article class="item" data-saved-path="${path.id}">
        <header><h3>${escapeHtml(pathDisplayName(path))}</h3><span class="meta">${path.pinned ? 'Pinned · ' : ''}${path.templateId ? escapeHtml(templateById(path.templateId)?.name ?? '') : 'From an ask'}${path.archetypeId ? ` · Lens: ${escapeHtml(archetypeLensLabel(path.archetypeId))}` : ''}</span></header>
        <p class="meta">Ask: “${escapeHtml(path.query)}”</p>
        <div class="row" style="margin-top:0.5rem">
          <button type="button" class="small" data-path-action="open">Open</button>
          <button type="button" class="small" data-path-action="pin">${path.pinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" class="small" data-path-action="delete">Delete</button>
        </div>
      </article>`,
        )
        .join('')
    : '<p class="hint">No saved Paths yet. Ask in search and save it, or start from a template below.</p>';

  // Suggested templates only appear when related data has been shared.
  const visible = visibleSuggestedTemplates(entries, saved.map((x) => x.templateId));
  el('templateList').innerHTML = visible.length
    ? visible
        .map((x) => {
          const t = x.template;
          const readiness = templateReadiness(entries, t);
          const checklist = [
            ...readiness.have.map((h) => `<p class="meta">Have: ${escapeHtml(h)}</p>`),
            ...readiness.missing.map((m) => `<p class="meta">Needs: ${escapeHtml(m)}</p>`),
          ].join('');
          return `<article class="item hero-card">
      <header><h3>Hyperself suggests: ${escapeHtml(t.name)}</h3><span class="archetype-pill">Suggested for you</span></header>
      <p>${escapeHtml(t.description)}</p>
      ${checklist}
      <p class="meta">Creates: ${t.scaffold.map(escapeHtml).join(' · ')}</p>
      <p class="meta">${escapeHtml(x.reason)} No manual setup — it parses what you already uploaded.</p>
      <div class="row" style="margin-top:0.5rem"><button type="button" class="small" data-template-start="${t.id}">Start ${escapeHtml(t.name)} Path</button></div>
    </article>`;
        })
        .join('')
    : '<p class="hint">No suggested Paths yet. Hyperself suggests a Path only when you have shared related data — nothing is pushed at you before then.</p>';

  // Badge beside the Paths menu: your Paths + suggested Paths ready to start.
  const count = availablePathCount(entries, displaySaved);
  const badge = el('pathsBadge');
  badge.hidden = count === 0;
  badge.textContent = String(count);
  badge.title = `${displaySaved.length} saved · ${visible.length} suggested`;

  // Pinned Paths become subtabs in the Paths submenu strip.
  const pinned = displaySaved.filter((x) => x.pinned);
  el('pinnedPathTabs').innerHTML = pinned
    .map((x) => `<button type="button" data-sub="path" data-path-id="${x.id}">${escapeHtml(pathDisplayName(x))}</button>`)
    .join('');
}

function renderBudgetDetail(pathId: string): void {
  const host = el('budgetDetail');
  const path = listSavedPaths().find((x) => x.id === pathId);
  if (!path || path.templateId !== 'budgeting') {
    host.innerHTML = '';
    return;
  }
  const tx = transactionsFromEntries(listEntries());
  if (tx.length === 0) {
    host.innerHTML =
      '<article class="item"><header><h3>Finance</h3></header><p class="hint">No statement data yet. Import a bank statement (CSV) via Upload documents in Import & Connect and this Path fills in automatically.</p></article>';
    return;
  }
  const summary = summarizeTransactions(tx);
  const maxCat = Math.max(1, ...summary.byCategory.map((c) => c.total));
  const cats = summary.byCategory
    .map(
      (c) => `<div class="budget-row"><span>${escapeHtml(c.category)}</span><span class="budget-bar"><span style="width:${Math.round((c.total / maxCat) * 100)}%"></span></span><strong>${c.total.toFixed(2)}</strong><span class="meta">${summary.spent ? Math.round((c.total / summary.spent) * 100) : 0}%</span></div>`,
    )
    .join('');
  const months = monthlyTotals(tx);
  const maxMonth = Math.max(1, ...months.map((m) => m.spent));
  const trend = months
    .map(
      (m) => `<div class="budget-row"><span>${escapeHtml(m.month)}</span><span class="budget-bar trend"><span style="width:${Math.round((m.spent / maxMonth) * 100)}%"></span></span><strong>${m.spent.toFixed(2)}</strong><span class="meta">in ${m.received.toFixed(2)}</span></div>`,
    )
    .join('');
  const recurring = recurringCosts(tx)
    .map(
      (r) => `<p class="meta">• ${escapeHtml(r.description)} — ${r.count}×, avg ${r.average.toFixed(2)} (${escapeHtml(r.category)})</p>`,
    )
    .join('');
  const insights = budgetInsights(tx).map((i) => `<p>• ${escapeHtml(i)}</p>`).join('');
  host.innerHTML = `<article class="item hero-card">
    <header><h3>${escapeHtml(path.name)} — your money, clearly</h3></header>
    <p>Spent ${summary.spent.toFixed(2)} · Received ${summary.received.toFixed(2)} · Net ${(summary.received - summary.spent).toFixed(2)} across ${tx.length} transactions (${escapeHtml(tx[0].date)} to ${escapeHtml(tx[tx.length - 1].date)}).</p>
    <h3 class="ov-sub">Spending by category</h3>${cats}
    <h3 class="ov-sub">Monthly trend</h3>${trend || '<p class="hint">Not enough months yet.</p>'}
    ${recurring ? `<h3 class="ov-sub">Recurring costs</h3>${recurring}` : ''}
    <h3 class="ov-sub">What stands out</h3>${insights}
  </article>`;
}


function renderArchetypePathDetail(pathId: string): void {
  const host = el('budgetDetail');
  const path = listSavedPaths().find((x) => x.id === pathId);
  if (!path || (path.templateId !== 'relationship-rhythms' && path.templateId !== 'reading-life')) return;
  const entries = listEntries();
  if (path.templateId === 'relationship-rhythms') {
    const rhythms = relationshipRhythms(entries);
    const recent = rhythms.slice().sort((a, b) => a.daysQuiet - b.daysQuiet).slice(0, 5);
    const quiet = rhythms.filter((r) => r.daysQuiet >= 90).slice(0, 5);
    const row = (r: (typeof rhythms)[number]) => `<p class="meta">• ${escapeHtml(r.name)} — ${r.mentions} mentions · last mentioned ${r.daysQuiet === 0 ? 'today' : `${r.daysQuiet} days ago`}</p>`;
    host.innerHTML = `<article class="item hero-card"><header><h3>${escapeHtml(path.name)}${path.archetypeId ? ` — ${escapeHtml(archetypeLensLabel(path.archetypeId))} lens` : ''}</h3></header><p>Descriptive relationship recency from your own entries. Quiet does not mean unimportant — only you know the context.</p><h3 class="ov-sub">Most recently mentioned</h3>${recent.map(row).join('') || '<p class="hint">No people yet.</p>'}${quiet.length ? `<h3 class="ov-sub">Gone quiet (90+ days)</h3>${quiet.map(row).join('')}` : ''}</article>`;
    return;
  }
  const summary = readingLifeSummary(entries);
  host.innerHTML = `<article class="item hero-card"><header><h3>${escapeHtml(path.name)}${path.archetypeId ? ` — ${escapeHtml(archetypeLensLabel(path.archetypeId))} lens` : ''}</h3></header><p>${escapeHtml(summary.pattern)}</p><div class="budget-row"><span>Finished/reading</span><span class="budget-bar"><span style="width:${summary.read + summary.collect ? Math.round((summary.read / (summary.read + summary.collect)) * 100) : 0}%"></span></span><strong>${summary.read}</strong><span class="meta">signals</span></div><div class="budget-row"><span>Collected/TBR</span><span class="budget-bar trend"><span style="width:${summary.read + summary.collect ? Math.round((summary.collect / (summary.read + summary.collect)) * 100) : 0}%"></span></span><strong>${summary.collect}</strong><span class="meta">signals</span></div><p class="meta">This Path describes the pattern; it does not prescribe what you should read next.</p></article>`;
}

function renderTemplateDetail(pathId: string): void {
  const path = listSavedPaths().find((x) => x.id === pathId);
  if (!path) { el('budgetDetail').innerHTML = ''; return; }
  if (path.templateId === 'budgeting') renderBudgetDetail(pathId);
  else renderArchetypePathDetail(pathId);
}

function renderPaths(): void {
  const entries = listEntries();
  const empty = entries.length === 0;
  el('pathsEmpty').hidden = !empty && listSavedPaths().length === 0;
  el('pathsContent').hidden = empty && listSavedPaths().length === 0;
  renderSavedPaths();
  renderAllTemplates();
  if (empty) return;
  const archPrefs = getArchetypePreferences();
  const allInsights = buildInsights(entries);
  const state = loadPathsState();
  const isArchDismissed = (i: Insight): boolean =>
    Boolean(i.archetypeId) && archPrefs[i.archetypeId!]?.status === 'dismissed';
  const active = allInsights.filter(
    (i) => state.acked[i.id] === undefined && state.dismissed[i.id] === undefined && !isArchDismissed(i),
  );
  const historyCards = [
    ...allInsights
      .filter((i) => state.acked[i.id] !== undefined)
      .map((i) => insightCard(i, false, true, { kind: 'approved', at: state.acked[i.id] })),
    ...allInsights
      .filter((i) => state.acked[i.id] === undefined && state.dismissed[i.id] !== undefined)
      .map((i) => insightCard(i, false, false, { kind: 'dismissed', at: state.dismissed[i.id] })),
    ...allInsights
      .filter((i) => state.acked[i.id] === undefined && state.dismissed[i.id] === undefined && isArchDismissed(i))
      .map((i) => insightCard(i, false, false, { kind: 'archetype-dismissed' })),
  ];
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
  el('ackedList').innerHTML = historyCards.length
    ? historyCards.join('')
    : '<p class="hint">Nothing approved or dismissed yet.</p>';
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
  } else if (action === 'dismiss') {
    dismissInsight(id);
    renderPaths();
  } else if (action === 'undismiss') {
    undismissInsight(id);
    renderPaths();
  } else if (action === 'restore-archetype') {
    const archetypeId = btn.getAttribute('data-archetype-id') ?? '';
    if (archetypeId) clearArchetypePreference(archetypeId);
    synthesisKey = '';
    renderAll();
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

el('savedPathList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-path-action]') as HTMLButtonElement | null;
  const card = (ev.target as HTMLElement).closest('[data-saved-path]');
  if (!btn || !card) return;
  const id = card.getAttribute('data-saved-path') ?? '';
  const action = btn.getAttribute('data-path-action');
  const path = listSavedPaths().find((x) => x.id === id);
  if (!path) return;
  if (action === 'delete') {
    deleteSavedPath(id);
    el('budgetDetail').innerHTML = '';
    renderPaths();
  } else if (action === 'pin') {
    setSavedPathPinned(id, !path.pinned);
    renderPaths();
  } else if (action === 'open') {
    showSub('paths', 'path', id);
    renderTemplateDetail(id);
    el<HTMLInputElement>('globalSearch').value = path.query;
    showView('paths');
    void runTopSearch();
  }
});

el('templateList').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-template-start]') as HTMLButtonElement | null;
  if (!btn || btn.disabled) return;
  const template = templateById(btn.getAttribute('data-template-start') ?? '');
  if (!template) return;
  const suggestion = suggestTemplates(listEntries()).find((x) => x.template.id === template.id);
  const created = createSavedPath({
    name: template.name,
    query: template.suggestedQuery,
    templateId: template.id,
    archetypeId: suggestion?.archetypeId ?? template.archetypeId,
  });
  renderPaths();
  showSub('paths', 'path', created.id);
  renderTemplateDetail(created.id);
});

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
  paths: { insights: 'sub-insights', templates: 'sub-templates', history: 'sub-history', security: 'sub-security-paths', path: 'sub-path-detail' },
  legacy: { export: 'sub-export' },
};

function showSub(view: string, name: string, pathId?: string): void {
  document
    .querySelectorAll(`#subnav-${view} button[data-sub]`)
    .forEach((b) => {
      const btn = b as HTMLElement;
      const matches = btn.dataset.sub === name && (!pathId || btn.dataset.pathId === pathId);
      btn.classList.toggle('active', matches);
    });
  const panes = SUB_PANES[view] ?? {};
  for (const [key, id] of Object.entries(panes)) {
    el(id).hidden = key !== name;
  }
}

el('subnavBar').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button[data-sub]') as HTMLButtonElement | null;
  if (!btn) return;
  const group = btn.closest('.subnav')?.id.replace('subnav-', '') ?? 'knowledge';
  const name = btn.dataset.sub ?? 'library';
  if (group === 'paths' && name === 'path' && btn.dataset.pathId) {
    showSub('paths', 'path', btn.dataset.pathId);
    renderTemplateDetail(btn.dataset.pathId);
    return;
  }
  showSub(group, name);
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
    .attr('stroke', '#d2d1e5').attr('stroke-width', 2);
  const dots = svg.append('g').selectAll<SVGCircleElement, (typeof ctx.timeline)[number]>('circle')
    .data(ctx.timeline).join('circle')
    .attr('cx', (d) => x(d.at))
    .attr('cy', 62)
    .attr('r', (d) => (d.key ? 9 : 5))
    .attr('fill', (d) => (d.key ? '#05006d' : '#ebebf3'))
    .attr('stroke', '#05006d')
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
    .attr('stroke', '#d2d1e5')
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
    .attr('fill', (d) => (d.center ? '#05006d' : '#ffffff'))
    .attr('stroke', (d) => (d.center ? '#05006d' : '#a59acb'))
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
    .attr('fill', (d) => (d.center ? '#ffffff' : '#05006d'))
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
    for (const f of scanEntry(e, getProfile()?.name)) {
      if (f.level === 'high') {
        actionable.push({ title: e.title, message: f.message, suggestion: f.suggestion });
      } else if (f.level === 'warn') {
        warn += 1;
      }
    }
  }
  for (const badgeId of ['secBadge', 'secBadgePaths']) {
    const badge = el(badgeId);
    badge.hidden = actionable.length === 0;
    badge.textContent = String(actionable.length);
  }
  const summaryHtml =
    entries.length === 0
      ? '<p class="hint">No knowledge uploaded yet — link an account in Import & Connect and findings will appear here.</p>'
      : `<p>${actionable.length} actionable ${actionable.length === 1 ? 'insight' : 'insights'} · ${warn} warnings across ${entries.length} entries.</p>`;
  el('securitySummary').innerHTML = summaryHtml;
  el('pathsSecuritySummary').innerHTML = summaryHtml;
  const listHtml = actionable.length
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
  el('securityList').innerHTML = listHtml;
  el('pathsSecurityList').innerHTML = listHtml;
}

for (const listId of ['securityList', 'pathsSecurityList']) {
  el(listId).addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button[data-action="sec-paths"]');
    if (!btn) return;
    showView('paths');
    showSub('paths', 'insights');
  });
}

// --- Vault gate: nothing renders user data until unlock ---
let pendingVaultKey: CryptoKey | null = null;

function finishUnlock(): void {
  el('lockOverlay').hidden = true;
  renderAll();
  if (obShouldShow()) {
    el('onboarding').hidden = false;
    obRender();
  }
}

function showLockGate(): void {
  const setupMode = !hasVault();
  el('lockTitle').textContent = setupMode ? 'Create your vault' : 'Unlock Hyperself';
  el('lockHint').textContent = setupMode
    ? 'Choose a PIN. Your knowledge will be encrypted on this device; add biometrics after setup if you like.'
    : 'Your knowledge is encrypted on this device.';
  el('lockPinConfirmLabel').hidden = !setupMode;
  el('lockUnlockBtn').textContent = setupMode ? 'Create vault' : 'Unlock';
  el('lockBioBtn').hidden = setupMode || !biometricAvailable();
  el('lockEnrollBioBtn').hidden = true;
  el('lockOverlay').hidden = false;
  el<HTMLInputElement>('lockPin').focus();
}

el('lockUnlockBtn').addEventListener('click', () => {
  const pin = el<HTMLInputElement>('lockPin').value;
  const error = el('lockError');
  error.textContent = '';
  if (pendingVaultKey && hasVault()) {
    finishUnlock();
    return;
  }
  void (async () => {
    try {
      if (!hasVault()) {
        if (pin !== el<HTMLInputElement>('lockPinConfirm').value) {
          throw new Error('PINs do not match.');
        }
        pendingVaultKey = await setupVault(pin);
        await activateVault(pendingVaultKey);
        if (biometricAvailable()) {
          el('lockEnrollBioBtn').hidden = false;
          el('lockHint').textContent = 'Vault created. Enable biometrics now, or continue with PIN only.';
          el('lockUnlockBtn').textContent = 'Continue with PIN only';
          return;
        }
        finishUnlock();
        return;
      }
      await activateVault(await unlockWithPin(pin));
      finishUnlock();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : 'Unlock failed.';
    }
  })();
});

el('lockEnrollBioBtn').addEventListener('click', () => {
  if (!pendingVaultKey) return;
  void enrollBiometric(pendingVaultKey)
    .then(() => finishUnlock())
    .catch((err: unknown) => {
      el('lockError').textContent =
        (err instanceof Error ? err.message : 'Biometric enrollment failed.') + ' Continuing with PIN.';
      finishUnlock();
    });
});

el('lockBioBtn').addEventListener('click', () => {
  el('lockError').textContent = '';
  void unlockWithBiometric()
    .then(async (key) => {
      await activateVault(key);
      finishUnlock();
    })
    .catch((err: unknown) => {
      el('lockError').textContent = err instanceof Error ? err.message : 'Biometric unlock failed. Use your PIN.';
    });
});

// --- Offline proof: register the service worker + live offline badge ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
function renderOnlineState(): void {
  el('offlineBadge').hidden = navigator.onLine;
}
window.addEventListener('online', renderOnlineState);
window.addEventListener('offline', renderOnlineState);
renderOnlineState();

showLockGate();
