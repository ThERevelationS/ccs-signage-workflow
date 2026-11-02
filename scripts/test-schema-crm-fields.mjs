// A-10 / A-11 — CRM field contract for Customer + CustomerContact entities.
// Asserts every masterplan-spec field exists with the specified JSON-schema type.
// Prints NOTE lines for spec fields that already existed (skipped) or conflicted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const load = (rel) =>
  JSON.parse(
    readFileSync(resolve(here, rel), 'utf8')
      .replace(/\/\/.*$/gm, '') // tolerate jsonc line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''),
  );

const customer = load('../base44/entities/Customer.jsonc');
const contact = load('../base44/entities/CustomerContact.jsonc');

const prop = (schema, key) => {
  assert.ok(schema.properties && key in schema.properties, `missing property ${schema.name}.${key}`);
  return schema.properties[key];
};

const checkType = (schema, key, type) => {
  const p = prop(schema, key);
  assert.equal(p.type, type, `${schema.name}.${key} type`);
  if (type === 'array') assert.equal(p.items?.type, 'string', `${schema.name}.${key} items type`);
  return p;
};

const notes = [];

// ── A-10 :: Customer — fields added by this item ────────────────────────────
const a10Added = {
  origination_path: 'string',
  customer_type: 'string',
  status: 'string',
  auto_inactive_months: 'number',
  master_account_id: 'string',
  po_required: 'boolean',
  credit_terms_days: 'number',
  tax_exempt_id: 'string',
  tax_exempt_expires: 'string',
  in_store_credit_balance: 'number',
  warning_flags: 'array',
};
for (const [key, type] of Object.entries(a10Added)) checkType(customer, key, type);

// spec: status is a string + description carrying Lead|Prospect|Active|Inactive
for (const v of ['Lead', 'Prospect', 'Active', 'Inactive'])
  assert.ok(prop(customer, 'status').description?.includes(v), `Customer.status description lists ${v}`);

// ── A-10 :: spec fields that already existed (compatible — skipped, not re-added)
for (const [key, type] of Object.entries({ industry_type: 'string', credit_limit: 'number', tax_exempt_reason: 'string' })) {
  checkType(customer, key, type);
  notes.push(`Customer.${key} already existed as ${type} — spec-compatible, skipped`);
}

// ── A-10 :: conflict — pricing_tier spec'd as string, pre-exists as number ──
assert.equal(prop(customer, 'pricing_tier').type, 'number', 'Customer.pricing_tier keeps pre-existing number type (conflict documented, not modified)');
notes.push('CONFLICT Customer.pricing_tier: spec string vs existing number — left unmodified');

// ── A-11 :: CustomerContact — fields added by this item ─────────────────────
const a11Added = { role: 'string', email_groups: 'array', contact_status: 'string' };
for (const [key, type] of Object.entries(a11Added)) checkType(contact, key, type);
for (const v of ['primary', 'billing', 'site'])
  assert.ok(prop(contact, 'role').description?.includes(v), `CustomerContact.role description lists ${v}`);
for (const v of ['active', 'deactivated', 'do_not_mail', 'hot_prospect', 'referral'])
  assert.ok(prop(contact, 'contact_status').description?.includes(v), `CustomerContact.contact_status description lists ${v}`);

for (const n of notes) console.log(`NOTE ${n}`);
console.log('PASS schema-crm-fields');
