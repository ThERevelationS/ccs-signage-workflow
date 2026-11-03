// Maintenance module pricing-engine wire (ESTIMATOR_MASTERPLAN F-23i) — pure
// TS, ZERO imports, NO IO. Bundles clean for Deno base44 functions and the
// Vite frontend (frontend-shared-modules allowlist).
//
// What this does: the maintenance module's COST math stays authoritative —
// the live page (src/pages/MaintenanceEstimator.jsx) persists items[] rows
// computed by signMaintenance/maintenanceCalculator.jsx calcServiceItem:
// item labor minutes come from the MaintenanceActionRate matrix (sign_type x
// action x size), multiplied by the item's billable unit count (qty = letters
// on the letter axis, cabinets on the cabinet axis), priced at the tech rate;
// materials are costed from inventory rules (usage_basis per_letter /
// per_cabinet / per_linear_foot / per_sqft / per_project_flat /
// per_service_item). Each persisted item therefore carries an ALREADY
// EXTENDED item_total_cost = labor_cost + materials_cost, and the page rolls
// the items into project totals (calcProjectTotals: subtotal = labor_cost +
// total_materials_cost + total_supplies_cost + total_equipment_cost +
// total_personnel_cost + total_travel_cost; total_cost = subtotal +
// markup_amount). The legacy estimator/maintenance/maintenanceCalc.js shape
// (quantity for sign count, per-action {action_total_cost, labor_cost,
// materials_cost} objects, qty_letters/face_sqft inputs) resolves through the
// same cost spellings. This wire only re-prices the SELL side of maintenance
// service items that carry a pricing-tier/template config. The engine is
// INJECTED by the caller ({ pricePart, resolveTemplatePrice,
// templatePartDescriptor } from base44/shared/pricingEngine.ts +
// pricingTemplateModel.ts) so this file stays import-free per shared-model
// convention.
//
// ZERO-REGRESSION CONTRACT: a maintenance record whose service items carry no
// engine-vocab pricing config resolves { applied:false, passthrough:true,
// customer_price === baselineSell } — the caller returns the module's own
// sell price verbatim (byte-identical at the customerPricing seam, no float
// ops). When at least one line carries config, that line's share of the
// module sell is replaced by the engine-priced extension; everything not
// repriced — un-configured items, and the project-level dollars that live
// OUTSIDE any line (total_supplies_cost, total_equipment_cost,
// total_personnel_cost, total_travel_cost) — keeps its exact baseline
// contribution inside the remainder:
//
//   remainder      = baselineSell - Σ configured line cost × (1+markupPct/100)
//   customer_price = round2(remainder + Σ pricedLine.subtotal)
//
// The module markup is linear over the aggregate subtotal, so each configured
// line's baseline contribution is exactly lineCost × (1 + markupPct/100).
// markupPct defaults to record.markup_percent (the percent that produced
// markup_amount), falling back to markup_amount/subtotal when the percent
// field is absent.
//
// ---------------------------------------------------------------------------
// Activation contract — "a service item carrying a pricing-tier config"
// ---------------------------------------------------------------------------
// A maintenance line (record.items[] row — the persisted flat list) is
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
//     'fixed_price' | 'flat' ONLY — maintenance unit/sign enums are NOT
//     pricing config: sign_type 'flush_channel' | 'halo_channel' |
//     'raceway_channel' | 'capsule_logo' | 'dimensional_letters' |
//     'monument_sign' | 'pylon_sign' | 'post_and_panel', size 'extra_small' ..
//     'extra_extra_large' | 'cab_small' .. 'cab_extra_large', material
//     pricing_mode 'per_letter_flat' | 'per_letter_by_size' |
//     'per_cabinet_flat' | 'per_cabinet_by_size' | 'per_linear_foot' |
//     'per_sqft' | 'per_project_flat', usage_basis 'per_letter' |
//     'per_cabinet' | 'per_linear_foot' | 'per_sqft' | 'per_service_item',
//     and action ids 'clean' | 'repaint' | 'led_retrofit' | ... — as are the
//     cost-side fields qty | quantity | qty_letters | unit_count | face_sqft |
//     linear_feet | installation_height_feet | minutes | labor_hours |
//     labor_cost | materials_cost | item_total_cost | action_total_cost |
//     materials[].unit_cost | materials[].quantity | materials[].total_cost |
//     repaint_calc | repaint_config and the project-level
//     labor_rate_per_hour | markup_percent | markup_amount | subtotal |
//     total_*_cost | travel_* | supplies_* | selected_equipment | personnel)
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
// Line granularity: one line per service item (one sign being serviced). The
// nested materials[]/actions[] rows are COST-SIDE detail inside the line's
// cost base — they are never scanned for engine config and never repriced
// separately (parity with the vinyl/metal wires: a line = an items[] row).
//
// Project-level context carrier (record.engine_pricing / .pricing_context /
// .engine_context / .pricing_engine — tolerated extras):
//   customer_tier, tier_rules | tierRules | tier_matrix, templates,
//   tiers | tier_catalog, default_markup_pct | defaultMarkupPct, now,
//   items | lines: { <item id|item_id|key|index>: <part descriptor> }.
// Caller-supplied `context` always outranks the record-embedded block; the
// record's saved Markup-Tier snapshot (customer_pricing.tier_number) is the
// weakest customer-tier source.
//
// Cost-base rule (safety): only lines with a finite numeric cost base can be
// engine-priced — the wire must subtract exactly the baseline sell it
// replaces. Maintenance spells the line cost two ways, both already EXTENDED
// (the module folds the billable unit count in when it computes them):
//   a. a single-total field (item_total_cost | line_total_cost | total_cost |
//      extended_cost | line_cost | item_cost | cost | computed_cost —
//      calcServiceItem's item_total_cost first);
//   b. the component pair labor_cost + materials_cost — calcServiceItem
//      always writes both alongside item_total_cost, so the pair reproduces
//      the extended line cost exactly for page-authored rows that lack the
//      total field.
// A configured line without a cost base is SKIPPED (skipped_no_cost warning,
// baseline untouched) rather than double-charging or zeroing sell dollars.
//
// qty: item.qty | quantity | count, default 1 — the item's billable unit
// count (letters on the letter axis, cabinets on the cabinet axis; the legacy
// calcMaintenanceProject shape's `quantity` = sign count). 0 is honored for
// the engine extension (engine minimum never fires on extension <= 0) even
// though the page's own math may bill a zero-qty cabinet item once
// (Math.max(qty,1)) — the configured baseline is still removed in full, so a
// pinned zero-qty engine price reprices the line to its extension exactly.
// unitCost = lineCost/qty for qty > 0 else the raw lineCost. The whole
// pipeline never throws; every resolution step is echoed in `chain` for
// transparency.
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

