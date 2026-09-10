import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync('www/index.html', 'utf8');
const layer = fs.readFileSync('www/dashboard-cognitive-load.js', 'utf8');
const css = fs.readFileSync('www/dashboard-cognitive-load.css', 'utf8');

test('UI-11 dashboard layer is loaded after the legacy application shell', () => {
  assert.match(shell, /<script src="index\.js"><\/script>/);
  assert.match(shell, /<script src="dashboard-cognitive-load\.js"><\/script>/);
  assert.match(shell, /<link rel="stylesheet" href="dashboard-cognitive-load\.css">/);
});

test('UI-11 removes duplicated today activity from the initial dashboard view', () => {
  assert.match(layer, /Attività di Oggi/);
  assert.match(layer, /closest\("\.card"\)\?\.remove\(\)/);
});

test('UI-11 collapses the weekly microcycle details by default', () => {
  assert.match(layer, /Microciclo Settimana/);
  assert.match(layer, /document\.createElement\("details"\)/);
  assert.match(layer, /Piano settimanale/);
});

test('UI-11 preserves the existing dashboard action and routing contracts', () => {
  assert.match(layer, /window\.dashboard = buildCognitiveView/);
  assert.match(layer, /window\.render\(\)/);
  assert.match(layer, /start-pill-btn/);
  assert.match(layer, /dashboard-primary-action/);
});

test('UI-11 uses existing design tokens and accessible focus behavior', () => {
  assert.match(css, /--hts-space-2/);
  assert.match(css, /--hts-radius-card/);
  assert.match(css, /--hts-focus/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
