// test-schema-additions.mjs — worker w-23 (A-24): schema additive audit.
//
// Single aggregate audit over every field the WS-A masterplan items (A-01..A-22)
// added to base44/entities/*.jsonc. The manifest below is consolidated from the
// per-item suites (test-schema-income-cogs, -part-fields, -pricing-entities,
// -partgroups-modifiers, -machine-tax, -crm-fields, -crmevent, -vendor,
// -payment-fields, -invoice-fields, -order-fields, -featurereport,
// -savedqueueview, -globalsettings) — those files hold the authoritative lists.
//
// For every manifest field this asserts:
//   (a) present in the entity file with the correct type (+ pinned items type),
//   (b) OPTIONAL — never present in a `required` array,
//   (c) the file still parses (// and /* */ comments stripped string-aware).
// Plus:
//   (1) NO entity file under base44/entities fails to parse,
//   (2) no required[] array in any entity contains a field that was ADDED to
//       that file — the check is file-keyed because manifest names like
//       `status`, `name`, `machine_type` legitimately appear in OTHER entities'
//       pre-existing required lists (VinylMachine, MachineRate, ...); those
//       are unchanged pre-WS-A contract, not additions,
//   (3) prints a per-file added-field count, then `PASS schema-additions`.
//
// Only fields the items ADDED are listed — pre-existing keys the suites assert
// as "unchanged" (Payment.reconciliation_batch_id, Customer.pricing_tier /
// industry_type / credit_limit / tax_exempt_reason, OpportunityActivity
// completed_at/assigned_to/outcome/due_at, PurchaseOrder.vendor_name et al,
// FeatureReport title/description/type/priority/status/submitted_by_* /
// completed_date/admin_notes, TaxGroup.group_name et al) are intentionally
// excluded.
//
// Run: node scripts/test-schema-additions.mjs  →  prints PASS schema-additions

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTITIES_DIR = join(root, 'base44', 'entities');

// ---------- string-aware comment stripper (same helper as test-schema-machine-tax.mjs) ----------
function parseJsonc(text, label) {
  // Strip // and /* */ comments outside string literals, then JSON.parse.
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  try {
    return JSON.parse(out);
  } catch (err) {
    throw new Error(`${label}: JSON.parse failed after comment strip: ${err.message}`);
  }
}

// ---------- manifest: file -> { fields, propsPath?, requiredPaths? } ----------
// Field spec: 'string' | 'number' | 'boolean' | 'object' | 'array'
//             or { type: 'array', items: 'string' | 'object' } (items type pinned
//             by the per-item suites).
const GL_ACCOUNT_FIELDS = {
  schema_version: 'number',
  creation_request_key: 'string',
  code: 'string',
  name: 'string',
  parent_account: 'string',
  status: 'string',
  updated_by: 'string',
};

const PART_SPEC_FIELDS = {
  income_account_code: 'string',
  cogs_account_code: 'string',
  pricing_template_id: 'string',
  part_group_id: 'string',
  design_lead_days: 'number',
  product_lead_days: 'number',
  labor_level_id: 'string',
  machine_ids: { type: 'array', items: 'string' },
  taxable: 'boolean',
  separate_on_invoice: 'boolean',
  double_sided: 'boolean',
  min_charge: 'number',
  parent_sizes: { type: 'array', items: 'string' },
  vendor_id: 'string',
  mfg_part_number: 'string',
  size_discounts: { type: 'array', items: 'object' },
};

