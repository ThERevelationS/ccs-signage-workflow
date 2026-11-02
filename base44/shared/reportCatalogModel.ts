// Report catalog model — ESTIMATOR_MASTERPLAN WS-J / item J-02 (w-142).
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike — same contract as
// arAgingReports / savedReportRunsModel / reportDrilldownModel.
//
// Merges the J-01 engine's CODE REGISTRY (raw defineReport()-shaped spec
// objects exported from base44/shared/*Reports.ts — AR_AGING_REPORTS,
// CUSTOMER_REPORTS, ESTIMATE_REPORTS, FINANCIAL_REPORTS,
// PRODUCTION_REPORTS, SALES_REPORTS) with admin-managed ReportDefinition
// override rows into the flat catalog the ReportCatalogPanel renders.
//
// ── ReportDefinition storage (A-19, w-11) ────────────────────────────────
// There is no separate ReportDefinition entity: A-19 extended the
// FeatureReport entity with catalog fields, so a persisted definition is a
// FeatureReport record carrying a non-blank `report_key` (feedback rows
// never set one). Field contract this model normalizes:
//   report_key        string   — spec.id the definition overrides
//   title / category / description — display overrides (non-blank wins)
//   parameters_schema object|array — JSON-schema-ish param definition;
//                                an ARRAY of engine param specs replaces the
//                                spec's schema; an OBJECT map patches
//                                per-key fields ({default,label,options,
//                                hidden}) onto the same-key params
//   default_filters   object   — param-key → default override map
//   export_formats    string[] — e.g. ['csv','gl'] (default ['csv'])
//   is_system         boolean  — built-in row (admin UI must not delete)
//   sort | sort_order number   — catalog display ordering
//   enabled           boolean  — `enabled:false` hides the report from the
//                                run catalog (admins still see the row).
//                                The entity schema has no native flag yet,
//                                so `parameters_schema.disabled:true` or
//                                `default_filters.disabled:true` are honored
//                                as aliases until one is added.
//   admin_visible     boolean  — opt-in catalog/admin visibility gate
//                                (`spec.admin_visible`/`def.admin_visible`
//                                false hides the entry entirely)
//
// ── Merge precedence ────────────────────────────────────────────────────
//   registry spec (code) = identity, params schema, run engine, drill
//   db definition        = display overrides + enable/disable + ordering
// A definition whose report_key matches no registry spec is kept as an
// `orphan` entry (enabled:false) so admins can spot and fix a typo'd key —
// it can never be run because there is no engine spec behind it.
//
// API:
//   CATALOG_CATEGORIES / CATALOG_CATEGORY_LABELS / CATALOG_PARAM_TYPES /
//     CATALOG_EXPORT_FORMATS / CATALOG_DATA_NEEDS / REPORT_KEY_PATTERN
//   canonicalCategory(v)             — normalized category or ''
//   parametersSchemaFor(spec)        — engine param specs → JSON-safe schema
//   specDrillTarget(spec)            — first drillable column's entity | ''
//   specDataNeeds(spec)              — declared needs ∪ run-source scan
//   catalogEntryFromSpec(spec, i?)   — normalized catalog row (or null)
//   isDefinitionRow(row)             — FeatureReport row is a definition?
//   normalizeDefinitionRow(row)      — tolerant row → canonical def shape
//   validateReportDefinition(def)    — admin-CRUD field contract
//   definitionPatchFromForm(input)   — drawer fields → FeatureReport payload
//   definitionForEntry(entry)        — entry → definition-shaped override
//   catalogFromDefinitions(specs, defs, opts?) — merged catalog entries
//   catalogGrouping(entries, opts?)  — [{category,label,entries}] grouped
//   catalogSearch(entries, query)    — title/key/category/description match
//   runRequestValidate(entry, params)— param shape guard for the run form

// ---------------------------------------------------------------------------
// constants (replicas — this module cannot import reportEngine /
// reportDrilldownModel under the zero-import rule; keep in sync by comment)
// ---------------------------------------------------------------------------

// Replica of reportEngine.REPORT_CATEGORIES (src/components/reports/
// reportEngine.js) — the six engine categories in canonical order.
export const CATALOG_CATEGORIES = [
  'customers',
  'sales',
  'production',
  'estimates',
  'financial',
  'activity',
] as const;

export const CATALOG_CATEGORY_LABELS: Record<string, string> = {
  customers: 'Customers',
  sales: 'Sales',
  production: 'Production',
  estimates: 'Estimates',
  financial: 'Financial',
  activity: 'Activity',
};

