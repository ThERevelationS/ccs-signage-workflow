// Laser module pricing-engine wire (ESTIMATOR_MASTERPLAN F-23e) — pure TS,
// ZERO imports, NO IO. Bundles clean for Deno base44 functions and the Vite
// frontend (frontend-shared-modules allowlist).
//
// What this does: the Laser module's COST math stays authoritative — the
// persisted item machine_cost / labor_cost (LaserEstimator.jsx updateItem +
// calculateTotals writes the mm/sec-derived per-line pair; the shared
// estimator/laser/laserCalc.js calcLaserProject spells the same per-line
// total as item_total_cost) plus the project-level fixed_setup_hours x
// labor_rate setup labor folded into total_labor_cost and the
// fixed_material_setup_cost supplies inside record.total_cost. This wire
// only re-prices the SELL side of laser lines that carry a
// pricing-tier/template config. The engine is INJECTED by the caller
// ({ pricePart, resolveTemplatePrice, templatePartDescriptor } from
// base44/shared/pricingEngine.ts + pricingTemplateModel.ts) so this file
// stays import-free per shared-model convention.
//
// ZERO-REGRESSION CONTRACT: a laser record whose lines carry no engine-vocab
// pricing config resolves { applied:false, passthrough:true,
// customer_price === baselineSell } — the caller returns the module's own
// sell price verbatim (byte-identical at the customerPricing seam). Laser
// records carry no module markup (total_cost is a pure cost total; the saved
// customer_pricing Markup-Tier snapshot is a separate layer), so the module
// markup factor is 1 and each configured line's baseline contribution is
// exactly its own line cost:
//
//   remainder      = baselineSell - Σ configured line cost
//   customer_price = round2(remainder + Σ pricedLine.subtotal)
//
// Because the remainder only subtracts configured lines' costs, everything
// not repriced — un-configured lines, the fixed setup labor dollars, and the
// fixed material/supplies setup inside total_cost — keeps its exact baseline
// contribution. markupPct still honors input.markupPercent /
// record.markup_percent / markup_amount÷subtotal for forward parity with the
// other module wires; on today's laser records it resolves to 0.
//
// ---------------------------------------------------------------------------
// Activation contract — "a line carrying a pricing-tier config"
// ---------------------------------------------------------------------------
// A laser line (record.items[] row — the persisted flat list) is
// engine-priced when its resolved descriptor carries at least one
// pricing-engine field:
//
//   fixed_price | price_override | override_price | flat_price   pinned unit sell
//   tier_ref | tier_ref_id | tier | tier_name | pricing_tier_ref  bound tier row
//   per_unit_breaks | unit_breaks | qty_breaks                    qty chart
//   pricing_template_id | template_id | margin_template_id |
//     pricing_template_name | template_name | pricing_template | template
//                                                              bound PricingTemplate
//   global_pricing_tier_id | pricing_tier_id | tier_set_id |
//     pricing_tier_set_id | pricing_rule_set_id | global_tier_id |
//     global_pricing_tier_name | pricing_tier_name | tier_set_name
//                                                              bound GlobalPricingTier
//   market_retail | retail | retail_price | list_price |
//     market_discount_pct | retail_discount_pct                 market-based pricing
//   pricing_mode | price_mode | mode   (engine tokens 'market' | 'market_based'
//     | 'market-based' | 'retail' | 'retail_minus_discount' | 'fixed' |
//     'fixed_price' | 'flat' ONLY — laser unit/type enums like 'panel' /
//     'lettering' / 'engraving' / 'engrave_and_cut' / 'per_hour' /
//     'per_sheet' are NOT pricing config; material_type
//     (Acrylic|Wood|Leather), material_thickness, cut/engrave speeds,
//     machine_time_hours, handling_time_hours, machine_cost / labor_cost are
//     cost-side fields and are never config)
//   markup_pct | markup | markup_percent                        part markup
//   minimum_charge | min_charge | minimum | setup_fee_floor     extension floor
//   setup_fee | setupFee | setup_fee_flat                       flat sell fee
//   formula_modifiers                                           ordered unit-price ops
//   machine | machine_override                                  descriptor w/ engine fields
//   customer_tier                                               line-scoped tier pin
//   tier_rules | tierRules | tier_matrix | templates |
//     pricing_templates | tiers                                 line-embedded registries
//   pricing | price_config | engine_pricing | pricing_config |
//     engine_price                                              nested config block
//
// Descriptor merge per line (weakest -> strongest):
//   flat item fields  <-  project engine_pricing.items[<line key>]  <-
//   item.pricing | .price_config | .engine_pricing | .pricing_config |
//   .engine_price nested block.
//
// Project-level context carrier (record.engine_pricing / .pricing_context /
// .engine_context / .pricing_engine — tolerated extras):
//   customer_tier, tier_rules | tierRules | tier_matrix, templates,
//   tiers | tier_catalog, default_markup_pct | defaultMarkupPct, now,
//   items | lines: { <item builder_item_id|id|key|index>: <part descriptor> }.
// Caller-supplied `context` always outranks the record-embedded block; the
// record's saved Markup-Tier snapshot (customer_pricing.tier_number) is the
// weakest customer-tier source.
//
// Cost-base rule (safety): only lines with a finite numeric cost base can be
// engine-priced — the wire must subtract exactly the baseline sell it
// replaces. Laser spells it two ways: a single-total field (item_total_cost |
// line_total_cost | total_cost | extended_cost | line_cost | item_cost |
// cost | computed_cost — calcLaserProject's item_total_cost first) or the
// persisted machine_cost + labor_cost component pair written by
// LaserEstimator's calculateTotals. A configured line without a cost base is
// SKIPPED (skipped_no_cost warning, baseline untouched) rather than
// double-charging or zeroing sell dollars.
//
// qty: item.quantity | qty | count, default 1 — 0 is honored (extension 0,
// engine minimum never fires on extension <= 0). unitCost = lineCost/qty for
// qty > 0 else the raw lineCost. The whole pipeline never throws; every
// resolution step is echoed in `chain` for transparency.
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

