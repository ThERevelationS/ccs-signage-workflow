// Brick & Stone module pricing-engine wire (ESTIMATOR_MASTERPLAN F-23c) —
// pure TS, ZERO imports, NO IO. Bundles clean for Deno base44 functions and
// the Vite frontend (frontend-shared-modules allowlist).
//
// What this does: the brick module's COST math (estimator/brick/brickCalc.js
// calcBrickStoneProject — material_cost + mortar_cost + labor_cost -> subtotal
// -> markup_amount -> total_cost) stays authoritative. This wire only
// re-prices the SELL side of brick projects that carry an engine context
// block or component-scoped pricing config. The engine is INJECTED by the
// caller ({ pricePart, resolveTemplatePrice, templatePartDescriptor } from
// base44/shared/pricingEngine.ts + pricingTemplateModel.ts) so this file
// stays import-free per shared-model convention.
//
// ---------------------------------------------------------------------------
// ZERO-REGRESSION CONTRACT
// ---------------------------------------------------------------------------
// A BrickStoneProject record carrying no engine-vocab config resolves
// { applied:false, passthrough:true, customer_price === baselineSell } — the
// caller returns the module's own sell price VERBATIM (byte-identical, no
// float ops, at the customerPricing.sourceProjectEconomics seam). The record's
// own cost/rate/geometry fields (material_cost, mortar_cost, labor_cost,
// subtotal, markup_amount, markup_percent, mortar_bag_cost, bricks_per_hour,
// labor_rate_per_hour, waste_factor, mortar_gap, calculated_*, derived dims)
// are COST-side inputs — they are never scanned for engine config (reading
// them would mark every saved record "configured": markup_percent is the
// percent that produced markup_amount, so it only feeds the engine as the
// DEFAULT markup, exactly like the vinyl wire). A legacy saved
// customer_pricing Markup-Tier snapshot alone never engages — it only feeds
// the context block as the weakest customer-tier hint.
//
// ---------------------------------------------------------------------------
// Entity contract — BrickStoneProject.jsonc (module key 'brick_stone')
// ---------------------------------------------------------------------------
//   material_cost, mortar_cost, labor_cost, labor_hours,
//   mortar_bags_needed, calculated_bricks, calculated_surface_area,
//   subtotal, markup_amount, markup_percent, total_cost,
//   customer_pricing {applied, tier_number, tier_name, total, lines[] — the
//   saved Markup-Tier snapshot; never carries engine_context/pricing_engine}
//
//   Sum invariant: material_cost + mortar_cost + labor_cost == subtotal
//   (brickCalc.js) == the internalCost basis sourceProjectEconomics computes.
//
// Cost-line projection (brickCostLines) — granular mirror of
// categorizeBrickStoneProject (projectCategorizer.jsx): the categorizer rolls
// material_cost + mortar_cost into one 'outsourced_fab' materials line and
// labor_cost into 'outsourced_services'; the wire keeps per-component
// granularity so component-scoped config prices on its own:
//   'material'  cost=material_cost  qty=calculated_bricks   cat outsourced_fab
//   'mortar'    cost=mortar_cost    qty=mortar_bags_needed  cat outsourced_fab
//   'labor'     cost=labor_cost     qty=labor_hours         cat outsourced_services
// A component produces a line only when its cost field is FINITE (a present
// zero is a real line; absent/non-numeric drops the slot — a brand-new record
// with no computed costs yields no lines). qty honors an explicit 0
// (extension 0 — engine minimums never fire on extension <= 0, same as the
// vinyl wire); absent/non-finite qty fields fall back to 1, which keeps
// markup math identical because unitCost*qty == cost either way.
//
// ---------------------------------------------------------------------------
// Activation contract — what counts as engine config on a brick record
// ---------------------------------------------------------------------------
// 1. CONTEXT BLOCK (project-wide engagement — channel-wire parity):
//    record.pricing_engine | engine_pricing | pricing_tier_config |
//    pricing_context | engine_context, or
//    customer_pricing.engine_context | customer_pricing.pricing_engine.
//    Present-as-object => EVERY component line runs through the engine;
//    component descriptors override where present and unconfigured lines
//    price via the context chart / defaultMarkupPct (which defaults to
//    record.markup_percent — the same percent that produced the baseline
//    tail, so an unconfigured line lands back on its own baseline).
// 2. COMPONENT-SCOPED LINE CONFIG (no context block): only the configured
//    component reprices; every other component keeps its exact baseline
//    contribution. Descriptor merge per line key K in {material,mortar,labor}
//    (weakest -> strongest):
//      a. flat prefixed record fields   `${K}_<engineField>`
//         (labor_markup_pct, material_fixed_price, mortar_tier_ref,
//          material_market_retail, labor_pricing_template_id, ...)
//      b. an inline descriptor carried on an explicit input.lines[] row
//      c. context-block line map        block.items|lines|line_config|
//                                       item_config[K] (numeric index ok)
//      d. nested component blocks       ${K}_pricing | ${K}_price_config |
//                                       ${K}_engine_pricing |
//                                       ${K}_pricing_config |
//                                       ${K}_engine_price |
//                                       ${K}_tier_config | ${K}_sell_pricing
//    A top-level record.pricing|part|... descriptor is deliberately NOT
//    scanned — a flat aggregate record has no unambiguous line owner for a
//    pinned unit price, and scanning raw record fields would trip on legacy
//    cost fields.
//
// Engine vocabulary inside a descriptor (else it is NOT config -> the line
// passes through at baseline):
//   fixed_price|price_override|override_price|flat_price   >0 pinned unit sell
//   tier_ref|tier_ref_id|pricing_tier_ref|bound_tier|tier|tier_name
//   per_unit_breaks|unit_breaks|qty_breaks                 qty chart
//   pricing_template_id|template_id|margin_template_id|
//     pricing_template_name|template_name|pricing_template|template
//   global_pricing_tier_id|pricing_tier_id|tier_set_id|pricing_tier_set_id|
//     pricing_rule_set_id|global_tier_id|global_pricing_tier_name|
//     pricing_tier_name|tier_set_name                      tier-set refs
//   market_retail|retail|retail_price|list_price           >0 market retail
//   market_discount_pct|retail_discount_pct
//   markup_pct|markup|markup_percent                       nonzero only
//   minimum_charge|min_charge|minimum|setup_fee_floor      extension floor
//   setup_fee|setupFee|setup_fee_flat                      flat sell fee
//   formula_modifiers|modifiers                            ordered unit-price ops
//   pricing_mode|price_mode|mode|active_mode               RECOGNIZED tokens
//     only ('market','market_based','market-based','retail',
//     'retail_minus_discount','fixed','fixed_price','flat','cost_plus',
//     'cost-plus','costplus','markup','tier','tier_markup','tiered') —
//     brick unit enums like 'per_brick'/'per_bag'/'per_hour' are NOT config
//   machine|machine_override|machine_pricing|equipment_pricing
//     (counts only when the descriptor itself carries engine fields)
//   customer_tier|customerTier                             line-scoped tier pin
//   tier_rules|tierRules|rules|matrix|matrix_rows|rows|pricing_matrix
//   templates|pricing_templates | tiers|tier_catalog|markup_tiers
//                                                          embedded registries
//   interpolate_breaks|interpolateBreaks|interpolate|
//     break_interpolation                                  qty-chart interpolation
//
// Caller-supplied `context` registries (tierRules, templates, tiers,
// customerTier, defaultMarkupPct, now) merge OVER the record-embedded block
// but never constitute engagement by themselves — engagement requires a
// record-carried context block or component-scoped config.
//
// Composition (vinyl remainder model — the module markup is linear over the
// aggregate subtotal, so each priced line's baseline contribution is exactly
// lineCost * (1 + markupPct/100)):
//   remainder      = baselineSell - Σ pricedLineCost * (1 + markupPct/100)
//   customer_price = round2(remainder + Σ pricedLine.subtotal)
// When a context block prices every line the remainder lands at ~0 and the
// engine owns the whole sell tail — including winning over a legacy saved
// customer_pricing snapshot (recorded in chain).
//
// The whole pipeline never throws; every step is echoed in `chain` and
// `warnings` for transparency. Configured lines without a finite cost base
// (possible only via an explicit input.lines[] override — brickCostLines only
// emits finite-cost components) are SKIPPED at baseline, never repriced blind.
//
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