// Replica of reportEngine.PARAM_TYPES.
export const CATALOG_PARAM_TYPES = [
  'date_range',
  'date_basis',
  'select',
  'multiselect',
  'boolean',
  'text',
  'number',
] as const;

// Replica of reportEngine.DATE_BASIS_OPTIONS / DATE_RANGE_PRESETS.
export const DATE_BASIS_OPTIONS = ['created', 'completed', 'built'] as const;
export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'custom',
] as const;

// Export channels the catalog UI knows how to produce today. Definition
// rows may declare more (the list is advisory — unknown formats are kept so
// a future exporter can find them).
export const CATALOG_EXPORT_FORMATS = ['csv', 'gl'] as const;

// Canonical dataset keys the panel's loader registry maps to fetchers.
// Alias spellings the specs read (workOrders/customersById/accounts/
// store_credit_ledger/…) collapse onto these canonical keys — the panel
// passes every loaded dataset under its aliases too, so a spec sees the
// shape it expects regardless of which spelling its helpers read.
export const CATALOG_DATA_NEEDS = [
  'invoices',
  'customers',
  'estimates',
  'revisions',
  'work_orders',
  'payments',
  'contacts',
  'opportunities',
  'credit_ledger',
  'responsibilities',
  'income_accounts',
  'agencies',
  'builder_products',
  'tax_groups',
  'tax_liability_rows',
] as const;

// Spec data-key spelling → canonical need key. Verified against the
// data?.key reads inside base44/shared/*Reports.ts (w-142 sweep).
const NEED_ALIASES: Record<string, string> = {
  workOrders: 'work_orders',
  workOrdersById: 'work_orders',
  customersById: 'customers',
  customer_contacts: 'contacts',
  contactsById: 'contacts',
  invoicesById: 'invoices',
  store_credit_ledger: 'credit_ledger',
  ledger_rows: 'credit_ledger',
  accounts: 'income_accounts',
  accountsByCode: 'income_accounts',
  income_accountsByCode: 'income_accounts',
  builderProductsById: 'builder_products',
  taxGroups: 'tax_groups',
  taxGroupsById: 'tax_groups',
  taxAgenciesById: 'agencies',
  jurisdictionsById: 'agencies',
  revisionsByEstimate: 'revisions',
  taxLiabilityRows: 'tax_liability_rows',
  tax_liability_rows_fn: 'tax_liability_rows',
};

// report_key spelling — snake_case catalog keys (specs use this shape; a
// dash segment is tolerated so ops-authored keys stay legal).
export const REPORT_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;

// ---------------------------------------------------------------------------
// small utils (same local-helper convention as sibling shared models)
// ---------------------------------------------------------------------------

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);

const humanize = (key: any): string =>
  clean(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function canonicalCategory(v: any): string {
  const k = norm(v).replace(/[\s-]+/g, '_');
  return (CATALOG_CATEGORIES as readonly string[]).includes(k) ? k : '';
}

// ---------------------------------------------------------------------------
// parameter schema normalization (reportEngine.normalizeParam replica)
// ---------------------------------------------------------------------------

export interface CatalogParamOption {
  value: string;
  label: string;
}

export interface CatalogParamSpec {
  key: string;
  type: string;
  label: string;
  options?: CatalogParamOption[];
  default?: any;
  required?: boolean;
  hidden?: boolean;
}

const normalizeOptions = (options: any): CatalogParamOption[] => {
  const seen = new Set<string>();
  const out: CatalogParamOption[] = [];
  for (const o of list(options)) {
    const value = typeof o === 'string' ? clean(o) : clean(o?.value);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: typeof o === 'string' ? humanize(o) : clean(o?.label) || humanize(value),
    });
  }
  return out;
};