/**
 * Line cost-base spellings (single-total fields; calcLaserProject's
 * item_total_cost first). When none is present the wire falls back to the
 * persisted machine_cost + labor_cost component pair — the shape
 * LaserEstimator.jsx actually saves on each item.
 */
const LINE_COST_FIELDS = [
  'item_total_cost', 'line_total_cost', 'total_cost', 'extended_cost',
  'line_cost', 'item_cost', 'cost', 'computed_cost',
] as const;

/** Laser cost components persisted per item by the estimator page. */
const LINE_COST_COMPONENT_FIELDS = ['machine_cost', 'labor_cost'] as const;

const LINE_QTY_FIELDS = ['quantity', 'qty', 'count'] as const;

const LINE_LABEL_FIELDS = ['description', 'label', 'name', 'item_name', 'part_name'] as const;

/** builder_item_id is the stable hidden row identity seeded by the page. */
const LINE_KEY_FIELDS = ['builder_item_id', 'id', 'item_id', 'part_id', 'key', 'line_id'] as const;

/** item_type (panel|lettering|engraving|engrave_and_cut) doubles as the pricing category. */
const LINE_CATEGORY_FIELDS = ['category_key', 'category', 'part_category', 'pricing_category', 'item_type'] as const;

/** Project record blocks that may carry engine context + per-line overrides. */
const ENGINE_BLOCK_FIELDS = ['engine_pricing', 'pricing_context', 'engine_context', 'pricing_engine'] as const;

/** Nested per-item config blocks. */
const NESTED_CONFIG_FIELDS = ['pricing', 'price_config', 'engine_pricing', 'pricing_config', 'engine_price'] as const;

/** Map inside the project block keyed by line key -> part descriptor. */
const ENGINE_LINE_MAP_FIELDS = ['items', 'lines', 'line_config', 'item_config'] as const;