const lc = (v: unknown): string => asString(v).toLowerCase();

const toFiniteNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = (v: unknown, fallback = 0): number => toFiniteNumber(v) ?? fallback;

const firstField = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): unknown => {
  if (!rec) return undefined;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const firstFinite = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): number | null => {
  const v = firstField(rec, fields);
  const n = toFiniteNumber(v);
  return n === null ? null : n;
};

const firstArray = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): unknown[] | null => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f] as unknown[];
  }
  return null;
};

const firstRecord = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): Record<string, unknown> | null => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord(rec[f])) return rec[f] as Record<string, unknown>;
  }
  return null;
};

const round2 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// field vocabularies
// ---------------------------------------------------------------------------

/** Module keys the brick record answers to (moduleRegistry key first). */
export const BRICK_MODULE_KEYS = Object.freeze([
  'brick_stone', 'brick', 'brickstone', 'brick_stone_project', 'masonry',
] as const);

/**
 * The three module-authored cost components (brickCalc.js aggregation;
 * category keys mirror categorizeBrickStoneProject).
 */
const BRICK_COMPONENTS = [
  {
    key: 'material',
    label: 'Brick / Stone Material',
    costFields: ['material_cost', 'materials_cost'],
    qtyFields: ['calculated_bricks', 'brick_count'],
    category_key: 'outsourced_fab',
  },
  {
    key: 'mortar',
    label: 'Mortar',
    costFields: ['mortar_cost'],
    qtyFields: ['mortar_bags_needed', 'mortar_bags'],
    category_key: 'outsourced_fab',
  },
  {
    key: 'labor',
    label: 'Masonry Labor',
    costFields: ['labor_cost'],
    qtyFields: ['labor_hours'],
    category_key: 'outsourced_services',
  },
] as const;

