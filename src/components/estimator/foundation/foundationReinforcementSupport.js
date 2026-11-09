import { foundationInputNumber } from "./foundationGeometryInputs";

// Support catalog selection and economics (O-024, O-026, O-027, O-028).
// Geometry requirements come from the versioned model; this module picks a
// compatible `rebar_support` catalog row per requirement — proven height fit,
// proven footprint fit, and proven bar-size compatibility — or reports no
// compatible support. It never invents a catalog pick, a unit price, a pack
// size or a bar-size label.
const HEIGHT_TOLERANCE_INCHES = 0.0625;
const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = value => typeof value === "number" && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const positive = value => finite(value) && value > 0;
const wholeNonnegative = value => nonnegative(value) && Number.isSafeInteger(value);
const text = value => typeof value === "string" && value.trim() ? value.trim() : "";
const number = value => value === null || value === undefined || value === ""
  ? null : foundationInputNumber(value);

const close = (a, b) => Math.abs(a - b) <= HEIGHT_TOLERANCE_INCHES;

const zeroAmounts = () => ({
  support_count: 0, support_purchased_units: 0, support_packs: 0,
  support_material_cost: 0, support_labor_hours: 0, support_labor_cost: 0, support_cost: 0,
});

const passthrough = (supports, issues = []) => ({
  version: 1, status: supports?.status ?? "unconfigured", mode: supports?.mode ?? null,
  count: supports?.count ?? null, per_instance_count: supports?.count ?? null,
  selections: [], amounts: zeroAmounts(), issues,
});

function catalogSupport(row) {
  if (!isRecord(row) || row.material_type !== "rebar_support") return null;
  const heightNominal = number(row.rebar_support_height_inches);
  const heightMin = number(row.rebar_support_height_min_inches);
  const heightMax = number(row.rebar_support_height_max_inches);
  const footprintLength = number(row.rebar_support_footprint_length_inches);
  const footprintWidth = number(row.rebar_support_footprint_width_inches);
  const packRaw = number(row.rebar_support_pack_size);
  const packMalformed = packRaw !== null && (!Number.isSafeInteger(packRaw) || packRaw <= 0);
  const costRaw = row.cost_per_unit;
  const cost = costRaw === null || costRaw === undefined || costRaw === "" ? null : foundationInputNumber(costRaw);
  const barSizes = Array.isArray(row.rebar_support_compatible_bar_sizes)
    ? row.rebar_support_compatible_bar_sizes.map(size => text(size)).filter(Boolean)
    : null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    name: text(row.material_name) || "Rebar support",
    kind: text(row.rebar_support_kind) || null,
    foundation_usage: text(row.foundation_usage) || null,
    heightNominal, heightMin, heightMax, footprintLength, footprintWidth,
    packSize: packRaw === null ? 1 : packRaw,
    packMalformed,
    costPerUnit: nonnegative(cost) ? cost : null,
    costMalformed: cost !== null && !nonnegative(cost),
    barSizes,
    placementNotes: text(row.rebar_support_placement_notes) || null,
    sortOrder: number(row.sort_order) ?? 0,
    updated_date: typeof row.updated_date === "string" ? row.updated_date : null,
  };
}

// Proven / refuted / unknown checks. "unknown" is never treated as compatible.
function heightCheck(row, required) {
  if (positive(row.heightNominal)) return close(row.heightNominal, required) ? "fits" : "incompatible";
  if (positive(row.heightMin) && positive(row.heightMax) && row.heightMin <= row.heightMax) {
    return row.heightMin <= required && required <= row.heightMax ? "fits" : "incompatible";
  }
  return "unverified";
}

// Feet must stay inside the concrete: a spread placement at the mat edge lets a
// footprint extend half its size toward the form, so the limit is 2 * edge per
// axis; a pillar placement's radial extent is bounded by the pour radius.
function footprintCheck(row, requirement) {
  const { footprint, positions } = requirement;
  const halfL = row.footprintLength === null ? null : row.footprintLength / 2;
  const halfW = row.footprintWidth === null ? null : row.footprintWidth / 2;
  if (footprint.kind === "pillar") {
    if (halfL === null || halfW === null) return "unverified";
    const radial = Math.hypot(halfL, halfW);
    const center = footprint.center_inches;
    const out = positions.some(position => Math.hypot(position.x - center, position.z - center) + radial > center);
    return out ? "incompatible" : "fits";
  }
  const edge = footprint.edge_inches;
  if (halfL === null || halfW === null) return "unverified";
  if (halfL > edge || halfW > edge) return "incompatible";
  const xFit = positions.every(p => p.x - halfL >= 0 && p.x + halfL <= footprint.length_inches);
  const zFit = positions.every(p => p.z - halfW >= 0 && p.z + halfW <= footprint.width_inches);
  return xFit && zFit ? "fits" : "incompatible";
}

