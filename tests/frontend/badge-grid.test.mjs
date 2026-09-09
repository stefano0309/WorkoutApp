import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../../src/components/badges/BadgeGrid.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../src/components/badges/badge-grid.css', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../../src/services/badgeEngine.service.ts', import.meta.url), 'utf8');

test('BadgeGrid consumes the badge engine state instead of duplicating definitions', () => {
  assert.match(component, /getBadgeState\(context, unlocked\)/);
  assert.match(engine, /export const BADGES/);
  assert.doesNotMatch(component, /first-5k|steps-7-days|consistency-master/);
});

test('BadgeGrid exposes accessible list semantics and badge descriptions', () => {
  assert.match(component, /role="list"/);
  assert.match(component, /role="listitem"/);
  assert.match(component, /aria-label="Progressione badge"/);
  assert.match(component, /aria-describedby=/);
  assert.match(component, /aria-hidden="true"/);
});

test('BadgeGrid represents locked and unlocked states', () => {
  assert.match(component, /is-unlocked/);
  assert.match(component, /is-locked/);
  assert.match(component, /Sbloccato/);
  assert.match(component, /Bloccato/);
  assert.match(component, /data-unlocked=/);
});

test('BadgeGrid styles provide responsive layout and reduced-motion support', () => {
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-within/);
});
