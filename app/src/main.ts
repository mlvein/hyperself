// UI wiring. Cloud key lives in module memory only — never persisted.
//
// IA: main menu (Knowledgebase / Paths / Legacy) lives in the sidebar
// with Settings pinned at its bottom; the active view's subsections
// sit in a strip at the top of the main view. Knowledgebase shows AI synthesis only
// (raw entries are never listed), Network owns people tagging after
// synthesis, Paths shows local insights, Legacy handles packs.
import {
  StoreError,
  clearAll,
  createEntry,
  getProfile,
  getProfilePhoto,
  setProfilePhoto,
  insertImported,
  listEntries,
  listPeople,
  setEmbeddingStatus,
  setEntryTag,
  setProfile,
  addPersonNote,
  listPersonNotes,
  activateVault,
  createKnowledgePack,
  createSavedPath,
  deleteKnowledgePack,
  deleteEntriesByLabel,
  listKnowledgePacks,
  recordPackExport,
  setKnowledgePackPinned,
  updateKnowledgePack,
  getFolderManifest,
  setFolderManifest,
  deleteSavedPath,
  listSavedPaths,
  setSavedPathPinned,
  clearArchetypePreference,
  getArchetypePreferences,
  hydrateStore,
  setArchetypePreference,
} from './store';
import { PackError, curatedPackEntries, exportPackText, importPackText } from './pack';
import { createBackup, restoreBackup } from './backup';
import {
  DEFAULT_AUGMENTED_CONFIG,
  buildDerivedProfile,
  getAugmentedKey,
  hostOf,
  isAllowedHost,
  isAugmentableAsk,
  recordConsent,
  revokeAugmented,
  sendAugmented,
  setAugmentedKey,
  type DerivedLearningProfile,
} from './augmented';
import { StubEngine, cleanDraftText, initLocalEngine, isPromptLeak, loadGlimmerConfig, probeGlimmer, saveGlimmerConfig, tierLabel, type LocalEngine } from './engine';
import { embedEntry, embedText, hydrateVectors, loadVectors } from './embeddings';
import { hashContent, ingestDoc } from './ingest';
import { diffFolder, isSyncablePath, nextManifest } from './foldersync';
import { isHtmlFilename, parseJournalHtml } from './html';
import { docxToText, extensionOf, healthXmlToText, jsonToText, mboxToText, needsOcrFallback, parseIcs, parseVcf, pdfPasswordKind, pdfToOcrText, pdfToText, rtfToText, unzipTextEntries } from './formats';
import { EXPORT_GUIDES } from './guides';
import { isAudioFilename, isAudioMime, transcribeAudioBlob } from './transcribe';
import { fileToProfilePhoto, isImageFilename, isImageMime, ocrImageBlob, parseExifDate } from './image';
import { FINANCE_GROUP_KEYS, budgetInsights, cumulativeNetByMonth, financeBreakdown, financeGroupKey, groupFinance, looksLikePdfStatement, monthlyCategorySeries, monthlyTotals, parsePdfStatement, parseStatement, recurringCosts, summarizeTransactions, transactionsFromEntries, type FinanceGroupKey, type StatementParse, type Transaction } from './budget';
import { PATH_TEMPLATES, availablePathCount, healthSummary, isBudgetingQuery, isHealthQuery, readingLifeSummary, relationshipRhythms, suggestTemplates, templateById, templateForArchetype, templateReadiness, visibleSuggestedTemplates } from './templates';
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
import { GRANULARITY_LEVELS, buildTimeline, type TimelineGap, type TimelineGranularity, type TimelineTag } from './timeline';
import { applyLocale, isLocale, loadLocale, saveLocale, t, type Locale } from './i18n';
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
import { applyArchetypePreferences, computeArchetypeTimeline, computeArchetypes, type Archetype } from './archetypes';
import type { Entry, EntryType, Tag } from './types';

let engine: LocalEngine = new StubEngine();

function renderSynthesisModelLabel(): void {
  const label = document.getElementById('synthesisModelLabel');
  if (!label) return;
  const cfg = loadGlimmerConfig();
  label.textContent = `${cfg.model} · ${tierLabel(cfg.model)} · ${cfg.endpoint}`;
}

async function connectEngine(): Promise<void> {
  const status = document.getElementById('glimmerStatus');
  const { engine: ready, notice } = await initLocalEngine();
  engine = ready;
  if (status) status.textContent = notice;
  renderSynthesisModelLabel();
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
  const setTierModel = (model: string): void => {
    if (modelInput) modelInput.value = model;
    saveGlimmerConfig({ endpoint: endpointInput?.value ?? '', model });
    const status = document.getElementById('glimmerStatus');
    if (status) status.textContent = `Reconnecting with ${model}…`;
    void connectEngine().then(() => {
      if (listEntries().length > 0) void maybeSynthesize(listEntries());
    });
  };
  document.getElementById('glimmerTierLight')?.addEventListener('click', () => setTierModel('llama3.2:3b'));
  document.getElementById('glimmerTierDeep')?.addEventListener('click', () => setTierModel('muse-glimmer'));
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

let activeLocale: Locale = loadLocale();
let currentView = 'knowledge';

/** One search bar for the whole app: it is moved (never duplicated) into
 * the active view's slot at the top of that view, with a per-view hint.
 * Views without a slot (Settings) park it in its hidden home. */
function mountSearch(view: string): void {
  const bar = document.querySelector('.searchbar');
  if (!bar) return;
  const slot = document.querySelector(`[data-search-slot="${view}"]`);
  const home = document.getElementById('searchHome');
  (slot ?? home)?.appendChild(bar);
  const input = document.getElementById('globalSearch') as HTMLInputElement | null;
  if (input) {
    const key = view === 'paths' || view === 'legacy' || view === 'network' || view === 'timeline' ? `search.${view}` : 'search.knowledge';
    input.placeholder = t(activeLocale, key);
  }
}

/** On Knowledgebase, the Network sub-view has its own overlaid search. */
function searchTargetFor(view: string): string {
  return view === 'knowledge' && !el('sub-network').hidden ? 'network' : view;
}

let knowledgeSub = 'library';

function syncSidebarActive(): void {
  document.querySelectorAll('.sidebar-nav button').forEach((b) => {
    const btn = b as HTMLElement;
    const sub = btn.dataset.subLink;
    const active = sub
      ? currentView === 'knowledge' && (sub === 'library' ? knowledgeSub === 'library' || knowledgeSub === 'security' : knowledgeSub === sub)
      : btn.dataset.view === currentView;
    btn.classList.toggle('active', active);
  });
}

function showView(view: string): void {
  currentView = view;
  mountSearch(searchTargetFor(view));
  syncSidebarActive();
  el('settingsNavBtn').classList.toggle('active', view === 'settings');
  el('guideNavBtn').classList.toggle('active', view === 'guide');
  for (const section of document.querySelectorAll('main > section')) {
    (section as HTMLElement).hidden = section.id !== `view-${view}`;
  }
  for (const id of ['knowledge', 'legacy', 'paths']) {
    el(`subnav-${id}`).hidden = id !== view;
  }
  el('subnavBar').hidden = view === 'settings' || view === 'guide' || view === 'timeline';
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    showView(btn.dataset.view ?? 'knowledge');
    if (btn.dataset.subLink) showSub('knowledge', btn.dataset.subLink);
  });
});
el('settingsNavBtn').addEventListener('click', () => showView('settings'));
el('guideNavBtn').addEventListener('click', () => showView('guide'));
document.getElementById('openSettingsBtn')?.addEventListener('click', () => showView('settings'));
document.getElementById('settingsLegacyBtn')?.addEventListener('click', () => showView('legacy'));
document.getElementById('settingsSecurityBtn')?.addEventListener('click', () => {
  showView('knowledge');
  showSub('knowledge', 'security');
});

// --- Language (Settings): chrome only; entries are never translated ---
applyLocale(activeLocale);
document.getElementById('languageSelect')?.addEventListener('change', (ev) => {
  const value = (ev.target as HTMLSelectElement).value;
  if (!isLocale(value)) return;
  activeLocale = value;
  saveLocale(activeLocale);
  applyLocale(activeLocale);
  mountSearch(searchTargetFor(currentView));
});

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
  el('profileName').textContent = name;
  const pills = el('archetypePills');
  if (archetypes.length && !pills.querySelector('.archetype-note')) {
    pills.insertAdjacentHTML(
      'beforeend',
      '<span class="hint archetype-note">Playful patterns from your data — not labels, not diagnoses.</span>',
    );
  }
  const photo = getProfilePhoto();
  el('profileAvatar').innerHTML = photo
    ? `<img src="${photo}" alt="Profile photo" />`
    : escapeHtml(name ? name.slice(0, 1).toUpperCase() : '?');
  el('profileBlurb').textContent = limitTwoSentences(blurb);
}

// Profile picture: one downsized copy stored in the DB (see store.ts).
// The picked file itself is never referenced after this handler runs.
// Clicking the avatar opens the upload/edit modal (no upload button).
function openProfilePhotoModal(): void {
  const photo = getProfilePhoto();
  const name = getProfile()?.name ?? '';
  el('profilePhotoPreview').innerHTML = photo
    ? `<img src="${photo}" alt="Current profile photo" />`
    : `<span class="preview-initial" aria-hidden="true">${escapeHtml(name ? name.slice(0, 1).toUpperCase() : '?')}</span>`;
  el('profilePhotoUploadBtn').textContent = photo ? 'Replace photo' : 'Upload photo';
  el('profilePhotoModalRemoveBtn').hidden = !photo;
  el('profilePhotoModal').hidden = false;
}
function closeProfilePhotoModal(): void {
  el('profilePhotoModal').hidden = true;
}
el('profileAvatar').addEventListener('click', openProfilePhotoModal);
el('profileAvatar').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    openProfilePhotoModal();
  }
});
el('profilePhotoUploadBtn').addEventListener('click', () => el('profilePhotoInput').click());
el('profilePhotoModalRemoveBtn').addEventListener('click', () => {
  setProfilePhoto(null);
  el('profilePhotoNote').textContent = 'Profile photo removed.';
  renderAll();
  openProfilePhotoModal();
});
el('profilePhotoModalClose').addEventListener('click', closeProfilePhotoModal);
el('profilePhotoModal').addEventListener('click', (ev) => {
  if (ev.target === el('profilePhotoModal')) closeProfilePhotoModal();
});
el<HTMLInputElement>('profilePhotoInput').addEventListener('change', (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  void fileToProfilePhoto(file)
    .then((dataUrl) => {
      setProfilePhoto(dataUrl);
      el('profilePhotoNote').textContent = 'Profile photo saved on this device.';
      renderAll();
      openProfilePhotoModal();
    })
    .catch((err: unknown) => {
      el('profilePhotoNote').textContent =
        err instanceof Error ? err.message : 'That image could not be used as a profile photo.';
    });
});

