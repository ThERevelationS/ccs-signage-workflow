// Vendor cost/markup on vended parts — pure TS, ZERO imports, NO IO.
// (ESTIMATOR_MASTERPLAN F-21; CoreBridge map §5 "vendor cost/markup on vended
// parts" + §8 Options "vendor association". Entity field: BuilderPart.vendor_id
// declared by A-03; vendor cost/markup fields ride as stored extras until the
// schema lanes below are declared — see "Entity contract".)
//
// This is the DATA layer only — it resolves which vendor supplies a part, what
// the vendor charges, and what retail the markup chain produces. It does NOT
// reprice estimate lines (pricingEngine/F-23 owns price paths); the part row
// badge + parts report consume its output verbatim.
//
// ---------------------------------------------------------------------------
// Entity contract — canonical stored spellings (write paths use these; every
// resolver also normalizes the stored aliases listed per field)
// ---------------------------------------------------------------------------
//   BuilderPart / catalog part:
//     vendor_id             string — Vendor registry id (A-03, DECLARED)
//     vendor_name           string — denormalized display name (import lane
//                          already writes it; NOT yet declared)
//     vendor_cost           number — explicit vendor unit cost override
//                          (NOT yet declared)
//     vendor_markup_percent number — percent markup over vendor cost
//                          (NOT yet declared)
//     vendor_markup_flat    number — flat $ added after percent markup
//                          (NOT yet declared)
//     is_vended             boolean — explicit "vended part" flag
//                          (NOT yet declared)
//     mfg_part_number       string — vendor/mfg part # (A-03, DECLARED)
//   Vendor registry (backend-only; callers pass rows in as `vendors`):
//     name                  string — DECLARED
//     default_cost          number — vendor's default unit cost (NOT declared)
//     default_markup_percent number — vendor's default markup (NOT declared)
//     default_markup_flat   number — vendor's default flat add (NOT declared)
//
// ---------------------------------------------------------------------------
// Cost precedence (resolveVendorCost.source)
// ---------------------------------------------------------------------------
//   1. 'part_vendor_cost' — explicit vendor-cost override on the part:
//      vendor_cost | vendor_unit_cost (root, then detail_overrides, then
//      pricing_basis_snapshot). Even an explicit 0 wins — a logged vendor
//      credit is still vendor cost.
//   2. 'vendor_default' — the matched Vendor record's default cost:
//      default_cost | default_unit_cost | cost | unit_cost | vendor_cost.
//   3. 'part_cost' — the part's own cost: cost | unit_cost |
//      frozen_unit_cost | current_unit_cost (root), then
//      frozen_inventory_snapshot / current_inventory_snapshot cost fields
//      (cost_per_unit | default_rate | cost | unit_cost | supplier_cost |
//      vendor_cost), calculation_snapshot.unit_cost,
//      pricing_basis_snapshot.unit_cost, and any *cost* key inside
//      pricing_basis_snapshot.inventory_pricing (the free-form snapshot bag
//      pricingSnapshot() captures).
//   4. 'none' — nothing finite resolved; unit_cost 0, computed_retail 0.
//
// ---------------------------------------------------------------------------
// Markup precedence (resolveVendorCost.markup_percent / markup_flat)
// ---------------------------------------------------------------------------
//   1. part explicit vendor markup: vendor_markup_percent | vendor_markup_pct
//      | vendor_markup | vendorMarkupPercent (root → detail_overrides →
//      pricing_basis_snapshot)
//   2. vendor default markup: default_markup_percent | default_markup_pct |
//      default_markup | markup_percent | markup_pct | markup
//   3. part generic markup: markup_percent | markup_pct | markup
//   4. 0
//   Flat markup follows the same ladder: vendor_markup_flat | markup_flat |
//   flat_markup | markup_flat_amount | vendor_flat_markup →
//   vendor.default_markup_flat | markup_flat | flat_markup →
//   part.markup_flat | flat_markup → 0.
//
// ---------------------------------------------------------------------------
// Vended detection (resolveVendorCost.vended / isVendedPart)
// ---------------------------------------------------------------------------
// A part is vended when any of these resolve (checked in order):
//   explicit flag  is_vended | isVended | vended on part root,
//                  builder_data, calculation_snapshot, detail_overrides
//                  ('false'/'no'/0 spellings count as NOT vended)
//   vendor link    vendor_id non-empty, vendor_name non-empty (root or
//                  detail_overrides), or a vendors-list name match
//   vendor cost    an explicit vendor_cost field is present (finite — 0 counts)
//   vended source  frozen/current inventory snapshot carries vendor_name
//                  (LaborServiceInventory's outsourced-supplier field)
// Plain `supplier` on an inventory snapshot is intentionally NOT a vended
// signal — every stocked material has a supplier; "vended" means the part is
// bought out / outsourced, matching the CoreBridge "Is Vended" row flag.
//
// ---------------------------------------------------------------------------
// Money (markupChain)
// ---------------------------------------------------------------------------
//   retail = round(cost * (1 + markup_percent/100) + markup_flat)
// Percent applies first, flat adds on top — "50% + $10 handling" semantics.
// `rounding`: 'cent' (default — shared EPSILON half-up cents, same convention
// as pricingEngine.round2/sizeDiscounts), 'dollar' (half-up whole dollars),
// 'dollar_99' (ceil to the next x.99 price point), 'none' (raw float — callers
// that post-round downstream). cost < 0 clamps to 0; markup_percent has no
// floor (negative markup = discount sell is legal); the result never returns
// NaN — non-finite inputs behave as 0.
//
// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
//   VENDOR_COST_SOURCES — ['part_vendor_cost','vendor_default','part_cost','none']
//   VENDED_PART_WRITE_FIELDS — canonical write-path field names
//   isVendedPart(part)
//   vendedPartFields(part) → {is_vended, vendor_id, vendor_name, vendor_cost,
//                             vendor_markup_percent, vendor_markup_flat}
//                            (numbers stay null when unset — "no cost" never
//                            aliases to an explicit 0 on writes)
//   markupChain({cost, markup_percent, markup_flat, rounding}) → retail number
//   resolveVendorCost({part, vendors}) → {vended, vendor_id, vendor_name,
//                             unit_cost, markup_percent, markup_flat,
//                             computed_retail, margin_cents, margin_pct, source}
//   vendorCostReportRow({part, vendor, vendors}) → {part_id, part_name, vendor,
//                             vendor_id, cost, markup, markup_flat, retail,
//                             margin_cents, margin_pct, source, vended}
//                            (§5 parts-report row shape; `vendor` is an
//                            explicit record — `vendors` is the same list form
//                            resolveVendorCost takes when caller has no record)
//   vendorNameFor(part) — display name resolution only

