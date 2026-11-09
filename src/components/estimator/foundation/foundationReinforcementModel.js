import { foundationItemGeometryIssues as foundationItemInputIssues } from "./foundationGeometryInputs";

const MAX_GEOMETRY = 4096;
const MAX_SUPPORTS = 4096;
const SUPPORT_CAGE_TARGET = "cage";
const less = (a, b) => a < b - 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
const emptyQuantities = () => ({
  horizontal_count: 0, horizontal_length_inches: 0,
  longitudinal_count: 0, longitudinal_length_inches: 0,
  hoop_count: 0, hoop_length_inches: 0,
  inter_mat_tie_count: 0, inter_mat_tie_length_inches: 0,
  mat_crossings: 0, hoop_bar_crossings: 0, tie_ends: 0,
});

function modelContext(item, design, geometryLimit) {
  const issues = [], groups = [], geometry = [], ids = new Set();
  const counts = emptyQuantities();
  let missing = false;
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const required = (field, message) => {
    missing = true;
    issue(field, "reinforcement_input_required", message);
  };
  const number = (value, field, { zero = false, integer = false } = {}) => {
    if (value === undefined || value === null) { required(field, "An explicit value is required."); return null; }
    if (typeof value !== "number" || !Number.isFinite(value) || (zero ? value < 0 : value <= 0)
      || (integer && !Number.isSafeInteger(value))) {
      issue(field, "reinforcement_number_invalid", `Use a finite ${zero ? "nonnegative" : "positive"}${integer ? " whole" : ""} number.`);
      return null;
    }
    return value;
  };
  const list = (value, field, limit, allowEmpty = true) => {
    if (value === undefined || value === null) { required(field, "An explicit list is required."); return []; }
    if (!Array.isArray(value) || value.length > limit || (!allowEmpty && !value.length)) {
      issue(field, "reinforcement_list_invalid", `Use ${allowEmpty ? "up to" : "one to"} ${limit} records.`);
      return [];
    }
    return value;
  };
  const identity = (value, field) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value) || ids.has(value)) {
      issue(field, "reinforcement_id_invalid", "Use a unique stable identifier (letters, numbers, hyphen or underscore).");
      return null;
    }
    ids.add(value);
    return value;
  };
  const bounds = (value, min, max, field) => {
    if (value !== null && (less(value, min) || less(max, value))) {
      issue(field, "reinforcement_clearance_invalid", "The authored geometry does not fit the concrete and explicit clearances.");
      return false;
    }
    return value !== null;
  };
  const group = (id, role, count, length, makeGeometry) => {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(length) || length <= 0) {
      issue(id, "reinforcement_numeric_range_invalid", "The steel quantity is outside the supported numeric range.");
      return;
    }
    if (!count) return;
    groups.push({ id, role, count, cut_length_inches: length, diameter_inches: design.bar_diameter_inches });
    counts[`${role}_count`] += count;
    counts[`${role}_length_inches`] += count * length;
    const generated = Math.min(count, geometryLimit - geometry.length);
    for (let i = 0; i < generated; i++) geometry.push({ id: `${id}/${i}`, groupId: id, role, ...makeGeometry(i) });
  };
  return {
    item, design, issues, groups, geometry, counts, issue, required, number, list, identity, bounds, group,
    supportContext: null,
    get missing() { return missing; },
  };
}