/** Pricing-mode tokens that count as engine config (unit enums excluded). */
const ENGINE_MODE_TOKENS = new Set([
  'market', 'market_based', 'market-based', 'retail', 'retail_minus_discount',
  'fixed', 'fixed_price', 'flat',
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
const FORMULA_FIELDS = ['formula_modifiers'] as const;
const MODE_FIELDS = ['pricing_mode', 'price_mode', 'mode'] as const;
const MACHINE_FIELDS = ['machine', 'machine_override'] as const;
const TIER_CONTEXT_FIELDS = ['customer_tier', 'customerTier'] as const;
const EMBEDDED_RULE_FIELDS = ['tier_rules', 'tierRules', 'tier_matrix'] as const;
const EMBEDDED_TEMPLATE_FIELDS = ['templates', 'pricing_templates'] as const;
const EMBEDDED_TIER_CATALOG_FIELDS = ['tiers', 'tier_catalog'] as const;

/**
 * Flat item fields the engine can read — copied into the line descriptor.
 * (Field names only; presence does not by itself mark the line configured —
 * see descriptorHasPricingContent.)
 */
export const LASER_ENGINE_LINE_FIELDS: readonly string[] = Object.freeze([
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
  'unit', 'pricing_unit', 'pricingUnit', 'uom', 'unit_of_measure', 'unit_category',
]);

// ---------------------------------------------------------------------------
// config detection
// ---------------------------------------------------------------------------

const isEngineModeToken = (v: unknown): boolean => ENGINE_MODE_TOKENS.has(lc(v));

const nonEmptyArrayField = (rec: Record<string, unknown>, fields: readonly string[]): boolean =>
  fields.some((f) => Array.isArray(rec[f]) && (rec[f] as unknown[]).length > 0);

const anyFiniteField = (rec: Record<string, unknown>, fields: readonly string[]): boolean =>
  fields.some((f) => firstFinite(rec, [f]) !== null);

// Field families the engine only fires on above zero — a persisted 0 is an
// unset/default artifact, not authored config. markup is the exception: an
// explicit markup_pct:0 pins sell-at-cost, so markup fields stay any-finite.
const anyPositiveField = (rec: Record<string, unknown>, fields: readonly string[]): boolean =>
  fields.some((f) => { const v = firstFinite(rec, [f]); return v !== null && v > 0; });

/** Machine descriptors count only when they carry override content themselves. */
const machineHasConfig = (v: unknown): boolean => {
  if (!isRecord(v)) return false;
  return anyPositiveField(v, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MIN_FIELDS])
    || anyFiniteField(v, MARKUP_FIELDS)
    || nonEmptyArrayField(v, [...BREAK_FIELDS, ...FORMULA_FIELDS])
    || MODE_FIELDS.some((f) => isEngineModeToken(v[f]))
    || TIER_REF_FIELDS.some((f) => asString(v[f]) !== '');
};

/**
 * Does this resolved descriptor actually carry pricing content the engine can
 * act on? An empty pricing:{} block, a laser unit/type enum (pricing_mode
 * 'per_hour', item_type 'panel'|'engraving', material_type 'Acrylic') or a
 * bare machine name must NOT flip the line out of baseline pricing.
 */
export function descriptorHasPricingContent(d: unknown): boolean {
  if (!isRecord(d)) return false;
  if (anyPositiveField(d, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MARKET_DISCOUNT_FIELDS, ...MIN_FIELDS, ...SETUP_FIELDS]) || anyFiniteField(d, MARKUP_FIELDS)) return true;
  if (nonEmptyArrayField(d, [...BREAK_FIELDS, ...FORMULA_FIELDS, ...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (MODE_FIELDS.some((f) => isEngineModeToken(d[f]))) return true;
  if (TIER_REF_FIELDS.some((f) => asString(d[f]) !== '')) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord(v) ? true : asString(v) !== '';
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString(d[f]) !== '')) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => firstField(d, [f]) !== undefined)) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// laser record -> normalized lines
// ---------------------------------------------------------------------------

export interface LaserWireLine {
  /** Stable key — builder_item_id, else item id, else positional tag. */
  key: string;
  index: number;
  label: string;
  qty: number;
  /** Line-level computed cost (module-authored). null = unknown cost base. */
  cost: number | null;
  category_key: string;
  /** The raw laser item row. */
  item: Record<string, unknown>;
  /** 'items' = flat persisted list; 'caller' = input.lines override. */
  origin: 'items' | 'caller';
}

const lineKey = (item: Record<string, unknown>, index: number): string => {
  const explicit = firstField(item, LINE_KEY_FIELDS);
  if (explicit !== undefined && asString(explicit) !== '') return asString(explicit);
  return `idx-${index}`;
};

/**
 * The line's module-authored cost base: a persisted single-total field first
 * (calcLaserProject's item_total_cost), else the machine_cost + labor_cost
 * component pair LaserEstimator writes per item, else null (no cost base).
 */