// One engine param spec ({key,type,label?,options?,default?}) → JSON-safe
// CatalogParamSpec, or null when the shape cannot produce a usable form
// field (missing key / unknown type / options-less select). Lenient where
// the engine is strict — a malformed spec param must not kill the whole
// catalog entry.
function normalizeParamSpec(p: any): CatalogParamSpec | null {
  const key = clean(p?.key);
  if (!key) return null;
  const type = norm(p?.type);
  if (!(CATALOG_PARAM_TYPES as readonly string[]).includes(type)) return null;
  const out: CatalogParamSpec = {
    key,
    type,
    label: clean(p?.label) || humanize(key),
    required: p?.required === true,
  };
  if (p?.hidden === true) out.hidden = true;
  if (type === 'select' || type === 'multiselect') {
    const options = normalizeOptions(p?.options);
    if (!options.length) return null;
    out.options = options;
    out.default = type === 'select'
      ? (p?.default != null && options.some((o) => o.value === clean(p.default))
          ? clean(p.default)
          : options[0].value)
      : (Array.isArray(p?.default) ? p.default.map(clean).filter(Boolean) : []);
  } else if (type === 'date_basis') {
    const raw = p?.options ? normalizeOptions(p.options) : DATE_BASIS_OPTIONS.map((v) => ({ value: v, label: humanize(v) }));
    out.options = raw.filter((o) => (DATE_BASIS_OPTIONS as readonly string[]).includes(o.value));
    if (!out.options.length) out.options = DATE_BASIS_OPTIONS.map((v) => ({ value: v, label: humanize(v) }));
    const d = norm(p?.default);
    out.default = out.options.some((o) => o.value === d) ? d : (out.options[0]?.value || 'created');
  } else if (type === 'date_range') {
    out.default = p?.default ?? 'this_month';
  } else if (type === 'boolean') {
    out.default = p?.default == null ? false : Boolean(p.default);
  } else if (type === 'number') {
    out.default = Number.isFinite(Number(p?.default)) ? Number(p.default) : null;
  } else {
    out.default = p?.default == null ? '' : String(p.default);
  }
  return out;
}

// spec.params[] → normalized JSON-safe schema. Non-array input → [].
export function parametersSchemaFor(spec: any): CatalogParamSpec[] {
  const out: CatalogParamSpec[] = [];
  const seen = new Set<string>();
  for (const p of list(spec?.params)) {
    const np = normalizeParamSpec(p);
    if (!np || seen.has(np.key)) continue;
    seen.add(np.key);
    out.push(np);
  }
  return out;
}

// ---------------------------------------------------------------------------
// drill target (reportDrilldownModel.columnDrillType replica subset)
// ---------------------------------------------------------------------------

// Compact replica of reportDrilldownModel's canonical entity set — the
// catalog row only needs the ENTITY NAME of the first drillable column, so
// the full route table / precedence chain lives in J-10's model.
const DRILL_ENTITIES = new Set([
  'invoice', 'payment', 'product', 'part', 'work_order', 'estimate',
  'opportunity', 'purchase_order', 'change_order', 'customer',
]);

const DRILL_ALIASES: Record<string, string> = {
  wo: 'work_order', workorder: 'work_order', job: 'work_order',
  order: 'work_order', jobs: 'work_order', orders: 'work_order',
  estimates: 'estimate', quote: 'estimate',
  invoices: 'invoice', customers: 'customer', client: 'customer',
  master: 'customer', master_account: 'customer',
  products: 'product', line: 'product', line_item: 'product',
  payments: 'payment', parts: 'part',
  opportunities: 'opportunity', sales: 'opportunity',
  po: 'purchase_order', purchaseorder: 'purchase_order',
  co: 'change_order', changeorder: 'change_order',
};

const canonicalDrill = (v: any): string => {
  const k = norm(v).replace(/[-\s]+/g, '_');
  if (DRILL_ENTITIES.has(k)) return k;
  const a = DRILL_ALIASES[k];
  return a && DRILL_ENTITIES.has(a) ? a : '';
};

// Replica of reportDrilldownModel.COLUMN_ENTITY_HINTS — display column keys
// → the entity the cell drills to.
const COLUMN_ENTITY_HINTS: Record<string, string> = {
  invoice_number: 'invoice', invoice: 'invoice', number: 'invoice', inv_number: 'invoice',
  order_ref: 'work_order', order_number: 'work_order', work_order_number: 'work_order',
  work_order: 'work_order', job_number: 'work_order', job: 'work_order',
  wo: 'work_order', order: 'work_order',
  estimate_number: 'estimate', estimate_name: 'estimate', estimate: 'estimate',
  project_name: 'estimate',
  customer_name: 'customer', customer: 'customer', master_name: 'customer',
  master_account: 'customer', company_name: 'customer',
  product: 'product', product_name: 'product', product_label: 'product',
  part: 'part', part_number: 'part', part_name: 'part',
  mfg_part_number: 'part', vendor_part: 'part',
  payment: 'payment',
  opportunity_name: 'opportunity', opportunity: 'opportunity',
  po_number: 'purchase_order', purchase_order: 'purchase_order',
  co_number: 'change_order', change_order: 'change_order',
};

const columnDrillEntity = (col: any): string => {
  const key = clean(isObj(col) ? col.key : col);
  if (!key) return '';
  const m = key.match(/^([a-z_]+?)_id$/) || key.match(/^([a-zA-Z]+?)Id$/);
  if (m) {
    const t = canonicalDrill(m[1]);
    if (t) return t;
  }
  return COLUMN_ENTITY_HINTS[norm(key)] || '';
};