function renderSynthesisCards(_overviewBody = ''): void {
  void _overviewBody;
  const a = currentAnalysis();
  const cards = buildSynthesisCards(listEntries(), a);
  const available = visibleArchetypes(8);
  renderArchetypeSpider(available);
  const badge = el('archetypesBadge');
  badge.hidden = available.length === 0;
  badge.textContent = String(available.length);
  const archetypeCards = available
    .map((arch) => {
      const template = templateForArchetype(arch.id);
      return `<article class="item archetype-card" data-archetype-card="${arch.id}">
        <header><h3>${escapeHtml(arch.label)}</h3><span class="archetype-pill">${arch.confirmed ? 'Confirmed archetype' : 'Archetype'}</span></header>
        <p>${escapeHtml(arch.meaning)}</p>
        <p class="meta">Why this fits: ${escapeHtml(arch.evidence)}.</p>
        <div class="arch-detail-row"><span>Strength</span><span class="budget-bar" aria-hidden="true"><span style="width:${arch.strength}%"></span></span><strong>${arch.strength}/100</strong></div>
        <div class="arch-detail-row"><span>Confidence</span><span class="budget-bar" aria-hidden="true"><span style="width:${arch.confidence}%"></span></span><strong>${arch.confidence}/100</strong></div>
        <p class="meta">Trend: ${escapeHtml(arch.trend)} · Signal score ${arch.score}</p>
        <p class="meta">Watch for: ${escapeHtml(arch.watchFor)}</p>
        <div class="row" style="margin-top:0.5rem">
          <button type="button" class="small secondary" data-archetype-action="confirm" data-archetype-id="${arch.id}">${arch.confirmed ? 'Confirmed' : 'Confirm'}</button>
          <button type="button" class="small secondary" data-archetype-action="rename" data-archetype-id="${arch.id}">Rename</button>
          <button type="button" class="small secondary" data-archetype-action="dismiss" data-archetype-id="${arch.id}">Not me</button>
          ${template ? `<button type="button" class="small" data-archetype-path="${arch.id}">Start a Path from this archetype</button>` : ''}
        </div>
      </article>`;
    })
    .join('');
  const eras = computeArchetypeTimeline(listEntries());
  const timelineCard = eras.length > 1
    ? `<article class="item"><header><h3>How your archetypes changed</h3></header>${eras.map((era) => `<p class="meta"><strong>${escapeHtml(era.label)}:</strong> ${applyArchetypePreferences(era.archetypes, getArchetypePreferences()).map((a) => escapeHtml(a.label)).join(' · ') || 'Patterns forming'}</p>`).join('')}</article>`
    : '';
  el('archetypeCards').innerHTML = available.length
    ? timelineCard + archetypeCards
    : '<div class="card"><h2>No archetypes yet</h2><p class="hint">Add more knowledge in Import &amp; Connect and patterns will appear here.</p></div>';
  el('synthesisCards').innerHTML =
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

function setSynthProgress(percent: number, text: string): void {
  const wrap = el('synthesisProgress');
  wrap.hidden = false;
  el('synthesisProgressFill').style.width = `${percent}%`;
  el('synthesisProgressText').textContent = text;
}

function hideSynthProgress(): void {
  el('synthesisProgress').hidden = true;
  el('synthesisProgressFill').style.width = '0%';
  el('synthesisProgressText').textContent = '';
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
  setSynthProgress(10, `Reading your ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} on this device…`);
  const a = currentAnalysis();
  const archetypes = visibleArchetypes();
  const essence = buildEssence(entries, archetypes);
  setSynthProgress(35, 'Finding patterns — kinds of knowledge, people, and themes across your entries…');
  const facts = [
    essence.summary,
    ...essence.traits,
    ...(essence.aspirations.length ? [`Aspirations: ${essence.aspirations.join(' ')}`] : []),
    ...(essence.potential.length ? [`Potential: ${essence.potential.join(' ')}`] : []),
  ].join(' ');
  const archetypeFacts = archetypes.map((x) => x.meaning.split('.')[0]).join('; ');
  renderSynthesisCards('Synthesizing…');
  renderProfileCard('Synthesizing who you are from everything you have shared…');
  setSynthProgress(
    65,
    /stub/.test(engine.name)
      ? 'Writing your synthesis from those patterns, on this device…'
      : `Asking ${engine.name.replace(/ \(on this device\)$/, '')} on this device to draft your synthesis from those patterns…`,
  );
  try {
    const reply = await engine.draft(
      `Describe my essence as a person in a maximum of two sentences: who I am at my core, what I aspire to, and my potential. ` +
        `Use second person. Never mention other people by name, entry counts, data sources, or how much I have uploaded. ` +
        `Essence: ${facts} Archetypes: ${archetypeFacts || 'none yet'}.`,
      entries.slice(0, 6),
    );
    if (listEntries().length === 0) return; // workspace cleared mid-synthesis
    setSynthProgress(90, 'Putting your summary and cards together…');
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
    setSynthProgress(100, 'Done.');
    setTimeout(hideSynthProgress, 900);
    const gs = document.getElementById('glimmerStatus');
    if (gs && /on this device/.test(engine.name)) {
      gs.textContent = `Local model connected on this device: ${engine.name}`;
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
      // Never fight a draft for the GPU/RAM: indexing pauses while
      // synthesis is running (matters on 8 GB machines).
      while (synthesizing) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
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

// --- Password-protected PDFs: ask in-app, password lives only in memory ---
let pdfPasswordResolve: ((value: string | null) => void) | null = null;

function askPdfPassword(filename: string, wrong: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    pdfPasswordResolve = resolve;
    el('pdfPasswordFile').textContent = filename;
    el('pdfPasswordError').textContent = wrong ? 'That password did not open it. Try again, or skip this file.' : '';
    const input = el<HTMLInputElement>('pdfPasswordInput');
    input.value = '';
    el('pdfPasswordModal').hidden = false;
    input.focus();
  });
}

function settlePdfPassword(value: string | null): void {
  el('pdfPasswordModal').hidden = true;
  el<HTMLInputElement>('pdfPasswordInput').value = '';
  const resolve = pdfPasswordResolve;
  pdfPasswordResolve = null;
  resolve?.(value);
}

el('pdfPasswordUnlockBtn').addEventListener('click', () => {
  settlePdfPassword(el<HTMLInputElement>('pdfPasswordInput').value);
});
el('pdfPasswordCancelBtn').addEventListener('click', () => settlePdfPassword(null));
el('pdfPasswordModal').addEventListener('click', (ev) => {
  if (ev.target === el('pdfPasswordModal')) settlePdfPassword(null);
});
el<HTMLInputElement>('pdfPasswordInput').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') settlePdfPassword((ev.target as HTMLInputElement).value);
  if (ev.key === 'Escape') settlePdfPassword(null);
});

/** Extract PDF text, asking for a password (up to 3 tries) when needed. */
async function extractPdfText(file: File, note?: HTMLElement): Promise<string> {
  let password: string | undefined;
  let wrong = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const text = await pdfToText(file, undefined, password);
      if (!needsOcrFallback(text)) return text;
      // No usable text layer: scanned/image-only PDF — OCR the pages.
      try {
        const ocr = await pdfToOcrText(file, password, (status) => {
          if (note) note.textContent = `${file.name}: ${status}`;
        });
        return ocr.trim().length > text.trim().length ? ocr : text;
      } catch {
        return text; // OCR unavailable: keep whatever the text layer gave.
      }
    } catch (err) {
      const kind = pdfPasswordKind(err);
      if (!kind) throw err;
      wrong = kind === 'wrong-password';
      const entered = await askPdfPassword(file.name, wrong);
      if (entered === null) throw new Error('password skipped');
      password = entered;
    }
  }
  throw new Error('password attempts exhausted');
}

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
    const text = await extractPdfText(file, note);
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
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        // Bank-statement PDFs go through the same review-then-import flow
        // as CSV; other PDFs ingest as documents. Extract once so a
        // password-protected file never prompts twice.
        try {
          const text = await extractPdfText(file, note);
          if (!text.trim()) continue;
          if (looksLikePdfStatement(text, file.name)) {
            const parsed = parsePdfStatement(text);
            if (parsed.parsedRows > 0) {
              showStatementReview(file.name, parsed);
              continue;
            }
          }
          total += ingestDoc(file.name, text, { ownership: currentOwnership() }).created;
          continue;
        } catch {
          // Unreadable PDF: skipped like any other unreadable file.
          continue;
        }
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
    /** Simulated linked source this entry arrived through, when any. */
    via?: string;
  }>;
}