const MANIFEST = {
  // A-01 / A-02 — GL chart registries (new entities; every property is added)
  'IncomeAccount.jsonc': { fields: { ...GL_ACCOUNT_FIELDS } },
  'COGSAccount.jsonc': { fields: { ...GL_ACCOUNT_FIELDS } },

  // A-03 — 16 CoreBridge spec fields on each part schema
  'BuilderPart.jsonc': { fields: { ...PART_SPEC_FIELDS } },
  'PartTemplate.jsonc': { fields: { ...PART_SPEC_FIELDS } },

  // A-04 — named qty-break x customer-tier margin charts (new entity)
  'PricingTemplate.jsonc': {
    fields: {
      name: 'string',
      unit_category: 'string',
      breaks: { type: 'array', items: 'object' },
      market_based: 'boolean',
      description: 'string',
      sort: 'number',
      status: 'string',
    },
  },

  // A-05 — catalog-inheritance part groups (new entity)
  'CatalogPartGroup.jsonc': {
    fields: {
      name: 'string',
      description: 'string',
      shared_defaults: 'object',
      part_ids: { type: 'array', items: 'string' },
      sort: 'number',
      status: 'string',
    },
  },

  // A-06 — pricing modifiers + their options (new entities)
  'PricingModifier.jsonc': {
    fields: {
      name: 'string',
      label: 'string',
      input_type: 'string',
      can_use_in_pricing: 'boolean',
      rates: { type: 'array', items: 'object' },
      formula_text: 'string',
      include_setup_fee: 'boolean',
      min_charge: 'number',
      affects_waste: 'boolean',
      inventoried_part_type: 'string',
      pricing_tier_id: 'string',
      display_order: 'number',
      status: 'string',
    },
  },
  'ModifierOption.jsonc': {
    fields: {
      modifier_id: 'string',
      label: 'string',
      value: 'string',
      rate_overrides: 'object',
      is_default: 'boolean',
      sort: 'number',
      status: 'string',
    },
  },

  // A-07 — named shared pricing-tier rule sets (new entity)
  'GlobalPricingTier.jsonc': {
    fields: {
      name: 'string',
      rules: { type: 'array', items: 'object' },
      description: 'string',
      status: 'string',
    },
  },

  // A-08 — unified machine registry (new entity)
  'Machine.jsonc': {
    fields: {
      name: 'string',
      machine_type: 'string',
      cost_per_hour: 'number',
      profiles: { type: 'array', items: 'object' },
      disposable_cost_per_unit: 'number',
      setup_cost: 'number',
      setup_minutes: 'number',
      labor_pct: 'number',
      weighted_multiplier: 'number',
      margin_chart_id: 'string',
      income_account: 'string',
      status: 'string',
      description: 'string',
    },
  },

  // A-09 — taxing-authority registry (new) + TaxGroup.agency_id (extension)
  'TaxAgency.jsonc': {
    fields: {
      name: 'string',
      rate: 'number',
      jurisdiction: 'string',
      gl_account: 'string',
      reporting_period: 'string',
      status: 'string',
    },
  },
  'TaxGroup.jsonc': {
    fields: { agency_id: 'string' },
  },

  // A-10 — Customer CRM fields (pre-existing industry_type / credit_limit /
  // tax_exempt_reason / pricing_tier are NOT additions — excluded)
  'Customer.jsonc': {
    fields: {
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
      warning_flags: { type: 'array', items: 'string' },
    },
  },

  // A-11 — CustomerContact role/grouping/status
  'CustomerContact.jsonc': {
    fields: {
      role: 'string',
      email_groups: { type: 'array', items: 'string' },
      contact_status: 'string',
    },
  },

  // A-12 — typed CRM event taxonomy registry (new entity)
  'CrmEventType.jsonc': {
    fields: {
      channel: 'string',
      label: 'string',
      sort: 'number',
      is_custom: 'boolean',
      status: 'string',
    },
  },

  // A-13 — OpportunityActivity gained event_type_id + completed_by
  'OpportunityActivity.jsonc': {
    fields: {
      event_type_id: 'string',
      completed_by: 'string',
    },
  },

  // A-14 — vendor registry (new) + PurchaseOrder.vendor_id (extension)
  'Vendor.jsonc': {
    fields: {
      name: 'string',
      contacts: { type: 'array', items: 'object' },
      terms: 'string',
      gl_default: 'string',
      comm_prefs: 'object',
      statement_email: 'string',
      phone: 'string',
      email: 'string',
      address: 'string',
      account_number: 'string',
      notes: 'string',
      status: 'string',
    },
  },
  'PurchaseOrder.jsonc': {
    fields: { vendor_id: 'string' },
  },

  // A-15 — Payment portal/deposit/GL fields (reconciliation_batch_id
  // pre-existed — excluded)
  'Payment.jsonc': {
    fields: {
      portal_source: 'string',
      deposit_applied_to_invoice_id: 'string',
      gl_memo: 'string',
    },
  },

  // A-16 — Invoice salesperson/entered_by/splits/statement_batch_id;
  // A-22 — canonical fee_lines (OrderFee) shared with AllInOneEstimate
  'Invoice.jsonc': {
    fields: {
      salesperson: 'string',
      entered_by: 'string',
      income_account_splits: { type: 'array', items: 'object' },
      statement_batch_id: 'string',
      fee_lines: { type: 'array', items: 'object' },
    },
  },

  // A-17 — WorkOrder.products[] gained the 7 ops fields (nested inside
  // products.items.properties — required[] checked at both levels)
  'WorkOrder.jsonc': {
    propsPath: ['properties', 'products', 'items', 'properties'],
    requiredPaths: [
      ['required'],
      ['properties', 'products', 'items', 'required'],
    ],
    containerLabel: 'products[]',
    fields: {
      responsibility: 'string',
      responsibility_color: 'string',
      priority: 'number',
      quick_tags: { type: 'array', items: 'string' },
      assigned_to: 'string',
      design_time_seconds: 'number',
      production_time_seconds: 'number',
    },
  },

  // A-18 — AllInOneEstimate order-parity fields
  'AllInOneEstimate.jsonc': {
    fields: {
      sales_center: 'string',
      po_number: 'string',
      entered_by_display: 'string',
      follow_up_date: 'string',
      payment_terms_label: 'string',
      internal_discount: 'number',
      fee_lines: { type: 'array', items: 'object' },
    },
  },

  // A-19 — FeatureReport report-catalog fields (pre-existing function-contract
  // fields title/type/priority/status/etc. are NOT additions — excluded)
  'FeatureReport.jsonc': {
    fields: {
      report_key: 'string',
      category: 'string',
      data_source: 'string',
      parameters_schema: 'object',
      default_filters: 'object',
      export_formats: { type: 'array', items: 'string' },
      is_system: 'boolean',
      sort: 'number',
    },
  },

  // A-20 — saved queue views (new entity)
  'SavedQueueView.jsonc': {
    fields: {
      name: 'string',
      queue_lens: 'string',
      page: 'string',
      owner_email: 'string',
      user_email: 'string',
      filters: 'object',
      is_shared: 'boolean',
      shared: 'boolean',
      pinned: 'boolean',
      sort: 'number',
      is_default: 'boolean',
      status: 'string',
      creation_request_key: 'string',
    },
  },

  // A-21 — GlobalSettings module settings keys
  'GlobalSettings.jsonc': {
    fields: {
      hoursOfOperation: 'object',
      emailDelivery: 'object',
      deadlineRules: 'object',
      creditTermsDefaults: 'object',
      autoInactiveMonths: 'number',
    },
  },
};

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const getPath = (obj, path) => {
  let cur = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
};