// The report's primary drill target = entity of its FIRST drillable column
// (column order = visual order; J-10's cellDrillLink handles per-cell
// resolution at render time).
export function specDrillTarget(spec: any): string {
  for (const c of list(spec?.columns)) {
    const t = columnDrillEntity(c);
    if (t) return t;
  }
  return '';
}

// ---------------------------------------------------------------------------
// specDataNeeds — dataset keys a spec's run consumes
// ---------------------------------------------------------------------------

// Declared needs (spec.data_needs / spec.needs / spec.datasets) ∪ a
// source scan of run()+summarize() for `data?.key` / `data.key` reads.
// NOTE: specs whose runs delegate to module-scope helpers (e.g.
// arAgingReports.agingContext) touch `data` inside the closure, NOT inside
// run's own source — the scan can't see those. The panel therefore keeps a
// per-module needs map as wiring; this helper is the per-spec floor.
export function specDataNeeds(spec: any): string[] {
  const found = new Set<string>();
  const push = (raw: any) => {
    const k = clean(raw);
    if (!k) return;
    const canonical = NEED_ALIASES[k] || k;
    if ((CATALOG_DATA_NEEDS as readonly string[]).includes(canonical)) {
      found.add(canonical);
    } else {
      found.add(canonical); // keep unknown keys visible too — a loader may exist
    }
  };
  for (const key of ['data_needs', 'needs', 'datasets']) {
    for (const n of list(spec?.[key])) push(n);
  }
  const scan = (fn: any) => {
    if (typeof fn !== 'function') return;
    let src = '';
    try { src = Function.prototype.toString.call(fn); } catch { src = ''; }
    if (!src) return;
    const re = /data\??\.([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) push(m[1]);
  };
  scan(spec?.run);
  scan(spec?.summarize);
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// catalogEntryFromSpec — spec → normalized catalog row
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  key: string;
  title: string;
  category: string;
  description: string;
  parameters_schema: CatalogParamSpec[];
  drill_target: string;
  admin_visible: boolean;
  enabled: boolean;
  sort_order: number;
  data_needs: string[];
  export_formats: string[];
  source: 'registry' | 'override' | 'orphan';
  has_spec: boolean;
  orphaned: boolean;
  definition_id?: string;
  definition_updated_date?: string;
  overridden?: boolean;
  spec?: any;
}

// spec → catalog row. Returns null when the spec lacks the minimum the
// catalog needs (id + runnable shape) — the caller decides whether to warn.
// `index` seeds sort_order so registry order is the default display order.
export function catalogEntryFromSpec(spec: any, index = 0): CatalogEntry | null {
  if (!isObj(spec)) return null;
  const key = clean(spec.id ?? spec.report_key ?? spec.key);
  if (!key) return null;
  const category = canonicalCategory(spec.category) || 'activity';
  const entry: CatalogEntry = {
    key,
    title: clean(spec.name ?? spec.title) || humanize(key),
    category,
    description: clean(spec.description),
    parameters_schema: parametersSchemaFor(spec),
    drill_target: specDrillTarget(spec),
    admin_visible: spec.admin_visible !== false && spec.hidden !== true,
    enabled: spec.enabled !== false,
    sort_order: Number.isFinite(Number(spec.sort ?? spec.sort_order))
      ? Number(spec.sort ?? spec.sort_order)
      : index,
    data_needs: specDataNeeds(spec),
    export_formats: list(spec.export_formats).map(clean).filter(Boolean),
    source: 'registry',
    has_spec: typeof spec.run === 'function',
    orphaned: false,
    spec,
  };
  if (!entry.export_formats.length) entry.export_formats = ['csv'];
  return entry;
}

// ---------------------------------------------------------------------------
// ReportDefinition rows (FeatureReport records carrying report_key)
// ---------------------------------------------------------------------------

// A FeatureReport row counts as a catalog definition when report_key is a
// non-blank string — feedback submissions never set it (manageFeatureReports
// create path writes only the feedback fields).
export function isDefinitionRow(row: any): boolean {
  return isObj(row) && !!clean(row.report_key);
}

export interface ReportDefinition {
  report_key: string;
  title: string;
  category: string;
  description: string;
  enabled: boolean;
  parameters_schema: any;
  default_filters: Record<string, any>;
  export_formats: string[];
  is_system: boolean;
  sort: number | null;
  admin_visible: boolean;
  definition_id?: string;
  updated_date?: string;
}

// Tolerant row → canonical definition. Field aliases resolved:
//   sort_order → sort           parameters|params → parameters_schema
//   disabled:true / parameters_schema.disabled / default_filters.disabled
//     → enabled:false
// `id`/`updated_date` ride along so callers can write back through the
// CAS-gated update paths.
export function normalizeDefinitionRow(row: any): ReportDefinition | null {
  if (!isObj(row)) return null;
  const report_key = clean(row.report_key ?? row.key ?? row.id_key);
  if (!report_key) return null;
  const schema = row.parameters_schema ?? row.parameters ?? row.params ?? null;
  const filters = isObj(row.default_filters) ? row.default_filters : {};
  const sortRaw = row.sort ?? row.sort_order;
  const sort = Number.isFinite(Number(sortRaw)) ? Number(sortRaw) : null;
  const disabled =
    row.enabled === false ||
    row.disabled === true ||
    (isObj(schema) && schema.disabled === true) ||
    filters.disabled === true;
  return {
    report_key,
    title: clean(row.title),
    category: clean(row.category),
    description: clean(row.description),
    enabled: !disabled,
    parameters_schema: schema,
    default_filters: { ...filters },
    export_formats: list(row.export_formats).map(clean).filter(Boolean),
    is_system: row.is_system === true,
    sort,
    admin_visible: row.admin_visible !== false,
    definition_id: clean(row.id) || undefined,
    updated_date: clean(row.updated_date) || undefined,
  };
}

// ---------------------------------------------------------------------------
// validateReportDefinition — admin-CRUD field contract
// ---------------------------------------------------------------------------

export interface DefinitionValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  definition: ReportDefinition | null;
}