function barCheck(row, barSize) {
  if (barSize === null) return "unverified";
  // Schema: an empty list means compatibility is unknown — not universal and
  // not a contradiction — so only a nonempty authored list can refute a pick.
  if (Array.isArray(row.barSizes) && row.barSizes.length) {
    return row.barSizes.includes(barSize) ? "fits" : "incompatible";
  }
  return "unverified";
}

function usageCheck(row, requirement) {
  const usage = row.foundation_usage;
  if (!usage || usage === "general") return "unverified";
  const wants = requirement.footprint.kind === "pillar" ? "pillar" : "spread_foot";
  return usage === wants ? "fits" : "incompatible";
}

// A row is an auto-select candidate only when every check is proven: fits height,
// fits footprint, compatible bar list containing the proven bar size, and either
// matching or unauthored usage. A pinned row is rejected only when PROVABLY
// incompatible; unverifiable pinned picks stay usable with an explicit warning —
// the author attested the selection instead of the catalog proving it.
function checkRow(row, requirement, barSize) {
  const checks = {
    height: heightCheck(row, requirement.required_height_inches),
    footprint: footprintCheck(row, requirement),
    bar: barCheck(row, barSize),
    usage: usageCheck(row, requirement),
  };
  const incompatible = Object.values(checks).includes("incompatible");
  const proven = checks.height === "fits" && checks.footprint === "fits" && checks.bar === "fits"
    && checks.usage !== "incompatible";
  return { checks, incompatible, proven };
}

function provenBarSize(material, inventory) {
  if (material?.kind !== "catalog" || typeof material.inventory_id !== "string" || !material.inventory_id) return null;
  const matches = (Array.isArray(inventory) ? inventory : [])
    .filter(row => isRecord(row) && row.id === material.inventory_id && row.material_type === "rebar");
  if (matches.length !== 1) return null;
  return text(matches[0].rebar_size) || null;
}

const supportLabel = requirement => (requirement.mat_id ? `Mat ${requirement.mat_id}` : "The pillar cage");

