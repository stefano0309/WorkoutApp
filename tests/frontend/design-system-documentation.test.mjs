import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const docs = fs.readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
const tokens = fs.readFileSync('src/theme/variables.css', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

test('UI-12 documents the canonical token source', () => {
  assert.match(docs, /src\/theme\/variables\.css/);
  assert.match(docs, /--hts-primary/);
  assert.match(docs, /--hts-surface/);
  assert.match(docs, /--hts-space-2/);
  assert.match(docs, /--hts-radius-card/);
});

test('UI-12 documents interaction and accessibility contracts', () => {
  assert.match(docs, /focus-visible/);
  assert.match(docs, /details\/summary/);
  assert.match(docs, /44px/);
  assert.match(docs, /prefers-reduced-motion/);
  assert.match(docs, /default/);
  assert.match(docs, /disabled/);
  assert.match(docs, /error/);
});

test('UI-12 documentation stays aligned with canonical motion tokens', () => {
  assert.match(tokens, /--hts-duration-fast/);
  assert.match(tokens, /--hts-duration-normal/);
  assert.match(tokens, /--hts-transition-color/);
  assert.match(docs, /--hts-duration-fast/);
  assert.match(docs, /--hts-transition-color/);
});

test('UI-12 reference is discoverable from the README', () => {
  assert.match(readme, /docs\/DESIGN-SYSTEM\.md/);
});