export const BRICK_COMPONENT_KEYS: readonly string[] = Object.freeze(
  BRICK_COMPONENTS.map((c) => c.key),
);

/** Record-level fields probed for the engine context block (in order). */
const CONTEXT_BLOCK_FIELDS = [
  'pricing_engine', 'engine_pricing', 'pricing_tier_config', 'pricing_context', 'engine_context',
] as const;

/** customer_pricing sub-fields also probed (saved tier snapshot block). */
const NESTED_CONTEXT_FIELDS = ['engine_context', 'pricing_engine'] as const;

/** Map inside the context block keyed by component key -> part descriptor. */
const ENGINE_LINE_MAP_FIELDS = ['items', 'lines', 'line_config', 'item_config'] as const;

/** Per-component nested descriptor spellings: `${key}_<suffix>`. */
const COMPONENT_BLOCK_SUFFIXES = [
  'pricing', 'price_config', 'engine_pricing', 'pricing_config',
  'engine_price', 'tier_config', 'sell_pricing',
] as const;

/** Recognized pricing-mode tokens (channel-wire superset — unit enums excluded). */
const ENGINE_MODE_TOKENS = new Set([
  'market', 'market_based', 'market-based', 'retail', 'retail_minus_discount',
  'fixed', 'fixed_price', 'flat',
  'cost_plus', 'cost-plus', 'costplus', 'markup', 'tier', 'tier_markup', 'tiered',
]);

const FIXED_FIELDS = ['fixed_price', 'price_override', 'override_price', 'flat_price'] as const;
const TIER_REF_FIELDS = ['tier_ref', 'tier_ref_id', 'pricing_tier_ref', 'bound_tier', 'tier', 'tier_name'] as const;
const BREAK_FIELDS = ['per_unit_breaks', 'unit_breaks', 'qty_breaks'] as const;
const TEMPLATE_REF_FIELDS = [
  'pricing_template_id', 'template_id', 'margin_template_id',
  'pricing_template_name', 'template_name', 'pricing_template', 'template',
] as const;
const TIER_SET_FIELDS = [
  'global_pricing_tier_id', 'pricing_tier_id', 'tier_set_id', 'pricing_tier_set_id',
  'pricing_rule_set_id', 'global_tier_id', 'global_pricing_tier_name',
  'pricing_tier_name', 'tier_set_name',
] as const;
const MARKET_FIELDS = ['market_retail', 'retail', 'retail_price', 'list_price'] as const;
const MARKET_DISCOUNT_FIELDS = ['market_discount_pct', 'retail_discount_pct'] as const;
const MARKUP_FIELDS = ['markup_pct', 'markup', 'markup_percent'] as const;
const MIN_FIELDS = ['minimum_charge', 'min_charge', 'minimum', 'setup_fee_floor'] as const;
const SETUP_FIELDS = ['setup_fee', 'setupFee', 'setup_fee_flat'] as const;
const FORMULA_FIELDS = ['formula_modifiers', 'modifiers'] as const;
const MODE_FIELDS = ['pricing_mode', 'price_mode', 'mode', 'active_mode'] as const;
const MACHINE_FIELDS = ['machine', 'machine_override', 'machine_pricing', 'equipment_pricing'] as const;
const TIER_CONTEXT_FIELDS = ['customer_tier', 'customerTier'] as const;
const EMBEDDED_RULE_FIELDS = ['tier_rules', 'tierRules', 'tier_matrix', 'rules', 'matrix', 'matrix_rows', 'rows', 'pricing_matrix'] as const;
const EMBEDDED_TEMPLATE_FIELDS = ['templates', 'pricing_templates'] as const;
const EMBEDDED_TIER_CATALOG_FIELDS = ['tiers', 'tier_catalog', 'markup_tiers'] as const;
const UNIT_FIELDS = ['unit', 'pricing_unit', 'pricingUnit', 'uom', 'unit_of_measure', 'unit_category'] as const;
const TAX_PCT_FIELDS = ['tax_percent', 'taxPercent'] as const;
const INTERPOLATE_FIELDS = ['interpolate_breaks', 'interpolateBreaks', 'interpolate', 'break_interpolation'] as const;
const DEFAULT_MARKUP_FIELDS = ['default_markup_pct', 'defaultMarkupPct', 'default_markup'] as const;

/**
 * Flat per-component engine spellings — on the record these ride the
 * `<component>_<field>` prefix; inside a nested/inline descriptor they are
 * the bare field names. Presence alone does not mark a line configured —
 * see descriptorHasPricingContent.
 */
