import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'www/accessibility.css'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'www/accessibility-runtime.js'), 'utf8');

test('static shell exposes the main accessibility landmarks', () => {
  assert.match(html, /class="skip-link" href="#app"/);
  assert.match(html, /<main[\s\S]*id="app"[\s\S]*tabindex="-1"/);
  assert.match(html, /<nav[\s\S]*aria-label="Sezioni dell'applicazione"/);
  assert.match(html, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(html, /aria-label="Apri registrazione rapida"/);
  assert.match(html, /aria-labelledby="modalTitle"/);
});

test('accessibility CSS provides keyboard focus and reduced motion support', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.skip-link:focus/);
});

test('dynamic accessibility enhancer covers keyboard-operable role buttons', () => {
  assert.match(runtime, /\[role="button"\]/);
  assert.match(runtime, /setAttribute\('tabindex', '0'\)/);
  assert.match(runtime, /event\.key === 'Enter'/);
  assert.match(runtime, /event\.key === ' '/);
  assert.match(runtime, /aria-labelledby/);
});
