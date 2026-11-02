import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Zero-dependency contract check for the A-16 Invoice schema additions:
// salesperson, entered_by, income_account_splits (array of
// {income_account_code, amount}), and statement_batch_id must exist as
// optional fields, and the sibling-added fee_lines block must still be
// intact. Run: node scripts/test-schema-invoice-fields.mjs

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (rel) => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));

const entity = readJson('base44/entities/Invoice.jsonc');
assert.equal(entity.name, 'Invoice', 'Invoice entity name');
assert.equal(entity.type, 'object', 'Invoice entity type');

const props = entity.properties || {};

// --- A-16 fields -------------------------------------------------------
assert.equal(props.salesperson?.type, 'string',
  'Invoice.salesperson must be a string');
assert.equal(props.entered_by?.type, 'string',
  'Invoice.entered_by must be a string');
assert.equal(props.statement_batch_id?.type, 'string',
  'Invoice.statement_batch_id must be a string');

assert.equal(props.income_account_splits?.type, 'array',
  'Invoice.income_account_splits must be an array');
const splitItem = props.income_account_splits?.items;
assert.equal(splitItem?.type, 'object',
  'income_account_splits items must be objects');
assert.equal(splitItem?.properties?.income_account_code?.type, 'string',
  'income_account_splits[].income_account_code must be a string');
assert.equal(splitItem?.properties?.amount?.type, 'number',
  'income_account_splits[].amount must be a number');

// --- Sibling-owned fee_lines must remain intact ------------------------
assert.equal(props.fee_lines?.type, 'array',
  'Invoice.fee_lines must still be an array');
const feeItem = props.fee_lines?.items;
assert.equal(feeItem?.type, 'object', 'fee_lines items must be objects');
for (const [field, type] of [['label', 'string'], ['kind', 'string'], ['amount', 'number'], ['taxable', 'boolean'], ['income_account_code', 'string']]) {
  assert.equal(feeItem?.properties?.[field]?.type, type,
    `fee_lines[].${field} must still be a ${type}`);
}
assert.deepEqual(feeItem?.properties?.kind?.enum,
  ['shipping', 'postage', 'discount', 'fee'],
  'fee_lines[].kind enum must be unchanged');

// --- Nothing new may become required -----------------------------------
assert.deepEqual(entity.required, ['customer_id'],
  'Invoice.required must remain exactly [customer_id]');
for (const field of ['salesperson', 'entered_by', 'income_account_splits', 'statement_batch_id']) {
  assert.ok(!entity.required.includes(field), `${field} must stay optional`);
}

// Backend-only RLS unchanged on all four ops.
for (const op of ['create', 'read', 'update', 'delete']) {
  assert.equal(entity.rls?.[op]?.user_condition?.role, '__invoice_backend_only__',
    `Invoice.rls.${op} must remain __invoice_backend_only__`);
}

console.log('PASS schema-invoice-fields');