const lineCostOf = (item: Record<string, unknown>): number | null => {
  const direct = firstFinite(item, LINE_COST_FIELDS);
  if (direct !== null) return direct;
  const machine = toFiniteNumber(item.machine_cost);
  const labor = toFiniteNumber(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num(machine) + num(labor);
};

/**
 * Normalize a LaserProject-like record to the wire's line list. The persisted
 * flat `record.items` list is the only line source — the module has no
 * nested workflow structures.
 */
export function laserRecordLines(record: unknown): LaserWireLine[] {
  if (!isRecord(record)) return [];
  const flat = Array.isArray(record.items) ? (record.items as unknown[]).filter(isRecord) : [];
  return flat.map((item, index) => ({
    key: lineKey(item, index),
    index,
    label: asString(firstField(item, LINE_LABEL_FIELDS)) || `Item ${index + 1}`,
    qty: num(firstField(item, LINE_QTY_FIELDS), 1),
    cost: lineCostOf(item),
    category_key: asString(firstField(item, LINE_CATEGORY_FIELDS)),
    item,
    origin: 'items' as const,
  }));
}

// ---------------------------------------------------------------------------
// project context carrier + per-line descriptor
// ---------------------------------------------------------------------------

const engineBlockOf = (record: unknown): Record<string, unknown> =>
  firstRecord(record as Record<string, unknown>, ENGINE_BLOCK_FIELDS) ?? {};

export interface LaserPricingContext {
  customerTier: unknown;
  tierRules: unknown[];
  templates: unknown[];
  tiers: unknown[];
  defaultMarkupPct: number;
  now: unknown;
}

/**
 * Merge the engine context: caller-supplied `context` (registries pre-loaded
 * by the seam's caller) > record.engine_pricing-style block > the record's
 * saved Markup-Tier snapshot tier_number > record.markup_percent as the
 * default markup (absent on laser records today, so 0 — a configured-but-
 * unresolved line then naturally lands on its own cost baseline).
 */
export function laserPricingContextOf(record: unknown, callerContext: unknown = null): LaserPricingContext {
  const rec = isRecord(record) ? record : {};
  const block = engineBlockOf(rec);
  const caller = isRecord(callerContext) ? callerContext : {};
  const cp = isRecord(rec.customer_pricing) ? rec.customer_pricing : {};

  const customerTier = firstField(caller, ['customerTier', 'customer_tier', 'tier'])
    ?? firstField(block, TIER_CONTEXT_FIELDS.concat('tier' as const))
    ?? firstField(cp, ['tier_number', 'tier', 'tier_name'])
    ?? null;

  const tierRules = firstArray(caller, ['tierRules', 'tier_rules', 'tier_matrix'])
    ?? firstArray(block, EMBEDDED_RULE_FIELDS)
    ?? [];
  const templates = firstArray(caller, ['templates', 'pricing_templates'])
    ?? firstArray(block, EMBEDDED_TEMPLATE_FIELDS)
    ?? [];
  const tiers = firstArray(caller, ['tiers', 'tier_catalog', 'markup_tiers'])
    ?? firstArray(block, EMBEDDED_TIER_CATALOG_FIELDS.concat('markup_tiers' as const))
    ?? [];

  const defaultMarkupPct = firstFinite(caller, ['defaultMarkupPct', 'default_markup_pct'])
    ?? firstFinite(block, ['default_markup_pct', 'defaultMarkupPct'])
    ?? firstFinite(rec, ['markup_percent'])
    ?? 0;

  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now,
  };
}

/**
 * Per-line merged part descriptor (weakest -> strongest):
 * flat engine fields on the item -> project engine_pricing.items[key] ->
 * nested item pricing block. Returns null when no config source exists.
 */
export function laserLineDescriptor(line: LaserWireLine | Record<string, unknown>, record: unknown = null): Record<string, unknown> | null {
  const item = isRecord((line as LaserWireLine)?.item)
    ? (line as LaserWireLine).item
    : (isRecord(line) ? (line as Record<string, unknown>) : null);
  if (!item) return null;

  const flat: Record<string, unknown> = {};
  for (const f of LASER_ENGINE_LINE_FIELDS) {
    if (item[f] !== undefined) flat[f] = item[f];
  }

  const block = engineBlockOf(record);
  const lineMap = firstRecord(block, ENGINE_LINE_MAP_FIELDS);
  const mapEntry = lineMap
    ? (isRecord(lineMap[(line as LaserWireLine)?.key]) ? lineMap[(line as LaserWireLine).key] as Record<string, unknown>
      : isRecord(lineMap[asString((line as LaserWireLine)?.index)]) ? lineMap[asString((line as LaserWireLine)?.index)] as Record<string, unknown>
      : null)
    : null;

  const nested = firstRecord(item, NESTED_CONFIG_FIELDS);

  const merged = { ...flat, ...(mapEntry ?? {}), ...(nested ?? {}) };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}

