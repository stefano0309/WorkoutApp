import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('www/micro-interactions.css', 'utf8');
const html = fs.readFileSync('www/index.html', 'utf8');

test('UI-05 stylesheet is loaded', () => {
  assert.match(html, /href=["']micro-interactions\.css["']/);
});

test('shared hover and pressed feedback uses design tokens', () => {
  assert.match(css, /var\(--hts-transition-color\)/);
  assert.match(css, /var\(--hts-transition-surface\)/);
  assert.match(css, /:hover/);
  assert.match(css, /:active/);
});

test('loading feedback supports semantic loading states', () => {
  assert.match(css, /\.is-loading/);
  assert.match(css, /data-state=["']loading["']/);
  assert.match(css, /aria-busy=["']true["']/);
  assert.match(css, /@keyframes hts-spin/);
});

test('success and error feedback are available', () => {
  assert.match(css, /feedback-success/);
  assert.match(css, /feedback-error/);
  assert.match(css, /hts-feedback-success/);
  assert.match(css, /hts-feedback-error/);
});

test('reduced motion disables expensive interaction animation', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-duration: 1ms/);
  assert.match(css, /transition-duration: 1ms/);
});
