// Margin model — line-level + estimate-level margin from RESOLVED costs.
// Pure TS, zero entity/io access, zero imports (spec F-25): importable by
// Deno-style base44 functions AND the Vite frontend.
//
// Extends src/components/estimator/profitability.js: that model only counts
// the frozen product snapshot as cost. This model decomposes cost into
// material + machine + labor + modifier components:
//
//   material — BuilderPart frozen cost (or the whole frozen product cost
//              when no part/project detail is available — the existing
//              profitability basis, so this model is a strict superset).
//   machine  — Machine registry rate × part run-time (+ setup minutes billed
//              at rate, flat setup_cost, disposable per-unit consumables).
//   labor    — LaborLevel hourly_rate × allocation (rate_basis × rate_value
//              or explicit hours) + machine operator share (labor_pct) +
//              explicit part labor fields.
//   modifier — PricingModifier rates[] `cost` column applied by the row's
//              per_unit kind (per_unit/per_sqft/percent/flat), option
//              rate_overrides merged. Sell-side flags (min_charge,
//              setup_fee) do NOT apply to cost.
//
// ---------------------------------------------------------------------------
// Entity contract (verified against the .jsonc schemas)
// ---------------------------------------------------------------------------
//   AllInOneEstimate.line_items[]: line_id, builder_product_id, module_key,
//     client_product_name, product_category, project_id, total_snapshot,
//     adjustment_percent, customer_quantity. Stored-but-undeclared extras
//     read when present: customer_price_snapshot, live_total_snapshot.
//   Estimate level: discount_percent, contingency_percent, internal_discount
//     ($ margin-reporting discount), category_adjustments {cat: pct},
//     customer pricing tier fields are sell-side and not needed here — the
//     sell price is the frozen customer price, not re-derived.
//   BuilderPart: builder_product_id, part_key, part_name, client_label,
//     part_type, part_subtype, quantity, is_active, builder_sync_state,
//     frozen_unit_cost/frozen_extended_cost, unit_cost/extended_cost
//     (makePart spellings), manual_cost(+manual_cost_override),
//     current_unit_cost/current_extended_cost, labor_level_id, machine_ids,
//     builder_data / calculation_snapshot / pricing_basis_snapshot /
//     detail_overrides (open bags for hours/rates/component fields).
//   Machine: cost_per_hour, setup_minutes, setup_cost, setup_hours (extra),
//     setup_billed (extra, default true), disposable_cost_per_unit,
//     labor_pct, labor_rate_per_hour (extra, default cost_per_hour), status.
//     MachineRate aliases also read: runtime_rate_per_hour → cost_per_hour,
//     setup_fee → setup_cost.
//   LaborLevel: name, hourly_rate, rate_basis (sqft_per_hour|units_per_hour|
//     hours_per_unit|flat_hours), rate_value, applies_to_categories, status.
//   PricingModifier: name, label, input_type, rates[]{label,retail,cost,
//     per_unit}, min_charge, affects_waste, include_setup_fee, setup_fee,
//     inventoried_part_type, status, options[](ModifierOption rows may be
//     attached by the caller: modifier_id, label, value, rate_overrides,
//     is_default, sort, status).
//
// ---------------------------------------------------------------------------
// Cost-basis precedence per estimate line (`cost_basis`)
// ---------------------------------------------------------------------------
//   'parts'    ≥1 active BuilderPart row resolves for the line's
//              builder_product_id. Each part's stored cost lands in exactly
//              ONE bucket by part_type ('labor'→labor, 'equipment'/'machine'
//              →machine, 'modifier'→modifier, everything else→material) —
//              partSync materializes module labor/machine/consumable costs
//              AS typed parts, so the bucket split decomposes the frozen
//              cost without double counting. Configured refs then add NEW
//              components on top (a material part's machine_ids / labor
//              levels / modifier attachments are costs the frozen snapshot
//              does not contain): ref resolution is skipped for the
//              component the part's own bucket already represents.
//   'project'  No parts, but a module project record (caller passes
//              `projects` — map keyed by project_id or row array — or
//              embeds line.project) carries component totals
//              (total_machine_cost, total_labor_cost, total_material_cost/
//              total_materials_cost/material_cost, total_supplies_cost,
//              total_modifier_cost). Machine/labor/modifier come from the
//              project; material = declared material totals, else the
//              residual inside the frozen snapshot (authoritative internal
//              cost). Components exceeding the snapshot flag a warning and
//              the resolved sum becomes the total.
//   'snapshot' Only the frozen product snapshot exists — material cost =
//              total_snapshot × customer_quantity (profitability.js parity).
//
//   Line totals scale by customer_quantity (a product's part cost is its
//   per-unit cost; N products run N times — including machine setup).
//
// ---------------------------------------------------------------------------
// Money convention
// ---------------------------------------------------------------------------
//   All internal math runs in INTEGER CENTS via toCents — the sign-safe
//   convention shared with reconciliationModel.ts / creditMemoModel.ts:
//   Math.round(v*100 + Math.sign(v)*1e-7) rounds half away from zero in both
//   directions (1.005→101, −1.005→−101). Outputs expose canonical *_cents
//   integers plus 2dp dollar mirrors (sell, material_cost, …) so the UI can
//   display without re-rounding. margin_cents = sell − total_cost;
//   margin_pct = margin/sell×100 when sell > 0 else 0 (0 sell → 0%).
//
// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
//   toCents / fromCents / moneyRound / scaleCents
//   marginPctOf(margin_cents, sell_cents) / markupPctOf(margin_cents, cost)
//   MARGIN_COMPONENTS / DEFAULT_LOW_MARGIN_PCT
//   partCostBucket(part)                       — 'material'|'machine'|'labor'|'modifier'
//   resolveMachineCost({part, machines})       — machine component + detail
//   resolveLaborCost({part, labor_levels, machine_labor_cents?})
//   resolveModifierCost({part, modifiers})
//   partCostBreakdown({part, machines, labor_levels, modifiers})
//   lineMargin({line, parts, machines, labor_levels, modifiers,
//               category_adjustments, projects})
//   estimateMargin({estimate, parts, machines, labor_levels, modifiers,
//                   projects, pricing, low_margin_pct})
//   lowMarginLines(rollup, thresholdPct)
// ---------------------------------------------------------------------------

// --- shared coercion ---------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

const lc = (v: unknown): string => asString(v).toLowerCase();

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

/** First non-empty raw value across a field scan; undefined when none. */
const firstField = (rec: unknown, fields: readonly string[]): unknown => {
  if (!isRecord(rec)) return undefined;
  for (const f of fields) {
    const v = rec[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** First finite number across a field scan; null when none resolve. */
const firstFinite = (rec: unknown, fields: readonly string[]): number | null => {
  const v = firstField(rec, fields);
  return v === undefined ? null : toFiniteNumber(v);
};

/** First finite number across already-extracted values; null when none. */
const firstFiniteValue = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    const n = toFiniteNumber(v);
    if (n !== null) return n;
  }
  return null;
};

// --- money -------------------------------------------------------------------

/**
 * Dollar-ish value → integer cents. Sign-aware: float-boundary values round
 * half AWAY from zero in both directions (reconciliationModel.toCents
 * convention). Strings parse leniently ('$1,234.56' → 123456). Non-finite → 0.
 */
export const toCents = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + Math.sign(n) * 1e-7) + 0;
};

/** Integer cents → dollars (2dp mirror). */
export const fromCents = (cents: unknown): number => Math.round(num(cents)) / 100;

/** Round a dollar-ish value to exactly 2dp through the cent path. */
export const moneyRound = (v: unknown): number => fromCents(toCents(v));

/**
 * cents × ratio → cents, sign-safe (used for percent adjustments, waste
 * scaling, and quantity extension in cent space).
 */
export const scaleCents = (cents: unknown, ratio: unknown): number => {
  const c = num(cents);
  const r = toFiniteNumber(ratio);
  if (r === null) return 0;
  const v = c * r;
  return Math.round(v + Math.sign(v) * 1e-7) + 0;
};

/** Margin % of sell: margin/sell×100 when sell > 0 else 0. Rounded to 2dp. */
export const marginPctOf = (marginCents: unknown, sellCents: unknown): number => {
  const sell = num(sellCents);
  if (sell <= 0) return 0;
  return Math.round(((num(marginCents) / sell) * 100 + Number.EPSILON) * 100) / 100;
};

/** Markup % on cost: margin/cost×100 when cost > 0 else 0. Rounded to 2dp. */
export const markupPctOf = (marginCents: unknown, costCents: unknown): number => {
  const cost = num(costCents);
  if (cost <= 0) return 0;
  return Math.round(((num(marginCents) / cost) * 100 + Number.EPSILON) * 100) / 100;
};

// --- constants ---------------------------------------------------------------

/** Cost components, canonical order (UI iterates this). */
export const MARGIN_COMPONENTS = Object.freeze([
  'material',
  'machine',
  'labor',
  'modifier',
] as const);
export type MarginComponent = (typeof MARGIN_COMPONENTS)[number];

/** Default low-margin flag threshold — mirrors profitability.js
 *  DEFAULT_MARGIN_FLOOR_PERCENT (GlobalSettings.margin_floor_percent is the
 *  runtime override; callers pass their resolved value). */
