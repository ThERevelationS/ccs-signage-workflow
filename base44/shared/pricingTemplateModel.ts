// PricingTemplate application — pure TS, ZERO imports, NO IO.
// (ESTIMATOR_MASTERPLAN F-06; entities base44/entities/PricingTemplate.jsonc
// (A-04), GlobalPricingTier.jsonc (A-07), BuilderPart.jsonc `pricing_template_id`
// (A-03 — DECLARED), PricingTierMatrix shape per pricingEngine.ts F-04 notes.)
//
// A catalog part picks a PricingTemplate on its Pricing Tiers tab; this module
// resolves the template's quantity-break x customer-tier margin chart against
// an order qty + tier context and produces the unit/extended price the caller
// folds into the shared pricing engine (base44/shared/pricingEngine.ts). It
// never imports: Deno functions and the Vite frontend can both bundle it.
//
// ---------------------------------------------------------------------------
// Entity contract — canonical stored spellings
// ---------------------------------------------------------------------------
//   PricingTemplate:  name, unit_category (SqFt|LinFt|Each|Hourly|Pixels|...),
//                     breaks[] = {qty:number, tier_markups:{<tierKey>: markup_pct}}
//                     in ASCENDING qty order — "when order qty >= bracket qty,
//                     that bracket's tier_markups chart applies". markup_pct is
//                     a PERCENT over cost (50 = cost x 1.50). market_based flag
//                     flips tier_markups values to market-based retail/discount
//                     chart entries. status 'active'|'inactive' (blank=active).
//   BuilderPart:      pricing_template_id — the link field (DECLARED A-03).
//                     unit — pricing-unit the template's unit_category gates on.
//                     fixed_price / per_unit_breaks / markup_pct / market_retail
//                     (tolerated part-descriptor extras per pricingEngine
//                     overrideRule). min_charge — part-level extension floor.
//   GlobalPricingTier rules[] = {tier, markup_pct, market_based} — a part may
//                     pin a named shared rule set as a fallback chart when the
//                     bound template cannot price a (qty, tier) point. Part
//                     link fields are TOLERATED EXTRAS today (no declared
//                     field — see "Schema gaps" below).
//   MarkupTier rows   ({tier_name, tier_number, id, name}) expand the customer
//                     tier's match keys — a '2' customer matches a chart entry
//                     keyed 'Wholesale' when the catalog row supplies it.
//
// ---------------------------------------------------------------------------
// Resolution precedence (resolveTemplatePrice) — engine-ladder parity
// ---------------------------------------------------------------------------
// The part layer of pricingEngine.overrideRule ranks: fixed_price > bound
// tier ref > per_unit_breaks > market > markup_pct. A bound PricingTemplate is
// that "bound chart ref" — so the chain walked here (strongest first, FIRST
// producing source wins, echoed in result.chain):
//
//   1. part_fixed      — part fixed_price/price_override/override_price > 0
//                        pins the unit price outright (source 'part_fixed').
//   2. template        — resolved template + qualifying bracket (see below).
//   3. tier_rule_set   — part-linked GlobalPricingTier rule hit (fallback when
//                        the template produced no price for this qty+tier).
//   4. part_chart      — part's own per_unit_breaks/unit_breaks bracket pick.
//   5. part_market     — part market_retail > 0 (+ market_discount_pct).
//   6. default_markup  — part.markup_pct (nonzero) else opts.default_markup_pct.
//   7. cost_passthrough— nothing finite anywhere; unit = base_price verbatim.
//
// Inside the template layer:
//   a. unit gate — a non-blank template.unit_category must ci-match the part's
//      pricing unit (unit|pricing_unit|pricingUnit|uom|unit_of_measure|
//      unit_category). Mismatch -> template cannot price
//      (reason 'unit_category_mismatch'). A BLANK part unit cannot disprove the
//      admin's pick — the template applies with `unit_unverified:true` flagged.
//   b. bracket pick — brackets qualify on (order qty >= bracket qty) AND the
//      bracket resolving a price for the customer tier (machineCosts
//      pickMarginBracket + F-27 shape-map parity: a bracket that cannot price
//      this tier simply doesn't qualify, so a LOWER bracket that covers the
//      tier wins over a higher bracket that doesn't). Highest qualifying
//      bracket qty wins; equal thresholds -> first declared. qty <= 0 prices
//      no bracket (engine pickUnitBreak parity) -> reason 'qty_not_positive'.
//   c. within a qualifying bracket (tier-scoped entry first — the map is the
//      chart's purpose; flat fields are the bracket's own fallback):
//      markup (cost-plus) template: tier_markups hit > unit_price >
//                                   markup_pct > discount_pct
//      market_based template:       tier_markups retail (>0) > market_retail >
//                                   template market_retail > unit_price >
//                                   markup_pct > discount_pct
//      DELIBERATE DEVIATION from machineCosts bracketPct (flat fields before
//      the map): there the tier map is a tolerated extra on margin charts;
//      here tier_markups is the DECLARED chart — "that bracket's
//      tier_markups chart applies" (PricingTemplate.jsonc).
//      Market values are retail UNIT prices; a row/template discount field
//      takes percent off (engine market parity: retail <= 0 counts as absent
//      and falls back to the markup path — F-27 i5).
//   d. tier_markups lookup (machineCosts tierMarkupsPct parity): normalized
//      customer-tier keys (tier_name/tier_number/id/name + 'tier'/'key' aliases,
//      catalog-expanded via `tiers`) > 'default' > '*' > lone numeric entry
//      (only when the map holds exactly one value AND it is finite).
//   e. template root flat fields (markup_pct|unit_price|market_retail|
//      discount_pct — tolerated extras) act as the chart-level default when no
//      bracket resolves (machineCosts 'chart_default' parity):
//      pct_source 'template_default', still source 'template' (applied:true).
//
// Malformed chart rows are REJECTED at normalization (warning recorded):
// non-record rows, a present-but-non-finite or negative qty, rows carrying no
// usable pricing content at all. A MISSING qty field means min 0 — a catch-all
// bracket covering every positive qty (machineCosts bracketMinQty parity).
//
// extended = round2(unit_price x qty); the highest finite minimum_charge found
// across bracket row -> template root -> part.min_charge -> opts floors the
// extension when 0 < extension < min (engine Math.max(ruleMin, callerMin)
// parity; minimums never fire on extension <= 0).
//
// ---------------------------------------------------------------------------
// Determinism / template swap
// ---------------------------------------------------------------------------
// Every function is pure — same rows in, same price out; swapping
// part.pricing_template_id re-prices deterministically. Registry match order:
// ref field precedence pricing_template_id > template_id > margin_template_id
// > pricing_template_name > template_name; within the registry, id match >
// name match; duplicate names -> active rows first, then lowest `sort`, then
// lowest id. An embedded part-carried template record
// (part.pricing_template|part.template with a chart array) is the fallback
// when the ref dangles; opts.template wins over everything (caller's
// pre-resolved pick).
//
// ---------------------------------------------------------------------------
// Schema gaps (orchestrator notes — nothing required for the core path)
// ---------------------------------------------------------------------------
//   - BuilderPart.pricing_template_id is DECLARED (A-03) — core link needs no
//     schema work. PartTemplate.jsonc declares it too.
//   - Part -> GlobalPricingTier link has NO declared field; tolerated extras
//     read here: global_pricing_tier_id|pricing_tier_id|tier_set_id|
//     pricing_tier_set_id|pricing_rule_set_id (+_name spellings). Declare one
//     canonical field when the tier-set fallback needs persistence.
//   - Template root flat fields + bracket flat fields (unit_price/markup_pct/
//     discount_pct/market_retail/minimum_charge) are tolerated extras beyond
//     the declared {qty, tier_markups} shape — supported, not required.
//
// ---------------------------------------------------------------------------
// Engine seam (wiring spec — see worker log / claims note)
// ---------------------------------------------------------------------------
// pricingEngine.ts exposes NO price-level template hook today: resolvePricingMode
// ({part, template,...}) resolves the pricing FAMILY only. Clean integration is
// a CALLER-SIDE adapter — no engine restructure needed:
//   const res = resolveTemplatePrice({part, qty: line.qty, templates, tiers,
//                                     customer_tier, base_price: line.unitCost});
//   pricePart({...line, part: templatePartDescriptor(part, res)});
// templatePartDescriptor strips the part's own chart fields the template
// supersedes (tier_ref / per_unit_breaks / market_* / markup_pct) and injects
// the resolved value in overrideRule's vocabulary (markup_pct | market_*
// pricing_mode:'market_based' | per_unit_breaks [{qty, unit_price}]), so the
// part_tier ladder layer emits the template-priced rule untouched. When
// res.applied is false the descriptor returns `part` verbatim — the engine's
// own default chain (customer_tier -> global_default -> markup) prices it.
// (A future engine-native seam would slot into pricingEngine.ts `resolveTier`
// where `const partRule = overrideRule(part, rules)` runs (~line 431): a
// template branch between the tier_ref and per_unit_breaks blocks inside
// `overrideRule` (~lines 326-351), fed by threading {qty, customerTier,
// templates} through as a third `ctx` arg.)

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