async function loadPersona(id = 'maya'): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}personas/${id}.json`);
  if (!res.ok) throw new Error(`Persona file missing (HTTP ${res.status}). Run npm run personas.`);
  const kb = (await res.json()) as PersonaKB & { id?: string };
  const label = kb.id ?? id;
  if (listEntries().some((e) => e.source_pack === label || e.source_label === label)) {
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
      source: e.via ? 'connection' : 'import',
      source_pack: label,
      source_label: e.via ?? label,
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

// --- Per-view search (one bar at the top of each view; local Q&A) ---

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

// People-in-network suggestions: name matches from the Network rollup,
// shown as you type; selecting one opens that person's card.
let currentSuggestions: Array<{ name: string; entryIds: string[] }> = [];
let suggestionIndex = -1;

function hideSearchSuggestions(): void {
  el('searchSuggestions').hidden = true;
  el('searchSuggestions').innerHTML = '';
  currentSuggestions = [];
  suggestionIndex = -1;
}

function renderSearchSuggestions(): void {
  const query = el<HTMLInputElement>('globalSearch').value.trim().toLowerCase();
  const box = el('searchSuggestions');
  if (!query) {
    hideSearchSuggestions();
    return;
  }
  currentSuggestions = listPeople()
    .filter((p) => p.name.toLowerCase().includes(query))
    .slice(0, 6);
  suggestionIndex = -1;
  if (!currentSuggestions.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.innerHTML =
    '<p class="hint" style="margin:4px 10px">People in your network</p>' +
    currentSuggestions
      .map(
        (p, i) => `<button type="button" class="search-suggestion" role="option" data-suggestion="${i}" aria-selected="${i === suggestionIndex}">
          <span class="person-avatar" aria-hidden="true">${escapeHtml(initialsOf(p.name))}</span>
          <span>${escapeHtml(p.name)}</span>
          <span class="meta suggestion-meta">${p.entryIds.length} ${p.entryIds.length === 1 ? 'entry' : 'entries'}</span>
        </button>`,
      )
      .join('');
  box.hidden = false;
}

function paintSuggestionSelection(): void {
  el('searchSuggestions')
    .querySelectorAll('.search-suggestion')
    .forEach((row, i) => {
      row.classList.toggle('active', i === suggestionIndex);
      row.setAttribute('aria-selected', String(i === suggestionIndex));
    });
}

function selectSuggestion(index: number): void {
  const person = currentSuggestions[index];
  if (!person) return;
  hideSearchSuggestions();
  openPersonModal(person.name);
}

el<HTMLInputElement>('globalSearch').addEventListener('input', renderSearchSuggestions);
el('searchSuggestions').addEventListener('mousedown', (ev) => {
  const row = (ev.target as HTMLElement).closest('[data-suggestion]');
  if (!row) return;
  ev.preventDefault();
  selectSuggestion(Number(row.getAttribute('data-suggestion')));
});
document.addEventListener('click', (ev) => {
  const bar = document.querySelector('.searchbar');
  if (bar && !bar.contains(ev.target as Node)) hideSearchSuggestions();
});

el<HTMLInputElement>('globalSearch').addEventListener('keydown', (ev) => {
  const open = !el('searchSuggestions').hidden && currentSuggestions.length > 0;
  if (ev.key === 'ArrowDown' && open) {
    ev.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % currentSuggestions.length;
    paintSuggestionSelection();
    return;
  }
  if (ev.key === 'ArrowUp' && open) {
    ev.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
    paintSuggestionSelection();
    return;
  }
  if (ev.key === 'Enter') {
    if (open && suggestionIndex >= 0) {
      ev.preventDefault();
      selectSuggestion(suggestionIndex);
      return;
    }
    hideSearchSuggestions();
    runTopSearch();
  }
  if (ev.key === 'Escape') {
    if (open) {
      hideSearchSuggestions();
      return;
    }
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
    const health = !budgeting && isHealthQuery(query);
    createSavedPath({
      name: budgeting ? 'Finance' : health ? 'Health' : query.slice(0, 60),
      query,
      templateId: budgeting ? 'budgeting' : health ? 'health' : undefined,
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

el('archetypeCards').addEventListener('click', (ev) => {
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

// --- Knowledge packs (curated per-pack settings; pinned like Paths) ---

let selectedPackId: string | null = null;

function renderPacks(): void {
  const packs = listKnowledgePacks();
  const entries = listEntries();
  const shareableTotal = curatedPackEntries(entries, {}).length;
  el('packConfigList').innerHTML = packs.length
    ? packs
        .map((p) => {
          const count = curatedPackEntries(entries, { expertiseOnly: p.expertiseOnly }).length;
          return `<article class="item ${p.id === selectedPackId ? 'pack-selected' : ''}" data-pack-card="${p.id}">
      <header><h3>${escapeHtml(p.name)}</h3><span class="meta">${p.pinned ? 'Pinned · ' : ''}v${escapeHtml(p.version)}${p.lastExportedAt ? ` · last exported ${escapeHtml(p.lastExportedAt.slice(0, 10))} (${p.lastEntryCount} entries)` : ' · never exported'}</span></header>
      <div class="row">
        <label>Pack name <input data-pack-name="${p.id}" value="${escapeHtml(p.name)}" /></label>
        <label>Author label <input data-pack-author="${p.id}" value="${escapeHtml(p.author)}" placeholder="anonymous" /></label>
        <label>Version <input data-pack-version="${p.id}" value="${escapeHtml(p.version)}" /></label>
      </div>
      <label class="check-row"><input type="checkbox" data-pack-expertise="${p.id}" ${p.expertiseOnly ? 'checked' : ''} /> Expertise only — findings, methods, research &amp; skill-evidenced entries</label>
      <p class="meta">${count} of ${shareableTotal} shareable ${shareableTotal === 1 ? 'entry' : 'entries'} would be exported now.</p>
      <div class="row">
        <button type="button" class="small" data-pack-save="${p.id}">Save settings</button>
        <button type="button" class="small" data-pack-export="${p.id}">Export pack</button>
        <button type="button" class="small" data-pack-pin="${p.id}">${p.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" class="small danger" data-pack-delete="${p.id}">Delete</button>
      </div>
    </article>`;
        })
        .join('')
    : '<p class="hint">No packs yet. Create one above — it starts curated to your expertise.</p>';
  // Pinned packs become subtabs in the Legacy strip, like pinned Paths.
  el('pinnedPackTabs').innerHTML = packs
    .filter((p) => p.pinned)
    .map((p) => `<button type="button" data-sub="pack" data-pack-id="${p.id}">${escapeHtml(p.name)}</button>`)
    .join('');
}

async function exportKnowledgePack(packId: string): Promise<void> {
  const log = el('packExportLog');
  const pack = listKnowledgePacks().find((p) => p.id === packId);
  if (!pack) return;
  try {
    const curated = curatedPackEntries(listEntries(), { expertiseOnly: pack.expertiseOnly });
    const risky = curated.filter((e) => scanEntry(e, getProfile()?.name).some((f) => f.level === 'high'));
    if (risky.length > 0) {
      const proceed = confirm(
        `${risky.length} ${risky.length === 1 ? 'entry has' : 'entries have'} HIGH severity findings:\n` +
          risky.map((e) => `• ${e.title}`).join('\n') +
          '\n\nExport anyway?',
      );
      if (!proceed) {
        log.textContent = 'Export cancelled: review high-severity findings first.';
        return;
      }
    }
    const { filename, json } = await exportPackText(listEntries(), pack.author, pack.version, {
      expertiseOnly: pack.expertiseOnly,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    const count = (JSON.parse(json) as { manifest: { entry_count: number } }).manifest.entry_count;
    recordPackExport(pack.id, count);
    log.textContent = `Exported ${filename} (${count} entries) for “${pack.name}”. Export again any time to update it.`;
    renderPacks();
  } catch (err) {
    log.textContent = err instanceof Error ? err.message : 'Export failed.';
  }
}

el('createPackBtn').addEventListener('click', () => {
  const note = el('packCreateNote');
  try {
    const pack = createKnowledgePack({ name: el<HTMLInputElement>('newPackName').value });
    el<HTMLInputElement>('newPackName').value = '';
    selectedPackId = pack.id;
    note.textContent = `Created “${pack.name}” — curated to your expertise. Adjust its settings below, then Export pack.`;
    renderPacks();
  } catch (err) {
    note.textContent = err instanceof Error ? err.message : 'Could not create that pack.';
  }
});

el('packConfigList').addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  const saveBtn = target.closest<HTMLElement>('[data-pack-save]');
  const exportBtn = target.closest<HTMLElement>('[data-pack-export]');
  const pinBtn = target.closest<HTMLElement>('[data-pack-pin]');
  const deleteBtn = target.closest<HTMLElement>('[data-pack-delete]');
  const id = saveBtn?.dataset.packSave ?? exportBtn?.dataset.packExport ?? pinBtn?.dataset.packPin ?? deleteBtn?.dataset.packDelete;
  if (!id) return;
  if (saveBtn) {
    try {
      updateKnowledgePack(id, {
        name: document.querySelector<HTMLInputElement>(`[data-pack-name="${id}"]`)?.value ?? '',
        author: document.querySelector<HTMLInputElement>(`[data-pack-author="${id}"]`)?.value ?? '',
        version: document.querySelector<HTMLInputElement>(`[data-pack-version="${id}"]`)?.value ?? '',
        expertiseOnly: document.querySelector<HTMLInputElement>(`[data-pack-expertise="${id}"]`)?.checked ?? false,
      });
      el('packExportLog').textContent = 'Pack settings saved.';
      renderPacks();
    } catch (err) {
      el('packExportLog').textContent = err instanceof Error ? err.message : 'Could not save settings.';
    }
  } else if (exportBtn) {
    void exportKnowledgePack(id);
  } else if (pinBtn) {
    const pack = listKnowledgePacks().find((p) => p.id === id);
    if (pack) setKnowledgePackPinned(id, !pack.pinned);
    renderPacks();
  } else if (deleteBtn) {
    const pack = listKnowledgePacks().find((p) => p.id === id);
    if (pack && confirm(`Delete the “${pack.name}” pack definition? Exported files are not affected.`)) {
      deleteKnowledgePack(id);
      if (selectedPackId === id) selectedPackId = null;
      renderPacks();
    }
  }
});

el('packConfigList').addEventListener('change', (ev) => {
  const box = (ev.target as HTMLElement).closest<HTMLInputElement>('[data-pack-expertise]');
  if (!box?.dataset.packExpertise) return;
  updateKnowledgePack(box.dataset.packExpertise, { expertiseOnly: box.checked });
  renderPacks();
});

function selectPack(id: string): void {
  selectedPackId = id;
  renderPacks();
  document
    .querySelectorAll('#pinnedPackTabs button')
    .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.packId === id));
  document.querySelector(`[data-pack-card="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

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

// --- Personal backup (encrypted, user-held; see backup.ts) ---
el('backupExportBtn').addEventListener('click', () => {
  const note = el('backupNote');
  const passphrase = prompt('Choose a backup passphrase (at least 8 characters). It is separate from your vault PIN — there is no recovery if you lose it.');
  if (passphrase === null) return;
  const again = prompt('Repeat the backup passphrase.');
  if (again === null) return;
  if (again !== passphrase) {
    note.textContent = 'Passphrases did not match. Nothing was exported.';
    return;
  }
  void createBackup(passphrase)
    .then(({ filename, text }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      note.textContent = `Backup saved as ${filename}. Keep it somewhere safe — it holds your whole knowledgebase, encrypted.`;
    })
    .catch((err) => {
      note.textContent = err instanceof StoreError ? err.message : 'Backup failed.';
    });
});

el('backupImportBtn').addEventListener('click', () => {
  el<HTMLInputElement>('backupFileInput').click();
});

el<HTMLInputElement>('backupFileInput').addEventListener('change', () => {
  const input = el<HTMLInputElement>('backupFileInput');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const note = el('backupNote');
  if (!confirm('Restore this backup? It replaces everything currently in this workspace.')) return;
  const passphrase = prompt('Enter the backup passphrase.');
  if (passphrase === null) return;
  void file
    .text()
    .then((text) => restoreBackup(text, passphrase))
    .then(({ entries }) => {
      note.textContent = `Backup restored: ${entries} entries. Vectors will re-index in the background.`;
      renderAll();
    })
    .catch((err) => {
      note.textContent = err instanceof StoreError ? err.message : 'Restore failed. Nothing was changed.';
    });
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
  if (path.templateId === 'budgeting') return 'Finance';
  if (path.templateId === 'health') return 'Health';
  return path.name;
}

function renderSavedPaths(): void {
  const entries = listEntries();
  const saved = listSavedPaths();
  // Finance/Health Paths stay hidden until their data has been shared.
  const financeCount = entries.filter((e) => e.type === 'finance').length;
  const healthCount = entries.filter((e) => e.type === 'health').length;
  const displaySaved = saved.filter(
    (x) =>
      (x.templateId !== 'budgeting' || financeCount > 0) &&
      (x.templateId !== 'health' || healthCount > 0),
  );
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

  // Pinned Paths become entries in the sidebar under Paths.
  const pinned = displaySaved.filter((x) => x.pinned);
  el('pinnedPathTabs').innerHTML = pinned
    .map((x) => `<button type="button" data-sub="path" data-path-id="${x.id}">${escapeHtml(pathDisplayName(x))}</button>`)
    .join('');
}

let financeGroup1: FinanceGroupKey = 'Month';
let financeGroup2: FinanceGroupKey = 'Category';

const FINANCE_SERIES_COLORS = ['#05006d', '#1f4d30', '#b07d10', '#c4142e', '#2f7d6b', '#8a5a2b', '#4a6fa5', '#7a5b1e'];
const FINANCE_MONEY = (n: number): string => `${n < 0 ? '-' : ''}${Math.abs(n).toFixed(2)}`;

function financeTooltip(host: HTMLElement): d3.Selection<HTMLDivElement, unknown, null, undefined> {
  let tip = d3.select(host).select<HTMLDivElement>('div.fin-tip');
  if (tip.empty()) {
    tip = d3.select(host).append('div').attr('class', 'fin-tip').attr('hidden', true) as d3.Selection<HTMLDivElement, unknown, null, undefined>;
  }
  return tip;
}

function showFinanceTooltip(host: HTMLElement, event: MouseEvent, html: string): void {
  const tip = financeTooltip(host);
  const [x, y] = d3.pointer(event, host);
  tip.attr('hidden', null).html(html)
    .style('left', `${Math.min(x + 14, Math.max(0, host.clientWidth - 250))}px`)
    .style('top', `${Math.max(0, y - 10)}px`);
}

function hideFinanceTooltip(host: HTMLElement): void {
  financeTooltip(host).attr('hidden', true);
}

function financeGroupMembers(tx: Transaction[], key: FinanceGroupKey, groupKey: string, topN = 8): Transaction[] {
  if (groupKey !== 'Others') return tx.filter((t) => financeGroupKey(t, key) === groupKey);
  const kept = new Set(groupFinance(tx, key, topN).filter((g) => g.key !== 'Others').map((g) => g.key));
  return tx.filter((t) => !kept.has(financeGroupKey(t, key)));
}

function drawFinanceOverview(host: HTMLElement, tx: Transaction[]): void {
  const container = el('finOverview');
  const groups = groupFinance(tx, financeGroup1, 8);
  const width = Math.max(320, container.clientWidth || 680);
  const height = 320;
  const margin = { top: 18, right: 12, bottom: 52, left: 52 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
  const x = d3.scaleBand<string>().domain(groups.map((g) => g.key)).range([0, innerW]).padding(0.28);
  const values = groups.flatMap((g) => [g.received, -g.spent, g.net]);
  const y = d3.scaleLinear().domain([Math.min(0, ...values), Math.max(0, ...values)]).nice().range([innerH, 0]);
  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height)
    .attr('role', 'img')
    .attr('aria-label', `Received, spent and net grouped by ${financeGroup1.toLowerCase()}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  g.append('g').attr('class', 'fin-grid').call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .selectAll('line').attr('stroke', '#d2d1e5');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat((v) => FINANCE_MONEY(Number(v))).tickSizeOuter(0));
  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll('text').attr('font-size', '11px')
    .attr('transform', groups.length > 6 ? 'rotate(-24)' : null)
    .style('text-anchor', groups.length > 6 ? 'end' : 'middle')
    .text((k) => (String(k).length > 16 ? `${String(k).slice(0, 15)}…` : String(k)));
  g.append('line').attr('class', 'fin-zero').attr('x1', 0).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0));
  const metrics: Array<{ id: string; label: string; color: string; value: (grp: (typeof groups)[number]) => number }> = [
    { id: 'received', label: 'Received', color: '#1f4d30', value: (grp) => grp.received },
    { id: 'spent', label: 'Spent', color: '#c4142e', value: (grp) => -grp.spent },
    { id: 'net', label: 'Net', color: '#05006d', value: (grp) => grp.net },
  ];
  const barW = x.bandwidth() / metrics.length;
  metrics.forEach((metric, mi) => {
    g.selectAll(`rect.fin-bar-${metric.id}`)
      .data(groups)
      .join('rect')
      .attr('class', `fin-bar fin-bar-${metric.id}`)
      .attr('x', (grp) => (x(grp.key) ?? 0) + mi * barW + 1)
      .attr('width', Math.max(2, barW - 2))
      .attr('rx', 2)
      .attr('fill', metric.color)
      .attr('y', y(0)).attr('height', 0)
      .on('mousemove', (event: MouseEvent, grp) => {
        g.selectAll('rect.fin-bar').style('opacity', 0.28);
        g.selectAll(`rect.fin-bar-${metric.id}`).style('opacity', 1);
        const members = financeGroupMembers(tx, financeGroup1, grp.key);
        const rows = financeBreakdown(members, financeGroup2, 6)
          .map((b) => `<div class="fin-tip-row"><span>${escapeHtml(b.key)}</span><strong>${FINANCE_MONEY(b.net)}</strong></div>`)
          .join('');
        showFinanceTooltip(host, event,
          `<strong>${escapeHtml(grp.key)} · ${metric.label} ${FINANCE_MONEY(metric.value(grp))}</strong>`
          + `<div class="fin-tip-row"><span>Received</span><strong>${FINANCE_MONEY(grp.received)}</strong></div>`
          + `<div class="fin-tip-row"><span>Spent</span><strong>${FINANCE_MONEY(grp.spent)}</strong></div>`
          + `<div class="fin-tip-row"><span>Net</span><strong>${FINANCE_MONEY(grp.net)}</strong></div>`
          + (rows ? `<div class="fin-tip-sub">By ${escapeHtml(financeGroup2.toLowerCase())}</div>${rows}` : ''));
      })
      .on('mouseleave', () => { g.selectAll('rect.fin-bar').style('opacity', 1); hideFinanceTooltip(host); })
      .transition().duration(duration)
      .attr('y', (grp) => y(Math.max(0, metric.value(grp))))
      .attr('height', (grp) => Math.abs(y(0) - y(metric.value(grp))));
  });
}

function drawFinanceEvolution(host: HTMLElement, tx: Transaction[]): void {
  const container = el('finEvolution');
  const { months, series } = monthlyCategorySeries(tx, 6);
  if (months.length < 2 || series.length === 0) {
    container.innerHTML = '<p class="hint">Not enough months yet — import statements covering two or more months to see spending evolve by category.</p>';
    return;
  }
  const width = Math.max(320, container.clientWidth || 680);
  const height = 300;
  const margin = { top: 16, right: 14, bottom: 42, left: 52 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
  const color = d3.scaleOrdinal<string, string>().domain(series.map((s) => s.category)).range(FINANCE_SERIES_COLORS);
  const x = d3.scaleBand<string>().domain(months).range([0, innerW]).padding(0.2);
  const y = d3.scaleLinear().domain([0, Math.max(1, ...series.flatMap((s) => s.values))]).nice().range([innerH, 0]);
  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height)
    .attr('role', 'img').attr('aria-label', 'Monthly spending evolution by category');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  g.append('g').attr('class', 'fin-grid').call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .selectAll('line').attr('stroke', '#d2d1e5');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat((v) => FINANCE_MONEY(Number(v))).tickSizeOuter(0));
  const tickEvery = Math.max(1, Math.ceil(months.length / Math.max(4, Math.floor(innerW / 72))));
  g.append('g').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(months.filter((_, i) => i % tickEvery === 0)).tickSizeOuter(0))
    .selectAll('text').attr('font-size', '11px');
  const line = d3.line<number>()
    .x((_, i) => (x(months[i]) ?? 0) + x.bandwidth() / 2)
    .y((v) => y(v))
    .curve(d3.curveMonotoneX);
  const legend = d3.select(el('finEvolutionLegend'));
  const setActive = (category: string | null): void => {
    g.selectAll('path.fin-line').style('stroke-opacity', (d) => (category === null || (d as (typeof series)[number]).category === category ? 1 : 0.12));
    g.selectAll('circle.fin-dot').style('opacity', (d) => (category === null || (d as { category: string }).category === category ? 1 : 0.12));
    legend.selectAll('button').classed('active', function () { return category !== null && (this as HTMLButtonElement).dataset.category === category; });
  };
  legend.selectAll('button')
    .data(series)
    .join('button')
    .attr('type', 'button').attr('class', 'fin-legend-chip').attr('data-category', (s) => s.category)
    .html((s) => `<span class="fin-swatch" style="background:${color(s.category)}"></span>${escapeHtml(s.category)} · ${FINANCE_MONEY(s.total)}`)
    .on('mouseenter', (_, s) => setActive(s.category))
    .on('mouseleave', () => setActive(null))
    .on('focus', (_, s) => setActive(s.category))
    .on('blur', () => setActive(null));
  for (const s of series) {
    g.append('path').datum(s).attr('class', 'fin-line')
      .attr('fill', 'none').attr('stroke', color(s.category)).attr('stroke-width', 2.5)
      .attr('d', line(s.values))
      .attr('stroke-dasharray', function () { const len = (this as SVGPathElement).getTotalLength(); return `${len} ${len}`; })
      .attr('stroke-dashoffset', function () { return (this as SVGPathElement).getTotalLength(); })
      .transition().duration(duration).attr('stroke-dashoffset', 0);
    g.selectAll(`circle.fin-dot-${series.indexOf(s)}`)
      .data(s.values.map((value, i) => ({ category: s.category, month: months[i], value })))
      .join('circle')
      .attr('class', 'fin-dot')
      .attr('cx', (d) => (x(d.month) ?? 0) + x.bandwidth() / 2)
      .attr('cy', (d) => y(d.value))
      .attr('r', 4).attr('fill', color(s.category)).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .on('mousemove', (event: MouseEvent, d) => {
        setActive(d.category);
        d3.select(event.currentTarget as SVGCircleElement).attr('r', 7);
        showFinanceTooltip(host, event, `<strong>${escapeHtml(d.category)}</strong><div class="fin-tip-row"><span>${escapeHtml(d.month)}</span><strong>${FINANCE_MONEY(d.value)} spent</strong></div>`);
      })
      .on('mouseleave', (event: MouseEvent) => {
        setActive(null);
        d3.select(event.currentTarget as SVGCircleElement).attr('r', 4);
        hideFinanceTooltip(host);
      });
  }
}

function drawFinanceCumulative(host: HTMLElement, tx: Transaction[]): void {
  const container = el('finCumulative');
  const points = cumulativeNetByMonth(tx);
  if (points.length < 2) {
    container.innerHTML = '<p class="hint">Not enough months yet for a cumulative net line.</p>';
    return;
  }
  const width = Math.max(320, container.clientWidth || 680);
  const height = 240;
  const margin = { top: 16, right: 56, bottom: 42, left: 52 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
  const x = d3.scaleBand<string>().domain(points.map((p) => p.month)).range([0, innerW]).padding(0.2);
  const y = d3.scaleLinear()
    .domain([Math.min(0, ...points.map((p) => p.cumulative)), Math.max(0, ...points.map((p) => p.cumulative))]).nice()
    .range([innerH, 0]);
  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height)
    .attr('role', 'img').attr('aria-label', 'Cumulative net across months');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  g.append('g').attr('class', 'fin-grid').call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .selectAll('line').attr('stroke', '#d2d1e5');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat((v) => FINANCE_MONEY(Number(v))).tickSizeOuter(0));
  const tickEvery = Math.max(1, Math.ceil(points.length / Math.max(4, Math.floor(innerW / 72))));
  g.append('g').attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(points.filter((_, i) => i % tickEvery === 0).map((p) => p.month)).tickSizeOuter(0))
    .selectAll('text').attr('font-size', '11px');
  g.append('line').attr('class', 'fin-zero').attr('x1', 0).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0));
  const area = d3.area<(typeof points)[number]>()
    .x((p) => (x(p.month) ?? 0) + x.bandwidth() / 2).y0(y(0)).y1((p) => y(p.cumulative)).curve(d3.curveMonotoneX);
  const line = d3.line<(typeof points)[number]>()
    .x((p) => (x(p.month) ?? 0) + x.bandwidth() / 2).y((p) => y(p.cumulative)).curve(d3.curveMonotoneX);
  g.append('path').datum(points).attr('class', 'fin-area').attr('fill', '#05006d').attr('fill-opacity', 0.1).attr('d', area);
  g.append('path').datum(points).attr('class', 'fin-cum-line').attr('fill', 'none').attr('stroke', '#05006d').attr('stroke-width', 2.5).attr('d', line)
    .attr('stroke-dasharray', function () { const len = (this as SVGPathElement).getTotalLength(); return `${len} ${len}`; })
    .attr('stroke-dashoffset', function () { return (this as SVGPathElement).getTotalLength(); })
    .transition().duration(duration).attr('stroke-dashoffset', 0);
  g.selectAll('circle.fin-cum-dot')
    .data(points)
    .join('circle')
    .attr('class', 'fin-cum-dot')
    .attr('cx', (p) => (x(p.month) ?? 0) + x.bandwidth() / 2).attr('cy', (p) => y(p.cumulative))
    .attr('r', 4).attr('fill', '#05006d').attr('stroke', '#fff').attr('stroke-width', 1.5)
    .on('mousemove', (event: MouseEvent, p) => {
      d3.select(event.currentTarget as SVGCircleElement).attr('r', 7);
      showFinanceTooltip(host, event,
        `<strong>${escapeHtml(p.month)}</strong><div class="fin-tip-row"><span>Net this month</span><strong>${FINANCE_MONEY(p.net)}</strong></div><div class="fin-tip-row"><span>Cumulative net</span><strong>${FINANCE_MONEY(p.cumulative)}</strong></div>`);
    })
    .on('mouseleave', (event: MouseEvent) => { d3.select(event.currentTarget as SVGCircleElement).attr('r', 4); hideFinanceTooltip(host); });
  const last = points[points.length - 1];
  g.append('text').attr('class', 'fin-end-label')
    .attr('x', (x(last.month) ?? 0) + x.bandwidth() / 2 + 8).attr('y', y(last.cumulative))
    .attr('dominant-baseline', 'middle').attr('font-size', '12px').attr('font-weight', '700')
    .text(FINANCE_MONEY(last.cumulative));
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
      '<article class="item"><header><h3>Finance</h3></header><p class="hint">No statement data yet. Import a bank statement (CSV or PDF) via Upload documents in Import & Connect and this Path fills in automatically.</p></article>';
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
  const options = (selected: FinanceGroupKey): string => FINANCE_GROUP_KEYS
    .map((k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${k}</option>`).join('');
  host.innerHTML = `<article class="item hero-card fin-card">
    <header><h3>${escapeHtml(path.name)} — your money, clearly</h3></header>
    <p>Spent ${summary.spent.toFixed(2)} · Received ${summary.received.toFixed(2)} · Net ${(summary.received - summary.spent).toFixed(2)} across ${tx.length} transactions (${escapeHtml(tx[0].date)} to ${escapeHtml(tx[tx.length - 1].date)}).</p>
    <div class="fin-controls">
      <label>Group by <select id="finGroup1">${options(financeGroup1)}</select></label>
      <label>Then by <select id="finGroup2">${options(financeGroup2)}</select></label>
      <span class="fin-legend"><span><i style="background:#1f4d30"></i>Received</span><span><i style="background:#c4142e"></i>Spent</span><span><i style="background:#05006d"></i>Net</span></span>
    </div>
    <h3 class="ov-sub">Overview — received, spent and net</h3>
    <div id="finOverview" class="fin-chart"></div>
    <p class="hint">Hover any bar for its breakdown. Spent is plotted below zero so in, out and net compare at a glance.</p>
    <h3 class="ov-sub">Evolution — spending by category over time</h3>
    <div id="finEvolutionLegend" class="fin-legend-chips"></div>
    <div id="finEvolution" class="fin-chart"></div>
    <h3 class="ov-sub">Cumulative net</h3>
    <div id="finCumulative" class="fin-chart"></div>
    <details class="fin-data-list"><summary>Data as list</summary>
      <h3 class="ov-sub">Spending by category</h3>${cats}
      <h3 class="ov-sub">Monthly trend</h3>${trend || '<p class="hint">Not enough months yet.</p>'}
    </details>
    ${recurring ? `<h3 class="ov-sub">Recurring costs</h3>${recurring}` : ''}
    <h3 class="ov-sub">What stands out</h3>${insights}
  </article>`;
  el<HTMLSelectElement>('finGroup1').addEventListener('change', (event) => {
    financeGroup1 = (event.target as HTMLSelectElement).value as FinanceGroupKey;
    renderBudgetDetail(pathId);
  });
  el<HTMLSelectElement>('finGroup2').addEventListener('change', (event) => {
    financeGroup2 = (event.target as HTMLSelectElement).value as FinanceGroupKey;
    renderBudgetDetail(pathId);
  });
  drawFinanceOverview(host, tx);
  drawFinanceEvolution(host, tx);
  drawFinanceCumulative(host, tx);
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

function renderHealthDetail(pathId: string): void {
  const host = el('budgetDetail');
  const path = listSavedPaths().find((x) => x.id === pathId);
  if (!path || path.templateId !== 'health') {
    host.innerHTML = '';
    return;
  }
  const entries = listEntries();
  const summary = healthSummary(entries);
  if (summary.total === 0) {
    host.innerHTML =
      '<article class="item"><header><h3>Health</h3></header><p class="hint">No health records yet. Import an Apple Health export (.zip) or health notes via Upload documents in Import & Connect and this Path fills in automatically.</p></article>';
    return;
  }
  const recent = entries
    .filter((e) => e.type === 'health')
    .slice(0, 5)
    .map((e) => `<p class="meta">• ${escapeHtml(e.title)} — ${escapeHtml(e.updated_at.slice(0, 10))}</p>`)
    .join('');
  const records = summary.recordLines.map((l) => `<p class="meta">${escapeHtml(l)}</p>`).join('');
  const bar = (label: string, value: number): string =>
    `<div class="budget-row"><span>${label}</span><span class="budget-bar"><span style="width:${summary.total ? Math.round((value / summary.total) * 100) : 0}%"></span></span><strong>${value}</strong><span class="meta">entries</span></div>`;
  host.innerHTML = `<article class="item hero-card">
    <header><h3>${escapeHtml(path.name)} — your health, descriptively</h3></header>
    <p>${escapeHtml(summary.pattern)} ${summary.total} health ${summary.total === 1 ? 'entry' : 'entries'} on this device${summary.latestDate ? `, most recent ${escapeHtml(summary.latestDate)}` : ''}. Health entries are always personal and never enter shareable packs.</p>
    ${bar('Activity & movement', summary.activitySignals)}
    ${bar('Sleep & rest', summary.sleepSignals)}
    ${bar('Check-ups & results', summary.checkupSignals)}
    ${records ? `<h3 class="ov-sub">From your health export</h3>${records}` : ''}
    <h3 class="ov-sub">Most recent records</h3>${recent}
    <p class="meta">This Path describes what your records show; it is not medical advice. Talk to a clinician about anything that concerns you.</p>
  </article>`;
}

const AUG_RESULTS_KEY = 'hyperself.augmented.results.v1';
let augmentedPathId: string | null = null;
let augmentedPreview: { profile: DerivedLearningProfile; bytes: string } | null = null;

function loadAugResults(): Record<string, { text: string; model: string; at: string }> {
  try {
    return JSON.parse(localStorage.getItem(AUG_RESULTS_KEY) ?? '{}') as Record<string, { text: string; model: string; at: string }>;
  } catch {
    return {};
  }
}

function renderAugmented(pathId: string): void {
  augmentedPathId = pathId;
  const path = listSavedPaths().find((x) => x.id === pathId);
  const card = el('augmentedCard');
  if (!path) {
    card.hidden = true;
    return;
  }
  const eligible = isAugmentableAsk(`${path.name} ${path.query}`);
  card.hidden = !eligible;
  if (!eligible) return;
  el<HTMLInputElement>('augEndpoint').value = DEFAULT_AUGMENTED_CONFIG.endpoint;
  el<HTMLInputElement>('augModel').value = DEFAULT_AUGMENTED_CONFIG.model;
  el('augKeyStatus').textContent = getAugmentedKey()
    ? 'Key saved for this session. It never leaves this device except to call your provider.'
    : 'No key saved yet. Your key stays on this device (session only).';
  el('augConsent').hidden = true;
  augmentedPreview = null;
  const saved = loadAugResults()[pathId];
  el('augResult').innerHTML = saved
    ? `<article class="item"><header><h3>Augmented · inference</h3><span class="meta">${escapeHtml(saved.model)} · ${escapeHtml(saved.at.slice(0, 10))}</span></header><p>${escapeHtml(saved.text)}</p><p class="meta">Generated online from your derived pattern profile. Stored only on this device; never in packs.</p></article>`
    : '';
  el('augStatus').textContent = '';
}

el('augSaveKeyBtn').addEventListener('click', () => {
  const key = el<HTMLInputElement>('augKey').value;
  setAugmentedKey(key, el<HTMLInputElement>('augRemember').checked);
  el<HTMLInputElement>('augKey').value = '';
  el('augKeyStatus').textContent = getAugmentedKey()
    ? 'Key saved for this session.'
    : 'Enter a provider API key first.';
});

el('augRevokeBtn').addEventListener('click', () => {
  revokeAugmented();
  el('augKeyStatus').textContent = 'Consent revoked and key forgotten. Augmented Paths are off.';
  el('augConsent').hidden = true;
  augmentedPreview = null;
});

el('augPreviewBtn').addEventListener('click', () => {
  const status = el('augStatus');
  const path = listSavedPaths().find((x) => x.id === augmentedPathId);
  if (!path) return;
  try {
    const profile = buildDerivedProfile(
      listEntries(),
      visibleArchetypes(),
      getArchetypePreferences(),
      path.query,
      pathDisplayName(path),
    );
    augmentedPreview = { profile, bytes: JSON.stringify(profile, null, 2) };
    const endpoint = el<HTMLInputElement>('augEndpoint').value.trim() || DEFAULT_AUGMENTED_CONFIG.endpoint;
    el('augDestHost').textContent = hostOf(endpoint) || endpoint;
    el('augPayloadPreview').textContent = augmentedPreview.bytes;
    el('augConsent').hidden = false;
    status.textContent = isAllowedHost(endpoint)
      ? 'Review the exact payload, then send.'
      : `Note: ${hostOf(endpoint)} is not on the allowlist — sending records your explicit consent for this host.`;
  } catch (err) {
    status.textContent = err instanceof StoreError ? err.message : 'Could not build the derived profile.';
  }
});

el('augCancelBtn').addEventListener('click', () => {
  el('augConsent').hidden = true;
  augmentedPreview = null;
  el('augStatus').textContent = 'Cancelled — nothing was sent.';
});

el('augSendBtn').addEventListener('click', () => {
  const status = el('augStatus');
  if (!augmentedPreview || !augmentedPathId) return;
  const endpoint = el<HTMLInputElement>('augEndpoint').value.trim() || DEFAULT_AUGMENTED_CONFIG.endpoint;
  const model = el<HTMLInputElement>('augModel').value.trim() || DEFAULT_AUGMENTED_CONFIG.model;
  status.textContent = 'Sending the approved profile…';
  void sendAugmented(augmentedPreview.profile, { endpoint, model })
    .then(({ text, payloadBytes }) => {
      if (augmentedPreview && payloadBytes !== JSON.stringify(augmentedPreview.profile)) {
        throw new StoreError('Payload changed after preview. Nothing was stored.');
      }
      recordConsent(endpoint);
      const results = loadAugResults();
      results[augmentedPathId!] = { text, model, at: new Date().toISOString() };
      localStorage.setItem(AUG_RESULTS_KEY, JSON.stringify(results));
      el('augConsent').hidden = true;
      status.textContent = 'Augmented reply received and stored on this device only.';
      renderAugmented(augmentedPathId!);
      el('augStatus').textContent = 'Augmented reply received and stored on this device only.';
    })
    .catch((err) => {
      status.textContent = err instanceof StoreError ? err.message : 'Augmented send failed. Nothing was stored.';
    });
});

function renderTemplateDetail(pathId: string): void {
  const path = listSavedPaths().find((x) => x.id === pathId);
  renderAugmented(pathId);
  if (!path) { el('budgetDetail').innerHTML = ''; return; }
  if (path.templateId === 'budgeting') renderBudgetDetail(pathId);
  else if (path.templateId === 'health') renderHealthDetail(pathId);
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
  renderSecurity();
  renderPaths();
  renderPacks();
  renderTimeline();
}

// --- Timeline (summarized periods, analysis tags, gap prompts, mic) ---

let timelineMode: 'summary' | 'uploaded' = 'summary';
let currentGaps: TimelineGap[] = [];
let timelineTypeFilter = 'all';
let timelineTagFilter: string | null = null;
let selectedPeriodKey: string | null = null;
let timelineZoom: TimelineGranularity | null = null;
let currentGranularity: TimelineGranularity = 'month';
let currentTags: TimelineTag[] = [];

/** Simplified D3 timeline on Synthesis: same periods/colors as the
 * Timeline tab at a glance. The whole card opens Timeline. */
function renderSynthesisTimelineOverview(entries: Entry[]): void {
  const card = el('synthesisTimelineCard');
  const host = el('synthesisTimeline');
  const tl = buildTimeline(entries);
  card.hidden = tl.periods.length === 0;
  if (!tl.periods.length) {
    host.innerHTML = '';
    return;
  }
  const spikeStarts = new Set(tl.tags.filter((t) => t.kind === 'spike').map((t) => t.from));
  const width = 820;
  const height = 110;
  const max = Math.max(1, ...tl.periods.map((p) => p.total));
  const barW = width / tl.periods.length;
  host.innerHTML = '';
  const s = d3.select(host).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Timeline overview');
  s.selectAll('rect')
    .data(tl.periods)
    .join('rect')
    .attr('x', (_p, i) => i * barW + 1)
    .attr('y', (p) => height - 18 - (p.total / max) * (height - 26))
    .attr('width', Math.max(1, barW - 2))
    .attr('height', (p) => Math.max(1, (p.total / max) * (height - 26)))
    .attr('fill', (p) => (p.total === 0 ? '#f8f7fb' : spikeStarts.has(p.start) ? '#ffc508' : '#a59acb'));
  s.append('text')
    .attr('x', 0)
    .attr('y', height - 4)
    .attr('font-size', '11px')
    .attr('fill', '#585875')
    .text(`${tl.periods[0].label} – ${tl.periods[tl.periods.length - 1].label}`);
}

/** D3 spider (radar) chart on Synthesis: one axis per archetype,
 * radius = affinity (strength 0-100). Needs 3+ archetypes to read.
 * Design follows Nadieh Bremer's smoothed radar redesign (MIT,
 * gist.github.com/nbremer/21746a9668ffdf6d8242): circular grid,
 * smoothed closed blob, glow stroke, wrapped axis labels, and
 * invisible hover circles with a value tooltip — adapted to D3 v7
 * and the Hyperself palette. Credit: Nadieh Bremer | Visual Cinnamon. */
function renderArchetypeSpider(archetypes: Archetype[]): void {
  const card = el('archetypeSpiderCard');
  const host = el('archetypeSpider');
  host.innerHTML = '';
  card.hidden = archetypes.length < 3;
  if (archetypes.length < 3) return;
  const size = 440;
  const radius = 130;
  const cx = size / 2;
  const cy = size / 2;
  const angleSlice = (Math.PI * 2) / archetypes.length;
  const rScale = d3.scaleLinear().range([0, radius]).domain([0, 100]);
  const point = (i: number, v: number): [number, number] => [
    cx + rScale(v) * Math.cos(angleSlice * i - Math.PI / 2),
    cy + rScale(v) * Math.sin(angleSlice * i - Math.PI / 2),
  ];
  const svg = d3.select(host).append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('role', 'img')
    .attr('aria-label', `Archetype affinity: ${archetypes.map((a) => `${a.label} ${a.strength}`).join(', ')}`);
  const defs = svg.append('defs');
  const glow = defs.append('filter').attr('id', 'spider-glow');
  glow.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'coloredBlur');
  const merge = glow.append('feMerge');
  merge.append('feMergeNode').attr('in', 'coloredBlur');
  merge.append('feMergeNode').attr('in', 'SourceGraphic');
  // Circular grid, outermost first, with level labels up the top axis.
  for (const ring of [100, 75, 50, 25]) {
    svg.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', rScale(ring))
      .attr('fill', '#d2d1e5').attr('fill-opacity', 0.18)
      .attr('stroke', '#d2d1e5')
      .attr('filter', 'url(#spider-glow)');
    svg.append('text')
      .attr('x', cx + 4).attr('y', cy - rScale(ring))
      .attr('font-size', '10px').attr('fill', '#585875')
      .text(String(ring));
  }
  const axis = svg.selectAll('g.spider-axis')
    .data(archetypes)
    .join('g')
    .attr('class', 'spider-axis');
  axis.append('line')
    .attr('x1', cx).attr('y1', cy)
    .attr('x2', (_a, i) => point(i, 100)[0])
    .attr('y2', (_a, i) => point(i, 100)[1])
    .attr('stroke', '#ffffff').attr('stroke-width', 2);
  axis.append('text')
    .attr('x', (_a, i) => point(i, 125)[0])
    .attr('y', (_a, i) => point(i, 125)[1])
    .attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('font-size', '11px')
    .each(function (a) {
      // Wrap long labels onto two tspans (~70px), per the reference.
      const words = a.label.split(/\s+/);
      const elText = d3.select(this);
      if (words.length < 2) {
        elText.text(a.label);
        return;
      }
      const mid = Math.ceil(words.length / 2);
      elText.text(null);
      elText.append('tspan').attr('x', elText.attr('x')).attr('dy', '-0.35em').text(words.slice(0, mid).join(' '));
      elText.append('tspan').attr('x', elText.attr('x')).attr('dy', '1.1em').text(words.slice(mid).join(' '));
    });
  // Smoothed closed blob (cardinal-closed in the reference).
  const radarLine = d3.lineRadial<Archetype>()
    .radius((a) => rScale(a.strength))
    .angle((_a, i) => i * angleSlice)
    .curve(d3.curveCatmullRomClosed);
  svg.append('path')
    .datum(archetypes)
    .attr('transform', `translate(${cx},${cy})`)
    .attr('d', radarLine)
    .attr('fill', '#a59acb').attr('fill-opacity', 0.35)
    .on('mouseover', function () { d3.select(this).transition().duration(200).attr('fill-opacity', 0.7); })
    .on('mouseout', function () { d3.select(this).transition().duration(200).attr('fill-opacity', 0.35); });
  svg.append('path')
    .datum(archetypes)
    .attr('transform', `translate(${cx},${cy})`)
    .attr('d', radarLine)
    .attr('fill', 'none')
    .attr('stroke', '#05006d').attr('stroke-width', 2)
    .attr('filter', 'url(#spider-glow)');
  svg.selectAll('circle.spider-dot')
    .data(archetypes)
    .join('circle')
    .attr('cx', (a, i) => point(i, a.strength)[0])
    .attr('cy', (a, i) => point(i, a.strength)[1])
    .attr('r', 4)
    .attr('fill', '#05006d').attr('fill-opacity', 0.8);
  // Invisible larger hover circles drive the value tooltip.
  const tooltip = svg.append('text')
    .attr('font-size', '12px').attr('font-weight', 700).attr('fill', '#05006d')
    .style('opacity', 0);
  svg.selectAll('circle.spider-hit')
    .data(archetypes)
    .join('circle')
    .attr('cx', (a, i) => point(i, a.strength)[0])
    .attr('cy', (a, i) => point(i, a.strength)[1])
    .attr('r', 10)
    .attr('fill', 'none')
    .style('pointer-events', 'all')
    .on('mouseover', function (_ev, a) {
      const [x, y] = point(archetypes.indexOf(a), a.strength);
      tooltip
        .attr('x', x - 10).attr('y', y - 10)
        .text(`${a.label} · ${a.strength}/100`);
      tooltip.transition().duration(200).style('opacity', 1);
    })
    .on('mouseout', () => { tooltip.transition().duration(200).style('opacity', 0); });
}

el('synthesisTimelineCard').addEventListener('click', () => showView('timeline'));
el('synthesisTimelineCard').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    showView('timeline');
  }
});