// Validates a definition for create/update. Errors block; warnings do not.
//   report_key   required, REPORT_KEY_PATTERN
//   title        required ≤200 chars (a definition must name itself — the
//                merge can fall back to the spec's name, but a saved row
//                with no title would render blank in admin lists)
//   category     optional; when present must be a canonical engine
//                category (an unknown category would orphan the row's card)
//   description  optional ≤2000
//   enabled      optional boolean (default true)
//   parameters_schema  optional — ARRAY of param specs (each {key,type…}
//                validated through normalizeParamSpec) or OBJECT map of
//                per-key patches; anything else is an error
//   default_filters    optional plain object (param-key → default)
//   export_formats     optional string[]
//   sort|sort_order    optional finite number
//   is_system / admin_visible  optional booleans
export function validateReportDefinition(def: any): DefinitionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = isObj(def) ? def : null;
  if (!d) {
    return { ok: false, errors: ['definition must be an object'], warnings, definition: null };
  }

  const report_key = clean(d.report_key ?? d.key);
  if (!report_key) errors.push('report_key is required');
  else if (!REPORT_KEY_PATTERN.test(report_key)) {
    errors.push(`report_key "${report_key}" must match ${REPORT_KEY_PATTERN} (lowercase snake_case)`);
  }

  const title = clean(d.title);
  if (!title) errors.push('title is required');
  else if (title.length > 200) errors.push('title must be 200 characters or fewer');

  let category = '';
  const rawCategory = clean(d.category);
  if (rawCategory) {
    category = canonicalCategory(rawCategory);
    if (!category) {
      errors.push(`category "${rawCategory}" is not a report category (${CATALOG_CATEGORIES.join(', ')})`);
    }
  }

  const description = clean(d.description);
  if (description.length > 2000) errors.push('description must be 2000 characters or fewer');

  if (d.enabled != null && typeof d.enabled !== 'boolean' && d.enabled !== 'true' && d.enabled !== 'false') {
    errors.push('enabled must be a boolean');
  }
  if (d.is_system != null && typeof d.is_system !== 'boolean') errors.push('is_system must be a boolean');
  if (d.admin_visible != null && typeof d.admin_visible !== 'boolean') errors.push('admin_visible must be a boolean');

  const schema = d.parameters_schema ?? d.parameters ?? d.params;
  let normalizedSchema: any = null;
  if (schema != null) {
    if (Array.isArray(schema)) {
      const bad = schema.filter((p) => !normalizeParamSpec(p));
      if (bad.length) {
        errors.push(`parameters_schema has ${bad.length} invalid param spec(s) (each needs key + valid type)`);
      } else {
        normalizedSchema = schema.map((p) => normalizeParamSpec(p));
      }
    } else if (isObj(schema)) {
      normalizedSchema = { ...schema };
    } else {
      errors.push('parameters_schema must be an object or an array of param specs');
    }
  }

  let filters: Record<string, any> = {};
  if (d.default_filters != null) {
    if (isObj(d.default_filters)) filters = { ...d.default_filters };
    else errors.push('default_filters must be an object');
  }

  let exportFormats: string[] = [];
  if (d.export_formats != null) {
    if (Array.isArray(d.export_formats) && d.export_formats.every((f: any) => typeof f === 'string' && clean(f))) {
      exportFormats = d.export_formats.map(clean);
      const unknown = exportFormats.filter((f) => !(CATALOG_EXPORT_FORMATS as readonly string[]).includes(f));
      if (unknown.length) warnings.push(`export_formats has unrecognized format(s): ${unknown.join(', ')}`);
    } else {
      errors.push('export_formats must be an array of non-empty strings');
    }
  }

  let sort: number | null = null;
  const sortRaw = d.sort ?? d.sort_order;
  if (sortRaw != null && sortRaw !== '') {
    if (Number.isFinite(Number(sortRaw))) sort = Number(sortRaw);
    else errors.push('sort_order must be a finite number');
  }

  if (errors.length) return { ok: false, errors, warnings, definition: null };
  return {
    ok: true,
    errors,
    warnings,
    definition: {
      report_key,
      title,
      category,
      description,
      enabled: d.enabled === 'false' ? false : d.enabled !== false,
      parameters_schema: normalizedSchema,
      default_filters: filters,
      export_formats: exportFormats,
      is_system: d.is_system === true,
      sort,
      admin_visible: d.admin_visible !== false,
      definition_id: clean(d.id) || undefined,
      updated_date: clean(d.updated_date) || undefined,
    },
  };
}

