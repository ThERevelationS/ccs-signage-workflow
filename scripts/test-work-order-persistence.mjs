import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-wo-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/workflow/workOrderPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
globalThis.window = { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { sanitizeWorkOrderFormPatch, workOrderPatchMatches, createWorkOrderArrayItemLocator, findOptionalWorkOrderArrayItemIndex, findWorkOrderArrayItemIndex } = await import(pathToFileURL(out).href);

// sanitizeWorkOrderFormPatch strips system fields.
{
  const p = sanitizeWorkOrderFormPatch({ title: 'T', id: 'x', updated_date: 'v', _sys: 1, due_date: '2026-01-01' });
  assert.equal(p.title, 'T');
  assert.equal(p.id, undefined, 'id stripped');
  assert.equal(p.updated_date, undefined, 'updated_date stripped');
}

// workOrderPatchMatches.
assert.equal(workOrderPatchMatches({ a: 1, b: 2 }, { a: 1 }), true);
assert.equal(workOrderPatchMatches({ a: 1 }, { a: 2 }), false);
assert.equal(workOrderPatchMatches(null, { a: 1 }), false);

// createWorkOrderArrayItemLocator: id-first, snapshot fallback.
assert.deepEqual(createWorkOrderArrayItemLocator({ id: 'abc', x: 1 }), { id: 'abc' });
assert.deepEqual(createWorkOrderArrayItemLocator({ id: 7 }), { id: '7' }, 'numeric id coerced');
const snap = createWorkOrderArrayItemLocator({ name: 'foo', qty: 2 });
assert.ok(snap.snapshot, 'no id -> snapshot locator');
assert.throws(() => createWorkOrderArrayItemLocator('not an object'), /could not be identified/);

// findOptionalWorkOrderArrayItemIndex: id match, snapshot match, -1, ambiguous.
const items = [{ id: 'a', v: 1 }, { name: 'x' }, { name: 'x' }];
assert.equal(findOptionalWorkOrderArrayItemIndex(items, { id: 'a' }), 0);
assert.equal(findOptionalWorkOrderArrayItemIndex(items, { id: 'ghost' }), -1);
assert.throws(() => findOptionalWorkOrderArrayItemIndex(items, { snapshot: { name: 'x' } }), /ambiguous/);
assert.equal(findOptionalWorkOrderArrayItemIndex(items, { snapshot: { name: 'y' } }), -1);

// findWorkOrderArrayItemIndex throws on missing.
assert.equal(findWorkOrderArrayItemIndex(items, { id: 'a' }), 0);
assert.throws(() => findWorkOrderArrayItemIndex(items, { id: 'ghost' }), /changed or disappeared/);

console.log('PASS work order persistence (16 cases)');
process.exit(0);