/** D3 bar chart over timeline periods: axis component below, counts
 * scaled, horizontally scrollable, click a bar to inspect the period. */
function renderTimelineChart(tl: ReturnType<typeof buildTimeline>, entries: Entry[]): void {
  const host = el('timelineChart');
  host.innerHTML = '';
  if (!tl.periods.length) {
    host.innerHTML = '<div class="tl-empty"><h3>Your timeline starts with your knowledge</h3><p>Import a document, image or recording with a date to begin exploring your archive.</p><p class="hint">No entries yet. Patterns and analysis will appear only when there is enough material.</p><button type="button" data-timeline-import="1">Import &amp; Connect</button></div>';
    return;
  }
  const valueOf = (p: (typeof tl.periods)[number]): number =>
    timelineTypeFilter === 'all' ? p.total : (p.byType[timelineTypeFilter] ?? 0);
  const spikeStarts = new Set(tl.tags.filter((t) => t.kind === 'spike').map((t) => t.from));
  const gapKeys = new Set<string>();
  for (const gap of tl.gaps) {
    for (const p of tl.periods) if (p.start >= gap.from && p.start < gap.to) gapKeys.add(p.key);
  }
  const taggedKeys = new Set<string>();
  if (timelineTagFilter) {
    for (const t of tl.tags.filter((x) => x.kind === timelineTagFilter)) {
      for (const p of tl.periods) if (p.start >= t.from && p.start < t.to) taggedKeys.add(p.key);
    }
  }
  const pxPerPeriod = tl.granularity === 'day' ? 34 : tl.granularity === 'month' ? 54 : tl.granularity === 'quarter' ? 96 : 132;
  const margin = { top: 26, right: 16, bottom: 58, left: 38 };
  const innerWidth = Math.max(host.clientWidth || 640, tl.periods.length * pxPerPeriod);
  const innerHeight = 280;
  const width = innerWidth + margin.left + margin.right;
  const height = innerHeight + margin.top + margin.bottom;
  const x = d3.scaleBand<string>().domain(tl.periods.map((p) => p.key)).range([0, innerWidth]).padding(0.15);
  const y = d3.scaleLinear().domain([0, Math.max(1, ...tl.periods.map(valueOf))]).nice().range([innerHeight, 0]);
  const labelOf = new Map(tl.periods.map((p) => [p.key, p.label]));
  const svg = d3.select(host).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr('aria-label', 'Knowledgebase timeline chart');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const tickEvery = Math.max(1, Math.ceil(tl.periods.length / Math.max(6, Math.floor(innerWidth / 90))));
  const xAxis = d3.axisBottom(x)
    .tickValues(tl.periods.filter((_, i) => i % tickEvery === 0).map((p) => p.key))
    .tickFormat((key) => labelOf.get(key) ?? key)
    .tickSizeOuter(0);
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .style('text-anchor', 'middle')
    .attr('font-size', '11px');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
  g.selectAll('rect.tl-bar')
    .data(tl.periods)
    .join('rect')
    .attr('class', 'tl-bar')
    .attr('x', (p) => x(p.key) ?? 0)
    .attr('y', (p) => y(valueOf(p)))
    .attr('width', x.bandwidth())
    .attr('height', (p) => innerHeight - y(valueOf(p)))
    .attr('fill', (p) => (gapKeys.has(p.key) && p.total === 0 ? '#f8f7fb' : spikeStarts.has(p.start) ? '#ffc508' : '#a59acb'))
    .attr('stroke', (p) => (p.key === selectedPeriodKey ? '#05006d' : 'none'))
    .attr('stroke-width', (p) => (p.key === selectedPeriodKey ? 2.5 : 0))
    .style('opacity', (p) => (!timelineTagFilter || taggedKeys.has(p.key) ? 1 : 0.22))
    .on('click', (_ev, p) => {
      selectedPeriodKey = p.key;
      renderTimeline();
      openPeriodModal(p, entries);
    })
    .append('title')
    .text((p) => `${p.label}: ${valueOf(p)} entries${p.dominantType ? ` · mostly ${p.dominantType}` : ''}${p.peopleMet.length ? ` · met ${p.peopleMet.join(', ')}` : ''}`);
  g.selectAll('text.tl-value')
    .data(tl.periods.filter((p) => valueOf(p) > 0))
    .join('text')
    .attr('class', 'tl-value')
    .attr('x', (p) => (x(p.key) ?? 0) + x.bandwidth() / 2)
    .attr('y', (p) => y(valueOf(p)) - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .text((p) => valueOf(p));
  g.append('g')
    .attr('class', 'tl-grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => ''))
    .selectAll('line')
    .attr('stroke', '#d2d1e5');
  g.selectAll('circle.tl-met')
    .data(tl.periods.filter((p) => p.peopleMet.length))
    .join('circle')
    .attr('class', 'tl-met')
    .attr('cx', (p) => (x(p.key) ?? 0) + x.bandwidth() / 2)
    .attr('cy', innerHeight - 5)
    .attr('r', 3.5)
    .attr('fill', '#1f4d30');
}

function renderTimeline(): void {
  const entries = listEntries();
  renderSynthesisTimelineOverview(entries);
  const tl = buildTimeline(entries, timelineZoom ?? undefined);
  currentGaps = tl.gaps;
  currentTags = tl.tags;
  currentGranularity = tl.granularity;
  const levelIdx = GRANULARITY_LEVELS.indexOf(tl.granularity);
  el('tlZoomLabel').textContent = `${tl.granularity === 'day' ? 'Days' : tl.granularity === 'month' ? 'Months' : tl.granularity === 'quarter' ? 'Quarters' : 'Years'}${timelineZoom ? '' : ' (auto)'}`;
  (el('tlZoomIn') as HTMLButtonElement).disabled = levelIdx >= GRANULARITY_LEVELS.length - 1;
  (el('tlZoomOut') as HTMLButtonElement).disabled = levelIdx <= 0;
  const granLabel = tl.granularity === 'day' ? 'Days' : tl.granularity === 'month' ? 'Months' : tl.granularity === 'quarter' ? 'Quarters' : 'Years';
  el('timelineMeta').textContent = !entries.length
    ? 'No entries yet.'
    : tl.granularity === 'year'
      ? 'Years is the widest view · zoom out is disabled. Years → Quarters → Months → Days'
      : tl.granularity === 'day' && tl.periods.length >= 1200
        ? '1,200-period limit reached. Zoom in is disabled; scroll to explore days or zoom out to Months.'
        : `${granLabel} view. Years → Quarters → Months → Days`;
  const firstPeriod = tl.periods[0];
  const lastPeriod = tl.periods[tl.periods.length - 1];
  el('timelineRange').textContent = firstPeriod && lastPeriod
    ? `${firstPeriod.label}–${lastPeriod.label} · scroll horizontally to explore your archive`
    : '';
  el('timelineUploadedCaption').hidden = timelineMode !== 'uploaded';
  // Type + kind filter pills float over the chart (Figma overlay bar).
  const types = [...new Set(entries.map((e) => e.type))].sort();
  if (timelineTypeFilter !== 'all' && !types.includes(timelineTypeFilter as Entry['type'])) timelineTypeFilter = 'all';
  const kinds = [...new Set(tl.tags.map((t) => t.kind))].filter((kind) => kind !== 'people');
  el('timelineTypeFilters').innerHTML =
    ['all', ...types]
      .map(
        (t) => `<button type="button" class="tl-filter ${timelineTypeFilter === t ? 'active' : ''}" data-type-filter="${t}">${timelineTypeFilter === t && t !== 'all' ? '✓ ' : ''}${t === 'all' ? 'All types' : escapeHtml(t)}</button>`,
      )
      .join('') +
    kinds
      .map(
        (k) => `<button type="button" class="tl-filter tl-kind-filter ${timelineTagFilter === k ? 'active' : ''}" data-tag-filter="${k}">${timelineTagFilter === k ? '✓ ' : ''}${escapeHtml(k)}</button>`,
      )
      .join('');
  // Analysis tags below the chart open their drawer.
  el('timelineTags').innerHTML = tl.tags.length
    ? tl.tags
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.kind !== 'people' && (!timelineTagFilter || t.kind === timelineTagFilter))
        .map(({ t, i }) => `<button type="button" class="tl-tag tl-tag-${t.kind}" data-tag-open="${i}" title="${escapeHtml(t.detail)}">${escapeHtml(t.label)}</button>`)
        .join('')
    : '<p class="hint">No patterns flagged yet — add more knowledge and spikes, lulls, and gaps will surface here.</p>';
  renderTimelineChart(tl, entries);
  const selected = tl.periods.find((p) => p.key === selectedPeriodKey);
  const sorted = entries
    .filter((e) => timelineTypeFilter === 'all' || e.type === timelineTypeFilter)
    .filter((e) => !selected || (e.created_at >= selected.start && e.created_at < selected.end))
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  el('timelineUploaded').innerHTML = sorted.length
    ? sorted
        .map(
          (e) => `<div class="item"><header><h3>${escapeHtml(e.title)}</h3><span class="meta">${escapeHtml(e.created_at.slice(0, 10))} · ${escapeHtml(e.type)} · ${escapeHtml(e.tag)}</span></header><p class="meta">${escapeHtml(e.body.slice(0, 160))}${e.body.length > 160 ? '…' : ''}</p></div>`,
        )
        .join('')
    : '<p class="hint">No entries match the current filters.</p>';
  el('timelineChart').parentElement!.hidden = timelineMode !== 'summary';
  el('timelineUploaded').hidden = timelineMode !== 'uploaded';
  document
    .querySelectorAll('[data-timeline-mode]')
    .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.timelineMode === timelineMode));
}

