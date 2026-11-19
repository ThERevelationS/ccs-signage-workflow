// base44/shared/marginModel.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString = (v) => v === null || v === void 0 ? "" : String(v).trim();
var lc = (v) => asString(v).toLowerCase();
var toFiniteNumber = (v) => {
  if (v === null || v === void 0 || v === "" || typeof v === "object" || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num = (v, fallback = 0) => toFiniteNumber(v) ?? fallback;
var firstField = (rec, fields) => {
  if (!isRecord(rec)) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite = (rec, fields) => {
  const v = firstField(rec, fields);
  return v === void 0 ? null : toFiniteNumber(v);
};
var firstFiniteValue = (...vals) => {
  for (const v of vals) {
    if (v === void 0 || v === null || v === "") continue;
    const n = toFiniteNumber(v);
    if (n !== null) return n;
  }
  return null;
};
var toCents = (v) => {
  if (v === null || v === void 0 || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + Math.sign(n) * 1e-7) + 0;
};
var fromCents = (cents) => Math.round(num(cents)) / 100;
var moneyRound = (v) => fromCents(toCents(v));
var scaleCents = (cents, ratio) => {
  const c = num(cents);
  const r = toFiniteNumber(ratio);
  if (r === null) return 0;
  const v = c * r;
  return Math.round(v + Math.sign(v) * 1e-7) + 0;
};
var marginPctOf = (marginCents, sellCents) => {
  const sell = num(sellCents);
  if (sell <= 0) return 0;
  return Math.round((num(marginCents) / sell * 100 + Number.EPSILON) * 100) / 100;
};
var markupPctOf = (marginCents, costCents) => {
  const cost = num(costCents);
  if (cost <= 0) return 0;
  return Math.round((num(marginCents) / cost * 100 + Number.EPSILON) * 100) / 100;
};
var MARGIN_COMPONENTS = Object.freeze([
  "material",
  "machine",
  "labor",
  "modifier"
]);
var DEFAULT_LOW_MARGIN_PCT = 15;
var LABOR_PART_TYPES = Object.freeze([
  "labor",
  "labour",
  "labor_service",
  "service_labor",
  "personnel",
  "install_labor",
  "installation_labor",
  "crew",
  "crew_labor"
]);
var MACHINE_PART_TYPES = Object.freeze([
  "equipment",
  "machine",
  "machine_time",
  "equipment_time",
  "production_equipment",
  "machine_use"
]);
var MODIFIER_PART_TYPES = Object.freeze([
  "modifier",
  "price_modifier",
  "pricing_modifier"
]);
function partCostBucket(part) {
  const p = isRecord(part) ? part : {};
  const type = lc(p.part_type ?? p.type);
  if (LABOR_PART_TYPES.includes(type)) return "labor";
  if (MACHINE_PART_TYPES.includes(type)) return "machine";
  if (MODIFIER_PART_TYPES.includes(type)) return "modifier";
  if (!type) {
    const sub = lc(p.part_subtype ?? p.subtype);
    if (/labor|labour|personnel/.test(sub)) return "labor";
    if (/machine|equipment/.test(sub)) return "machine";
    if (/modifier/.test(sub)) return "modifier";
  }
  return "material";
}
var PART_EXTENDED_COST_FIELDS = [
  "frozen_extended_cost",
  "extended_cost",
  "total_cost",
  "cost_total"
];
var PART_UNIT_COST_FIELDS = [
  "frozen_unit_cost",
  "unit_cost",
  "current_unit_cost"
];
var PART_MANUAL_COST_FIELDS = ["manual_cost", "manual_cost_total"];
var PART_CURRENT_EXTENDED_FIELDS = ["current_extended_cost"];
var RUN_HOUR_FIELDS = [
  "run_hours",
  "runtime_hours",
  "machine_run_hours",
  "machine_hours",
  "machine_time_hours",
  "production_hours",
  "print_hours",
  "cut_hours_total",
  "hours"
];
var LABOR_HOUR_FIELDS = [
  "labor_hours",
  "labor_time_hours",
  "labour_hours",
  "hours_worked",
  "production_labor_hours",
  "setup_labor_hours"
];
var LABOR_RATE_FIELDS = [
  "labor_rate",
  "labor_rate_per_hour",
  "labor_hourly_rate",
  "hourly_rate"
];
var LABOR_COST_FIELDS = [
  "labor_cost",
  "labor_cost_total",
  "labour_cost",
  "production_labor_cost"
];
var MACHINE_COST_FIELDS = [
  "machine_cost",
  "machine_cost_total",
  "equipment_cost",
  "machine_time_cost"
];
var MODIFIER_COST_FIELDS = [
  "modifier_cost",
  "modifiers_cost",
  "modifier_cost_total",
  "total_modifier_cost"
];
var MATERIAL_COST_FIELDS = [
  "material_cost",
  "material_cost_total",
  "materials_cost",
  "total_material_cost"
];
var PART_BAG_FIELDS = [
  "detail_overrides",
  "pricing_basis_snapshot",
  "calculation_snapshot",
  "builder_data",
  "cost_breakdown",
  "cost_components",
  "components"
];
var PART_COMPONENT_BAG_FIELDS = [
  "detail_overrides",
  "pricing_basis_snapshot",
  "cost_breakdown",
  "cost_components",
  "components"
];
var PROJECT_MACHINE_FIELDS = [
  "total_machine_cost",
  "machine_cost",
  "total_equipment_cost",
  "equipment_cost"
];
var PROJECT_LABOR_FIELDS = [
  "total_labor_cost",
  "labor_cost",
  "total_labor"
];
var PROJECT_MATERIAL_FIELDS = [
  "total_material_cost",
  "total_materials_cost",
  "material_cost",
  "materials_cost",
  "total_supplies_cost",
  "supplies_cost",
  "total_substrate_cost"
];
var PROJECT_MODIFIER_FIELDS = [
  "total_modifier_cost",
  "modifier_cost",
  "modifiers_cost",
  "total_modifiers_cost"
];
var PART_MODIFIER_FIELDS = [
  "modifiers",
  "modifier_ids",
  "pricing_modifier_ids",
  "pricing_modifiers",
  "modifier_links"
];
var MODIFIER_ANSWER_FIELDS = [
  "modifier_answers",
  "modifier_values",
  "modifier_inputs",
  "modifier_selections",
  "modifier_responses",
  "answers"
];
var AREA_SQFT_FIELDS = [
  "area_sqft",
  "sqft",
  "sq_ft",
  "area",
  "area_total",
  "total_sqft"
];
var dedupeWarnings = (list) => {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const w of list) {
    const s = asString(w);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
};
var bagField = (part, fields) => {
  const direct = firstField(part, fields);
  if (direct !== void 0) return direct;
  if (!isRecord(part)) return void 0;
  for (const bag of PART_BAG_FIELDS) {
    const v = firstField(part[bag], fields);
    if (v !== void 0) return v;
  }
  return void 0;
};
var bagFinite = (part, fields) => {
  const v = bagField(part, fields);
  return v === void 0 ? null : toFiniteNumber(v);
};
var componentFinite = (part, fields) => {
  const direct = firstFinite(part, fields);
  if (direct != null) return direct;
  if (!isRecord(part)) return null;
  for (const bag of PART_COMPONENT_BAG_FIELDS) {
    const v = firstFinite(part[bag], fields);
    if (v != null) return v;
  }
  return null;
};
var normalizeMachineLite = (raw) => {
  if (!isRecord(raw)) return null;
  const costPerHour = Math.max(0, num(firstField(raw, [
    "cost_per_hour",
    "runtime_rate_per_hour",
    "rate_per_hour",
    "hourly_rate",
    "rate"
  ])));
  const setupCost = Math.max(0, num(firstField(raw, ["setup_cost", "setup_fee", "flat_setup_cost"])));
  const explicitSetupHours = firstFinite(raw, ["setup_hours", "setup_time_hours"]);
  const setupMinutes = Math.max(0, num(firstField(raw, ["setup_minutes", "setup_time_minutes", "setup_mins"])));
  const setupHours = explicitSetupHours != null ? Math.max(0, explicitSetupHours) : setupMinutes / 60;
  let laborPct = num(firstField(raw, ["labor_pct", "labor_percent", "operator_labor_pct"]));
  laborPct = Math.min(100, Math.max(0, laborPct));
  const billed = firstField(raw, ["setup_billed", "bill_setup_time"]);
  const setupBilled = billed === void 0 ? true : !(billed === false || ["false", "no", "off", "0"].includes(lc(billed)));
  const status = asString(raw.status) || "active";
  return {
    id: asString(raw.id ?? raw.machine_id) || null,
    name: asString(raw.name),
    status,
    active: lc(status) !== "inactive",
    cost_per_hour: costPerHour,
    setup_cost: setupCost,
    setup_hours: setupHours,
    setup_billed: setupBilled,
    disposable_cost_per_unit: Math.max(0, num(firstField(raw, [
      "disposable_cost_per_unit",
      "disposable_per_unit",
      "consumable_cost_per_unit",
      "consumables_per_unit"
    ]))),
    labor_pct: laborPct,
    labor_rate_per_hour: Math.max(0, num(
      firstFinite(raw, ["labor_rate_per_hour", "labor_rate", "operator_rate"]) ?? costPerHour
    ))
  };
};
var machineCatalogOf = (machines) => (Array.isArray(machines) ? machines : []).map(normalizeMachineLite).filter((m) => !!m);
var findMachine = (catalog, id, name) => {
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
  if (wantId && !wantName) {
    const byName = catalog.find((m) => m.name && lc(m.name) === wantId);
    if (byName) return byName;
  }
  return null;
};
var machineRefEntries = (part) => {
  const out = [];
  const push = (raw, label) => {
    if (typeof raw === "string" || typeof raw === "number") {
      const s = asString(raw);
      if (s) out.push({ machine: null, ref: { __ref: s }, raw, label });
      return;
    }
    if (!isRecord(raw)) return;
    const looksInline = firstField(raw, [
      "cost_per_hour",
      "runtime_rate_per_hour",
      "rate_per_hour",
      "hourly_rate"
    ]) !== void 0;
    if (looksInline && raw.machine_id === void 0 && raw.machine === void 0) {
      out.push({ machine: normalizeMachineLite(raw), ref: raw, raw, label });
      return;
    }
    const nested = isRecord(raw.machine) ? raw.machine : null;
    if (nested) {
      out.push({ machine: normalizeMachineLite({ ...nested, id: nested.id ?? raw.machine_id ?? raw.id }), ref: raw, raw, label });
      return;
    }
    const refId = firstField(raw, ["machine_id", "id", "machine", "machine_name", "name"]);
    out.push({ machine: null, ref: { ...raw, __ref: asString(refId) }, raw, label });
  };
  const list = (v, label) => {
    if (!Array.isArray(v)) return;
    v.forEach((entry, i) => push(entry, `${label}[${i}]`));
  };
  list(part.machine_ids, "machine_ids");
  list(part.machines, "machines");
  if (firstField(part, ["machine_id"]) !== void 0) {
    push({ machine_id: part.machine_id, ...isRecord(part.machine_entry) ? part.machine_entry : {} }, "machine_id");
  }
  if (isRecord(part.machine)) push(part.machine, "machine");
  else if (asString(part.machine)) push(asString(part.machine), "machine");
  return out;
};
var machineRunHours = (part, ref, machine) => {
  const onRef = ref ? firstFinite(ref, RUN_HOUR_FIELDS) : null;
  if (onRef != null) return Math.max(0, onRef);
  const map = firstField(part, ["machine_hours", "machine_run_hours_map", "machine_time_map"]);
  if (isRecord(map) && machine) {
    const v = firstFiniteValue(
      machine.id ? map[machine.id] : void 0,
      machine.name ? map[machine.name] : void 0,
      ref && ref.__ref !== void 0 ? map[asString(ref.__ref)] : void 0
    );
    if (v != null) return Math.max(0, v);
  }
  const onPart = bagFinite(part, RUN_HOUR_FIELDS);
  if (onPart != null) return Math.max(0, onPart);
  return 0;
};
function resolveMachineCost(args) {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings = [];
  const catalog = machineCatalogOf(a.machines);
  const entries = machineRefEntries(part);
  const lines = [];
  let operatorLabor = 0;
  const qty = Math.max(0, num(firstFinite(part, ["quantity", "qty"]) ?? 1));
  const partRate = firstFiniteValue(
    bagFinite(part, ["machine_rate_per_hour", "machine_rate", "cost_per_hour", "rate_per_hour"]),
    isRecord(part.calculation_snapshot) ? toFiniteNumber(part.calculation_snapshot.rate) : null
  );
  entries.forEach((entry) => {
    const ref = entry.ref;
    let machine = entry.machine;
    let source = machine ? "inline" : "catalog";
    if (!machine) {
      const refId = asString(ref?.__ref);
      machine = findMachine(catalog, refId, asString(ref?.machine_name ?? ref?.name));
      if (!machine) {
        if (partRate != null) {
          machine = {
            id: refId || null,
            name: asString(ref?.machine_name ?? ref?.name) || refId || "Machine",
            status: "active",
            active: true,
            cost_per_hour: Math.max(0, partRate),
            setup_cost: 0,
            setup_hours: 0,
            setup_billed: true,
            disposable_cost_per_unit: 0,
            labor_pct: 0,
            labor_rate_per_hour: 0
          };
          source = "part_rate";
        } else {
          warnings.push(`${entry.label}: machine "${refId || "inline"}" not found \u2014 machine cost 0`);
          return;
        }
      }
    }
    if (!machine.active) {
      warnings.push(`${entry.label}: machine "${machine.name || machine.id}" is inactive \u2014 skipped`);
      return;
    }
    const hours = machineRunHours(part, ref, machine);
    const refQty = Math.max(0, num(
      (ref ? firstFinite(ref, ["quantity", "qty", "units"]) : null) ?? qty
    ));
    const rate = machine.cost_per_hour > 0 ? machine.cost_per_hour : partRate != null ? Math.max(0, partRate) : 0;
    if (machine.cost_per_hour <= 0 && partRate == null) {
      warnings.push(`${entry.label}: machine "${machine.name || machine.id}" has no cost_per_hour \u2014 run cost 0`);
    }
    const billedField = ref ? firstField(ref, ["setup_billed", "bill_setup_time"]) : void 0;
    const setupBilled = billedField === void 0 ? machine.setup_billed : !(billedField === false || ["false", "no", "off", "0"].includes(lc(billedField)));
    const setupHours = Math.max(0, num(
      (ref ? firstFinite(ref, ["setup_hours"]) : null) ?? (ref ? firstFinite(ref, ["setup_minutes"]) != null ? num(firstFinite(ref, ["setup_minutes"])) / 60 : null : null) ?? machine.setup_hours
    ));
    const setupFlat = Math.max(0, num(
      (ref ? firstFinite(ref, ["setup_cost", "setup_fee"]) : null) ?? machine.setup_cost
    ));
    const disposableRate = Math.max(0, num(
      (ref ? firstFinite(ref, ["disposable_cost_per_unit", "disposable_per_unit"]) : null) ?? machine.disposable_cost_per_unit
    ));
    const runCents = toCents(hours * rate);
    const setupCents = (setupBilled ? toCents(setupHours * rate) : 0) + toCents(setupFlat);
    const disposableCents = toCents(disposableRate * refQty);
    const cost = runCents + setupCents + disposableCents;
    const opHours = hours * (machine.labor_pct / 100);
    const opRate = Math.max(0, num(
      (ref ? firstFinite(ref, ["labor_rate_per_hour", "labor_rate", "operator_rate"]) : null) ?? machine.labor_rate_per_hour
    ));
    const opCents = toCents(opHours * opRate);
    operatorLabor += opCents;
    lines.push({
      machine_id: machine.id,
      machine_name: machine.name || ref?.["__ref"] || "",
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
      source: rate !== machine.cost_per_hour ? "part_rate" : source
    });
  });
  return {
    cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0),
    lines,
    operator_labor_cents: operatorLabor,
    warnings
  };
}
var LABOR_BASES = ["sqft_per_hour", "units_per_hour", "hours_per_unit", "flat_hours"];
var normalizeLaborLite = (raw) => {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name ?? raw.level_name ?? raw.label);
  const hourly = firstFinite(raw, ["hourly_rate", "rate_per_hour", "labor_rate", "rate"]);
  if (!name && hourly == null) return null;
  const basis = lc(raw.rate_basis ?? raw.basis ?? raw.rateBasis);
  const status = asString(raw.status) || "active";
  const applies = Array.isArray(raw.applies_to_categories) ? raw.applies_to_categories : Array.isArray(raw.applies_to) ? raw.applies_to : [];
  return {
    id: asString(raw.id ?? raw.labor_level_id ?? raw.level_id) || null,
    name: name || "Labor",
    hourly_rate: Math.max(0, num(hourly)),
    rate_basis: LABOR_BASES.includes(basis) ? basis : "units_per_hour",
    rate_value: Math.max(0, num(firstFinite(raw, ["rate_value", "rate", "rateValue"]) ?? 1)),
    applies_to: applies.map((v) => lc(v)).filter(Boolean),
    status,
    active: lc(status) !== "inactive"
  };
};
var laborRefEntries = (part, catalog, warnings) => {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const lookup = (idRaw, label) => {
    const id = asString(idRaw);
    if (!id) {
      warnings.push(`${label}: empty labor level id \u2014 skipped`);
      return;
    }
    const hit = catalog.find((l) => l.id && lc(l.id) === lc(id)) ?? catalog.find((l) => lc(l.name) === lc(id));
    if (!hit) {
      warnings.push(`${label}: labor level "${id}" not found \u2014 skipped`);
      return;
    }
    if (hit.id && seen.has(lc(hit.id))) {
      warnings.push(`${label}: duplicate labor level "${id}" \u2014 skipped`);
      return;
    }
    if (hit.id) seen.add(lc(hit.id));
    out.push({ level: hit, entry: null, label });
  };
  if (asString(part.labor_level_id)) lookup(part.labor_level_id, "labor_level_id");
  const list = Array.isArray(part.labor_levels) ? part.labor_levels : [];
  list.forEach((entry, i) => {
    const label = `labor_levels[${i}]`;
    if (typeof entry === "string" || typeof entry === "number") {
      lookup(entry, label);
      return;
    }
    if (isRecord(entry)) {
      const hasInline = entry.name !== void 0 || entry.hourly_rate !== void 0;
      const refId = firstField(entry, ["labor_level_id", "level_id", "id"]);
      if (!hasInline && refId !== void 0) {
        lookup(refId, label);
        return;
      }
      const lvl = normalizeLaborLite(entry);
      if (!lvl) {
        warnings.push(`${label}: invalid labor level row \u2014 skipped`);
        return;
      }
      if (lvl.id) {
        if (seen.has(lc(lvl.id))) {
          warnings.push(`${label}: duplicate labor level "${lvl.id}" \u2014 skipped`);
          return;
        }
        seen.add(lc(lvl.id));
      }
      out.push({ level: lvl, entry, label });
      return;
    }
    warnings.push(`${label}: invalid labor level entry \u2014 skipped`);
  });
  return out;
};
var partAreaSqft = (part) => Math.max(0, num(bagFinite(part, AREA_SQFT_FIELDS) ?? 0));
var laborHoursFor = (level, entry, qty, area, manualHours) => {
  const explicit = firstFiniteValue(
    entry ? firstFinite(entry, ["hours", "labor_hours", "manual_hours"]) : null,
    manualHours
  );
  if (explicit != null) return { hours: Math.max(0, explicit), basis: "manual_hours" };
  let hours = 0;
  switch (level.rate_basis) {
    case "sqft_per_hour":
      hours = level.rate_value > 0 ? area / level.rate_value : 0;
      break;
    case "hours_per_unit":
      hours = qty * level.rate_value;
      break;
    case "flat_hours":
      hours = level.rate_value;
      break;
    case "units_per_hour":
    default:
      hours = level.rate_value > 0 ? qty / level.rate_value : 0;
      break;
  }
  return { hours: Number.isFinite(hours) && hours > 0 ? hours : 0, basis: level.rate_basis };
};
function resolveLaborCost(args) {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings = [];
  const catalog = (Array.isArray(a.labor_levels) ? a.labor_levels : []).map(normalizeLaborLite).filter((l) => !!l);
  const lines = [];
  const qty = Math.max(0, num(firstFinite(part, ["quantity", "qty"]) ?? 1));
  const area = partAreaSqft(part);
  const category = lc(firstField(part, ["category_key", "category", "part_category", "product_category"]));
  const explicitCost = componentFinite(part, LABOR_COST_FIELDS);
  if (explicitCost != null) {
    lines.push({
      level_id: null,
      name: "Labor (part field)",
      hours: 0,
      rate_per_hour: 0,
      cost_cents: toCents(Math.max(0, explicitCost)),
      source: "explicit"
    });
  } else {
    const manualHours = bagFinite(part, LABOR_HOUR_FIELDS);
    const manualRate = bagFinite(part, LABOR_RATE_FIELDS);
    const refs = laborRefEntries(part, catalog, warnings);
    for (const { level, entry, label } of refs) {
      if (!level) continue;
      if (!level.active) {
        warnings.push(`${label}: labor level "${level.name}" is ${level.status} \u2014 skipped`);
        continue;
      }
      if (category && level.applies_to.length && !level.applies_to.includes(category)) {
        warnings.push(`${label}: labor level "${level.name}" does not apply to "${category}" \u2014 skipped`);
        continue;
      }
      const { hours } = laborHoursFor(level, entry, qty, area, manualHours);
      const rate = level.hourly_rate;
      const src = manualHours != null ? "manual_hours" : entry ? "inline" : "catalog";
      lines.push({
        level_id: level.id,
        name: level.name,
        hours: Math.round(hours * 1e6) / 1e6,
        rate_per_hour: manualRate != null && manualHours != null ? Math.max(0, manualRate) : rate,
        cost_cents: toCents(hours * (manualRate != null && manualHours != null ? Math.max(0, manualRate) : rate)),
        source: src
      });
    }
    if (manualHours != null && refs.length === 0) {
      const rate = manualRate ?? (catalog[0]?.hourly_rate ?? 0);
      lines.push({
        level_id: null,
        name: "Manual labor hours",
        hours: Math.round(Math.max(0, manualHours) * 1e6) / 1e6,
        rate_per_hour: Math.max(0, rate),
        cost_cents: toCents(Math.max(0, manualHours) * Math.max(0, rate)),
        source: "manual_hours"
      });
      if (rate <= 0 && manualHours > 0) {
        warnings.push("labor hours present but no labor rate resolved \u2014 labor cost 0");
      }
    }
  }
  const opCents = Math.max(0, num(a.machine_labor_cents));
  if (opCents > 0) {
    lines.push({
      level_id: null,
      name: "Machine operator",
      hours: Math.round(num(a.machine_labor_hours) * 1e6) / 1e6,
      rate_per_hour: 0,
      cost_cents: opCents,
      source: "machine_operator"
    });
  }
  return { cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0), lines, warnings };
}
var normalizeModifierLite = (raw) => {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name ?? raw.modifier_name ?? raw.label);
  const id = asString(raw.id ?? raw.modifier_id) || null;
  if (!name && !id && !Array.isArray(raw.rates)) return null;
  const rates = (Array.isArray(raw.rates) ? raw.rates : []).filter(isRecord).map((r) => ({
    label: asString(r.label),
    retail: num(r.retail),
    cost: num(r.cost),
    per_unit: asString(r.per_unit)
  }));
  const options = (Array.isArray(raw.options) ? raw.options : []).filter(isRecord).map((o) => ({
    label: asString(o.label),
    value: asString(o.value),
    rate_overrides: isRecord(o.rate_overrides) ? o.rate_overrides : null,
    is_default: o.is_default === true,
    sort: num(o.sort),
    status: asString(o.status) || "active"
  }));
  const status = asString(raw.status) || "active";
  return {
    id,
    name: name || id || "modifier",
    label: asString(raw.label) || name || id || "modifier",
    input_type: lc(raw.input_type) || "text",
    can_use_in_pricing: raw.can_use_in_pricing === true,
    rates,
    include_setup_fee: raw.include_setup_fee === true,
    min_charge: Math.max(0, num(raw.min_charge)),
    affects_waste: raw.affects_waste === true,
    inventoried_part_type: asString(raw.inventoried_part_type),
    status,
    active: lc(status) === "active" || lc(status) === "",
    options: options.sort((x, y) => x.sort - y.sort)
  };
};
var PER_UNIT_KIND = {
  per_unit: "per_unit",
  each: "per_unit",
  ea: "per_unit",
  unit: "per_unit",
  units: "per_unit",
  qty: "per_unit",
  quantity: "per_unit",
  per_item: "per_unit",
  "per each": "per_unit",
  per_sqft: "per_sqft",
  sqft: "per_sqft",
  sq_ft: "per_sqft",
  per_sq_ft: "per_sqft",
  "sq ft": "per_sqft",
  "per sq ft": "per_sqft",
  square_foot: "per_sqft",
  square_feet: "per_sqft",
  area: "per_sqft",
  percent_of_base: "percent",
  percent: "percent",
  percentage: "percent",
  pct: "percent",
  pct_of_base: "percent",
  percent_of_price: "percent",
  "%": "percent",
  flat_add: "flat",
  flat: "flat",
  flat_fee: "flat",
  fee: "flat",
  fixed: "flat",
  once: "flat",
  setup: "flat",
  lump: "flat",
  lump_sum: "flat"
};
var RATE_ROW_KEYS = /* @__PURE__ */ new Set(["label", "retail", "cost", "per_unit"]);
var modifierAnswerMap = (part) => {
  for (const f of MODIFIER_ANSWER_FIELDS) {
    const v = part[f];
    if (isRecord(v)) return v;
  }
  return {};
};
var modifierAnswerFor = (m, answers) => {
  const has = (k) => k !== "" && Object.prototype.hasOwnProperty.call(answers, k);
  let raw;
  if (m.id && has(m.id)) raw = answers[m.id];
  else if (m.name && has(m.name)) raw = answers[m.name];
  else {
    const want = lc(m.name);
    const k = want && Object.keys(answers).find((key) => lc(key) === want);
    if (k === void 0) return { present: false, value: void 0 };
    raw = answers[k];
  }
  if (isRecord(raw)) {
    for (const f of ["value", "answer", "option_id", "option"]) {
      if (raw[f] !== void 0) return { present: true, value: raw[f] };
    }
  }
  return { present: true, value: raw };
};
var resolveModifierCostRate = (m, answers) => {
  const answer = modifierAnswerFor(m, answers);
  const activeOpts = m.options.filter((o) => lc(o.status || "active") === "active");
  let option = null;
  if (m.input_type === "select" && activeOpts.length) {
    if (answer.present && answer.value !== void 0 && answer.value !== null && answer.value !== "") {
      const want = asString(answer.value);
      option = activeOpts.find((o) => o.value === want || o.label === want) ?? activeOpts.find((o) => lc(o.value) === lc(want) || lc(o.label) === lc(want)) ?? null;
    }
    if (!option) option = activeOpts.find((o) => o.is_default) ?? null;
  }
  let base = option ? m.rates.find((r) => r.label === option.value || r.label === option.label) ?? m.rates.find((r) => lc(r.label) === lc(option.value) || lc(r.label) === lc(option.label)) ?? null : null;
  if (!base) base = m.rates[0] ?? null;
  const bag = option?.rate_overrides ?? null;
  let overrideRow = null;
  if (isRecord(bag)) {
    if (Object.keys(bag).some((k) => RATE_ROW_KEYS.has(k))) overrideRow = bag;
    else if (option) {
      overrideRow = (isRecord(bag[option.value]) ? bag[option.value] : null) ?? (isRecord(bag[option.label]) ? bag[option.label] : null);
    }
  }
  if (!base && !overrideRow) return { rate: null, optionLabel: option?.label ?? "" };
  const merged = {
    label: base?.label ?? "",
    retail: base?.retail ?? 0,
    cost: base?.cost ?? 0,
    per_unit: base?.per_unit ?? ""
  };
  if (overrideRow) {
    if (asString(overrideRow.label) !== "") merged.label = asString(overrideRow.label);
    if (toFiniteNumber(overrideRow.retail) !== null) merged.retail = num(overrideRow.retail);
    if (toFiniteNumber(overrideRow.cost) !== null) merged.cost = num(overrideRow.cost);
    if (asString(overrideRow.per_unit) !== "") merged.per_unit = asString(overrideRow.per_unit);
    if (option && merged.label === "") merged.label = option.label;
  }
  return { rate: merged, optionLabel: option?.label ?? "" };
};
var modifierWasteFactorOf = (part) => {
  const direct = bagFinite(part, ["waste_factor"]);
  if (direct != null && direct > 0) return direct;
  const pct = bagFinite(part, ["waste_factor_percent", "waste_pct", "waste_percent"]);
  if (pct != null) return 1 + pct / 100;
  return 1;
};
function resolveModifierCost(args) {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const warnings = [];
  const lines = [];
  const partQty = Math.max(0, num(firstFinite(part, ["quantity", "qty"]) ?? 1));
  const area = partAreaSqft(part);
  const waste = modifierWasteFactorOf(part);
  const baseCents = snapshotPartCostCents(part);
  const answers = isRecord(a.answers) ? a.answers : modifierAnswerMap(part);
  const explicit = componentFinite(part, MODIFIER_COST_FIELDS);
  if (explicit != null) {
    const c = toCents(Math.max(0, explicit));
    lines.push({
      modifier_id: null,
      name: "Modifiers (part field)",
      rate_label: "",
      cost_rate: 0,
      per_unit: "",
      kind: "none",
      quantity: partQty,
      area_sqft: area,
      cost_cents: c,
      source: "explicit",
      pricing_gated: true
    });
    return { cost_cents: c, lines, warnings };
  }
  const catalog = (Array.isArray(a.modifiers) ? a.modifiers : []).map(normalizeModifierLite).filter((m) => !!m);
  let attached = null;
  const inlineMods = [];
  for (const f of PART_MODIFIER_FIELDS) {
    const v = part[f];
    if (!Array.isArray(v)) continue;
    attached = [];
    v.forEach((entry, i) => {
      if (isRecord(entry) && (entry.input_type !== void 0 || Array.isArray(entry.rates) || entry.can_use_in_pricing !== void 0)) {
        const m = normalizeModifierLite(entry);
        if (m) inlineMods.push(m);
        else warnings.push(`${f}[${i}]: invalid inline modifier \u2014 skipped`);
        return;
      }
      if (typeof entry === "string" || typeof entry === "number") {
        attached.push({ id: asString(entry), name: asString(entry) });
        return;
      }
      if (isRecord(entry)) {
        const nested = isRecord(entry.modifier) ? entry.modifier : null;
        attached.push({
          id: asString(entry.id ?? entry.modifier_id ?? nested?.id),
          name: asString(entry.name ?? entry.modifier_name ?? nested?.name)
        });
        return;
      }
      warnings.push(`${f}[${i}]: invalid modifier entry \u2014 skipped`);
    });
    break;
  }
  const partType = lc(firstField(part, ["part_type", "inventoried_part_type", "partType"]));
  const seen = /* @__PURE__ */ new Set();
  const candidates = [
    ...catalog.map((m) => ({ m, inline: false })),
    ...inlineMods.map((m) => ({ m, inline: true }))
  ];
  for (const { m, inline } of candidates) {
    if (!m.active) continue;
    if (m.inventoried_part_type && partType && lc(m.inventoried_part_type) !== partType) continue;
    if (!inline && attached !== null) {
      const mid = lc(m.id);
      const mname = lc(m.name);
      const hit = attached.some((r) => mid !== "" && (lc(r.id) === mid || lc(r.name) === mid) || mname !== "" && (lc(r.name) === mname || lc(r.id) === mname));
      if (!hit) continue;
    }
    if (!inline && attached === null) continue;
    const key = m.id || `name:${lc(m.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.input_type === "formula") {
      lines.push({
        modifier_id: m.id,
        name: m.label || m.name,
        rate_label: "",
        cost_rate: 0,
        per_unit: "",
        kind: "none",
        quantity: partQty,
        area_sqft: area,
        cost_cents: 0,
        source: inline ? "inline" : "catalog",
        pricing_gated: m.can_use_in_pricing
      });
      warnings.push(`modifier "${m.name}" is formula-priced \u2014 no cost basis, contributes 0`);
      continue;
    }
    const { rate } = resolveModifierCostRate(m, answers);
    if (!rate) {
      lines.push({
        modifier_id: m.id,
        name: m.label || m.name,
        rate_label: "",
        cost_rate: 0,
        per_unit: "",
        kind: "none",
        quantity: partQty,
        area_sqft: area,
        cost_cents: 0,
        source: inline ? "inline" : "catalog",
        pricing_gated: m.can_use_in_pricing
      });
      warnings.push(`modifier "${m.name}" has no resolvable rate row \u2014 cost 0`);
      continue;
    }
    const kind = PER_UNIT_KIND[lc(rate.per_unit)] ?? "flat";
    const effQty = m.affects_waste ? partQty * waste : partQty;
    const cost = kind === "percent" ? Math.round(baseCents * rate.cost / 100) : toCents(
      kind === "per_unit" ? rate.cost * effQty : kind === "per_sqft" ? rate.cost * (m.affects_waste ? area * waste : area) : rate.cost
      // flat
    );
    lines.push({
      modifier_id: m.id,
      name: m.label || m.name,
      rate_label: rate.label,
      cost_rate: rate.cost,
      per_unit: rate.per_unit,
      kind,
      quantity: effQty,
      area_sqft: area,
      cost_cents: cost,
      source: inline ? "inline" : "catalog",
      pricing_gated: m.can_use_in_pricing
    });
  }
  return { cost_cents: lines.reduce((s, l) => s + l.cost_cents, 0), lines, warnings };
}
function snapshotPartCostCents(part) {
  if (!isRecord(part)) return 0;
  const explicitMaterial = componentFinite(part, MATERIAL_COST_FIELDS);
  if (explicitMaterial != null) return toCents(explicitMaterial);
  const ext = firstFinite(part, PART_EXTENDED_COST_FIELDS);
  if (ext != null) return toCents(ext);
  const qty = num(firstFinite(part, ["quantity", "qty"]) ?? 1);
  const unit = firstFinite(part, PART_UNIT_COST_FIELDS);
  if (unit != null) return toCents(unit * qty);
  const manual = firstFinite(part, PART_MANUAL_COST_FIELDS);
  if (manual != null) return toCents(manual * qty);
  const current = firstFinite(part, PART_CURRENT_EXTENDED_FIELDS);
  if (current != null) return toCents(current);
  return 0;
}
function partCostBreakdown(args) {
  const a = isRecord(args) ? args : {};
  const part = isRecord(a.part) ? a.part : {};
  const bucket = partCostBucket(part);
  const snapshot = snapshotPartCostCents(part);
  const warnings = [];
  const active = part.is_active !== false;
  const machineRes = bucket !== "machine" && active ? resolveMachineCost({ part, machines: a.machines }) : { cost_cents: 0, lines: [], operator_labor_cents: 0, warnings: [] };
  const explicitMachine = bucket !== "machine" ? componentFinite(part, MACHINE_COST_FIELDS) : null;
  const machineCents = bucket === "machine" ? snapshot : explicitMachine != null ? toCents(Math.max(0, explicitMachine)) : machineRes.cost_cents;
  const laborRes = bucket !== "labor" && active ? resolveLaborCost({
    part,
    labor_levels: a.labor_levels,
    machine_labor_cents: explicitMachine == null ? machineRes.operator_labor_cents : 0,
    machine_labor_hours: machineRes.lines.reduce((s, l) => s + l.operator_labor_hours, 0)
  }) : { cost_cents: 0, lines: [], warnings: [] };
  const laborCents = bucket === "labor" ? snapshot : laborRes.cost_cents;
  const explicitModifier = bucket !== "modifier" ? componentFinite(part, MODIFIER_COST_FIELDS) : null;
  const modifierRes = bucket !== "modifier" && active && explicitModifier == null ? resolveModifierCost({ part, modifiers: a.modifiers, answers: a.answers }) : { cost_cents: 0, lines: [], warnings: [] };
  const modifierCents = bucket === "modifier" ? snapshot : explicitModifier != null ? toCents(Math.max(0, explicitModifier)) : modifierRes.cost_cents;
  const materialCents = bucket === "material" ? snapshot : 0;
  const extras = machineRes.cost_cents + laborRes.cost_cents + modifierRes.cost_cents;
  const total = active ? materialCents + machineCents + laborCents + modifierCents : 0;
  warnings.push(...machineRes.warnings, ...laborRes.warnings, ...modifierRes.warnings);
  if (!active) warnings.push("part is inactive \u2014 excluded from cost");
  return {
    part_id: asString(part.id) || null,
    part_key: asString(part.part_key),
    part_name: asString(part.part_name ?? part.client_label ?? part.name),
    part_type: asString(part.part_type) || "material",
    bucket,
    quantity: Math.max(0, num(firstFinite(part, ["quantity", "qty"]) ?? 1)),
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
    warnings
  };
}
var lineUnitSell = (line) => firstFiniteValue(line.customer_price_snapshot) ?? num(line.total_snapshot);
var categoryAdjFor = (line, catAdj) => isRecord(catAdj) ? num(catAdj[asString(line.product_category)]) : 0;
function lineSellCents(line, estimate) {
  const l = isRecord(line) ? line : {};
  const unit = lineUnitSell(l);
  const qty = Math.max(0, num(firstFiniteValue(l.customer_quantity) ?? 1));
  const adj = num(l.adjustment_percent) + categoryAdjFor(l, isRecord(estimate) ? estimate.category_adjustments : void 0);
  return scaleCents(toCents(unit * qty), 1 + adj / 100);
}
var partsForLine = (line, parts) => {
  const all = (Array.isArray(parts) ? parts : []).filter(isRecord);
  const bpid = asString(line.builder_product_id ?? line.product_id);
  if (!bpid) return [];
  return all.filter((p) => asString(p.builder_product_id) === bpid);
};
var projectForLine = (line, projects) => {
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
var projectHasComponentTotals = (project) => firstFinite(project, PROJECT_MACHINE_FIELDS) != null || firstFinite(project, PROJECT_LABOR_FIELDS) != null || firstFinite(project, PROJECT_MATERIAL_FIELDS) != null || firstFinite(project, PROJECT_MODIFIER_FIELDS) != null;
function lineMargin(args) {
  const a = isRecord(args) ? args : {};
  const line = isRecord(a.line) ? a.line : {};
  const warnings = [];
  const qty = Math.max(0, num(firstFiniteValue(line.customer_quantity) ?? 1));
  const sellCents = lineSellCents(line, a.estimate);
  const unit = lineUnitSell(line);
  const adjPct = num(line.adjustment_percent) + categoryAdjFor(line, isRecord(a.estimate) ? a.estimate.category_adjustments : void 0);
  const snapshotExt = toCents(num(line.total_snapshot) * qty);
  let material = 0, machine = 0, labor = 0, modifier = 0;
  let basis = "snapshot";
  let partBreakdowns = [];
  const lineParts = partsForLine(line, a.parts);
  if (lineParts.length) {
    basis = "parts";
    partBreakdowns = lineParts.map((part) => partCostBreakdown({
      part,
      machines: a.machines,
      labor_levels: a.labor_levels,
      modifiers: a.modifiers,
      answers: a.answers
    }));
    for (const pb of partBreakdowns) {
      material += pb.material_cents;
      machine += pb.machine_cents;
      labor += pb.labor_cents;
      modifier += pb.modifier_cents;
      warnings.push(...pb.warnings.map((w) => `${pb.part_name || "part"}: ${w}`));
    }
    material = scaleCents(material, qty);
    machine = scaleCents(machine, qty);
    labor = scaleCents(labor, qty);
    modifier = scaleCents(modifier, qty);
  } else {
    const project = projectForLine(line, a.projects);
    if (project && projectHasComponentTotals(project)) {
      basis = "project";
      machine = scaleCents(toCents(num(firstFinite(project, PROJECT_MACHINE_FIELDS) ?? 0)), qty);
      labor = scaleCents(toCents(num(firstFinite(project, PROJECT_LABOR_FIELDS) ?? 0)), qty);
      modifier = scaleCents(toCents(num(firstFinite(project, PROJECT_MODIFIER_FIELDS) ?? 0)), qty);
      const declaredMaterial = firstFinite(project, PROJECT_MATERIAL_FIELDS);
      if (declaredMaterial != null) {
        material = scaleCents(toCents(declaredMaterial), qty);
        const resolved = material + machine + labor + modifier;
        if (Math.abs(resolved - snapshotExt) > 1) {
          warnings.push(
            `project component total ${fromCents(resolved)} differs from frozen snapshot ${fromCents(snapshotExt)} \u2014 resolved components used`
          );
        }
      } else {
        material = Math.max(0, snapshotExt - machine - labor - modifier);
        if (machine + labor + modifier > snapshotExt) {
          warnings.push("project machine/labor/modifier totals exceed the frozen snapshot \u2014 material cost floored at 0");
        }
      }
    } else {
      material = snapshotExt;
    }
  }
  const total = material + machine + labor + modifier;
  const margin = sellCents - total;
  return {
    line_id: asString(line.line_id ?? line.id) || "",
    label: asString(line.client_product_name ?? line.builder_name ?? line.project_name) || "Product",
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
    warnings: dedupeWarnings(warnings)
  };
}
function estimateMargin(args) {
  const a = isRecord(args) ? args : {};
  const estimate = isRecord(a.estimate) ? a.estimate : {};
  const pricing = isRecord(a.pricing) ? a.pricing : null;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const lines = lineItems.map((line) => lineMargin({
    line,
    estimate,
    parts: a.parts,
    machines: a.machines,
    labor_levels: a.labor_levels ?? a.laborLevels,
    modifiers: a.modifiers,
    projects: a.projects,
    answers: a.answers
  }));
  const gross = lines.reduce((s, l) => s + l.sell_cents, 0);
  const grossMargin = lines.reduce((s, l) => s + l.margin_cents, 0);
  const comp = {
    material_cents: lines.reduce((s, l) => s + l.material_cost_cents, 0),
    machine_cents: lines.reduce((s, l) => s + l.machine_cost_cents, 0),
    labor_cents: lines.reduce((s, l) => s + l.labor_cost_cents, 0),
    modifier_cents: lines.reduce((s, l) => s + l.modifier_cost_cents, 0)
  };
  const totalCost = comp.material_cents + comp.machine_cents + comp.labor_cents + comp.modifier_cents;
  const subtotalCents = pricing && firstFiniteValue(pricing.subtotal) != null ? toCents(pricing.subtotal) : gross;
  const discountCents = pricing && firstFiniteValue(pricing.discount) != null ? toCents(pricing.discount) : scaleCents(subtotalCents, num(estimate.discount_percent) / 100);
  const contingencyCents = pricing && firstFiniteValue(pricing.contingency) != null ? toCents(pricing.contingency) : scaleCents(subtotalCents - discountCents, num(estimate.contingency_percent) / 100);
  const internalDiscountCents = toCents(firstFinite(estimate, ["internal_discount"]) ?? 0);
  const netSell = subtotalCents - discountCents + contingencyCents - internalDiscountCents;
  const margin = netSell - totalCost;
  const warnings = dedupeWarnings(lines.flatMap((l, i) => l.warnings.map((w) => `${l.label || `line ${i + 1}`} \u2014 ${w}`)));
  const share = (c) => totalCost > 0 ? Math.round(c / totalCost * 1e4) / 100 : 0;
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
      modifier_share_pct: share(comp.modifier_cents)
    },
    warnings
  };
}
function lowMarginLines(rollup, thresholdPct = DEFAULT_LOW_MARGIN_PCT) {
  const r = isRecord(rollup) ? rollup : {};
  const threshold = num(thresholdPct, DEFAULT_LOW_MARGIN_PCT);
  return (Array.isArray(r.lines) ? r.lines : []).filter((l) => isRecord(l) && num(l.sell_cents) > 0 && num(l.margin_pct) < threshold);
}
export {
  DEFAULT_LOW_MARGIN_PCT,
  LABOR_PART_TYPES,
  MACHINE_PART_TYPES,
  MARGIN_COMPONENTS,
  MODIFIER_PART_TYPES,
  estimateMargin,
  fromCents,
  lineMargin,
  lineSellCents,
  lowMarginLines,
  marginPctOf,
  markupPctOf,
  moneyRound,
  partCostBreakdown,
  partCostBucket,
  resolveLaborCost,
  resolveMachineCost,
  resolveModifierCost,
  scaleCents,
  snapshotPartCostCents,
  toCents
};
