import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIRECT_ACCESS = /\blocalStorage\.(?:getItem|setItem|removeItem|clear)\s*\(/g;
const ALLOWED = new Set([
  'www/storage-repository.js',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'android/build', 'android/.gradle']);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(rel) && ![...SKIP_DIRS].some((d) => rel.startsWith(`${d}/`))) {
        files.push(...await walk(full));
      }
      continue;
    }
    if (EXTENSIONS.has(entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : '')) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of await walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  if (ALLOWED.has(rel)) continue;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(DIRECT_ACCESS)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${rel}:${line}`);
  }
}

console.log(`Direct localStorage accesses outside the storage repository: ${violations.length}`);
for (const violation of violations) console.log(`- ${violation}`);

// Inventory mode: this command is intentionally non-blocking while the migration is staged.
// CI can be made strict once the inventory reaches zero.