export const DEFAULT_LOW_MARGIN_PCT = 15;

export type CostBucket = MarginComponent;

// BuilderPart.part_type is a free-form string — partSync materializes module
// costs as typed parts and inventory parts arrive with catalog types. Token
// sets decide the bucket; anything unmatched is material (the residual —
// supplies/consumables/fabrication/finishing/pricing-adjustment rows are all
// material-ish cost, never machine/labor/modifier).
export const LABOR_PART_TYPES = Object.freeze([
  'labor', 'labour', 'labor_service', 'service_labor', 'personnel',
  'install_labor', 'installation_labor', 'crew', 'crew_labor',
] as const);
export const MACHINE_PART_TYPES = Object.freeze([
  'equipment', 'machine', 'machine_time', 'equipment_time',
  'production_equipment', 'machine_use',
] as const);
export const MODIFIER_PART_TYPES = Object.freeze([
  'modifier', 'price_modifier', 'pricing_modifier',
] as const);

/**
 * Bucket a part's stored cost into ONE component (no double counting — the
 * bucket is the part's primary cost identity; configured refs add OTHER
 * components on top). part_type wins; when no type is declared the subtype
 * is probed for '*_labor'/'*_machine_time'/'*_modifier' spellings on
 * untyped legacy rows. Unknown types are material (the residual bucket —
 * supplies/consumables/fabrication/service/pricing-adjustment rows are all
 * material-ish cost, never machine/labor/modifier).
 */
export function partCostBucket(part: unknown): CostBucket {
  const p = isRecord(part) ? part : {};
  const type = lc(p.part_type ?? p.type);
  if ((LABOR_PART_TYPES as readonly string[]).includes(type)) return 'labor';
  if ((MACHINE_PART_TYPES as readonly string[]).includes(type)) return 'machine';
  if ((MODIFIER_PART_TYPES as readonly string[]).includes(type)) return 'modifier';
  if (!type) {
    const sub = lc(p.part_subtype ?? p.subtype);
    if (/labor|labour|personnel/.test(sub)) return 'labor';
    if (/machine|equipment/.test(sub)) return 'machine';
    if (/modifier/.test(sub)) return 'modifier';
  }
  return 'material';
}

// --- detail types ------------------------------------------------------------

export interface MachineCostLine {
  machine_id: string | null;
  machine_name: string;
  run_hours: number;
  rate_per_hour: number;
  setup_hours: number;
  setup_billed: boolean;
  quantity: number;
  run_cost_cents: number;
  setup_cost_cents: number;
  disposable_cost_cents: number;
  cost_cents: number;
  /** Operator share routed to the labor bucket (labor_pct × labor_rate). */
  operator_labor_cents: number;
  operator_labor_hours: number;
  source: 'catalog' | 'inline' | 'part_rate' | 'unresolved';
}

export interface LaborCostLine {
  level_id: string | null;
  name: string;
  hours: number;
  rate_per_hour: number;
  cost_cents: number;
  source: 'catalog' | 'inline' | 'manual_hours' | 'explicit' | 'machine_operator';
}

export interface ModifierCostLine {
  modifier_id: string | null;
  name: string;
  rate_label: string;
  cost_rate: number;
  per_unit: string;
  kind: 'per_unit' | 'per_sqft' | 'percent' | 'flat' | 'none';
  quantity: number;
  area_sqft: number;
  cost_cents: number;
  source: 'catalog' | 'inline' | 'explicit' | 'unresolved';
  pricing_gated: boolean;
}

export interface ComponentCostCents {
  material_cents: number;
  machine_cents: number;
  labor_cents: number;
  modifier_cents: number;
  total_cents: number;
}

export interface PartCostBreakdown extends ComponentCostCents {
  part_id: string | null;
  part_key: string;
  part_name: string;
  part_type: string;
  bucket: CostBucket;
  quantity: number;
  /** Stored part cost routed to the bucket (frozen chain). */
  snapshot_cents: number;
  /** Resolved ref-driven costs added on top of the snapshot. */
  resolved_extras_cents: number;
  machines: MachineCostLine[];
  labor: LaborCostLine[];
  modifiers: ModifierCostLine[];
  warnings: string[];
}

export interface LineMargin extends ComponentCostCents {
  line_id: string;
  label: string;
  module_key: string;
  quantity: number;
  cost_basis: 'parts' | 'project' | 'snapshot';
  sell: number;
  sell_cents: number;
  unit_sell: number;
  adjustment_percent: number;
  material_cost: number;
  machine_cost: number;
  labor_cost: number;
  modifier_cost: number;
  total_cost: number;
  margin_cents: number;
  margin_pct: number;
  markup_on_cost_pct: number;
  /** frozen-snapshot extended cost for comparison (cost_basis 'snapshot'
   *  always equals total_cost_cents). */
  snapshot_cost_cents: number;
  parts: PartCostBreakdown[];
  warnings: string[];
}

export interface EstimateMargin {
  line_count: number;
  lines: LineMargin[];
  /** Σ line sells BEFORE estimate-level waterfall. */
  gross_sell: number;
  gross_sell_cents: number;
  discount_cents: number;
  contingency_cents: number;
  internal_discount_cents: number;
  /** Sell after discount −, contingency +, internal_discount −. */
  total_sell: number;
  total_sell_cents: number;
  material_cost: number;
  machine_cost: number;
  labor_cost: number;
  modifier_cost: number;
  total_cost: number;
  material_cost_cents: number;
  machine_cost_cents: number;
  labor_cost_cents: number;
  modifier_cost_cents: number;
  total_cost_cents: number;
  margin_cents: number;
  margin_pct: number;
  markup_on_cost_pct: number;
  /** Σ per-line margins — pre-waterfall margin. */
  gross_margin_cents: number;
  by_component: {
    material_cents: number;
    machine_cents: number;
    labor_cents: number;
    modifier_cents: number;
    material: number;
    machine: number;
    labor: number;
    modifier: number;
    material_share_pct: number;
    machine_share_pct: number;
    labor_share_pct: number;
    modifier_share_pct: number;
  };
  warnings: string[];
}

// --- field-name tables -------------------------------------------------------

// Extended-cost spellings on stored BuilderPart rows — schema fields first,
// then makePart/historical spellings.
const PART_EXTENDED_COST_FIELDS = [
  'frozen_extended_cost', 'extended_cost', 'total_cost', 'cost_total',
] as const;
const PART_UNIT_COST_FIELDS = [
  'frozen_unit_cost', 'unit_cost', 'current_unit_cost',
] as const;
const PART_MANUAL_COST_FIELDS = ['manual_cost', 'manual_cost_total'] as const;
const PART_CURRENT_EXTENDED_FIELDS = ['current_extended_cost'] as const;

// Machine run-time fields scanned on the ref entry, then the part, then its
// open bags. First finite wins.
const RUN_HOUR_FIELDS = [
  'run_hours', 'runtime_hours', 'machine_run_hours', 'machine_hours',
  'machine_time_hours', 'production_hours', 'print_hours', 'cut_hours_total',
  'hours',
] as const;

// Manual labor-hour spellings (material/non-labor parts only — a labor-typed
// part's frozen cost already IS labor).
const LABOR_HOUR_FIELDS = [
  'labor_hours', 'labor_time_hours', 'labour_hours', 'hours_worked',
  'production_labor_hours', 'setup_labor_hours',
] as const;
const LABOR_RATE_FIELDS = [
  'labor_rate', 'labor_rate_per_hour', 'labor_hourly_rate', 'hourly_rate',
] as const;
const LABOR_COST_FIELDS = [
  'labor_cost', 'labor_cost_total', 'labour_cost', 'production_labor_cost',
] as const;
const MACHINE_COST_FIELDS = [
  'machine_cost', 'machine_cost_total', 'equipment_cost', 'machine_time_cost',
] as const;
const MODIFIER_COST_FIELDS = [
  'modifier_cost', 'modifiers_cost', 'modifier_cost_total', 'total_modifier_cost',
] as const;
const MATERIAL_COST_FIELDS = [
  'material_cost', 'material_cost_total', 'materials_cost', 'total_material_cost',
] as const;

// Open bags scanned for rates/hours, in order. builder_data +
// calculation_snapshot hold module calc noise (a cnc item's own
// machine_cost/labor_cost fields) — fine for hour/rate hints, but explicit
// COMPONENT costs are only trusted from the deliberate carriers below so a
// material part never double-counts costs already materialized as their own
// labor/equipment part rows.
const PART_BAG_FIELDS = [
  'detail_overrides', 'pricing_basis_snapshot', 'calculation_snapshot',
  'builder_data', 'cost_breakdown', 'cost_components', 'components',
] as const;
const PART_COMPONENT_BAG_FIELDS = [
  'detail_overrides', 'pricing_basis_snapshot', 'cost_breakdown',
  'cost_components', 'components',
] as const;