// Drawer/edit form → the FeatureReport-shaped payload a definitions write
// action persists (A-19 field names; `enabled` rides top-level — pending
// the entity flag, the default_filters.disabled alias is mirrored so the
// hide survives either reader).
export function definitionPatchFromForm(input: any): Record<string, any> {
  const v = validateReportDefinition(input);
  if (!v.ok || !v.definition) return {};
  const d = v.definition;
  const out: Record<string, any> = {
    report_key: d.report_key,
    title: d.title,
    category: d.category,
    description: d.description,
    enabled: d.enabled,
    is_system: d.is_system,
  };
  if (d.parameters_schema != null) out.parameters_schema = d.parameters_schema;
  const filters = { ...d.default_filters };
  if (!d.enabled) filters.disabled = true;
  else if (filters.disabled === true) delete filters.disabled;
  if (Object.keys(filters).length) out.default_filters = filters;
  if (d.export_formats.length) out.export_formats = d.export_formats;
  if (d.sort != null) out.sort = d.sort;
  return out;
}

// ---------------------------------------------------------------------------
// catalogFromDefinitions — registry specs + db overrides → catalog entries
// ---------------------------------------------------------------------------

// Apply a definition's parameter overrides onto an entry's schema.
//  - schema ARRAY  → replace the whole schema (normalized; invalid specs
//    drop out rather than killing the entry)
//  - schema OBJECT → per-key patch: {default,label,options,hidden} merge
//    onto the same-key param; `params` array inside an object schema is
//    treated as the array form. default_filters patch param defaults too.
function applyParamOverrides(schema: CatalogParamSpec[], def: ReportDefinition): CatalogParamSpec[] {
  let out = schema.map((p) => ({ ...p, options: p.options ? p.options.map((o) => ({ ...o })) : undefined }));
  const raw = def.parameters_schema;
  const asArray = Array.isArray(raw) ? raw : (isObj(raw) && Array.isArray(raw.params)) ? raw.params : null;
  if (asArray) {
    const replaced = asArray.map(normalizeParamSpec).filter(Boolean) as CatalogParamSpec[];
    if (replaced.length) out = replaced;
  } else if (isObj(raw)) {
    for (const p of out) {
      const patch = raw[p.key];
      if (!isObj(patch)) continue;
      if (patch.hidden === true) p.hidden = true;
      if (patch.hidden === false) delete p.hidden;
      if (patch.label != null && clean(patch.label)) p.label = clean(patch.label);
      if (patch.default !== undefined) p.default = patch.default;
      if (patch.options != null) {
        const opts = normalizeOptions(patch.options);
        if (opts.length) p.options = opts;
      }
    }
  }
  for (const p of out) {
    if (def.default_filters && Object.prototype.hasOwnProperty.call(def.default_filters, p.key)) {
      p.default = def.default_filters[p.key];
    }
  }
  return out;
}