// ---------------------------------------------------------------------------
// config scan — the gate that makes no-config records byte-identical
// ---------------------------------------------------------------------------

export interface LaserConfigScan {
  configured: boolean;
  configuredCount: number;
  lineCount: number;
  /** per-line detection detail for the chain trace. */
  lines: Array<{ key: string; label: string; configured: boolean; hasCost: boolean }>;
}

/**
 * Detection only — which laser lines carry pricing-engine config. Cheap and
 * side-effect free; callers may use it to decide whether engine resolution is
 * needed at all.
 */
export function laserConfigScan(record: unknown, lines?: LaserWireLine[]): LaserConfigScan {
  const wireLines = Array.isArray(lines) ? lines : laserRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = laserLineDescriptor(line, record);
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

// ---------------------------------------------------------------------------
// resolveLaserSellPricing
// ---------------------------------------------------------------------------

export interface LaserWireEngine {
  /** pricingEngine.pricePart — required; without it the wire passthroughs. */
  pricePart?: (input: any) => any;
  /** pricingTemplateModel.resolveTemplatePrice — optional template layer. */
  resolveTemplatePrice?: (input: any) => any;
  /** pricingTemplateModel.templatePartDescriptor — encodes a template hit. */
  templatePartDescriptor?: (part: any, resolution: any) => any;
}

export interface LaserSellLineResult {
  key: string;
  label: string;
  index: number;
  qty: number;
  cost: number;
  unit_cost: number;
  /** This line's baseline sell contribution (cost x (1+markupPct/100)). */
  baseline_sell: number;
  configured: boolean;
  priced: boolean;
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

export interface LaserSellPricingResult {
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
  /** Baseline sell of engine-priced lines (removed from the aggregate). */
  configured_baseline: number;
  /** Baseline dollars that stayed module-priced (everything not repriced). */
  remainder_sell: number;
  /** Sum of engine line subtotals (extensions + setup fees, pre-tax). */
  engine_priced_total: number;
  lines: LaserSellLineResult[];
  chain: Array<{ layer: string; hit: boolean; won: boolean; detail: string }>;
  warnings: string[];
  context_used: {
    customer_tier: string;
    tier_rule_count: number;
    template_count: number;
    tier_count: number;
    default_markup_pct: number;
  };
}

const passthroughResult = (
  reason: LaserSellPricingResult['reason'],
  baselineSell: number,
  internalCost: number,
  markupPct: number,
  lines: LaserSellLineResult[],
  chain: LaserSellPricingResult['chain'],
  warnings: string[],
  contextUsed: LaserSellPricingResult['context_used'],
): LaserSellPricingResult => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed,
});

/**
 * Resolve the laser project sell price through the injected pricing engine.
 *
 * input.record          LaserProject-like (items[])
 * input.lines           optional explicit LaserWireLine[] override
 * input.baselineSell    the module's sell price today (record.total_cost /
 *                       sourceProjectEconomics customerPrice) — returned
 *                       verbatim on every passthrough path
 * input.internalCost    module internal cost (record.total_cost), echoed only
 * input.markupPercent   baseline sell factor; default record.markup_percent,
 *                       else markup_amount/subtotal, else 0 (laser today)
 * input.context         laserPricingContextOf-compatible registries (merged
 *                       over the record-embedded engine block)
 * input.engine          injected { pricePart, resolveTemplatePrice,
 *                       templatePartDescriptor }
 * input.now             effective-window override (tests)
 */