// Module project-record component totals (per-module estimators persist
// these spellings — see laserCalc/cncCalc/metalCalc/vinylCalc/maintenanceCalc).
const PROJECT_MACHINE_FIELDS = [
  'total_machine_cost', 'machine_cost', 'total_equipment_cost', 'equipment_cost',
] as const;
const PROJECT_LABOR_FIELDS = [
  'total_labor_cost', 'labor_cost', 'total_labor',
] as const;
const PROJECT_MATERIAL_FIELDS = [
  'total_material_cost', 'total_materials_cost', 'material_cost', 'materials_cost',
  'total_supplies_cost', 'supplies_cost', 'total_substrate_cost',
] as const;
const PROJECT_MODIFIER_FIELDS = [
  'total_modifier_cost', 'modifier_cost', 'modifiers_cost', 'total_modifiers_cost',
] as const;

// Part attachment fields that may carry modifier references (mirrors
// modifierPricing.PART_MODIFIER_FIELDS order).
const PART_MODIFIER_FIELDS = [
  'modifiers', 'modifier_ids', 'pricing_modifier_ids', 'pricing_modifiers',
  'modifier_links',
] as const;

// Part fields that may carry collected modifier answers (keyed by modifier id
// or name).
const MODIFIER_ANSWER_FIELDS = [
  'modifier_answers', 'modifier_values', 'modifier_inputs', 'modifier_selections',
  'modifier_responses', 'answers',
] as const;

const AREA_SQFT_FIELDS = [
  'area_sqft', 'sqft', 'sq_ft', 'area', 'area_total', 'total_sqft',
] as const;

// --- misc --------------------------------------------------------------------

const dedupeWarnings = (list: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of list) {
    const s = asString(w);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
};

// Scan the part's open bags for a field (part itself first).
const bagField = (part: unknown, fields: readonly string[]): unknown => {
  const direct = firstField(part, fields);
  if (direct !== undefined) return direct;
  if (!isRecord(part)) return undefined;
  for (const bag of PART_BAG_FIELDS) {
    const v = firstField(part[bag], fields);
    if (v !== undefined) return v;
  }
  return undefined;
};

const bagFinite = (part: unknown, fields: readonly string[]): number | null => {
  const v = bagField(part, fields);
  return v === undefined ? null : toFiniteNumber(v);
};

// Explicit component-cost fields: top-level part fields + deliberate cost
// bags only (NOT builder_data/calculation_snapshot — module items carry
// machine_cost/labor_cost there that are already materialized as their own
// parts; reading them here would double-count).
const componentFinite = (part: unknown, fields: readonly string[]): number | null => {
  const direct = firstFinite(part, fields);
  if (direct != null) return direct;
  if (!isRecord(part)) return null;
  for (const bag of PART_COMPONENT_BAG_FIELDS) {
    const v = firstFinite(part[bag], fields);
    if (v != null) return v;
  }
  return null;
};

// --- machine cost resolution ---------------------------------------------------

type NormalizedMachineLite = {
  id: string | null;
  name: string;
  status: string;
  active: boolean;
  cost_per_hour: number;
  setup_cost: number;
  setup_hours: number;
  setup_billed: boolean;
  disposable_cost_per_unit: number;
  labor_pct: number;
  labor_rate_per_hour: number;
};

// Lite Machine normalize — Machine.jsonc + MachineRate aliases, mirrors
// machineCosts.ts semantics (same precedence) without the sell-side fields.
const normalizeMachineLite = (raw: unknown): NormalizedMachineLite | null => {
  if (!isRecord(raw)) return null;
  const costPerHour = Math.max(0, num(firstField(raw, [
    'cost_per_hour', 'runtime_rate_per_hour', 'rate_per_hour', 'hourly_rate', 'rate',
  ])));
  const setupCost = Math.max(0, num(firstField(raw, ['setup_cost', 'setup_fee', 'flat_setup_cost'])));
  const explicitSetupHours = firstFinite(raw, ['setup_hours', 'setup_time_hours']);
  const setupMinutes = Math.max(0, num(firstField(raw, ['setup_minutes', 'setup_time_minutes', 'setup_mins'])));
  const setupHours = explicitSetupHours != null ? Math.max(0, explicitSetupHours) : setupMinutes / 60;
  let laborPct = num(firstField(raw, ['labor_pct', 'labor_percent', 'operator_labor_pct']));
  laborPct = Math.min(100, Math.max(0, laborPct));
  const billed = firstField(raw, ['setup_billed', 'bill_setup_time']);
  const setupBilled = billed === undefined
    ? true
    : !(billed === false || ['false', 'no', 'off', '0'].includes(lc(billed)));
  const status = asString(raw.status) || 'active';
  return {
    id: asString(raw.id ?? raw.machine_id) || null,
    name: asString(raw.name),
    status,
    active: lc(status) !== 'inactive',
    cost_per_hour: costPerHour,
    setup_cost: setupCost,
    setup_hours: setupHours,
    setup_billed: setupBilled,
    disposable_cost_per_unit: Math.max(0, num(firstField(raw, [
      'disposable_cost_per_unit', 'disposable_per_unit', 'consumable_cost_per_unit',
      'consumables_per_unit',
    ]))),
    labor_pct: laborPct,
    labor_rate_per_hour: Math.max(0, num(
      firstFinite(raw, ['labor_rate_per_hour', 'labor_rate', 'operator_rate']) ?? costPerHour,
    )),
  };
};

const machineCatalogOf = (machines: unknown): NormalizedMachineLite[] =>
  (Array.isArray(machines) ? machines : [])
    .map(normalizeMachineLite)
    .filter((m): m is NormalizedMachineLite => !!m);

const findMachine = (
  catalog: NormalizedMachineLite[],
  id: string,
  name: string,
): NormalizedMachineLite | null => {
  const wantId = lc(id);
  const wantName = lc(name);
  if (wantId) {
    const hit = catalog.find((m) => m.id && lc(m.id) === wantId);
    if (hit) return hit;
  }
  if (wantName) {
    const byName = catalog.find((m) => m.name && lc(m.name) === wantName);
    if (byName) return byName;
  }
  // An id-shaped ref that matched no catalog id may still be a stored NAME.
  if (wantId && !wantName) {
    const byName = catalog.find((m) => m.name && lc(m.name) === wantId);
    if (byName) return byName;
  }
  return null;
};

// Entries on part.machine_ids / part.machines / part.machine_id / part.machine.
// Strings → catalog refs; records → nested {machine}/{machine_id} refs, inline
// machine rows (carry rate fields), or {ref + run_hours} carrier entries.
type MachineRefEntry = { machine: NormalizedMachineLite | null; ref: Record<string, unknown> | null; raw: unknown; label: string };

const machineRefEntries = (part: Record<string, unknown>): MachineRefEntry[] => {
  const out: MachineRefEntry[] = [];
  const push = (raw: unknown, label: string) => {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const s = asString(raw);
      if (s) out.push({ machine: null, ref: { __ref: s }, raw, label });
      return;
    }
    if (!isRecord(raw)) return;
    // Inline machine row (has a recognizable rate field) — usable as-is.
    const looksInline = firstField(raw, [
      'cost_per_hour', 'runtime_rate_per_hour', 'rate_per_hour', 'hourly_rate',
    ]) !== undefined;
    if (looksInline && raw.machine_id === undefined && raw.machine === undefined) {
      out.push({ machine: normalizeMachineLite(raw), ref: raw, raw, label });
      return;
    }
    const nested = isRecord(raw.machine) ? raw.machine : null;
    if (nested) {
      out.push({ machine: normalizeMachineLite({ ...nested, id: nested.id ?? raw.machine_id ?? raw.id }), ref: raw, raw, label });
      return;
    }
    const refId = firstField(raw, ['machine_id', 'id', 'machine', 'machine_name', 'name']);
    out.push({ machine: null, ref: { ...raw, __ref: asString(refId) }, raw, label });
  };

  const list = (v: unknown, label: string) => {
    if (!Array.isArray(v)) return;
    v.forEach((entry, i) => push(entry, `${label}[${i}]`));
  };
  list(part.machine_ids, 'machine_ids');
  list(part.machines, 'machines');
  if (firstField(part, ['machine_id']) !== undefined) {
    push({ machine_id: part.machine_id, ...(isRecord(part.machine_entry) ? part.machine_entry : {}) }, 'machine_id');
  }
  if (isRecord(part.machine)) push(part.machine, 'machine');
  else if (asString(part.machine)) push(asString(part.machine), 'machine');
  return out;
};

// Hours a machine ref runs for this part: ref-carried fields → per-machine map
// (part.machine_hours {id|name: hours}) → part-level/bag scan.
const machineRunHours = (part: Record<string, unknown>, ref: Record<string, unknown> | null, machine: NormalizedMachineLite | null): number => {
  const onRef = ref ? firstFinite(ref, RUN_HOUR_FIELDS) : null;
  if (onRef != null) return Math.max(0, onRef);
  const map = firstField(part, ['machine_hours', 'machine_run_hours_map', 'machine_time_map']);
  if (isRecord(map) && machine) {
    const v = firstFiniteValue(
      machine.id ? map[machine.id] : undefined,
      machine.name ? map[machine.name] : undefined,
      ref && ref.__ref !== undefined ? map[asString(ref.__ref)] : undefined,
    );
    if (v != null) return Math.max(0, v);
  }
  const onPart = bagFinite(part, RUN_HOUR_FIELDS);
  if (onPart != null) return Math.max(0, onPart);
  return 0;
};

