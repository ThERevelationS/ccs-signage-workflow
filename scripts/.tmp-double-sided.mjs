// base44/shared/doubleSidedPricing.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString = (v) => v === null || v === void 0 ? "" : String(v).trim();
var toFiniteNumber = (v) => {
  if (v === null || v === void 0 || v === "" || typeof v === "object" || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint" || typeof v === "boolean") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num = (v, fallback = 0) => toFiniteNumber(v) ?? fallback;
var lc = (v) => asString(v).toLowerCase();
var round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
var round4 = (n) => Math.round((num(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField = (rec, fields) => {
  for (const f of fields) {
    if (rec[f] !== void 0 && rec[f] !== null && rec[f] !== "") return rec[f];
  }
  return void 0;
};
var firstFinite = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};
var pctNumber = (v) => {
  if (typeof v === "string") {
    const stripped = v.replace(/[%\s]/g, "").replace(/pct$/i, "");
    return toFiniteNumber(stripped === "" ? null : stripped);
  }
  return toFiniteNumber(v);
};
var DOUBLE_SIDED_MODES = Object.freeze([
  "full_price",
  "half_price",
  "percent",
  "flat",
  "machine_rate",
  "free"
]);
var NO_SECOND_SIDE = "none";
var MODE_ALIAS = {
  full_price: "full_price",
  "full-price": "full_price",
  full: "full_price",
  same_price: "full_price",
  "same-price": "full_price",
  same: "full_price",
  both_sides: "full_price",
  both_sides_full: "full_price",
  double: "full_price",
  double_price: "full_price",
  duplex: "full_price",
  duplex_full: "full_price",
  "100": "full_price",
  "100%": "full_price",
  "100_pct": "full_price",
  "100pct": "full_price",
  half_price: "half_price",
  "half-price": "half_price",
  half: "half_price",
  "50": "half_price",
  "50%": "half_price",
  "50_pct": "half_price",
  "50pct": "half_price",
  fifty: "half_price",
  fifty_percent: "half_price",
  percent: "percent",
  pct: "percent",
  percentage: "percent",
  percent_of_first: "percent",
  percent_of_side1: "percent",
  pct_of_first: "percent",
  of_first: "percent",
  second_side_pct: "percent",
  price_pct: "percent",
  flat: "flat",
  flat_fee: "flat",
  flat_amount: "flat",
  "flat-fee": "flat",
  fixed: "flat",
  fixed_fee: "flat",
  fixed_amount: "flat",
  fixed_price: "flat",
  amount: "flat",
  fee: "flat",
  machine_rate: "machine_rate",
  "machine-rate": "machine_rate",
  machine: "machine_rate",
  rate: "machine_rate",
  unit_rate: "machine_rate",
  per_unit: "machine_rate",
  per_unit_rate: "machine_rate",
  machine_priced: "machine_rate",
  machine_price: "machine_rate",
  free: "free",
  none: "free",
  no_charge: "free",
  "no-charge": "free",
  nocharge: "free",
  included: "free",
  complimentary: "free",
  "0": "free"
};
var normalizeDoubleSidedMode = (v) => isRecord(v) ? null : MODE_ALIAS[lc(v)] ?? null;
var BOOL_FLAG_FIELDS = [
  "double_sided",
  "doubleSided",
  "two_sided",
  "twoSided",
  "is_double_sided",
  "second_side",
  "duplex"
];
var SIDE_COUNT_FIELDS = [
  "sides",
  "side_count",
  "number_of_sides",
  "sides_count"
];
var truthyFlag = (v) => {
  if (v === true) return true;
  if (typeof v === "boolean") return false;
  const s = lc(v);
  return s === "true" || s === "yes" || s === "on" || s === "1";
};
var sideCountIsTwo = (v) => {
  const n = toFiniteNumber(v);
  if (n !== null) return n === 2;
  const s = lc(v);
  return s === "two" || s === "double" || s === "duplex" || s === "both";
};
function isDoubleSided(part) {
  if (!isRecord(part)) return false;
  for (const f of BOOL_FLAG_FIELDS) {
    const v = part[f];
    if (isRecord(v)) continue;
    if (truthyFlag(v)) return true;
  }
  for (const f of SIDE_COUNT_FIELDS) {
    if (part[f] === void 0 || part[f] === null || part[f] === "") continue;
    if (sideCountIsTwo(part[f])) return true;
  }
  return false;
}
var CONFIG_FIELDS = [
  "second_side_pricing",
  "secondSidePricing",
  "double_sided_pricing",
  "duplex_pricing",
  "second_side_rule",
  "second_side_price_rule",
  "second_side",
  "duplex"
];
var PART_PCT_FIELDS = [
  "second_side_price_pct",
  "secondSidePricePct",
  "second_side_pct",
  "duplex_price_pct"
];
var MODE_FIELDS = [
  "mode",
  "type",
  "rule",
  "pricing_mode",
  "second_side_mode",
  "charge_mode",
  "method"
];
var VALUE_FIELDS = [
  "value",
  "price_pct",
  "pct",
  "percent",
  "amount",
  "rate",
  "flat_fee",
  "second_side_price_pct"
];
var PCT_ONLY_FIELDS = [
  "second_side_price_pct",
  "secondSidePricePct",
  "price_pct",
  "pct",
  "percent"
];
var FLAT_ONLY_FIELDS = [
  "flat_fee",
  "flat_price",
  "fixed_price",
  "amount",
  "fee",
  "price"
];
var RATE_ONLY_FIELDS = [
  "rate",
  "second_side_rate",
  "unit_rate",
  "per_unit_rate"
];
var normalizeRule = (raw, source) => {
  if (raw === void 0 || raw === null || raw === "") return null;
  if (!isRecord(raw)) {
    const token = normalizeDoubleSidedMode(raw);
    if (token !== null) {
      return {
        mode: token,
        value: null,
        factor: null,
        source,
        configured: asString(raw),
        recognized: true
      };
    }
    const bare = pctNumber(raw);
    return bare !== null ? { mode: "percent", value: bare, factor: null, source, configured: String(bare), recognized: true } : null;
  }
  const configuredToken = firstField(raw, MODE_FIELDS);
  const value = firstFinite(raw, VALUE_FIELDS);
  const factor = firstFinite(raw, ["factor", "multiplier"]);
  const mode = normalizeDoubleSidedMode(configuredToken);
  if (mode !== null) {
    return { mode, value, factor, source, configured: asString(configuredToken), recognized: true };
  }
  if (configuredToken !== void 0) {
    return {
      mode: "full_price",
      value,
      factor,
      source,
      configured: asString(configuredToken),
      recognized: false
    };
  }
  const pct = firstFinite(raw, PCT_ONLY_FIELDS);
  if (pct !== null) {
    return { mode: "percent", value: pct, factor, source, configured: `${pct}%`, recognized: true };
  }
  const rate = firstFinite(raw, RATE_ONLY_FIELDS);
  if (rate !== null) {
    return { mode: "machine_rate", value: rate, factor, source, configured: `rate:${rate}`, recognized: true };
  }
  const flat = firstFinite(raw, FLAT_ONLY_FIELDS);
  if (flat !== null) {
    return { mode: "flat", value: flat, factor, source, configured: `flat:${flat}`, recognized: true };
  }
  if (factor !== null) {
    return { mode: "machine_rate", value: null, factor, source, configured: `factor:${factor}`, recognized: true };
  }
  return null;
};
function partSecondSideRule(part) {
  if (!isRecord(part)) return null;
  for (const f of CONFIG_FIELDS) {
    const v = part[f];
    if (v === void 0 || v === null || v === "") continue;
    const rule = normalizeRule(v, "part");
    if (rule !== null) return rule;
  }
  const pct = firstFinite(part, PART_PCT_FIELDS);
  if (pct !== null) {
    return {
      mode: "percent",
      value: pct,
      factor: null,
      source: "part_pct_field",
      configured: `${pct}%`,
      recognized: true
    };
  }
  return null;
}
var badModeToken = (input, slots) => {
  if (input === void 0 || input === null || input === "") return null;
  const tokenOf = (rec) => {
    const t = firstField(rec, MODE_FIELDS);
    return t !== void 0 && normalizeDoubleSidedMode(t) === null ? asString(t) : null;
  };
  if (!isRecord(input)) {
    return normalizeDoubleSidedMode(input) === null && pctNumber(input) === null ? asString(input) : null;
  }
  if (slots === null) return tokenOf(input);
  for (const f of slots) {
    const v = input[f];
    if (!isRecord(v)) continue;
    const hit = tokenOf(v);
    if (hit !== null) return hit;
  }
  return null;
};
function resolveSecondSideRule(part, machine_override) {
  const mo = normalizeRule(machine_override, "machine_override");
  if (mo !== null && mo.recognized) return mo;
  const partRule = partSecondSideRule(part);
  if (partRule !== null && partRule.recognized) return partRule;
  return {
    mode: "full_price",
    value: null,
    factor: null,
    source: "default",
    configured: "default",
    recognized: true
  };
}
var QTY_FACTOR_FIELDS = ["qty", "quantity", "side1_qty", "units"];
function resolveSecondSidePrice(args = {}) {
  const a = isRecord(args) ? args : {};
  const part = a.part;
  const s1 = round2(Math.max(0, num(a.side1_price)));
  const warnings = [];
  const disabled = (extra = {}) => ({
    mode: NO_SECOND_SIDE,
    amount: 0,
    second_side_price: 0,
    total: s1,
    side1_price: s1,
    value: null,
    double_sided: false,
    source: "disabled",
    configured_mode: "",
    warnings,
    ...extra
  });
  if (!isDoubleSided(part)) return disabled();
  const badMo = badModeToken(a.machine_override, null);
  if (badMo !== null) {
    warnings.push(`unrecognized machine_override second-side mode '${badMo}' \u2014 ignored`);
  }
  const badPart = badModeToken(part, CONFIG_FIELDS);
  if (badPart !== null) {
    warnings.push(`unrecognized part second-side mode '${badPart}' \u2014 ignored`);
  }
  const rule = resolveSecondSideRule(part, a.machine_override);
  const configured = rule.configured;
  let value = rule.value;
  if (value !== null && value < 0) {
    warnings.push(`${rule.mode} value ${value} clamped to 0`);
    value = 0;
  }
  let amount;
  switch (rule.mode) {
    case "free":
      amount = 0;
      break;
    case "half_price":
      amount = s1 * 0.5;
      break;
    case "percent": {
      const pct = value ?? 100;
      if (value === null) warnings.push("percent mode missing value \u2014 100% assumed");
      if (pct > 100) warnings.push(`percent ${pct} > 100 \u2014 second side priced above side 1`);
      amount = s1 * (pct / 100);
      break;
    }
    case "flat": {
      if (value === null) {
        warnings.push("flat mode missing value \u2014 full side-1 price assumed");
        amount = s1;
      } else {
        amount = value;
      }
      break;
    }
    case "machine_rate": {
      if (value !== null) {
        const mo = isRecord(a.machine_override) ? a.machine_override : null;
        const qtyFactor = firstFinite(a, QTY_FACTOR_FIELDS) ?? firstFinite(mo, ["qty", "quantity", "qty_factor", "side1_qty", "units"]) ?? firstFinite(isRecord(part) ? part : null, ["qty_factor", "side1_qty_factor"]) ?? 1;
        amount = value * Math.max(0, qtyFactor);
      } else if (rule.factor !== null) {
        amount = s1 * Math.max(0, rule.factor);
      } else {
        warnings.push("machine_rate mode missing rate \u2014 full side-1 price assumed");
        amount = s1;
      }
      break;
    }
    case "full_price":
    default:
      amount = s1;
      break;
  }
  const charge = round2(amount);
  return {
    mode: rule.mode,
    amount: charge,
    second_side_price: charge,
    total: round2(s1 + charge),
    side1_price: s1,
    value,
    double_sided: true,
    source: rule.source,
    configured_mode: configured,
    warnings
  };
}
function doubleSidedQuote(part, qty, side1_unit_price, machine_override) {
  const quantity = Math.max(0, num(qty));
  const unit = round4(Math.max(0, num(side1_unit_price)));
  const side1Total = round2(quantity * unit);
  const res = resolveSecondSidePrice({
    part,
    side1_price: side1Total,
    machine_override,
    qty: quantity
  });
  return {
    mode: res.mode,
    quantity,
    side1_unit_price: unit,
    side1_total: side1Total,
    side2_total: res.amount,
    second_side_unit_price: res.double_sided && quantity > 0 ? round4(res.amount / quantity) : 0,
    total: res.total,
    double_sided: res.double_sided,
    value: res.value,
    source: res.source,
    configured_mode: res.configured_mode,
    warnings: res.warnings
  };
}
export {
  DOUBLE_SIDED_MODES,
  NO_SECOND_SIDE,
  doubleSidedQuote,
  isDoubleSided,
  normalizeDoubleSidedMode,
  partSecondSideRule,
  resolveSecondSidePrice,
  resolveSecondSideRule,
  round2,
  round4
};