// ---------------------------------------------------------------------------
// shared coercion (same reject set as sizeDiscounts/modifierPricing)
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

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

const num = (v: unknown, fallback = 0): number => toFiniteNumber(v) ?? fallback;

/** First defined/non-empty raw value across a field-name scan. */
const firstField = (
  rec: Record<string, unknown> | null,
  fields: readonly string[],
): unknown => {
  if (!rec) return undefined;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** First finite number across a field-name scan; null when none resolve. */
const firstFinite = (
  rec: Record<string, unknown> | null,
  fields: readonly string[],
): number | null => {
  const v = firstField(rec, fields);
  return v === undefined ? null : toFiniteNumber(v);
};

/** First non-empty string across a field-name scan. */
const firstString = (
  rec: Record<string, unknown> | null,
  fields: readonly string[],
): string => {
  const v = firstField(rec, fields);
  return v === undefined ? '' : asString(v);
};

/** Shared pricing convention: half-up cents with the float-epsilon nudge. */
const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// types + constants
// ---------------------------------------------------------------------------

export const VENDOR_COST_SOURCES = Object.freeze([
  'part_vendor_cost',
  'vendor_default',
  'part_cost',
  'none',
] as const);

export type VendorCostSource = typeof VENDOR_COST_SOURCES[number];

export type MarkupRounding = 'cent' | 'dollar' | 'dollar_99' | 'none';

export interface VendorCostResolution {
  /** True when the part carries any vended signal (see header). */
  vended: boolean;
  /** Resolved Vendor registry id ('' when unmatched/unnamed). */
  vendor_id: string;
  /** Display name for the supplying vendor ('' = unresolved). */
  vendor_name: string;
  /** Resolved vendor unit cost — see precedence ladder. */
  unit_cost: number;
  /** Resolved percent markup over unit_cost (negative = discount). */
  markup_percent: number;
  /** Resolved flat $ added after the percent markup. */
  markup_flat: number;
  /** markupChain output — the cost→retail split's retail side. */
  computed_retail: number;
  /** Integer cents of margin in computed_retail (retail - cost). */
  margin_cents: number;
  /** Margin on retail, percent (0 when retail <= 0). */
  margin_pct: number;
  /** Which cost layer won. */
  source: VendorCostSource;
}

export interface VendorCostReportRow {
  part_id: string;
  part_name: string;
  vendor: string;
  vendor_id: string;
  cost: number;
  /** Resolved markup percent (the display "markup" for the §5 row). */
  markup: number;
  markup_flat: number;
  retail: number;
  margin_cents: number;
  margin_pct: number;
  source: VendorCostSource;
  vended: boolean;
}

export interface VendedPartFields {
  is_vended: boolean;
  vendor_id: string;
  vendor_name: string;
  vendor_cost: number | null;
  vendor_markup_percent: number | null;
  vendor_markup_flat: number | null;
}

/** Canonical write-path field names — the normalized shape vendedPartFields
 *  emits and entity write paths should store under. */
export const VENDED_PART_WRITE_FIELDS = Object.freeze([
  'is_vended',
  'vendor_id',
  'vendor_name',
  'vendor_cost',
  'vendor_markup_percent',
  'vendor_markup_flat',
] as const);

// ---------------------------------------------------------------------------
// stored-alias vocabulary
// ---------------------------------------------------------------------------

const VENDOR_ID_FIELDS = ['vendor_id', 'vendorId', 'supplier_id'] as const;
const VENDOR_NAME_FIELDS = [
  'vendor_name', 'vendorName', 'vendor', 'supplier_name',
] as const;
const PART_VENDOR_COST_FIELDS = [
  'vendor_cost', 'vendor_unit_cost', 'vendorCost', 'vendorUnitCost',
] as const;
const PART_COST_FIELDS = [
  'cost', 'unit_cost', 'frozen_unit_cost', 'current_unit_cost',
] as const;
const SNAPSHOT_COST_FIELDS = [
  'cost_per_unit', 'default_rate', 'vendor_cost', 'cost', 'unit_cost',
  'supplier_cost', 'unit_price_cost',
] as const;
const VENDOR_DEFAULT_COST_FIELDS = [
  'default_cost', 'default_unit_cost', 'cost', 'unit_cost', 'vendor_cost',
] as const;
const PART_VENDOR_MARKUP_PCT_FIELDS = [
  'vendor_markup_percent', 'vendor_markup_pct', 'vendor_markup',
  'vendorMarkupPercent', 'vendorMarkupPct',
] as const;
const VENDOR_DEFAULT_MARKUP_PCT_FIELDS = [
  'default_markup_percent', 'default_markup_pct', 'default_markup',
  'markup_percent', 'markup_pct', 'markup',
] as const;
const PART_MARKUP_PCT_FIELDS = [
  'markup_percent', 'markup_pct', 'markup',
] as const;
const PART_VENDOR_MARKUP_FLAT_FIELDS = [
  'vendor_markup_flat', 'vendor_flat_markup', 'vendor_markup_amount',
  'vendor_markup_flat_amount',
] as const;
const VENDOR_DEFAULT_MARKUP_FLAT_FIELDS = [
  'default_markup_flat', 'markup_flat', 'flat_markup', 'markup_flat_amount',
] as const;
const PART_MARKUP_FLAT_FIELDS = [
  'markup_flat', 'flat_markup', 'markup_flat_amount', 'markup_amount',
] as const;
const VENDED_FLAG_FIELDS = ['is_vended', 'isVended', 'vended'] as const;
const ROUNDING_FIELDS = [
  'vendor_rounding', 'markup_rounding', 'retail_rounding', 'rounding',
] as const;
const VENDOR_RECORD_NAME_FIELDS = [
  'name', 'vendor_name', 'display_name', 'company_name',
] as const;

// ---------------------------------------------------------------------------
// scope walk — part root, then the declared snapshot/override bags
// ---------------------------------------------------------------------------

interface PartScopes {
  root: Record<string, unknown> | null;
  detailOverrides: Record<string, unknown> | null;
  pricingBasis: Record<string, unknown> | null;
  inventoryPricing: Record<string, unknown> | null;
  frozenSnapshot: Record<string, unknown> | null;
  currentSnapshot: Record<string, unknown> | null;
  builderData: Record<string, unknown> | null;
  calculation: Record<string, unknown> | null;
}

const scopesOf = (part: unknown): PartScopes => {
  const p = isRecord(part) ? part : null;
  const basis = p && isRecord(p.pricing_basis_snapshot) ? p.pricing_basis_snapshot : null;
  return {
    root: p,
    detailOverrides: p && isRecord(p.detail_overrides) ? p.detail_overrides : null,
    pricingBasis: basis,
    inventoryPricing: basis && isRecord(basis.inventory_pricing) ? basis.inventory_pricing : null,
    frozenSnapshot: p && isRecord(p.frozen_inventory_snapshot) ? p.frozen_inventory_snapshot : null,
    currentSnapshot: p && isRecord(p.current_inventory_snapshot) ? p.current_inventory_snapshot : null,
    builderData: p && isRecord(p.builder_data) ? p.builder_data : null,
    calculation: p && isRecord(p.calculation_snapshot) ? p.calculation_snapshot : null,
  };
};

/** First non-empty value scanning the same fields across ordered scopes. */
const scopedField = (
  scopes: readonly (Record<string, unknown> | null)[],
  fields: readonly string[],
): unknown => {
  for (const scope of scopes) {
    const v = firstField(scope, fields);
    if (v !== undefined) return v;
  }
  return undefined;
};

const scopedFinite = (
  scopes: readonly (Record<string, unknown> | null)[],
  fields: readonly string[],
): number | null => {
  const v = scopedField(scopes, fields);
  return v === undefined ? null : toFiniteNumber(v);
};

const scopedString = (
  scopes: readonly (Record<string, unknown> | null)[],
  fields: readonly string[],
): string => {
  const v = scopedField(scopes, fields);
  return v === undefined ? '' : asString(v);
};

// ---------------------------------------------------------------------------
// vendor list handling — Vendor is backend-only, so callers hand rows in as an
// array or an id->record Map; matching mirrors catalogImportModel
// vendorAssociation (id first, then normalized name).
// ---------------------------------------------------------------------------

const vendorRows = (vendors: unknown): Record<string, unknown>[] => {
  if (!vendors) return [];
  if (vendors instanceof Map) {
    return [...vendors.values()].filter(isRecord);
  }
  return (Array.isArray(vendors) ? vendors : []).filter(isRecord);
};

const normalizeNameKey = (v: unknown): string =>
  asString(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const vendorRecordName = (vendor: unknown): string =>
  firstString(isRecord(vendor) ? vendor : null, VENDOR_RECORD_NAME_FIELDS);

const findVendor = (
  scopes: PartScopes,
  vendors: unknown,
): Record<string, unknown> | null => {
  const list = vendorRows(vendors);
  if (!list.length) return null;
  const wantId = scopedString(
    [scopes.root, scopes.detailOverrides], VENDOR_ID_FIELDS);
  if (wantId) {
    const byId = list.find((v) => asString(v.id) === wantId);
    if (byId) return byId;
  }
  const wantName = normalizeNameKey(scopedString(
    [scopes.root, scopes.detailOverrides], VENDOR_NAME_FIELDS));
  if (!wantName) return null;
  const named = list.filter(
    (v) => normalizeNameKey(vendorRecordName(v)) === wantName);
  // Id-typed names still bind (same escape hatch as vendorAssociation).
  if (!named.length) {
    return list.find((v) => asString(v.id) === wantName) || null;
  }
  return named.find((v) => asString(v.status) !== 'inactive') || named[0] || null;
};

// ---------------------------------------------------------------------------
// vended detection
// ---------------------------------------------------------------------------

const TRUTHY_FLAG = new Set(['true', 'yes', 'y', '1']);

/** A vended flag value — string spellings of false mean explicitly NOT vended. */
const flagIsTruthy = (v: unknown): boolean => {
  if (v === true) return true;
  if (v === false || v === null || v === undefined || v === '') return false;
  const n = toFiniteNumber(v);
  if (n !== null) return n !== 0;
  return TRUTHY_FLAG.has(asString(v).toLowerCase());
};

/**
 * True when the part is vendor-supplied (see header for the full signal
 * list). Never throws; non-record input → false.
 */
export function isVendedPart(part: unknown): boolean {
  const s = scopesOf(part);
  if (!s.root) return false;

  for (const scope of [s.root, s.builderData, s.calculation, s.detailOverrides]) {
    const flag = firstField(scope, VENDED_FLAG_FIELDS);
    if (flag !== undefined) return flagIsTruthy(flag);
  }
  if (scopedString([s.root, s.detailOverrides], VENDOR_ID_FIELDS) !== '') return true;
  if (scopedString([s.root, s.detailOverrides], VENDOR_NAME_FIELDS) !== '') return true;
  if (scopedFinite([s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_COST_FIELDS) !== null) {
    return true;
  }
  // Vended-service inventory: LaborServiceInventory snapshots carry
  // vendor_name for the outsourced supplier. Plain `supplier` does NOT count.
  for (const snap of [s.frozenSnapshot, s.currentSnapshot]) {
    if (firstString(snap, ['vendor_name']) !== '') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// cost + markup resolution
// ---------------------------------------------------------------------------

/** Any *cost* key inside the free-form inventory_pricing snapshot bag. */
const inventoryPricingCost = (bag: Record<string, unknown> | null): number | null => {
  if (!bag) return null;
  const direct = firstFinite(bag, SNAPSHOT_COST_FIELDS);
  if (direct !== null) return direct;
  const keys = Object.keys(bag).filter((k) => /cost/i.test(k));
  keys.sort();
  for (const k of keys) {
    const n = toFiniteNumber(bag[k]);
    if (n !== null) return n;
  }
  return null;
};

const resolveUnitCost = (
  s: PartScopes,
  vendor: Record<string, unknown> | null,
): { unit_cost: number; source: VendorCostSource } => {
  const partVendor = scopedFinite(
    [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_COST_FIELDS);
  if (partVendor !== null) {
    return { unit_cost: Math.max(0, partVendor), source: 'part_vendor_cost' };
  }
  const vendorDefault = firstFinite(vendor, VENDOR_DEFAULT_COST_FIELDS);
  if (vendorDefault !== null) {
    return { unit_cost: Math.max(0, vendorDefault), source: 'vendor_default' };
  }
  const partCost = firstFinite(s.root, PART_COST_FIELDS);
  if (partCost !== null) {
    return { unit_cost: Math.max(0, partCost), source: 'part_cost' };
  }
  for (const snap of [s.frozenSnapshot, s.currentSnapshot]) {
    const snapCost = firstFinite(snap, SNAPSHOT_COST_FIELDS);
    if (snapCost !== null) {
      return { unit_cost: Math.max(0, snapCost), source: 'part_cost' };
    }
  }
  const calcCost = firstFinite(s.calculation, ['unit_cost', 'cost']);
  if (calcCost !== null) {
    return { unit_cost: Math.max(0, calcCost), source: 'part_cost' };
  }
  const basisCost = firstFinite(s.pricingBasis, ['unit_cost', 'cost']);
  if (basisCost !== null) {
    return { unit_cost: Math.max(0, basisCost), source: 'part_cost' };
  }
  const priced = inventoryPricingCost(s.inventoryPricing);
  if (priced !== null) {
    return { unit_cost: Math.max(0, priced), source: 'part_cost' };
  }
  return { unit_cost: 0, source: 'none' };
};

const resolveMarkupPercent = (
  s: PartScopes,
  vendor: Record<string, unknown> | null,
): number => {
  const partVendor = scopedFinite(
    [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_MARKUP_PCT_FIELDS);
  if (partVendor !== null) return partVendor;
  const vendorDefault = firstFinite(vendor, VENDOR_DEFAULT_MARKUP_PCT_FIELDS);
  if (vendorDefault !== null) return vendorDefault;
  const partMarkup = scopedFinite([s.root, s.pricingBasis], PART_MARKUP_PCT_FIELDS);
  if (partMarkup !== null) return partMarkup;
  return 0;
};

const resolveMarkupFlat = (
  s: PartScopes,
  vendor: Record<string, unknown> | null,
): number => {
  const partVendor = scopedFinite(
    [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_MARKUP_FLAT_FIELDS);
  if (partVendor !== null) return partVendor;
  const vendorDefault = firstFinite(vendor, VENDOR_DEFAULT_MARKUP_FLAT_FIELDS);
  if (vendorDefault !== null) return vendorDefault;
  const partFlat = scopedFinite([s.root, s.pricingBasis], PART_MARKUP_FLAT_FIELDS);
  if (partFlat !== null) return partFlat;
  return 0;
};

const resolveRounding = (
  s: PartScopes,
  vendor: Record<string, unknown> | null,
): MarkupRounding => {
  const raw = (
    scopedString([s.root, s.detailOverrides, s.pricingBasis], ROUNDING_FIELDS) ||
    firstString(vendor, ROUNDING_FIELDS)
  ).toLowerCase();
  if (raw === 'dollar' || raw === 'dollars') return 'dollar';
  if (raw === 'dollar_99' || raw === '99' || raw === 'charm') return 'dollar_99';
  if (raw === 'none' || raw === 'raw' || raw === 'unrounded') return 'none';
  return 'cent';
};

// ---------------------------------------------------------------------------
// markupChain — cent-safe retail
// ---------------------------------------------------------------------------

/**
 * cost * (1 + markup_percent/100) + markup_flat, rounded per `rounding`
 * ('cent' default — EPSILON half-up). Never throws, never returns NaN;
 * cost clamps >= 0, retail clamps >= 0.
 */
export function markupChain(args: {
  cost: unknown;
  markup_percent?: unknown;
  markup_flat?: unknown;
  rounding?: unknown;
}): number {
  const a = isRecord(args) ? args : {};
  const cost = Math.max(0, num(a.cost));
  const pct = num(a.markup_percent);
  const flat = num(a.markup_flat);
  const raw = cost * (1 + pct / 100) + flat;
  if (!Number.isFinite(raw)) return 0;
  const mode = asString(a.rounding).toLowerCase();
  let out: number;
  if (mode === 'none' || mode === 'raw' || mode === 'unrounded') {
    out = raw;
  } else if (mode === 'dollar' || mode === 'dollars') {
    out = Math.round(raw + Number.EPSILON);
  } else if (mode === 'dollar_99' || mode === '99' || mode === 'charm') {
    // Next x.99 at-or-above the raw price (12.00 -> 12.99, 12.99 -> 12.99).
    out = Math.ceil(raw - 0.99 - 1e-9) + 0.99;
  } else {
    out = round2(raw);
  }
  return out < 0 ? 0 : out;
}

// ---------------------------------------------------------------------------
// vendor display name
// ---------------------------------------------------------------------------

/**
 * The display vendor name for a part: matched Vendor record > part vendor_name
 * > inventory snapshot vendor_name (LaborServiceInventory) > inventory
 * snapshot supplier (display fallback only — never a vended signal by itself).
 */
export function vendorNameFor(part: unknown, vendors?: unknown): string {
  const s = scopesOf(part);
  const vendor = findVendor(s, vendors);
  const fromVendor = vendorRecordName(vendor);
  if (fromVendor) return fromVendor;
  const onPart = scopedString([s.root, s.detailOverrides], VENDOR_NAME_FIELDS);
  if (onPart) return onPart;
  for (const snap of [s.frozenSnapshot, s.currentSnapshot]) {
    const snapVendor = firstString(snap, ['vendor_name']);
    if (snapVendor) return snapVendor;
  }
  for (const snap of [s.frozenSnapshot, s.currentSnapshot]) {
    const supplier = firstString(snap, ['supplier', 'rental_company']);
    if (supplier) return supplier;
  }
  return '';
}

// ---------------------------------------------------------------------------
// resolveVendorCost — the full resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a part's vendor, unit cost, markup chain, and retail split.
 * `vendors` accepts a Vendor-record array or an id->record Map (the Vendor
 * entity is backend-only; callers pre-fetch it). Never throws — a missing or
 * unmatched vendor simply narrows the precedence chain and degrades to
 * part-carried names/costs.
 */
export function resolveVendorCost(args: {
  part: unknown;
  vendors?: unknown;
}): VendorCostResolution {
  const a = isRecord(args) ? args : {};
  const s = scopesOf(a.part);
  const vendor = findVendor(s, a.vendors);

  const vendor_id =
    scopedString([s.root, s.detailOverrides], VENDOR_ID_FIELDS) ||
    asString(vendor?.id);
  const vendor_name = vendorNameFor(a.part, a.vendors);

  const { unit_cost, source } = resolveUnitCost(s, vendor);
  const markup_percent = resolveMarkupPercent(s, vendor);
  const markup_flat = resolveMarkupFlat(s, vendor);
  const rounding = resolveRounding(s, vendor);
  const computed_retail = markupChain({
    cost: unit_cost, markup_percent, markup_flat, rounding,
  });
  const margin_cents = Math.round((computed_retail - unit_cost) * 100);
  const margin_pct =
    computed_retail > 0 ? round2(((computed_retail - unit_cost) / computed_retail) * 100) : 0;

  return {
    vended: isVendedPart(a.part) || Boolean(vendor),
    vendor_id,
    vendor_name,
    unit_cost,
    markup_percent,
    markup_flat,
    computed_retail,
    margin_cents,
    margin_pct,
    source,
  };
}

// ---------------------------------------------------------------------------
// vendorCostReportRow — §5 parts-report row
// ---------------------------------------------------------------------------

/**
 * One flat §5 parts-report row for a (usually vended) part. `vendor` is an
 * explicit Vendor record when the caller already resolved one; `vendors` is
 * the list form resolveVendorCost accepts. Never throws.
 */
export function vendorCostReportRow(args: {
  part: unknown;
  vendor?: unknown;
  vendors?: unknown;
}): VendorCostReportRow {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : null;
  const s = scopesOf(part);
  const vendor = isRecord(a.vendor) ? a.vendor : findVendor(s, a.vendors);
  const resolution = resolveVendorCost({
    part,
    vendors: vendor ? [vendor] : a.vendors,
  });
  return {
    part_id: asString(part?.id) || asString(part?.part_key),
    part_name: asString(part?.part_name) || asString(part?.client_label),
    vendor: vendorRecordName(vendor) || resolution.vendor_name,
    vendor_id: resolution.vendor_id,
    cost: resolution.unit_cost,
    markup: resolution.markup_percent,
    markup_flat: resolution.markup_flat,
    retail: resolution.computed_retail,
    margin_cents: resolution.margin_cents,
    margin_pct: resolution.margin_pct,
    source: resolution.source,
    vended: resolution.vended,
  };
}

// ---------------------------------------------------------------------------
// vendedPartFields — normalized write shape
// ---------------------------------------------------------------------------

/**
 * The part's vendor fields normalized to the canonical stored spellings —
 * merge this into write patches instead of re-walking aliases per call site.
 * Numeric fields stay null when unset so writers can distinguish "no vendor
 * cost" from an explicit 0 (a vendor credit). Never throws.
 */
export function vendedPartFields(part: unknown): VendedPartFields {
  const s = scopesOf(part);
  return {
    is_vended: isVendedPart(part),
    vendor_id: scopedString([s.root, s.detailOverrides], VENDOR_ID_FIELDS),
    vendor_name: scopedString([s.root, s.detailOverrides], VENDOR_NAME_FIELDS) ||
      firstString(s.frozenSnapshot, ['vendor_name']),
    vendor_cost: scopedFinite(
      [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_COST_FIELDS),
    vendor_markup_percent: scopedFinite(
      [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_MARKUP_PCT_FIELDS),
    vendor_markup_flat: scopedFinite(
      [s.root, s.detailOverrides, s.pricingBasis], PART_VENDOR_MARKUP_FLAT_FIELDS),
  };
}