/**
 * Machine cost for ONE part: Σ over its machine refs of
 *   run_hours × cost_per_hour
 * + setup_hours × cost_per_hour (while setup_billed — default true)
 * + setup_cost (flat)
 * + disposable_cost_per_unit × part quantity.
 * The operator share (run_hours × labor_pct% × labor_rate_per_hour) is
 * reported per line as operator_labor_* and routed to the LABOR bucket —
 * machine_cost stays pure machine economics. weighted_multiplier and margin
 * charts are sell-side and intentionally excluded from cost.
 * Missing machine → 0 with a warning (never throws, never blocks the line).
 */
export function resolveMachineCost(args: {
  part: unknown;
  machines?: unknown;
}): { cost_cents: number; lines: MachineCostLine[]; operator_labor_cents: number; warnings: string[] } {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings: string[] = [];
  const catalog = machineCatalogOf(a.machines);
  const entries = machineRefEntries(part);
  const lines: MachineCostLine[] = [];
  let operatorLabor = 0;

  const qty = Math.max(0, num(firstFinite(part, ['quantity', 'qty']) ?? 1));
  // A part-stored rate is the fallback when a ref's machine has no rate
  // (or the ref resolves to nothing catalog-side) — partSync stores
  // `calculation_snapshot.rate` / `machine_rate_per_hour` on machine parts.
  const partRate = firstFiniteValue(
    bagFinite(part, ['machine_rate_per_hour', 'machine_rate', 'cost_per_hour', 'rate_per_hour']),
    isRecord(part.calculation_snapshot) ? toFiniteNumber(part.calculation_snapshot.rate) : null,
  );

  entries.forEach((entry) => {
    const ref = entry.ref;
    let machine = entry.machine;
    let source: MachineCostLine['source'] = machine ? 'inline' : 'catalog';
    if (!machine) {
      const refId = asString(ref?.__ref);
      machine = findMachine(catalog, refId, asString(ref?.machine_name ?? ref?.name));
      if (!machine) {
        if (partRate != null) {
          // No registry row — honor the part's stored rate against its hours.
          machine = {
            id: refId || null,
            name: asString(ref?.machine_name ?? ref?.name) || refId || 'Machine',
            status: 'active', active: true,
            cost_per_hour: Math.max(0, partRate),
            setup_cost: 0, setup_hours: 0, setup_billed: true,
            disposable_cost_per_unit: 0, labor_pct: 0, labor_rate_per_hour: 0,
          };
          source = 'part_rate';
        } else {
          warnings.push(`${entry.label}: machine "${refId || 'inline'}" not found — machine cost 0`);
          return;
        }
      }
    }
    if (!machine.active) {
      warnings.push(`${entry.label}: machine "${machine.name || machine.id}" is inactive — skipped`);
      return;
    }

    const hours = machineRunHours(part, ref, machine);
    const refQty = Math.max(0, num(
      (ref ? firstFinite(ref, ['quantity', 'qty', 'units']) : null) ?? qty,
    ));
    const rate = machine.cost_per_hour > 0
      ? machine.cost_per_hour
      : (partRate != null ? Math.max(0, partRate) : 0);
    if (machine.cost_per_hour <= 0 && partRate == null) {
      warnings.push(`${entry.label}: machine "${machine.name || machine.id}" has no cost_per_hour — run cost 0`);
    }

    const billedField = ref ? firstField(ref, ['setup_billed', 'bill_setup_time']) : undefined;
    const setupBilled = billedField === undefined
      ? machine.setup_billed
      : !(billedField === false || ['false', 'no', 'off', '0'].includes(lc(billedField)));
    const setupHours = Math.max(0, num(
      (ref ? firstFinite(ref, ['setup_hours']) : null)
        ?? (ref ? (firstFinite(ref, ['setup_minutes']) != null ? num(firstFinite(ref, ['setup_minutes'])) / 60 : null) : null)
        ?? machine.setup_hours,
    ));
    const setupFlat = Math.max(0, num(
      (ref ? firstFinite(ref, ['setup_cost', 'setup_fee']) : null) ?? machine.setup_cost,
    ));
    const disposableRate = Math.max(0, num(
      (ref ? firstFinite(ref, ['disposable_cost_per_unit', 'disposable_per_unit']) : null)
        ?? machine.disposable_cost_per_unit,
    ));

    const runCents = toCents(hours * rate);
    const setupCents = (setupBilled ? toCents(setupHours * rate) : 0) + toCents(setupFlat);
    const disposableCents = toCents(disposableRate * refQty);
    const cost = runCents + setupCents + disposableCents;

    const opHours = hours * (machine.labor_pct / 100);
    const opRate = Math.max(0, num(
      (ref ? firstFinite(ref, ['labor_rate_per_hour', 'labor_rate', 'operator_rate']) : null)
        ?? machine.labor_rate_per_hour,
    ));
    const opCents = toCents(opHours * opRate);
    operatorLabor += opCents;

    lines.push({
      machine_id: machine.id,
      machine_name: machine.name || ref?.['__ref'] as string || '',
      run_hours: Math.round(hours * 1e6) / 1e6,
      rate_per_hour: rate,
      setup_hours: setupHours,
      setup_billed: setupBilled,
      quantity: refQty,
      run_cost_cents: runCents,
      setup_cost_cents: setupCents,
      disposable_cost_cents: disposableCents,
      cost_cents: cost,
      operator_labor_cents: opCents,
      operator_labor_hours: Math.round(opHours * 1e6) / 1e6,
      source: rate !== machine.cost_per_hour ? 'part_rate' : source,
    });
  });

  return {
    cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0),
    lines,
    operator_labor_cents: operatorLabor,
    warnings,
  };
}

// --- labor cost resolution ----------------------------------------------------

type NormalizedLaborLite = {
  id: string | null;
  name: string;
  hourly_rate: number;
  rate_basis: 'sqft_per_hour' | 'units_per_hour' | 'hours_per_unit' | 'flat_hours';
  rate_value: number;
  applies_to: string[];
  status: string;
  active: boolean;
};

const LABOR_BASES = ['sqft_per_hour', 'units_per_hour', 'hours_per_unit', 'flat_hours'] as const;

const normalizeLaborLite = (raw: unknown): NormalizedLaborLite | null => {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name ?? raw.level_name ?? raw.label);
  const hourly = firstFinite(raw, ['hourly_rate', 'rate_per_hour', 'labor_rate', 'rate']);
  if (!name && hourly == null) return null;
  const basis = lc(raw.rate_basis ?? raw.basis ?? raw.rateBasis);
  const status = asString(raw.status) || 'active';
  const applies = Array.isArray(raw.applies_to_categories) ? raw.applies_to_categories
    : Array.isArray(raw.applies_to) ? raw.applies_to : [];
  return {
    id: asString(raw.id ?? raw.labor_level_id ?? raw.level_id) || null,
    name: name || 'Labor',
    hourly_rate: Math.max(0, num(hourly)),
    rate_basis: (LABOR_BASES as readonly string[]).includes(basis)
      ? basis as NormalizedLaborLite['rate_basis']
      : 'units_per_hour',
    rate_value: Math.max(0, num(firstFinite(raw, ['rate_value', 'rate', 'rateValue']) ?? 1)),
    applies_to: applies.map((v) => lc(v)).filter(Boolean),
    status,
    active: lc(status) !== 'inactive',
  };
};

// level entry refs: part.labor_level_id then part.labor_levels[] entries
// (id strings, {labor_level_id|level_id|id} refs, or inline level rows).
const laborRefEntries = (part: Record<string, unknown>, catalog: NormalizedLaborLite[], warnings: string[]): { level: NormalizedLaborLite | null; entry: Record<string, unknown> | null; label: string }[] => {
  const out: { level: NormalizedLaborLite | null; entry: Record<string, unknown> | null; label: string }[] = [];
  const seen = new Set<string>();
  const lookup = (idRaw: unknown, label: string) => {
    const id = asString(idRaw);
    if (!id) { warnings.push(`${label}: empty labor level id — skipped`); return; }
    const hit = catalog.find((l) => l.id && lc(l.id) === lc(id))
      ?? catalog.find((l) => lc(l.name) === lc(id));
    if (!hit) { warnings.push(`${label}: labor level "${id}" not found — skipped`); return; }
    if (hit.id && seen.has(lc(hit.id))) { warnings.push(`${label}: duplicate labor level "${id}" — skipped`); return; }
    if (hit.id) seen.add(lc(hit.id));
    out.push({ level: hit, entry: null, label });
  };

  if (asString(part.labor_level_id)) lookup(part.labor_level_id, 'labor_level_id');
  const list = Array.isArray(part.labor_levels) ? part.labor_levels : [];
  list.forEach((entry, i) => {
    const label = `labor_levels[${i}]`;
    if (typeof entry === 'string' || typeof entry === 'number') { lookup(entry, label); return; }
    if (isRecord(entry)) {
      const hasInline = entry.name !== undefined || entry.hourly_rate !== undefined;
      const refId = firstField(entry, ['labor_level_id', 'level_id', 'id']);
      if (!hasInline && refId !== undefined) { lookup(refId, label); return; }
      const lvl = normalizeLaborLite(entry);
      if (!lvl) { warnings.push(`${label}: invalid labor level row — skipped`); return; }
      if (lvl.id) {
        if (seen.has(lc(lvl.id))) { warnings.push(`${label}: duplicate labor level "${lvl.id}" — skipped`); return; }
        seen.add(lc(lvl.id));
      }
      out.push({ level: lvl, entry, label });
      return;
    }
    warnings.push(`${label}: invalid labor level entry — skipped`);
  });
  return out;
};