function spreadSteel(c, dimensions, covers, diameter) {
  const { design, number, list, identity, bounds, issue, group, counts } = c;
  const { length, width, depth } = dimensions;
  const radius = diameter / 2, edge = covers.side + radius;
  const xSpan = length - 2 * edge, zSpan = width - 2 * edge;
  if (less(xSpan, 0) || less(zSpan, 0)) {
    issue("cover_inches.side", "reinforcement_clearance_invalid", "Side cover and bar diameter leave no room for the mat.");
    return;
  }
  const mats = new Map();
  const rawMats = list(design.spread?.mats, "spread.mats", 256, false);
  rawMats.forEach((mat, index) => {
    const field = `spread.mats.${index}`;
    const id = identity(mat?.id, `${field}.id`);
    const bearing = number(mat?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number(mat?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number(mat?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
    if ([id, bearing, sx, sz].some(v => v === null)) return;
    if (!bounds(bearing, covers.bottom, depth - covers.top - 2 * diameter, field)) return;
    const nx = xSpan <= 0 ? 1 : Math.ceil(xSpan / sx) + 1;
    const nz = zSpan <= 0 ? 1 : Math.ceil(zSpan / sz) + 1;
    const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
    group(`${id}/x`, "horizontal", nz, length - 2 * covers.side, i => ({
      kind: "segment", matId: id, diameter_inches: diameter,
      from: { x: covers.side, y: bearing + radius, z: at(nz, i, zSpan) },
      to: { x: length - covers.side, y: bearing + radius, z: at(nz, i, zSpan) },
    }));
    group(`${id}/z`, "horizontal", nx, width - 2 * covers.side, i => ({
      kind: "segment", matId: id, diameter_inches: diameter,
      from: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: covers.side },
      to: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: width - covers.side },
    }));
    counts.mat_crossings += nx * nz;
    mats.set(id, { id, bearing, field });
  });
  const sorted = [...mats.values()].sort((a, b) => a.bearing - b.bearing);
  sorted.forEach((mat, index) => {
    if (index && less(mat.bearing - sorted[index - 1].bearing, 2 * diameter)) {
      issue(mat.field, "reinforcement_mat_overlap", "Mat tier envelopes overlap.");
    }
  });
  c.supportContext = { kind: "spread", edge, xSpan, zSpan, mats: sorted, diameter, covers, dimensions };
  list(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
    const field = `spread.inter_mat_ties.${index}`;
    const id = identity(tie?.id, `${field}.id`);
    const from = mats.get(tie?.from_mat_id), to = mats.get(tie?.to_mat_id);
    const x = number(tie?.x_inches, `${field}.x_inches`, { zero: true });
    const z = number(tie?.z_inches, `${field}.z_inches`, { zero: true });
    const length = number(tie?.cut_length_inches, `${field}.cut_length_inches`);
    if (!from || !to || from.id === to.id) {
      issue(field, "reinforcement_tie_parent_invalid", "Tie endpoints require two distinct existing mats.");
      return;
    }
    if ([id, x, z, length].some(v => v === null)) return;
    if (!bounds(x, edge, dimensions.length - edge, `${field}.x_inches`)
      || !bounds(z, edge, width - edge, `${field}.z_inches`)) return;
    const distance = Math.abs(to.bearing - from.bearing);
    if (less(length, distance)) {
      issue(`${field}.cut_length_inches`, "reinforcement_tie_length_invalid", "Cut length is shorter than the mat-to-mat path.");
      return;
    }
    group(id, "inter_mat_tie", 1, length, () => ({
      kind: "tie_reference", diameter_inches: diameter,
      from: { x, y: from.bearing + radius, z }, to: { x, y: to.bearing + radius, z },
    }));
    counts.tie_ends += 2;
  });
  if (counts.inter_mat_tie_count) issue("spread.inter_mat_ties", "reinforcement_tie_path_only",
    "Tie paths are references; authored cut lengths include any hook/bend allowance and require engineering/fabrication review.", "warning");
}

// Support geometry (O-022..O-025, O-028): a mat's supports are derived from the
// authored design, never guessed. The lowest spread mat rests on the concrete
// bottom plane (y = 0); every higher mat rests on the next lower mat's full
// steel envelope (bearing + 2 * bar diameter). Required stand height is the
// authored bearing elevation minus that base plane, so bar thickness is already
// inside the rise. Free-standing stands that would pass through a lower mat are
// not modeled — an upper mat whose gap cannot take a real support reports an
// issue instead of an overlapping object. Catalog compatibility, pricing, pack
// rounding and installation labor live in foundationReinforcementSupport.js.
function supportTargets(c) {
  const sc = c.supportContext;
  if (!sc) return [];
  if (sc.kind === "pillar") {
    if (!sc.cage) return [];
    return [{
      target_id: SUPPORT_CAGE_TARGET, mat_id: null, base: "concrete_bottom",
      base_elevation_inches: 0, required_height_inches: sc.cage.bottom_end_inches,
      footprint: { kind: "pillar", center_inches: sc.center },
    }];
  }
  return sc.mats.map((mat, index) => {
    const lower = index ? sc.mats[index - 1] : null;
    const baseElevation = lower ? lower.bearing + 2 * sc.diameter : 0;
    return {
      target_id: mat.id, mat_id: mat.id,
      base: lower ? "mat_below" : "concrete_bottom",
      base_elevation_inches: baseElevation,
      required_height_inches: mat.bearing - baseElevation,
      footprint: {
        kind: "spread", edge_inches: sc.edge, x_span_inches: sc.xSpan, z_span_inches: sc.zSpan,
        length_inches: sc.dimensions.length, width_inches: sc.dimensions.width,
      },
    };
  });
}

