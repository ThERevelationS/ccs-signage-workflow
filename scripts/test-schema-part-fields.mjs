// A-03 verification: assert the 16 spec fields exist with correct types in
// base44/entities/BuilderPart.jsonc and base44/entities/PartTemplate.jsonc.
// Strips // comments (string-aware) before JSON.parse. Prints PASS on success.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'base44/entities/BuilderPart.jsonc',
  'base44/entities/PartTemplate.jsonc',
];

// name -> expected { type, items? }
const SPEC_FIELDS = {
  income_account_code: { type: 'string' },
  cogs_account_code: { type: 'string' },
  pricing_template_id: { type: 'string' },
  part_group_id: { type: 'string' },
  design_lead_days: { type: 'number' },
  product_lead_days: { type: 'number' },
  labor_level_id: { type: 'string' },
  machine_ids: { type: 'array', items: 'string' },
  taxable: { type: 'boolean' },
  separate_on_invoice: { type: 'boolean' },
  double_sided: { type: 'boolean' },
  min_charge: { type: 'number' },
  parent_sizes: { type: 'array', items: 'string' },
  vendor_id: { type: 'string' },
  mfg_part_number: { type: 'string' },
  size_discounts: { type: 'array', items: 'object' },
};

function stripLineComments(src) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

const failures = [];

for (const rel of FILES) {
  const abs = join(root, rel);
  const raw = readFileSync(abs, 'utf8');
  let doc;
  try {
    doc = JSON.parse(stripLineComments(raw));
  } catch (err) {
    failures.push(`${rel}: JSON.parse failed after comment strip: ${err.message}`);
    continue;
  }
  const props = doc && doc.properties;
  if (!props || typeof props !== 'object') {
    failures.push(`${rel}: missing properties object`);
    continue;
  }
  const required = Array.isArray(doc.required) ? doc.required : [];
  for (const [name, spec] of Object.entries(SPEC_FIELDS)) {
    const field = props[name];
    if (!field) {
      failures.push(`${rel}: missing field ${name}`);
      continue;
    }
    if (field.type !== spec.type) {
      failures.push(`${rel}: ${name}.type expected ${spec.type}, got ${field.type}`);
      continue;
    }
    if (spec.items) {
      const itemType = field.items && field.items.type;
      if (itemType !== spec.items) {
        failures.push(`${rel}: ${name}.items.type expected ${spec.items}, got ${itemType}`);
      }
    }
    if (required.includes(name)) {
      failures.push(`${rel}: ${name} must stay optional but is listed in required`);
    }
  }
}

if (failures.length) {
  console.error('FAIL test-schema-part-fields');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}

console.log('PASS test-schema-part-fields');
