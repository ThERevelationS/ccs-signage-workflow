// Labor-level application — pure TS, zero entity/io imports. Safe to import
// from Deno functions (base44/functions/*) and from frontend modules.
//
// Model (CoreBridge "Easy Weeding 125 SqFt/hr" analog — ESTIMATOR_MASTERPLAN
// F-11; entity base44/entities/LaborLevel.jsonc):
//   - A LaborLevel row is a skill/speed tier: { name, hourly_rate, status,
//     applies_to_categories[] } plus rate fields. The entity schema declares
//     name/level_rank/description/hourly_rate/applies_to_categories/status/
//     updated_by; `rate_basis`/`rate_value` are not declared columns but are
//     honored when present (stored extras or inline rows on the part).
//   - rate_basis selects how labor time is derived for a part priced at this
//     level (rate_value is the basis' numeric throughput):
//       "sqft_per_hour"  hours = area_sqft / rate_value
//       "units_per_hour" hours = quantity  / rate_value
//       "hours_per_unit" hours = quantity  * rate_value
//       "flat_hours"     hours = rate_value
//     cost = hours * hourly_rate (rounded to cents; hours rounded to 6dp).
//   - A part associates levels two ways: `labor_level_id` resolves ONE catalog
//     level; `labor_levels[]` composes MANY — entries may be catalog ids
//     (strings or {labor_level_id|level_id|id} refs) or inline level rows
//     ({name, hourly_rate, rate_basis?, rate_value?}). The single id is priced
//     first, then array entries in order; a level id already applied is
//     skipped (duplicate guard) with a warning.
//   - Pricing hygiene: non-active levels are ignored (entity: "Inactive
//     levels are ignored by the pricing engine"); a level whose `applies_to`
//     list is non-empty only prices when the part's category
//     (category_key/category) is in the list — a part with no category always
//     passes. Dangling ids / invalid entries are skipped and reported in
//     warnings[] (fail-closed, never throws on bad data).
//
// Guards: negative quantity/area/rates clamp to 0; a non-positive rate_value
// on a divisor basis yields 0 hours; missing inputs default (quantity=1,
// area=0). Explicit `hours` on laborCost overrides basis math
// (basis_used="manual_hours").

export const LABOR_RATE_BASIS = [
  "sqft_per_hour",
  "units_per_hour",
  "hours_per_unit",
  "flat_hours",
] as const;
export type LaborRateBasis = (typeof LABOR_RATE_BASIS)[number];

// Forgiving defaults for rows that don't carry basis fields (the entity only
// requires name + hourly_rate): "units_per_hour" at rate 1 prices each unit
// as one labor-hour — a sane fallback rather than a silent $0.
export const DEFAULT_LABOR_RATE_BASIS: LaborRateBasis = "units_per_hour";
export const DEFAULT_LABOR_RATE_VALUE = 1;

export const LABOR_LEVEL_STATUSES = ["active", "inactive"] as const;

export type NormalizedLaborLevel = {
  id: string;
  name: string;
  rate_basis: LaborRateBasis;
  rate_value: number;
  hourly_rate: number;
  applies_to?: string[];
  status: "active" | "inactive";
};

export type LaborCostResult = {
  cost: number;
  hours_computed: number;
  basis_used: string; // rate_basis, "manual_hours" (hours override), or "none"
};

export type PartLaborBreakdownItem = {
  level_id: string | null;
  name: string;
  cost: number;
  hours: number;
};

export type PartLaborResult = {
  total_cost: number;
  breakdown: PartLaborBreakdownItem[];
  warnings: string[];
};

const finite = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// undefined → undefined; anything else clamps at 0 (negatives never price).
const nonNeg = (value: unknown): number | undefined => {
  const n = finite(value);
  return n === undefined ? undefined : Math.max(0, n);
};

const roundMoney = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
const roundHours = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0;

const asStringList = (value: unknown): string[] | undefined => {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const out = raw
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
  return out.length ? out : undefined;
};

const normalizeBasis = (value: unknown): LaborRateBasis => {
  const v = String(value ?? "").trim().toLowerCase();
  return (LABOR_RATE_BASIS as readonly string[]).includes(v)
    ? (v as LaborRateBasis)
    : DEFAULT_LABOR_RATE_BASIS;
};

