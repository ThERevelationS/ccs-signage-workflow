// Channel-letter module -> pricingEngine sell-price wire — pure TS, ZERO
// imports, NO IO. (ESTIMATOR_MASTERPLAN F-23a; architecture decision in
// docs/pricing-engine.md §4: "inject the shared engine underneath the module
// estimators as the sell-price stage" — the module's cost math stays
// authoritative, the engine standardizes the sell tail.)
//
// This file is the DETECTION + RESOLUTION layer only. It never imports the
// engine; the caller injects it (`engine: { pricePart, resolveTemplatePrice?,
// templatePartDescriptor? }`) so the same file bundles for the Vite frontend
// AND Deno-style functions.
//
// ---------------------------------------------------------------------------
// ZERO-REGRESSION CONTRACT
// ---------------------------------------------------------------------------
// When a channel record/line carries NO engine config — no `pricing_engine`
// context block and no line-level tier/template/override descriptor — every
// resolver returns a PASSTHROUGH marker and `sellPrice`/`sellTotal` echo the
// input costs VERBATIM (no rounding, no re-ordering). Callers keep today's
// math byte-identically in that case. Legacy `customer_pricing` /
// `pricing_tier` / `customer_tier` record fields are the OLD MarkupTier
// system: by themselves they never count as engine config — they only feed a
// real `pricing_engine` block as the customer-tier hint.
//
// ---------------------------------------------------------------------------
// Entity contract — canonical stored spellings
// ---------------------------------------------------------------------------
//   ChannelLetterInstallation record (saved by ChannelLetterEstimator.jsx):
//     items[]               {item_total_cost, labor_cost, materials_cost,
//                            labor_hours, qty_letters, description,
//                            installation_type, materials[] (unit-cost enums —
//                            NEVER scanned for engine fields)}
//     letter_purchases[]    {total_cost, qty, unit_cost, letter_type,
//                            description, fab_config{material_cost,
//                            paint_material_cost, cnc_labor_cost,
//                            paint_labor_cost}, raceway_total, backer_total}
//     selected_equipment[]  {total_cost, equipment_name, equipment_id}
//     personnel[]           {total_cost | hourly_rate*hours, name|role}
//     labor_priced_via_personnel / labor_cost_in_subtotal
//                           (personnel rows REPLACE flat-rate item labor)
//     letters_subtotal, total_letters_cost, letters_*_fee (delivery/design/
//                            install_supplies/permitting/other — delivery is
//                            skipped when EVERY purchase is dimensional_letters)
//     total_supplies_cost, total_travel_cost, subtotal, markup_amount,
//                            markup_percent, total_cost
//
//   Engine context block (TOLERATED EXTRA — no declared field today):
//     record.pricing_engine | engine_pricing | pricing_tier_config |
//       pricing_context | customer_pricing.engine_context |
//       customer_pricing.pricing_engine  — object carrying:
//         customer_tier|customerTier|tier        tier key(s) for the chart
//         tier_rules|tierRules|rules|matrix|matrix_rows|rows|pricing_matrix
//                                                PricingTierMatrix-like rows
//         template|pricing_template              descriptor passed to
//                                                resolveTemplatePrice opts
//         templates|pricing_templates            PricingTemplate registry rows
//         tiers|markup_tiers                     MarkupTier catalog rows
//         machine|machine_override               machine descriptor
//         default_markup_pct|defaultMarkupPct|default_markup|markup_pct
//                                                shop fallback % (blank ->
//                                                record.markup_percent)
//         taxable, tax_percent|taxPercent, setup_fee|setupFee,
//         minimum_charge|minimumCharge|min_charge, modifiers|formula_modifiers
//
//   Line-level config (TOLERATED EXTRA on items[] / letter_purchases[] /
//   selected_equipment[] / personnel[] rows):
//     part descriptor objects   part|pricing|price_config|tier_config|
//                               sell_pricing  — scanned for engine override
//                               fields (same vocabulary as inline below)
//     inline override fields    tier_ref|tier|tier_name,
//                               fixed_price|price_override|override_price,
//                               per_unit_breaks|unit_breaks|qty_breaks,
//                               markup_pct|markup|markup_percent,
//                               pricing_mode|price_mode (RECOGNIZED tokens
//                               only — 'market','market_based','fixed',
//                               'cost_plus' family; unit enums like
//                               'per_letter_flat'/'per_day' are ignored),
//                               market_retail, market_discount_pct,
//                               formula_modifiers|modifiers,
//                               minimum_charge|min_charge, setup_fee,
//                               customer_tier, tier_rules|matrix,
//     template refs             pricing_template_id|template_id|
//                               margin_template_id|pricing_template_name|
//                               template_name  (+ embedded pricing_template|
//                               template|price_template record)
//     machine descriptor        machine|machine_override|machine_pricing|
//                               equipment_pricing
//
// ---------------------------------------------------------------------------
// Resolution model
// ---------------------------------------------------------------------------
//   channelEngineContext(record)  — finds + normalizes the context block.
//   channelLinePricingConfig(line)— per-line engine-config detection.
//   channelCostLines(record)      — projects the saved record into granular
//                                   cost lines mirroring
//                                   categorizeChannelLetterProject's
//                                   aggregation (per-purchase [dimensional
//                                   fab split], letter fees, per-item labor
//                                   [dropped when personnel-priced] +
//                                   materials, equipment, personnel,
//                                   supplies, travel). Sum = the record's
//                                   internalCost basis.
//   wireChannelLineSell           — one line: passthrough marker or
//                                   engine.pricePart() breakdown + chain.
//   wireChannelProjectSell        — roll-up over channelCostLines; all-
//                                   passthrough -> verbatim sum.
//   channelEngineEconomics        — the boundary helper consumed by
//                                   customerPricing.sourceProjectEconomics:
//                                   {wired:false,passthrough} or
//                                   {wired:true, internalCost (echoed),
//                                    customerPrice: engine sellTotal, sell}.
//
// Engagement rules (documented for sibling wires):
//   * `pricing_engine` context block present -> EVERY line runs through the
//     engine (per-line descriptors override where present; unconfigured lines
//     price via the context chart/default markup — the engine owns the tail).
//   * Only line-level config (no context) -> configured lines engine-priced,
//     unconfigured lines passthrough VERBATIM ("tier config changes price
//     only where assigned").
//   * Neither -> all-passthrough, byte-identical.
//   * When BOTH a legacy saved customer_pricing.total AND engine config
//     exist, the engine wins — the explicit pricing_engine block / line
//     descriptors are the newer, more specific layer (recorded in chain).
//
// ---------------------------------------------------------------------------
// Schema gaps (orchestrator notes — nothing required for the core path)
// ---------------------------------------------------------------------------
//   - pricing_engine context block + every line-level config field are
//     TOLERATED EXTRAS persisted inside the project JSON; no entity field is
//     declared for them today. Declare canonical fields when admin surfaces
//     write them.
//   - templates / tiers / tier_rules registries ride inside the context block;
//     a future loader can persist refs instead (the resolvers also accept
//     ref-only descriptors — resolution happens against supplied registries).
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normStr = (v: unknown): string => String(v ?? '').trim().toLowerCase();

