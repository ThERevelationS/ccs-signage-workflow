// Pure pricing engine — CoreBridge-style pricing-admin parity.
//
// Deterministic math only: no React, no JSX, no imports, no entity access.
// Callers hand the engine plain row objects (PricingTierMatrix / LaborLevel /
// MachineRate records as loaded by pricingPersistence) and get back priced
// breakdowns.
//
// Money semantics:
//   - PricingTierMatrix.markup_pct is a percent over cost (50 = cost x 1.50),
//     unlike markupEngine.jsx where tiers store multipliers (1.50).
//   - All returned money figures are rounded to cents (round2); unit prices to
//     4 decimals so extensions stay exact.
//
// Pricing modes (PricingTierMatrix.pricing_mode):
//   - 'markup' (default) — unit price = unitCost x (1 + markup_pct/100), or a
//     qualifying per_unit_breaks bracket when one exists.
//   - 'market' — unit price = market_retail x (1 - market_discount_pct/100); a
//     qualifying break still wins when it prices BELOW the market price. A
//     market row with no market_retail falls back to the markup path.
// In both modes row.formula_modifiers (and any caller-level modifiers passed to
// priceQuote/resolveEffectivePrice) then adjust the resolved unit price before
// the extension and the minimum_charge floor are computed.

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normStr = (v) => String(v ?? "").trim().toLowerCase();

export const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
export const round4 = (n) => Math.round((num(n) + Number.EPSILON) * 10000) / 10000;

// --- Date windows -------------------------------------------------------------

// "YYYY-MM-DD" parses as UTC midnight; a date-only effective_to is inclusive
// through end of day. Anything Date.parse understands (ISO timestamps) works too.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const toTime = (v, { endOfDay = false } = {}) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return endOfDay && DATE_ONLY.test(s) ? t + 86399999 : t;
};

const rowIsActive = (row) => normStr(row?.status ?? "active") !== "inactive";

export function rowIsEffective(row, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : toTime(now);
  const at = Number.isFinite(t) ? t : Date.now();
  const from = toTime(row?.effective_from);
  const to = toTime(row?.effective_to, { endOfDay: true });
  if (from != null && at < from) return false;
  if (to != null && at > to) return false;
  return true;
}

// --- Matrix matching ----------------------------------------------------------

// Match specificity ladder (higher wins):
//   3 = row pins both category AND customer_tier
//   2 = row pins category only (category-wide default)
//   1 = row pins customer_tier only (tier-wide default)
//   0 = blank/blank row — the global default inside the matrix
// When no row matches at all the caller falls back to defaultMarkupPct.
export const MATRIX_MATCH = Object.freeze({
  CATEGORY_AND_TIER: 3,
  CATEGORY_ONLY: 2,
  TIER_ONLY: 1,
  DEFAULT_ROW: 0,
});

// A customerTier may arrive as a MarkupTier record ({id, tier_name,
// tier_number, name}) or a bare string/number. Rows match on tier_name,
// tier_number, id, or name — whichever the admin typed into customer_tier.
const tierKeySet = (customerTier) => {
  const keys = new Set();
  const add = (v) => {
    const k = normStr(v);
    if (k) keys.add(k);
  };
  if (customerTier && typeof customerTier === "object") {
    add(customerTier.tier_name);
    add(customerTier.tier_number);
    add(customerTier.id);
    add(customerTier.name);
  } else {
    add(customerTier);
  }
  return keys;
};

// Specificity of `row` for this {category, tierKeys} request, or -1 when the
// row is constrained on a dimension the request doesn't satisfy.
const matchSpecificity = (row, category, tierKeys) => {
  const rowCat = normStr(row?.category);
  const rowTier = normStr(row?.customer_tier);
  if (rowCat && rowCat !== normStr(category)) return -1;
  if (rowTier && !tierKeys.has(rowTier)) return -1;
  return (rowCat ? 2 : 0) + (rowTier ? 1 : 0);
};

/**
 * Resolve the winning PricingTierMatrix row for {category, customerTier}.
 * Only active rows inside their effective window compete. Ties inside a
 * specificity level go to the most recently effective row, then the most
 * recently updated, then lowest id — fully deterministic.
 * @returns {{row: Object, specificity: number} | null}
 */
export function resolveMatrixRow({ category, customerTier, matrices = [], now } = {}) {
  const tierKeys = tierKeySet(customerTier);
  let best = null;
  for (const row of matrices || []) {
    if (!row || !rowIsActive(row) || !rowIsEffective(row, now)) continue;
    const specificity = matchSpecificity(row, category, tierKeys);
    if (specificity < 0) continue;
    const candidate = {
      row,
      specificity,
      from: toTime(row.effective_from) ?? -Infinity,
      updated: toTime(row.updated_date) ?? -Infinity,
    };
    if (
      !best ||
      candidate.specificity > best.specificity ||
      (candidate.specificity === best.specificity &&
        (candidate.from > best.from ||
          (candidate.from === best.from &&
            (candidate.updated > best.updated ||
              (candidate.updated === best.updated &&
                String(row.id || "") < String(best.row.id || ""))))))
    ) {
      best = candidate;
    }
  }
  return best ? { row: best.row, specificity: best.specificity } : null;
}

