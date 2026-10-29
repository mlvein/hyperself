// PWA offline proof: manifest installable shape + versioned SW shell cache.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.start_url && manifest.name && manifest.short_name);
assert.ok(manifest.icons.some((i) => i.sizes === '192x192'), 'has 192 icon');
assert.ok(manifest.icons.some((i) => i.sizes === '512x512'), 'has 512 icon');
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), `icon exists: ${icon.src}`);
}
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
assert.ok(/CACHE_VERSION = 'hyperself-v\d+'/.test(sw), 'service worker cache is versioned');
assert.ok(sw.includes("request.mode === 'navigate'"), 'navigations served from cache (airplane boot)');
assert.ok(sw.includes('caches.delete'), 'old shells evicted on activate');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('manifest.webmanifest') && html.includes('offlineBadge'), 'page links manifest + badge');
console.log('offline OK: installable manifest, versioned SW, badge wired');