const round2 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const round4 = (n: unknown): number => Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

const firstField = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): unknown => {
  if (!rec) return undefined;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const firstFinite = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): number | null => {
  if (!rec) return null;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

const firstNonBlank = (rec: Record<string, unknown> | null | undefined, fields: readonly string[]): unknown =>
  firstField(rec, fields);

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Module keys the channel record answers to (moduleRegistry + module names). */
export const CHANNEL_MODULE_KEYS = Object.freeze([
  'channel_letters', 'channel_letter', 'channel_letter_installation',
] as const);

/** Record-level fields probed for the engine context block (in order). */
export const CHANNEL_ENGINE_CONTEXT_FIELDS = Object.freeze([
  'pricing_engine', 'engine_pricing', 'pricing_tier_config', 'pricing_context',
] as const);

/** customer_pricing sub-fields also probed (the saved tier snapshot block). */
export const CHANNEL_NESTED_CONTEXT_FIELDS = Object.freeze([
  'engine_context', 'pricing_engine',
] as const);

/** Line-level fields that may hold an engine part/override descriptor. */
export const CHANNEL_LINE_PART_FIELDS = Object.freeze([
  'part', 'pricing', 'price_config', 'tier_config', 'sell_pricing',
] as const);

/** Line-level fields that may hold a machine descriptor. */
export const CHANNEL_LINE_MACHINE_FIELDS = Object.freeze([
  'machine', 'machine_override', 'machine_pricing', 'equipment_pricing',
] as const);

/** Line-level fields that may hold / reference a PricingTemplate. */
export const CHANNEL_LINE_TEMPLATE_FIELDS = Object.freeze([
  'pricing_template', 'price_template', 'template',
] as const);
export const CHANNEL_LINE_TEMPLATE_ID_FIELDS = Object.freeze([
  'pricing_template_id', 'template_id', 'margin_template_id',
] as const);
export const CHANNEL_LINE_TEMPLATE_NAME_FIELDS = Object.freeze([
  'pricing_template_name', 'template_name',
] as const);

/** Recognized pricing-mode tokens (mirrors pricingEngine MODE_TOKENS — kept
 * local because this file never imports). Unit enums such as 'per_letter_flat'
 * or 'per_day' are deliberately NOT here and never count as config. */
const ENGINE_MODE_TOKENS: ReadonlySet<string> = new Set([
  'fixed', 'fixed_price', 'flat',
  'market', 'market_based', 'market-based', 'retail', 'retail_minus_discount',
  'cost_plus', 'cost-plus', 'costplus', 'markup', 'tier', 'tier_markup', 'tiered',
]);

/** Inline override fields scanned on a raw line/descriptor. */
const FIXED_PRICE_FIELDS = ['fixed_price', 'price_override', 'override_price'] as const;
const BREAK_FIELDS = ['per_unit_breaks', 'unit_breaks', 'qty_breaks'] as const;
const MARKUP_FIELDS = ['markup_pct', 'markup', 'markup_percent'] as const;
const MARKET_RETAIL_FIELDS = ['market_retail', 'retail_price', 'retail'] as const;
const TIER_REF_FIELDS = ['tier_ref'] as const;
const MODIFIER_FIELDS = ['formula_modifiers', 'modifiers'] as const;
const MIN_CHARGE_FIELDS = ['minimum_charge', 'min_charge'] as const;
const TIER_RULES_FIELDS = ['tier_rules', 'tierRules', 'rules', 'matrix', 'matrix_rows', 'rows', 'pricing_matrix'] as const;
const CUSTOMER_TIER_FIELDS = ['customer_tier', 'customerTier'] as const;
const SETUP_FEE_FIELDS = ['setup_fee', 'setupFee'] as const;
const TAX_PCT_FIELDS = ['tax_percent', 'taxPercent'] as const;
const MODE_FIELDS = ['pricing_mode', 'price_mode', 'mode', 'active_mode'] as const;
const TEMPLATE_REGISTRY_FIELDS = ['templates', 'pricing_templates'] as const;
const TIER_CATALOG_FIELDS = ['tiers', 'markup_tiers'] as const;
const DEFAULT_MARKUP_FIELDS = ['default_markup_pct', 'defaultMarkupPct', 'default_markup'] as const;

const nonBlank = (v: unknown): boolean => normStr(v) !== '';

const hasBreakChart = (src: any): boolean =>
  BREAK_FIELDS.some((f) => Array.isArray(src?.[f]) && src[f].length > 0);

const hasTemplateEmbed = (src: any): boolean =>
  CHANNEL_LINE_TEMPLATE_FIELDS.some((f) => isRecord(src?.[f]));

const templateRefValue = (src: any): { ref: unknown; via: string } | null => {
  for (const f of CHANNEL_LINE_TEMPLATE_ID_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_NAME_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
    const v = src?.[f];
    if (v !== undefined && v !== null && !isRecord(v) && nonBlank(v)) return { ref: v, via: f };
  }
  return null;
};

/**
 * Does one record carry ANY engine override/context signal? Shared by
 * line-level scanning and part-descriptor sub-object scanning. Mirrors
 * pricingEngine.overrideRule's own precedence of what counts as a signal:
 * fixed price (positive) > tier ref > break chart > recognized mode/market
 * fields > markup pct (nonzero) > modifiers/minimums. `tier_rules` /
 * `customer_tier` are context signals — a line carrying its own chart IS
 * tier config.
 */
function descriptorConfigured(src: any): { configured: boolean; via: string[] } {
  const via: string[] = [];
  if (!isRecord(src)) return { configured: false, via };
  const fixed = firstFinite(src, FIXED_PRICE_FIELDS);
  if (fixed !== null && fixed > 0) via.push('fixed_price');
  for (const f of TIER_REF_FIELDS) if (nonBlank(src[f])) via.push(f);
  // bare `tier`/`tier_name` count only as override tokens when they carry a
  // non-blank value — they are context fields on descriptors but a pinned
  // tier ref is config.
  for (const f of ['tier', 'tier_name'] as const) if (nonBlank(src[f])) via.push(f);
  if (hasBreakChart(src)) via.push('per_unit_breaks');
  const retail = firstFinite(src, MARKET_RETAIL_FIELDS);
  if (retail !== null && retail > 0) via.push('market_retail');
  const mode = firstField(src, MODE_FIELDS);
  if (mode !== undefined && ENGINE_MODE_TOKENS.has(normStr(mode))) via.push('pricing_mode');
  const markup = firstFinite(src, MARKUP_FIELDS);
  if (markup !== null && markup !== 0) via.push('markup_pct');
  for (const f of MODIFIER_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) { via.push('formula_modifiers'); break; }
  }
  if (firstFinite(src, MIN_CHARGE_FIELDS) !== null) via.push('minimum_charge');
  if (firstFinite(src, SETUP_FEE_FIELDS) !== null) via.push('setup_fee');
  for (const f of TIER_RULES_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) { via.push('tier_rules'); break; }
  }
  for (const f of CUSTOMER_TIER_FIELDS) {
    if (nonBlank(src[f])) { via.push('customer_tier'); break; }
  }
  if (templateRefValue(src) || hasTemplateEmbed(src)) via.push('pricing_template');
  return { configured: via.length > 0, via };
}

