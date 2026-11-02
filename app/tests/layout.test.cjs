// Sidebar shell + Settings contract: main menu lives in a sidebar,
// Settings is pinned at the sidebar bottom, and the local-model
// selection lives inside Settings (not on the Synthesis surface).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

function slice(from, to) {
  const a = html.indexOf(from);
  assert.ok(a >= 0, `missing start marker: ${from}`);
  const b = html.indexOf(to, a);
  assert.ok(b > a, `missing end marker after ${from}: ${to}`);
  return html.slice(a, b);
}

// Sidebar shell: brand, primary nav, nested subnavs, Settings at bottom.
assert.ok(html.includes('class="sidebar"'), 'sidebar shell present');
assert.ok(html.includes('id="settingsNavBtn"'), 'Settings button present');
assert.ok(
  html.indexOf('id="settingsNavBtn"') > html.indexOf('id="subnav-legacy"'),
  'Settings sits below the main nav groups (sidebar bottom)',
);
assert.ok(!html.includes('subnavBar') && !html.includes('class="topbar"'), 'old topbar/submenu strip gone');
assert.ok(html.includes('id="sidebar"'), 'sidebar id wired for the delegated subnav listener');

// Settings view owns the model selection.
assert.ok(html.includes('id="view-settings"'), 'Settings view present');
const settings = slice('id="view-settings"', '</main>');
for (const id of ['glimmerTierLight', 'glimmerTierDeep', 'glimmerEndpoint', 'glimmerModel', 'glimmerSaveBtn', 'glimmerCheckBtn', 'glimmerStatus', 'glimmerSetup']) {
  assert.ok(settings.includes(`id="${id}"`), `model control inside Settings: ${id}`);
}
const library = slice('id="sub-library"', 'id="sub-security"');
assert.ok(!library.includes('glimmerTierLight') && !library.includes('glimmerEndpoint'), 'model selection no longer on Synthesis');

// Synthesis keeps a one-line model status with a route into Settings.
assert.ok(library.includes('id="synthesisModelLabel"'), 'Synthesis shows the active model');
assert.ok(library.includes('id="openSettingsBtn"'), 'Synthesis links to Settings');
assert.ok(library.includes('Change in Settings'), 'status line names Settings');

// Wiring: view switching knows Settings; subnav delegation moved to the sidebar.
assert.ok(main.includes("showView('settings')"), 'Settings navigation wired');
assert.ok(main.includes('settingsNavBtn'), 'Settings button active state handled');
assert.ok(main.includes('renderSynthesisModelLabel'), 'Synthesis model label rendered');
assert.ok(main.includes('tierLabel'), 'model label includes the tier');
assert.ok(main.includes("el('sidebar').addEventListener"), 'subnav clicks delegated from the sidebar');
assert.ok(!main.includes('subnavBar'), 'no stale subnavBar wiring');

// Styles: fixed desktop sidebar that collapses on small screens.
assert.ok(css.includes('.sidebar {'), 'sidebar styles present');
assert.ok(css.includes('.sidebar-footer'), 'Settings pinned via sidebar footer');
assert.ok(css.includes('@media (max-width: 860px)'), 'small-screen collapse present');

// --- Step 2: one search, relocated to the top of each main view ---
// Exactly one search input exists; it is moved (not duplicated) per view.
assert.equal((html.match(/id="globalSearch"/g) ?? []).length, 1, 'exactly one search input');
assert.ok(!html.includes('content-topbar'), 'search no longer lives in a global top bar');
for (const view of ['knowledge', 'paths', 'legacy']) {
  const section = slice(`id="view-${view}"`, view === 'legacy' ? 'id="view-settings"' : `id="view-${view === 'knowledge' ? 'paths' : 'legacy'}"`);
  assert.ok(section.includes(`data-search-slot="${view}"`), `${view} view has a search slot at its top`);
}
// On Synthesis the slot sits above the overview (profile) card.
const libraryTop = slice('id="view-knowledge"', 'id="sub-security"');
assert.ok(
  libraryTop.indexOf('data-search-slot="knowledge"') < libraryTop.indexOf('id="profileCard"'),
  'search sits on top of the Synthesis overview card',
);
assert.ok(main.includes('mountSearch'), 'search is mounted per view');
assert.ok(main.includes('data-search-slot'), 'mounting uses the view slots');
const i18n = fs.readFileSync(path.join(root, 'src', 'i18n.ts'), 'utf8');
assert.ok(i18n.includes('Search insights and Paths'), 'Paths view gets its own search placeholder');
assert.ok(main.includes('mountSearch(searchTargetFor(view))'), 'view switching remounts the search bar');

// --- Network: full-width graph, overlaid search, wide-screen drawer ---
const network = slice('id="sub-network"', 'id="sub-import"');
assert.ok(network.includes('data-search-slot="network"'), 'Network has its own overlaid search slot');
assert.ok(network.includes('network-stage'), 'graph stage positions the overlay search');
assert.ok(network.includes('network-card'), 'network card can break out full-width');
assert.ok(css.includes('.network-card'), 'full-bleed network card styles present');
assert.ok(css.includes('100vw - 288px'), 'desktop breakout accounts for the 248px sidebar + gutters');
assert.ok(css.includes('.network-search'), 'overlaid network search styled');
assert.ok(css.includes('@media (min-width: 861px)'), 'wide-screen breakpoint present');
const wide = css.slice(css.indexOf('@media (min-width: 861px)'));
assert.ok(wide.includes('#personModal'), 'person modal becomes a right drawer on wide screens');
assert.ok(wide.includes('translateX') || css.includes('person-drawer-in'), 'drawer slides in from the right');
assert.ok(main.includes("'network'"), 'subnav switching mounts search on Network');
assert.ok(i18n.includes("'search.network'"), 'network search placeholder is localized');

// Center ("You") node opens your own profile card with your timeline,
// reusing the same modal/drawer as person details.
assert.ok(main.includes('function openSelfProfileModal'), 'self profile modal implemented');
assert.ok(main.includes('if (d.center)'), 'center node click is handled');
assert.ok(main.includes('openSelfProfileModal();'), 'center click opens the self profile');
assert.ok(main.includes('Your timeline'), 'self profile shows the user timeline');

console.log('layout OK: sidebar shell, Settings at bottom, model selection in Settings, per-view search');