/**
 * Pick the per-unit price break for a quantity: the bracket with the highest
 * qualifying `qty` threshold wins. Returns the bracket or null.
 */
export function pickUnitBreak(breaks, qty) {
  const q = num(qty);
  if (!Array.isArray(breaks) || q <= 0) return null;
  let pick = null;
  for (const b of breaks) {
    const bq = num(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > q) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    if (!pick || bq > num(pick.qty)) pick = b;
  }
  return pick;
}

// --- Formula modifiers --------------------------------------------------------

// Ordered unit-price adjustments, applied left-to-right. Each modifier is
// {type, value}:
//   add_pct  — price = price x (1 + value/100)   (percent markup/discount;
//                                               negative value discounts)
//   mul      — price = price x value             (raw multiplier)
//   add_flat — price = price + value             (flat dollars per unit)
//   min      — price = max(price, value)         (unit floor)
//   max      — price = min(price, value)         (unit cap)
// Unknown types, missing/non-finite values, and non-array input are skipped or
// ignored. A modifier can never push a unit price below zero. Returns the
// adjusted unit price plus an `applied` audit list ({type, value, before,
// after}) so callers can render exactly which steps ran.
export function applyFormulaModifiers(unitPrice, modifiers) {
  let price = num(unitPrice);
  const applied = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    const type = normStr(m?.type);
    const value = Number(m?.value);
    if (!Number.isFinite(value)) continue;
    const before = price;
    if (type === "add_pct") price = price * (1 + value / 100);
    else if (type === "mul") price = price * value;
    else if (type === "add_flat") price = price + value;
    else if (type === "min") price = Math.max(price, value);
    else if (type === "max") price = Math.min(price, value);
    else continue;
    price = Math.max(0, price);
    applied.push({ type, value, before: round4(before), after: round4(price) });
  }
  return { unitPrice: round4(price), applied };
}

// --- Market-based pricing -------------------------------------------------------

/**
 * Market-based price for one line under a pricing_mode='market' matrix row.
 * unit = marketRetail x (1 - marketDiscountPct/100).
 * marketRetail / marketDiscountPct args override the row's market_retail /
 * market_discount_pct fields; the row's values are the default source.
 *
 * per_unit_breaks precedence: a qualifying bracket only wins when its
 * unit_price undercuts the market unit price (a volume deal must actually beat
 * market). minimum_charge floors the extension exactly like the markup path.
 */
export function resolveMarketPrice({
  matrixRow = null,
  marketRetail,
  marketDiscountPct,
  qty,
  label = "",
  category = "",
} = {}) {
  const q = num(qty);
  const retail = Number.isFinite(Number(marketRetail))
    ? Number(marketRetail)
    : num(matrixRow?.market_retail);
  const discountPct = Number.isFinite(Number(marketDiscountPct))
    ? Number(marketDiscountPct)
    : num(matrixRow?.market_discount_pct);
  const marketUnit = Math.max(0, retail * (1 - discountPct / 100));

  const brk = matrixRow ? pickUnitBreak(matrixRow.per_unit_breaks, q) : null;
  const useBreak = !!brk && num(brk.unit_price) < marketUnit;
  const unitPrice = useBreak ? num(brk.unit_price) : marketUnit;
  const source = useBreak ? "qty_break" : "market";

  const minimum = num(matrixRow?.minimum_charge);
  const computed = unitPrice * q;
  const minimumApplied = minimum > 0 && computed > 0 && computed < minimum;
  const extended = minimumApplied ? minimum : computed;

  return {
    label,
    category: category || matrixRow?.category || "",
    qty: q,
    pricingMode: "market",
    marketRetail: retail,
    marketDiscountPct: discountPct,
    unitPrice: round4(unitPrice),
    extended: round2(extended),
    computedExtended: round2(computed),
    source,
    breakApplied: useBreak ? brk : null,
    minimumCharge: minimum,
    minimumApplied,
  };
}

/**
 * Resolve the effective price for one line.
 * Precedence inside a matched row: a pricing_mode='market' row with a
 * market_retail prices off market (a qualifying break only wins when cheaper);
 * otherwise qualifying per_unit_breaks bracket > markup_pct over cost. Without
 * any row: defaultMarkupPct over cost. Row formula_modifiers then any
 * caller-level `modifiers` adjust the resolved unit price before
 * minimum_charge floors the extension (never fires on a zero/qty<=0 line).
 */