const specType = (spec) => (typeof spec === 'string' ? spec : spec.type);

// ---------- (1): parse EVERY entity file — none may fail ----------
const files = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc')).sort();
const parsed = new Map();
for (const file of files) {
  try {
    parsed.set(file, parseJsonc(readFileSync(join(ENTITIES_DIR, file), 'utf8'), `base44/entities/${file}`));
  } catch (err) {
    failures.push(err.message);
  }
}
check(files.length > 0, 'no base44/entities/*.jsonc files found — manifest cannot be audited');

// ---------- (a)+(b): manifest fields present, typed, optional ----------
let totalFields = 0;
const perFileCounts = [];
for (const [file, entry] of Object.entries(MANIFEST)) {
  const doc = parsed.get(file);
  const label = `base44/entities/${file}`;
  if (!doc) {
    if (!failures.some((f) => f.startsWith(label))) {
      failures.push(`${label}: file missing — expected ${Object.keys(entry.fields).length} added fields`);
    }
    continue;
  }
  const propsPath = entry.propsPath ?? ['properties'];
  const container = getPath(doc, propsPath);
  const where = entry.containerLabel ? ` ${entry.containerLabel}` : '';
  check(
    container !== null && typeof container === 'object' && !Array.isArray(container),
    `${label}:${where} properties container missing/not an object at ${propsPath.join('.')}`,
  );
  const fields = Object.entries(entry.fields);
  perFileCounts.push(`${file}: ${fields.length}`);
  totalFields += fields.length;

  // required[] arrays to check: top-level plus the container's own level.
  const requiredArrays = (entry.requiredPaths ?? [['required']])
    .map((p) => getPath(doc, p))
    .filter((r) => Array.isArray(r));

  for (const [name, spec] of fields) {
    const field = container?.[name];
    if (!field || typeof field !== 'object') {
      failures.push(`${label}:${where} missing added field "${name}"`);
      continue;
    }
    check(
      field.type === specType(spec),
      `${label}:${where} ${name}.type expected "${specType(spec)}", got ${JSON.stringify(field.type)}`,
    );
    if (typeof spec === 'object' && spec.items) {
      check(
        field.items?.type === spec.items,
        `${label}:${where} ${name}.items.type expected "${spec.items}", got ${JSON.stringify(field.items?.type)}`,
      );
    }
    for (const req of requiredArrays) {
      check(
        !req.includes(name),
        `${label}:${where} ${name} must stay optional but appears in required[] ${JSON.stringify(req)}`,
      );
    }
  }
}

// ---------- (2): required[] sweep across ALL entities ----------
// For every parsed entity, no required[] entry may be a field the manifest says
// was ADDED to that same file. Entities outside the manifest have no added
// fields, so the intersection is empty by construction — the sweep still scans
// every required[] to prove no file gained one.
let requiredArraysScanned = 0;
for (const [file, doc] of parsed) {
  const entry = MANIFEST[file];
  const added = new Set(Object.keys(entry?.fields ?? {}));
  const topRequired = Array.isArray(doc?.required) ? doc.required : [];
  requiredArraysScanned += 1;
  for (const name of topRequired) {
    check(
      !added.has(name),
      `base44/entities/${file}: required[] contains "${name}", which was added by a WS-A item and must stay optional`,
    );
  }
  // Nested required[] at the manifest container level (e.g. WorkOrder.products.items.required).
  if (entry?.requiredPaths) {
    for (const p of entry.requiredPaths) {
      if (p.length === 1 && p[0] === 'required') continue; // already swept above
      const req = getPath(doc, p);
      if (!Array.isArray(req)) continue;
      requiredArraysScanned += 1;
      for (const name of req) {
        check(
          !added.has(name),
          `base44/entities/${file}: nested required[] at ${p.join('.')} contains added field "${name}"`,
        );
      }
    }
  }
}

// ---------- result ----------
for (const line of perFileCounts) console.log(`  ${line} added field(s) OK`);

if (failures.length) {
  console.error(`FAIL schema-additions — ${failures.length} violation(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`  ${parsed.size} entities parsed, ${requiredArraysScanned} required[] arrays scanned, ${totalFields} added fields asserted`);
console.log('PASS schema-additions');
