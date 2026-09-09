import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('src/components/photos/PhotoComparison.tsx', 'utf8');
const css = fs.readFileSync('src/components/photos/photo-comparison.css', 'utf8');
const types = fs.readFileSync('src/types/progress-photo.types.ts', 'utf8');

test('PhotoComparison renders two progress images with meaningful alt text', () => {
  assert.match(component, /<img/);
  assert.match(component, /alt=\{`\$\{label\} —/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /decoding="async"/);
});

test('PhotoComparison supports loading/error and missing-photo states', () => {
  assert.match(component, /Caricamento foto…/);
  assert.match(component, /onLoad=\{onLoad\}/);
  assert.match(component, /onError=\{onError\}/);
  assert.match(component, /Foto non disponibile/);
  assert.match(component, /Aggiungi due foto di progresso per iniziare il confronto/);
});

test('PhotoComparison supports date and optional session metadata', () => {
  assert.match(component, /session\?: string \| null/);
  assert.match(component, /formatContext/);
  assert.match(component, /Metadati delle foto/);
  assert.match(component, /Prima/);
  assert.match(component, /Dopo/);
});

test('PhotoComparison exposes an accessible keyboard slider', () => {
  assert.match(component, /type="range"/);
  assert.match(component, /aria-label="Posizione confronto tra prima e dopo"/);
  assert.match(component, /aria-valuemin=\{0\}/);
  assert.match(component, /aria-valuemax=\{100\}/);
  assert.match(component, /aria-valuenow=\{position\}/);
});

test('PhotoComparison provides visible focus styling for keyboard users', () => {
  assert.match(css, /\.photo-comparison__slider:focus-visible/);
});

test('PhotoComparison disables comparison controls when a usable pair is unavailable', () => {
  assert.match(component, /const hasUsablePair = hasPair && !beforeError && !afterError/);
  assert.match(component, /disabled=\{!hasUsablePair\}/);
});

test('PhotoComparison exposes live status for assistive technology', () => {
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /Mostrata la foto Prima al \{position\}%/);
});

test('PhotoComparison uses the existing ProgressPhoto DTO contract', () => {
  assert.match(types, /export type ProgressPhotoDto/);
  assert.match(component, /import type \{ ProgressPhotoDto \} from '..\/..\/types\/progress-photo.types'/);
  assert.match(component, /export type ProgressPhoto = ProgressPhotoDto/);
});

test('PhotoComparison preserves deterministic latest-photo pairing', () => {
  assert.match(component, /sort\(\(a, b\) => a\.date\.localeCompare\(b\.date\)\)\.slice\(-2\)/);
});

test('PhotoComparison is responsive and prevents horizontal overflow', () => {
  assert.match(css, /width: 100%/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 600px\)/);
});

test('PhotoComparison respects reduced-motion and existing design tokens', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--hts-radius-card-lg/);
  assert.match(css, /--hts-space-2/);
  assert.match(css, /--hts-duration-normal/);
});