/** The gap-memory form now lives inside the modal (the cards below
 * the graph are gone): date inside the stretch, dictated or typed. */
let modalGapRange: { from: string; to: string; label: string } | null = null;

function gapMemoryForm(from: string, to: string): string {
  const mid = new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString().slice(0, 10);
  return `<h3>Want to add a memory from this time?</h3>
    <label>Date within this gap <input type="date" id="modalGapDate" value="${mid}" /></label>
    <label>Your memory <textarea id="modalGapBody" rows="3" placeholder="What do you remember? Type it, or use the microphone."></textarea></label>
    <div class="row">
      <button type="button" data-modal-gap-save="1">Save memory</button>
      <button type="button" class="secondary" data-mic-for="modalGapBody">Use microphone</button>
    </div>
    <p><span class="tag-personal">personal</span></p>
    <p class="hint">Personal by default. Adding a memory does not approve it for sharing.</p>
    <p id="micNote" class="hint" aria-live="polite"></p>`;
}

/** Clicking a period bar opens the same side drawer as Network people:
 * entries, type mix, and the people first met then — people details
 * live here now, not as pills under the graph. */
function openPeriodModal(period: ReturnType<typeof buildTimeline>['periods'][number], entries: Entry[]): void {
  el('timelineModalTitle').textContent = period.label;
  const inPeriod = entries
    .filter((e) => e.created_at >= period.start && e.created_at < period.end)
    .filter((e) => timelineTypeFilter === 'all' || e.type === timelineTypeFilter)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const typeLine = Object.entries(period.byType).map(([k, v]) => `${k}: ${v}`).join(' · ');
  modalGapRange = period.total === 0 ? { from: period.start, to: period.end, label: period.label } : null;
  el('timelineModalBody').innerHTML =
    `<p>${period.total} ${period.total === 1 ? 'entry' : 'entries'}${period.dominantType ? ` · mostly ${escapeHtml(period.dominantType)}` : ''}</p>` +
    (typeLine ? `<p class="meta">${escapeHtml(typeLine)}</p>` : '') +
    (period.peopleMet.length ? `<h3 class="ov-sub">People you met</h3><p>${period.peopleMet.map(escapeHtml).join(', ')}</p>` : '') +
    (inPeriod.length
      ? `<h3 class="ov-sub">Entries</h3>` + inPeriod.map((e) => `<p class="meta">• ${escapeHtml(e.created_at.slice(0, 10))} — ${escapeHtml(e.title)} <span>· ${escapeHtml(e.type)} · ${escapeHtml(e.tag)}</span></p>`).join('')
      : '<p class="hint">Nothing recorded in this period yet.</p>') +
    (modalGapRange ? gapMemoryForm(modalGapRange.from, modalGapRange.to) : '');
  el('timelineModal').hidden = false;
}

