// test-po-required.mjs — worker w-62 (G-10)
// Asserts the PO-required schema fields landed on Customer.jsonc and that
// poRequiredModel.js enforces the gate: customer.po_required (or the parallel
// legacy require_purchase_order flag) blocks quote send/approve until the
// estimate carries a non-blank PO number in po_number, po, or customer_po.
// Run: node scripts/test-po-required.mjs  →  prints PASS

import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---------- schema checks ----------

function stripJsonc(src) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

function loadEntity(name) {
  return JSON.parse(stripJsonc(readFileSync(join(root, 'base44', 'entities', `${name}.jsonc`), 'utf8')));
}

const customer = loadEntity('Customer');
const custProps = customer?.properties || {};
assert.equal(custProps.po_required?.type, 'boolean', 'Customer.po_required is a boolean');
assert.equal(custProps.po_required?.default, false, 'Customer.po_required defaults false');
assert.equal(custProps.po_required_note?.type, 'string', 'Customer.po_required_note is a string');
// Parallel legacy flag remains declared (pre-existing, not re-added by G-10).
assert.equal(custProps.require_purchase_order?.type, 'boolean', 'Customer.require_purchase_order still declared');

// A-18 verification: po_number must already exist on AllInOneEstimate (the
// estimate entity; there is no Estimate.jsonc). Verify — never re-add.
const estimate = loadEntity('AllInOneEstimate');
assert.equal(estimate?.properties?.po_number?.type, 'string', 'AllInOneEstimate.po_number declared (A-18)');

// ---------- model checks ----------

const bundlePath = resolve(here, '.tmp-po-required.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/poRequiredModel.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { poRequirement, poBlockReason, assertPoAllowed, estimatePoNumber, PO_BLOCK_REASON } =
  await import(pathToFileURL(bundlePath).href);
rmSync(bundlePath, { force: true });

// poRequirement truth table — false-safe, canonical flag, legacy parallel.
assert.deepEqual(poRequirement(null), { required: false, reason: 'no_customer' }, 'missing customer never requires');
assert.deepEqual(poRequirement(undefined), { required: false, reason: 'no_customer' }, 'undefined customer never requires');
assert.deepEqual(poRequirement({}), { required: false, reason: '' }, 'empty customer does not require');
assert.deepEqual(poRequirement({ po_required: false }), { required: false, reason: '' }, 'false flag does not require');
assert.deepEqual(poRequirement({ po_required: true }), { required: true, reason: 'po_required' }, 'po_required requires');
assert.deepEqual(poRequirement({ require_purchase_order: true }), { required: true, reason: 'require_purchase_order' }, 'legacy parallel flag requires');
assert.deepEqual(poRequirement({ po_required: 'yes' }), { required: false, reason: '' }, 'non-boolean flag does not require');

// poBlockReason truth table — canonical field, aliases, whitespace.
assert.equal(poBlockReason({ customer: null, estimate: null }), null, 'missing customer never blocks');
assert.equal(poBlockReason({ customer: { po_required: false }, estimate: {} }), null, 'not-required customer never blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po_number: 'PO-123' } }), null, 'po_number satisfies');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po_number: '  PO-123  ' } }), null, 'padded po_number satisfies');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: {} }), 'po_required', 'missing po blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: null }), 'po_required', 'missing estimate blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po_number: '' } }), 'po_required', 'empty po blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po_number: '   ' } }), 'po_required', 'whitespace po blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po: 'LEG-9' } }), null, 'legacy po alias satisfies');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { customer_po: 'CPO-77' } }), null, 'legacy customer_po alias satisfies');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { po: '  ' } }), 'po_required', 'whitespace alias still blocks');
assert.equal(poBlockReason({ customer: { po_required: true }, estimate: { show_po_number: true } }), 'po_required', 'display toggle is not a PO number');
assert.equal(poBlockReason({ customer: { require_purchase_order: true }, estimate: {} }), 'po_required', 'legacy customer flag blocks with canonical reason');

// assertPoAllowed — ok shape, error code, and the exact user-facing message.
assert.deepEqual(
  assertPoAllowed({ customer: { po_required: false }, estimate: {} }),
  { ok: true }, 'allowed when customer does not require PO');
assert.deepEqual(
  assertPoAllowed({ customer: { po_required: true }, estimate: { po_number: 'PO-1' } }),
  { ok: true }, 'allowed when PO present');
assert.deepEqual(
  assertPoAllowed({ customer: { po_required: true }, estimate: {}, action: 'sending a quote' }),
  { ok: false, error: 'po_required', message: 'This customer requires a PO number before sending a quote.' },
  'send block carries exact message');
assert.deepEqual(
  assertPoAllowed({ customer: { po_required: true }, estimate: {}, action: 'approving' }),
  { ok: false, error: 'po_required', message: 'This customer requires a PO number before approving.' },
  'approve block carries exact message');
assert.deepEqual(
  assertPoAllowed({ customer: { po_required: true }, estimate: {} }),
  { ok: false, error: 'po_required', message: 'This customer requires a PO number before sending a quote.' },
  'default action is the send wording');
assert.equal(PO_BLOCK_REASON, 'po_required', 'exported reason code is stable');

// estimatePoNumber — resolves canonical first, then aliases.
assert.equal(estimatePoNumber({ po_number: 'A', po: 'B' }), 'A', 'canonical po_number wins over alias');
assert.equal(estimatePoNumber({ customer_po: 'C' }), 'C', 'customer_po alias resolves');
assert.equal(estimatePoNumber({ po_number: 12345 }), '12345', 'numeric PO coerces to text');
assert.equal(estimatePoNumber(null), '', 'missing estimate yields empty');
assert.equal(estimatePoNumber({ po_number: '   ' }), '', 'whitespace yields empty');

console.log('PASS po-required (36 asserts)');
