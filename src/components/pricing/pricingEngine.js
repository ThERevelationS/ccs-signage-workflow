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

/**
 * Resolve the effective price for one line.
 * Precedence inside a matched row: qualifying per_unit_breaks bracket >
 * markup_pct over cost. Without any row: defaultMarkupPct over cost.
 * minimum_charge then floors the extension (never fires on a zero/qty<=0 line).
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
} = {}) {
  const q = num(qty);
  const cost = num(unitCost);
  const match = resolveMatrixRow({ category, customerTier, matrices, now });
  const row = match?.row || null;

  const brk = row ? pickUnitBreak(row.per_unit_breaks, q) : null;
  let unitPrice;
  let source;
  if (brk) {
    unitPrice = num(brk.unit_price);
    source = "qty_break";
  } else if (row) {
    unitPrice = cost * (1 + num(row.markup_pct) / 100);
    source = "matrix_markup";
  } else {
    unitPrice = cost * (1 + num(defaultMarkupPct) / 100);
    source = "default_markup";
  }

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
    extended: round2(extended),
    computedExtended: round2(computed),
    source,
    matchedRow: row,
    matchedRowId: row?.id || null,
    matchedRowName: row?.name || null,
    specificity: match?.specificity ?? null,
    breakApplied: brk || null,
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