export const BRICK_ENGINE_LINE_FIELDS: readonly string[] = Object.freeze([
  ...FIXED_FIELDS,
  ...TIER_REF_FIELDS,
  ...BREAK_FIELDS,
  ...TEMPLATE_REF_FIELDS,
  ...TIER_SET_FIELDS,
  ...MARKET_FIELDS,
  ...MARKET_DISCOUNT_FIELDS,
  ...MARKUP_FIELDS,
  ...MIN_FIELDS,
  ...SETUP_FIELDS,
  ...FORMULA_FIELDS,
  ...MODE_FIELDS,
  ...MACHINE_FIELDS,
  ...TIER_CONTEXT_FIELDS,
  ...EMBEDDED_RULE_FIELDS,
  ...EMBEDDED_TEMPLATE_FIELDS,
  ...EMBEDDED_TIER_CATALOG_FIELDS,
  ...UNIT_FIELDS,
  ...TAX_PCT_FIELDS,
  ...INTERPOLATE_FIELDS,
  'taxable',
]);

// ---------------------------------------------------------------------------
// config detection
// ---------------------------------------------------------------------------

const isEngineModeToken = (v: unknown): boolean => ENGINE_MODE_TOKENS.has(lc(v));

const nonEmptyArrayField = (rec: Record<string, unknown>, fields: readonly string[]): boolean =>
  fields.some((f) => Array.isArray(rec[f]) && (rec[f] as unknown[]).length > 0);

/** Machine descriptors count only when they carry override content themselves. */
const machineHasConfig = (v: unknown): boolean => {
  if (!isRecord(v)) return false;
  const fixed = firstFinite(v, FIXED_FIELDS);
  const retail = firstFinite(v, MARKET_FIELDS);
  const markup = firstFinite(v, MARKUP_FIELDS);
  return (fixed !== null && fixed > 0)
    || (retail !== null && retail > 0)
    || (markup !== null && markup !== 0)
    || firstFinite(v, MIN_FIELDS) !== null
    || nonEmptyArrayField(v, [...BREAK_FIELDS, ...FORMULA_FIELDS])
    || MODE_FIELDS.some((f) => isEngineModeToken(v[f]))
    || TIER_REF_FIELDS.some((f) => asString(v[f]) !== '');
};

/**
 * Does this resolved descriptor actually carry pricing content the engine can
 * act on? Channel-wire thresholds: fixed_price must be POSITIVE, markup must
 * be NONZERO (an explicit markup_pct:0 is not config), market retail must be
 * positive, chart/registry fields must be non-empty, mode tokens must be
 * recognized engine spellings. An empty pricing block, a unit-enum
 * pricing_mode ('per_brick'), or a bare machine name must NOT flip the
 * component out of baseline pricing.
 */
