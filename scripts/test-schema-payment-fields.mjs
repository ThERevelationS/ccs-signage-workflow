// test-schema-payment-fields.mjs — worker w-10 (A-15)
// Asserts the portal/deposit/GL schema fields landed on base44/entities/Payment.jsonc:
//   - portal_source (string — event-class marker, e.g. "added from Customer Portal")
//   - deposit_applied_to_invoice_id (string)
//   - gl_memo (string)
//   - reconciliation_batch_id (string — PRE-EXISTING, asserted still present)
// All four must be optional (absent from "required").
// Run: node scripts/test-schema-payment-fields.mjs  →  prints PASS

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  const raw = readFileSync(join(root, 'base44', 'entities', `${name}.jsonc`), 'utf8');
  return JSON.parse(stripJsonc(raw));
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ---------- A-15: Payment ----------
const payment = loadEntity('Payment');
const props = payment?.properties;
check(isObject(props), 'Payment.properties missing/not an object');

const expected = {
  portal_source: 'string',
  deposit_applied_to_invoice_id: 'string',
  gl_memo: 'string',
  reconciliation_batch_id: 'string', // pre-existing — asserted still present
};
for (const [field, type] of Object.entries(expected)) {
  check(
    props?.[field]?.type === type,
    `Payment missing "${field}" (type "${type}") — got ${JSON.stringify(props?.[field])}`,
  );
}

const required = Array.isArray(payment?.required) ? payment.required : [];
for (const field of Object.keys(expected)) {
  check(
    !required.includes(field),
    `Payment.${field} must be optional — found in required[]`,
  );
}

// sanity: required[] untouched (invoice_id + amount only)
check(
  required.length === 2 && required.includes('invoice_id') && required.includes('amount'),
  `Payment.required must remain [invoice_id, amount] — got ${JSON.stringify(required)}`,
);

// ---------- result ----------
if (failures.length) {
  console.error('FAIL schema-payment-fields');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASS schema-payment-fields');