const partAreaSqft = (part: Record<string, unknown>): number =>
  Math.max(0, num(bagFinite(part, AREA_SQFT_FIELDS) ?? 0));

const laborHoursFor = (
  level: NormalizedLaborLite,
  entry: Record<string, unknown> | null,
  qty: number,
  area: number,
  manualHours: number | null,
): { hours: number; basis: string } => {
  const explicit = firstFiniteValue(
    entry ? firstFinite(entry, ['hours', 'labor_hours', 'manual_hours']) : null,
    manualHours,
  );
  if (explicit != null) return { hours: Math.max(0, explicit), basis: 'manual_hours' };
  let hours = 0;
  switch (level.rate_basis) {
    case 'sqft_per_hour': hours = level.rate_value > 0 ? area / level.rate_value : 0; break;
    case 'hours_per_unit': hours = qty * level.rate_value; break;
    case 'flat_hours': hours = level.rate_value; break;
    case 'units_per_hour':
    default: hours = level.rate_value > 0 ? qty / level.rate_value : 0; break;
  }
  return { hours: Number.isFinite(hours) && hours > 0 ? hours : 0, basis: level.rate_basis };
};

/**
 * Labor cost for ONE part: catalog/inline level refs priced by
 * rate_basis × rate_value (or explicit hours), plus flat/manual labor fields
 * and the machine-operator share handed in by the caller (machine operator
 * labor belongs to the labor bucket, not the machine bucket).
 * `machine_labor_cents` arrives as a priced number so this fn stays decoupled
 * from machine resolution. Inactive levels and applies_to mismatches skip.
 */
export function resolveLaborCost(args: {
  part: unknown;
  labor_levels?: unknown;
  machine_labor_cents?: unknown;
  machine_labor_hours?: unknown;
}): { cost_cents: number; lines: LaborCostLine[]; warnings: string[] } {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings: string[] = [];
  const catalog = (Array.isArray(a.labor_levels) ? a.labor_levels : [])
    .map(normalizeLaborLite)
    .filter((l): l is NormalizedLaborLite => !!l);
  const lines: LaborCostLine[] = [];
  const qty = Math.max(0, num(firstFinite(part, ['quantity', 'qty']) ?? 1));
  const area = partAreaSqft(part);
  const category = lc(firstField(part, ['category_key', 'category', 'part_category', 'product_category']));

  // Explicit/pre-resolved labor fields REPLACE registry resolution (they are
  // the part's own frozen labor number).
  const explicitCost = componentFinite(part, LABOR_COST_FIELDS);
  if (explicitCost != null) {
    lines.push({
      level_id: null, name: 'Labor (part field)', hours: 0, rate_per_hour: 0,
      cost_cents: toCents(Math.max(0, explicitCost)), source: 'explicit',
    });
  } else {
    const manualHours = bagFinite(part, LABOR_HOUR_FIELDS);
    const manualRate = bagFinite(part, LABOR_RATE_FIELDS);
    const refs = laborRefEntries(part, catalog, warnings);
    for (const { level, entry, label } of refs) {
      if (!level) continue;
      if (!level.active) {
        warnings.push(`${label}: labor level "${level.name}" is ${level.status} — skipped`);
        continue;
      }
      if (category && level.applies_to.length && !level.applies_to.includes(category)) {
        warnings.push(`${label}: labor level "${level.name}" does not apply to "${category}" — skipped`);
        continue;
      }
      const { hours } = laborHoursFor(level, entry, qty, area, manualHours);
      const rate = level.hourly_rate;
      const src: LaborCostLine['source'] = manualHours != null ? 'manual_hours' : (entry ? 'inline' : 'catalog');
      lines.push({
        level_id: level.id, name: level.name,
        hours: Math.round(hours * 1e6) / 1e6,
        rate_per_hour: manualRate != null && manualHours != null ? Math.max(0, manualRate) : rate,
        cost_cents: toCents(hours * (manualRate != null && manualHours != null ? Math.max(0, manualRate) : rate)),
        source: src,
      });
    }
    // Manual hours with no level configured at all still price when a rate is
    // findable (part rate → first catalog rate → 0).
    if (manualHours != null && refs.length === 0) {
      const rate = manualRate ?? (catalog[0]?.hourly_rate ?? 0);
      lines.push({
        level_id: null, name: 'Manual labor hours',
        hours: Math.round(Math.max(0, manualHours) * 1e6) / 1e6,
        rate_per_hour: Math.max(0, rate),
        cost_cents: toCents(Math.max(0, manualHours) * Math.max(0, rate)),
        source: 'manual_hours',
      });
      if (rate <= 0 && manualHours > 0) {
        warnings.push('labor hours present but no labor rate resolved — labor cost 0');
      }
    }
  }

  // Machine-operator share (labor_pct of machine run time at labor rate).
  const opCents = Math.max(0, num(a.machine_labor_cents));
  if (opCents > 0) {
    lines.push({
      level_id: null, name: 'Machine operator',
      hours: Math.round(num(a.machine_labor_hours) * 1e6) / 1e6,
      rate_per_hour: 0,
      cost_cents: opCents,
      source: 'machine_operator',
    });
  }

  return { cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0), lines, warnings };
}

// --- modifier cost resolution ---------------------------------------------------

type NormalizedModifierLite = {
  id: string | null;
  name: string;
  label: string;
  input_type: string;
  can_use_in_pricing: boolean;
  rates: { label: string; retail: number; cost: number; per_unit: string }[];
  include_setup_fee: boolean;
  min_charge: number;
  affects_waste: boolean;
  inventoried_part_type: string;
  status: string;
  active: boolean;
  options: { label: string; value: string; rate_overrides: Record<string, unknown> | null; is_default: boolean; sort: number; status: string }[];
};

const normalizeModifierLite = (raw: unknown): NormalizedModifierLite | null => {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name ?? raw.modifier_name ?? raw.label);
  const id = asString(raw.id ?? raw.modifier_id) || null;
  if (!name && !id && !Array.isArray(raw.rates)) return null;
  const rates = (Array.isArray(raw.rates) ? raw.rates : []).filter(isRecord).map((r) => ({
    label: asString(r.label),
    retail: num(r.retail),
    cost: num(r.cost),
    per_unit: asString(r.per_unit),
  }));
  const options = (Array.isArray(raw.options) ? raw.options : []).filter(isRecord).map((o) => ({
    label: asString(o.label),
    value: asString(o.value),
    rate_overrides: isRecord(o.rate_overrides) ? o.rate_overrides : null,
    is_default: o.is_default === true,
    sort: num(o.sort),
    status: asString(o.status) || 'active',
  }));
  const status = asString(raw.status) || 'active';
  return {
    id,
    name: name || id || 'modifier',
    label: asString(raw.label) || name || id || 'modifier',
    input_type: lc(raw.input_type) || 'text',
    can_use_in_pricing: raw.can_use_in_pricing === true,
    rates,
    include_setup_fee: raw.include_setup_fee === true,
    min_charge: Math.max(0, num(raw.min_charge)),
    affects_waste: raw.affects_waste === true,
    inventoried_part_type: asString(raw.inventoried_part_type),
    status,
    active: lc(status) === 'active' || lc(status) === '',
    options: options.sort((x, y) => x.sort - y.sort),
  };
};

// per_unit string → cost application kind (mirrors modifierPricing's table —
// 'cost' column rides the same per_unit basis as 'retail').
const PER_UNIT_KIND: Record<string, ModifierCostLine['kind']> = {
  per_unit: 'per_unit', each: 'per_unit', ea: 'per_unit', unit: 'per_unit',
  units: 'per_unit', qty: 'per_unit', quantity: 'per_unit', per_item: 'per_unit',
  'per each': 'per_unit',
  per_sqft: 'per_sqft', sqft: 'per_sqft', sq_ft: 'per_sqft', per_sq_ft: 'per_sqft',
  'sq ft': 'per_sqft', 'per sq ft': 'per_sqft', square_foot: 'per_sqft',
  square_feet: 'per_sqft', area: 'per_sqft',
  percent_of_base: 'percent', percent: 'percent', percentage: 'percent',
  pct: 'percent', pct_of_base: 'percent', percent_of_price: 'percent', '%': 'percent',
  flat_add: 'flat', flat: 'flat', flat_fee: 'flat', fee: 'flat', fixed: 'flat',
  once: 'flat', setup: 'flat', lump: 'flat', lump_sum: 'flat',
};

const RATE_ROW_KEYS = new Set(['label', 'retail', 'cost', 'per_unit']);

const modifierAnswerMap = (part: Record<string, unknown>): Record<string, unknown> => {
  for (const f of MODIFIER_ANSWER_FIELDS) {
    const v = part[f];
    if (isRecord(v)) return v;
  }
  return {};
};