export function descriptorHasPricingContent(d: unknown): boolean {
  if (!isRecord(d)) return false;
  const fixed = firstFinite(d, FIXED_FIELDS);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS.some((f) => asString(d[f]) !== '')) return true;
  if (nonEmptyArrayField(d, BREAK_FIELDS)) return true;
  const retail = firstFinite(d, MARKET_FIELDS);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite(d, MARKET_DISCOUNT_FIELDS);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS.some((f) => isEngineModeToken(d[f]))) return true;
  const markup = firstFinite(d, MARKUP_FIELDS);
  if (markup !== null && markup !== 0) return true;
  if (nonEmptyArrayField(d, FORMULA_FIELDS)) return true;
  if (firstFinite(d, MIN_FIELDS) !== null) return true;
  if (firstFinite(d, SETUP_FIELDS) !== null) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord(v) ? true : asString(v) !== '';
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString(d[f]) !== '')) return true;
  if (nonEmptyArrayField(d, [...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => asString(firstField(d, [f])) !== '')) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// brick record -> normalized component lines
// ---------------------------------------------------------------------------

export interface BrickWireLine {
  /** Canonical component key — 'material' | 'mortar' | 'labor'. */
  key: string;
  index: number;
  label: string;
  qty: number;
  /** Module-authored component cost. null = unknown cost base. */
  cost: number | null;
  category_key: string;
  /** The component's raw record carrier (the project record itself). */
  item: Record<string, unknown> | null;
  /** Inline descriptor carried on an explicit input.lines[] override row. */
  descriptor?: Record<string, unknown> | null;
  /** 'components' = projected record fields; 'caller' = input.lines[]. */
  origin: 'components' | 'caller';
}

const componentOf = (key: unknown) =>
  BRICK_COMPONENTS.find((c) => c.key === lc(key)) ?? null;

/**
 * Project a BrickStoneProject-like record into granular component cost lines.
 * Component slots emit in canonical order (material, mortar, labor); a slot
 * produces a line only when its cost field is finite. Sum of line costs ==
 * the record's internalCost basis (material + mortar + labor == subtotal).
 */
export function brickCostLines(record: unknown): BrickWireLine[] {
  if (!isRecord(record)) return [];
  const lines: BrickWireLine[] = [];
  BRICK_COMPONENTS.forEach((comp) => {
    const cost = firstFinite(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite(record, comp.qtyFields) ?? 1;
    lines.push({
      key: comp.key,
      index: lines.length,
      label: comp.label,
      qty,
      cost,
      category_key: comp.category_key,
      item: record,
      origin: 'components',
    });
  });
  return lines;
}

// ---------------------------------------------------------------------------
// project context carrier + per-component descriptor
// ---------------------------------------------------------------------------

const contextBlockOf = (record: unknown): { block: Record<string, unknown> | null; field: string } => {
  const rec = isRecord(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS) {
    if (isRecord(rec[f])) return { block: rec[f] as Record<string, unknown>, field: f };
  }
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS) {
      if (isRecord(cp[f])) return { block: cp[f] as Record<string, unknown>, field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: '' };
};

export interface BrickPricingContext {
  /** Marker so callers can pass the normalized context back without a rescan. */
  __brickPricingContext?: true;
  /** True when the RECORD carries an engine context block (engagement gate —
   * caller-supplied registries alone never engage). */
  hasContextBlock: boolean;
  /** Which record field supplied the block ('' when none). */
  field: string;
  customerTier: unknown;
  tierRules: unknown[];
  templates: unknown[];
  tiers: unknown[];
  /** Shop fallback markup pct — defaults to record.markup_percent. */
  defaultMarkupPct: number;
  /** Context-level machine descriptor. */
  machine: unknown;
  /** Context-level floors/fees/tax applied to every engine-priced line. */
  taxable: boolean | undefined;
  taxPercent: number;
  setupFee: number;
  minimumCharge: number;
  modifiers: unknown[] | undefined;
  /** Line map inside the context block ({<component key>: descriptor}). */
  lineMap: Record<string, unknown> | null;
  now: unknown;
  /** The raw context block (audit echo). */
  raw: unknown;
}

/**
 * Merge the engine context: caller-supplied `context` (registries pre-loaded
 * by the seam's caller) > the record's pricing_engine-style block > the saved
 * Markup-Tier snapshot tier_number > record.markup_percent as the default
 * markup. `hasContextBlock` records whether the record itself carries a block
 * — that (or component-scoped config) is what engages the wire.
 */
export function brickPricingContextOf(record: unknown, callerContext: unknown = null): BrickPricingContext {
  const rec = isRecord(record) ? record : {};
  const caller = isRecord(callerContext) ? callerContext : {};
  if ((callerContext as BrickPricingContext)?.__brickPricingContext === true) {
    return callerContext as BrickPricingContext;
  }

  const { block, field } = contextBlockOf(rec);
  const blk = block ?? {};
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : {};

  const customerTier = firstField(caller, ['customerTier', 'customer_tier', 'tier'])
    ?? firstField(blk, [...TIER_CONTEXT_FIELDS, 'tier'])
    ?? firstField(cp, ['tier_number', 'tier', 'tier_name'])
    ?? null;

  const tierRules = firstArray(caller, EMBEDDED_RULE_FIELDS)
    ?? firstArray(blk, EMBEDDED_RULE_FIELDS)
    ?? [];
  const templates = firstArray(caller, EMBEDDED_TEMPLATE_FIELDS)
    ?? firstArray(blk, EMBEDDED_TEMPLATE_FIELDS)
    ?? [];
  const tiers = firstArray(caller, EMBEDDED_TIER_CATALOG_FIELDS)
    ?? firstArray(blk, EMBEDDED_TIER_CATALOG_FIELDS)
    ?? [];

  const defaultMarkupPct = firstFinite(caller, DEFAULT_MARKUP_FIELDS.concat('markup_pct' as const))
    ?? firstFinite(blk, DEFAULT_MARKUP_FIELDS.concat(MARKUP_FIELDS))
    ?? firstFinite(rec, ['markup_percent'])
    ?? 0;

  const taxable = typeof caller.taxable === 'boolean' ? caller.taxable
    : typeof blk.taxable === 'boolean' ? blk.taxable
    : lc(blk.taxable) === 'true' ? true
    : lc(blk.taxable) === 'false' ? false
    : undefined;

  const callerModifiers = firstArray(caller, FORMULA_FIELDS);
  const blockModifiers = firstArray(blk, FORMULA_FIELDS);

  return {
    __brickPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num(defaultMarkupPct),
    machine: firstField(blk, MACHINE_FIELDS) ?? firstField(caller, MACHINE_FIELDS) ?? null,
    taxable,
    taxPercent: num(firstFinite(caller, TAX_PCT_FIELDS) ?? firstFinite(blk, TAX_PCT_FIELDS)),
    setupFee: num(firstFinite(caller, SETUP_FIELDS) ?? firstFinite(blk, SETUP_FIELDS)),
    minimumCharge: num(firstFinite(caller, MIN_FIELDS) ?? firstFinite(blk, MIN_FIELDS)),
    modifiers: callerModifiers ?? blockModifiers ?? undefined,
    lineMap: firstRecord(blk, ENGINE_LINE_MAP_FIELDS),
    now: caller.now ?? blk.now,
    raw: block,
  };
}

// ---------------------------------------------------------------------------
// per-component descriptor resolution
// ---------------------------------------------------------------------------

const componentNestedBlock = (record: unknown, key: string): Record<string, unknown> | null => {
  const rec = isRecord(record) ? record : {};
  for (const suffix of COMPONENT_BLOCK_SUFFIXES) {
    const f = `${key}_${suffix}`;
    if (isRecord(rec[f])) return rec[f] as Record<string, unknown>;
  }
  return null;
};

/**
 * Copy engine-vocab fields off a source record. When `prefix` is given the
 * source fields are `<prefix>_<field>` (the flat `<component>_<field>`
 * spellings on the project record); otherwise the bare field names (inline /
 * nested descriptors).
 */
const engineFieldsFrom = (src: unknown, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!isRecord(src)) return out;
  for (const f of BRICK_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== undefined && src[k] !== null && src[k] !== '') out[f] = src[k];
  }
  return out;
};