/** Clicking an analysis tag opens its side drawer (same pattern as the
 * Network person drawer: right side on wide screens, navy overlay on
 * smaller screens). */
function openTimelineTagModal(tag: TimelineTag): void {
  el('timelineModalTitle').textContent = tag.label;
  const inRange = listEntries()
    .filter((e) => e.created_at >= tag.from && e.created_at < tag.to)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const typeLine = [...inRange.reduce((m, e) => m.set(e.type, (m.get(e.type) ?? 0) + 1), new Map<string, number>()).entries()]
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  const people = [...new Set(inRange.flatMap((e) => e.people ?? []))].sort();
  el('timelineModalBody').innerHTML =
    `<p>${escapeHtml(tag.detail)}</p>` +
    (typeLine ? `<p class="meta">${escapeHtml(typeLine)}</p>` : '') +
    (people.length ? `<p class="meta">People here: ${people.map(escapeHtml).join(', ')}</p>` : '') +
    `<h3 class="ov-sub">In this stretch</h3>` +
    (inRange.length
      ? inRange.slice(0, 30).map((e) => `<p class="meta">• ${escapeHtml(e.created_at.slice(0, 10))} — ${escapeHtml(e.title)} <span>· ${escapeHtml(e.type)} · ${escapeHtml(e.tag)}</span></p>`).join('') +
        (inRange.length > 30 ? `<p class="hint">…and ${inRange.length - 30} more. Filter by type on the chart to narrow this down.</p>` : '')
      : '<p class="hint">No entries in this stretch — that silence is exactly what the tag is pointing at. Use the form below — Hyperself will help you keep it.</p>');
  if (tag.kind === 'gap') {
    modalGapRange = { from: tag.from, to: tag.to, label: tag.label.replace(/^Gap: /, '') };
    el('timelineModalBody').innerHTML += gapMemoryForm(tag.from, tag.to);
  } else {
    modalGapRange = null;
  }
  el('timelineModal').hidden = false;
}

