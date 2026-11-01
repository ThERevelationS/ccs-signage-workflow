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
// Every system field is stripped regardless of shape (#389).
{
  const p = sanitizeWorkOrderFormPatch({
    id: 'w1', created_date: 'd0', updated_date: 'd1', created_by: 'me@x', created_by_id: 'u1', title: 'T',
  });
  assert.deepEqual(p, { title: 'T' }, 'id/created_date/updated_date/created_by/created_by_id all stripped');
}
// Non-system fields — including undeclared custom blobs — survive untouched.
{
  const p = sanitizeWorkOrderFormPatch({ title: 'T', _salesTaskAdoption: { done: true }, custom_blob: 'b' });
  assert.deepEqual(p, { title: 'T', _salesTaskAdoption: { done: true }, custom_blob: 'b' }, 'custom fields preserved');
}

// workOrderPatchMatches.
assert.equal(workOrderPatchMatches({ a: 1, b: 2 }, { a: 1 }), true);
assert.equal(workOrderPatchMatches({ a: 1 }, { a: 2 }), false);
assert.equal(workOrderPatchMatches(null, { a: 1 }), false);
// Top-level string values are normalized before compare (#390): a patch that
// only differs by surrounding whitespace already "matches" the loaded row —
// the CAS write was applied, it just carries trimmed/canonical text.
assert.equal(workOrderPatchMatches({ a: 'Acme' }, { a: '  Acme  ' }), true, 'whitespace-padded patch string matches trimmed stored value');
assert.equal(workOrderPatchMatches({ a: 'Acme' }, { a: 'acme' }), false, 'case differences still mismatch');
// String tolerance is intentionally shallow — nested object strings compare strictly.
assert.equal(workOrderPatchMatches({ n: { a: 'Acme' } }, { n: { a: 'Acme' } }), true, 'nested object with equal strings matches');
assert.equal(workOrderPatchMatches({ n: { a: 'Acme' } }, { n: { a: 'Acme ' } }), false, 'nested string whitespace is NOT normalized');
// Numeric-looking strings compare to numbers within the compare tolerance.
assert.equal(workOrderPatchMatches({ qty: 12.5 }, { qty: '12.5' }), true, 'numeric string vs number tolerated');
// null/undefined are never "the same as" an empty-ish string.
assert.equal(workOrderPatchMatches({ a: null }, { a: '' }), false);
assert.equal(workOrderPatchMatches({}, { a: 'x' }), false, 'missing key cannot satisfy a patch field');

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