/** Module keys the maintenance record answers to (moduleRegistry key first). */
export const MAINTENANCE_MODULE_KEYS = Object.freeze([
  'maintenance', 'sign_maintenance', 'maintenance_project',
  'sign_maintenance_project', 'service', 'maintenance_service',
] as const);

/**
 * Line cost-base spellings — single-total fields taken as already EXTENDED
 * (calcServiceItem's item_total_cost first: labor_cost + materials_cost with
 * the billable unit count already folded in).
 */
const LINE_COST_FIELDS = [
  'item_total_cost', 'line_total_cost', 'total_cost', 'extended_cost',
  'line_cost', 'item_cost', 'cost', 'computed_cost',
] as const;

/**
 * Component-pair fallback: calcServiceItem always writes labor_cost and
 * materials_cost alongside item_total_cost (extended). When the total field
 * is absent the pair reproduces the line cost exactly; either field finite
 * engages the fallback (the other reads as 0).
 */
const LINE_COMPONENT_FIELDS = ['labor_cost', 'materials_cost'] as const;

/**
 * Billable unit count — the live page persists `qty` (letters on the letter
 * axis, cabinets on the cabinet axis); the legacy maintenanceCalc shape
 * persists `quantity` (sign count).
 */
const LINE_QTY_FIELDS = ['qty', 'quantity', 'count'] as const;

const LINE_LABEL_FIELDS = ['description', 'label', 'name', 'item_name', 'part_name', 'service_name'] as const;

/** Persisted items carry no stable id today — positional idx-N keys fall out. */
const LINE_KEY_FIELDS = ['builder_item_id', 'id', 'item_id', 'service_item_id', 'key', 'line_id'] as const;