const lc = (v: unknown): string => asString(v).toLowerCase();

/** Shared pricing convention: half-up cents / 4-decimal units with EPSILON nudge. */
export const round2 = (n: unknown): number =>
  Math.round((num(n) + Number.EPSILON) * 100) / 100;
export const round4 = (n: unknown): number =>
  Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

/** First field value that is present (not undefined/null/''). */
const firstField = (rec: Record<string, unknown> | null, fields: readonly string[]): unknown => {
  if (!rec) return undefined;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** First finite number across a field-name scan; null when none resolve. */
const firstFinite = (rec: Record<string, unknown> | null, fields: readonly string[]): number | null => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};

/** Same field scanned across nested scopes (root -> detail_overrides -> pricing_basis_snapshot). */
const scopedFinite = (part: Record<string, unknown> | null, fields: readonly string[]): number | null => {
  if (!part) return null;
  return firstFinite(part, fields)
    ?? firstFinite(isRecord(part.detail_overrides) ? part.detail_overrides : null, fields)
    ?? firstFinite(isRecord(part.pricing_basis_snapshot) ? part.pricing_basis_snapshot : null, fields);
};

// ---------------------------------------------------------------------------
// types + constants
// ---------------------------------------------------------------------------

export interface NormalizedTemplateBreak {
  /** Minimum order qty that unlocks this bracket (missing qty field -> 0). */
  qty: number;
  /** tier_markups map with ORIGINAL keys (finite values only). */
  tier_markups: Record<string, number>;
  /** Flat pinned unit price on the bracket row, else null. */
  unit_price: number | null;
  /** Flat markup percent on the bracket row, else null. */
  markup_pct: number | null;
  /** Flat discount percent on the bracket row, else null. */
  discount_pct: number | null;
  /** Market retail list price on the bracket row, else null. */
  market_retail: number | null;
  /** Discount percent off market retail on the bracket row, else null. */
  market_discount_pct: number | null;
  /** Extension floor on the bracket row, else null. */
  minimum_charge: number | null;
  /** Declaration index — deterministic tie-break for equal thresholds. */
  index: number;
  /** The raw row as supplied (audit echo). */
  raw: unknown;
}

export interface NormalizedPricingTemplate {
  id: string;
  name: string;
  unit_category: string;
  /** Chart rows sorted qty-ASC, declaration order preserved within ties. */
  breaks: NormalizedTemplateBreak[];
  market_based: boolean;
  status: string;
  active: boolean;
  sort: number;
  description: string;
  /** Chart-level flat fallbacks (tolerated extras — 'template_default'). */
  unit_price: number | null;
  markup_pct: number | null;
  discount_pct: number | null;
  market_retail: number | null;
  market_discount_pct: number | null;
  minimum_charge: number | null;
  /** Count of rows dropped during normalization (each warned). */
  rejected_breaks: number;
  warnings: string[];
  raw: unknown;
}

export type TemplatePctSource =
  | 'tier_markups'
  | 'tier_markups_default'
  | 'tier_markups_lone'
  | 'unit_price'
  | 'market_retail'
  | 'markup_pct'
  | 'discount_pct'
  | 'template_default'
  | 'tier_rule_set';

export type TemplatePriceSource =
  | 'part_fixed'
  | 'template'
  | 'tier_rule_set'
  | 'part_chart'
  | 'part_market'
  | 'default_markup'
  | 'cost_passthrough';