// ---------------------------------------------------------------------------
// channelEngineContext — record-level context block resolution
// ---------------------------------------------------------------------------

export interface ChannelEngineContext {
  /** Marker so callers can pass the normalized context back without a rescan. */
  __channelPricingContext: true;
  /** Which record field supplied the block ('' when synthesized). */
  field: string;
  /** Customer tier value/keys for chart matching (null when unset). */
  customerTier: unknown;
  /** PricingTierMatrix-like chart rows for resolveTier/pricePart. */
  tierRules: unknown[];
  /** Optional context-level template descriptor (record object or ref). */
  template: unknown;
  /** PricingTemplate registry rows for resolveTemplatePrice. */
  templates: unknown[];
  /** MarkupTier-like catalog rows (tier-key expansion). */
  tiers: unknown[];
  /** Context-level machine descriptor. */
  machine: unknown;
  /** Shop fallback markup pct (defaults to record.markup_percent). */
  defaultMarkupPct: number;
  /** Context-level floors/fees/tax applied to every engine-priced line. */
  taxable: boolean | undefined;
  taxPercent: number;
  setupFee: number;
  minimumCharge: number;
  modifiers: unknown[] | undefined;
  /** The raw context block (audit echo). */
  raw: unknown;
}

/**
 * Find + normalize the record's engine context block.
 * Returns null when NO context block exists — legacy customer_pricing /
 * pricing_tier / customer_tier alone never constitute an engine context
 * (zero-regression gate). When a block exists but a field is absent the
 * record's own values fill in (markup_percent -> defaultMarkupPct;
 * customer_tier/pricing_tier/customer_pricing tier -> customerTier).
 */
