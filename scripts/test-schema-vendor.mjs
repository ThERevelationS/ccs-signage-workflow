// Contract checks for masterplan item A-14 (vendor registry):
//  - base44/entities/Vendor.jsonc        — canonical vendor record (new, backend-only RLS)
//  - base44/entities/PurchaseOrder.jsonc — extended with vendor_id (vendor_name kept for display)
//
// Run: node scripts/test-schema-vendor.mjs  →  prints "PASS schema-vendor"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let failures = 0;
const check = (cond, msg) => {
  if (cond) return;
  failures += 1;
  console.error('FAIL', msg);
};

// ---------- A-14: Vendor entity ----------

const vendor = readJson('base44/entities/Vendor.jsonc');
const vp = vendor.properties || {};

check(vendor.name === 'Vendor', 'Vendor.name is "Vendor"');
check(vendor.type === 'object', 'Vendor.type is "object"');

// Scalar string fields
for (const f of [
  'name',
  'terms',
  'gl_default',
  'statement_email',
  'phone',
  'email',
  'address',
  'account_number',
  'notes',
]) {
  check(vp[f]?.type === 'string', `Vendor.${f} is a string`);
}

// contacts: array of {name, email, phone, role}
check(vp.contacts?.type === 'array', 'Vendor.contacts is an array');
check(vp.contacts?.items?.type === 'object', 'Vendor.contacts.items is an object');
for (const f of ['name', 'email', 'phone', 'role']) {
  check(
    vp.contacts?.items?.properties?.[f]?.type === 'string',
    `Vendor.contacts.items.${f} is a string`,
  );
}

// comm_prefs: object {email, phone, preferred_method}
check(vp.comm_prefs?.type === 'object', 'Vendor.comm_prefs is an object');
for (const f of ['email', 'phone', 'preferred_method']) {
  check(
    vp.comm_prefs?.properties?.[f]?.type === 'string',
    `Vendor.comm_prefs.${f} is a string`,
  );
}

// status: string enum active|inactive
check(vp.status?.type === 'string', 'Vendor.status is a string');
for (const s of ['active', 'inactive']) {
  check(
    Array.isArray(vp.status?.enum) && vp.status.enum.includes(s),
    `Vendor.status enum includes "${s}"`,
  );
}

// Every field stays optional — required must be absent or empty.
check(
  !Array.isArray(vendor.required) || vendor.required.length === 0,
  'Vendor fields are all optional (required is empty/absent)',
);

// Backend-only RLS on all four ops.
for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    vendor.rls?.[op]?.user_condition?.role === '__vendor_backend_only__',
    `Vendor.rls.${op} is backend-only (__vendor_backend_only__)`,
  );
}

// ---------- A-14: PurchaseOrder extension ----------

const po = readJson('base44/entities/PurchaseOrder.jsonc');
const pop = po.properties || {};

check(pop.vendor_id?.type === 'string', 'PurchaseOrder.vendor_id is a string');
check(pop.vendor_name?.type === 'string', 'PurchaseOrder.vendor_name preserved (string, still used for display)');
check(
  Array.isArray(po.required) && po.required.includes('vendor_name'),
  'PurchaseOrder.required still includes vendor_name (unchanged)',
);

// Pre-existing flat vendor fields must be untouched.
check(pop.vendor_contact?.type === 'string', 'PurchaseOrder.vendor_contact preserved');
check(pop.vendor_email?.type === 'string', 'PurchaseOrder.vendor_email preserved');
check(pop.vendor_phone?.type === 'string', 'PurchaseOrder.vendor_phone preserved');

// PO backend-only RLS unchanged.
for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    po.rls?.[op]?.user_condition?.role === '__purchase_order_backend_only__',
    `PurchaseOrder.rls.${op} still backend-only`,
  );
}

// ---------- result ----------

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('PASS schema-vendor');