export interface TemplatePriceResult {
  /** True only when a PricingTemplate produced the unit price. */
  applied: boolean;
  template_id: string | null;
  template_name: string;
  template: NormalizedPricingTemplate | null;
  /** Winning precedence-layer token. */
  source: TemplatePriceSource;
  /** Which field inside the winning layer produced the value (null on fixed/cost passthrough). */
  pct_source: TemplatePctSource | 'fixed_price' | 'part_chart' | 'fallback' | null;
  /** The pricing FAMILY used — pricingEngine PRICING_MODES vocabulary. */
  pricing_mode: 'markup' | 'market_based' | 'fixed' | 'default_markup' | 'cost_passthrough';
  qty: number;
  base_price: number;
  unit_price: number;
  extended: number;
  /** Winning normalized bracket, else null. */
  tier_row: NormalizedTemplateBreak | null;
  /** Winning bracket's qty threshold, else null. */
  bracket_min_qty: number | null;
  /** tier_markups key that matched + its raw value, else null. */
  matched_tier: { key: string; value: number } | null;
  markup_pct: number | null;
  discount_pct: number | null;
  market_retail: number | null;
  market_discount_pct: number | null;
  minimum_charge: number;
  minimum_applied: boolean;
  /** Why the template did not price (null when it did / on part_fixed). */
  reason:
    | 'fixed_price'
    | 'no_template_ref'
    | 'template_not_found'
    | 'template_inactive'
    | 'unit_category_mismatch'
    | 'qty_not_positive'
    | 'no_qualifying_break'
    | null;
  /** Precedence walk, strongest first; exactly one entry has won:true. */
  chain: Array<{ layer: string; hit: boolean; won: boolean; detail: string }>;
  /** Non-blank template.unit_category could not be verified against a blank part unit. */
  unit_unverified: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// field vocabularies
// ---------------------------------------------------------------------------

/** Bracket qty-threshold aliases (canonical `qty` first; machineCosts set). */
const BREAK_QTY_FIELDS = [
  'qty', 'min_qty', 'qty_from', 'from_qty', 'min_quantity', 'quantity',
  'break_qty', 'threshold',
] as const;

/** tier_markups map aliases (canonical first; machineCosts tolerated set). */
const TIER_MAP_FIELDS = [
  'tier_markups', 'tierMarkups', 'tier_margins', 'tierMargins', 'tiers',
] as const;

const UNIT_PRICE_FIELDS = ['unit_price', 'price', 'sell_price', 'rate'] as const;
const MARKUP_FIELDS = ['markup_pct', 'markup', 'markup_percent'] as const;
const DISCOUNT_FIELDS = ['discount_pct', 'discount', 'discount_percent', 'pct_off'] as const;
const RETAIL_FIELDS = ['market_retail', 'retail', 'retail_price', 'list_price'] as const;
const RETAIL_DISCOUNT_FIELDS = ['market_discount_pct', 'retail_discount_pct'] as const;
const MIN_CHARGE_FIELDS = ['minimum_charge', 'min_charge', 'minimum'] as const;

/** Chart-array fields on a template record (canonical `breaks` first). */
const CHART_FIELDS = ['breaks', 'rows', 'margin_rows', 'brackets', 'chart'] as const;

/** Part fields that reference a PricingTemplate (canonical declared first). */
const PART_TEMPLATE_ID_FIELDS = [
  'pricing_template_id', 'template_id', 'margin_template_id',
] as const;
const PART_TEMPLATE_NAME_FIELDS = [
  'pricing_template_name', 'template_name',
] as const;
/** Part fields that may embed a template record (or carry a ref scalar). */
const PART_TEMPLATE_EMBED_FIELDS = ['pricing_template', 'template'] as const;

/** Part link fields for a GlobalPricingTier rule set (tolerated extras). */
const PART_TIER_SET_FIELDS = [
  'global_pricing_tier_id', 'pricing_tier_id', 'tier_set_id',
  'pricing_tier_set_id', 'pricing_rule_set_id', 'global_tier_id',
] as const;
const PART_TIER_SET_NAME_FIELDS = [
  'global_pricing_tier_name', 'pricing_tier_name', 'tier_set_name',
] as const;

// Engine overrideRule vocabulary (+ machineCosts' flat_price): 'sell_price'
// deliberately NOT an alias — snapshots carry it for display and it must not
// silently pin the line.
const PART_FIXED_FIELDS = [
  'fixed_price', 'price_override', 'override_price', 'flat_price',
] as const;
const PART_BREAK_FIELDS = ['per_unit_breaks', 'unit_breaks', 'qty_breaks'] as const;
const PART_MARKET_RETAIL_FIELDS = RETAIL_FIELDS;
const PART_MARKET_DISCOUNT_FIELDS = ['market_discount_pct', 'retail_discount_pct', 'discount_pct'] as const;
const PART_MARKUP_FIELDS = ['markup_pct', 'markup', 'markup_percent'] as const;
const PART_MIN_CHARGE_FIELDS = ['min_charge', 'minimum_charge', 'minimum'] as const;
const PART_UNIT_FIELDS = [
  'unit', 'pricing_unit', 'pricingUnit', 'unit_category', 'uom', 'unit_of_measure',
] as const;

/** Template field that may carry a pricing-mode token (tolerated extra). */
const TEMPLATE_MODE_FIELDS = ['pricing_mode', 'price_mode', 'mode'] as const;
const MARKET_MODE_TOKENS = new Set(['market', 'market_based', 'market-based', 'retail', 'retail_minus_discount']);

// ---------------------------------------------------------------------------
// tier keys (customerTierModel/pricingEngine parity — normalized key space)
// ---------------------------------------------------------------------------

/** Normalize ONE tier value to its canonical key ('02'/'2.0' -> '2'). */
const normalizeTierKey = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  const s = lc(v);
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(s)) return String(n);
  return s;
};

/** Every normalized key a tier value answers to (object contributes all fields). */
const tierKeysOf = (tier: unknown): Set<string> => {
  const keys = new Set<string>();
  const add = (v: unknown) => {
    const k = normalizeTierKey(v);
    if (k) keys.add(k);
  };
  if (isRecord(tier)) {
    for (const f of ['tier_number', 'tier_name', 'name', 'id', 'tier', 'key']) add(tier[f]);
  } else {
    add(tier);
  }
  return keys;
};

// ---------------------------------------------------------------------------
// template normalization — never throws
// ---------------------------------------------------------------------------

const chartRows = (raw: Record<string, unknown>): unknown[] => {
  for (const f of CHART_FIELDS) {
    if (Array.isArray(raw[f])) return raw[f] as unknown[];
  }
  return [];
};

const normalizeTierMarkups = (
  raw: Record<string, unknown>,
  warnings: string[],
  rowIdx: number,
): Record<string, number> => {
  const src = firstField(raw, TIER_MAP_FIELDS);
  const out: Record<string, number> = {};
  if (src === undefined) return out;
  if (!isRecord(src)) {
    warnings.push(`break ${rowIdx + 1}: tier_markups is not an object — ignored`);
    return out;
  }
  for (const [k, v] of Object.entries(src)) {
    const n = toFiniteNumber(v);
    if (n === null) {
      warnings.push(`break ${rowIdx + 1}: tier_markups["${k}"] is not a number — dropped`);
      continue;
    }
    out[k] = n;
  }
  return out;
};

