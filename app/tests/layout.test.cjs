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

console.log('layout OK: sidebar shell, Settings at bottom, model selection in Settings');