// Validated catalog/inline row → NormalizedLaborLevel, or null when the row
// is unusable (non-object, blank name, or non-finite hourly_rate — the two
// fields the entity marks required). Idempotent: already-normalized rows
// re-normalize unchanged. Forgiving elsewhere: unknown/missing rate_basis →
// DEFAULT_LABOR_RATE_BASIS; non-finite rate_value → DEFAULT_LABOR_RATE_VALUE;
// negative rate_value/hourly_rate clamp to 0; unknown status → "active".
export function normalizeLaborLevel(raw: any): NormalizedLaborLevel | null {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim();
  if (!name) return null;
  const hourly = finite(raw.hourly_rate);
  if (hourly === undefined) return null;
  const id = String(raw.id ?? raw._id ?? "").trim();
  const rateValue = nonNeg(raw.rate_value ?? raw.rate ?? raw.rateValue);
  const appliesTo =
    asStringList(raw.applies_to) ?? asStringList(raw.applies_to_categories);
  const status =
    String(raw.status ?? "active").trim().toLowerCase() === "inactive"
      ? "inactive"
      : "active";
  const out: NormalizedLaborLevel = {
    id,
    name,
    rate_basis: normalizeBasis(raw.rate_basis ?? raw.basis ?? raw.rateBasis),
    rate_value: rateValue === undefined ? DEFAULT_LABOR_RATE_VALUE : rateValue,
    hourly_rate: Math.max(0, hourly),
    status,
  };
  if (appliesTo) out.applies_to = appliesTo;
  return out;
}

// Hours → cost for ONE level. Accepts raw or normalized rows in `level`.
//   - `hours` (finite, ≥0) overrides basis math → basis_used "manual_hours".
//   - quantity defaults to 1 when omitted/null (price-for-one); an explicit
//     non-finite/negative value counts as 0.
//   - divisor bases with rate_value ≤ 0, or sqft_per_hour with no area, yield
//     0 hours — never a divide-by-zero or negative price.
//   - Unusable level → { cost: 0, hours_computed: 0, basis_used: "none" }.
export function laborCost(input: {
  level: any;
  quantity?: number;
  area_sqft?: number;
  hours?: number;
}): LaborCostResult {
  const lvl = normalizeLaborLevel(input?.level);
  if (!lvl) return { cost: 0, hours_computed: 0, basis_used: "none" };

  const explicitHours = finite(input?.hours);
  let hours: number;
  let basisUsed: string = lvl.rate_basis;
  if (explicitHours !== undefined) {
    hours = Math.max(0, explicitHours);
    basisUsed = "manual_hours";
  } else {
    const qty =
      input?.quantity === undefined || input?.quantity === null
        ? 1
        : nonNeg(input.quantity) ?? 0;
    const area = nonNeg(input?.area_sqft) ?? 0;
    switch (lvl.rate_basis) {
      case "sqft_per_hour":
        hours = lvl.rate_value > 0 ? area / lvl.rate_value : 0;
        break;
      case "units_per_hour":
        hours = lvl.rate_value > 0 ? qty / lvl.rate_value : 0;
        break;
      case "hours_per_unit":
        hours = qty * lvl.rate_value;
        break;
      case "flat_hours":
        hours = lvl.rate_value;
        break;
      default:
        hours = 0;
    }
  }
  hours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  return {
    cost: roundMoney(hours * lvl.hourly_rate),
    hours_computed: roundHours(hours),
    basis_used: basisUsed,
  };
}

type CollectedEntry = { level: NormalizedLaborLevel; source: string };

