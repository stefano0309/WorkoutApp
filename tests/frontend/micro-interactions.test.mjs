import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('www/micro-interactions.css', 'utf8');
const html = fs.readFileSync('www/index.html', 'utf8');

test('UI-05 stylesheet is loaded', () => {
  assert.match(html, /href=["']micro-interactions\.css["']/);
});

test('UI-05 defines shared interactive transitions', () => {
  assert.match(css, /--hts-transition-color/);
  assert.match(css, /--hts-transition-surface/);
  assert.match(css, /:hover/);
  assert.match(css, /:active/);
});

test('UI-05 provides loading feedback', () => {
  assert.match(css, /\.is-loading/);
  assert.match(css, /data-state=["']loading["']/);
  assert.match(css, /aria-busy=["']true["']/);
  assert.match(css, /@keyframes hts-spin/);
});

test('UI-05 provides success and error feedback', () => {
  assert.match(css, /feedback-success/);
  assert.match(css, /feedback-error/);
  assert.match(css, /hts-feedback-success/);
  assert.match(css, /hts-feedback-error/);
});

test('UI-05 respects reduced motion', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-duration: 1ms/);
  assert.match(css, /transition-duration: 1ms/);
});
