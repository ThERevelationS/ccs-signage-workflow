// test-schema-order-fields.mjs — worker w-8 (A-17, A-18, A-22)
// Asserts the CoreBridge order-parity schema fields landed in the three owned
// entity files. Strips // comments (string-aware), JSON.parses, and checks:
//   A-17: WorkOrder.products[].items.properties gained the 7 ops fields
//   A-18: AllInOneEstimate.properties gained the 7 order fields
//   A-22: fee_lines OrderFee shape is identical on AllInOneEstimate + Invoice
// Run: node scripts/test-schema-order-fields.mjs  →  prints PASS

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

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// ---------- A-17: WorkOrder products[] ----------
const wo = loadEntity('WorkOrder');
const productProps = wo?.properties?.products?.items?.properties;
check(isObject(productProps), 'WorkOrder.products.items.properties missing/not an object');

const woExpected = {
  responsibility: 'string',
  responsibility_color: 'string',
  priority: 'number',
  quick_tags: 'array',
  assigned_to: 'string',
  design_time_seconds: 'number',
  production_time_seconds: 'number',
};
for (const [field, type] of Object.entries(woExpected)) {
  check(
    productProps?.[field]?.type === type,
    `WorkOrder.products[] missing "${field}" (type "${type}") — got ${JSON.stringify(productProps?.[field])}`,
  );
}
check(
  productProps?.priority?.minimum === 1 && productProps?.priority?.maximum === 99,
  `WorkOrder.products[].priority must be bounded 1..99 — got ${JSON.stringify(productProps?.priority)}`,
);
check(
  productProps?.quick_tags?.items?.type === 'string',
  'WorkOrder.products[].quick_tags.items must be { type: "string" }',
);

// ---------- A-18: AllInOneEstimate ----------
const est = loadEntity('AllInOneEstimate');
const estProps = est?.properties;
check(isObject(estProps), 'AllInOneEstimate.properties missing/not an object');

const estExpected = {
  sales_center: 'string',
  po_number: 'string',
  entered_by_display: 'string',
  follow_up_date: 'string',
  payment_terms_label: 'string',
  internal_discount: 'number',
  fee_lines: 'array',
};
for (const [field, type] of Object.entries(estExpected)) {
  check(
    estProps?.[field]?.type === type,
    `AllInOneEstimate missing "${field}" (type "${type}") — got ${JSON.stringify(estProps?.[field])}`,
  );
}
check(
  estProps?.follow_up_date?.format === 'date',
  'AllInOneEstimate.follow_up_date must carry format "date"',
);

// ---------- A-22: canonical fee_lines (OrderFee) ----------
const inv = loadEntity('Invoice');
const invFee = inv?.properties?.fee_lines;
const estFee = estProps?.fee_lines;

check(isObject(invFee), 'Invoice.fee_lines missing/not an object');
check(
  deepEqual(estFee, invFee),
  'fee_lines differs between AllInOneEstimate and Invoice — canonical OrderFee shape must be identical',
);

const feeItemProps = estFee?.items?.properties;
const orderFeeShape = {
  label: 'string',
  kind: 'string',
  amount: 'number',
  taxable: 'boolean',
  income_account_code: 'string',
};
const gotKeys = isObject(feeItemProps) ? Object.keys(feeItemProps).sort() : [];
check(
  deepEqual(gotKeys, Object.keys(orderFeeShape).sort()),
  `fee_lines item keys must be exactly ${Object.keys(orderFeeShape).sort().join(', ')} — got ${gotKeys.join(', ')}`,
);
for (const [field, type] of Object.entries(orderFeeShape)) {
  check(
    feeItemProps?.[field]?.type === type,
    `fee_lines.${field} must be type "${type}" — got ${JSON.stringify(feeItemProps?.[field])}`,
  );
}
check(
  deepEqual(estFee?.items?.properties?.kind?.enum, ['shipping', 'postage', 'discount', 'fee']),
  `fee_lines.kind enum must be [shipping, postage, discount, fee] — got ${JSON.stringify(estFee?.items?.properties?.kind?.enum)}`,
);
check(
  deepEqual(invFee?.items?.properties?.kind?.enum, ['shipping', 'postage', 'discount', 'fee']),
  'Invoice fee_lines.kind enum mismatch',
);

// ---------- result ----------
if (failures.length) {
  console.error('FAIL schema-order-fields');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASS schema-order-fields');