function closeTimelineModal(): void {
  el('timelineModal').hidden = true;
}

el('timelineModalClose').addEventListener('click', closeTimelineModal);
el('timelineModal').addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  if (target === el('timelineModal')) {
    closeTimelineModal();
    return;
  }
  const micBtn = target.closest<HTMLButtonElement>('[data-mic-for]');
  if (micBtn) {
    void toggleMic(micBtn);
    return;
  }
  if (target.closest('[data-modal-gap-save]') && modalGapRange) {
    const body = el<HTMLTextAreaElement>('modalGapBody').value.trim();
    const note = document.getElementById('micNote');
    if (!body) {
      if (note) note.textContent = 'Write or dictate a memory first.';
      return;
    }
    const date = el<HTMLInputElement>('modalGapDate').value || new Date().toISOString().slice(0, 10);
    createEntry({
      title: `Memory — ${modalGapRange.label}`,
      type: 'journal',
      body,
      tag: 'personal',
      source: 'typed',
      at: `${date}T12:00:00.000Z`,
    });
    closeTimelineModal();
    renderAll();
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !el('timelineModal').hidden) closeTimelineModal();
});

el('tlZoomIn').addEventListener('click', () => {
  const idx = GRANULARITY_LEVELS.indexOf(currentGranularity);
  if (idx < GRANULARITY_LEVELS.length - 1) {
    timelineZoom = GRANULARITY_LEVELS[idx + 1];
    renderTimeline();
  }
});
el('tlZoomOut').addEventListener('click', () => {
  const idx = GRANULARITY_LEVELS.indexOf(currentGranularity);
  if (idx > 0) {
    timelineZoom = GRANULARITY_LEVELS[idx - 1];
    renderTimeline();
  }
});

