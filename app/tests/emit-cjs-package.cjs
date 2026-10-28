// Test setup: the repo is "type": "module" but the regression harness compiles
// src to CommonJS, so the output dir needs its own CommonJS marker.
const fs = require('node:fs');

fs.mkdirSync('.test-compiled', { recursive: true });
fs.writeFileSync('.test-compiled/package.json', JSON.stringify({ type: 'commonjs' }));