/**
 * Per-component merged part descriptor (weakest -> strongest):
 *   flat `${key}_<field>` record fields  <-  inline descriptor on an
 *   input.lines[] row  <-  context-block items/lines map entry  <-
 *   nested `${key}_pricing`-style component block.
 * Returns null when no config source exists.
 */
export function brickLineDescriptor(line: BrickWireLine | Record<string, unknown>, record: unknown = null): Record<string, unknown> | null {
  const key = lc((line as BrickWireLine)?.key);
  if (!componentOf(key)) return null;

  const rec = isRecord(record) ? record : {};
  const flat = engineFieldsFrom(rec, key);

  // An explicit input.lines[] row may carry its own config inline (bare field
  // spellings) or under .descriptor/.pricing — merged over the flat layer.
  const rawLine = isRecord(line) ? (line as Record<string, unknown>) : {};
  const ownInline = engineFieldsFrom(rawLine);
  const ownNested = firstRecord(rawLine, ['descriptor', 'pricing', 'price_config', 'engine_pricing', 'pricing_config', 'engine_price']);

  const { block } = contextBlockOf(rec);
  const lineMap = block ? firstRecord(block, ENGINE_LINE_MAP_FIELDS) : null;
  const mapEntry = lineMap
    ? (isRecord(lineMap[key]) ? lineMap[key] as Record<string, unknown>
      : isRecord(lineMap[asString((line as BrickWireLine)?.index)]) ? lineMap[asString((line as BrickWireLine)?.index)] as Record<string, unknown>
      : null)
    : null;

  const nested = componentNestedBlock(rec, key);

  const merged = {
    ...flat,
    ...ownInline,
    ...(ownNested ?? {}),
    ...(mapEntry ?? {}),
    ...(nested ?? {}),
  };
  if (!Object.keys(merged).length && !nested && !mapEntry && !ownNested) return null;
  return merged;
}

// ---------------------------------------------------------------------------
// config scan — the gate that makes no-config records byte-identical
// ---------------------------------------------------------------------------

export interface BrickConfigScan {
  configured: boolean;
  configuredCount: number;
  lineCount: number;
  /** per-line detection detail for the chain trace. */
  lines: Array<{ key: string; label: string; configured: boolean; hasCost: boolean }>;
}

/**
 * Detection only — which brick component lines carry pricing config. Cheap
 * and side-effect free; does NOT include context-block engagement (see
 * brickEngineConfigured for the full engagement probe).
 */
export function brickConfigScan(record: unknown, lines?: BrickWireLine[]): BrickConfigScan {
  const wireLines = Array.isArray(lines) ? lines : brickCostLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = brickLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost),
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail,
  };
}

/**
 * Full engagement probe: does this record carry engine config? — a
 * record-carried context block OR at least one configured component line.
 * (admin UI badge helper / tests).
 */
export function brickEngineConfigured(record: unknown, lines?: BrickWireLine[]): boolean {
  if (contextBlockOf(record).block) return true;
  return brickConfigScan(record, lines).configured;
}

// ---------------------------------------------------------------------------
// resolveBrickSellPricing
// ---------------------------------------------------------------------------

export interface BrickWireEngine {
  /** pricingEngine.pricePart — required; without it the wire passthroughs. */
  pricePart?: (input: any) => any;
  /** pricingTemplateModel.resolveTemplatePrice — optional template layer. */
  resolveTemplatePrice?: (input: any) => any;
  /** pricingTemplateModel.templatePartDescriptor — encodes a template hit. */
  templatePartDescriptor?: (part: any, resolution: any) => any;
}

export interface BrickSellLineResult {
  key: string;
  label: string;
  index: number;
  qty: number;
  cost: number;
  unit_cost: number;
  /** This line's baseline sell contribution (cost x (1+markupPct/100)). */
  baseline_sell: number;
  /** True when the line's own descriptor carries engine config. */
  configured: boolean;
  /** True when the engine priced the line (context engagement counts). */
  priced: boolean;
  /** 'context' = repriced by block engagement without own config. */
  priced_via: 'descriptor' | 'context' | null;
  skipped: string | null;
  engine: {
    unit_price: number;
    extended: number;
    setup_fee: number;
    subtotal: number;
    total: number;
    price_source: string;
    tier_source: string;
    minimum_applied: boolean;
    dangling_tier_ref: string | null;
    template_applied: boolean;
    template_reason: string | null;
    trace: unknown[];
  } | null;
}