export function resolveFoundationReinforcementSupports({
  item, design, model, material, inventory = [], basis = {},
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const supports = model?.supports;
  if (model?.version !== 2 || model.status !== "valid" || supports?.status !== "modeled") {
    return passthrough(supports);
  }
  const result = passthrough(supports);
  const mode = supports.mode;
  const config = isRecord(design?.supports) ? design.supports : {};
  const rows = (Array.isArray(inventory) ? inventory : []).map(catalogSupport).filter(Boolean);
  const dupes = new Set(), seen = new Set();
  for (const row of rows) {
    if (row.id !== null && seen.has(row.id)) dupes.add(row.id);
    if (row.id !== null) seen.add(row.id);
  }
  const barSize = provenBarSize(material, inventory);

  // Optional authored catalog pin: one row applied to every requirement.
  let pinned = null;
  if (config.catalog_id !== undefined && config.catalog_id !== null && config.catalog_id !== "") {
    const id = config.catalog_id;
    if (typeof id !== "string" || !id.trim() || id.trim() !== id || id.length > 128) {
      issue("supports.catalog_id", "reinforcement_support_catalog_id_invalid",
        "The pinned support catalog ID must be a stable trimmed identifier.");
      return { ...result, issues };
    }
    const matches = rows.filter(row => row.id === id);
    if (!matches.length) {
      issue("supports.catalog_id", "reinforcement_support_catalog_unavailable",
        "The pinned rebar support catalog record is unavailable; refresh the catalog before pricing.");
      return { ...result, issues };
    }
    if (matches.length > 1 || dupes.has(id)) {
      issue("supports.catalog_id", "reinforcement_support_catalog_ambiguous",
        "Multiple current rebar support records have the pinned ID; refresh the catalog before pricing.");
      return { ...result, issues };
    }
    pinned = matches[0];
  }

  const laborRate = nonnegative(basis?.labor_rate_per_hour) ? basis.labor_rate_per_hour : null;
  const laborEach = nonnegative(basis?.labor_hours_per_support) ? basis.labor_hours_per_support : null;
  const instanceCount = wholeNonnegative(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue("model.instanceCount", "reinforcement_numeric_range_invalid",
      "Support quantities require a known positive foundation instance count.");
    return { ...result, issues };
  }
  const warnedPin = new Set();
  let unresolvedCost = false, unverifiedPin = false;

  for (const requirement of supports.requirements || []) {
    const required = requirement.required_height_inches;
    const count = requirement.count;
    if (!Number.isSafeInteger(count) || count <= 0 || !positive(required)) {
      issue("supports", "reinforcement_support_requirement_invalid",
        `${supportLabel(requirement)} produced an invalid support requirement.`);
      continue;
    }
    let chosen = null, provenance = "verified";
    if (pinned) {
      const verdict = checkRow(pinned, requirement, barSize);
      if (verdict.incompatible) {
        issue("supports.catalog_id", "reinforcement_support_pinned_incompatible",
          `${supportLabel(requirement)} cannot use the pinned catalog support: height, footprint, bar-size or usage is provably incompatible — pick a different row or clear the pin.`);
        continue;
      }
      if (!verdict.proven) unverifiedPin = true;
      if (!verdict.proven && !warnedPin.has("unverified")) {
        warnedPin.add("unverified");
        issue("supports.catalog_id", "reinforcement_support_compatibility_unverified",
          "The pinned support cannot be proven compatible from catalog metadata (height, footprint or bar-size data is missing); the authored pick stands pending verification.",
          "warning");
      }
      chosen = pinned;
      provenance = verdict.proven ? "verified" : "authored_unverified";
    } else {
      const candidates = rows
        .map(row => ({ row, verdict: checkRow(row, requirement, barSize) }))
        .filter(entry => entry.verdict.proven);
      if (!candidates.length) {
        issue("supports", "reinforcement_support_no_compatible",
          `${supportLabel(requirement)} needs a ${required}-in support; no catalog rebar_support row is proven compatible on height, footprint and bar size — catalog one, pin an explicit pick, or explain supports off.`);
        continue;
      }
      const priced = entry => (entry.row.costPerUnit !== null ? 0 : 1);
      const heightRank = entry => entry.row.heightNominal !== null
        ? Math.abs(entry.row.heightNominal - required)
        : required - entry.row.heightMin;
      candidates.sort((a, b) =>
        priced(a) - priced(b)
        || heightRank(a) - heightRank(b)
        || a.row.costPerUnit - b.row.costPerUnit
        || (a.row.sortOrder ?? 0) - (b.row.sortOrder ?? 0)
        || String(a.row.id).localeCompare(String(b.row.id)));
      chosen = candidates[0].row;
    }
    if (chosen.packMalformed) {
      issue("supports", "reinforcement_support_pack_invalid",
        `${supportLabel(requirement)} selection "${chosen.name}" has a malformed pack size; units are priced individually and the catalog row needs repair.`,
        "warning");
    }
    if (chosen.costMalformed || chosen.costPerUnit === null) unresolvedCost = true;
    const unitsRequired = count * instanceCount;
    const pack = chosen.packMalformed ? 1 : chosen.packSize;
    const packs = Math.ceil(unitsRequired / pack);
    const purchased = packs * pack;
    const materialCost = chosen.costPerUnit === null ? null : purchased * chosen.costPerUnit;
    const laborHours = laborEach !== null && laborRate !== null ? unitsRequired * laborEach : null;
    const laborCost = laborHours !== null ? laborHours * laborRate : null;
    if (materialCost === null || laborCost === null) unresolvedCost = true;
    const usedHeight = chosen.heightNominal ?? required;
    result.selections.push({
      target_id: requirement.target_id, mat_id: requirement.mat_id, base: requirement.base,
      required_height_inches: required, support_height_inches: usedHeight,
      inventory_id: chosen.id, name: chosen.name, kind: chosen.kind,
      compatibility: provenance,
      count_per_instance: count, units_required: unitsRequired,
      pack_size: pack, packs, units_purchased: purchased,
      unit_cost: chosen.costPerUnit, material_cost: materialCost,
      labor_hours: laborHours, labor_cost: laborCost,
      cost: materialCost !== null && laborCost !== null ? materialCost + laborCost : null,
      placement_notes: chosen.placementNotes,
    });
  }

  // Aggregate economics; each total is exact or the support stays unresolved.
  const amounts = zeroAmounts();
  for (const selection of result.selections) {
    amounts.support_count += selection.units_required;
    amounts.support_purchased_units += selection.units_purchased;
    amounts.support_packs += selection.packs;
    amounts.support_material_cost += selection.material_cost ?? 0;
    amounts.support_labor_hours += selection.labor_hours ?? 0;
    amounts.support_labor_cost += selection.labor_cost ?? 0;
  }
  amounts.support_cost = amounts.support_material_cost + amounts.support_labor_cost;
  result.amounts = amounts;
  result.per_instance_count = supports.count ?? 0;
  result.count = amounts.support_count;
  result.pin = pinned ? { inventory_id: pinned.id, name: pinned.name } : null;

  if (unresolvedCost) {
    issue("supports", "reinforcement_support_cost_unknown",
      "A selected support has no verifiable catalog unit price or install-labor basis; support quantities are known but support cost is unresolved — never a silent zero.",
      "warning");
  }
  if (amounts.support_count > 0) {
    issue("supports", "reinforcement_support_obstructions_unverified",
      "Embedded poles, sleeves, conduits and voids are not modeled; verify modeled support positions clear all obstructions before build.",
      "warning");
  }
  const covered = supports.requirements?.length ?? 0;
  const selected = result.selections.length;
  result.status = issues.some(entry => entry.severity === "error")
    ? "unresolved"
    : covered === selected && !unresolvedCost ? "resolved" : "unresolved";
  result.issues = issues;
  return result;
}
