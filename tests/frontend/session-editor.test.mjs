import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('src/components/session-editor/SessionEditorView.tsx', 'utf8');
const css = fs.readFileSync('src/components/session-editor/session-editor.css', 'utf8');
const hook = fs.readFileSync('src/components/session-editor/SessionEditor.tsx', 'utf8');

test('SessionEditor exposes an accessible editing surface', () => {
  assert.match(component, /aria-labelledby="session-editor-title"/);
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /htmlFor="session-name"/);
  assert.match(component, /Esercizi della sessione/);
});

test('SessionEditor edits persisted session fields without replacing the store contract', () => {
  assert.match(component, /SessionStore\.save\(session\)/);
  assert.match(component, /setSession\(\(prev\) =>/);
  assert.match(component, /updateExerciseName/);
  assert.match(component, /updateSet/);
  assert.match(hook, /SessionStore\.load\(\)/);
  assert.match(hook, /setTimeout\(\(\) => SessionStore\.save\(session\), 500\)/);
});

test('SessionEditor supports adding exercises and sets', () => {
  assert.match(component, /Aggiungi esercizio/);
  assert.match(component, /Aggiungi serie/);
  assert.match(component, /sets: \[/);
});

test('SessionEditor uses responsive focus and reduced-motion styling', () => {
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