export interface BrickSellPricingResult {
  applied: boolean;
  passthrough: boolean;
  reason:
    | 'no_record'
    | 'no_lines'
    | 'no_config'
    | 'no_engine'
    | 'no_priced_lines'
    | 'priced';
  /** Engine sell total when applied; baselineSell verbatim when passthrough. */
  customer_price: number;
  baseline_sell: number;
  internal_cost: number;
  markup_pct: number;
  /** True when a record-carried context block engaged the whole sell tail. */
  context_engaged: boolean;
  /** Baseline sell of engine-priced lines (removed from the aggregate). */
  configured_baseline: number;
  /** Baseline dollars that stayed module-priced (everything not repriced). */
  remainder_sell: number;
  /** Sum of engine line subtotals (extensions + setup fees, pre-tax). */
  engine_priced_total: number;
  lines: BrickSellLineResult[];
  chain: Array<{ layer: string; hit: boolean; won: boolean; detail: string }>;
  warnings: string[];
  context_used: {
    context_block: string;
    customer_tier: string;
    tier_rule_count: number;
    template_count: number;
    tier_count: number;
    default_markup_pct: number;
  };
}

const passthroughResult = (
  reason: BrickSellPricingResult['reason'],
  baselineSell: number,
  internalCost: number,
  markupPct: number,
  contextEngaged: boolean,
  lines: BrickSellLineResult[],
  chain: BrickSellPricingResult['chain'],
  warnings: string[],
  contextUsed: BrickSellPricingResult['context_used'],
): BrickSellPricingResult => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  context_engaged: contextEngaged,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed,
});

/**
 * Resolve the brick project sell price through the injected pricing engine.
 *
 * input.record          BrickStoneProject-like record
 * input.lines           optional explicit BrickWireLine[] override
 * input.baselineSell    the module's sell price today (record.total_cost /
 *                       sourceProjectEconomics customerPrice) — returned
 *                       verbatim on every passthrough path
 * input.internalCost    module internal cost (record.subtotal), echoed only
 * input.markupPercent   baseline sell factor; default record.markup_percent,
 *                       else markup_amount/subtotal
 * input.context         brickPricingContextOf-compatible registries (merged
 *                       over the record-embedded engine block)
 * input.engine          injected { pricePart, resolveTemplatePrice,
 *                       templatePartDescriptor }
 * input.now             effective-window override (tests)
 */