// Auto mode: an evenly distributed grid over the mat footprint at the authored
// maximum spacing. ceil(span/spacing)+1 stations per axis, inclusive of both
// edges, keeps every gap at or under the authored value; count is the exact
// grid product — deterministic, reported, never silently inflated.
function supportGridPositions(footprint, spacing) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const nx = Math.ceil(xSpan / spacing) + 1;
  const nz = Math.ceil(zSpan / spacing) + 1;
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let zi = 0; zi < nz; zi += 1) {
    for (let xi = 0; xi < nx; xi += 1) positions.push({ x: at(nx, xi, xSpan), z: at(nz, zi, zSpan) });
  }
  return positions;
}

// Manual authored counts distribute over the same footprint on a deterministic
// near-square grid; the emitted position count equals the authored count
// exactly — an override never inflates.
function supportCountPositions(footprint, count) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const aspect = zSpan > 0 ? xSpan / zSpan : count;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / cols);
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    positions.push({ x: at(cols, i % cols, xSpan), z: at(rows, Math.floor(i / cols), zSpan) });
  }
  return positions;
}

function supportsPlan(c) {
  const config = c.design.supports;
  const mode = config?.mode ?? "unconfigured";
  const result = {
    status: "unconfigured", mode, count: null, requirements: [], uncovered: [],
    placements: [], context: null,
  };
  if (mode === "off") {
    if (typeof config.reason !== "string" || !config.reason.trim()) {
      c.required("supports.reason", "Explain how the steel is supported when support items are off.");
      return result;
    }
    c.issue("supports", "reinforcement_supports_off_explained", "Support items are off with an explicit explanation; this is not an engineering approval.", "warning");
    return { ...result, status: "off_explained", count: 0, reason: config.reason.trim() };
  }
  if (!["unconfigured", "manual", "auto"].includes(mode)) {
    c.issue("supports.mode", "reinforcement_support_mode_invalid", "Choose a supported support-selection mode.");
    return result;
  }
  if (mode === "unconfigured") {
    c.issue("supports", "reinforcement_supports_unconfigured", "Supports have not been modeled or priced; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  const sc = c.supportContext;
  const targets = supportTargets(c);
  if (!sc || !targets.length) {
    c.issue("supports", "reinforcement_supports_unconfigured", "No modeled steel accepts supports in this design; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  result.context = sc.kind === "pillar"
    ? { kind: "pillar", center_inches: sc.center, depth_inches: sc.dimensions.depth, diameter_inches: sc.diameter }
    : {
      kind: "spread", edge_inches: sc.edge, length_inches: sc.dimensions.length,
      width_inches: sc.dimensions.width, depth_inches: sc.dimensions.depth, diameter_inches: sc.diameter,
    };
  const coverage = new Map();
  const labelOf = target => (target.mat_id ? `Mat ${target.mat_id}` : "The pillar cage");
  if (mode === "auto") {
    if (sc.kind === "pillar") {
      c.issue("supports.mode", "reinforcement_support_mode_unavailable",
        "Auto support placement is unavailable for pillar cages; place manual supports or explain off.");
      return result;
    }
    const spacing = c.number(config?.spacing_inches, "supports.spacing_inches");
    if (spacing === null) return result;
    for (const target of targets) {
      coverage.set(target.target_id, { positions: supportGridPositions(target.footprint, spacing) });
    }
  } else {
    const optList = (value, field, limit) => {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.length > limit) {
        c.issue(field, "reinforcement_list_invalid", `Use up to ${limit} records.`);
        return [];
      }
      return value;
    };
    const targetFor = (ref, field) => {
      const cageRef = ref === undefined || ref === null || ref === "" || ref === SUPPORT_CAGE_TARGET;
      const target = cageRef
        ? (sc.kind === "pillar" ? targets[0] : null)
        : targets.find(record => record.target_id === ref);
      if (!target) {
        c.issue(field, "reinforcement_support_target_invalid",
          "Support coverage requires an existing spread mat or the pillar cage.");
      }
      return target;
    };
    optList(config?.mats, "supports.mats", 256).forEach((entry, index) => {
      const field = `supports.mats.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const count = c.number(entry?.count, `${field}.count`, { zero: true, integer: true });
      if (!target || count === null) return;
      const cov = coverage.get(target.target_id) || {};
      if (cov.positions || cov.count !== undefined) {
        c.issue(field, "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both.");
        return;
      }
      coverage.set(target.target_id, { ...cov, count });
    });
    optList(config?.placements, "supports.placements", MAX_SUPPORTS).forEach((entry, index) => {
      const field = `supports.placements.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const x = c.number(entry?.x_inches, `${field}.x_inches`, { zero: true });
      const z = c.number(entry?.z_inches, `${field}.z_inches`, { zero: true });
      if (!target || x === null || z === null) return;
      if (sc.kind === "pillar") {
        if (Math.hypot(x - sc.center, z - sc.center) > sc.center) {
          c.issue(field, "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the concrete footprint.");
          return;
        }
      } else {
        const footprint = target.footprint;
        if (less(x, footprint.edge_inches) || less(footprint.length_inches - footprint.edge_inches, x)
          || less(z, footprint.edge_inches) || less(footprint.width_inches - footprint.edge_inches, z)) {
          c.issue(field, "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the supported mat footprint.");
          return;
        }
      }
      const cov = coverage.get(target.target_id) || {};
      if (cov.count !== undefined) {
        c.issue(field, "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both.");
        return;
      }
      (cov.positions ||= []).push({ x, z });
      coverage.set(target.target_id, cov);
    });
  }
  let total = 0;
  for (const target of targets) {
    const cov = coverage.get(target.target_id) || {};
    let positions = cov.positions;
    if (positions === undefined && cov.count !== undefined) {
      positions = supportCountPositions(target.footprint, cov.count);
    }
    positions ||= [];
    const needed = target.required_height_inches > 0;
    if (!needed) {
      if (positions.length && mode === "manual") {
        c.issue("supports", "reinforcement_support_height_infeasible",
          `${labelOf(target)} bears directly on its base plane; authored supports cannot fit under it.`);
      } else {
        c.issue("supports", "reinforcement_support_unneeded",
          `${labelOf(target)} bears directly on its base plane; no support device is required for it.`, "warning");
      }
      continue;
    }
    if (!positions.length) {
      c.issue("supports", "reinforcement_support_mat_unsupported",
        `${labelOf(target)} has no modeled supports; verify how it is held before build.`, "warning");
      result.uncovered.push({ target_id: target.target_id, mat_id: target.mat_id });
      continue;
    }
    total += positions.length;
    if (total > MAX_SUPPORTS) {
      c.issue("supports", "reinforcement_numeric_range_invalid",
        "Modeled support positions exceed the supported numeric range.");
      return result;
    }
    result.requirements.push({ ...target, count: positions.length, positions });
    for (const position of positions) {
      result.placements.push({
        target_id: target.target_id, mat_id: target.mat_id, x: position.x, z: position.z,
        base: target.base, base_elevation_inches: target.base_elevation_inches,
        required_height_inches: target.required_height_inches,
      });
    }
  }
  result.status = "modeled";
  result.count = total;
  return result;
}

function pillarSteel(c, dimensions, covers, diameter) {
  const { design, number, list, identity, bounds, issue, group, counts } = c;
  const radius = diameter / 2, center = dimensions.diameter / 2;
  const outer = center - covers.side;
  const longitudinal = design.pillar?.longitudinal;
  const n = number(longitudinal?.count, "pillar.longitudinal.count", { zero: true, integer: true });
  let long = null;
  if (n > 0) {
    const r = number(longitudinal.radius_inches, "pillar.longitudinal.radius_inches", { zero: true });
    const bottom = number(longitudinal.bottom_end_inches, "pillar.longitudinal.bottom_end_inches", { zero: true });
    const top = number(longitudinal.top_end_inches, "pillar.longitudinal.top_end_inches", { zero: true });
    if (![r, bottom, top].some(v => v === null)) {
      bounds(r, 0, outer - radius, "pillar.longitudinal.radius_inches");
      bounds(bottom, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.bottom_end_inches");
      bounds(top, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.top_end_inches");
      if (top <= bottom) issue("pillar.longitudinal", "reinforcement_length_invalid", "Longitudinal bar ends require a positive cut length.");
      if (n > 1 && less(2 * r * Math.sin(Math.PI / n), diameter)) {
        issue("pillar.longitudinal", "reinforcement_bar_overlap", "Longitudinal bars overlap on the authored radius.");
      }
      group("pillar/longitudinal", "longitudinal", n, top - bottom, i => {
        const angle = i * 2 * Math.PI / n;
        const x = center + r * Math.cos(angle), z = center + r * Math.sin(angle);
        return { kind: "segment", diameter_inches: diameter, from: { x, y: bottom, z }, to: { x, y: top, z } };
      });
      long = { r, bottom, top };
    }
  }
  const hoops = [];
  list(design.pillar?.hoops, "pillar.hoops", 256).forEach((hoop, index) => {
    const field = `pillar.hoops.${index}`;
    const id = identity(hoop?.id, `${field}.id`);
    const y = number(hoop?.center_y_inches, `${field}.center_y_inches`, { zero: true });
    const d = number(hoop?.centerline_diameter_inches, `${field}.centerline_diameter_inches`);
    const allowance = number(hoop?.cut_allowance_inches, `${field}.cut_allowance_inches`, { zero: true });
    if ([id, y, d, allowance].some(v => v === null)) return;
    const r = d / 2;
    if (less(d, diameter)) issue(`${field}.centerline_diameter_inches`, "reinforcement_hoop_self_overlap",
      "Hoop centerline diameter is smaller than the bar diameter.");
    bounds(y, covers.bottom + radius, dimensions.depth - covers.top - radius, `${field}.center_y_inches`);
    bounds(r, 0, outer - radius, `${field}.centerline_diameter_inches`);
    for (const other of hoops) {
      if (less(Math.hypot(other.y - y, other.r - r), diameter)) {
        issue(field, "reinforcement_hoop_overlap", "Hoop envelopes overlap.");
      }
    }
    hoops.push({ y, r });
    group(id, "hoop", 1, Math.PI * d + allowance, () => ({
      kind: "hoop", center: { x: center, y, z: center }, centerline_radius_inches: r,
      diameter_inches: diameter, cut_allowance_inches: allowance,
    }));
    if (long) {
      const radial = Math.abs(r - long.r);
      const outsideY = Math.max(long.bottom - y, y - long.top, 0);
      if (less(Math.hypot(radial, outsideY), diameter)) {
        issue(field, "reinforcement_bar_overlap", "Hoop and longitudinal bar envelopes overlap.");
      } else if (!outsideY && !less(diameter, radial)) counts.hoop_bar_crossings += n;
      else issue(field, "reinforcement_connection_unverified", "Hoop-to-longitudinal connections are not established by this geometry.", "warning");
    }
  });
  if (hoops.length) issue("pillar.hoops", "reinforcement_hoop_allowance_authored",
    "Hoop cut allowance is authored explicitly; hooks, laps and structural adequacy require review.", "warning");
  c.supportContext = { kind: "pillar", center, outer, diameter, covers, dimensions,
    cage: long ? { bottom_end_inches: long.bottom } : null };
}

function quantityTotals(counts, quantity) {
  const totals = {};
  for (const [key, value] of Object.entries(counts)) {
    const length = key.endsWith("_length_inches");
    totals[length ? key.replace("_length_inches", "_feet") : key] = (length ? value / 12 : value) * quantity;
  }
  totals.total_steel_feet = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"]
    .reduce((sum, role) => sum + totals[`${role}_feet`], 0);
  return totals;
}

export function calculateFoundationReinforcementModel(item = {}, design, options = {}) {
  item = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const geometryLimit = options?.geometryLimit ?? MAX_GEOMETRY;
  const base = {
    version: 2, componentId: item.component_id ?? null, instanceCount: null, engineeringApproved: false,
    status: "invalid", issues: [], perInstance: null, totals: null, groups: [], geometry: [],
    omittedGeometryCount: 0,
    supports: { status: "unconfigured", mode: "unconfigured", count: null, requirements: [], uncovered: [], placements: [], context: null },
  };
  const foundationIssues = foundationItemInputIssues({ ...item, include_rebar: false });
  if (foundationIssues.length) return {
    ...base, issues: foundationIssues.map(({ field, code, message }) => ({ field, code, message, severity: "error" })),
  };
  const quantity = Number(item.quantity ?? 1);
  base.instanceCount = quantity;
  if (!item.include_rebar) return {
    ...base, status: "off", perInstance: emptyQuantities(), totals: quantityTotals(emptyQuantities(), quantity),
    supports: { status: "not_required", mode: null, count: 0, requirements: [], uncovered: [], placements: [], context: null },
  };
  const c = modelContext(item, design ?? {}, geometryLimit);
  if (!Number.isSafeInteger(geometryLimit) || geometryLimit < 0 || geometryLimit > MAX_GEOMETRY) {
    c.issue("geometryLimit", "reinforcement_geometry_budget_invalid", `Geometry budget must be a whole number from zero to ${MAX_GEOMETRY}.`);
  }
  if (design?.version !== 2) {
    if (design?.version === undefined || design?.version === null) c.required("version", "An explicit version-2 reinforcement design is required.");
    else c.issue("version", "reinforcement_version_invalid", "This model accepts only version 2.");
  }
  const diameter = c.number(design?.bar_diameter_inches, "bar_diameter_inches");
  const covers = Object.fromEntries(["side", "top", "bottom"].map(key => [
    key, c.number(design?.cover_inches?.[key], `cover_inches.${key}`, { zero: true }),
  ]));
  if (!c.issues.some(i => i.severity === "error")) {
    const dimensions = {
      length: Number(item.length_inches), width: Number(item.width_inches),
      depth: Number(item.depth_inches), diameter: Number(item.diameter),
    };
    if (item.foundation_type === "spread_foot") spreadSteel(c, dimensions, covers, diameter);
    else pillarSteel(c, dimensions, covers, diameter);
  }
  const supports = supportsPlan(c);
  const totals = quantityTotals(c.counts, quantity);
  const count = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + c.counts[`${role}_count`], 0);
  if (!c.issues.some(i => i.severity === "error") && !count) {
    c.issue("design", "reinforcement_empty_design", "Enabled reinforcement requires steel geometry; otherwise turn rebar off explicitly.");
  }
  const safeCounts = Object.entries(c.counts).filter(([key]) => !key.endsWith("_length_inches"));
  const safeTotals = Object.entries(totals).filter(([key]) => !key.endsWith("_feet"));
  if (!Number.isSafeInteger(count) || [...safeCounts, ...safeTotals].some(([, v]) => !Number.isSafeInteger(v))
    || Object.values(totals).some(v => !Number.isFinite(v))) {
    c.issue("quantities", "reinforcement_numeric_range_invalid", "Scaled reinforcement quantities exceed the supported numeric range.");
  }
  if (c.issues.some(i => i.severity === "error")) return {
    ...base, status: c.missing ? "incomplete" : "invalid", issues: c.issues,
  };
  const omitted = count - c.geometry.length;
  if (omitted) c.issue("geometry", "reinforcement_geometry_truncated",
    `${omitted} steel primitives are omitted from this per-instance preview; complete quantities remain reported.`, "warning");
  return {
    ...base, status: "valid", issues: c.issues, perInstance: c.counts, totals,
    groups: c.groups, geometry: c.geometry, omittedGeometryCount: omitted, supports,
  };
}