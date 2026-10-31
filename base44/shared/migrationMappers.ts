// Pure mapper registry for the CoreBridge CSV migration backend
// (base44/functions/manageMigration). Holds every per-entity mapping spec —
// column aliases, required fields, enums/coercion, number/date/bool/phone
// normalization, parent-reference resolution and legacy-id preservation.
//
// No Deno or Base44 SDK dependencies: this module is safe to esbuild-bundle
// and unit-test under plain Node (scripts/test-migration.mjs).

export const SOURCE_APP_ID = 'corebridge';
export const BATCH_MARKER = '__batch__';
export const ERROR_TARGET_ID = '__error__';
export const SOURCE_ID_FIELD = '__source_id__';
export const MAX_ROWS_PER_CALL = 500;
export const MAX_SAMPLE_ROWS = 10;

// Fields that carry row identity — never written back over themselves on an
// on_duplicate=update pass.
export const IDENTITY_FIELDS = new Set([
  'creation_request_key',
  'idempotency_key',
  'setting_key',
]);

export const clean = (value: any) => String(value ?? '').trim();

export function normalizeColumnName(name: any) {
  return clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseNumberValue(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = clean(value);
  if (!s) return null;
  let t = s.replace(/[$,\s]/g, '');
  let negative = false;
  const parens = t.match(/^\((.*)\)$/);
  if (parens) {
    negative = true;
    t = parens[1];
  }
  if (t.endsWith('%')) t = t.slice(0, -1);
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseDateValue(value: any): string {
  const s = clean(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : s;
  }
  const mdy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(year, Number(mdy[1]) - 1, Number(mdy[2])));
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  const epoch = s.match(/^\d{10,13}$/);
  if (epoch) {
    const d = new Date(Number(s.length === 13 ? s : `${s}000`));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function parseBoolValue(value: any): boolean | null {
  if (typeof value === 'boolean') return value;
  const s = clean(value).toLowerCase();
  if (!s) return null;
  if (['y', 'yes', 'true', '1', 'x', 'checked', 'on', 't'].includes(s)) return true;
  if (['n', 'no', 'false', '0', 'off', 'f', 'unchecked'].includes(s)) return false;
  return null;
}

export function normalizePhoneValue(value: any): string {
  const s = clean(value);
  if (!s) return '';
  const ext = s.match(/(?:ext\.?|x)\s*(\d+)\s*$/i);
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${ext ? ` x${ext[1]}` : ''}`;
  }
  return s;
}

export function coerceEnumValue(
  value: any,
  allowed: string[],
  coerceMap: Record<string, string> = {},
  fallback = '',
): string {
  const s = clean(value);
  if (!s) return fallback;
  const low = s.toLowerCase();
  const mapped = coerceMap[low];
  if (mapped && allowed.includes(mapped)) return mapped;
  const underscored = low.replace(/[\s\-]+/g, '_');
  const hit = allowed.find((a) => a.toLowerCase() === low || a.toLowerCase() === underscored);
  return hit ?? fallback;
}

export function appendNote(existing: any, line: string): string {
  const base = clean(existing);
  return base ? `${base}\n${line}` : line;
}

interface ParentSpec {
  field: string;            // target field the resolved id/name lands in
  parent_key: string;       // import key whose map rows hold the parent ids
  required?: boolean;       // unresolved parent => row error
  source_field?: string;    // record field holding the parent source id (defaults to `field`)
  display_field?: string;   // resolve to a display value (e.g. vendor name) instead of the target id
  keep_literal?: boolean;   // unresolved value stays as literal text (vendor names)
  optional_hint?: boolean;  // suppress the "no mapped column" preview warning
}

interface MapperSpec {
  key: string;
  target_entity: string;
  kind: 'real' | 'stub';
  required: string[];
  auto_filled?: string[];                 // required fields the importer fills itself
  idempotency_field: 'creation_request_key' | 'idempotency_key' | null;
  legacy_id_field: string | null;
  legacy_id_prefix?: string;
  notes_append?: boolean;                 // append "CoreBridge ID: <id>" to a notes string field
  source_summary?: boolean;               // entity has a source_summary object field
  enums: Record<string, string[]>;
  enum_coerce: Record<string, Record<string, string>>;
  enum_fallback: Record<string, string>;
  defaults: Record<string, any>;
  numbers: string[];
  dates: string[];
  bools: string[];
  phones: string[];
  aliases: Record<string, string[]>;
  parents: ParentSpec[];
  fields: string[];                       // writable target fields allowed in mappings
  note?: string;
  assemble?: (rec: any, sourceId: string) => any;
  normalize?: (rec: any, raw: any) => void;
  validate?: (rec: any) => string[];
}

// Columns that always mean "this row's own source id" regardless of entity.
const GENERIC_SOURCE_ID_COLUMNS = new Set([
  'id', 'sourceid', 'cbid', 'corebridgeid', 'legacyid', 'externalid',
  'recordid', 'rowid', 'uuid',
]);

export function autoMapColumns(mapper: MapperSpec, columns: string[]) {
  const normToField: Record<string, string> = {};
  const seeds: Record<string, string[]> = {
    [SOURCE_ID_FIELD]: ['id', 'source_id', 'cb_id', 'record_id', 'legacy_id', 'external_id'],
    ...(mapper.aliases || {}),
  };
  for (const [field, names] of Object.entries(seeds)) {
    const list = [field, ...(Array.isArray(names) ? names : [])];
    for (const name of list) {
      const n = normalizeColumnName(name);
      if (n && normToField[n] === undefined) normToField[n] = field;
    }
  }
  const proposed: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const col of columns || []) {
    const n = normalizeColumnName(col);
    if (!n) continue;
    if (GENERIC_SOURCE_ID_COLUMNS.has(n)) {
      proposed[col] = SOURCE_ID_FIELD;
      continue;
    }
    const field = normToField[n];
    if (field) proposed[col] = field;
    else unmapped.push(col);
  }
  return { proposed, unmapped };
}

export function resolveSourceId(raw: any, mapping: Record<string, string>, explicitColumn?: string) {
  if (explicitColumn) {
    const v = clean(raw?.[explicitColumn]);
    if (v) return v;
  }
  for (const [col, field] of Object.entries(mapping || {})) {
    if (field === SOURCE_ID_FIELD) {
      const v = clean(raw?.[col]);
      if (v) return v;
    }
  }
  for (const col of ['__source_id', 'source_id', 'Source ID', 'id', 'ID', 'Id', 'cb_id', 'record_id']) {
    const v = clean(raw?.[col]);
    if (v) return v;
  }
  return '';
}

// Copies mapped source columns onto a fresh record. Target fields that are not
// in the mapper's declared field list (or a handled pseudo-field) are dropped
// so stray/typo'd mapping targets can never reach the entity write.
export function applyMappingToRecord(mapper: MapperSpec, raw: any, mapping: Record<string, string>) {
  const allowed = new Set([...(mapper.fields || []), ...(mapper.required || []), ...(mapper.auto_filled || [])]);
  const rec: any = {};
  const dropped: string[] = [];
  for (const [col, field] of Object.entries(mapping || {})) {
    const f = clean(field);
    if (!f || f.startsWith('__')) continue;
    if (!allowed.has(f)) {
      dropped.push(f);
      continue;
    }
    rec[f] = raw?.[col];
  }
  return { record: rec, dropped };
}

// Type/default coercion only — the per-mapper `normalize` hook runs LATER in
// the entry pipeline (after parent resolution) so hooks can rely on resolved
// parent fields. `assemble` runs last because it may wrap the record shape.
export function coerceRecordTypes(mapper: MapperSpec, rec: any) {
  const out = { ...rec };
  for (const [field, value] of Object.entries(mapper.defaults || {})) {
    if (clean(out[field]) === '' && out[field] !== false) out[field] = value;
  }
  for (const field of mapper.numbers || []) {
    if (out[field] === undefined || out[field] === null || clean(out[field]) === '') continue;
    const n = parseNumberValue(out[field]);
    if (n === null) delete out[field];
    else out[field] = n;
  }
  for (const field of mapper.dates || []) {
    if (clean(out[field]) === '') continue;
    out[field] = parseDateValue(out[field]);
  }
  for (const field of mapper.bools || []) {
    if (out[field] === undefined || out[field] === null || clean(out[field]) === '') continue;
    const b = parseBoolValue(out[field]);
    if (b === null) delete out[field];
    else out[field] = b;
  }
  for (const field of mapper.phones || []) {
    if (clean(out[field]) === '') continue;
    out[field] = normalizePhoneValue(out[field]);
  }
  for (const [field, allowed] of Object.entries(mapper.enums || {})) {
    if (clean(out[field]) === '') {
      if (mapper.enum_fallback?.[field] !== undefined) out[field] = mapper.enum_fallback[field];
      continue;
    }
    const coerced = coerceEnumValue(out[field], allowed, mapper.enum_coerce?.[field] || {}, '');
    if (!coerced) {
      if (mapper.enum_fallback?.[field] !== undefined) out[field] = mapper.enum_fallback[field];
      else delete out[field];
    } else {
      out[field] = coerced;
    }
  }
  for (const key of Object.keys(out)) {
    if (typeof out[key] === 'string') out[key] = clean(out[key]);
  }
  return out;
}

// Full single-record pipeline for tests/preview: coerce -> normalize hook ->
// assemble. The entry point inserts parent resolution between coerce and
// normalize (see functions/manageMigration).
export function normalizeRecordForMapper(mapper: MapperSpec, rec: any, raw: any, sourceId: string) {
  const out = coerceRecordTypes(mapper, rec);
  mapper.normalize?.(out, raw);
  return mapper.assemble ? mapper.assemble(out, sourceId) : out;
}

export function validateRecordForMapper(mapper: MapperSpec, rec: any) {
  const errors: string[] = [];
  for (const field of mapper.required || []) {
    const v = rec?.[field];
    if (v === undefined || v === null || clean(v) === '') errors.push(`missing required field "${field}"`);
  }
  const extra = mapper.validate?.(rec) || [];
  return errors.concat(extra);
}

export function buildMappingPreview(mapper: MapperSpec, columns: string[], sampleRows: any[]) {
  const { proposed, unmapped } = autoMapColumns(mapper, columns);
  const warnings: string[] = [];
  const targetSet = new Set(Object.values(proposed));
  const autoFilled = new Set([...(mapper.auto_filled || [])]);
  if (mapper.idempotency_field) autoFilled.add(mapper.idempotency_field);
  if (mapper.legacy_id_field) autoFilled.add(mapper.legacy_id_field);
  for (const req of mapper.required || []) {
    if (autoFilled.has(req)) continue;
    if (!targetSet.has(req) && mapper.defaults?.[req] === undefined) {
      warnings.push(`required field "${req}" has no mapped column and no default — affected rows will fail`);
    }
  }
  const rows = (Array.isArray(sampleRows) ? sampleRows : []).slice(0, MAX_SAMPLE_ROWS);
  for (const [col, field] of Object.entries(proposed)) {
    const allowed = mapper.enums?.[field];
    if (allowed) {
      const badVals = new Set<string>();
      for (const row of rows) {
        const raw = clean(row?.[col]);
        if (!raw) continue;
        if (!coerceEnumValue(raw, allowed, mapper.enum_coerce?.[field] || {}, '')) badVals.add(raw);
      }
      if (badVals.size) {
        warnings.push(
          `column "${col}" -> "${field}": ${badVals.size} unrecognized enum value(s) ` +
          `(${[...badVals].slice(0, 5).join(', ')})${mapper.enum_fallback?.[field] !== undefined ? ` — will fall back to "${mapper.enum_fallback[field]}"` : ' — field will be left blank'}`,
        );
      }
    }
    if ((mapper.numbers || []).includes(field)) {
      const badNums = new Set<string>();
      for (const row of rows) {
        const raw = clean(row?.[col]);
        if (!raw) continue;
        if (parseNumberValue(raw) === null) badNums.add(raw);
      }
      if (badNums.size) {
        warnings.push(`column "${col}" -> "${field}": ${badNums.size} non-numeric value(s) (${[...badNums].slice(0, 5).join(', ')}) — will be left blank`);
      }
    }
    if ((mapper.dates || []).includes(field)) {
      const badDates = new Set<string>();
      for (const row of rows) {
        const raw = clean(row?.[col]);
        if (!raw) continue;
        if (!parseDateValue(raw)) badDates.add(raw);
      }
      if (badDates.size) {
        warnings.push(`column "${col}" -> "${field}": ${badDates.size} unparseable date(s) (${[...badDates].slice(0, 5).join(', ')}) — will be left blank`);
      }
    }
  }
  for (const parent of mapper.parents || []) {
    if (!targetSet.has(parent.field) && !parent.optional_hint) {
      warnings.push(
        `parent link "${parent.field}" (${parent.parent_key}) has no mapped column — ` +
        (parent.required ? 'rows will fail without it' : 'rows will import unlinked'),
      );
    }
  }
  const defaults: Record<string, any> = { ...(mapper.defaults || {}) };
  for (const field of autoFilled) {
    if (mapper.required.includes(field) && defaults[field] === undefined) {
      defaults[field] = '<auto: cb:' + mapper.key + ':<source_id>>';
    }
  }
  for (const [field, fb] of Object.entries(mapper.enum_fallback || {})) {
    if (defaults[field] === undefined) defaults[field] = `<enum fallback: ${fb}>`;
  }
  return {
    proposed_mapping: proposed,
    unmapped_columns: unmapped,
    warnings,
    required_fields: mapper.required,
    default_suggestions: defaults,
  };
}

// ---------------------------------------------------------------------------
// Mapper registry. `key` is the `entity` argument callers pass to the function
// (and the source_entity value stamped on LegacyMigrationMap rows).
// ---------------------------------------------------------------------------

const requirementEnum = ['unknown', 'yes', 'no', 'maybe', 'na'];

export const MIGRATION_MAPPERS: Record<string, MapperSpec> = {

  customers: {
    key: 'customers',
    target_entity: 'Customer',
    kind: 'real',
    required: ['company_name'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null, // Customer has no dedicated legacy field — CB id is appended to notes
    notes_append: true,
    enums: {
      customer_status: ['prospect', 'active', 'inactive'],
      additional_phone_type: ['', 'office', 'cell', 'fax', 'home', 'other'],
      contact_additional_phone_type: ['', 'office', 'cell', 'fax', 'home', 'other'],
    },
    enum_coerce: {
      customer_status: { active: 'active', inactive: 'inactive', prospect: 'prospect', lead: 'prospect', current: 'active' },
    },
    enum_fallback: { customer_status: 'active' },
    defaults: { customer_status: 'active', billing_country: 'United States' },
    numbers: ['credit_limit', 'in_store_credit', 'quote_valid_days', 'pricing_tier'],
    dates: ['tax_exempt_expiration', 'last_contacted_at'],
    bools: ['tax_exempt', 'billing_contact_same', 'require_purchase_order', 'credit_hold', 'is_active'],
    phones: ['company_phone', 'company_fax', 'additional_phone', 'contact_office_phone', 'contact_cell_phone', 'contact_additional_phone', 'billing_contact_phone'],
    aliases: {
      [SOURCE_ID_FIELD]: ['customer id', 'customer_id', 'cust id', 'account id', 'account number', 'account #', 'cust num', 'customer number'],
      company_name: ['company name', 'company', 'customer', 'customer name', 'account name', 'business', 'business name', 'name'],
      company_phone: ['phone', 'company phone', 'main phone', 'phone number', 'office phone', 'business phone'],
      company_fax: ['fax', 'company fax', 'fax number'],
      website: ['website', 'web', 'url', 'web site'],
      additional_phone: ['phone 2', 'second phone', 'alt phone'],
      contact_first_name: ['first name', 'contact first name', 'contact fname', 'firstname'],
      contact_last_name: ['last name', 'contact last name', 'contact lname', 'lastname'],
      contact_position: ['position', 'title', 'contact title', 'job title'],
      contact_email: ['email', 'e-mail', 'contact email', 'email address', 'primary email'],
      contact_office_phone: ['contact phone', 'contact office phone', 'work phone', 'direct phone'],
      contact_office_ext: ['ext', 'extension', 'phone ext'],
      contact_cell_phone: ['cell', 'cell phone', 'mobile', 'mobile phone', 'contact cell'],
      billing_contact_name: ['billing contact', 'billing contact name', 'ap contact'],
      billing_contact_email: ['billing email', 'ap email', 'billing contact email'],
      billing_contact_phone: ['billing phone', 'billing contact phone'],
      billing_address_1: ['billing address', 'billing address 1', 'bill to', 'address', 'address 1', 'street', 'street address'],
      billing_address_2: ['billing address 2', 'address 2', 'suite', 'unit'],
      billing_city: ['billing city', 'city'],
      billing_state: ['billing state', 'state', 'st', 'province'],
      billing_postal_code: ['billing zip', 'billing postal code', 'zip', 'zip code', 'postal code', 'postal'],
      billing_country: ['billing country', 'country'],
      location_address_1: ['site address', 'ship to', 'shipping address', 'location address'],
      location_city: ['site city', 'shipping city'],
      location_state: ['site state', 'shipping state'],
      location_postal_code: ['site zip', 'shipping zip'],
      salesperson: ['salesperson', 'sales rep', 'salesperson name', 'rep', 'account manager'],
      location: ['sales center', 'branch', 'location'],
      default_tax_group: ['tax group', 'taxgroup', 'tax rate group'],
      terms: ['terms', 'payment terms', 'net terms'],
      tax_exempt: ['tax exempt', 'taxexempt', 'exempt'],
      tax_id_number: ['tax id', 'tax id number', 'resale number', 'exemption number'],
      credit_limit: ['credit limit', 'creditlimit'],
      in_store_credit: ['in-store credit', 'store credit', 'in store credit'],
      credit_hold: ['credit hold', 'on hold'],
      customer_status: ['status', 'customer status', 'active'],
      customer_origination: ['origination', 'lead source', 'source'],
      industry_type: ['industry', 'industry type'],
      notes: ['notes', 'comments', 'customer notes', 'memo'],
      pricing_tier: ['pricing tier', 'tier', 'price tier'],
    },
    parents: [],
    fields: [
      'company_name', 'company_phone', 'company_fax', 'website', 'additional_phone', 'additional_phone_type',
      'contact_first_name', 'contact_last_name', 'contact_position', 'contact_email', 'contact_office_phone',
      'contact_office_ext', 'contact_cell_phone', 'contact_additional_phone', 'contact_additional_phone_type',
      'contact_status', 'job_authority', 'billing_contact_same', 'billing_contact_name', 'billing_contact_email',
      'billing_contact_phone', 'billing_address_1', 'billing_address_2', 'billing_city', 'billing_state',
      'billing_postal_code', 'billing_postal_ext', 'billing_country', 'location_same_as_billing',
      'location_address_1', 'location_address_2', 'location_city', 'location_state', 'location_postal_code',
      'salesperson', 'location', 'default_tax_group', 'quote_valid_days', 'customer_origination',
      'industry_type', 'master_account', 'terms', 'tax_exempt', 'tax_id_number', 'tax_exempt_expiration',
      'tax_exempt_reason', 'require_purchase_order', 'shipping_account', 'credit_limit', 'credit_hold',
      'in_store_credit', 'pricing_tier', 'send_monthly_statements', 'is_active', 'customer_status',
      'notes', 'tags', 'last_contacted_at',
    ],
    note: 'Customer has no legacy-id field — CoreBridge id is appended to notes AND kept in LegacyMigrationMap.source_id.',
  },

  contacts: {
    key: 'contacts',
    target_entity: 'CustomerContact',
    kind: 'real',
    required: ['customer_id'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    source_summary: true,
    notes_append: true,
    enums: {
      authority_role: ['unknown', 'decision_maker', 'influencer', 'accounts_payable', 'site_contact', 'tenant', 'owner_rep', 'property_manager', 'other'],
      preferred_contact_method: ['unknown', 'phone', 'mobile', 'email', 'text'],
    },
    enum_coerce: {
      authority_role: { owner: 'decision_maker', 'decision maker': 'decision_maker', ap: 'accounts_payable', 'accounts payable': 'accounts_payable', billing: 'accounts_payable', 'site contact': 'site_contact', tenant: 'tenant', 'property manager': 'property_manager' },
      preferred_contact_method: { phone: 'phone', call: 'phone', mobile: 'mobile', cell: 'mobile', email: 'email', 'e-mail': 'email', text: 'text', sms: 'text' },
    },
    enum_fallback: { authority_role: 'unknown', preferred_contact_method: 'unknown' },
    defaults: { is_active: true },
    numbers: [],
    dates: [],
    bools: ['is_primary', 'is_billing_contact', 'is_site_contact', 'is_active'],
    phones: ['phone', 'mobile_phone'],
    aliases: {
      [SOURCE_ID_FIELD]: ['contact id', 'contact_id', 'person id'],
      customer_id: ['customer id', 'customer_id', 'parent id', 'parent_id', 'company id', 'account id', 'cust id'],
      first_name: ['first name', 'firstname', 'fname', 'given name'],
      last_name: ['last name', 'lastname', 'lname', 'surname'],
      display_name: ['name', 'display name', 'contact', 'contact name', 'full name'],
      position: ['position', 'title', 'job title', 'role'],
      email: ['email', 'e-mail', 'email address', 'contact email'],
      phone: ['phone', 'office phone', 'work phone', 'phone number', 'main phone'],
      phone_ext: ['ext', 'extension', 'phone ext'],
      mobile_phone: ['cell', 'cell phone', 'mobile', 'mobile phone'],
      is_primary: ['primary', 'is primary', 'primary contact'],
      authority_role: ['authority', 'authority role', 'contact role'],
      preferred_contact_method: ['preferred contact', 'contact method', 'preferred contact method'],
      notes: ['notes', 'comments'],
    },
    parents: [{ field: 'customer_id', parent_key: 'customers', required: true }],
    fields: [
      'customer_id', 'first_name', 'last_name', 'display_name', 'position', 'email', 'phone', 'phone_ext',
      'mobile_phone', 'authority_role', 'is_primary', 'is_billing_contact', 'is_site_contact',
      'preferred_contact_method', 'notes', 'is_active', 'source_summary',
    ],
    normalize(rec: any) {
      if (!clean(rec.display_name)) {
        rec.display_name = clean(`${clean(rec.first_name)} ${clean(rec.last_name)}`);
      }
    },
    note: 'CustomerContact has no legacy-id field — CB id stored in source_summary + notes.',
  },

  addresses: {
    key: 'addresses',
    target_entity: 'CustomerLocation',
    kind: 'real',
    required: ['customer_id'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    source_summary: true,
    notes_append: true,
    enums: {
      site_type: ['unknown', 'install', 'billing', 'install_and_billing', 'mailing', 'other'],
    },
    enum_coerce: {
      site_type: { install: 'install', installation: 'install', site: 'install', billing: 'billing', 'bill to': 'billing', 'install and billing': 'install_and_billing', both: 'install_and_billing', mailing: 'mailing', shipping: 'install', 'ship to': 'install' },
    },
    enum_fallback: { site_type: 'unknown' },
    defaults: { country: 'US', is_active: true },
    numbers: [],
    dates: [],
    bools: ['is_primary_site', 'is_billing_address', 'is_active'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['address id', 'location id', 'site id', 'address_id'],
      customer_id: ['customer id', 'customer_id', 'parent id', 'parent_id', 'company id', 'account id', 'cust id'],
      label: ['label', 'location name', 'site name', 'name', 'ship name'],
      address_line_1: ['address', 'address 1', 'address line 1', 'street', 'street address', 'ship to', 'site address'],
      address_line_2: ['address 2', 'address line 2', 'suite', 'unit'],
      city: ['city', 'town'],
      state: ['state', 'st', 'province'],
      postal_code: ['zip', 'zip code', 'postal code', 'postal', 'postal_code'],
      country: ['country'],
      county: ['county', 'parish'],
      site_type: ['site type', 'address type', 'location type', 'type'],
      is_billing_address: ['billing', 'is billing', 'billing address flag'],
      is_primary_site: ['primary', 'primary site', 'main site'],
      access_notes: ['access notes', 'gate code', 'entry instructions'],
      notes: ['notes', 'comments'],
    },
    parents: [{ field: 'customer_id', parent_key: 'customers', required: true }],
    fields: [
      'customer_id', 'label', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code', 'country',
      'site_type', 'is_primary_site', 'is_billing_address', 'county', 'parcel_id', 'property_owner_name',
      'access_notes', 'notes', 'is_active', 'source_summary',
    ],
    note: 'CustomerLocation has no legacy-id field — CB id stored in source_summary + notes.',
  },

  // There is no Vendor entity in this app (vendors exist only as string fields
  // on PurchaseOrder.vendor_name / Order.vendor / Inventory.supplier). Vendor
  // rows are stored as one GlobalSettings row per vendor:
  //   setting_key   = "corebridge_vendor:<source_id>"  (required + dedupeable)
  //   setting_value = { name, contact, email, phone, ..., source_id }
  vendors: {
    key: 'vendors',
    target_entity: 'GlobalSettings',
    kind: 'real',
    required: ['setting_key'],
    auto_filled: ['setting_key'],
    idempotency_field: null,
    legacy_id_field: null,
    enums: {},
    enum_coerce: {},
    enum_fallback: {},
    defaults: {},
    numbers: [],
    dates: [],
    bools: [],
    phones: ['phone', 'fax'],
    aliases: {
      [SOURCE_ID_FIELD]: ['vendor id', 'vendor_id', 'supplier id', 'account id'],
      name: ['vendor', 'vendor name', 'name', 'supplier', 'supplier name', 'company'],
      contact: ['contact', 'contact name', 'rep', 'account rep'],
      email: ['email', 'e-mail', 'vendor email', 'email address'],
      phone: ['phone', 'vendor phone', 'phone number'],
      fax: ['fax', 'fax number'],
      address: ['address', 'street', 'address 1'],
      city: ['city'],
      state: ['state'],
      zip: ['zip', 'postal code', 'zip code'],
      account_number: ['account number', 'acct number', 'account #', 'acct #', 'customer number'],
      terms: ['terms', 'payment terms'],
      website: ['website', 'url'],
      notes: ['notes', 'comments'],
    },
    parents: [],
    fields: ['name', 'contact', 'email', 'phone', 'fax', 'address', 'city', 'state', 'zip', 'account_number', 'terms', 'website', 'notes'],
    assemble(rec: any, sourceId: string) {
      const settingValue: Record<string, any> = {
        source_app_id: SOURCE_APP_ID,
        source_id: sourceId,
      };
      for (const field of ['name', 'contact', 'email', 'phone', 'fax', 'address', 'city', 'state', 'zip', 'account_number', 'terms', 'website', 'notes']) {
        if (clean(rec[field])) settingValue[field] = clean(rec[field]);
      }
      if (!clean(settingValue.name)) settingValue.name = `CoreBridge vendor ${sourceId}`;
      return { setting_key: `corebridge_vendor:${sourceId}`, setting_value: settingValue };
    },
    validate(rec: any) {
      const errors: string[] = [];
      if (!clean(rec?.setting_value?.name)) errors.push('vendor name is required (setting_value.name)');
      return errors;
    },
    note: 'No Vendor entity exists in this app — vendors persist as GlobalSettings rows keyed corebridge_vendor:<source_id>.',
  },

  parts: {
    key: 'parts',
    target_entity: 'Inventory',
    kind: 'real',
    required: ['material_type', 'product_type', 'size', 'cost_per_unit'],
    idempotency_field: null, // Inventory has no creation_request_key — dedupe relies on map + legacy_source_id
    legacy_id_field: 'legacy_source_id',
    enums: {
      material_type: ['Aluminum', 'Steel', 'Stainless_Steel', 'Galvanized_Steel', 'Brass', 'Copper', 'Plastic', 'Other'],
      product_type: ['Channel', 'Tube_Square', 'Tube_Round', 'Flat_Bar', 'Round_Bar', 'Sheet', 'Plate', 'I_Beam', 'H_Beam', 'Pipe', 'Other'],
      unit_type: ['per_foot', 'per_piece', 'per_pound', 'per_sqft'],
    },
    enum_coerce: {
      material_type: { aluminum: 'Aluminum', aluminium: 'Aluminum', steel: 'Steel', 'stainless steel': 'Stainless_Steel', stainless: 'Stainless_Steel', 'galvanized steel': 'Galvanized_Steel', galvanized: 'Galvanized_Steel', brass: 'Brass', copper: 'Copper', plastic: 'Plastic', acrylic: 'Plastic', pvc: 'Plastic' },
      product_type: { sheet: 'Sheet', plate: 'Plate', pipe: 'Pipe', 'flat bar': 'Flat_Bar', 'round bar': 'Round_Bar', 'tube square': 'Tube_Square', 'square tube': 'Tube_Square', 'sq tube': 'Tube_Square', 'tube round': 'Tube_Round', 'round tube': 'Tube_Round', channel: 'Channel', 'i beam': 'I_Beam', 'h beam': 'H_Beam', angle: 'Other' },
      unit_type: { 'per foot': 'per_foot', perfoot: 'per_foot', foot: 'per_foot', ft: 'per_foot', lf: 'per_foot', 'per piece': 'per_piece', piece: 'per_piece', ea: 'per_piece', each: 'per_piece', 'per pound': 'per_pound', pound: 'per_pound', lb: 'per_pound', lbs: 'per_pound', 'per sqft': 'per_sqft', 'per sq ft': 'per_sqft', sqft: 'per_sqft', 'sq ft': 'per_sqft' },
    },
    enum_fallback: { material_type: 'Other', product_type: 'Other', unit_type: 'per_piece' },
    defaults: { unit_type: 'per_piece', quantity_on_hand: 0 },
    numbers: ['cost_per_unit', 'standard_length', 'quantity_on_hand', 'reorder_point'],
    dates: [],
    bools: ['is_pole', 'deleted'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['part id', 'item id', 'inventory id', 'part_id', 'sku id'],
      material_type: ['material', 'material type', 'substrate'],
      product_type: ['product type', 'product', 'shape', 'form'],
      size: ['size', 'dimensions', 'dimension', 'size/dimensions'],
      thickness_gauge: ['thickness', 'gauge', 'thickness gauge'],
      standard_length: ['length', 'standard length', 'stock length'],
      cost_per_unit: ['cost', 'unit cost', 'cost per unit', 'price', 'unit price', 'cost ea', 'unit_cost'],
      unit_type: ['unit', 'unit type', 'uom', 'unit of measure', 'priced by'],
      supplier: ['supplier', 'vendor', 'vendor name'],
      quantity_on_hand: ['qty', 'quantity', 'on hand', 'quantity on hand', 'stock', 'qty on hand'],
      reorder_point: ['reorder point', 'reorder', 'min qty', 'minimum'],
      barcode: ['barcode', 'sku', 'part number', 'part #', 'upc'],
      notes: ['notes', 'description', 'comments'],
      income_account: ['income account', 'gl income'],
      cogs_account: ['cogs account', 'gl cogs', 'cogs'],
    },
    parents: [],
    fields: [
      'material_type', 'product_type', 'size', 'thickness_gauge', 'standard_length', 'cost_per_unit',
      'unit_type', 'supplier', 'notes', 'is_pole', 'legacy_source_id', 'quantity_on_hand',
      'reorder_point', 'image_url', 'barcode', 'deleted', 'income_account', 'cogs_account',
    ],
    note: 'Inventory has a dedicated legacy_source_id field — CB id is stored there.',
  },

  employees: {
    key: 'employees',
    target_entity: 'AuthorizedEmail',
    kind: 'real',
    required: ['email'],
    idempotency_field: null,
    legacy_id_field: null, // AuthorizedEmail has no notes/legacy field — CB id only in LegacyMigrationMap
    enums: {
      role: ['user', 'admin'],
      employment_type: ['hourly', 'salary'],
    },
    enum_coerce: {
      role: { admin: 'admin', administrator: 'admin', user: 'user', staff: 'user', employee: 'user', manager: 'user', sales: 'user' },
      employment_type: { hourly: 'hourly', salary: 'salary', salaried: 'salary', hourly_employee: 'hourly' },
    },
    enum_fallback: { role: 'user' },
    defaults: { role: 'user' },
    numbers: [],
    dates: [],
    bools: ['is_deactivated'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['employee id', 'user id', 'staff id', 'employee_id'],
      email: ['email', 'e-mail', 'email address', 'work email', 'user email'],
      full_name: ['name', 'full name', 'employee', 'employee name', 'staff name'],
      username: ['username', 'user name', 'login'],
      role: ['role', 'access', 'access level', 'user role'],
      reports_to: ['reports to', 'manager', 'supervisor'],
      is_deactivated: ['inactive', 'deactivated', 'disabled', 'former employee'],
      employment_type: ['employment type', 'pay type'],
    },
    parents: [],
    fields: ['email', 'full_name', 'username', 'role', 'reports_to', 'is_deactivated', 'employment_type', 'sales_roles'],
    validate(rec: any) {
      const errors: string[] = [];
      const email = clean(rec?.email).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`email "${email}" is not a valid address`);
      return errors;
    },
    normalize(rec: any) {
      rec.email = clean(rec.email).toLowerCase();
    },
    note: 'AuthorizedEmail has no legacy/notes field — CB id lives only in LegacyMigrationMap.source_id. Password/security fields are never imported.',
  },

  estimates: {
    key: 'estimates',
    target_entity: 'AllInOneEstimate',
    kind: 'real',
    required: ['project_name'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    notes_append: true,
    enums: {
      status: ['draft', 'calculated', 'sent', 'approved', 'archived', 'cancelled'],
      priority: ['low', 'normal', 'high', 'rush'],
    },
    enum_coerce: {
      status: { draft: 'draft', sent: 'sent', presented: 'sent', open: 'sent', pending: 'sent', approved: 'approved', sold: 'approved', won: 'approved', accepted: 'approved', 'closed won': 'approved', archived: 'archived', closed: 'archived', lost: 'archived', 'closed lost': 'archived', declined: 'archived', dead: 'archived', cancelled: 'cancelled', canceled: 'cancelled', void: 'cancelled' },
      priority: { low: 'low', normal: 'normal', medium: 'normal', high: 'high', rush: 'rush', urgent: 'rush' },
    },
    enum_fallback: { status: 'archived', priority: 'normal' },
    defaults: { status: 'archived', priority: 'normal' },
    numbers: ['tax_percent', 'quote_total', 'total_cost', 'shipping_fee', 'permit_fee', 'discount_percent', 'deposit_percent', 'pricing_tier'],
    dates: ['quote_issue_date', 'quote_expiration_date', 'target_install_date', 'accepted_at'],
    bools: ['is_template', 'deleted'],
    phones: ['contact_phone', 'office_phone'],
    aliases: {
      [SOURCE_ID_FIELD]: ['estimate id', 'estimate_id', 'est id'],
      project_name: ['project name', 'name', 'title', 'estimate name', 'project', 'job name', 'description'],
      estimate_number: ['estimate number', 'estimate #', 'est number', 'est #', 'number', 'estimate no', 'doc number'],
      client_name: ['client', 'client name', 'customer', 'customer name', 'company'],
      customer_id: ['customer id', 'customer_id'],
      contact_name: ['contact', 'contact name'],
      contact_email: ['contact email', 'email'],
      contact_phone: ['contact phone', 'phone'],
      salesperson: ['salesperson', 'sales rep', 'rep'],
      sales_center: ['sales center', 'location', 'branch'],
      po_number: ['po', 'po number', 'po #', 'purchase order'],
      terms: ['terms', 'payment terms'],
      status: ['status', 'estimate status', 'state'],
      priority: ['priority'],
      tax_percent: ['tax percent', 'tax rate', 'tax %'],
      quote_total: ['total', 'quote total', 'grand total', 'estimate total', 'amount'],
      total_cost: ['cost', 'total cost', 'estimated cost'],
      quote_issue_date: ['issue date', 'date', 'estimate date', 'created', 'created date', 'quote date'],
      quote_expiration_date: ['expiration', 'expiration date', 'expires', 'valid until'],
      target_install_date: ['install date', 'target install date', 'desired date'],
      notes: ['notes', 'internal notes', 'memo'],
      site_address: ['site address', 'install address', 'job address'],
      tax_group: ['tax group'],
    },
    parents: [{ field: 'customer_id', parent_key: 'customers', required: false }],
    fields: [
      'project_name', 'estimate_number', 'client_name', 'customer_id', 'contact_name', 'contact_email',
      'contact_phone', 'salesperson', 'sales_center', 'po_number', 'terms', 'status', 'priority',
      'tax_percent', 'quote_total', 'total_cost', 'shipping_fee', 'permit_fee', 'discount_percent',
      'deposit_percent', 'pricing_tier', 'quote_issue_date', 'quote_expiration_date',
      'target_install_date', 'accepted_at', 'site_address', 'tax_group', 'notes', 'hyperlink', 'tags',
    ],
    normalize(rec: any) {
      if (!clean(rec.project_name)) rec.project_name = clean(rec.client_name) || clean(rec.estimate_number) || 'Imported estimate';
      if (!clean(rec.client_name)) rec.client_name = clean(rec.project_name);
    },
    note: 'AllInOneEstimate has no legacy-id field — CB id appended to notes. Line items/products are NOT imported (section data is builder-specific).',
  },

  work_orders: {
    key: 'work_orders',
    target_entity: 'WorkOrder',
    kind: 'real',
    required: ['title', 'client_name'],
    idempotency_field: null, // WorkOrder has no creation_request_key
    legacy_id_field: 'sales_import_source_id',
    legacy_id_prefix: 'corebridge:',
    enums: {
      current_stage: ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation', 'completed'],
      sales_status: ['lead', 'quoted', 'follow_up', 'won', 'lost', 'on_hold'],
      permitting: ['yes', 'no', 'maybe', 'na'],
    },
    enum_coerce: {
      current_stage: { estimating: 'estimating', estimate: 'estimating', sales: 'sales', quote: 'sales', quoted: 'sales', permitting: 'permitting', permit: 'permitting', design: 'design', production: 'production', 'in production': 'production', fabrication: 'fabrication', install: 'installation', installation: 'installation', installing: 'installation', completed: 'completed', complete: 'completed', done: 'completed', closed: 'completed', delivered: 'completed', invoiced: 'completed', 'picked up': 'completed' },
      sales_status: { lead: 'lead', quoted: 'quoted', 'follow up': 'follow_up', followup: 'follow_up', won: 'won', sold: 'won', 'closed won': 'won', lost: 'lost', 'closed lost': 'lost', 'on hold': 'on_hold', onhold: 'on_hold' },
      permitting: { yes: 'yes', y: 'yes', no: 'no', n: 'no', maybe: 'maybe', na: 'na', 'n/a': 'na' },
    },
    enum_fallback: { current_stage: 'completed' },
    defaults: { current_stage: 'completed', completed: true },
    numbers: ['priority', 'estimate_amount', 'actual_cost', 'deposit_amount', 'budget_less_than'],
    dates: ['due_date', 'start_date', 'project_install_date', 'date_order_created', 'close_date', 'date_initial_contact', 'date_estimate_sent', 'business_co_coo_date'],
    bools: ['completed', 'asap', 'deposit_required'],
    phones: ['contact_phone'],
    aliases: {
      [SOURCE_ID_FIELD]: ['order id', 'work order id', 'job id', 'wo id', 'order_id'],
      title: ['title', 'order title', 'name', 'job name', 'order name', 'work order'],
      client_name: ['client', 'client name', 'customer', 'customer name', 'company', 'company name'],
      customer_id: ['customer id', 'customer_id'],
      description: ['description', 'order description', 'details', 'notes'],
      current_stage: ['stage', 'status', 'order status', 'phase', 'department'],
      sales_status: ['sales status', 'pipeline status'],
      corbridge_invoice_number: ['invoice number', 'invoice #', 'inv number', 'cb invoice'],
      corbridge_link: ['invoice link', 'corbridge link', 'corebridge link', 'order link', 'url'],
      estimate_amount: ['estimate amount', 'order total', 'total', 'amount', 'order amount', 'sale amount'],
      due_date: ['due date', 'due', 'deadline'],
      project_install_date: ['install date', 'installation date', 'scheduled date'],
      date_order_created: ['order date', 'created', 'date ordered', 'order created'],
      close_date: ['close date', 'completed date', 'date completed', 'closed'],
      contact_name: ['contact', 'contact name'],
      contact_email: ['contact email', 'email'],
      contact_phone: ['contact phone', 'phone'],
      sales_rep: ['sales rep', 'salesperson', 'rep'],
      project_manager: ['project manager', 'pm'],
      designer: ['designer'],
      install_location: ['install location', 'site address', 'job address', 'location'],
      billing_address: ['billing address', 'bill to'],
      project_type: ['project type', 'order type', 'type'],
      lead_source: ['lead source', 'source', 'origination'],
      lost_reason: ['lost reason', 'reason lost'],
      priority: ['priority', 'queue priority'],
    },
    parents: [{ field: 'customer_id', parent_key: 'customers', required: false }],
    fields: [
      'title', 'client_name', 'customer_id', 'description', 'current_stage', 'sales_status', 'priority',
      'due_date', 'start_date', 'project_install_date', 'date_order_created', 'date_initial_contact',
      'date_estimate_sent', 'close_date', 'contact_name', 'contact_email', 'contact_phone',
      'sales_rep', 'project_manager', 'designer', 'estimator', 'install_location', 'billing_address',
      'project_type', 'lead_source', 'lost_reason', 'estimate_amount', 'actual_cost', 'deposit_amount',
      'corbridge_invoice_number', 'corbridge_link', 'permitting', 'completed', 'asap',
      'deposit_required', 'sales_import_source_id', 'sales_import_last_synced_at',
    ],
    normalize(rec: any, raw: any) {
      if (!clean(rec.title)) rec.title = clean(rec.client_name) || `CoreBridge order ${clean(raw?.id)}`;
      if (!clean(rec.client_name)) rec.client_name = 'Unknown customer';
      rec.sales_import_last_synced_at = new Date().toISOString();
      if (clean(rec.current_stage) === 'completed') rec.completed = true;
    },
    note: 'CB id stored in WorkOrder.sales_import_source_id as "corebridge:<id>" (the entity\'s external-source-identity field).',
  },

  invoices: {
    key: 'invoices',
    target_entity: 'Invoice',
    kind: 'real',
    required: ['customer_id'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    source_summary: true,
    notes_append: true,
    enums: {
      status: ['draft', 'sent', 'partially_paid', 'paid', 'void'],
      billing_type: ['standard', 'deposit', 'progress', 'final'],
    },
    enum_coerce: {
      status: { paid: 'paid', 'paid in full': 'paid', partial: 'partially_paid', 'partially paid': 'partially_paid', 'partial payment': 'partially_paid', sent: 'sent', open: 'sent', unpaid: 'sent', outstanding: 'sent', issued: 'sent', draft: 'draft', void: 'void', voided: 'void', cancelled: 'void', canceled: 'void', 'written off': 'void' },
      billing_type: { standard: 'standard', deposit: 'deposit', progress: 'progress', final: 'final', balance: 'final' },
    },
    enum_fallback: { status: 'sent', billing_type: 'standard' },
    defaults: { status: 'sent', billing_type: 'standard' },
    numbers: ['subtotal', 'discount_amount', 'tax_rate', 'tax_amount', 'deposit_applied', 'total', 'amount_paid', 'balance_due'],
    dates: ['issue_date', 'due_date', 'sent_date', 'paid_date'],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['invoice id', 'invoice_id', 'inv id'],
      invoice_number: ['invoice number', 'invoice #', 'number', 'inv number', 'doc number', 'invoice no'],
      customer_id: ['customer id', 'customer_id', 'account id'],
      customer_display_name: ['customer', 'customer name', 'company', 'client', 'bill to'],
      work_order_id: ['work order id', 'order id', 'job id'],
      estimate_id: ['estimate id', 'estimate_id', 'est id'],
      status: ['status', 'invoice status', 'state'],
      billing_type: ['billing type', 'invoice type'],
      subtotal: ['subtotal', 'sub total', 'net'],
      discount_amount: ['discount', 'discount amount'],
      tax_rate: ['tax rate', 'tax percent', 'tax %'],
      tax_amount: ['tax', 'tax amount', 'sales tax'],
      total: ['total', 'invoice total', 'grand total', 'amount', 'invoice amount'],
      amount_paid: ['amount paid', 'paid', 'payments', 'total paid'],
      balance_due: ['balance', 'balance due', 'amount due', 'open balance'],
      issue_date: ['issue date', 'invoice date', 'date', 'created'],
      due_date: ['due date', 'due', 'payment due'],
      paid_date: ['paid date', 'date paid'],
      terms: ['terms', 'payment terms'],
      notes: ['notes', 'memo', 'customer notes'],
      internal_notes: ['internal notes', 'private notes'],
    },
    parents: [
      { field: 'customer_id', parent_key: 'customers', required: true },
      { field: 'work_order_id', parent_key: 'work_orders', required: false },
      { field: 'estimate_id', parent_key: 'estimates', required: false },
    ],
    fields: [
      'invoice_number', 'status', 'billing_type', 'customer_id', 'customer_display_name',
      'work_order_id', 'estimate_id', 'subtotal', 'discount_amount', 'tax_rate', 'tax_amount',
      'deposit_applied', 'total', 'amount_paid', 'balance_due', 'issue_date', 'due_date',
      'sent_date', 'paid_date', 'voided_date', 'terms', 'notes', 'internal_notes',
      'source_summary', 'created_by',
    ],
    normalize(rec: any) {
      const total = parseNumberValue(rec.total);
      const paid = parseNumberValue(rec.amount_paid);
      if (clean(rec.balance_due) === '' && total !== null) {
        rec.balance_due = Math.max(0, Math.round(((total ?? 0) - (paid ?? 0)) * 100) / 100);
      }
      if (clean(rec.status) === 'paid' && !clean(rec.paid_date)) {
        rec.paid_date = clean(rec.due_date) || clean(rec.issue_date);
      }
    },
    note: 'Invoice has no legacy-id field — CB id in source_summary + notes. invoice_number preserved for reconciliation.',
  },

  payments: {
    key: 'payments',
    target_entity: 'Payment',
    kind: 'real',
    required: ['invoice_id', 'amount'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    notes_append: true,
    enums: {
      method: ['cash', 'check', 'card', 'ach', 'financing', 'other', 'credit_memo'],
      status: ['recorded', 'void', 'refunded'],
    },
    enum_coerce: {
      method: { cash: 'cash', check: 'check', cheque: 'check', card: 'card', 'credit card': 'card', 'debit card': 'card', cc: 'card', visa: 'card', mastercard: 'card', amex: 'card', 'american express': 'card', discover: 'card', ach: 'ach', eft: 'ach', 'bank transfer': 'ach', wire: 'ach', financing: 'financing', finance: 'financing', financed: 'financing', 'credit memo': 'credit_memo', creditmemo: 'credit_memo', 'store credit': 'credit_memo', other: 'other' },
      status: { recorded: 'recorded', posted: 'recorded', cleared: 'recorded', void: 'void', voided: 'void', refunded: 'refunded', refund: 'refunded' },
    },
    enum_fallback: { method: 'other', status: 'recorded' },
    defaults: { method: 'other', status: 'recorded' },
    numbers: ['amount'],
    dates: ['paid_date', 'voided_date'],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['payment id', 'payment_id', 'receipt id'],
      invoice_id: ['invoice id', 'invoice_id', 'inv id'],
      customer_id: ['customer id', 'customer_id'],
      amount: ['amount', 'payment', 'payment amount', 'paid amount', 'total'],
      method: ['method', 'payment method', 'tender', 'pay method', 'type'],
      reference_number: ['reference', 'reference number', 'check number', 'check #', 'auth code', 'confirmation', 'transaction id'],
      paid_date: ['paid date', 'payment date', 'date', 'date paid'],
      status: ['status', 'payment status'],
      notes: ['notes', 'memo'],
    },
    parents: [
      { field: 'invoice_id', parent_key: 'invoices', required: true },
      { field: 'customer_id', parent_key: 'customers', required: false },
    ],
    fields: [
      'invoice_id', 'customer_id', 'amount', 'method', 'reference_number', 'paid_date',
      'status', 'notes', 'created_by',
    ],
    validate(rec: any) {
      const errors: string[] = [];
      const amount = parseNumberValue(rec?.amount);
      if (amount === null || amount <= 0) errors.push('payment amount must be a positive number');
      return errors;
    },
    normalize(rec: any) {
      const n = parseNumberValue(rec.amount);
      if (n !== null) rec.amount = n;
    },
    note: 'Payment has no legacy-id field — CB id appended to notes. Invoice linkage is resolved through the invoices map index.',
  },

  purchase_orders: {
    key: 'purchase_orders',
    target_entity: 'PurchaseOrder',
    kind: 'real',
    required: ['vendor_name'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    source_summary: true,
    notes_append: true,
    enums: {
      status: ['draft', 'sent', 'partially_received', 'received', 'cancelled'],
      payment_status: ['unpaid', 'invoiced', 'paid'],
    },
    enum_coerce: {
      status: { draft: 'draft', sent: 'sent', ordered: 'sent', open: 'sent', placed: 'sent', 'partially received': 'partially_received', partial: 'partially_received', received: 'received', complete: 'received', closed: 'received', cancelled: 'cancelled', canceled: 'cancelled', void: 'cancelled' },
      payment_status: { unpaid: 'unpaid', open: 'unpaid', invoiced: 'invoiced', billed: 'invoiced', bill: 'invoiced', paid: 'paid' },
    },
    enum_fallback: { status: 'received', payment_status: 'unpaid' },
    defaults: { status: 'received', payment_status: 'unpaid' },
    numbers: ['subtotal', 'shipping_fee', 'total', 'paid_amount'],
    dates: ['order_date', 'expected_date', 'sent_date', 'received_date', 'paid_date'],
    bools: [],
    phones: ['vendor_phone'],
    aliases: {
      [SOURCE_ID_FIELD]: ['po id', 'purchase order id', 'po_id'],
      po_number: ['po', 'po number', 'po #', 'number', 'purchase order', 'doc number'],
      vendor_name: ['vendor', 'vendor name', 'supplier', 'supplier name'],
      vendor_id: ['vendor id', 'vendor_id', 'supplier id', 'supplier_id'],
      vendor_contact: ['vendor contact', 'contact'],
      vendor_email: ['vendor email', 'email'],
      vendor_phone: ['vendor phone', 'phone'],
      status: ['status', 'po status', 'order status'],
      payment_status: ['payment status', 'pay status'],
      vendor_invoice_number: ['vendor invoice', 'vendor invoice number', 'bill number', 'bill #'],
      subtotal: ['subtotal', 'sub total'],
      shipping_fee: ['shipping', 'shipping fee', 'freight'],
      total: ['total', 'po total', 'grand total', 'amount'],
      paid_amount: ['paid', 'paid amount', 'amount paid'],
      order_date: ['order date', 'date', 'created', 'po date'],
      expected_date: ['expected', 'expected date', 'eta', 'due date'],
      received_date: ['received', 'received date', 'date received'],
      paid_date: ['paid date', 'date paid'],
      ship_to: ['ship to', 'ship-to', 'shipping address', 'deliver to'],
      vendor_reference: ['vendor reference', 'reference', 'vendor ref'],
      work_order_id: ['work order id', 'order id', 'job id'],
      estimate_id: ['estimate id', 'estimate_id'],
      notes: ['notes', 'memo'],
      internal_notes: ['internal notes'],
    },
    parents: [
      // vendor_name resolves through the vendors map index to the stored
      // GlobalSettings vendor name; an unresolved value is kept as literal text.
      { field: 'vendor_name', source_field: 'vendor_id', parent_key: 'vendors', required: false, display_field: 'name', keep_literal: true, optional_hint: true },
      { field: 'work_order_id', parent_key: 'work_orders', required: false },
      { field: 'estimate_id', parent_key: 'estimates', required: false },
    ],
    fields: [
      'po_number', 'status', 'payment_status', 'vendor_invoice_number', 'paid_date', 'paid_amount',
      'vendor_name', 'vendor_contact', 'vendor_email', 'vendor_phone', 'work_order_id', 'estimate_id',
      'subtotal', 'shipping_fee', 'total', 'order_date', 'expected_date', 'sent_date',
      'received_date', 'ship_to', 'vendor_reference', 'notes', 'internal_notes',
      'source_summary', 'created_by', 'vendor_id',
    ],
    normalize(rec: any, raw: any) {
      // A raw vendor_id column that mapped onto vendor_id stays as a lookup aid;
      // the resolved/literal vendor name is what gets written.
      if (!clean(rec.vendor_name) && clean(raw?.['Vendor'])) rec.vendor_name = clean(raw['Vendor']);
      delete rec.vendor_id;
    },
    note: 'PurchaseOrder has no legacy-id field — CB id in source_summary + notes. Vendor resolves by name (vendors map -> GlobalSettings) with literal fallback.',
  },

  // -----------------------------------------------------------------------
  // Stub-but-registered mappers: real aliases/required/enum coverage with
  // passthrough normalization. Reported as kind:"stub" so the UI can flag
  // them as unverified before a production run.
  // -----------------------------------------------------------------------

  machines: {
    key: 'machines',
    target_entity: 'MachineRate',
    kind: 'stub',
    required: ['name', 'machine_type', 'runtime_rate_per_hour'],
    idempotency_field: null,
    legacy_id_field: null,
    enums: {
      machine_type: ['vinyl', 'cnc', 'laser', 'printer', 'other'],
      status: ['active', 'inactive'],
    },
    enum_coerce: {
      machine_type: { vinyl: 'vinyl', plotter: 'vinyl', cutter: 'vinyl', cnc: 'cnc', router: 'cnc', laser: 'laser', printer: 'printer', print: 'printer', latex: 'printer', 'flatbed printer': 'printer', other: 'other' },
      status: { active: 'active', inactive: 'inactive', retired: 'inactive' },
    },
    enum_fallback: { machine_type: 'other', status: 'active' },
    defaults: { machine_type: 'other', status: 'active' },
    numbers: ['setup_minutes', 'runtime_rate_per_hour', 'maintenance_rate_per_hour', 'material_waste_pct'],
    dates: [],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['machine id', 'equipment id'],
      name: ['name', 'machine', 'machine name', 'equipment'],
      machine_type: ['type', 'machine type', 'category'],
      setup_minutes: ['setup minutes', 'setup time', 'setup'],
      runtime_rate_per_hour: ['rate', 'hourly rate', 'runtime rate', 'rate per hour', 'cost per hour'],
      maintenance_rate_per_hour: ['maintenance rate', 'maintenance rate per hour'],
      material_waste_pct: ['waste', 'waste pct', 'material waste'],
      status: ['status', 'active'],
    },
    parents: [],
    fields: ['name', 'machine_type', 'setup_minutes', 'runtime_rate_per_hour', 'maintenance_rate_per_hour', 'material_waste_pct', 'status'],
    note: 'STUB — verify rate semantics (runtime vs loaded hourly cost) before a production import. No legacy-id field.',
  },

  pricing_tiers: {
    key: 'pricing_tiers',
    target_entity: 'MarkupTier',
    kind: 'stub',
    required: ['tier_number', 'tier_name'],
    idempotency_field: null,
    legacy_id_field: null,
    enums: {},
    enum_coerce: {},
    enum_fallback: {},
    defaults: {},
    numbers: ['tier_number', 'sort_order'],
    dates: [],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['tier id'],
      tier_number: ['tier number', 'tier', 'level', 'tier #'],
      tier_name: ['tier name', 'name', 'level name'],
      description: ['description', 'notes'],
      sort_order: ['sort', 'sort order', 'order'],
    },
    parents: [],
    fields: ['tier_number', 'tier_name', 'description', 'sort_order'],
    note: 'STUB — MarkupTier.markups is a structured object; import carries tier identity only, markups must be configured in-app. For matrix rows use the pricing_matrix key.',
  },

  pricing_matrix: {
    key: 'pricing_matrix',
    target_entity: 'PricingTierMatrix',
    kind: 'stub',
    required: ['name'],
    idempotency_field: null,
    legacy_id_field: null,
    enums: {
      status: ['active', 'inactive'],
      pricing_mode: ['markup', 'market'],
    },
    enum_coerce: {
      pricing_mode: { markup: 'markup', market: 'market', 'market retail': 'market' },
      status: { active: 'active', inactive: 'inactive' },
    },
    enum_fallback: { status: 'active', pricing_mode: 'markup' },
    defaults: { status: 'active', pricing_mode: 'markup' },
    numbers: ['markup_pct', 'market_retail', 'market_discount_pct', 'minimum_charge', 'sort_order'],
    dates: ['effective_from', 'effective_to'],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['matrix id', 'tier id'],
      name: ['name', 'matrix name', 'tier name'],
      customer_tier: ['customer tier', 'tier', 'customer_tier'],
      category: ['category', 'product category'],
      markup_pct: ['markup', 'markup pct', 'markup %'],
      pricing_mode: ['pricing mode', 'mode'],
      market_retail: ['market retail', 'retail'],
      minimum_charge: ['minimum', 'minimum charge', 'min charge'],
      status: ['status'],
    },
    parents: [],
    fields: ['name', 'status', 'customer_tier', 'category', 'markup_pct', 'pricing_mode', 'market_retail', 'market_discount_pct', 'minimum_charge', 'effective_from', 'effective_to', 'sort_order', 'updated_by'],
    note: 'STUB — companion to pricing_tiers for matrix-style rows.',
  },

  products: {
    key: 'products',
    target_entity: 'BuilderProduct',
    kind: 'stub',
    required: ['builder_name'],
    idempotency_field: null,
    legacy_id_field: null,
    notes_append: true,
    enums: {
      status: ['draft', 'in_progress', 'complete', 'archived'],
      operational_status: ['order_review', 'site_survey', 'awaiting_customer_action', 'awaiting_proof_approval', 'permitting', 'proof_approved', 'design_review', 'in_design', 'in_production', 'quality_control', 'service_repair', 'install_or_removal_only', 'vended', 'none'],
    },
    enum_coerce: {
      status: { draft: 'draft', 'in progress': 'in_progress', inprogress: 'in_progress', complete: 'complete', completed: 'complete', done: 'complete', archived: 'archived' },
    },
    enum_fallback: { status: 'complete' },
    defaults: { status: 'complete' },
    numbers: ['quantity', 'frozen_cost', 'frozen_customer_price'],
    dates: ['product_due_date', 'design_due_date'],
    bools: ['is_active'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['product id', 'line item id'],
      builder_name: ['name', 'product', 'product name', 'builder name', 'description'],
      client_product_name: ['client product name', 'display name'],
      client_description: ['client description', 'customer description'],
      product_category: ['category', 'product category', 'type'],
      product_notes: ['product notes', 'details'],
      quantity: ['qty', 'quantity'],
      status: ['status', 'product status'],
      frozen_cost: ['cost', 'frozen cost', 'unit cost'],
      frozen_customer_price: ['price', 'customer price', 'sale price'],
      estimate_id: ['estimate id', 'estimate_id'],
      notes: ['notes'],
    },
    parents: [{ field: 'estimate_id', parent_key: 'estimates', required: false, optional_hint: true }],
    fields: [
      'builder_name', 'client_product_name', 'client_description', 'product_category', 'product_notes',
      'quantity', 'status', 'is_active', 'frozen_cost', 'frozen_customer_price', 'estimate_id',
      'operational_status', 'notes',
    ],
    note: 'STUB — BuilderProduct rows are normally spawned by estimate modules; BOM/parts are not reconstructed. For reusable part definitions use the part_templates key.',
  },

  part_templates: {
    key: 'part_templates',
    target_entity: 'PartTemplate',
    kind: 'stub',
    required: ['template_name', 'template_type'],
    idempotency_field: 'idempotency_key',
    legacy_id_field: null,
    notes_append: true,
    enums: {
      template_type: ['part', 'part_group'],
      product_group: ['my', 'global'],
    },
    enum_coerce: {
      template_type: { part: 'part', 'part group': 'part_group', group: 'part_group' },
      product_group: { my: 'my', mine: 'my', global: 'global' },
    },
    enum_fallback: { template_type: 'part', product_group: 'my' },
    defaults: { template_type: 'part', product_group: 'my', is_active: true },
    numbers: ['frozen_cost', 'current_cost', 'part_count'],
    dates: [],
    bools: ['is_active'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['template id', 'part id'],
      template_name: ['name', 'template name', 'part name', 'part'],
      template_type: ['type', 'template type'],
      category: ['category', 'part category'],
      description: ['description'],
      frozen_cost: ['cost', 'frozen cost', 'unit cost'],
      current_cost: ['current cost'],
      notes: ['notes'],
      search_text: ['search text', 'keywords'],
      income_account: ['income account'],
      cogs_account: ['cogs account'],
    },
    parents: [],
    fields: ['template_name', 'template_type', 'product_group', 'category', 'description', 'frozen_cost', 'current_cost', 'notes', 'search_text', 'is_active', 'income_account', 'cogs_account', 'idempotency_key'],
    note: 'STUB — imports a flat part definition only; nested part-group snapshots are not reconstructed.',
  },

  opportunities: {
    key: 'opportunities',
    target_entity: 'Opportunity',
    kind: 'stub',
    required: ['creation_request_key', 'title'],
    auto_filled: ['creation_request_key'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    source_summary: true,
    notes_append: true,
    enums: {
      stage: ['new', 'qualified', 'estimating', 'quoted', 'follow_up', 'on_hold', 'won', 'lost'],
      priority: ['low', 'normal', 'high', 'rush'],
      survey_requirement: requirementEnum,
      permit_requirement: requirementEnum,
      installation_requirement: requirementEnum,
      removal_requirement: requirementEnum,
      electrical_requirement: requirementEnum,
      property_relationship: ['owner', 'tenant', 'agent', 'unknown'],
    },
    enum_coerce: {
      stage: { new: 'new', open: 'new', lead: 'new', qualified: 'qualified', estimating: 'estimating', quoted: 'quoted', 'follow up': 'follow_up', followup: 'follow_up', 'on hold': 'on_hold', onhold: 'on_hold', won: 'won', sold: 'won', 'closed won': 'won', lost: 'lost', 'closed lost': 'lost' },
      priority: { low: 'low', normal: 'normal', medium: 'normal', high: 'high', rush: 'rush' },
    },
    enum_fallback: { stage: 'new', priority: 'normal' },
    defaults: { stage: 'new', priority: 'normal' },
    numbers: ['budget_amount'],
    dates: ['next_action_due', 'desired_completion_date', 'desired_install_date'],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['opportunity id', 'deal id', 'opp id'],
      title: ['title', 'name', 'opportunity', 'opportunity name', 'deal'],
      customer_id: ['customer id', 'customer_id', 'account id'],
      customer_display_name: ['customer', 'customer name', 'company'],
      job_description: ['description', 'job description', 'details'],
      stage: ['stage', 'status', 'pipeline stage'],
      salesperson: ['salesperson', 'sales rep', 'owner', 'rep'],
      lead_source: ['lead source', 'source'],
      budget_amount: ['budget', 'budget amount', 'amount', 'value'],
      desired_completion_date: ['desired completion', 'due date', 'target date'],
      next_action: ['next action', 'next step'],
      next_action_due: ['next action due', 'follow up date'],
      notes: ['notes'],
      lost_reason: ['lost reason'],
    },
    parents: [{ field: 'customer_id', parent_key: 'customers', required: false }],
    fields: [
      'creation_request_key', 'title', 'customer_id', 'customer_display_name', 'contact_id', 'location_id',
      'job_description', 'stage', 'salesperson', 'lead_source', 'origination', 'budget_amount',
      'budget_note', 'desired_completion_date', 'desired_install_date', 'priority',
      'survey_requirement', 'permit_requirement', 'installation_requirement', 'removal_requirement',
      'electrical_requirement', 'electrical_details', 'property_relationship', 'next_action',
      'next_action_due', 'next_action_assignee', 'notes', 'lost_reason', 'source_summary',
    ],
    note: 'STUB — creation_request_key is schema-required and auto-filled with the cb: key.',
  },

  activities: {
    key: 'activities',
    target_entity: 'OpportunityActivity',
    kind: 'stub',
    required: ['event_type', 'summary'],
    idempotency_field: 'creation_request_key',
    legacy_id_field: null,
    notes_append: true,
    enums: {
      event_type: ['created', 'updated', 'stage_changed', 'linked_work_order', 'estimate_requested', 'estimate_attached', 'estimate_status_changed', 'estimator_assigned', 'reconciled', 'note', 'Call: Accounts Receivable', 'Call: Collections', 'Call: Estimate Follow Up', 'Call: Install Scheduling', 'Call: Post delivery follow up', 'Call: Proof', 'Call: Prospecting', 'Call: Sales Follow Up', 'Consultation', 'E-Mail: Estimate', 'E-Mail: Follow Up', 'E-Mail: Information Request', 'ReDo Work', 'Visit: Installation', 'Visit: Networking/Marketing', 'Visit: Sales Appointment', 'Visit: Sales Cold Call', 'Visit: Sales Relationship', 'Visit: Site Survey'],
      source: ['manual', 'auto_followup', 'system'],
    },
    enum_coerce: {
      event_type: { note: 'note', call: 'Call: Sales Follow Up', email: 'E-Mail: Follow Up', 'e-mail': 'E-Mail: Follow Up', visit: 'Visit: Sales Relationship', appointment: 'Visit: Sales Appointment', meeting: 'Visit: Sales Appointment', consultation: 'Consultation', 'site survey': 'Visit: Site Survey', task: 'note', 'to do': 'note', todo: 'note' },
      source: { manual: 'manual', imported: 'system', system: 'system' },
    },
    enum_fallback: { event_type: 'note', source: 'system' },
    defaults: { event_type: 'note', source: 'system' },
    numbers: [],
    dates: ['due_at', 'completed_at'],
    bools: [],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['activity id', 'event id'],
      opportunity_id: ['opportunity id', 'opportunity_id', 'deal id'],
      event_type: ['type', 'event type', 'activity type', 'event'],
      summary: ['summary', 'subject', 'title', 'description'],
      subject: ['subject line'],
      notes: ['notes', 'details', 'body'],
      contact_name: ['contact', 'contact name'],
      company_name: ['company', 'customer'],
      customer_id: ['customer id', 'customer_id'],
      assigned_to: ['assigned to', 'owner', 'rep', 'salesperson'],
      due_at: ['due', 'due date', 'due at'],
      completed_at: ['completed', 'completed date', 'done date'],
      outcome: ['outcome', 'result'],
    },
    parents: [
      { field: 'opportunity_id', parent_key: 'opportunities', required: false },
      { field: 'customer_id', parent_key: 'customers', required: false },
    ],
    fields: [
      'creation_request_key', 'opportunity_id', 'event_type', 'summary', 'actor', 'subject', 'notes',
      'contact_name', 'company_name', 'customer_id', 'assigned_to', 'due_at', 'completed_at',
      'outcome', 'source',
    ],
    normalize(rec: any) {
      if (!clean(rec.summary)) rec.summary = clean(rec.subject) || clean(rec.event_type) || 'Imported activity';
    },
    note: 'STUB — event_type coerces to the CRM enum (CoreBridge event names are valid members); unknown types fall back to "note".',
  },

  locations: {
    key: 'locations',
    target_entity: 'SalesLocation',
    kind: 'stub',
    required: ['name'],
    idempotency_field: null,
    legacy_id_field: null,
    enums: {},
    enum_coerce: {},
    enum_fallback: {},
    defaults: { active: true },
    numbers: [],
    dates: [],
    bools: ['active'],
    phones: [],
    aliases: {
      [SOURCE_ID_FIELD]: ['location id', 'store id'],
      name: ['name', 'location', 'location name', 'store', 'branch'],
      code: ['code', 'location code', 'store code'],
      tax_group: ['tax group', 'tax'],
      address: ['address', 'street address'],
      hours: ['hours', 'store hours'],
      active: ['active', 'is active', 'enabled'],
    },
    parents: [],
    fields: ['name', 'code', 'tax_group', 'address', 'hours', 'active'],
    note: 'STUB — SalesLocation has no legacy-id field.',
  },
};

export function getMapper(key: any): MapperSpec | null {
  const k = clean(key);
  return MIGRATION_MAPPERS[k] || null;
}

export function listMappers() {
  return Object.values(MIGRATION_MAPPERS).map((m) => ({
    key: m.key,
    target_entity: m.target_entity,
    kind: m.kind,
    required: m.required,
    idempotency_field: m.idempotency_field,
    legacy_id_field: m.legacy_id_field,
    parents: (m.parents || []).map((p) => ({ field: p.field, parent_key: p.parent_key, required: !!p.required })),
    note: m.note || '',
  }));
}