export function resolveBrickSellPricing(input: any = {}): BrickSellPricingResult {
  const warnings: string[] = [];
  const chain: BrickSellPricingResult['chain'] = [];
  const record = isRecord(input.record) ? input.record : null;
  const baselineSell = num(input.baselineSell ?? input.baseline_sell);
  const internalCost = num(input.internalCost ?? input.internal_cost);

  const rec = record ?? {};
  const subtotalBase = firstFinite(rec, ['subtotal']);
  const markupPct = firstFinite(input, ['markupPercent', 'markup_percent'])
    ?? firstFinite(rec, ['markup_percent'])
    ?? (subtotalBase && subtotalBase > 0 ? (num(rec.markup_amount) / subtotalBase) * 100 : 0);

  const context = brickPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || '',
    customer_tier: asString(
      isRecord(context.customerTier)
        ? (context.customerTier as any).tier_name ?? (context.customerTier as any).tier_number ?? (context.customerTier as any).id
        : context.customerTier,
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num(context.defaultMarkupPct),
  };

  const engine: BrickWireEngine = isRecord(input.engine) ? input.engine : {};
  const pricePart = typeof engine.pricePart === 'function' ? engine.pricePart : null;

  // --- line normalization -----------------------------------------------------
  const wireLines: BrickWireLine[] = Array.isArray(input.lines) && input.lines.length
    ? input.lines.map((l: any, position: number) => ({
        key: asString(l?.key) || `line-${position}`,
        index: position,
        label: asString(l?.label) || componentOf(l?.key)?.label || `Component ${position + 1}`,
        qty: l?.qty !== undefined ? num(l.qty, 1) : (componentOf(l?.key) ? (firstFinite(rec, componentOf(l?.key)!.qtyFields) ?? 1) : 1),
        cost: l?.cost !== undefined ? toFiniteNumber(l.cost) : (componentOf(l?.key) ? firstFinite(rec, componentOf(l?.key)!.costFields) : toFiniteNumber(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost)),
        category_key: asString(l?.category_key) || componentOf(l?.key)?.category_key || '',
        item: isRecord(l?.item) ? l.item : rec,
        descriptor: isRecord(l) ? l : null,
        origin: 'caller' as const,
      }))
    : brickCostLines(rec);

  const scan = brickConfigScan(rec, wireLines);
  const engaged = context.hasContextBlock || scan.configured;
  chain.push({
    layer: 'config_scan',
    hit: engaged,
    won: false,
    detail: context.hasContextBlock
      ? `context block via ${context.field}${scan.configured ? ` + ${scan.configuredCount} configured component(s)` : ''}`
      : scan.configured
        ? `${scan.configuredCount} of ${scan.lineCount} components carry pricing config`
        : `no pricing config on ${scan.lineCount} components`,
  });

  if (!record) return passthroughResult('no_record', baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult('no_lines', baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult('no_config', baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart) {
    warnings.push('pricing engine not injected — lines left at baseline sell');
    return passthroughResult('no_engine', baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }

  // --- per-line engine resolution ----------------------------------------------
  const markupFactor = 1 + markupPct / 100;
  const results: BrickSellLineResult[] = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;

  wireLines.forEach((line, position) => {
    const descriptor = brickLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    // Under context-block engagement the engine owns EVERY component line
    // (channel-wire parity); an unconfigured line then prices via the context
    // chart / default markup — landing back on its own baseline contribution.
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== undefined ? line.cost : null;
    const qty = num(line.qty, 1);
    const base: BrickSellLineResult = {
      key: line.key || `line-${position}`,
      label: line.label || `Component ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? (qty > 0 ? cost / qty : cost) : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      priced_via: null,
      skipped: null,
      engine: null,
    };
    results.push(base);
    if (!enginePrices) return;

    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = 'skipped_no_cost';
      skippedCount += 1;
      warnings.push(`component '${base.label}' carries pricing config but has no cost base — left at baseline sell`);
      return;
    }

    // Template layer first (pricingTemplateModel): the bound PricingTemplate /
    // tier-set chart resolves the unit price, then the descriptor adapter
    // encodes it for the engine's own part layer. res.applied === false
    // returns the descriptor VERBATIM so remaining part config still prices.
    let partDescriptor: any = { ...(descriptor ?? {}) };
    // Line-scoped formula modifiers ride input.modifiers (run after the winning
    // rule's own modifiers) — remove them from the descriptor so overrideRule
    // can't also fold them into the part rule (that would apply them twice).
    const lineModifiers = firstField(partDescriptor, FORMULA_FIELDS);
    for (const f of FORMULA_FIELDS) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS.reduce(
      (acc: unknown[], f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      [] as unknown[],
    );
    let templateApplied = false;
    let templateReason: string | null = null;
    if (typeof engine.resolveTemplatePrice === 'function') {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct,
        });
        if (resolution && isRecord(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w: unknown) => `component '${base.label}': ${asString(w)}`));
          if (typeof engine.templatePartDescriptor === 'function') {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e: any) {
        warnings.push(`component '${base.label}': template resolution failed (${asString(e?.message)}) — part fields priced directly`);
      }
    }

    const customerTier = firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...(nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS)
        ? EMBEDDED_RULE_FIELDS.reduce((acc: unknown[], f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), [])
        : []),
      ...context.tierRules,
    ];
    const machine = firstField(partDescriptor, MACHINE_FIELDS) ?? context.machine;
    const setupFee = firstFinite(partDescriptor, SETUP_FIELDS) ?? (context.setupFee || undefined);
    const minimumCharge = firstFinite(partDescriptor, MIN_FIELDS) ?? (context.minimumCharge || undefined);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === 'boolean' ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite(partDescriptor, TAX_PCT_FIELDS) ?? (context.taxPercent || undefined);

    let priced: any = null;
    try {
      priced = pricePart({
        label: base.label,
        category: line.category_key || asString(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString(firstField(partDescriptor, UNIT_FIELDS)) || 'each',
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        taxable,
        taxPercent,
        modifiers,
        now: input.now ?? context.now,
      });
    } catch (e: any) {
      base.skipped = 'engine_error';
      skippedCount += 1;
      warnings.push(`component '${base.label}': engine pricing failed (${asString(e?.message)}) — left at baseline sell`);
      return;
    }

    const pricedRecord = isRecord(priced) ? priced : {};
    const lineSubtotal = firstFinite(pricedRecord, ['subtotal']) ?? num(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? 'descriptor' : 'context';
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num(pricedRecord.unitPrice),
      extended: num(pricedRecord.extended),
      setup_fee: num(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num(pricedRecord.total),
      price_source: asString(pricedRecord.priceSource),
      tier_source: asString(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : [],
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`component '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve — priced via remaining layers`);
    }
  });

  chain.push({
    layer: 'engine_pricing',
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount
      ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)`
      : `${pricedCount} engine-priced`,
  });

  if (!pricedCount) {
    return passthroughResult('no_priced_lines', baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }

  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round2(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round2(configuredBaseline)}) exceeds project sell — remainder ${round2(remainder)}`);
  }

  chain.push({
    layer: 'remainder',
    hit: true,
    won: false,
    detail: `baseline ${round2(baselineSell)} - priced baseline ${round2(configuredBaseline)} = remainder ${round2(remainder)}`,
  });
  chain.push({
    layer: 'customer_price',
    hit: true,
    won: true,
    detail: `remainder ${round2(remainder)} + engine ${round2(engineTotal)} = ${customerPrice}`,
  });

  return {
    applied: true,
    passthrough: false,
    reason: 'priced',
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    context_engaged: context.hasContextBlock,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed,
  };
}