const modifierAnswerFor = (m: NormalizedModifierLite, answers: Record<string, unknown>): { present: boolean; value: unknown } => {
  const has = (k: string) => k !== '' && Object.prototype.hasOwnProperty.call(answers, k);
  let raw: unknown;
  if (m.id && has(m.id)) raw = answers[m.id];
  else if (m.name && has(m.name)) raw = answers[m.name];
  else {
    const want = lc(m.name);
    const k = want && Object.keys(answers).find((key) => lc(key) === want);
    if (k === undefined) return { present: false, value: undefined };
    raw = answers[k];
  }
  if (isRecord(raw)) {
    for (const f of ['value', 'answer', 'option_id', 'option']) {
      if (raw[f] !== undefined) return { present: true, value: raw[f] };
    }
  }
  return { present: true, value: raw };
};

// Select-option → rate row with rate_overrides merged (mirrors
// modifierPricing.resolveModifierRateRow: option-matched row → rates[0] →
// flat override bag → keyed override bag).
const resolveModifierCostRate = (
  m: NormalizedModifierLite,
  answers: Record<string, unknown>,
): { rate: { label: string; retail: number; cost: number; per_unit: string } | null; optionLabel: string } => {
  const answer = modifierAnswerFor(m, answers);
  const activeOpts = m.options.filter((o) => lc(o.status || 'active') === 'active');
  let option: NormalizedModifierLite['options'][number] | null = null;
  if (m.input_type === 'select' && activeOpts.length) {
    if (answer.present && answer.value !== undefined && answer.value !== null && answer.value !== '') {
      const want = asString(answer.value);
      option = activeOpts.find((o) => o.value === want || o.label === want)
        ?? activeOpts.find((o) => lc(o.value) === lc(want) || lc(o.label) === lc(want))
        ?? null;
    }
    if (!option) option = activeOpts.find((o) => o.is_default) ?? null;
  }
  let base = option
    ? (m.rates.find((r) => r.label === option!.value || r.label === option!.label)
        ?? m.rates.find((r) => lc(r.label) === lc(option!.value) || lc(r.label) === lc(option!.label))
        ?? null)
    : null;
  if (!base) base = m.rates[0] ?? null;
  const bag = option?.rate_overrides ?? null;
  let overrideRow: Record<string, unknown> | null = null;
  if (isRecord(bag)) {
    if (Object.keys(bag).some((k) => RATE_ROW_KEYS.has(k))) overrideRow = bag;
    else if (option) {
      overrideRow = (isRecord(bag[option.value]) ? bag[option.value] : null)
        ?? (isRecord(bag[option.label]) ? bag[option.label] : null);
    }
  }
  if (!base && !overrideRow) return { rate: null, optionLabel: option?.label ?? '' };
  const merged = {
    label: base?.label ?? '',
    retail: base?.retail ?? 0,
    cost: base?.cost ?? 0,
    per_unit: base?.per_unit ?? '',
  };
  if (overrideRow) {
    if (asString(overrideRow.label) !== '') merged.label = asString(overrideRow.label);
    if (toFiniteNumber(overrideRow.retail) !== null) merged.retail = num(overrideRow.retail);
    if (toFiniteNumber(overrideRow.cost) !== null) merged.cost = num(overrideRow.cost);
    if (asString(overrideRow.per_unit) !== '') merged.per_unit = asString(overrideRow.per_unit);
    if (option && merged.label === '') merged.label = option.label;
  }
  return { rate: merged, optionLabel: option?.label ?? '' };
};

const modifierWasteFactorOf = (part: Record<string, unknown>): number => {
  const direct = bagFinite(part, ['waste_factor']);
  if (direct != null && direct > 0) return direct;
  const pct = bagFinite(part, ['waste_factor_percent', 'waste_pct', 'waste_percent']);
  if (pct != null) return 1 + pct / 100;
  return 1;
};

/**
 * Modifier cost for ONE part: attached PricingModifiers' resolved rate-row
 * `cost` applied by per_unit kind. Attachments come from the part's modifier
 * fields (entries may be catalog refs or inline modifier rows). An explicit
 * part.modifier_cost / snapshot modifier total replaces registry resolution.
 * Formula-typed modifiers carry no cost basis → 0 + warning. min_charge and
 * include_setup_fee are sell-side and never inflate cost.
 */