/**
 * catalogFromDefinitions(registry_specs, db_definitions, opts?) →
 * CatalogEntry[].
 *
 * Registry order is the baseline order; a matched definition overrides the
 * display fields (title/category/description), replaces/patches the param
 * schema, sets sort, and may disable or hide the entry. Unmatched
 * definitions append as `orphan` entries (enabled:false — never runnable).
 * opts: { dropDisabled?: boolean } — when true (or includeDisabled is
 * explicitly false), enabled:false entries are dropped entirely; otherwise
 * they stay in the list flagged and catalogGrouping owns the hide step.
 */
export function catalogFromDefinitions(
  registry_specs: any,
  db_definitions: any,
  opts: any = {},
): CatalogEntry[] {
  const o = isObj(opts) ? opts : {};
  const defs = list(db_definitions)
    .map((r) => (isDefinitionRow(r) || isObj(r) ? normalizeDefinitionRow(r) : null))
    .filter(Boolean) as ReportDefinition[];
  const defByKey = new Map<string, ReportDefinition>();
  for (const d of defs) {
    const k = d.report_key;
    if (!defByKey.has(k)) defByKey.set(k, d); // first definition wins on dup keys
  }

  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const spec of list(registry_specs)) {
    const entry = catalogEntryFromSpec(spec, i);
    i += 1;
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);

    const def = defByKey.get(entry.key);
    if (def) {
      entry.source = 'override';
      entry.overridden = true;
      entry.definition_id = def.definition_id;
      entry.definition_updated_date = def.updated_date;
      if (def.title) entry.title = def.title;
      const cat = canonicalCategory(def.category);
      if (cat) entry.category = cat;
      if (def.description) entry.description = def.description;
      entry.parameters_schema = applyParamOverrides(entry.parameters_schema, def);
      if (def.sort != null) entry.sort_order = def.sort;
      if (def.export_formats.length) entry.export_formats = def.export_formats;
      if (!def.enabled) entry.enabled = false;
      if (def.admin_visible === false) entry.admin_visible = false;
      defByKey.delete(entry.key);
    }
    entries.push(entry);
  }

  // Definitions matching no registry spec — kept visible to admins as
  // flagged orphans; they can never run because no engine spec backs them.
  for (const def of defByKey.values()) {
    entries.push({
      key: def.report_key,
      title: def.title || humanize(def.report_key),
      category: canonicalCategory(def.category) || 'activity',
      description: def.description,
      parameters_schema: [],
      drill_target: '',
      admin_visible: def.admin_visible,
      enabled: false,
      sort_order: def.sort != null ? def.sort : 9999,
      data_needs: [],
      export_formats: def.export_formats.length ? def.export_formats : ['csv'],
      source: 'orphan',
      has_spec: false,
      orphaned: true,
      overridden: true,
      definition_id: def.definition_id,
      definition_updated_date: def.updated_date,
    });
  }

  if (o.includeDisabled === false || o.dropDisabled === true) {
    return entries.filter((e) => e.enabled !== false);
  }
  return entries;
}