export function resolveEffectivePrice({
  category,
  qty,
  unitCost,
  customerTier,
  matrices = [],
  defaultMarkupPct = 0,
  now,
  label = "",
  marketRetail,
  marketDiscountPct,
  modifiers = [],
} = {}) {
  const q = num(qty);
  const cost = num(unitCost);
  const match = resolveMatrixRow({ category, customerTier, matrices, now });
  const row = match?.row || null;
  const pricingMode = normStr(row?.pricing_mode) === "market" ? "market" : "markup";

  const brk = row ? pickUnitBreak(row.per_unit_breaks, q) : null;
  const retail = Number.isFinite(Number(marketRetail))
    ? Number(marketRetail)
    : num(row?.market_retail, NaN);
  let unitPrice;
  let source;
  let breakApplied = null;
  let marketInfo = null;
  if (pricingMode === "market" && Number.isFinite(retail) && retail > 0) {
    const mkt = resolveMarketPrice({
      matrixRow: row,
      marketRetail,
      marketDiscountPct,
      qty: q,
      label,
      category,
    });
    unitPrice = mkt.unitPrice;
    source = mkt.source;
    breakApplied = mkt.breakApplied;
    marketInfo = {
      marketRetail: mkt.marketRetail,
      marketDiscountPct: mkt.marketDiscountPct,
    };
  } else if (brk) {
    unitPrice = num(brk.unit_price);
    source = "qty_break";
    breakApplied = brk;
  } else if (row) {
    unitPrice = cost * (1 + num(row.markup_pct) / 100);
    source = "matrix_markup";
  } else {
    unitPrice = cost * (1 + num(defaultMarkupPct) / 100);
    source = "default_markup";
  }

  // Ordered formula modifiers run after the source price resolves:
  // row.formula_modifiers first, then the caller-level `modifiers` list.
  const baseUnitPrice = unitPrice;
  const modResult = applyFormulaModifiers(unitPrice, [
    ...(Array.isArray(row?.formula_modifiers) ? row.formula_modifiers : []),
    ...(Array.isArray(modifiers) ? modifiers : []),
  ]);
  unitPrice = modResult.unitPrice;

  const minimum = row ? num(row.minimum_charge) : 0;
  const computed = unitPrice * q;
  const minimumApplied = minimum > 0 && computed > 0 && computed < minimum;
  const extended = minimumApplied ? minimum : computed;

  return {
    label,
    category: category || "",
    qty: q,
    unitCost: cost,
    unitPrice: round4(unitPrice),
    baseUnitPrice: round4(baseUnitPrice),
    extended: round2(extended),
    computedExtended: round2(computed),
    source,
    pricingMode,
    market: marketInfo,
    matchedRow: row,
    matchedRowId: row?.id || null,
    matchedRowName: row?.name || null,
    specificity: match?.specificity ?? null,
    breakApplied,
    modifiersApplied: modResult.applied,
    minimumCharge: minimum,
    minimumApplied,
  };
}

// --- Labor --------------------------------------------------------------------

// A laborLevel may be a record ({id, name, level_rank}), a name string, or a
// rank number. Only active levels resolve.
export function resolveLaborLevel(laborLevel, laborLevels = []) {
  if (laborLevel == null || laborLevel === "") return null;
  const wanted = normStr(
    typeof laborLevel === "object" ? laborLevel.name ?? laborLevel.id : laborLevel,
  );
  const wantedRank =
    typeof laborLevel === "object" ? laborLevel.level_rank : null;
  let best = null;
  for (const row of laborLevels || []) {
    if (!row || !rowIsActive(row)) continue;
    const hit =
      (wanted && (normStr(row.name) === wanted || normStr(row.id) === wanted)) ||
      (wantedRank != null && num(row.level_rank, NaN) === num(wantedRank, NaN));
    if (!hit) continue;
    if (!best || num(row.level_rank) > num(best.level_rank)) best = row;
  }
  return best;
}

/** laborCost = hours x resolved level hourly_rate (rate override wins). */
export function computeLaborCost({ hours, laborLevel, laborLevels = [], rate } = {}) {
  const h = Math.max(0, num(hours));
  const level = resolveLaborLevel(laborLevel, laborLevels);
  const explicitRate = Number(rate);
  const r = Number.isFinite(explicitRate) ? explicitRate : num(level?.hourly_rate);
  return {
    hours: h,
    level,
    levelName: level?.name || null,
    rate: r,
    cost: round2(h * r),
    levelFound: !!level || Number.isFinite(explicitRate),
  };
}

// --- Machine ------------------------------------------------------------------