export function resolveLaserSellPricing(input: any = {}): LaserSellPricingResult {
  const warnings: string[] = [];
  const chain: LaserSellPricingResult['chain'] = [];
  const record = isRecord(input.record) ? input.record : null;
  const baselineSell = num(input.baselineSell ?? input.baseline_sell);
  const internalCost = num(input.internalCost ?? input.internal_cost);

  const rec = record ?? {};
  const subtotalBase = firstFinite(rec, ['subtotal']);
  const markupPct = firstFinite(input, ['markupPercent', 'markup_percent'])
    ?? firstFinite(rec, ['markup_percent'])
    ?? (subtotalBase && subtotalBase > 0 ? (num(rec.markup_amount) / subtotalBase) * 100 : 0);

  const context = laserPricingContextOf(rec, input.context);
  const contextUsed = {
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

  const engine: LaserWireEngine = isRecord(input.engine) ? input.engine : {};
  const pricePart = typeof engine.pricePart === 'function' ? engine.pricePart : null;

  // --- line normalization -----------------------------------------------------
  const wireLines: LaserWireLine[] = Array.isArray(input.lines) && input.lines.length
    ? input.lines
    : laserRecordLines(rec);

  const scan = laserConfigScan(rec, wireLines);
  chain.push({
    layer: 'config_scan',
    hit: scan.configured,
    won: false,
    detail: scan.configured
      ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config`
      : `no pricing config on ${scan.lineCount} lines`,
  });

  if (!record) return passthroughResult('no_record', baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult('no_lines', baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult('no_config', baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart) {
    warnings.push('pricing engine not injected — lines left at baseline sell');
    return passthroughResult('no_engine', baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }

  // --- per-line engine resolution ----------------------------------------------
  const markupFactor = 1 + markupPct / 100;
  const results: LaserSellLineResult[] = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;

  wireLines.forEach((line, position) => {
    const rawItem = isRecord(line?.item) ? line.item : (isRecord(line) ? (line as Record<string, unknown>) : {});
    const descriptor = laserLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    // Tolerate raw item rows passed via input.lines (qty/cost not yet folded).
    const cost = line.cost !== undefined ? line.cost : lineCostOf(rawItem);
    const qty = (num(line.qty ?? firstField(rawItem, LINE_QTY_FIELDS), 1) || 0);
    const base: LaserSellLineResult = {
      key: line.key || lineKey(rawItem, position),
      label: line.label || asString(firstField(rawItem, LINE_LABEL_FIELDS)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? (qty > 0 ? cost / qty : cost) : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null,
    };
    results.push(base);
    if (!configured) return;

    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = 'skipped_no_cost';
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base — left at baseline sell`);
      return;
    }

    // Template layer first (pricingTemplateModel): the bound PricingTemplate /
    // GlobalPricingTier chart resolves the unit price, then the descriptor
    // adapter encodes it for the engine's own part layer. res.applied === false
    // returns the descriptor VERBATIM so remaining part config still prices.
    let partDescriptor: any = { ...descriptor };
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
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w: unknown) => `line '${base.label}': ${asString(w)}`));
          if (typeof engine.templatePartDescriptor === 'function') {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e: any) {
        warnings.push(`line '${base.label}': template resolution failed (${asString(e?.message)}) — part fields priced directly`);
      }
    }

    const customerTier = firstField(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...(nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS)
        ? EMBEDDED_RULE_FIELDS.reduce((acc: unknown[], f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), [])
        : []),
      ...context.tierRules,
    ];
    const machine = firstField(partDescriptor, MACHINE_FIELDS) ?? null;
    const setupFee = firstFinite(partDescriptor, SETUP_FIELDS) ?? undefined;
    const minimumCharge = firstFinite(partDescriptor, MIN_FIELDS) ?? undefined;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : undefined;

    let priced: any = null;
    try {
      priced = pricePart({
        label: base.label,
        category: line.category_key || asString(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString(firstField(partDescriptor, ['unit', 'pricing_unit', 'pricingUnit', 'uom', 'unit_of_measure', 'unit_category'])) || 'each',
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now,
      });
    } catch (e: any) {
      base.skipped = 'engine_error';
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString(e?.message)}) — left at baseline sell`);
      return;
    }

    const pricedRecord = isRecord(priced) ? priced : {};
    const lineSubtotal = firstFinite(pricedRecord, ['subtotal']) ?? num(pricedRecord.extended);
    base.priced = true;
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
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve — priced via remaining layers`);
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
    return passthroughResult('no_priced_lines', baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }

  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round2(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round2(configuredBaseline)}) exceeds project sell — remainder ${round2(remainder)}`);
  }

  chain.push({
    layer: 'remainder',
    hit: true,
    won: false,
    detail: `baseline ${round2(baselineSell)} - configured baseline ${round2(configuredBaseline)} = remainder ${round2(remainder)}`,
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
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed,
  };
}
