// Part catalog import model — pure TS, ZERO imports, NO IO. Every function is
// deterministic over its arguments so it can run identically in a deployed
// base44 function, the Vite frontend, or a Node test harness.
// (ESTIMATOR_MASTERPLAN F-20; the catalogImportAction function + admin tool
// page are a separate wiring item — this module owns the pure semantics.)
//
// Scope (COREBRIDGE_MAP.md §8 "Importing"):
//   - parts CSV import          -> rowsToPartPatches / classifyImportRow
//   - part-group parts          -> partGroupAssociation (category -> group id)
//   - vendor-association        -> vendorAssociation (vendor_name -> vendor_id)
//   - import history            -> importSummary / importJobSummaryFields
//   - "Import Part" system part -> IMPORT_PART_DEFAULTS / importPartDefaults
//     (system default part e-commerce/API clones point at when no catalog
//     part matched — seeded idempotently, never user-created)
//
// ---------------------------------------------------------------------------
// EVIDENCE (entity fields this model reads/writes)
// ---------------------------------------------------------------------------
// BuilderPart.jsonc / PartTemplate.jsonc declare: part_name (PartTemplate uses
// template_name + part_snapshot.part_name), part_type, part_group_id,
// vendor_id, mfg_part_number, double_sided, min_charge, description/notes,
// setup_fee (tolerated row field — setupFeeCompose.ts PART_FEE_FIELDS),
// income_account_code/cogs_account_code, taxable, unit/pricing_unit.
// Vendor.jsonc: canonical supplier row keyed by `name` (contacts/terms/
// account_number live beside it); backend-only, so resolution happens inside
// the function that consumes this model.
// ImportJob.jsonc: import_type enum already includes 'parts' and
// 'vendor_associations'; counters created_items/updated_items/
// unchanged_items/skipped_items/invalid_items + result_message are the
// history-row shape importJobSummaryFields fills.
// Existing convention: creation_request_key is the standard idempotent-create
// receipt (see migrationMappers.ts / ensureIdempotentEntityCreate); the part
// library CSV importer (importEstimates.js #453) uses a deterministic
// per-content idempotency key the same way.
//
// ---------------------------------------------------------------------------
// DECISIONS
// ---------------------------------------------------------------------------
// D1 — IDENTITY / DEDUPE KEY. Every valid row gets a deterministic
//      creation_request_key `catimp:<slug>` where the slug is the normalized
//      part_number when present, else the slugified part name. Deterministic
//      means re-importing the same CSV converges (create-once, update-after)
//      instead of duplicating rows — the function layer upserts on this key.
//      A second row in the SAME file resolving to an already-used key is
//      flagged 'duplicate_creation_request_key' (ambiguous which row wins).
// D2 — MATCH ORDER (classifyImportRow): creation_request_key first (it's the
//      import lineage receipt — strictly stronger than any data field), then
//      normalized part_number (also checks mfg_part_number/supplier_sku on
//      existing rows), then normalized name (part_name/template_name/name/
//      item_name). First lane that hits wins; lanes scan existingParts in
//      array order so results are stable.
// D3 — SKIP WHEN IDENTICAL. A matched row is 'skip' when every field the CSV
//      patch carries already equals the existing row (normalized compare:
//      trimmed strings — part_number-ish ids case-insensitive; numbers within
//      1e-9; booleans strict). Columns absent from the CSV never participate:
//      the import updates only what it declares, it never clobbers
//      unmentioned fields.
// D4 — ERRORS ARE ROW-LEVEL, NEVER FATAL. A row missing both name and
//      part_number, or carrying a non-numeric money/number cell or an
//      unrecognized boolean, lands in errors[] with a code string and still
//      returns {patch:null}. classifyImportRow maps any errors[] entry to
//      'error'; the import continues for every other row.
// D5 — NUMBERS: '$', commas, '%' and whitespace are stripped before Number();
//      '(x)' means -x (accounting negative). Non-finite results are errors
//      (invalid_number:<field>), not silent zeros. Negative values pass
//      through — a credit-priced catalog row is data, not a parse failure.
// D6 — BOOLEANS: yes/y/true/1/on -> true; no/n/false/0/off -> false; blank ->
//      field omitted. Any other non-empty value is invalid_boolean:<field>.
// D7 — VENDOR/GROUP RESOLUTION FLAGS, NOT REJECTS. vendorAssociation and
//      partGroupAssociation resolve name -> id (case-insensitive, trimmed;
//      an existing id passes through when it matches a live row). An
//      unmatched vendor/group sets vendor_unresolved/group_unresolved: true
//      on the returned patch — the part still imports; the flag surfaces for
//      review instead of dropping the row. Multiple name matches prefer an
//      'active' row, then array order.
// D8 — STAMPS. Every created patch carries is_imported: true, imported_at:
//      <now>, import_source: 'catalog_csv'. Stamps + keys are excluded from
//      skip-diffing; updatePatchFor re-stamps imported_at on updates and
//      back-fills a missing creation_request_key on legacy rows.
// D9 — DEFAULTS. {defaults} in rowsToPartPatches may set any field (standard
//      use: part_type, unit, taxable, GL codes); explicit column values always
//      win over defaults, defaults win over nothing.
//
// Exports: parseCsvGrid, parseCsv, normalizeHeader, CATALOG_PART_COLUMNS,
// CATALOG_CSV_HEADERS, columnForHeader, canonicalValues, rowsToPartPatches,
// catalogImportKey, slugifyPartKey, normalizeNameKey, normalizePartNumber,
// matchExistingPart, diffPartFields, classifyImportRow,
// classifyImportRowDetail, importSummary, vendorAssociation,
// partGroupAssociation, updatePatchFor, importJobSummaryFields,
// IMPORT_SOURCE, IMPORT_KEY_PREFIX, CATALOG_IMPORT_ACTIONS,
// IMPORT_PART_SYSTEM_KEY, IMPORT_PART_CREATION_KEY, IMPORT_PART_DEFAULTS,
// importPartDefaults, isImportPart.