// machineType selects an active MachineRate row by machine_type; machineRate
// (name or id) pins an exact row and wins when both are given.
export function resolveMachineRate({ machineType, machineRate, machineRates = [] } = {}) {
  const wantedType = normStr(machineType);
  const wantedRow = normStr(machineRate);
  let best = null;
  for (const row of machineRates || []) {
    if (!row || !rowIsActive(row)) continue;
    const named = wantedRow && (normStr(row.name) === wantedRow || normStr(row.id) === wantedRow);
    const typed = wantedType && normStr(row.machine_type) === wantedType;
    if (!named && !typed) continue;
    if (named) return row; // exact pin — first named match wins outright
    const updated = toTime(row.updated_date) ?? -Infinity;
    if (!best || updated > best.updated) best = { row, updated };
  }
  return best?.row || null;
}

/**
 * machineCost = setupMinutes/60 x runtime_rate
 *             + runtimeHours x runtime_rate
 *             + runtimeHours x maintenance_rate_per_hour
 *             + materialCost x material_waste_pct/100
 * setupMinutes defaults to the rate row's setup_minutes.
 */
export function computeMachineCost({
  machineHours,
  machineType,
  machineRate,
  machineRates = [],
  materialCost = 0,
  setupMinutes,
} = {}) {
  const row = resolveMachineRate({ machineType, machineRate, machineRates });
  const hours = Math.max(0, num(machineHours));
  const material = Math.max(0, num(materialCost));
  const rate = num(row?.runtime_rate_per_hour);
  const maintenanceRate = num(row?.maintenance_rate_per_hour);
  const wastePct = num(row?.material_waste_pct);
  const setup = Number.isFinite(Number(setupMinutes))
    ? Math.max(0, num(setupMinutes))
    : num(row?.setup_minutes);

  const setupCost = (setup / 60) * rate;
  const runtimeCost = hours * rate;
  const maintenanceCost = hours * maintenanceRate;
  const wasteCost = material * (wastePct / 100);
  const total = setupCost + runtimeCost + maintenanceCost + wasteCost;

  return {
    row,
    rowId: row?.id || null,
    rowName: row?.name || null,
    machineType: row?.machine_type || (machineType || null),
    hours,
    setupMinutes: setup,
    rate,
    maintenanceRate,
    wastePct,
    materialCost: material,
    setupCost: round2(setupCost),
    runtimeCost: round2(runtimeCost),
    maintenanceCost: round2(maintenanceCost),
    wasteCost: round2(wasteCost),
    total: round2(total),
    rowFound: !!row,
  };
}

// --- Whole-quote pipeline -------------------------------------------------------

/**
 * Price a full quote.
 * @param {Array} lines  [{label?, category, qty, unitCost}]
 * @param {Array} modifiers  Optional quote-level formula modifiers applied to
 *   every line's resolved unit price after its own row.formula_modifiers —
 *   each line's breakdown carries the audit trail in `modifiersApplied`.
 * @returns {{
 *   linePrices: Array, linesSubtotal: number,
 *   laborCost: Object, machineCost: Object,
 *   subtotal: number, minimumsApplied: Array, total: number,
 * }}
 * subtotal = sum(line extensions) + labor.cost + machine.total; total = subtotal
 * (tax/margin layers stay the caller's job).
 */
export function priceQuote({
  lines = [],
  customerTier,
  laborHours = 0,
  laborLevel,
  laborRate,
  machineHours = 0,
  machineType,
  machineRate,
  matrices = [],
  laborLevels = [],
  machineRates = [],
  materialCost = 0,
  setupMinutes,
  defaultMarkupPct = 0,
  now,
  modifiers = [],
} = {}) {
  const linePrices = (lines || []).map((line, index) =>
    resolveEffectivePrice({
      label: line?.label ?? `Line ${index + 1}`,
      category: line?.category,
      qty: line?.qty,
      unitCost: line?.unitCost ?? line?.cost,
      customerTier,
      matrices,
      defaultMarkupPct,
      now,
      modifiers,
    }));

  const linesSubtotal = round2(linePrices.reduce((s, l) => s + l.extended, 0));
  const laborCost = computeLaborCost({ hours: laborHours, laborLevel, laborLevels, rate: laborRate });
  const machineCost = computeMachineCost({
    machineHours,
    machineType,
    machineRate,
    machineRates,
    materialCost,
    setupMinutes,
  });

  const minimumsApplied = linePrices
    .map((l, index) =>
      l.minimumApplied
        ? {
            index,
            label: l.label,
            category: l.category,
            computedExtended: l.computedExtended,
            minimumCharge: l.minimumCharge,
            matchedRowId: l.matchedRowId,
          }
        : null,
    )
    .filter(Boolean);

  const subtotal = round2(linesSubtotal + laborCost.cost + machineCost.total);
  return {
    linePrices,
    linesSubtotal,
    laborCost,
    machineCost,
    subtotal,
    minimumsApplied,
    total: subtotal,
  };
}