// Ordered resolution of a part's labor-level references against the catalog:
// part.labor_level_id first, then each part.labor_levels[] entry. Entries may
// be id strings, {labor_level_id|level_id|id} ref objects, or inline rows
// (objects carrying name/hourly_rate data). Catalog ids dedupe — first
// reference wins. Returns resolved (normalized) levels + human-readable
// warnings for every skipped reference.
function collectLevelEntries(
  part: any,
  levelRows: any,
): { entries: CollectedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const entries: CollectedEntry[] = [];
  const p = part && typeof part === "object" ? part : {};
  const catalog = new Map<string, NormalizedLaborLevel>();
  for (const row of Array.isArray(levelRows) ? levelRows : []) {
    const lvl = normalizeLaborLevel(row);
    if (lvl && lvl.id && !catalog.has(lvl.id)) catalog.set(lvl.id, lvl);
  }
  const seen = new Set<string>();
  const pushLevel = (level: NormalizedLaborLevel | null, source: string, label: string) => {
    if (!level) {
      warnings.push(`${label}: invalid level row — skipped`);
      return;
    }
    if (level.id && seen.has(level.id)) {
      warnings.push(`duplicate labor level "${level.id}" (${level.name}) — skipped`);
      return;
    }
    if (level.id) seen.add(level.id);
    entries.push({ level, source });
  };
  const lookup = (idRaw: unknown, source: string, label: string) => {
    const id = String(idRaw ?? "").trim();
    if (!id) {
      warnings.push(`${label}: empty level id — skipped`);
      return;
    }
    const hit = catalog.get(id);
    if (!hit) {
      warnings.push(`${label}: labor level id "${id}" not found — skipped`);
      return;
    }
    pushLevel(hit, source, label);
  };

  if (typeof p.labor_level_id === "string" && p.labor_level_id.trim()) {
    lookup(p.labor_level_id, "labor_level_id", "labor_level_id");
  }
  const list = Array.isArray(p.labor_levels) ? p.labor_levels : [];
  list.forEach((entry: any, i: number) => {
    const label = `labor_levels[${i}]`;
    if (typeof entry === "string") {
      lookup(entry, "labor_levels", label);
      return;
    }
    if (entry && typeof entry === "object") {
      const refId = entry.labor_level_id ?? entry.level_id ?? entry.id;
      const hasInlineData = entry.name !== undefined || entry.hourly_rate !== undefined;
      if (!hasInlineData && refId !== undefined) {
        lookup(refId, "labor_levels", label);
        return;
      }
      pushLevel(normalizeLaborLevel(entry), "labor_levels_inline", label);
      return;
    }
    warnings.push(`${label}: invalid level entry — skipped`);
  });
  return { entries, warnings };
}

// Resolved (normalized) level rows for a part — single labor_level_id plus
// every resolvable labor_levels[] entry, in application order. Inactive rows
// ARE included (this is resolution, not pricing — callers inspect `status`);
// dangling ids, invalid entries, and duplicate ids are silently dropped —
// use pricePartLabor().warnings for the skip report.
export function resolvePartLaborLevels(
  part: any,
  levelRows: any,
): NormalizedLaborLevel[] {
  return collectLevelEntries(part, levelRows).entries.map((e) => e.level);
}

// Compose all of a part's labor levels into a priced breakdown.
//   part.labor_level_id → ONE level; part.labor_levels[] → MANY (ids or
//   inline rows); both together compose (single first). Returns
//   { total_cost, breakdown: [{ level_id, name, cost, hours }], warnings }.
// Skips (with a warning): dangling ids, invalid entries, duplicate ids,
// non-active levels, and levels whose applies_to list excludes the part's
// category (part.category_key ?? part.category; no category = unrestricted).
export function pricePartLabor(input: {
  part: any;
  levels: any;
  quantity?: number;
  area_sqft?: number;
}): PartLaborResult {
  const p = input?.part && typeof input.part === "object" ? input.part : {};
  const { entries, warnings } = collectLevelEntries(p, input?.levels);
  const quantity =
    input?.quantity !== undefined && input?.quantity !== null
      ? input.quantity
      : finite(p.quantity) ?? 1;
  const area =
    input?.area_sqft !== undefined && input?.area_sqft !== null
      ? input.area_sqft
      : p.area_sqft;
  const category = String(p.category_key ?? p.category ?? "").trim().toLowerCase();

  const breakdown: PartLaborBreakdownItem[] = [];
  let total = 0;
  for (const { level } of entries) {
    if (level.status !== "active") {
      warnings.push(`labor level "${level.name}" is ${level.status} — skipped`);
      continue;
    }
    if (
      category &&
      level.applies_to &&
      !level.applies_to.some((c) => c.toLowerCase() === category)
    ) {
      warnings.push(
        `labor level "${level.name}" does not apply to category "${category}" — skipped`,
      );
      continue;
    }
    const r = laborCost({ level, quantity, area_sqft: area });
    breakdown.push({
      level_id: level.id || null,
      name: level.name,
      cost: r.cost,
      hours: r.hours_computed,
    });
    total += r.cost;
  }
  return { total_cost: roundMoney(total), breakdown, warnings };
}
