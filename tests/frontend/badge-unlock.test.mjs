import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const component = fs.readFileSync(path.join(root, 'src/components/badges/BadgeUnlockFeedback.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/components/badges/badge-unlock.css'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/services/badgeEngine.service.ts'), 'utf8');

test('badge unlock feedback is an accessible live region', () => {
  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
});

test('badge unlock feedback is non-blocking and dismissible', () => {
  assert.match(component, /onDismiss\?\.\(\)/);
  assert.match(component, /setTimeout/);
  assert.match(component, /aria-label="Chiudi notifica badge"/);
});

test('badge unlock feedback respects reduced motion and supports haptics', () => {
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(component, /navigator\.vibrate/);
});

test('feedback is driven by the existing badge engine unlock model', () => {
  assert.match(engine, /evaluateBadges/);
  assert.match(engine, /newlyUnlocked/);
  assert.match(component, /UnlockedBadge/);
});