export function channelEngineContext(source: any): ChannelEngineContext | null {
  if (source && source.__channelPricingContext === true) return source as ChannelEngineContext;
  if (!isRecord(source)) return null;

  let block: any = null;
  let field = '';
  for (const f of CHANNEL_ENGINE_CONTEXT_FIELDS) {
    if (isRecord(source[f])) { block = source[f]; field = f; break; }
  }
  if (!block && isRecord(source.customer_pricing)) {
    for (const f of CHANNEL_NESTED_CONTEXT_FIELDS) {
      if (isRecord(source.customer_pricing[f])) {
        block = source.customer_pricing[f];
        field = `customer_pricing.${f}`;
        break;
      }
    }
  }
  if (!block) return null;

  const firstArr = (src: any, fields: readonly string[]): unknown[] => {
    for (const f of fields) if (Array.isArray(src?.[f]) && src[f].length > 0) return src[f];
    return [];
  };

  const cp = isRecord(source.customer_pricing) ? source.customer_pricing : null;
  const customerTier =
    firstNonBlank(block, [...CUSTOMER_TIER_FIELDS, 'tier']) ??
    firstNonBlank(source, [...CUSTOMER_TIER_FIELDS, 'pricing_tier']) ??
    (cp ? (cp.tier_number ?? cp.tier_name ?? undefined) : undefined) ??
    null;

  const defaultMarkup =
    firstFinite(block, DEFAULT_MARKUP_FIELDS) ??
    firstFinite(block, MARKUP_FIELDS) ??
    (Number.isFinite(Number(source.markup_percent)) ? num(source.markup_percent) : 0);

  return {
    __channelPricingContext: true,
    field,
    customerTier,
    tierRules: firstArr(block, TIER_RULES_FIELDS),
    template: firstField(block, ['template', 'pricing_template']),
    templates: firstArr(block, TEMPLATE_REGISTRY_FIELDS),
    tiers: firstArr(block, TIER_CATALOG_FIELDS),
    machine: firstField(block, ['machine', 'machine_override']),
    defaultMarkupPct: num(defaultMarkup),
    taxable: typeof block.taxable === 'boolean' ? block.taxable
      : normStr(block.taxable) === 'false' ? false
      : normStr(block.taxable) === 'true' ? true : undefined,
    taxPercent: num(firstFinite(block, TAX_PCT_FIELDS)),
    setupFee: num(firstFinite(block, SETUP_FEE_FIELDS)),
    minimumCharge: num(firstFinite(block, MIN_CHARGE_FIELDS)),
    modifiers: Array.isArray(block.modifiers) ? block.modifiers
      : Array.isArray(block.formula_modifiers) ? block.formula_modifiers : undefined,
    raw: block,
  };
}

// ---------------------------------------------------------------------------
// channelLinePricingConfig — per-line engine-config detection
// ---------------------------------------------------------------------------

export interface ChannelLineConfig {
  /** True when the line carries any engine signal (descriptor/context/ref). */
  configured: boolean;
  /** Engine `part` descriptor — line-level object merged over inline fields. */
  part: any;
  /** Engine `machine` descriptor (null when absent). */
  machine: any;
  /** Template descriptor: embedded record, scalar ref, or null. */
  template: unknown;
  /** Which signals fired (audit). */
  via: string[];
}

/**
 * Detect engine config on a channel line (raw item / letter_purchase /
 * equipment / personnel row — or an already-projected cost line whose `line`
 * ref is the raw row). Descriptor objects under part|pricing|price_config|
 * tier_config|sell_pricing are scanned first; inline override fields on the
 * line itself merge underneath them.
 *
 * Deliberately NOT config (all present on today's saved records):
 *   materials[].pricing_mode unit enums ('per_letter_flat', ...),
 *   equipment pricing_mode duration enums ('per_day', 'per_hour', 'owned_flat'),
 *   unit_cost_override / *_total_override cost-side flags,
 *   qty / unit_cost / total_cost cost fields.
 */
export function channelLinePricingConfig(line: any): ChannelLineConfig {
  const src: any = isRecord(line?.line) && !isRecord(line?.part)
    ? line.line // projected cost line: config lives on the raw row
    : line;
  const via: string[] = [];

  // 1. Descriptor objects (first non-empty one wins; all scanned for `via`).
  let part: any = null;
  for (const f of CHANNEL_LINE_PART_FIELDS) {
    const d = src?.[f];
    if (!isRecord(d)) continue;
    const probe = descriptorConfigured(d);
    via.push(...probe.via.map((v) => `${f}.${v}`));
    if (probe.configured && !part) part = { ...d, __via: f };
  }

  // 2. Inline override/context fields on the line itself.
  const inline = descriptorConfigured(src);
  if (inline.configured) {
    via.push(...inline.via);
    const merged: any = {};
    for (const f of [
      ...FIXED_PRICE_FIELDS, ...TIER_REF_FIELDS, 'tier', 'tier_name',
      ...BREAK_FIELDS, ...MARKET_RETAIL_FIELDS, 'market_discount_pct',
      ...MODE_FIELDS, ...MARKUP_FIELDS, ...MODIFIER_FIELDS,
      ...MIN_CHARGE_FIELDS, ...SETUP_FEE_FIELDS,
    ]) {
      if (src[f] !== undefined && src[f] !== null && src[f] !== '') merged[f] = src[f];
    }
    part = part ? { ...merged, ...part } : merged; // explicit part object wins on conflict
  }

  // 3. Machine descriptor.
  let machine: any = null;
  for (const f of CHANNEL_LINE_MACHINE_FIELDS) {
    if (isRecord(src?.[f])) {
      machine = src[f];
      via.push(f);
      break;
    }
  }

  // 4. Template ref/embedding.
  let template: unknown = null;
  const tref = templateRefValue(src);
  if (tref) { template = tref.ref; via.push(tref.via); }
  else {
    for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
      if (isRecord(src?.[f])) { template = src[f]; via.push(f); break; }
    }
  }
  if (!template && isRecord(part)) {
    const ptref = templateRefValue(part);
    if (ptref) { template = ptref.ref; via.push(`part.${ptref.via}`); }
    else {
      for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
        if (isRecord(part[f])) { template = part[f]; via.push(`part.${f}`); break; }
      }
    }
  }

  return { configured: via.length > 0, part, machine, template, via };
}

// ---------------------------------------------------------------------------
// channelCostLines — project the saved record into granular cost lines
// ---------------------------------------------------------------------------

export interface ChannelCostLine {
  /** Deterministic key ('purchase:0', 'item:2:labor', 'supplies', ...). */
  key: string;
  label: string;
  /** The module-authoritative cost for this line (verbatim from the record). */
  cost: number;
  /** Pricing-unit qty for break charts (real qty where the module has one). */
  qty: number;
  /** Unit cost base = cost/qty when qty>0, else cost. */
  unitCost: number;
  /** Markup-category key (categorizeChannelLetterProject parity). */
  category: string;
  /** Which record family produced the line. */
  family: 'letter_purchase' | 'letter_fees' | 'install_item' | 'equipment'
    | 'personnel' | 'supplies' | 'travel' | 'other';
  /** The raw record row — line-level engine config is read off this. */
  line: any;
}