el('sub-timeline').addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).closest('[data-timeline-import]')) {
    showView('knowledge');
    showSub('knowledge', 'import');
    return;
  }
  const openBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-tag-open]');
  if (openBtn) {
    const tag = currentTags[Number(openBtn.dataset.tagOpen)];
    if (tag) openTimelineTagModal(tag);
    return;
  }
  const typeBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-type-filter]');
  if (typeBtn) {
    timelineTypeFilter = typeBtn.dataset.typeFilter ?? 'all';
    renderTimeline();
    return;
  }
  const tagBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-tag-filter]');
  if (tagBtn) {
    const kind = tagBtn.dataset.tagFilter ?? null;
    timelineTagFilter = timelineTagFilter === kind ? null : kind;
    renderTimeline();
    return;
  }
  const modeBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-timeline-mode]');
  if (modeBtn) {
    timelineMode = modeBtn.dataset.timelineMode === 'uploaded' ? 'uploaded' : 'summary';
    renderTimeline();
    return;
  }
});

// Microphone input: records on-device, transcribes with the local
// Whisper pipeline, and appends text to the target field. Nothing is
// uploaded; browsers without mic support get a plain explanation.

function setMicNote(text: string): void {
  const note = document.getElementById('micNote');
  if (note) note.textContent = text;
}

let micState: { recorder: MediaRecorder; stream: MediaStream; btn: HTMLButtonElement; target: HTMLTextAreaElement } | null = null;

async function toggleMic(btn: HTMLButtonElement): Promise<void> {
  const target = document.getElementById(btn.dataset.micFor ?? '') as HTMLTextAreaElement | null;
  if (!target) return;
  if (micState) {
    micState.recorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    setMicNote('Microphone input is not available in this browser — typing works everywhere.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (ev) => chunks.push(ev.data));
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach((t) => t.stop());
      btn.textContent = 'Use microphone';
      const state = micState;
      micState = null;
      if (!state) return;
      void transcribeAudioBlob(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), (status) => {
        setMicNote(status);
      })
        .then((text) => {
          state.target.value = `${state.target.value}${state.target.value && text ? ' ' : ''}${text}`.trim();
          setMicNote('Transcribed on this device. Edit freely, then save.');
        })
        .catch((err: unknown) => {
          setMicNote(err instanceof Error ? err.message : 'Transcription failed.');
        });
    });
    micState = { recorder, stream, btn, target };
    btn.textContent = 'Stop recording';
    setMicNote('Recording… choose Stop recording when you are done.');
    recorder.start();
  } catch {
    setMicNote('Microphone access was not granted — typing works everywhere.');
  }
}

el('sub-timeline').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-mic-for]');
  if (btn) void toggleMic(btn);
});

// --- Submenus (strip at the top of the main view) ---

const SUB_PANES: Record<string, Record<string, string>> = {
  knowledge: { library: 'sub-library', archetypes: 'sub-archetypes', network: 'sub-network', import: 'sub-import', security: 'sub-security' },
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
  if (view === 'knowledge') {
    knowledgeSub = name;
    syncSidebarActive();
    mountSearch(name === 'network' ? 'network' : 'knowledge');
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
  if (group === 'legacy' && name === 'pack' && btn.dataset.packId) {
    showSub('legacy', 'export');
    selectPack(btn.dataset.packId);
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

/** Clicking the center ("You") node: your own profile card — archetypes,
 * the synthesized blurb, knowledge stats, and your own timeline. It
 * reuses the person modal, so wide screens get the same right drawer. */
function openSelfProfileModal(): void {
  modalPerson = '';
  const entries = listEntries()
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const name = getProfile()?.name ?? 'You';
  el('personModalName').textContent = name;
  const pills = visibleArchetypes()
    .map((a) => `<span class="archetype-pill">${escapeHtml(a.label)}</span>`)
    .join(' ');
  const blurb = el('profileBlurb').textContent?.trim() ?? '';
  const typeCounts = new Map<string, number>();
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  const typeLine = [...typeCounts.entries()].map(([k, v]) => `${k}: ${v}`).join(' · ');
  const first = entries[0]?.created_at.slice(0, 10);
  const last = entries[entries.length - 1]?.created_at.slice(0, 10);
  const range = first && last ? (first === last ? ` on ${first}` : ` from ${first} to ${last}`) : '';
  const recent = entries.slice(-15).reverse();
  const timeline = recent.length
    ? recent
        .map(
          (e) =>
            `<p class="meta">• ${escapeHtml(e.created_at.slice(0, 10))} — ${escapeHtml(e.title)} <span>· ${escapeHtml(e.type)} · ${escapeHtml(e.tag)}</span></p>`,
        )
        .join('')
    : '<p class="hint">No entries yet — import knowledge and your timeline will appear here.</p>';
  const selfPhoto = getProfilePhoto();
  el('personModalBody').innerHTML =
    (selfPhoto ? `<p><img class="self-photo" src="${selfPhoto}" alt="Profile photo" /></p>` : '') +
    (pills ? `<p><span class="tagrow">${pills}</span></p>` : '') +
    (blurb ? `<p>${escapeHtml(blurb)}</p>` : '') +
    `<p>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in your knowledgebase${range}, ` +
    `connecting ${listPeople().length} ${listPeople().length === 1 ? 'person' : 'people'}.</p>` +
    (typeLine ? `<p class="meta">${escapeHtml(typeLine)}</p>` : '') +
    `<h3 class="ov-sub">Your timeline</h3>${timeline}` +
    (entries.length > recent.length ? `<p class="hint">Showing the ${recent.length} most recent of ${entries.length} entries.</p>` : '') +
    '<p class="hint">Everything here is synthesized on this device from your own entries.</p>';
  el('personModal').hidden = false;
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
  if (graph.nodes.length <= 1) return;
  const width = Math.max(320, host.clientWidth || 760);
  const height = Math.round(Math.min(560, Math.max(420, width * 0.45)));
  const nodes: SimNode[] = graph.nodes.map((node) => ({
    ...node,
    photo: node.center ? getProfilePhoto() ?? undefined : undefined,
    ...(savedPositions.get(node.id) ?? {}),
  }));
  const links = graph.links.map((l) => ({ ...l })) as unknown as Array<{
    source: string | SimNode;
    target: string | SimNode;
    weight: number;
  }>;
  // Structure follows Observable's Force-directed graph component
  // (@d3/force-directed-graph-component): centered viewBox, link /
  // charge / x / y forces, sqrt link widths, drag reheats the sim,
  // and the whole graph zooms/pans. Hyperself keeps 40px avatars
  // (Figma) instead of the component's 5px dots.
  const svg = d3.select(host).append('svg')
    .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', `Network graph centered on ${centerLabel}`);
  const root = svg.append('g');
  svg.call(
    d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on('zoom', (ev) => root.attr('transform', ev.transform.toString())),
  );
  const link = root.append('g')
    .attr('stroke', '#d2d1e5')
    .attr('stroke-opacity', 0.6)
    .selectAll('line').data(links).join('line')
    .attr('stroke-width', (d) => Math.sqrt(d.weight));
  const sim = d3.forceSimulation<SimNode>(nodes)
    .force('link', d3.forceLink<SimNode, (typeof links)[number]>(links).id((d) => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('x', d3.forceX(0))
    .force('y', d3.forceY(0))
    .force('collide', d3.forceCollide<SimNode>().radius(30));
  networkSim = sim;
  const node = root.append('g').selectAll<SVGGElement, SimNode>('g').data(nodes).join('g')
    .attr('class', 'node')
    .attr('cursor', 'pointer')
    .call(
      d3.drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => {
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
          if (!ev.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
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
    if ((d as SimNode & { __moved?: boolean }).__moved) return;
    if (d.center) {
      openSelfProfileModal();
      return;
    }
    openPersonModal(d.label);
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

let networkResizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  if (el('sub-network').hidden) return;
  clearTimeout(networkResizeTimer);
  networkResizeTimer = setTimeout(() => renderNetworkGraph(listEntries()), 200);
});

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

// --- Storage hydration: OPFS wins, localStorage migrates (see opfs.ts) ---
void Promise.all([hydrateStore(), hydrateVectors()]).then(() => {
  if (el('lockOverlay').hidden) renderAll();
});

// --- Vault gate: nothing renders user data until unlock ---
let pendingVaultKey: CryptoKey | null = null;

function setLockBusy(busy: boolean): void {
  el('lockLoading').hidden = !busy;
  el('lockOverlay').setAttribute('aria-busy', String(busy));
  for (const id of ['lockUnlockBtn', 'lockBioBtn', 'lockEnrollBioBtn']) {
    (el(id) as HTMLButtonElement).disabled = busy;
  }
}

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
    setLockBusy(true);
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
    } finally {
      setLockBusy(false);
    }
  })();
});

el('lockEnrollBioBtn').addEventListener('click', () => {
  if (!pendingVaultKey) return;
  setLockBusy(true);
  void enrollBiometric(pendingVaultKey)
    .then(() => finishUnlock())
    .catch((err: unknown) => {
      el('lockError').textContent =
        (err instanceof Error ? err.message : 'Biometric enrollment failed.') + ' Continuing with PIN.';
      finishUnlock();
    })
    .finally(() => setLockBusy(false));
});

el('lockBioBtn').addEventListener('click', () => {
  el('lockError').textContent = '';
  setLockBusy(true);
  void unlockWithBiometric()
    .then(async (key) => {
      await activateVault(key);
      finishUnlock();
    })
    .catch((err: unknown) => {
      el('lockError').textContent = err instanceof Error ? err.message : 'Biometric unlock failed. Use your PIN.';
    })
    .finally(() => setLockBusy(false));
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