export function resolveModifierCost(args: {
  part: unknown;
  modifiers?: unknown;
  answers?: unknown;
}): { cost_cents: number; lines: ModifierCostLine[]; warnings: string[] } {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings: string[] = [];
  const lines: ModifierCostLine[] = [];
  const partQty = Math.max(0, num(firstFinite(part, ['quantity', 'qty']) ?? 1));
  const area = partAreaSqft(part);
  const waste = modifierWasteFactorOf(part);
  // percent_of_base cost applies over the part's own cost base (its snapshot
  // cost — the modifier's contribution is a % of the part it decorates).
  const baseCents = snapshotPartCostCents(part);
  const answers = isRecord(a.answers) ? a.answers : modifierAnswerMap(part);

  const explicit = componentFinite(part, MODIFIER_COST_FIELDS);
  if (explicit != null) {
    const c = toCents(Math.max(0, explicit));
    lines.push({
      modifier_id: null, name: 'Modifiers (part field)', rate_label: '',
      cost_rate: 0, per_unit: '', kind: 'none', quantity: partQty, area_sqft: area,
      cost_cents: c, source: 'explicit', pricing_gated: true,
    });
    return { cost_cents: c, lines, warnings };
  }

  const catalog = (Array.isArray(a.modifiers) ? a.modifiers : [])
    .map(normalizeModifierLite)
    .filter((m): m is NormalizedModifierLite => !!m);

  // Attachment list — first declared array field wins (modifierPricing parity);
  // entries: strings, {id|modifier_id|name|modifier_name|modifier:{…}} refs,
  // or inline modifier rows (input_type/rates present).
  let attached: { id: string; name: string }[] | null = null;
  const inlineMods: NormalizedModifierLite[] = [];
  for (const f of PART_MODIFIER_FIELDS) {
    const v = part[f];
    if (!Array.isArray(v)) continue;
    attached = [];
    v.forEach((entry, i) => {
      if (isRecord(entry) && (entry.input_type !== undefined || Array.isArray(entry.rates) || entry.can_use_in_pricing !== undefined)) {
        const m = normalizeModifierLite(entry);
        if (m) inlineMods.push(m);
        else warnings.push(`${f}[${i}]: invalid inline modifier — skipped`);
        return;
      }
      if (typeof entry === 'string' || typeof entry === 'number') {
        attached!.push({ id: asString(entry), name: asString(entry) });
        return;
      }
      if (isRecord(entry)) {
        const nested = isRecord(entry.modifier) ? entry.modifier : null;
        attached!.push({
          id: asString(entry.id ?? entry.modifier_id ?? nested?.id),
          name: asString(entry.name ?? entry.modifier_name ?? nested?.name),
        });
        return;
      }
      warnings.push(`${f}[${i}]: invalid modifier entry — skipped`);
    });
    break;
  }

  const partType = lc(firstField(part, ['part_type', 'inventoried_part_type', 'partType']));
  const seen = new Set<string>();
  const candidates: { m: NormalizedModifierLite; inline: boolean }[] = [
    ...catalog.map((m) => ({ m, inline: false })),
    ...inlineMods.map((m) => ({ m, inline: true })),
  ];
  for (const { m, inline } of candidates) {
    if (!m.active) continue;
    if (m.inventoried_part_type && partType && lc(m.inventoried_part_type) !== partType) continue;
    if (!inline && attached !== null) {
      const mid = lc(m.id);
      const mname = lc(m.name);
      const hit = attached.some((r) =>
        (mid !== '' && (lc(r.id) === mid || lc(r.name) === mid)) ||
        (mname !== '' && (lc(r.name) === mname || lc(r.id) === mname)));
      if (!hit) continue;
    }
    if (!inline && attached === null) continue; // no attachment field → modifiers resolve only when explicitly attached
    const key = m.id || `name:${lc(m.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (m.input_type === 'formula') {
      lines.push({
        modifier_id: m.id, name: m.label || m.name, rate_label: '',
        cost_rate: 0, per_unit: '', kind: 'none', quantity: partQty, area_sqft: area,
        cost_cents: 0, source: inline ? 'inline' : 'catalog',
        pricing_gated: m.can_use_in_pricing,
      });
      warnings.push(`modifier "${m.name}" is formula-priced — no cost basis, contributes 0`);
      continue;
    }
    const { rate } = resolveModifierCostRate(m, answers);
    if (!rate) {
      lines.push({
        modifier_id: m.id, name: m.label || m.name, rate_label: '',
        cost_rate: 0, per_unit: '', kind: 'none', quantity: partQty, area_sqft: area,
        cost_cents: 0, source: inline ? 'inline' : 'catalog',
        pricing_gated: m.can_use_in_pricing,
      });
      warnings.push(`modifier "${m.name}" has no resolvable rate row — cost 0`);
      continue;
    }
    const kind = PER_UNIT_KIND[lc(rate.per_unit)] ?? 'flat';
    const effQty = m.affects_waste ? partQty * waste : partQty;
    // percent_of_base cost applies over the part's own stored cost — the
    // computation already runs in cents so no dollar conversion needed.
    const cost = kind === 'percent'
      ? Math.round(baseCents * rate.cost / 100)
      : toCents(
          kind === 'per_unit' ? rate.cost * effQty
          : kind === 'per_sqft' ? rate.cost * (m.affects_waste ? area * waste : area)
          : rate.cost, // flat
        );
    lines.push({
      modifier_id: m.id, name: m.label || m.name, rate_label: rate.label,
      cost_rate: rate.cost, per_unit: rate.per_unit, kind,
      quantity: effQty, area_sqft: area,
      cost_cents: cost, source: inline ? 'inline' : 'catalog',
      pricing_gated: m.can_use_in_pricing,
    });
  }
  return { cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0), lines, warnings };
}

// --- part cost ---------------------------------------------------------------

/**
 * The part's stored (frozen) cost in cents — the authoritative per-product
 * amount. Chain: explicit material_cost fields → frozen_extended_cost /
 * extended_cost → unit cost × quantity → manual_cost × quantity →
 * current_extended_cost. Negative costs are legal (reconciliation adjustment
 * parts carry negative frozen_extended_cost).
 */
export function snapshotPartCostCents(part: unknown): number {
  if (!isRecord(part)) return 0;
  const explicitMaterial = componentFinite(part, MATERIAL_COST_FIELDS);
  if (explicitMaterial != null) return toCents(explicitMaterial);
  const ext = firstFinite(part, PART_EXTENDED_COST_FIELDS);
  if (ext != null) return toCents(ext);
  const qty = num(firstFinite(part, ['quantity', 'qty']) ?? 1);
  const unit = firstFinite(part, PART_UNIT_COST_FIELDS);
  if (unit != null) return toCents(unit * qty);
  const manual = firstFinite(part, PART_MANUAL_COST_FIELDS);
  if (manual != null) return toCents(manual * qty);
  const current = firstFinite(part, PART_CURRENT_EXTENDED_FIELDS);
  if (current != null) return toCents(current);
  return 0;
}

/**
 * Full cost decomposition of one BuilderPart row. Bucket routing keeps the
 * stored cost in exactly one component; configured refs (machine_ids,
 * labor_level_id/labor_levels, modifier attachments) resolve ADDITIONAL
 * components — ref resolution is skipped for the component the bucket
 * already represents (a labor part's level refs would double-count).
 * Inactive parts (is_active === false) contribute 0.
 */
export function partCostBreakdown(args: {
  part: unknown;
  machines?: unknown;
  labor_levels?: unknown;
  modifiers?: unknown;
  answers?: unknown;
}): PartCostBreakdown {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const bucket = partCostBucket(part);
  const snapshot = snapshotPartCostCents(part);
  const warnings: string[] = [];
  const active = part.is_active !== false;

  const machineRes = bucket !== 'machine' && active
    ? resolveMachineCost({ part, machines: a.machines })
    : { cost_cents: 0, lines: [], operator_labor_cents: 0, warnings: [] };
  // Explicit machine_cost fields REPLACE registry resolution when present.
  const explicitMachine = bucket !== 'machine' ? componentFinite(part, MACHINE_COST_FIELDS) : null;
  const machineCents = bucket === 'machine'
    ? snapshot
    : explicitMachine != null ? toCents(Math.max(0, explicitMachine)) : machineRes.cost_cents;

  const laborRes = bucket !== 'labor' && active
    ? resolveLaborCost({
        part,
        labor_levels: a.labor_levels,
        machine_labor_cents: explicitMachine == null ? machineRes.operator_labor_cents : 0,
        machine_labor_hours: machineRes.lines.reduce((s, l) => s + l.operator_labor_hours, 0),
      })
    : { cost_cents: 0, lines: [], warnings: [] };
  const laborCents = bucket === 'labor' ? snapshot : laborRes.cost_cents;

  const explicitModifier = bucket !== 'modifier' ? componentFinite(part, MODIFIER_COST_FIELDS) : null;
  const modifierRes = bucket !== 'modifier' && active && explicitModifier == null
    ? resolveModifierCost({ part, modifiers: a.modifiers, answers: a.answers })
    : { cost_cents: 0, lines: [], warnings: [] };
  const modifierCents = bucket === 'modifier'
    ? snapshot
    : explicitModifier != null ? toCents(Math.max(0, explicitModifier)) : modifierRes.cost_cents;

  const materialCents = bucket === 'material' ? snapshot : 0;
  const extras = machineRes.cost_cents + laborRes.cost_cents + modifierRes.cost_cents;
  const total = active
    ? materialCents + machineCents + laborCents + modifierCents
    : 0;
  warnings.push(...machineRes.warnings, ...laborRes.warnings, ...modifierRes.warnings);
  if (!active) warnings.push('part is inactive — excluded from cost');

  return {
    part_id: asString(part.id) || null,
    part_key: asString(part.part_key),
    part_name: asString(part.part_name ?? part.client_label ?? part.name),
    part_type: asString(part.part_type) || 'material',
    bucket,
    quantity: Math.max(0, num(firstFinite(part, ['quantity', 'qty']) ?? 1)),
    material_cents: active ? materialCents : 0,
    machine_cents: active ? machineCents : 0,
    labor_cents: active ? laborCents : 0,
    modifier_cents: active ? modifierCents : 0,
    total_cents: total,
    snapshot_cents: active ? snapshot : 0,
    resolved_extras_cents: active ? extras : 0,
    machines: machineRes.lines,
    labor: laborRes.lines,
    modifiers: modifierRes.lines,
    warnings,
  };
}

// --- line margin ---------------------------------------------------------------

// acceptedCustomerUnitPrice parity (customerPricing.js): the frozen customer
// unit price falls back to the frozen product snapshot on legacy lines.
const lineUnitSell = (line: Record<string, unknown>): number =>
  firstFiniteValue(line.customer_price_snapshot) ?? num(line.total_snapshot);

const categoryAdjFor = (line: Record<string, unknown>, catAdj: unknown): number =>
  isRecord(catAdj) ? num(catAdj[asString(line.product_category)]) : 0;

/**
 * Line sell in cents: unit × customer_quantity extended, then the per-line
 * adjustment (line.adjustment_percent + the estimate's category_adjustments
 * entry for this product_category) — aioPricing.computePricing parity.
 */
export function lineSellCents(line: unknown, estimate?: unknown): number {
  const l = isRecord(line) ? line : {};
  const unit = lineUnitSell(l);
  const qty = Math.max(0, num(firstFiniteValue(l.customer_quantity) ?? 1));
  const adj = num(l.adjustment_percent)
    + categoryAdjFor(l, isRecord(estimate) ? estimate!.category_adjustments : undefined);
  return scaleCents(toCents(unit * qty), 1 + adj / 100);
}

const partsForLine = (line: Record<string, unknown>, parts: unknown): Record<string, unknown>[] => {
  const all = (Array.isArray(parts) ? parts : []).filter(isRecord);
  const bpid = asString(line.builder_product_id ?? line.product_id);
  if (!bpid) return [];
  return all.filter((p) => asString(p.builder_product_id) === bpid);
};

// Find the module project record for a line: `projects` may be a Map/object
// keyed by project_id or an array of project rows; a line may also embed
// .project / .project_record directly.
const projectForLine = (line: Record<string, unknown>, projects: unknown): Record<string, unknown> | null => {
  if (isRecord(line.project)) return line.project;
  if (isRecord(line.project_record)) return line.project_record;
  const pid = asString(line.project_id);
  if (!pid) return null;
  if (Array.isArray(projects)) {
    return projects.filter(isRecord).find((r) => asString(r.id) === pid) ?? null;
  }
  if (projects instanceof Map) {
    const v = projects.get(pid);
    return isRecord(v) ? v : null;
  }
  if (isRecord(projects)) {
    const v = projects[pid];
    return isRecord(v) ? v : null;
  }
  return null;
};

const projectHasComponentTotals = (project: Record<string, unknown>): boolean =>
  firstFinite(project, PROJECT_MACHINE_FIELDS) != null
  || firstFinite(project, PROJECT_LABOR_FIELDS) != null
  || firstFinite(project, PROJECT_MATERIAL_FIELDS) != null
  || firstFinite(project, PROJECT_MODIFIER_FIELDS) != null;

/**
 * Margin for ONE estimate line (product section).
 *   sell = frozen customer unit price × customer_quantity × (1 + adj%)
 *   cost = resolved components per the cost_basis chain (parts → project →
 *          snapshot), scaled by customer_quantity.
 * `parts` is the flat BuilderPart list for the whole estimate (filtered here
 * by builder_product_id); `projects` supplies module project records.
 */
export function lineMargin(args: {
  line: unknown;
  estimate?: unknown;
  parts?: unknown;
  machines?: unknown;
  labor_levels?: unknown;
  modifiers?: unknown;
  projects?: unknown;
  answers?: unknown;
}): LineMargin {
  const a = isRecord(args) ? args : {};
  const line = isRecord(a.line) ? a.line : {};
  const warnings: string[] = [];
  const qty = Math.max(0, num(firstFiniteValue(line.customer_quantity) ?? 1));
  const sellCents = lineSellCents(line, a.estimate);
  const unit = lineUnitSell(line);
  const adjPct = num(line.adjustment_percent)
    + categoryAdjFor(line, isRecord(a.estimate) ? a.estimate!.category_adjustments : undefined);
  const snapshotExt = toCents(num(line.total_snapshot) * qty);

  let material = 0, machine = 0, labor = 0, modifier = 0;
  let basis: LineMargin['cost_basis'] = 'snapshot';
  let partBreakdowns: PartCostBreakdown[] = [];

  const lineParts = partsForLine(line, a.parts);
  if (lineParts.length) {
    basis = 'parts';
    partBreakdowns = lineParts.map((part) => partCostBreakdown({
      part,
      machines: a.machines,
      labor_levels: a.labor_levels,
      modifiers: a.modifiers,
      answers: a.answers,
    }));
    for (const pb of partBreakdowns) {
      material += pb.material_cents;
      machine += pb.machine_cents;
      labor += pb.labor_cents;
      modifier += pb.modifier_cents;
      warnings.push(...pb.warnings.map((w) => `${pb.part_name || 'part'}: ${w}`));
    }
    // parts are per-product; the line extends by customer_quantity.
    material = scaleCents(material, qty);
    machine = scaleCents(machine, qty);
    labor = scaleCents(labor, qty);
    modifier = scaleCents(modifier, qty);
  } else {
    const project = projectForLine(line, a.projects);
    if (project && projectHasComponentTotals(project)) {
      basis = 'project';
      machine = scaleCents(toCents(num(firstFinite(project, PROJECT_MACHINE_FIELDS) ?? 0)), qty);
      labor = scaleCents(toCents(num(firstFinite(project, PROJECT_LABOR_FIELDS) ?? 0)), qty);
      modifier = scaleCents(toCents(num(firstFinite(project, PROJECT_MODIFIER_FIELDS) ?? 0)), qty);
      const declaredMaterial = firstFinite(project, PROJECT_MATERIAL_FIELDS);
      if (declaredMaterial != null) {
        material = scaleCents(toCents(declaredMaterial), qty);
        const resolved = material + machine + labor + modifier;
        if (Math.abs(resolved - snapshotExt) > 1) {
          warnings.push(
            `project component total ${fromCents(resolved)} differs from frozen snapshot ${fromCents(snapshotExt)} — resolved components used`,
          );
        }
      } else {
        // Material is the residual inside the authoritative frozen cost.
        material = Math.max(0, snapshotExt - machine - labor - modifier);
        if (machine + labor + modifier > snapshotExt) {
          warnings.push('project machine/labor/modifier totals exceed the frozen snapshot — material cost floored at 0');
        }
      }
    } else {
      material = snapshotExt;
    }
  }

  const total = material + machine + labor + modifier;
  const margin = sellCents - total;
  return {
    line_id: asString(line.line_id ?? line.id) || '',
    label: asString(line.client_product_name ?? line.builder_name ?? line.project_name) || 'Product',
    module_key: asString(line.module_key),
    quantity: qty,
    cost_basis: basis,
    sell: fromCents(sellCents),
    sell_cents: sellCents,
    unit_sell: unit,
    adjustment_percent: adjPct,
    material_cost: fromCents(material),
    machine_cost: fromCents(machine),
    labor_cost: fromCents(labor),
    modifier_cost: fromCents(modifier),
    total_cost: fromCents(total),
    material_cost_cents: material,
    machine_cost_cents: machine,
    labor_cost_cents: labor,
    modifier_cost_cents: modifier,
    total_cost_cents: total,
    margin_cents: margin,
    margin_pct: marginPctOf(margin, sellCents),
    markup_on_cost_pct: markupPctOf(margin, total),
    snapshot_cost_cents: snapshotExt,
    parts: partBreakdowns,
    warnings: dedupeWarnings(warnings),
  };
}

// --- estimate rollup -------------------------------------------------------------

/**
 * Estimate-level margin rollup. total_sell = Σ line sells − discount +
 * contingency − internal_discount (the customer revenue before fees/tax —
 * profitability.js parity; fees/tax excluded because their internal cost is
 * untracked). When the caller passes `pricing` (aioPricing result), its
 * subtotal/discount/contingency win over the recomputed waterfall so the
 * margin matches the displayed customer numbers cent-for-cent.
 * margin_cents = total_sell − total_cost; margin_pct = 0 when total_sell ≤ 0.
 */
export function estimateMargin(args: {
  estimate?: unknown;
  parts?: unknown;
  machines?: unknown;
  labor_levels?: unknown;
  modifiers?: unknown;
  projects?: unknown;
  pricing?: unknown;
  answers?: unknown;
  low_margin_pct?: unknown;
}): EstimateMargin {
  const a = isRecord(args) ? args : {};
  const estimate = isRecord(a.estimate) ? a.estimate : {};
  const pricing = isRecord(a.pricing) ? a.pricing : null;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  const lines = lineItems.map((line) => lineMargin({
    line,
    estimate,
    parts: a.parts,
    machines: a.machines,
    labor_levels: a.labor_levels ?? (a as Record<string, unknown>).laborLevels,
    modifiers: a.modifiers,
    projects: a.projects,
    answers: a.answers,
  }));

  const gross = lines.reduce((s, l) => s + l.sell_cents, 0);
  const grossMargin = lines.reduce((s, l) => s + l.margin_cents, 0);
  const comp = {
    material_cents: lines.reduce((s, l) => s + l.material_cost_cents, 0),
    machine_cents: lines.reduce((s, l) => s + l.machine_cost_cents, 0),
    labor_cents: lines.reduce((s, l) => s + l.labor_cost_cents, 0),
    modifier_cents: lines.reduce((s, l) => s + l.modifier_cost_cents, 0),
  };
  const totalCost = comp.material_cents + comp.machine_cents + comp.labor_cents + comp.modifier_cents;

  // Waterfall — prefer the caller's displayed pricing figures, else recompute.
  const subtotalCents = pricing && firstFiniteValue(pricing.subtotal) != null
    ? toCents(pricing.subtotal)
    : gross;
  const discountCents = pricing && firstFiniteValue(pricing.discount) != null
    ? toCents(pricing.discount)
    : scaleCents(subtotalCents, num(estimate.discount_percent) / 100);
  const contingencyCents = pricing && firstFiniteValue(pricing.contingency) != null
    ? toCents(pricing.contingency)
    : scaleCents(subtotalCents - discountCents, num(estimate.contingency_percent) / 100);
  const internalDiscountCents = toCents(firstFinite(estimate, ['internal_discount']) ?? 0);
  const netSell = subtotalCents - discountCents + contingencyCents - internalDiscountCents;
  const margin = netSell - totalCost;

  const warnings = dedupeWarnings(lines.flatMap((l, i) =>
    l.warnings.map((w) => `${l.label || `line ${i + 1}`} — ${w}`)));

  const share = (c: number) => (totalCost > 0 ? Math.round((c / totalCost) * 10000) / 100 : 0);
  return {
    line_count: lines.length,
    lines,
    gross_sell: fromCents(gross),
    gross_sell_cents: gross,
    discount_cents: discountCents,
    contingency_cents: contingencyCents,
    internal_discount_cents: internalDiscountCents,
    total_sell: fromCents(netSell),
    total_sell_cents: netSell,
    material_cost: fromCents(comp.material_cents),
    machine_cost: fromCents(comp.machine_cents),
    labor_cost: fromCents(comp.labor_cents),
    modifier_cost: fromCents(comp.modifier_cents),
    total_cost: fromCents(totalCost),
    material_cost_cents: comp.material_cents,
    machine_cost_cents: comp.machine_cents,
    labor_cost_cents: comp.labor_cents,
    modifier_cost_cents: comp.modifier_cents,
    total_cost_cents: totalCost,
    margin_cents: margin,
    margin_pct: marginPctOf(margin, netSell),
    markup_on_cost_pct: markupPctOf(margin, totalCost),
    gross_margin_cents: grossMargin,
    by_component: {
      ...comp,
      material: fromCents(comp.material_cents),
      machine: fromCents(comp.machine_cents),
      labor: fromCents(comp.labor_cents),
      modifier: fromCents(comp.modifier_cents),
      material_share_pct: share(comp.material_cents),
      machine_share_pct: share(comp.machine_cents),
      labor_share_pct: share(comp.labor_cents),
      modifier_share_pct: share(comp.modifier_cents),
    },
    warnings,
  };
}

/** Lines whose margin_pct falls under the threshold (sell > 0 lines only —
 *  a zero-sell line reports 0% but isn't a pricing problem by itself). */
export function lowMarginLines(rollup: unknown, thresholdPct: unknown = DEFAULT_LOW_MARGIN_PCT): LineMargin[] {
  const r = isRecord(rollup) ? rollup : {};
  const threshold = num(thresholdPct, DEFAULT_LOW_MARGIN_PCT);
  return (Array.isArray(r.lines) ? r.lines : [])
    .filter((l): l is LineMargin => isRecord(l) && num(l.sell_cents) > 0 && num(l.margin_pct) < threshold);
}