const normalizeBreak = (
  raw: unknown,
  index: number,
  warnings: string[],
): NormalizedTemplateBreak | null => {
  if (!isRecord(raw)) {
    warnings.push(`break ${index + 1}: non-object row rejected`);
    return null;
  }
  const qtyField = BREAK_QTY_FIELDS.find((f) => raw[f] !== undefined && raw[f] !== null && raw[f] !== '');
  if (qtyField !== undefined) {
    const q = toFiniteNumber(raw[qtyField]);
    if (q === null || q < 0) {
      warnings.push(`break ${index + 1}: ${qtyField} '${asString(raw[qtyField])}' is not a non-negative number — row rejected`);
      return null;
    }
  }
  const qty = qtyField !== undefined ? num(raw[qtyField]) : 0;

  const tier_markups = normalizeTierMarkups(raw, warnings, index);
  const unit_price = firstFinite(raw, UNIT_PRICE_FIELDS);
  const markup_pct = firstFinite(raw, MARKUP_FIELDS);
  const discount_pct = firstFinite(raw, DISCOUNT_FIELDS);
  const market_retail = firstFinite(raw, RETAIL_FIELDS);
  const market_discount_pct = firstFinite(raw, RETAIL_DISCOUNT_FIELDS);
  const minimum_charge = firstFinite(raw, MIN_CHARGE_FIELDS);

  const hasContent =
    Object.keys(tier_markups).length > 0 ||
    unit_price !== null || markup_pct !== null || discount_pct !== null ||
    market_retail !== null;
  if (!hasContent) {
    warnings.push(`break ${index + 1}: no usable pricing content — row rejected`);
    return null;
  }

  return {
    qty,
    tier_markups,
    unit_price,
    markup_pct,
    discount_pct,
    market_retail,
    market_discount_pct,
    minimum_charge,
    index,
    raw,
  };
};

const templateIsMarketBased = (raw: Record<string, unknown>): boolean => {
  if (raw.market_based === true || lc(raw.market_based) === 'true') return true;
  for (const f of TEMPLATE_MODE_FIELDS) {
    if (MARKET_MODE_TOKENS.has(lc(raw[f]))) return true;
  }
  return false;
};

/**
 * Validate + normalize a PricingTemplate-like row. ALWAYS deterministic —
 * non-record input returns null (callers gate with template!=null), bad
 * breaks are dropped with warnings, surviving rows sort qty-ASC (stable).
 * Idempotent: re-normalizing a normalized row round-trips unchanged.
 */
export function normalizePricingTemplate(raw: unknown): NormalizedPricingTemplate | null {
  if (!isRecord(raw)) return null;
  const warnings: string[] = [];

  const rows = chartRows(raw);
  const breaks: NormalizedTemplateBreak[] = [];
  let rejected = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const b = normalizeBreak(rows[i], i, warnings);
    if (b === null) rejected += 1;
    else breaks.push(b);
  }
  breaks.sort((a, b) => a.qty - b.qty || a.index - b.index);

  const status = asString(raw.status) || 'active';
  return {
    id: asString(raw.id ?? raw.template_id),
    name: asString(raw.name),
    unit_category: asString(raw.unit_category ?? raw.unitCategory),
    breaks,
    market_based: templateIsMarketBased(raw),
    status,
    active: lc(status) !== 'inactive',
    sort: num(raw.sort ?? raw.sort_order),
    description: asString(raw.description),
    unit_price: firstFinite(raw, UNIT_PRICE_FIELDS),
    markup_pct: firstFinite(raw, MARKUP_FIELDS),
    discount_pct: firstFinite(raw, DISCOUNT_FIELDS),
    market_retail: firstFinite(raw, RETAIL_FIELDS),
    market_discount_pct: firstFinite(raw, RETAIL_DISCOUNT_FIELDS),
    minimum_charge: firstFinite(raw, MIN_CHARGE_FIELDS),
    rejected_breaks: rejected,
    warnings,
    raw,
  };
}

// ---------------------------------------------------------------------------
// part -> template link resolution
// ---------------------------------------------------------------------------

export interface TemplateRef {
  /** Raw reference value (id or name) the part carries, '' when embedded-only. */
  ref: string;
  /** Which part field supplied it ('pricing_template_id', 'template', ...). */
  via: string;
  /** Embedded template record on the part, when present. */
  embedded: Record<string, unknown> | null;
}

const recordLooksLikeTemplate = (v: unknown): v is Record<string, unknown> =>
  isRecord(v) &&
  (Array.isArray(v.breaks) || Array.isArray(v.rows) ||
    Array.isArray(v.margin_rows) || Array.isArray(v.brackets) ||
    Array.isArray(v.chart));

/**
 * Extract the part's template reference + any embedded template record.
 * Ref-field precedence (canonical declared field first):
 *   pricing_template_id > template_id > margin_template_id >
 *   pricing_template_name > template_name > scalar pricing_template|template.
 * An embedded record under part.pricing_template|part.template rides along as
 * fallback (registry rows outrank snapshots).
 */
export function templateRefForPart(part: unknown): TemplateRef | null {
  const p = isRecord(part) ? part : null;
  if (!p) return null;

  let embedded: Record<string, unknown> | null = null;
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    if (recordLooksLikeTemplate(p[f])) { embedded = p[f] as Record<string, unknown>; break; }
  }

  for (const f of PART_TEMPLATE_ID_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_NAME_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    const v = p[f];
    if (isRecord(v)) {
      const inner = asString(v.id ?? v.name ?? v.template_id);
      if (inner) return { ref: inner, via: `${f}.id`, embedded: embedded ?? v };
    } else {
      const s = asString(v);
      if (s) return { ref: s, via: f, embedded };
    }
  }
  if (embedded) return { ref: asString(embedded.id ?? embedded.name), via: 'embedded', embedded };
  return null;
}