// An entry → the definition-shaped override that produced it (inverse of
// the merge; used by tests and the edit drawer's initial values).
export function definitionForEntry(entry: any): Record<string, any> {
  const e = isObj(entry) ? entry : {};
  return {
    report_key: clean(e.key),
    title: clean(e.title),
    category: clean(e.category),
    description: clean(e.description),
    enabled: e.enabled !== false,
    sort: Number.isFinite(Number(e.sort_order)) ? Number(e.sort_order) : null,
    export_formats: list(e.export_formats).map(clean).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// catalogGrouping — flat entries → category groups for the page
// ---------------------------------------------------------------------------

export interface CatalogGroup {
  category: string;
  label: string;
  entries: CatalogEntry[];
}

// Groups entries by category in CATALOG_CATEGORIES order; unknown
// categories sort last, alphabetically. Within a group: sort_order asc →
// title asc → key asc. Disabled entries are hidden by default
// (opts.includeDisabled keeps them — the admin drawer needs to see what it
// can re-enable). `admin_visible:false` entries always drop — they are not
// catalog rows.
export function catalogGrouping(entries: any, opts: any = {}): CatalogGroup[] {
  const o = isObj(opts) ? opts : {};
  const listIn = list(entries).filter(
    (e) => isObj(e) && e.admin_visible !== false && (o.includeDisabled === true || e.enabled !== false),
  );
  const byCat = new Map<string, CatalogEntry[]>();
  for (const e of listIn) {
    const cat = clean(e.category) || 'activity';
    if (!byCat.has(cat)) byCat.set(cat, []);
    (byCat.get(cat) as CatalogEntry[]).push(e);
  }
  const order = (cat: string) => {
    const idx = (CATALOG_CATEGORIES as readonly string[]).indexOf(cat);
    return idx === -1 ? CATALOG_CATEGORIES.length : idx;
  };
  const cats = [...byCat.keys()].sort(
    (a, b) => order(a) - order(b) || a.localeCompare(b),
  );
  return cats.map((category) => ({
    category,
    label: CATALOG_CATEGORY_LABELS[category] || humanize(category),
    entries: (byCat.get(category) as CatalogEntry[]).sort(
      (a, b) =>
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
        clean(a.title).toLowerCase().localeCompare(clean(b.title).toLowerCase()) ||
        clean(a.key).localeCompare(clean(b.key)),
    ),
  }));
}

// Case-insensitive substring match across key/title/category/description —
// the panel's search box.
export function catalogSearch(entries: any, query: any): CatalogEntry[] {
  const q = norm(query);
  if (!q) return list(entries).filter(isObj);
  return list(entries).filter((e) => {
    if (!isObj(e)) return false;
    return [e.key, e.title, e.category, CATALOG_CATEGORY_LABELS[clean(e.category)] || '', e.description]
      .some((f) => norm(f).includes(q));
  });
}

// ---------------------------------------------------------------------------
// runRequestValidate — parameter guard for the run form
// ---------------------------------------------------------------------------

export interface RunValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  params: Record<string, any>;
}

const validDateRange = (v: any): boolean => {
  if (typeof v === 'string') {
    return (DATE_RANGE_PRESETS as readonly string[]).includes(norm(v));
  }
  if (isObj(v)) {
    if (v.preset != null && !(DATE_RANGE_PRESETS as readonly string[]).includes(norm(v.preset))) return false;
    return true; // {preset?,from,to} — unbounded sides allowed
  }
  return false;
};

// Validates raw run-form input against an entry's parameters_schema.
// Unknown keys and shape mismatches are ERRORS (fail visibly — a silently
// dropped filter makes a wrong report look right). Missing keys are fine:
// the engine fills defaults. Returns `params` = the coerced subset ready
// for runReport's params arg (only declared keys, valid values coerced).
export function runRequestValidate(entry: any, params: any): RunValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const out: Record<string, any> = {};
  const e = isObj(entry) ? entry : {};
  const schema: CatalogParamSpec[] = Array.isArray(e.parameters_schema)
    ? e.parameters_schema
    : parametersSchemaFor(e.spec);
  const byKey = new Map<string, CatalogParamSpec>(schema.map((p) => [p.key, p]));
  const input = isObj(params) ? params : {};
  if (params != null && !isObj(params)) errors.push('params must be an object');

  for (const [key, value] of Object.entries(input)) {
    const spec = byKey.get(key);
    if (!spec) {
      errors.push(`unknown parameter "${key}"`);
      continue;
    }
    if (value == null || value === '') continue; // blank → default
    switch (spec.type) {
      case 'date_range': {
        if (!validDateRange(value)) {
          errors.push(`"${key}" must be a date range preset (${DATE_RANGE_PRESETS.join(', ')}) or {preset,from,to}`);
        } else out[key] = value;
        break;
      }
      case 'date_basis': {
        const v = norm(value);
        const valid = (spec.options || []).map((o) => o.value);
        if (!valid.includes(v)) errors.push(`"${key}" must be one of ${valid.join(', ')}`);
        else out[key] = v;
        break;
      }
      case 'select': {
        const v = clean(value);
        const valid = (spec.options || []).map((o) => o.value);
        if (!valid.includes(v)) errors.push(`"${key}" must be one of ${valid.join(', ')}`);
        else out[key] = v;
        break;
      }
      case 'multiselect': {
        const valid = new Set((spec.options || []).map((o) => o.value));
        const arr = Array.isArray(value) ? value : [value];
        const vals = arr.map(clean).filter(Boolean);
        const bad = vals.filter((v) => !valid.has(v));
        if (bad.length) errors.push(`"${key}" has invalid option(s): ${bad.join(', ')}`);
        else out[key] = vals;
        break;
      }
      case 'boolean': {
        if (typeof value === 'boolean') out[key] = value;
        else if (value === 'true' || value === 1 || value === '1') out[key] = true;
        else if (value === 'false' || value === 0 || value === '0') out[key] = false;
        else errors.push(`"${key}" must be a boolean`);
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) errors.push(`"${key}" must be a number`);
        else out[key] = n;
        break;
      }
      default: { // text
        out[key] = clean(value);
      }
    }
  }

  for (const spec of schema) {
    if (spec.required === true && !(spec.key in out) && (spec.default == null || spec.default === '')) {
      errors.push(`"${spec.key}" is required`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, params: out };
}