// ---------------------------------------------------------------------------
// shared coercion (same reject set as sizeDiscounts/setupFeeCompose siblings)
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

const lc = (v: unknown): string => asString(v).toLowerCase();

/** First non-empty string across a field-name scan; '' when none resolve. */
const firstString = (rec: Record<string, unknown> | null, fields: readonly string[]): string => {
  if (!rec) return '';
  for (const f of fields) {
    const s = asString(rec[f]);
    if (s) return s;
  }
  return '';
};

const toFiniteNumber = (v: unknown): number | null => {
  if (
    v === null || v === undefined || v === '' ||
    typeof v === 'object' || typeof v === 'function' ||
    typeof v === 'symbol' || typeof v === 'bigint'
  ) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// public constants + types
// ---------------------------------------------------------------------------

/** Value stamped on every imported part's import_source field. */
export const IMPORT_SOURCE = 'catalog_csv';

/** creation_request_key prefix for catalog-imported parts (D1). */
export const IMPORT_KEY_PREFIX = 'catimp:';

export const CATALOG_IMPORT_ACTIONS = Object.freeze([
  'create',
  'update',
  'skip',
  'error',
] as const);

export type CatalogImportAction = typeof CATALOG_IMPORT_ACTIONS[number];

export type CatalogColumnKind = 'string' | 'number' | 'boolean';

/** One canonical CSV column: target patch field + coercion kind + aliases.
 *  Aliases are normalized (see normalizeHeader — case/space/underscore
 *  insensitive: 'Unit Cost', 'unit_cost', 'UNIT-COST' all hit 'unitcost'). */
export interface CatalogPartColumn {
  field: string;
  kind: CatalogColumnKind;
  aliases: readonly string[];
}

/** Canonical column map (D-order matches the F-20 spec):
 *  name -> part_name, part_number -> part_number (+mfg_part_number mirror),
 *  category -> category (+part_group_id via direct-id column or group
 *  resolution), unit_cost -> cost, unit_price -> price, vendor -> vendor_name
 *  (+vendor_id via direct-id column or vendorAssociation), part_type,
 *  description, sqft_basis, double_sided (bool), min_charge, setup_fee —
 *  plus unit/taxable/GL-code lanes the A-03 part fields already declare. */
export const CATALOG_PART_COLUMNS: readonly CatalogPartColumn[] = Object.freeze([
  {
    field: 'part_name', kind: 'string',
    aliases: Object.freeze([
      'name', 'partname', 'part', 'item', 'itemname', 'product',
      'productname', 'title', 'linename',
    ]),
  },
  {
    field: 'part_number', kind: 'string',
    aliases: Object.freeze([
      'partnumber', 'partno', 'partnum', 'sku', 'itemnumber', 'itemno',
      'number', 'stocknumber', 'stockno', 'productcode', 'itemcode',
      'vendorpartnumber', 'suppliersku',
    ]),
  },
  {
    field: 'mfg_part_number', kind: 'string',
    aliases: Object.freeze([
      'mfgpartnumber', 'manufacturerpartnumber', 'mpn', 'mfgpartno',
      'mfgrpartnumber', 'manufacturerpartno', 'mfgpart', 'mfgpartnum',
    ]),
  },
  {
    field: 'category', kind: 'string',
    aliases: Object.freeze([
      'category', 'group', 'partgroup', 'partgroupname', 'section',
      'groupname', 'cataloggroup',
    ]),
  },
  {
    field: 'part_group_id', kind: 'string',
    aliases: Object.freeze(['partgroupid', 'groupid', 'catalogpartgroupid']),
  },
  {
    field: 'cost', kind: 'number',
    aliases: Object.freeze([
      'unitcost', 'cost', 'costeach', 'costperunit', 'internalcost',
      'ourcost', 'unitcosteach', 'partcost',
    ]),
  },
  {
    field: 'price', kind: 'number',
    aliases: Object.freeze([
      'unitprice', 'price', 'sell', 'sellprice', 'customerprice',
      'retail', 'retailprice', 'listprice', 'unitretail',
    ]),
  },
  {
    field: 'vendor_name', kind: 'string',
    aliases: Object.freeze([
      'vendor', 'vendorname', 'supplier', 'suppliername',
    ]),
  },
  {
    field: 'vendor_id', kind: 'string',
    aliases: Object.freeze(['vendorid', 'supplierid']),
  },
  {
    field: 'part_type', kind: 'string',
    aliases: Object.freeze(['parttype', 'type', 'kind', 'itemtype']),
  },
  {
    field: 'description', kind: 'string',
    aliases: Object.freeze([
      'description', 'desc', 'notes', 'note', 'longdescription',
      'detail', 'details',
    ]),
  },
  {
    field: 'sqft_basis', kind: 'number',
    aliases: Object.freeze([
      'sqftbasis', 'sqft', 'squarefootbasis', 'sqftperunit', 'areabasis',
      'squarefeet', 'sqfeet',
    ]),
  },
  {
    field: 'double_sided', kind: 'boolean',
    aliases: Object.freeze([
      'doublesided', 'twosided', '2sided', 'doubleside', 'secondside',
      'print2sided', 'printedbothsides',
    ]),
  },
  {
    field: 'min_charge', kind: 'number',
    aliases: Object.freeze([
      'mincharge', 'minimumcharge', 'minimum', 'min', 'minprice',
      'minimumprice',
    ]),
  },
  {
    field: 'setup_fee', kind: 'number',
    aliases: Object.freeze([
      'setupfee', 'setup', 'setupfeeamount', 'setupcharge', 'setupcost',
    ]),
  },
  {
    field: 'unit', kind: 'string',
    aliases: Object.freeze(['unit', 'uom', 'unitofmeasure', 'pricingunit']),
  },
  {
    field: 'taxable', kind: 'boolean',
    aliases: Object.freeze(['taxable', 'tax', 'istaxable']),
  },
  {
    field: 'income_account_code', kind: 'string',
    aliases: Object.freeze([
      'incomeaccountcode', 'incomeaccount', 'incomeacct', 'glacctincome',
      'glincome', 'incomeaccountnumber',
    ]),
  },
  {
    field: 'cogs_account_code', kind: 'string',
    aliases: Object.freeze([
      'cogsaccountcode', 'cogsaccount', 'cogsacct', 'glacctcogs',
      'glcogs', 'cogsaccountnumber',
    ]),
  },
]);

/** Canonical primary header spellings — the template header row the admin
 *  UI offers for download; every alias above also parses. */
export const CATALOG_CSV_HEADERS: readonly string[] = Object.freeze(
  CATALOG_PART_COLUMNS.map((c) => c.field),
);

/** One parsed CSV row: 1-based physical line number + normalized-header map. */
export interface CatalogCsvRow {
  source_row: number;
  data: Record<string, string>;
}

/** rowsToPartPatches output entry. patch is null iff errors[] is non-empty
 *  except duplicate-key rows, which keep their patch for reporting. */
export interface CatalogRowResult {
  patch: Record<string, unknown> | null;
  source_row: number;
  errors: string[];
  /** creation_request_key when the patch built one (handy for reporting). */
  key: string | null;
}

export interface VendorAssociationResult {
  patch: Record<string, unknown>;
  /** 'matched' | 'unresolved' | 'none' (no vendor info on the patch). */
  status: 'matched' | 'unresolved' | 'none';
  vendor: Record<string, unknown> | null;
}

export interface PartGroupAssociationResult {
  patch: Record<string, unknown>;
  status: 'matched' | 'unresolved' | 'none';
  group: Record<string, unknown> | null;
}

export interface ImportSummary {
  total: number;
  creates: number;
  updates: number;
  skips: number;
  errors: number;
  error_rows: number[];
}

// ---------------------------------------------------------------------------
// header + slug normalization
// ---------------------------------------------------------------------------

/** Case/space/underscore-insensitive header key: strips every char that is
 *  not a-z/0-9 after lowercasing ('Unit Cost' -> 'unitcost'). */
export const normalizeHeader = (h: unknown): string =>
  lc(h).replace(/[^a-z0-9]+/g, '');

/** Name match key: lowercased, whitespace-collapsed, trimmed. */
export const normalizeNameKey = (v: unknown): string =>
  lc(v).replace(/\s+/g, ' ');

/** Part-number match key: name key minus all separators/case, so
 *  'ABC-123', 'abc 123' and 'ABC123' resolve identically. */
export const normalizePartNumber = (v: unknown): string =>
  lc(v).replace(/[^a-z0-9]+/g, '');

/** URL-ish slug for the dedupe key: lowercase, a-z0-9 runs joined by '-',
 *  edge dashes trimmed, capped at 80 chars on a dash boundary. */
export const slugifyPartKey = (v: unknown): string => {
  const slug = lc(v)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (slug.length <= 80) return slug;
  const cut = slug.slice(0, 80).replace(/-[^-]*$/, '');
  return cut || slug.slice(0, 80);
};

// ---------------------------------------------------------------------------
// scalar coercion
// ---------------------------------------------------------------------------

/** Money-ish number parse (D5): strips $, commas, %, whitespace; '(x)' -> -x. */
const toCsvNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s%]/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
};

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'on', 't']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'off', 'f']);