const labelOr = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
};

/**
 * Granular cost projection of a saved channel record. Mirrors
 * categorizeChannelLetterProject's aggregation rules (dimensional fab split,
 * delivery-fee exclusion when every purchase is dimensional, personnel-priced
 * labor replacing flat-rate item labor) but keeps per-row granularity so a
 * part/line carrying tier config prices on its own.
 *
 * Sum invariant: Σ cost == labor_cost_in_subtotal + total_materials_cost +
 * total_supplies_cost + total_equipment_cost + total_personnel_cost +
 * total_travel_cost + letters_subtotal  == the record's internalCost basis.
 */
export function channelCostLines(record: any): ChannelCostLine[] {
  if (!isRecord(record)) return [];
  const lines: ChannelCostLine[] = [];
  const push = (l: Omit<ChannelCostLine, 'unitCost'> & { unitCost?: number }) => {
    const cost = num(l.cost);
    const qty = num(l.qty, 0) > 0 ? num(l.qty) : 1;
    const unitCost = Number.isFinite(Number(l.unitCost))
      ? num(l.unitCost)
      : (num(l.qty, 0) > 0 ? cost / num(l.qty) : cost);
    lines.push({ ...l, cost, qty, unitCost } as ChannelCostLine);
  };

  // 1. Letter purchases — dimensional splits into material / fab labor /
  //    remainder (categorizer parity); others stay one line.
  const purchases = Array.isArray(record.letter_purchases) ? record.letter_purchases : [];
  purchases.forEach((lp: any, i: number) => {
    const total = num(lp?.total_cost, num(lp?.line_total, num(lp?.qty, 0) * num(lp?.unit_cost)));
    if (total <= 0) return;
    const desc = labelOr(lp?.description, lp?.letter_type, `Purchase ${i + 1}`);
    const qty = num(lp?.qty, 0);
    const isDimensional = lp?.letter_type === 'dimensional_letters';
    if (isDimensional && isRecord(lp?.fab_config)) {
      const matCost = num(lp.fab_config.material_cost) + num(lp.fab_config.paint_material_cost);
      const laborCost = num(lp.fab_config.cnc_labor_cost) + num(lp.fab_config.paint_labor_cost);
      if (matCost > 0) {
        push({ key: `purchase:${i}:material`, label: `Dimensional Letter Material — ${desc}`,
          cost: matCost, qty, category: 'substrates', family: 'letter_purchase', line: lp });
      }
      if (laborCost > 0) {
        push({ key: `purchase:${i}:labor`, label: `Dimensional Letter Fab Labor — ${desc}`,
          cost: laborCost, qty, category: 'inhouse_labor', family: 'letter_purchase', line: lp });
      }
      const remainder = total - matCost - laborCost;
      if (remainder > 0.01) {
        push({ key: `purchase:${i}:other`, label: `Dimensional Letter (other) — ${desc}`,
          cost: remainder, qty, category: 'substrates', family: 'letter_purchase', line: lp });
      }
    } else {
      push({
        key: `purchase:${i}`,
        label: isDimensional ? `Dimensional Letters — ${desc}` : `Letter Purchase — ${desc}`,
        cost: total, qty, category: isDimensional ? 'substrates' : 'outsourced_fab',
        family: 'letter_purchase', line: lp,
      });
    }
  });

  // 2. Letter fees — delivery excluded when EVERY purchase is dimensional
  //    (calcLettersTotals + categorizer parity).
  const onlyDimensional = purchases.length > 0 &&
    purchases.every((lp: any) => lp?.letter_type === 'dimensional_letters');
  const letterFees =
    (onlyDimensional ? 0 : num(record.letters_delivery_fee)) +
    num(record.letters_design_fee) +
    num(record.letters_install_supplies_fee) +
    num(record.letters_permitting_fee) +
    num(record.letters_other_fee);
  if (letterFees > 0) {
    // `line: null` — the raw row here would be the whole record, whose own
    // legacy fields (markup_percent, customer_pricing, customer_tier) must
    // never trip line-level detection. Project-level lines configure through
    // the pricing_engine context instead.
    push({ key: 'letter_fees', label: 'Letter Fees (delivery/design/permit/etc.)',
      cost: letterFees, qty: 1, category: 'outsourced_fab', family: 'letter_fees', line: null });
  }

  // 3. Install items — labor + materials sub-lines. When a crew is assigned,
  //    personnel pricing REPLACES flat-rate item labor (labor_cost_in_subtotal
  //    = 0) so the labor sub-line drops to keep the sum on internalCost.
  const laborViaPersonnel = record.labor_priced_via_personnel !== undefined
    ? !!record.labor_priced_via_personnel
    : num(record.total_personnel_cost) > 0;
  const items = Array.isArray(record.items) ? record.items : [];
  items.forEach((it: any, i: number) => {
    const desc = labelOr(it?.description, it?.installation_type, `Item ${i + 1}`);
    const laborCost = num(it?.labor_cost);
    const materialsCost = num(it?.materials_cost);
    if (!laborViaPersonnel && laborCost > 0) {
      push({ key: `item:${i}:labor`, label: `Install Labor — ${desc}`,
        cost: laborCost, qty: num(it?.qty_letters, 0) || 1,
        category: 'inhouse_labor', family: 'install_item', line: it });
    }
    if (materialsCost > 0) {
      push({ key: `item:${i}:materials`, label: `Install Materials — ${desc}`,
        cost: materialsCost, qty: num(it?.qty_letters, 0) || 1,
        category: 'outsourced_fab', family: 'install_item', line: it });
    }
    if (!laborViaPersonnel && laborCost <= 0 && materialsCost <= 0 && num(it?.item_total_cost) > 0) {
      // Older saved shapes without the split — take the stored total whole.
      push({ key: `item:${i}`, label: `Install Item — ${desc}`,
        cost: num(it.item_total_cost), qty: num(it?.qty_letters, 0) || 1,
        category: 'outsourced_fab', family: 'install_item', line: it });
    }
    if (laborViaPersonnel && materialsCost <= 0 && laborCost <= 0 && num(it?.item_total_cost) > 0) {
      // Personnel-priced record whose item only carries the combined total:
      // charge the materials share only (labor already lives in personnel).
      const matShare = num(it.item_total_cost) - laborCost;
      if (matShare > 0) {
        push({ key: `item:${i}`, label: `Install Materials — ${desc}`,
          cost: matShare, qty: num(it?.qty_letters, 0) || 1,
          category: 'outsourced_fab', family: 'install_item', line: it });
      }
    }
  });

  // 4. Equipment rows.
  (Array.isArray(record.selected_equipment) ? record.selected_equipment : []).forEach((sel: any, i: number) => {
    const cost = num(sel?.total_cost);
    if (cost <= 0) return;
    push({ key: `equipment:${i}`, label: `Equipment — ${labelOr(sel?.equipment_name, sel?.equipment_id, `Row ${i + 1}`)}`,
      cost, qty: 1, category: 'outsourced_services', family: 'equipment', line: sel });
  });

  // 5. Personnel rows.
  (Array.isArray(record.personnel) ? record.personnel : []).forEach((p: any, i: number) => {
    const cost = num(p?.total_cost, num(p?.hourly_rate) * num(p?.hours));
    if (cost <= 0) return;
    push({ key: `personnel:${i}`, label: `Crew — ${labelOr(p?.name, p?.role, p?.title, `Row ${i + 1}`)}`,
      cost, qty: num(p?.hours, 0) || 1, category: 'inhouse_labor', family: 'personnel', line: p });
  });

  // 6. Supplies + travel (project-level lines).
  const supplies = num(record.total_supplies_cost);
  if (supplies > 0) {
    push({ key: 'supplies', label: 'Supplies', cost: supplies, qty: 1,
      category: 'outsourced_fab', family: 'supplies', line: null });
  }
  const travel = num(record.total_travel_cost);
  if (travel > 0) {
    push({ key: 'travel', label: 'Travel & Fuel', cost: travel, qty: 1,
      category: 'outsourced_services', family: 'travel', line: null });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// wireChannelLineSell — one cost line through the engine (or passthrough)
// ---------------------------------------------------------------------------

const enginePricer = (engine: any): ((input: any) => any) | null =>
  typeof engine === 'function' ? engine
  : typeof engine?.pricePart === 'function' ? engine.pricePart
  : null;

export interface ChannelSellResult {
  /** True when the engine priced this line. */
  priced: boolean;
  /** True when the line echoed its cost verbatim (no engine call). */
  passthrough: boolean;
  /** 'no_tier_config' | 'engine_unavailable' | null on priced results. */
  reason: string | null;
  /** Sell price for the line — engine total when priced, verbatim cost when not. */
  sellPrice: number;
  /** Echoed inputs. */
  key: string;
  label: string;
  cost: number;
  qty: number;
  unitCost: number;
  category: string;
  /** Engine detail (priced lines only). */
  unitPrice?: number;
  extension?: number;
  priceSource?: string;
  tierSource?: string;
  engine?: any;
  /** Config detection echo. */
  via: string[];
  /** Evaluation chain — every step taken, in order. */
  chain: Array<{ step: string; detail: string }>;
}

/**
 * Price one channel cost line through the injected engine.
 *
 * input: { line, cost, qty, unitCost, label, category, key, context, engine,
 *          templates, tiers, customerTier, tierRules, now }
 *   context   ChannelEngineContext | raw record (normalized on demand) | null
 *   engine    { pricePart, resolveTemplatePrice?, templatePartDescriptor? }
 *             or a bare pricePart function
 *   templates / tiers / customerTier / tierRules — per-call overrides that
 *             merge over the context (line-level chart inputs).
 *
 * Passthrough rule: a line with NO own config AND no context returns
 * {priced:false, passthrough:true, sellPrice:<verbatim cost>}.
 */
export function wireChannelLineSell(input: any = {}): ChannelSellResult {
  const line = isRecord(input.line) ? input.line : (isRecord(input) && input.cost !== undefined && !input.line ? input : input.line);
  const src: any = isRecord(line) ? line : {};
  const chain: ChannelSellResult['chain'] = [];

  const cost = num(input.cost ?? input.lineCost ?? src.total_cost ?? src.cost);
  const rawQty = num(input.qty ?? src.qty ?? src.qty_letters ?? src.quantity, 0);
  const qty = rawQty > 0 ? rawQty : 1;
  const unitCost = Number.isFinite(Number(input.unitCost ?? input.unit_cost))
    ? num(input.unitCost ?? input.unit_cost)
    : (rawQty > 0 ? cost / rawQty : cost);
  const label = String(input.label ?? src.label ?? src.description ?? src.item_name ?? '');
  const category = String(input.category ?? src.category ?? src.category_key ?? '');
  const key = String(input.key ?? src.key ?? label ?? 'line');

  const context = channelEngineContext(input.context);
  const ctxPresent = !!context;
  chain.push({ step: 'context', detail: ctxPresent ? `context via ${context!.field || 'input'}` : 'no_context' });

  const config = channelLinePricingConfig(src);
  chain.push({
    step: 'detect',
    detail: config.configured ? `configured via ${config.via.join(',')}` : 'no line config',
  });

  const out = (r: Partial<ChannelSellResult>): ChannelSellResult => ({
    priced: false, passthrough: false, reason: null,
    sellPrice: cost, key, label, cost, qty, unitCost, category,
    via: config.via, chain,
    ...r,
  } as ChannelSellResult);

  if (!config.configured && !ctxPresent) {
    chain.push({ step: 'passthrough', detail: 'no tier/template config anywhere — cost echoed verbatim' });
    return out({ passthrough: true, reason: 'no_tier_config' });
  }

  const pricer = enginePricer(input.engine);
  if (!pricer) {
    chain.push({ step: 'passthrough', detail: 'engine not supplied — cost echoed verbatim' });
    return out({ passthrough: true, reason: 'engine_unavailable' });
  }

  // --- template layer: a bound PricingTemplate resolves through the caller-
  // injected resolveTemplatePrice, then templatePartDescriptor folds the
  // resolution into overrideRule vocabulary (pricingTemplateModel seam spec).
  let part = config.part;
  if (config.template !== null && config.template !== undefined) {
    const resolver = typeof input.engine?.resolveTemplatePrice === 'function'
      ? input.engine.resolveTemplatePrice : null;
    if (resolver) {
      const templatePart = isRecord(part) ? { ...part } : { ...(isRecord(src) ? src : {}) };
      if (isRecord(config.template)) templatePart.pricing_template = config.template;
      else templatePart.pricing_template_id = config.template;
      const res = resolver({
        part: templatePart,
        qty,
        base_price: unitCost,
        templates: input.templates ?? context?.templates,
        tiers: input.tiers ?? context?.tiers ?? input.customerTier ?? context?.customerTier,
        customer_tier: input.customerTier ?? context?.customerTier,
        template: isRecord(input.template) ? input.template : (isRecord(context?.template) ? context?.template : undefined),
        default_markup_pct: context?.defaultMarkupPct,
        minimum_charge: src.minimum_charge ?? context?.minimumCharge,
      });
      chain.push({
        step: 'template',
        detail: res?.applied === true
          ? `template priced (${res.source}:${res.pct_source ?? 'n/a'} -> unit ${round4(res.unit_price)})`
          : `template not applied (${res?.reason ?? 'unresolved'}) — engine chain prices`,
      });
      if (res?.applied === true) {
        const fold = typeof input.engine?.templatePartDescriptor === 'function'
          ? input.engine.templatePartDescriptor
          : (p: any) => p;
        part = fold(part ?? {}, res);
      }
    } else {
      chain.push({ step: 'template', detail: 'resolveTemplatePrice not supplied — ref left to engine chain' });
    }
  }

  const customerTier = src.customer_tier ?? src.customerTier
    ?? (isRecord(part) ? firstField(part, CUSTOMER_TIER_FIELDS) : undefined)
    ?? input.customerTier ?? context?.customerTier ?? null;
  const lineRules = TIER_RULES_FIELDS.reduce((acc: unknown[], f) => {
    const v = src[f] ?? (isRecord(part) ? part[f] : undefined);
    return Array.isArray(v) && v.length ? acc.concat(v) : acc;
  }, []);
  const tierRules = lineRules.length
    ? [...lineRules, ...(Array.isArray(input.tierRules) ? input.tierRules : []), ...(context?.tierRules ?? [])]
    : [...(Array.isArray(input.tierRules) ? input.tierRules : []), ...(context?.tierRules ?? [])];

  const priced = pricer({
    label, category, qty, unitCost,
    customerTier,
    tierRules,
    part,
    machine: config.machine ?? context?.machine,
    defaultMarkupPct: context?.defaultMarkupPct ?? 0,
    setupFee: firstFinite(src, SETUP_FEE_FIELDS) ?? context?.setupFee,
    minimumCharge: firstFinite(src, MIN_CHARGE_FIELDS) ?? context?.minimumCharge,
    taxable: typeof src.taxable === 'boolean' ? src.taxable : context?.taxable,
    taxPercent: firstFinite(src, TAX_PCT_FIELDS) ?? context?.taxPercent,
    // Line-level formula_modifiers already ride inside `part` (rule
    // modifiers). Passing them as caller `modifiers` too would double-apply
    // (engine runs rule modifiers THEN caller modifiers). Only caller/context
    // modifiers belong here.
    modifiers: input.modifiers ?? context?.modifiers,
    now: input.now,
  });

  chain.push({
    step: 'engine',
    detail: `pricePart -> ${priced?.priceSource ?? 'unknown'} via ${priced?.tier?.source ?? 'n/a'} (unit ${priced?.unitPrice ?? 'n/a'}, total ${priced?.total ?? 'n/a'})`,
  });

  return out({
    priced: true,
    sellPrice: num(priced?.total, cost),
    unitPrice: priced?.unitPrice,
    extension: priced?.extended ?? priced?.extension,
    priceSource: priced?.priceSource,
    tierSource: priced?.tier?.source,
    engine: priced,
  });
}

// ---------------------------------------------------------------------------
// wireChannelProjectSell — roll the cost lines up
// ---------------------------------------------------------------------------

export interface ChannelProjectSell {
  /** True when at least one line was engine-priced. */
  priced: boolean;
  /** True when EVERY line passed through (byte-identical to today's sum). */
  allPassthrough: boolean;
  /** Sum of line sellPrices — verbatim cost sum when allPassthrough. */
  sellTotal: number;
  /** Σ raw line costs (cost side echo — authoritative module math). */
  costTotal: number;
  lines: ChannelSellResult[];
  pricedCount: number;
  passthroughCount: number;
  /** The normalized context actually used (null when none). */
  context: ChannelEngineContext | null;
  chain: Array<{ step: string; detail: string }>;
}

/**
 * Run wireChannelLineSell over a set of channel cost lines.
 * `lines` may be channelCostLines() output or plain {line|cost|qty|...}
 * objects. All-passthrough -> sellTotal is the VERBATIM cost sum.
 */
export function wireChannelProjectSell(input: any = {}): ChannelProjectSell {
  const list: any[] = Array.isArray(input.lines) ? input.lines : [];
  const context = channelEngineContext(input.context);
  const chain: ChannelProjectSell['chain'] = [{
    step: 'context',
    detail: context ? `context via ${context.field || 'input'}` : 'no_context',
  }];

  const lines = list.map((l: any, i: number) =>
    wireChannelLineSell({
      key: l?.key ?? `line:${i}`,
      line: isRecord(l?.line) ? l.line : l,
      cost: l?.cost ?? l?.total_cost,
      qty: l?.qty,
      unitCost: l?.unitCost,
      label: l?.label,
      category: l?.category ?? l?.category_key,
      context,
      engine: input.engine,
      templates: input.templates,
      tiers: input.tiers,
      customerTier: input.customerTier,
      tierRules: input.tierRules,
      template: input.template,
      now: input.now,
    }));

  const pricedCount = lines.filter((l) => l.priced).length;
  const passthroughCount = lines.length - pricedCount;
  const allPassthrough = pricedCount === 0;
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  // Verbatim sum when nothing priced (byte-identical); round2 money once the
  // engine owns any line.
  const sellTotal = allPassthrough
    ? lines.reduce((s, l) => s + l.sellPrice, 0)
    : round2(lines.reduce((s, l) => s + l.sellPrice, 0));

  chain.push({
    step: 'rollup',
    detail: allPassthrough
      ? `all ${lines.length} lines passthrough — sellTotal is verbatim cost sum`
      : `${pricedCount} priced / ${passthroughCount} passthrough -> sellTotal ${sellTotal}`,
  });

  return {
    priced: pricedCount > 0,
    allPassthrough,
    sellTotal,
    costTotal,
    lines,
    pricedCount,
    passthroughCount,
    context,
    chain,
  };
}

// ---------------------------------------------------------------------------
// channelEngineEconomics — the customerPricing.sourceProjectEconomics seam
// ---------------------------------------------------------------------------

export interface ChannelEngineEconomics {
  /** True when engine pricing produced the customerPrice. */
  wired: boolean;
  /** True when nothing was configured — caller keeps today's economics. */
  passthrough: boolean;
  reason: string | null;
  /** Cost side — echoed verbatim (module math stays authoritative). */
  internalCost: number;
  /** Sell side — engine sellTotal when wired, echoed fallback otherwise. */
  customerPrice: number;
  sell: ChannelProjectSell | null;
  lines: ChannelCostLine[];
  context: ChannelEngineContext | null;
  chain: Array<{ step: string; detail: string }>;
}

/**
 * Boundary helper for `sourceProjectEconomics('channel_letters', record)`.
 *
 * Returns {wired:false, passthrough:true} unless the record carries engine
 * config — the caller then returns today's {internalCost, customerPrice}
 * byte-identically. When wired, customerPrice is the engine sellTotal over
 * the record's cost lines; internalCost echoes the caller's module-computed
 * value untouched.
 */
export function channelEngineEconomics(input: any = {}): ChannelEngineEconomics {
  const record = input.record;
  const chain: ChannelEngineEconomics['chain'] = [];
  const done = (r: Partial<ChannelEngineEconomics>): ChannelEngineEconomics => ({
    wired: false, passthrough: false, reason: null,
    internalCost: num(input.internalCost),
    customerPrice: num(input.customerPrice),
    sell: null, lines: [], context: null, chain,
    ...r,
  } as ChannelEngineEconomics);

  if (!isRecord(record)) {
    chain.push({ step: 'passthrough', detail: 'no record' });
    return done({ passthrough: true, reason: 'no_record' });
  }

  const context = channelEngineContext(input.context ?? record);
  const lines = Array.isArray(input.lines) && input.lines.length
    ? input.lines
    : channelCostLines(record);
  if (!lines.length) {
    chain.push({ step: 'passthrough', detail: 'record produced no cost lines' });
    return done({ passthrough: true, reason: 'no_cost_lines', context });
  }

  const anyLineConfig = lines.some((l: any) =>
    channelLinePricingConfig(isRecord(l?.line) ? l.line : l).configured);
  chain.push({
    step: 'detect',
    detail: `${lines.length} cost lines; context ${context ? `via ${context.field}` : 'absent'}; line config ${anyLineConfig ? 'present' : 'absent'}`,
  });
  if (!context && !anyLineConfig) {
    chain.push({ step: 'passthrough', detail: 'no engine config anywhere — byte-identical' });
    return done({ passthrough: true, reason: 'no_tier_config', lines, context });
  }

  const sell = wireChannelProjectSell({
    lines, context, engine: input.engine,
    templates: input.templates ?? context?.templates,
    tiers: input.tiers ?? context?.tiers,
    customerTier: input.customerTier ?? context?.customerTier,
    tierRules: input.tierRules,
    now: input.now,
  });
  chain.push(...sell.chain);
  if (!sell.priced) {
    return done({ passthrough: true, reason: 'no_priced_lines', sell, lines, context });
  }
  chain.push({
    step: 'wired',
    detail: `engine customerPrice ${sell.sellTotal} over internalCost ${num(input.internalCost)} (${sell.pricedCount}/${lines.length} priced)`,
  });
  return done({
    wired: true,
    customerPrice: sell.sellTotal,
    sell, lines, context,
  });
}

/** Probe: does this record/line set carry engine config? (admin UI helper). */
export function channelEngineConfigured(source: any, lines?: any[]): boolean {
  if (channelEngineContext(source)) return true;
  const list = Array.isArray(lines) ? lines : [];
  return list.some((l: any) =>
    channelLinePricingConfig(isRecord(l?.line) ? l.line : l).configured);
}