/** sign_type (flush_channel|halo_channel|raceway_channel|capsule_logo|dimensional_letters|monument_sign|pylon_sign|post_and_panel) doubles as the pricing category. */
const LINE_CATEGORY_FIELDS = ['category_key', 'category', 'part_category', 'pricing_category', 'service_category', 'sign_type'] as const;

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
export const MAINTENANCE_ENGINE_LINE_FIELDS: readonly string[] = Object.freeze([
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
 * act on? An empty pricing:{} block, a maintenance sign/size/unit enum
 * (sign_type 'monument_sign', size 'cab_medium', material pricing_mode
 * 'per_letter_flat', usage_basis 'per_sqft', action id 'led_retrofit') or a
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
// maintenance record -> normalized lines
// ---------------------------------------------------------------------------

export interface MaintenanceWireLine {
  /** Stable key — builder_item_id, else item id, else positional tag. */
  key: string;
  index: number;
  label: string;
  qty: number;
  /** Line-level computed cost (module-authored, EXTENDED). null = unknown. */
  cost: number | null;
  category_key: string;
  /** The raw maintenance service-item row. */
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
 * The line's module-authored EXTENDED cost base: a persisted single-total
 * field first (calcServiceItem's item_total_cost), else the labor_cost +
 * materials_cost component pair the page writes alongside it. null = no cost
 * base. Both spellings are already extended (the billable unit count is
 * folded in by the module), so no per-unit disambiguation is needed.
 */
const lineCostOf = (item: Record<string, unknown>): number | null => {
  const direct = firstFinite(item, LINE_COST_FIELDS);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber(item[f]) !== null);
  if (!hasComponent) return null;
  return LINE_COMPONENT_FIELDS.reduce((s, f) => s + num(item[f]), 0);
};

/**
 * Normalize a MaintenanceProject-like record to the wire's line list. The
 * persisted flat `record.items` list is the only line source — service items
 * have no nested workflow structures, and the materials[]/actions[] rows
 * inside each item stay inside the line's cost base.
 */
export function maintenanceRecordLines(record: unknown): MaintenanceWireLine[] {
  if (!isRecord(record)) return [];
  const flat = (Array.isArray(record.items) ? (record.items as unknown[]).filter(isRecord) : []) as Record<string, unknown>[];
  return flat.map((item, index) => ({
    key: lineKey(item, index),
    index,
    label: asString(firstField(item, LINE_LABEL_FIELDS)) || asString(item.sign_type) || `Item ${index + 1}`,
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

export interface MaintenancePricingContext {
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
 * default markup (the same percent that produced markup_amount — so a
 * configured-but-unresolved line naturally lands on its own baseline).
 */
export function maintenancePricingContextOf(record: unknown, callerContext: unknown = null): MaintenancePricingContext {
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
export function maintenanceLineDescriptor(line: MaintenanceWireLine | Record<string, unknown>, record: unknown = null): Record<string, unknown> | null {
  const item = isRecord((line as MaintenanceWireLine)?.item)
    ? (line as MaintenanceWireLine).item
    : (isRecord(line) ? (line as Record<string, unknown>) : null);
  if (!item) return null;

  const flat: Record<string, unknown> = {};
  for (const f of MAINTENANCE_ENGINE_LINE_FIELDS) {
    if (item[f] !== undefined) flat[f] = item[f];
  }

  const block = engineBlockOf(record);
  const lineMap = firstRecord(block, ENGINE_LINE_MAP_FIELDS);
  const mapEntry = lineMap
    ? (isRecord(lineMap[(line as MaintenanceWireLine)?.key]) ? lineMap[(line as MaintenanceWireLine).key] as Record<string, unknown>
      : isRecord(lineMap[asString((line as MaintenanceWireLine)?.index)]) ? lineMap[asString((line as MaintenanceWireLine)?.index)] as Record<string, unknown>
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

export interface MaintenanceConfigScan {
  configured: boolean;
  configuredCount: number;
  lineCount: number;
  /** per-line detection detail for the chain trace. */
  lines: Array<{ key: string; label: string; configured: boolean; hasCost: boolean }>;
}

/**
 * Detection only — which maintenance service items carry pricing-engine
 * config. Cheap and side-effect free; callers may use it to decide whether
 * engine resolution is needed at all.
 */
export function maintenanceConfigScan(record: unknown, lines?: MaintenanceWireLine[]): MaintenanceConfigScan {
  const wireLines = Array.isArray(lines) ? lines : maintenanceRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = maintenanceLineDescriptor(line, record);
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
// resolveMaintenanceSellPricing
// ---------------------------------------------------------------------------

export interface MaintenanceWireEngine {
  /** pricingEngine.pricePart — required; without it the wire passthroughs. */
  pricePart?: (input: any) => any;
  /** pricingTemplateModel.resolveTemplatePrice — optional template layer. */
  resolveTemplatePrice?: (input: any) => any;
  /** pricingTemplateModel.templatePartDescriptor — encodes a template hit. */
  templatePartDescriptor?: (part: any, resolution: any) => any;
}

export interface MaintenanceSellLineResult {
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

export interface MaintenanceSellPricingResult {
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
  lines: MaintenanceSellLineResult[];
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
  reason: MaintenanceSellPricingResult['reason'],
  baselineSell: number,
  internalCost: number,
  markupPct: number,
  lines: MaintenanceSellLineResult[],
  chain: MaintenanceSellPricingResult['chain'],
  warnings: string[],
  contextUsed: MaintenanceSellPricingResult['context_used'],
): MaintenanceSellPricingResult => ({
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
 * Resolve the maintenance project sell price through the injected pricing
 * engine.
 *
 * input.record          MaintenanceProject-like (items[])
 * input.lines           optional explicit MaintenanceWireLine[] override
 * input.baselineSell    the module's sell price today (record.total_cost /
 *                       sourceProjectEconomics customerPrice) — returned
 *                       verbatim on every passthrough path
 * input.internalCost    module internal cost (record.subtotal /
 *                       total_cost - markup_amount), echoed only
 * input.markupPercent   baseline sell factor; default record.markup_percent,
 *                       else markup_amount/subtotal
 * input.context         maintenancePricingContextOf-compatible registries
 *                       (merged over the record-embedded engine block)
 * input.engine          injected { pricePart, resolveTemplatePrice,
 *                       templatePartDescriptor }
 * input.now             effective-window override (tests)
 */
export function resolveMaintenanceSellPricing(input: any = {}): MaintenanceSellPricingResult {
  const warnings: string[] = [];
  const chain: MaintenanceSellPricingResult['chain'] = [];
  const record = isRecord(input.record) ? input.record : null;
  const baselineSell = num(input.baselineSell ?? input.baseline_sell);
  const internalCost = num(input.internalCost ?? input.internal_cost);

  const rec = record ?? {};
  const subtotalBase = firstFinite(rec, ['subtotal']);
  const markupPct = firstFinite(input, ['markupPercent', 'markup_percent'])
    ?? firstFinite(rec, ['markup_percent'])
    ?? (subtotalBase && subtotalBase > 0 ? (num(rec.markup_amount) / subtotalBase) * 100 : 0);

  const context = maintenancePricingContextOf(rec, input.context);
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

  const engine: MaintenanceWireEngine = isRecord(input.engine) ? input.engine : {};
  const pricePart = typeof engine.pricePart === 'function' ? engine.pricePart : null;

  // --- line normalization -----------------------------------------------------
  const wireLines: MaintenanceWireLine[] = Array.isArray(input.lines) && input.lines.length
    ? input.lines
    : maintenanceRecordLines(rec);

  const scan = maintenanceConfigScan(rec, wireLines);
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
  const results: MaintenanceSellLineResult[] = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;

  wireLines.forEach((line, position) => {
    const rawItem = isRecord(line?.item) ? line.item : (isRecord(line) ? (line as Record<string, unknown>) : {});
    const descriptor = maintenanceLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    // Tolerate raw item rows passed via input.lines (qty/cost not yet folded).
    const cost = line.cost !== undefined ? line.cost : lineCostOf(rawItem);
    const qty = (num(line.qty ?? firstField(rawItem, LINE_QTY_FIELDS), 1) || 0);
    const base: MaintenanceSellLineResult = {
      key: line.key || lineKey(rawItem, position),
      label: line.label || asString(firstField(rawItem, LINE_LABEL_FIELDS)) || asString(rawItem.sign_type) || `Item ${position + 1}`,
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
