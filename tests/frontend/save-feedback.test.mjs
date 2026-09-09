import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const runtime = fs.readFileSync(path.join(root, "www/accessibility-runtime.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "www/index.html"), "utf8");
const indexJs = fs.readFileSync(path.join(root, "www/index.js"), "utf8");

test("save status remains an accessible live region", () => {
  assert.match(indexHtml, /id=["']saveStatus["']/);
  assert.match(indexHtml, /role=["']status["']/);
  assert.match(indexHtml, /aria-live=["']polite["']/);
});

test("save lifecycle exposes saving, saved and error states", () => {
  assert.match(runtime, /Salvataggio in corso/);
  assert.match(runtime, /Salvataggio: errore/);
  assert.match(runtime, /window\.__htsSaveFeedback/);
  assert.match(runtime, /saving\(\)/);
  assert.match(runtime, /saved\(timeLabel\)/);
  assert.match(runtime, /error\(\)/);
});

test("local persistence enters saving feedback before the successful indicator", () => {
  assert.match(indexJs, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  assert.match(runtime, /Storage\.prototype\.setItem/);
  assert.match(runtime, /key === 'hybridTrainingSystem'/);
});

test("save feedback uses non-intrusive status semantics", () => {
  assert.match(runtime, /aria-atomic/);
  assert.match(runtime, /aria-busy/);
  assert.match(runtime, /bg-warning bg-opacity-25 text-warning/);
  assert.match(runtime, /bg-success bg-opacity-25 text-success/);
  assert.match(runtime, /bg-danger bg-opacity-25 text-danger/);
});
