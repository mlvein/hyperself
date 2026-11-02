// i18n phase 1: chrome-only localization. Every locale must carry the
// same keys, unknown keys/locales fall back to English, dates go through
// Intl, and user content is never part of the dictionary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { LOCALES, STRINGS, formatDate, isLocale, loadLocale, saveLocale, t } = require('../.test-compiled/i18n.js');

assert.deepEqual(LOCALES.map((l) => l.id), ['en', 'es'], 'English first, then Spanish');
assert.ok(isLocale('es') && isLocale('en') && !isLocale('fr') && !isLocale(''), 'locale guard');

// Key parity: a missing translation is a build-time failure, not a blank UI.
const enKeys = Object.keys(STRINGS.en).sort();
for (const { id } of LOCALES) {
  assert.deepEqual(Object.keys(STRINGS[id]).sort(), enKeys, `${id} has every chrome key`);
  for (const key of enKeys) assert.ok(STRINGS[id][key].trim().length > 0, `${id}.${key} is non-empty`);
}

// Fallbacks fail open to English, never to a raw key for known keys.
assert.equal(t('es', 'nav.settings'), 'Ajustes');
assert.equal(t('en', 'nav.settings'), 'Settings');
assert.equal(t('fr', 'nav.settings'), 'Settings', 'unknown locale falls back to English');
assert.equal(t('es', 'search.paths').includes('Rutas'), true, 'Paths placeholder is localized');

// Dates are locale-formatted via Intl (user content itself is untouched).
assert.notEqual(formatDate('2026-03-04', 'es'), formatDate('2026-03-04', 'en'), 'Intl date differs by locale');
assert.equal(formatDate('not-a-date', 'es'), 'not-a-date', 'invalid dates pass through unchanged');

// Persistence is guarded: with no storage available the default is English.
assert.equal(loadLocale(), 'en', 'no storage -> English default');
saveLocale('es'); // must not throw without localStorage

// Wiring contract: switcher lives in Settings, chrome strings are tagged.
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const settings = html.slice(html.indexOf('id="view-settings"'), html.indexOf('</main>'));
assert.ok(settings.includes('id="languageSelect"'), 'language switcher inside Settings');
assert.ok(settings.includes('value="es"'), 'Spanish offered in Settings');
assert.ok(html.includes('data-i18n="nav.settings"'), 'nav chrome is tagged for translation');
assert.ok(html.includes('data-i18n="sub.synthesis"'), 'subnav chrome is tagged for translation');
assert.ok(main.includes('applyLocale'), 'locale is applied from main');
assert.ok(main.includes('saveLocale'), 'language choice persists');
const i18nSrc = fs.readFileSync(path.join(root, 'src', 'i18n.ts'), 'utf8');
assert.ok(i18nSrc.includes('document.documentElement.lang'), 'html lang follows the locale');

console.log('i18n OK: key parity, English fallback, Intl dates, Settings switcher wired');
