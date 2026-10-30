// Focused test: psychology layer — crisis detection + non-diagnostic guardrails.
const assert = require('node:assert/strict');
const {
  detectCrisisSignals,
  isDiagnosticLanguage,
  PSYCH_PRINCIPLES,
  CRISIS_RESOURCES,
} = require('../.test-compiled/psych.js');

const high = detectCrisisSignals('Some nights I want to die and nobody would notice.');
assert.equal(high.length, 1);
assert.equal(high[0].level, 'high', 'explicit ideation is high');
assert.ok(/988/.test(high[0].suggestion) && /741741/.test(high[0].suggestion), 'resources surfaced');

const warn = detectCrisisSignals('Everything feels hopeless lately.');
assert.equal(warn[0].level, 'warn', 'hopelessness warns gently');

assert.deepEqual(detectCrisisSignals('Finished reading a great novel today.'), [], 'ordinary entries stay silent');
assert.deepEqual(detectCrisisSignals('Killed the presentation at work!'), [], 'idioms do not false-positive');

assert.ok(/never diagnose/i.test(PSYCH_PRINCIPLES), 'principles forbid diagnosis');
assert.ok(/not a therapist/i.test(PSYCH_PRINCIPLES), 'principles set the support-not-therapy boundary');
assert.ok(/988/.test(CRISIS_RESOURCES), 'crisis resources include 988');

assert.ok(isDiagnosticLanguage('You have depression disorder.'), 'diagnostic language detected');
assert.ok(!isDiagnosticLanguage('You process life through books.'), 'descriptive language passes');

console.log('psych OK: crisis high/warn, idioms silent, non-diagnostic guardrails');