/** Template record's identity keys for registry matching. */
const templateIds = (t: Record<string, unknown>): Set<string> => {
  const keys = new Set<string>();
  for (const k of [t.id, t.template_id]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};

/**
 * Resolve the part's bound PricingTemplate record from the registry.
 * `templates` accepts a row array, a {rows|templates:[...]} wrapper, or a bare
 * record. Match order: id > name; duplicate names -> active first, then
 * lowest sort, then lowest id (deterministic). A template record is returned
 * regardless of status — resolveTemplatePrice decides usability. Falls back
 * to the part-embedded record when the ref dangles. Returns null when the
 * part declares no resolvable template.
 */
export function templateForPart(
  part: unknown,
  templates: unknown = [],
): Record<string, unknown> | null {
  const ref = templateRefForPart(part);
  if (!ref) return null;

  const list: Record<string, unknown>[] = Array.isArray(templates)
    ? (templates as unknown[]).filter(isRecord)
    : isRecord(templates) && Array.isArray((templates as any).rows)
      ? ((templates as any).rows as unknown[]).filter(isRecord)
      : isRecord(templates) && Array.isArray((templates as any).templates)
        ? ((templates as any).templates as unknown[]).filter(isRecord)
        : isRecord(templates)
          ? [templates as Record<string, unknown>]
          : [];

  const wanted = lc(ref.ref);
  if (wanted) {
    const idHit = list.find((t) => templateIds(t).has(wanted));
    if (idHit) return idHit;
    const nameHits = list.filter((t) => lc(t.name) === wanted);
    if (nameHits.length) {
      nameHits.sort((a, b) => {
        const aAct = lc(a.status ?? 'active') !== 'inactive' ? 0 : 1;
        const bAct = lc(b.status ?? 'active') !== 'inactive' ? 0 : 1;
        return aAct - bAct || num(a.sort) - num(b.sort) ||
          String(a.id ?? '').localeCompare(String(b.id ?? ''));
      });
      return nameHits[0];
    }
  }
  return ref.embedded ?? null;
}

// ---------------------------------------------------------------------------
// bracket price resolution
// ---------------------------------------------------------------------------

interface TierMapHit {
  key: string;
  value: number;
  match: 'exact' | 'default' | 'lone';
}

/** machineCosts tierMarkupsPct parity: exact keys -> 'default' -> '*' -> lone. */
const tierMarkupsHit = (map: Record<string, number>, tierKeys: Set<string>): TierMapHit | null => {
  for (const [k, v] of Object.entries(map)) {
    if (tierKeys.has(lc(k)) && Number.isFinite(Number(v))) {
      return { key: k, value: Number(v), match: 'exact' };
    }
  }
  for (const fallback of ['default', '*']) {
    for (const [k, v] of Object.entries(map)) {
      if (lc(k) === fallback && Number.isFinite(Number(v))) {
        return { key: k, value: Number(v), match: 'default' };
      }
    }
  }
  const entries = Object.entries(map);
  if (entries.length === 1 && Number.isFinite(Number(entries[0][1]))) {
    return { key: entries[0][0], value: Number(entries[0][1]), match: 'lone' };
  }
  return null;
};

interface BracketPrice {
  unit: number;
  pct_source: TemplatePctSource;
  pricing_mode: 'markup' | 'market_based' | 'fixed';
  markup_pct: number | null;
  discount_pct: number | null;
  market_retail: number | null;
  market_discount_pct: number | null;
  matched_tier: { key: string; value: number } | null;
  detail: string;
}

const marketUnit = (retail: number, discountPct: number | null): number =>
  Math.max(0, retail * (1 - num(discountPct) / 100));

/**
 * Resolve ONE bracket's price contribution for the customer tier.
 * Markup charts: tier hit (markup%) > unit_price > markup_pct > discount_pct.
 * Market charts: tier hit (retail $) > row retail > template retail >
 * unit_price > markup_pct > discount_pct. Returns null when the bracket has
 * nothing for this tier/qty point.
 */
const bracketPrice = (
  b: NormalizedTemplateBreak,
  tmpl: NormalizedPricingTemplate,
  tierKeys: Set<string>,
  base: number,
): BracketPrice | null => {
  const tierHit = tierMarkupsHit(b.tier_markups, tierKeys);
  const pct_source: TemplatePctSource | null = tierHit
    ? tierHit.match === 'exact'
      ? 'tier_markups'
      : tierHit.match === 'default'
        ? 'tier_markups_default'
        : 'tier_markups_lone'
    : null;
  const matched_tier = tierHit ? { key: tierHit.key, value: tierHit.value } : null;

  if (tmpl.market_based) {
    // tier_markups value = retail unit price under market_based (engine-
    // defined interpretation; F-27: "no legacy analog"). Retail must be
    // POSITIVE — <=0 counts as absent exactly like marketKind parity.
    if (tierHit && tierHit.value > 0) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(tierHit.value, disc),
        pct_source: pct_source as TemplatePctSource,
        pricing_mode: 'market_based',
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: tierHit.value,
        market_discount_pct: num(disc),
        matched_tier,
        detail: `tier retail ${tierHit.key}`,
      };
    }
    const rowRetail = b.market_retail !== null && b.market_retail > 0 ? b.market_retail : null;
    const tmplRetail = tmpl.market_retail !== null && tmpl.market_retail > 0 ? tmpl.market_retail : null;
    const retail = rowRetail ?? tmplRetail;
    if (retail !== null) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(retail, disc),
        pct_source: 'market_retail',
        pricing_mode: 'market_based',
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: retail,
        market_discount_pct: num(disc),
        matched_tier,
        detail: rowRetail !== null ? 'row market_retail' : 'template market_retail',
      };
    }
    // Market chart falls back to the markup path (F-27 i5 parity): a flat
    // markup/price field on the bracket still prices this tier.
    if (b.markup_pct !== null) {
      return {
        unit: base * (1 + b.markup_pct / 100),
        pct_source: 'markup_pct',
        pricing_mode: 'markup',
        markup_pct: b.markup_pct,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: 'market chart markup fallback',
      };
    }
    if (b.unit_price !== null) {
      return {
        unit: b.unit_price,
        pct_source: 'unit_price',
        pricing_mode: 'fixed',
        markup_pct: null,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: 'bracket unit_price',
      };
    }
    if (b.discount_pct !== null) {
      return {
        unit: Math.max(0, base * (1 - b.discount_pct / 100)),
        pct_source: 'discount_pct',
        pricing_mode: 'market_based',
        markup_pct: null,
        discount_pct: b.discount_pct,
        market_retail: null,
        market_discount_pct: b.discount_pct,
        matched_tier,
        detail: 'market chart discount off base',
      };
    }
    return null;
  }

  // Cost-plus template: tier-scoped markup first, then flat bracket fields.
  if (tierHit) {
    return {
      unit: base * (1 + tierHit.value / 100),
      pct_source: pct_source as TemplatePctSource,
      pricing_mode: 'markup',
      markup_pct: tierHit.value,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: `tier markup ${tierHit.key}=${tierHit.value}`,
    };
  }
  if (b.unit_price !== null) {
    return {
      unit: b.unit_price,
      pct_source: 'unit_price',
      pricing_mode: 'fixed',
      markup_pct: null,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: 'bracket unit_price',
    };
  }
  if (b.markup_pct !== null) {
    return {
      unit: base * (1 + b.markup_pct / 100),
      pct_source: 'markup_pct',
      pricing_mode: 'markup',
      markup_pct: b.markup_pct,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: 'bracket markup_pct',
    };
  }
  if (b.discount_pct !== null) {
    return {
      unit: Math.max(0, base * (1 - b.discount_pct / 100)),
      pct_source: 'discount_pct',
      pricing_mode: 'markup',
      markup_pct: null,
      discount_pct: b.discount_pct,
      market_retail: null,
      market_discount_pct: b.discount_pct,
      matched_tier,
      detail: 'bracket discount off base',
    };
  }
  return null;
};

/** Highest qualifying bracket that resolves a price for this tier, or null. */
const pickTemplateBreak = (
  tmpl: NormalizedPricingTemplate,
  qty: number,
  tierKeys: Set<string>,
  base: number,
): { bracket: NormalizedTemplateBreak; price: BracketPrice } | null => {
  let pick: { bracket: NormalizedTemplateBreak; price: BracketPrice } | null = null;
  for (const b of tmpl.breaks) {
    if (b.qty > qty) continue;             // sorted ASC — keeps scanning safe
    const price = bracketPrice(b, tmpl, tierKeys, base);
    if (price === null) continue;          // can't price this tier -> not eligible
    // `>=` never fires (qty-ASC + first-declared tie order), `>` stands.
    if (!pick || b.qty > pick.bracket.qty) pick = { bracket: b, price };
  }
  return pick;
};