/** Boolean parse (D6): vocab above; blank -> null; junk -> 'invalid' marker. */
const toCsvBoolean = (v: unknown): boolean | null | 'invalid' => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
    return 'invalid';
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return 'invalid';
};

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/** Raw grid parse: RFC-4180-ish — quoted fields, "" escapes, embedded commas
 *  and newlines inside quotes, CRLF/CR/LF endings, BOM stripped. Fully blank
 *  physical rows are dropped; a quoted empty field is NOT blank. */
export const parseCsvGrid = (text: unknown): string[][] => {
  const raw = String(text === null || text === undefined ? '' : text);
  // strip a leading BOM (U+FEFF) if present
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  let curTouched = false; // a quoted field counts even when empty
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQ = true; curTouched = true; continue; }
    if (ch === ',') { row.push(cur); cur = ''; curTouched = false; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur);
      const touched = curTouched || row.some((c) => c.trim() !== '');
      cur = ''; curTouched = false;
      if (touched) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
    if (ch.trim() !== '') curTouched = true;
  }
  row.push(cur);
  if (curTouched || row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

/** Parse CSV text into rows keyed by normalized header. The first non-blank
 *  physical row is the header row; duplicate headers land under '<h>_2',
 *  '<h>_3', … and empty header cells under 'column_<n>'. source_row is the
 *  1-based index counting non-blank physical rows (header = 1). */
export const parseCsv = (text: unknown): CatalogCsvRow[] => {
  const grid = parseCsvGrid(text);
  if (!grid.length) return [];
  const headers = grid[0].map((h) => normalizeHeader(h));
  const seen = new Map<string, number>();
  const keys = headers.map((h, i) => {
    const base = h || `column_${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  return grid.slice(1).map((cells, index) => {
    const data: Record<string, string> = {};
    keys.forEach((k, i) => {
      data[k] = cells[i] === undefined ? '' : String(cells[i]).trim();
    });
    return { source_row: index + 2, data };
  });
};

// ---------------------------------------------------------------------------
// column lookup + canonical extraction
// ---------------------------------------------------------------------------

/** Resolve a CSV header (any spelling) to its canonical column spec. */
export const columnForHeader = (header: unknown): CatalogPartColumn | null => {
  const key = normalizeHeader(header);
  if (!key) return null;
  for (const col of CATALOG_PART_COLUMNS) {
    if (col.aliases.indexOf(key) !== -1 || normalizeHeader(col.field) === key) {
      return col;
    }
  }
  return null;
};

/** Pull {canonicalField: rawString} out of a normalized-header data map —
 *  first non-empty alias wins, column order in CATALOG_PART_COLUMNS. */
export const canonicalValues = (
  data: Record<string, unknown>,
): Record<string, string> => {
  const norm: Record<string, unknown> = {};
  for (const k of Object.keys(data || {})) {
    const nk = normalizeHeader(k);
    if (nk && norm[nk] === undefined) norm[nk] = data[k];
  }
  const out: Record<string, string> = {};
  for (const col of CATALOG_PART_COLUMNS) {
    for (const alias of col.aliases) {
      const v = norm[alias];
      if (v !== undefined && asString(v) !== '') {
        out[col.field] = asString(v);
        break;
      }
    }
    // a literal canonical-spelling header also binds (e.g. 'sqft_basis'
    // normalizes to 'sqftbasis' which is an alias — this is belt+braces
    // for fields whose canonical name normalizes differently)
    if (out[col.field] === undefined) {
      const v = norm[normalizeHeader(col.field)];
      if (v !== undefined && asString(v) !== '') out[col.field] = asString(v);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// dedupe key
// ---------------------------------------------------------------------------

/** Deterministic creation_request_key (D1): part_number slug preferred,
 *  name slug fallback; null when neither exists (row can't dedupe). */
export const catalogImportKey = (
  patch: Record<string, unknown> | null,
): string | null => {
  if (!patch) return null;
  const pn = slugifyPartKey(firstString(patch, ['part_number']));
  if (pn) return `${IMPORT_KEY_PREFIX}${pn}`;
  const nm = slugifyPartKey(firstString(patch, ['part_name', 'name', 'template_name']));
  if (nm) return `${IMPORT_KEY_PREFIX}${nm}`;
  return null;
};

// ---------------------------------------------------------------------------
// rowsToPartPatches
// ---------------------------------------------------------------------------

interface RowsToPartPatchesOptions {
  defaults?: Record<string, unknown>;
  now?: string;
}

/**
 * Map parsed CSV rows to catalog-part patches.
 * Returns one entry per row: {patch, source_row, errors, key}.
 * - required: name OR part_number (name falls back to part_number when the
 *   name column is blank so number-only rows still import — D-order spec).
 * - part_number mirrors into mfg_part_number unless an explicit
 *   mfg_part_number column supplied one (spec: part_number ->
 *   part_number/mfg_part_number).
 * - Every patch is stamped is_imported/imported_at/import_source +
 *   deterministic creation_request_key (D8/D1).
 */
export const rowsToPartPatches = (
  rows: readonly (CatalogCsvRow | Record<string, unknown>)[],
  options: RowsToPartPatchesOptions = {},
): CatalogRowResult[] => {
  const { defaults = {}, now } = options;
  const importedAt = now || new Date().toISOString();
  const list = Array.isArray(rows) ? rows : [];
  const usedKeys = new Map<string, number>();

  return list.map((entry, index) => {
    const sourceRow =
      (entry as CatalogCsvRow).source_row !== undefined
        ? Number((entry as CatalogCsvRow).source_row) || index + 2
        : index + 2;
    const data = isRecord((entry as CatalogCsvRow).data)
      ? (entry as CatalogCsvRow).data
      : (entry as Record<string, string>);
    const errors: string[] = [];
    const patch: Record<string, unknown> = {};
    const values = canonicalValues(data);

    // -- column -> typed field --------------------------------------------
    for (const col of CATALOG_PART_COLUMNS) {
      const raw = values[col.field];
      if (raw === undefined) continue;
      if (col.kind === 'string') {
        if (raw !== '') patch[col.field] = raw;
        continue;
      }
      if (col.kind === 'number') {
        const n = toCsvNumber(raw);
        if (n === null) {
          errors.push(`invalid_number:${col.field}`);
        } else {
          patch[col.field] = n;
        }
        continue;
      }
      // boolean
      const b = toCsvBoolean(raw);
      if (b === 'invalid') {
        errors.push(`invalid_boolean:${col.field}`);
      } else if (b !== null) {
        patch[col.field] = b;
      }
    }

    // -- defaults fill what the row didn't (columns win — D9) -------------
    for (const k of Object.keys(defaults || {})) {
      if (patch[k] === undefined && defaults[k] !== undefined) {
        patch[k] = defaults[k];
      }
    }

    // -- required identity: name or part_number ---------------------------
    if (!asString(patch.part_name) && asString(patch.part_number)) {
      patch.part_name = asString(patch.part_number);
    }
    if (!asString(patch.part_name) && !asString(patch.part_number)) {
      errors.push('missing_name_or_part_number');
      return { patch: null, source_row: sourceRow, errors, key: null };
    }

    // -- part_number -> mfg_part_number mirror (explicit mfg column wins) --
    if (!asString(patch.mfg_part_number) && asString(patch.part_number)) {
      patch.mfg_part_number = asString(patch.part_number);
    }

    // -- stamps + deterministic key (D1/D8) --------------------------------
    patch.is_imported = true;
    patch.imported_at = importedAt;
    patch.import_source = IMPORT_SOURCE;
    const key = catalogImportKey(patch);
    if (key) {
      patch.creation_request_key = key;
      const seenRow = usedKeys.get(key);
      if (seenRow !== undefined) {
        errors.push(`duplicate_creation_request_key:${key}`);
        errors.push(`first_seen_at_row:${seenRow}`);
      } else {
        usedKeys.set(key, sourceRow);
      }
    }

    return { patch, source_row: sourceRow, errors, key };
  });
};

// ---------------------------------------------------------------------------
// existing-row reading (BuilderPart / PartTemplate / catalog rows tolerated)
// ---------------------------------------------------------------------------

/** Where each canonical field can live on an existing row. The root is
 *  scanned first, then part_snapshot (PartTemplate library rows keep the
 *  BuilderPart-shaped fields nested there). */
const EXISTING_FIELD_ALIASES: Record<string, readonly string[]> = {
  part_name: ['part_name', 'template_name', 'name', 'item_name'],
  part_number: ['part_number', 'mfg_part_number', 'supplier_sku', 'sku'],
  mfg_part_number: ['mfg_part_number', 'part_number', 'supplier_sku', 'sku'],
  category: ['category', 'product_category'],
  part_group_id: ['part_group_id', 'catalog_part_group_id', 'group_id'],
  cost: ['cost', 'unit_cost', 'frozen_unit_cost', 'current_unit_cost'],
  price: [
    'price', 'unit_price', 'frozen_unit_customer_price',
    'current_unit_customer_price', 'customer_price',
  ],
  vendor_name: ['vendor_name', 'supplier'],
  vendor_id: ['vendor_id'],
  part_type: ['part_type', 'source_part_type'],
  description: ['description', 'notes'],
  sqft_basis: ['sqft_basis'],
  double_sided: ['double_sided'],
  min_charge: ['min_charge', 'minimum_charge'],
  setup_fee: ['setup_fee', 'setup_fee_amount'],
  unit: ['unit', 'pricing_unit'],
  taxable: ['taxable'],
  income_account_code: ['income_account_code', 'income_account'],
  cogs_account_code: ['cogs_account_code', 'cogs_account'],
  creation_request_key: ['creation_request_key', 'idempotency_key'],
};

const existingField = (
  existing: Record<string, unknown>,
  field: string,
): unknown => {
  const aliases = EXISTING_FIELD_ALIASES[field] || [field];
  for (const scope of [existing, isRecord(existing.part_snapshot) ? existing.part_snapshot : null]) {
    if (!scope) continue;
    for (const a of aliases) {
      const v = (scope as Record<string, unknown>)[a];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
};

/** Every candidate value for a field — all aliases across the root scope AND
 *  part_snapshot (a PartTemplate's template_name must not hide the nested
 *  part_snapshot.part_name from name matching). */
const existingFieldCandidates = (
  existing: Record<string, unknown>,
  field: string,
): unknown[] => {
  const aliases = EXISTING_FIELD_ALIASES[field] || [field];
  const out: unknown[] = [];
  for (const scope of [existing, isRecord(existing.part_snapshot) ? existing.part_snapshot : null]) {
    if (!scope) continue;
    for (const a of aliases) {
      const v = (scope as Record<string, unknown>)[a];
      if (v !== undefined && v !== null && v !== '') out.push(v);
    }
  }
  return out;
};

/** Fields excluded from identity/diff comparisons — import bookkeeping,
 *  not part data. */
const NON_DIFF_FIELDS = new Set([
  'is_imported', 'imported_at', 'import_source', 'creation_request_key',
  'idempotency_key', 'vendor_unresolved', 'group_unresolved', 'source_row',
  'key', 'id', 'created_date', 'updated_date', 'created_by', 'created_by_id',
]);

/** Fields compared case-insensitively (identifiers, not display text). */
const CASE_FOLD_FIELDS = new Set(['part_number', 'mfg_part_number']);

const fieldsEqual = (field: string, a: unknown, b: unknown): boolean => {
  const na = toFiniteNumber(a);
  const nb = toFiniteNumber(b);
  // both numeric-looking -> numeric compare (covers '10' vs 10)
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-9;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ba = toCsvBoolean(a);
    const bb = toCsvBoolean(b);
    return ba !== 'invalid' && ba === bb;
  }
  const sa = asString(a);
  const sb = asString(b);
  if (CASE_FOLD_FIELDS.has(field)) {
    return normalizePartNumber(sa) === normalizePartNumber(sb);
  }
  return sa === sb;
};

// ---------------------------------------------------------------------------
// matching + diffing
// ---------------------------------------------------------------------------

export interface ExistingMatch {
  match: Record<string, unknown> | null;
  /** 'creation_request_key' | 'part_number' | 'name' | null */
  by: 'creation_request_key' | 'part_number' | 'name' | null;
}

/**
 * Locate the existing part a patch refers to (D2):
 *   1. creation_request_key / idempotency_key equality (import receipt)
 *   2. normalized part_number (vs part_number/mfg_part_number/supplier_sku)
 *   3. normalized name (vs part_name/template_name/name/item_name)
 */
export const matchExistingPart = (
  patch: Record<string, unknown> | null,
  existingParts: readonly Record<string, unknown>[] | null | undefined,
): ExistingMatch => {
  const rows = (Array.isArray(existingParts) ? existingParts : []).filter(isRecord);
  if (!patch || !rows.length) return { match: null, by: null };

  const key = asString(patch.creation_request_key || patch.idempotency_key);
  if (key) {
    const hit = rows.find((r) => {
      const rk = asString(existingField(r, 'creation_request_key'));
      return rk !== '' && rk === key;
    });
    if (hit) return { match: hit, by: 'creation_request_key' };
  }

  const pn = normalizePartNumber(existingField(patch, 'part_number'));
  if (pn) {
    const hit = rows.find((r) =>
      existingFieldCandidates(r, 'part_number').some(
        (c) => normalizePartNumber(c) !== '' && normalizePartNumber(c) === pn,
      ),
    );
    if (hit) return { match: hit, by: 'part_number' };
  }

  const nm = normalizeNameKey(existingField(patch, 'part_name'));
  if (nm) {
    const hit = rows.find((r) =>
      existingFieldCandidates(r, 'part_name').some(
        (v) => normalizeNameKey(v) !== '' && normalizeNameKey(v) === nm,
      ),
    );
    if (hit) return { match: hit, by: 'name' };
  }

  return { match: null, by: null };
};

/** Canonical fields where the patch value differs from the existing row.
 *  Only fields the patch carries are compared (D3) — an untouched column is
 *  never a difference. */
export const diffPartFields = (
  patch: Record<string, unknown> | null,
  existing: Record<string, unknown> | null,
): string[] => {
  if (!patch || !existing) return [];
  const changed: string[] = [];
  for (const field of Object.keys(patch)) {
    if (NON_DIFF_FIELDS.has(field)) continue;
    const pv = patch[field];
    if (pv === undefined) continue;
    const ev = existingField(existing, field);
    if (ev === undefined) {
      changed.push(field); // existing lacks the field entirely -> change
      continue;
    }
    if (!fieldsEqual(field, pv, ev)) changed.push(field);
  }
  return changed.sort();
};

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

const entryPatch = (
  row: CatalogRowResult | Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!isRecord(row)) return null;
  if ('patch' in row) return isRecord(row.patch) ? (row.patch as Record<string, unknown>) : null;
  return row;
};

const entryErrors = (row: unknown): string[] => {
  if (isRecord(row) && Array.isArray(row.errors)) {
    return row.errors.map((e) => asString(e)).filter(Boolean);
  }
  return [];
};

const entrySourceRow = (row: unknown, fallback: number): number => {
  if (isRecord(row) && toFiniteNumber(row.source_row) !== null) {
    return Number(row.source_row);
  }
  return fallback;
};

/** 'create' | 'update' | 'skip' | 'error' (spec signature — string). */
export const classifyImportRow = (
  row: CatalogRowResult | Record<string, unknown> | null,
  existingParts: readonly Record<string, unknown>[] | null | undefined,
): CatalogImportAction => classifyImportRowDetail(row, existingParts).action;

export interface ClassifiedRow {
  action: CatalogImportAction;
  match: Record<string, unknown> | null;
  match_by: ExistingMatch['by'];
  changed_fields: string[];
}

/** Detail variant — same lanes as classifyImportRow plus the matched row,
 *  match lane, and the field list an 'update' would write. */
export const classifyImportRowDetail = (
  row: CatalogRowResult | Record<string, unknown> | null,
  existingParts: readonly Record<string, unknown>[] | null | undefined,
): ClassifiedRow => {
  if (entryErrors(row).length) {
    return { action: 'error', match: null, match_by: null, changed_fields: [] };
  }
  const patch = entryPatch(row);
  if (!patch) {
    return { action: 'error', match: null, match_by: null, changed_fields: [] };
  }
  const { match, by } = matchExistingPart(patch, existingParts);
  if (!match) return { action: 'create', match: null, match_by: null, changed_fields: [] };
  const changed = diffPartFields(patch, match);
  return {
    action: changed.length ? 'update' : 'skip',
    match,
    match_by: by,
    changed_fields: changed,
  };
};

// ---------------------------------------------------------------------------
// summary (import history counters)
// ---------------------------------------------------------------------------

/**
 * Fold row results into ImportJob-shaped counters.
 * Accepts rowsToPartPatches output (with or without a pre-set `.action`),
 * bare patches, or pre-classified {action} entries. When an entry carries no
 * action it's classified against existingParts (absent -> all valid rows
 * count as creates).
 */
export const importSummary = (
  rows: readonly unknown[],
  existingParts?: readonly Record<string, unknown>[] | null,
): ImportSummary => {
  const list = Array.isArray(rows) ? rows : [];
  const summary: ImportSummary = {
    total: list.length, creates: 0, updates: 0, skips: 0, errors: 0, error_rows: [],
  };
  list.forEach((entry, index) => {
    let action: CatalogImportAction | null = null;
    if (isRecord(entry) && typeof entry.action === 'string'
        && (CATALOG_IMPORT_ACTIONS as readonly string[]).indexOf(entry.action) !== -1) {
      action = entry.action as CatalogImportAction;
    } else {
      action = classifyImportRow(entry as CatalogRowResult, existingParts);
    }
    if (action === 'create') summary.creates += 1;
    else if (action === 'update') summary.updates += 1;
    else if (action === 'skip') summary.skips += 1;
    else {
      summary.errors += 1;
      summary.error_rows.push(entrySourceRow(entry, index + 2));
    }
  });
  return summary;
};

/** Map an ImportSummary (+ context) onto ImportJob entity fields — the
 *  history row the wiring function persists. Every row failing is a failed
 *  job; partial failures stay 'completed' with counts in result_message. */
export const importJobSummaryFields = (
  summary: ImportSummary,
  options: {
    import_type?: 'parts' | 'vendor_associations' | string;
    user_email?: string;
    file_name?: string;
    file_hash?: string;
    file_size_bytes?: number;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
  } = {},
): Record<string, unknown> => {
  const s = summary || { total: 0, creates: 0, updates: 0, skips: 0, errors: 0, error_rows: [] };
  const failed = s.total > 0 && s.errors >= s.total;
  const resultMessage = [
    `${s.creates} created`,
    `${s.updates} updated`,
    `${s.skips} unchanged`,
    s.errors ? `${s.errors} error${s.errors === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(', ');
  return {
    user_email: asString(options.user_email),
    import_type: options.import_type || 'parts',
    status: failed ? 'failed' : 'completed',
    phase: 'completed',
    total_items: s.total,
    processed_items: s.total,
    created_items: s.creates,
    updated_items: s.updates,
    unchanged_items: s.skips,
    skipped_items: s.skips,
    invalid_items: s.errors,
    conflict_items: 0,
    ambiguous_items: 0,
    result_message: resultMessage,
    error_message: failed
      ? `All ${s.errors} row${s.errors === 1 ? '' : 's'} failed validation.`
      : (s.errors ? `${s.errors} row${s.errors === 1 ? '' : 's'} failed validation (rows ${s.error_rows.join(', ')}).` : ''),
    file_name: asString(options.file_name),
    file_hash: asString(options.file_hash),
    file_size_bytes: toFiniteNumber(options.file_size_bytes) ?? undefined,
    started_at: asString(options.started_at),
    completed_at: options.completed_at || new Date().toISOString(),
    duration_ms: toFiniteNumber(options.duration_ms) ?? undefined,
  };
};

// ---------------------------------------------------------------------------
// vendor association (name -> id; unresolved flags, never rejects — D7)
// ---------------------------------------------------------------------------

const vendorNameOf = (v: Record<string, unknown>): string =>
  firstString(v, ['name', 'vendor_name', 'company_name', 'display_name']);

const isActiveish = (v: Record<string, unknown>): boolean =>
  lc(v.status) !== 'inactive';

/** Deterministic pick: active-ish rows first, then original array order. */
const preferActive = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  [...rows].sort((a, b) => Number(isActiveish(b)) - Number(isActiveish(a)));

/**
 * Resolve patch.vendor_name / patch.vendor_id against the Vendor registry.
 * - vendor_id already set and matches a live Vendor.id -> matched (kept).
 * - vendor_name matches a vendor name case-insensitively/trimmed (a raw id in
 *   the name slot also binds) -> matched, vendor_id filled, vendor_name
 *   canonicalized to the vendor's display name.
 * - vendor info present but unmatched -> vendor_unresolved: true (D7 flag,
 *   not a reject).
 * - no vendor info -> 'none', patch returned unchanged.
 * Never mutates the input patch.
 */
export const vendorAssociation = (
  patch: Record<string, unknown> | null,
  vendors: readonly Record<string, unknown>[] | null | undefined,
): VendorAssociationResult => {
  const list = (Array.isArray(vendors) ? vendors : []).filter(isRecord);
  const current = isRecord(patch) ? patch : {};
  const wantId = asString(current.vendor_id);
  const wantName = asString(current.vendor_name);

  if (!wantId && !wantName) {
    return { patch: current, status: 'none', vendor: null };
  }
  const byId = wantId ? list.find((v) => asString(v.id) === wantId) : null;
  if (byId) {
    const next = { ...current, vendor_id: asString(byId.id) };
    if (!asString(next.vendor_name)) next.vendor_name = vendorNameOf(byId);
    return { patch: next, status: 'matched', vendor: byId };
  }
  if (wantName) {
    const key = normalizeNameKey(wantName);
    const named = list.filter((v) => normalizeNameKey(vendorNameOf(v)) === key);
    const idNamed = list.filter((v) => asString(v.id) === wantName);
    const vendor = preferActive([...named, ...idNamed])[0] || null;
    if (vendor) {
      return {
        patch: { ...current, vendor_id: asString(vendor.id), vendor_name: vendorNameOf(vendor) || wantName },
        status: 'matched',
        vendor,
      };
    }
  }
  return { patch: { ...current, vendor_unresolved: true }, status: 'unresolved', vendor: null };
};

/**
 * Resolve patch.category (name) or patch.part_group_id (id) against
 * CatalogPartGroup rows — the part-group-parts lane. Unmatched groups flag
 * group_unresolved: true; the category name stays on the patch either way.
 */
export const partGroupAssociation = (
  patch: Record<string, unknown> | null,
  groups: readonly Record<string, unknown>[] | null | undefined,
): PartGroupAssociationResult => {
  const list = (Array.isArray(groups) ? groups : []).filter(isRecord);
  const current = isRecord(patch) ? patch : {};
  const wantId = asString(current.part_group_id);
  const wantName = asString(current.category);

  if (!wantId && !wantName) {
    return { patch: current, status: 'none', group: null };
  }
  const byId = wantId ? list.find((g) => asString(g.id) === wantId) : null;
  if (byId) return { patch: current, status: 'matched', group: byId };

  if (wantName) {
    const key = normalizeNameKey(wantName);
    const named = list.filter((g) => normalizeNameKey(firstString(g, ['name', 'group_name', 'title'])) === key);
    const idNamed = list.filter((g) => asString(g.id) === wantName);
    const group = preferActive([...named, ...idNamed])[0] || null;
    if (group) {
      return { patch: { ...current, part_group_id: asString(group.id) }, status: 'matched', group };
    }
  }
  return { patch: { ...current, group_unresolved: true }, status: 'unresolved', group: null };
};

// ---------------------------------------------------------------------------
// update write shape
// ---------------------------------------------------------------------------

/** Fields to write on an 'update' classification: only the canonical fields
 *  that actually changed (D3), re-stamped imported_at + import markers, and
 *  the creation_request_key back-filled when the existing row lacks one so
 *  subsequent re-imports dedupe on the receipt. */
export const updatePatchFor = (
  existing: Record<string, unknown> | null,
  patch: Record<string, unknown> | null,
  options: { now?: string } = {},
): Record<string, unknown> => {
  if (!patch || !existing) return {};
  const out: Record<string, unknown> = {};
  for (const field of diffPartFields(patch, existing)) {
    if (patch[field] !== undefined) out[field] = patch[field];
  }
  out.is_imported = true;
  out.imported_at = options.now || asString(patch.imported_at) || new Date().toISOString();
  out.import_source = IMPORT_SOURCE;
  const existingKey = asString(existingField(existing, 'creation_request_key'));
  if (!existingKey && asString(patch.creation_request_key)) {
    out.creation_request_key = asString(patch.creation_request_key);
  }
  return out;
};

// ---------------------------------------------------------------------------
// "Import Part" system defaults (e-commerce/API clone fallback part)
// ---------------------------------------------------------------------------

/** Stable system_part_key + creation_request_key — seeding is idempotent. */
export const IMPORT_PART_SYSTEM_KEY = 'import_part';
export const IMPORT_PART_CREATION_KEY = `${IMPORT_KEY_PREFIX}system:${IMPORT_PART_SYSTEM_KEY}`;

/** Frozen field bag for the system "Import Part" — the part e-commerce/API
 *  order clones point at when no catalog part matched their line. cost/price
 *  are 0 because cloned lines carry their own captured pricing. */
export const IMPORT_PART_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze({
  part_name: 'Import Part',
  part_number: 'IMPORT-PART',
  mfg_part_number: 'IMPORT-PART',
  part_type: 'system',
  unit: 'each',
  cost: 0,
  price: 0,
  min_charge: 0,
  setup_fee: 0,
  taxable: true,
  double_sided: false,
  description:
    'System part — default for e-commerce/API order lines whose product has no catalog part. Do not edit or delete.',
  is_system_part: true,
  system_part_key: IMPORT_PART_SYSTEM_KEY,
  is_imported: false,
  import_source: 'system_default',
  is_active: true,
  creation_request_key: IMPORT_PART_CREATION_KEY,
});

/** Fresh copy of the system defaults; `now` stamps seeded_at when given. */
export const importPartDefaults = (
  options: { now?: string } = {},
): Record<string, unknown> => {
  const out = { ...IMPORT_PART_DEFAULTS };
  if (options.now) out.seeded_at = options.now;
  return out;
};

/** Does this record represent the system Import Part? */
export const isImportPart = (rec: unknown): boolean => {
  if (!isRecord(rec)) return false;
  if (asString(rec.system_part_key) === IMPORT_PART_SYSTEM_KEY) return true;
  if (asString(rec.creation_request_key) === IMPORT_PART_CREATION_KEY) return true;
  if (asString(rec.idempotency_key) === IMPORT_PART_CREATION_KEY) return true;
  return (
    rec.is_system_part === true &&
    normalizeNameKey(firstString(rec, ['part_name', 'template_name', 'name'])) === 'import part'
  );
};
