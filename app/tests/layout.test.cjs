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
{
  const asideHtml = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  assert.ok(
    asideHtml.indexOf('id="settingsNavBtn"') > asideHtml.indexOf('sidebar-nav'),
    'Settings sits below the main nav (sidebar bottom)',
  );
}
assert.ok(html.includes('id="subnavBar"'), 'submenu strip is back at the top of the main view');
assert.ok(html.indexOf('id="subnavBar"') < html.indexOf('<main>'), 'submenu strip sits above the main view');
const aside = slice('<aside', '</aside>');
assert.ok(!aside.includes('data-sub='), 'submenus no longer live in the sidebar');
assert.ok(!aside.includes('userGreeting'), 'sidebar has no Hello,[name] greeting');
assert.ok(!main.includes('renderGreeting'), 'greeting renderer removed');
assert.ok(aside.includes('data-sub-link="network"'), 'Network lives in the sidebar');
assert.ok(aside.includes('data-sub-link="import"'), 'Import & Connect lives in the sidebar');
{
  const kbStrip = html.slice(html.indexOf('id="subnav-knowledge"'), html.indexOf('id="subnav-paths"'));
  assert.ok(!kbStrip.includes('data-sub="network"'), 'Network left the Knowledgebase strip');
  assert.ok(!kbStrip.includes('data-sub="import"'), 'Import & Connect left the Knowledgebase strip');
  assert.ok(kbStrip.includes('data-sub="archetypes"'), 'Archetypes tab beside Synthesis');
  assert.ok(kbStrip.includes('id="archetypesBadge"'), 'archetype count badge beside the label');
}
assert.ok(html.includes('id="sub-archetypes"'), 'archetypes pane present');
assert.ok(html.includes('id="archetypeCards"'), 'archetype cards container present');
assert.ok(main.includes("archetypes: 'sub-archetypes'"), 'archetypes pane wired in SUB_PANES');
assert.ok(html.includes('id="synthesisTimeline"'), 'Synthesis timeline overview present');
assert.ok(main.includes('renderSynthesisTimelineOverview'), 'Synthesis timeline overview rendered');
assert.ok(main.includes("showView('timeline')"), 'overview opens the Timeline view');
assert.ok(html.includes('data-sub="security" class="subnav-action'), 'Security sits at the right end of the submenu');
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
assert.ok(main.includes("el('subnavBar').addEventListener"), 'subnav clicks delegated from the strip');
assert.ok(main.includes("el('subnavBar').hidden"), 'submenu strip hides on views without submenus');

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

// Wide-screen person drawer: no opaque scrim, so the Network stays
// visible underneath; the Network search is centered and headerless.
const wideDrawer = css.slice(css.indexOf('@media (min-width: 861px)'), css.indexOf('@keyframes person-drawer-in'));
assert.ok(/#personModal[^{]*\{[^}]*background:\s*transparent/.test(wideDrawer), 'wide drawer has no blue scrim');
assert.ok(!html.includes('<h2>Your network</h2>'), 'Network header removed');
assert.ok(!html.includes('You are the center.'), 'Network description removed');
const netSearch = css.slice(css.indexOf('.view-search.network-search'));
assert.ok(netSearch.includes('left: 50%') && netSearch.includes('translateX(-50%)'), 'Network search is centered over the graph');

// In-app Guide: long-form descriptions live in a sidebar Guide view.
assert.ok(html.includes('id="guideNavBtn"'), 'Guide button in the sidebar');
assert.ok(html.includes('id="view-guide"'), 'Guide view present');
{
  const asideHtml = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  assert.ok(asideHtml.indexOf('id="guideNavBtn"') < asideHtml.indexOf('id="settingsNavBtn"'), 'Guide sits just above Settings in the sidebar');
  assert.ok(asideHtml.indexOf('id="guideNavBtn"') > asideHtml.indexOf('sidebar-nav'), 'Guide sits below the main menu');
}
const guide = slice('id="view-guide"', 'id="view-settings"');
assert.ok(guide.includes('Augmented Paths'), 'Guide explains Augmented Paths');
assert.ok(guide.includes('Suggested Paths'), 'Guide explains Path surfacing');
assert.ok(main.includes("showView('guide')"), 'Guide navigation wired');
assert.ok(main.includes('guideNavBtn'), 'Guide button active state handled');

console.log('layout OK: sidebar shell, Settings at bottom, model selection in Settings, per-view search');