// ---------------------------------------------------------------------------
// GlobalPricingTier linked-set fallback (tolerated-extra link fields)
// ---------------------------------------------------------------------------

const isRuleSet = (v: unknown): v is Record<string, unknown> =>
  isRecord(v) && Array.isArray(v.rules);

const ruleSetIds = (set: Record<string, unknown>): Set<string> => {
  const keys = new Set<string>();
  for (const k of [set.id, set.name]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};

const partTierSetRefs = (part: Record<string, unknown>): string[] => {
  const refs: string[] = [];
  for (const f of [...PART_TIER_SET_FIELDS, ...PART_TIER_SET_NAME_FIELDS]) {
    const v = asString(part[f]);
    if (v) refs.push(v);
  }
  return refs;
};

/**
 * Part-linked GlobalPricingTier rule sets consulted when the template can't
 * price. Only sets the part explicitly links (id or name) are eligible —
 * scanning every supplied set would let unrelated registries reprice parts.
 * First rule (in part-link order, then set order) pinning a customer key with
 * a finite markup_pct wins; market_based rules with no markup contribute
 * nothing (F-27 i5 parity — the markup path takes over).
 */
const tierRuleSetHit = (
  part: Record<string, unknown>,
  ruleSets: Record<string, unknown>[],
  tierKeys: Set<string>,
  base: number,
): { unit: number; markup_pct: number; set: Record<string, unknown>; rule: Record<string, unknown> } | null => {
  const refs = partTierSetRefs(part).map(lc);
  if (!refs.length) return null;
  for (const wanted of refs) {
    for (const set of ruleSets) {
      if (lc(set.status ?? 'active') === 'inactive') continue;
      if (!ruleSetIds(set).has(wanted)) continue;
      for (const rule of Array.isArray(set.rules) ? set.rules : []) {
        if (!isRecord(rule)) continue;
        const pin = lc(rule.tier ?? rule.customer_tier);
        const pinned = pin && (tierKeys.has(pin) || pin === '*' || pin === 'default');
        if (!pinned) continue;
        const pct = toFiniteNumber(rule.markup_pct);
        if (pct === null) continue;      // market_based-only rule -> no markup
        return {
          unit: base * (1 + pct / 100),
          markup_pct: pct,
          set,
          rule,
        };
      }
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// part-carried fallback charts (engine overrideRule vocabulary)
// ---------------------------------------------------------------------------

const partChartBreaks = (part: Record<string, unknown>): unknown[] => {
  for (const f of PART_BREAK_FIELDS) {
    if (Array.isArray(part[f])) return part[f] as unknown[];
  }
  return [];
};

/** Engine pickUnitBreak parity: highest qualifying qty (>0) w/ finite unit_price. */
const pickPartUnitBreak = (breaks: unknown[], qty: number): Record<string, unknown> | null => {
  let pick: Record<string, unknown> | null = null;
  for (const b of breaks) {
    if (!isRecord(b)) continue;
    const bq = num(b.qty ?? b.min_qty ?? b.quantity, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > qty) continue;
    if (!Number.isFinite(Number(b.unit_price ?? b.price))) continue;
    if (!pick || bq > num(pick.qty ?? pick.min_qty ?? pick.quantity)) pick = b;
  }
  return pick;
};

// ---------------------------------------------------------------------------
// resolveTemplatePrice
// ---------------------------------------------------------------------------

/**
 * Resolve the price for one part line under its bound PricingTemplate.
 *
 * input:
 *   part                  part record (pricing_template_id link lives here)
 *   qty | quantity        order qty in pricing units
 *   base_price | unit_cost | cost | costBase   unit cost base the chart marks up
 *   templates             PricingTemplate registry rows (array | {rows} | record)
 *   tiers                 customer-tier context: a bare tier value, OR an array
 *                         mixing MarkupTier-like catalog rows (key expansion)
 *                         and GlobalPricingTier-like rule sets ({rules:[]})
 *   tier | customer_tier | customerTier   explicit customer tier value
 *   template              caller pre-resolved template record (wins over refs)
 *   default_markup_pct | defaultMarkupPct   shop fallback percent
 *   minimum_charge | minimumCharge          caller-side extension floor
 *
 * Never throws; non-finite input coerces to 0. Result carries the winning
 * `source`, the precedence `chain` walked, the winning `tier_row` bracket and
 * enough echo (template_id/matched_tier/markup_pct/...) for audit trails.
 */
export function resolveTemplatePrice(input: any = {}): TemplatePriceResult {
  const args = isRecord(input) ? input : {};
  const part = isRecord(args.part) ? args.part : {};
  const qty = num(args.qty ?? args.quantity);
  const base = num(firstField(args, ['base_price', 'basePrice', 'unit_cost', 'unitCost', 'cost', 'costBase', 'cost_base']) ?? 0);
  const warnings: string[] = [];

  // --- customer tier key set -------------------------------------------------
  const tierValue = firstField(args, ['tier', 'customer_tier', 'customerTier']);
  const tiersArg = args.tiers;
  const tierCatalog: unknown[] = Array.isArray(tiersArg) ? tiersArg : [];
  const bareTier = tierValue ?? (!Array.isArray(tiersArg) && !isRecord(tiersArg) ? tiersArg : null);
  const tierKeys = tierKeysOf(
    bareTier !== null && bareTier !== undefined ? bareTier : (isRecord(tiersArg) ? tiersArg : null),
  );
  // Expand keys through MarkupTier-like catalog rows (a '2' customer picks up
  // the catalog row's tier_name/id/... keys — tierKeysOf union, engine parity).
  for (const row of tierCatalog) {
    if (!isRecord(row) || isRuleSet(row)) continue;
    const rowKeys = tierKeysOf(row);
    let shared = false;
    for (const k of rowKeys) if (tierKeys.has(k)) { shared = true; break; }
    if (shared) for (const k of rowKeys) tierKeys.add(k);
  }
  const ruleSets = tierCatalog.filter(isRuleSet);

  // --- template resolution ---------------------------------------------------
  const ref = templateRefForPart(part);
  const templatePool: unknown[] = Array.isArray(args.templates)
    ? args.templates
    : isRecord(args.templates) && Array.isArray((args.templates as any).rows)
      ? (args.templates as any).rows
      : isRecord(args.templates) && Array.isArray((args.templates as any).templates)
        ? (args.templates as any).templates
        : isRecord(args.templates)
          ? [args.templates]
          : [];

  let rawTemplate: Record<string, unknown> | null = null;
  let templateVia = '';
  if (isRecord(args.template)) {
    rawTemplate = args.template;
    templateVia = 'opts.template';
  } else if (args.template !== undefined && args.template !== null && asString(args.template)) {
    // Caller's template ref resolved against the same pool.
    const wanted = lc(args.template);
    rawTemplate = templatePool.filter(isRecord).find(
      (t) => templateIds(t).has(wanted) || lc(t.name) === wanted,
    ) ?? null;
    templateVia = 'opts.template';
  } else if (ref) {
    rawTemplate = templateForPart(part, templatePool);
    templateVia = ref.via;
  }
  const tmpl = rawTemplate ? normalizePricingTemplate(rawTemplate) : null;
  if (tmpl) warnings.push(...tmpl.warnings);
  const templateId = tmpl ? (tmpl.id || asString((rawTemplate as any)?.name) || asString(ref?.ref)) : null;

  // --- part unit gate ----------------------------------------------------------
  const partUnit = lc(firstField(part, PART_UNIT_FIELDS));
  const unitCategory = tmpl ? lc(tmpl.unit_category) : '';
  const unitMismatch = !!tmpl && !!unitCategory && !!partUnit && partUnit !== unitCategory;
  const unitUnverified = !!tmpl && !!unitCategory && !partUnit;

  // --- precedence walk ---------------------------------------------------------
  // Engine resolveTier-trace parity: EVERY layer is evaluated and recorded —
  // `hit` marks what the layer could resolve, `won` marks the first hit (the
  // layer that actually priced the line). Exactly one won:true per result.
  const chain: TemplatePriceResult['chain'] = [];
  let won = false;
  const record = (layer: string, hit: boolean, detail: string) =>
    chain.push({ layer, hit, won: false, detail });
  const markWon = () => { chain[chain.length - 1].won = true; won = true; };
  /** Apply this layer's outputs only while nothing has won yet. */
  const take = (fn: () => void) => { if (!won) fn(); };

  let unit: number | null = null;
  let source: TemplatePriceSource = 'cost_passthrough';
  let pctSource: TemplatePriceResult['pct_source'] = null;
  let pricingMode: TemplatePriceResult['pricing_mode'] = 'cost_passthrough';
  let tierRow: NormalizedTemplateBreak | null = null;
  let matchedTier: { key: string; value: number } | null = null;
  let markupPct: number | null = null;
  let discountPct: number | null = null;
  let marketRetail: number | null = null;
  let marketDiscountPct: number | null = null;
  let reason: TemplatePriceResult['reason'] = null;
  let breakMinCharge: number | null = null;
  let applied = false;

  // 1. part_fixed — pinned sell price outranks every chart (engine ladder).
  const fixed = scopedFinite(part, PART_FIXED_FIELDS);
  if (fixed !== null && fixed > 0) {
    record('part_fixed', true, `fixed_price ${fixed}`);
    take(() => {
      markWon();
      unit = fixed;
      source = 'part_fixed';
      pctSource = 'fixed_price';
      pricingMode = 'fixed';
      reason = 'fixed_price';
    });
  } else {
    record('part_fixed', false, fixed !== null ? 'fixed_price not positive' : 'no fixed price');
  }

  // 2. template — bound chart resolution.
  {
    let layerReason: TemplatePriceResult['reason'] = null;
    if (!ref && !rawTemplate) layerReason = 'no_template_ref';
    else if (!tmpl) layerReason = 'template_not_found';
    else if (!tmpl.active) layerReason = 'template_inactive';
    else if (unitMismatch) layerReason = 'unit_category_mismatch';
    else if (qty <= 0) layerReason = 'qty_not_positive';

    if (layerReason) {
      record('template', false, layerReason);
      reason = reason ?? layerReason;
    } else {
      const pick = pickTemplateBreak(tmpl as NormalizedPricingTemplate, qty, tierKeys, base);
      if (pick) {
        record('template', true,
          `bracket qty>=${pick.bracket.qty} via ${pick.price.pct_source}${templateVia ? ` [${templateVia}]` : ''}`);
        take(() => {
          markWon();
          applied = true;
          source = 'template';
          pctSource = pick.price.pct_source;
          pricingMode = pick.price.pricing_mode === 'fixed' ? 'fixed'
            : pick.price.pricing_mode === 'market_based' ? 'market_based' : 'markup';
          unit = pick.price.unit;
          tierRow = pick.bracket;
          matchedTier = pick.price.matched_tier;
          markupPct = pick.price.markup_pct;
          discountPct = pick.price.discount_pct;
          marketRetail = pick.price.market_retail;
          marketDiscountPct = pick.price.market_discount_pct;
          breakMinCharge = pick.bracket.minimum_charge;
        });
      } else {
        // Chart-level flat default (machineCosts chart_default parity).
        const t = tmpl as NormalizedPricingTemplate;
        const flat = bracketPrice(
          {
            qty: 0, tier_markups: {}, unit_price: t.unit_price,
            markup_pct: t.markup_pct, discount_pct: t.discount_pct,
            market_retail: t.market_retail, market_discount_pct: t.market_discount_pct,
            minimum_charge: null, index: -1, raw: t.raw,
          },
          t, tierKeys, base,
        );
        if (flat) {
          record('template', true, `template_default ${flat.pct_source}${templateVia ? ` [${templateVia}]` : ''}`);
          take(() => {
            markWon();
            applied = true;
            source = 'template';
            pctSource = 'template_default';
            pricingMode = flat.pricing_mode === 'fixed' ? 'fixed'
              : flat.pricing_mode === 'market_based' ? 'market_based' : 'markup';
            unit = flat.unit;
            matchedTier = flat.matched_tier;
            markupPct = flat.markup_pct;
            discountPct = flat.discount_pct;
            marketRetail = flat.market_retail;
            marketDiscountPct = flat.market_discount_pct;
          });
        } else {
          record('template', false, 'no_qualifying_break');
          reason = reason ?? 'no_qualifying_break';
        }
      }
    }
  }

  // 3. tier_rule_set — part-linked GlobalPricingTier chart rescue.
  {
    const hit = tierRuleSetHit(part, ruleSets, tierKeys, base);
    if (hit) {
      record('tier_rule_set', true, `rule tier ${asString(hit.rule.tier ?? hit.rule.customer_tier)} -> ${hit.markup_pct}%`);
      take(() => {
        markWon();
        source = 'tier_rule_set';
        pctSource = 'tier_rule_set';
        pricingMode = 'markup';
        unit = hit.unit;
        markupPct = hit.markup_pct;
      });
    } else {
      record('tier_rule_set', false, partTierSetRefs(part).length ? 'no matching rule' : 'no linked rule set');
    }
  }

  // 4. part_chart — the part's own unit-price qty chart.
  {
    const brk = pickPartUnitBreak(partChartBreaks(part), qty);
    if (brk) {
      const price = num(brk.unit_price ?? brk.price);
      record('part_chart', true, `per_unit_breaks qty>=${num(brk.qty ?? brk.min_qty ?? brk.quantity)} -> ${price}`);
      take(() => {
        markWon();
        source = 'part_chart';
        pctSource = 'part_chart';
        pricingMode = 'fixed';
        unit = price;
      });
    } else {
      record('part_chart', false, 'no qualifying part break');
    }
  }

  // 5. part_market — part-level retail-minus-discount.
  {
    const retail = scopedFinite(part, PART_MARKET_RETAIL_FIELDS);
    if (retail !== null && retail > 0) {
      const disc = scopedFinite(part, PART_MARKET_DISCOUNT_FIELDS) ?? 0;
      record('part_market', true, `market_retail ${retail} - ${disc}%`);
      take(() => {
        markWon();
        source = 'part_market';
        pctSource = 'market_retail';
        pricingMode = 'market_based';
        unit = marketUnit(retail, disc);
        marketRetail = retail;
        marketDiscountPct = disc;
        discountPct = disc;
      });
    } else {
      record('part_market', false, 'no positive market_retail');
    }
  }

  // 6. default_markup — part markup, then the shop fallback percent.
  {
    const partMarkup = scopedFinite(part, PART_MARKUP_FIELDS);
    const shopDefault = toFiniteNumber(args.default_markup_pct ?? args.defaultMarkupPct);
    if (partMarkup !== null && partMarkup !== 0) {
      record('default_markup', true, `part.markup_pct ${partMarkup}`);
      take(() => {
        markWon();
        source = 'default_markup';
        pctSource = 'markup_pct';
        pricingMode = 'markup';
        unit = base * (1 + partMarkup / 100);
        markupPct = partMarkup;
      });
    } else if (shopDefault !== null) {
      record('default_markup', true, `default_markup_pct ${shopDefault}`);
      take(() => {
        markWon();
        source = 'default_markup';
        pctSource = 'fallback';
        pricingMode = 'default_markup';
        unit = base * (1 + shopDefault / 100);
        markupPct = shopDefault;
      });
    } else {
      record('default_markup', false, 'no finite fallback percent');
    }
  }

  // 7. cost_passthrough — always present as the floor; the caller's own
  // default chain still applies underneath (engine tierRules untouched).
  {
    record('cost_passthrough', true, 'unit = base_price');
    take(() => {
      markWon();
      source = 'cost_passthrough';
      pricingMode = 'cost_passthrough';
      unit = base;
    });
  }

  const unitPrice = num(unit);
  const extension = round2(unitPrice * qty);

  // Minimum-charge floor: highest finite candidate wins (engine parity).
  const minCandidates = [
    breakMinCharge,
    tmpl?.minimum_charge ?? null,
    scopedFinite(part, PART_MIN_CHARGE_FIELDS),
    toFiniteNumber(args.minimum_charge ?? args.minimumCharge),
  ];
  let minimumCharge = 0;
  for (const c of minCandidates) {
    if (c !== null && c > minimumCharge) minimumCharge = c;
  }
  const minimumApplied = minimumCharge > 0 && extension > 0 && extension < minimumCharge;
  const extended = minimumApplied ? round2(minimumCharge) : extension;

  return {
    applied,
    template_id: templateId,
    template_name: tmpl?.name ?? '',
    template: tmpl,
    source,
    pct_source: pctSource,
    pricing_mode: pricingMode,
    qty,
    base_price: base,
    unit_price: round4(unitPrice),
    extended,
    tier_row: tierRow,
    bracket_min_qty: tierRow ? tierRow.qty : null,
    matched_tier: matchedTier,
    markup_pct: markupPct,
    discount_pct: discountPct,
    market_retail: marketRetail,
    market_discount_pct: marketDiscountPct,
    minimum_charge: minimumCharge,
    minimum_applied: minimumApplied,
    reason,
    chain,
    unit_unverified: unitUnverified,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// engine adapter (wiring spec — Option A, zero pricingEngine changes)
// ---------------------------------------------------------------------------

/** Part chart/reference fields a resolved template supersedes. */
const TEMPLATE_SUPERSEDED_FIELDS = [
  'tier_ref', 'tier', 'tier_name',
  'per_unit_breaks', 'unit_breaks', 'qty_breaks',
  'market_retail', 'retail', 'retail_price', 'list_price',
  'market_discount_pct', 'market_based', 'pricing_mode', 'price_mode',
  'markup_pct', 'markup', 'markup_percent', 'discount_pct',
] as const;

/**
 * Fold a resolveTemplatePrice result into a pricingEngine `part` descriptor.
 * When the template priced the line, the part's own chart fields are stripped
 * (the template supersedes them — CoreBridge part/template exclusivity) and
 * the resolved value is re-expressed in overrideRule's vocabulary:
 *   markup hit      -> {markup_pct: resolved pct}  (pct===0 pins the unit price
 *                      via a qty-break instead — overrideRule ignores 0 markups)
 *   discount hit    -> {markup_pct: -discount_pct} (cost x (1 - d/100) parity)
 *   market hit      -> {pricing_mode:'market_based', market_retail,
 *                       market_discount_pct}
 *   fixed/break hit -> {per_unit_breaks:[{qty: order qty, unit_price}]}
 * The descriptor is SINGLE-SHOT — it encodes the resolution for the qty it was
 * built with; rebuild per line (a reused pin must not freeze another qty's
 * bracket pick). `minimumCharge`/`modifiers` still flow through pricePart
 * untouched; res.applied === false returns `part` VERBATIM (the engine's own
 * default chain prices it — template misses must not mask part config).
 */
export function templatePartDescriptor(part: unknown, resolution: TemplatePriceResult | null | undefined): any {
  const p = isRecord(part) ? { ...part } : {};
  if (!resolution || !resolution.applied) return part;
  for (const f of TEMPLATE_SUPERSEDED_FIELDS) delete (p as any)[f];
  const pinUnit = () => {
    (p as any).per_unit_breaks = [{ qty: resolution.qty || 1, unit_price: resolution.unit_price }];
  };
  switch (resolution.pricing_mode) {
    case 'market_based':
      if (resolution.pct_source === 'discount_pct' && resolution.market_retail === null) {
        // Discount was already folded into unit_price off base_price — re-
        // expressing it as market_retail+discount_pct would double-discount.
        if (resolution.discount_pct !== null && resolution.discount_pct !== 0) {
          (p as any).markup_pct = -resolution.discount_pct;
        } else {
          pinUnit();
        }
      } else {
        (p as any).pricing_mode = 'market_based';
        (p as any).market_retail = resolution.market_retail ?? resolution.unit_price;
        (p as any).market_discount_pct = resolution.market_discount_pct ?? resolution.discount_pct ?? 0;
      }
      break;
    case 'fixed':
      pinUnit();
      break;
    case 'markup':
    default:
      if (resolution.pct_source === 'discount_pct' && resolution.discount_pct !== null) {
        // cost x (1 - d/100) expressed as a negative markup; 0 falls to the pin.
        if (resolution.discount_pct !== 0) (p as any).markup_pct = -resolution.discount_pct;
        else pinUnit();
      } else if (resolution.markup_pct !== null && resolution.markup_pct !== 0) {
        (p as any).markup_pct = resolution.markup_pct;
      } else {
        pinUnit(); // markup_pct 0 = "sell at cost" — pin so overrideRule honors it
      }
      break;
  }
  return p;
}
