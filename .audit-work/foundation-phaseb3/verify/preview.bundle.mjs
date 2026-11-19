// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var foundationPositiveWholeNumber = (value) => {
  const number = foundationInputNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};
function foundationGeometryValidation(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  const count = record.quantity ?? 1;
  const quantity = foundationInputNumber(count);
  if (!foundationPositiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = foundationInputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity : Math.PI * radius * radius * depth / 27 * quantity;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  return { issues, type, quantity, dimensions };
}
function foundationItemGeometryIssues(item, index = 0) {
  return foundationGeometryValidation(item, index).issues;
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationLayoutModel.js
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
function layoutPositionInches(item) {
  if (!item || typeof item !== "object") return { valid: false, x_inches: 0, z_inches: 0 };
  const read = (v) => {
    if (v === void 0 || v === null) return 0;
    return finiteNumber(v);
  };
  const x = read(item.x_inches);
  const z = read(item.z_inches);
  if (x === null || z === null) return { valid: false, x_inches: 0, z_inches: 0 };
  return { valid: true, x_inches: x, z_inches: z };
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementModel.js
var MAX_GEOMETRY = 4096;
var MAX_SUPPORTS = 4096;
var SUPPORT_CAGE_TARGET = "cage";
var less = (a, b) => a < b - 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var emptyQuantities = () => ({
  horizontal_count: 0,
  horizontal_length_inches: 0,
  longitudinal_count: 0,
  longitudinal_length_inches: 0,
  hoop_count: 0,
  hoop_length_inches: 0,
  inter_mat_tie_count: 0,
  inter_mat_tie_length_inches: 0,
  mat_crossings: 0,
  hoop_bar_crossings: 0,
  tie_ends: 0
});
function modelContext(item, design, geometryLimit) {
  const issues = [], groups = [], geometry = [], ids = /* @__PURE__ */ new Set();
  const counts = emptyQuantities();
  let missing = false;
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const required = (field, message) => {
    missing = true;
    issue(field, "reinforcement_input_required", message);
  };
  const number = (value, field, { zero = false, integer = false } = {}) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit value is required.");
      return null;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || (zero ? value < 0 : value <= 0) || integer && !Number.isSafeInteger(value)) {
      issue(field, "reinforcement_number_invalid", `Use a finite ${zero ? "nonnegative" : "positive"}${integer ? " whole" : ""} number.`);
      return null;
    }
    return value;
  };
  const list = (value, field, limit, allowEmpty = true) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit list is required.");
      return [];
    }
    if (!Array.isArray(value) || value.length > limit || !allowEmpty && !value.length) {
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
    item,
    design,
    issues,
    groups,
    geometry,
    counts,
    issue,
    required,
    number,
    list,
    identity,
    bounds,
    group,
    supportContext: null,
    get missing() {
      return missing;
    }
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
  const mats = /* @__PURE__ */ new Map();
  const rawMats = list(design.spread?.mats, "spread.mats", 256, false);
  rawMats.forEach((mat, index) => {
    const field = `spread.mats.${index}`;
    const id = identity(mat?.id, `${field}.id`);
    const bearing = number(mat?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number(mat?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number(mat?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
    if ([id, bearing, sx, sz].some((v) => v === null)) return;
    if (!bounds(bearing, covers.bottom, depth - covers.top - 2 * diameter, field)) return;
    const nx = xSpan <= 0 ? 1 : Math.ceil(xSpan / sx) + 1;
    const nz = zSpan <= 0 ? 1 : Math.ceil(zSpan / sz) + 1;
    const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
    group(`${id}/x`, "horizontal", nz, length - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: covers.side, y: bearing + radius, z: at(nz, i, zSpan) },
      to: { x: length - covers.side, y: bearing + radius, z: at(nz, i, zSpan) }
    }));
    group(`${id}/z`, "horizontal", nx, width - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: covers.side },
      to: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: width - covers.side }
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
    const length2 = number(tie?.cut_length_inches, `${field}.cut_length_inches`);
    if (!from || !to || from.id === to.id) {
      issue(field, "reinforcement_tie_parent_invalid", "Tie endpoints require two distinct existing mats.");
      return;
    }
    if ([id, x, z, length2].some((v) => v === null)) return;
    if (!bounds(x, edge, dimensions.length - edge, `${field}.x_inches`) || !bounds(z, edge, width - edge, `${field}.z_inches`)) return;
    const distance = Math.abs(to.bearing - from.bearing);
    if (less(length2, distance)) {
      issue(`${field}.cut_length_inches`, "reinforcement_tie_length_invalid", "Cut length is shorter than the mat-to-mat path.");
      return;
    }
    group(id, "inter_mat_tie", 1, length2, () => ({
      kind: "tie_reference",
      diameter_inches: diameter,
      from: { x, y: from.bearing + radius, z },
      to: { x, y: to.bearing + radius, z }
    }));
    counts.tie_ends += 2;
  });
  if (counts.inter_mat_tie_count) issue(
    "spread.inter_mat_ties",
    "reinforcement_tie_path_only",
    "Tie paths are references; authored cut lengths include any hook/bend allowance and require engineering/fabrication review.",
    "warning"
  );
}
function supportTargets(c) {
  const sc = c.supportContext;
  if (!sc) return [];
  if (sc.kind === "pillar") {
    if (!sc.cage) return [];
    return [{
      target_id: SUPPORT_CAGE_TARGET,
      mat_id: null,
      base: "concrete_bottom",
      base_elevation_inches: 0,
      required_height_inches: sc.cage.bottom_end_inches,
      footprint: { kind: "pillar", center_inches: sc.center }
    }];
  }
  return sc.mats.map((mat, index) => {
    const lower = index ? sc.mats[index - 1] : null;
    const baseElevation = lower ? lower.bearing + 2 * sc.diameter : 0;
    return {
      target_id: mat.id,
      mat_id: mat.id,
      base: lower ? "mat_below" : "concrete_bottom",
      base_elevation_inches: baseElevation,
      required_height_inches: mat.bearing - baseElevation,
      footprint: {
        kind: "spread",
        edge_inches: sc.edge,
        x_span_inches: sc.xSpan,
        z_span_inches: sc.zSpan,
        length_inches: sc.dimensions.length,
        width_inches: sc.dimensions.width
      }
    };
  });
}
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
    status: "unconfigured",
    mode,
    count: null,
    requirements: [],
    uncovered: [],
    placements: [],
    context: null
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
  result.context = sc.kind === "pillar" ? { kind: "pillar", center_inches: sc.center, depth_inches: sc.dimensions.depth, diameter_inches: sc.diameter } : {
    kind: "spread",
    edge_inches: sc.edge,
    length_inches: sc.dimensions.length,
    width_inches: sc.dimensions.width,
    depth_inches: sc.dimensions.depth,
    diameter_inches: sc.diameter
  };
  const coverage = /* @__PURE__ */ new Map();
  const labelOf = (target) => target.mat_id ? `Mat ${target.mat_id}` : "The pillar cage";
  if (mode === "auto") {
    if (sc.kind === "pillar") {
      c.issue(
        "supports.mode",
        "reinforcement_support_mode_unavailable",
        "Auto support placement is unavailable for pillar cages; place manual supports or explain off."
      );
      return result;
    }
    const spacing = c.number(config?.spacing_inches, "supports.spacing_inches");
    if (spacing === null) return result;
    for (const target of targets) {
      coverage.set(target.target_id, { positions: supportGridPositions(target.footprint, spacing) });
    }
  } else {
    const optList = (value, field, limit) => {
      if (value === void 0 || value === null) return [];
      if (!Array.isArray(value) || value.length > limit) {
        c.issue(field, "reinforcement_list_invalid", `Use up to ${limit} records.`);
        return [];
      }
      return value;
    };
    const targetFor = (ref, field) => {
      const cageRef = ref === void 0 || ref === null || ref === "" || ref === SUPPORT_CAGE_TARGET;
      const target = cageRef ? sc.kind === "pillar" ? targets[0] : null : targets.find((record) => record.target_id === ref);
      if (!target) {
        c.issue(
          field,
          "reinforcement_support_target_invalid",
          "Support coverage requires an existing spread mat or the pillar cage."
        );
      }
      return target;
    };
    optList(config?.mats, "supports.mats", 256).forEach((entry, index) => {
      const field = `supports.mats.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const count = c.number(entry?.count, `${field}.count`, { zero: true, integer: true });
      if (!target || count === null) return;
      const cov = coverage.get(target.target_id) || {};
      if (cov.positions || cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
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
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the concrete footprint."
          );
          return;
        }
      } else {
        const footprint = target.footprint;
        if (less(x, footprint.edge_inches) || less(footprint.length_inches - footprint.edge_inches, x) || less(z, footprint.edge_inches) || less(footprint.width_inches - footprint.edge_inches, z)) {
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the supported mat footprint."
          );
          return;
        }
      }
      const cov = coverage.get(target.target_id) || {};
      if (cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
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
    if (positions === void 0 && cov.count !== void 0) {
      positions = supportCountPositions(target.footprint, cov.count);
    }
    positions ||= [];
    const needed = target.required_height_inches > 0;
    if (!needed) {
      if (positions.length && mode === "manual") {
        c.issue(
          "supports",
          "reinforcement_support_height_infeasible",
          `${labelOf(target)} bears directly on its base plane; authored supports cannot fit under it.`
        );
      } else {
        c.issue(
          "supports",
          "reinforcement_support_unneeded",
          `${labelOf(target)} bears directly on its base plane; no support device is required for it.`,
          "warning"
        );
      }
      continue;
    }
    if (!positions.length) {
      c.issue(
        "supports",
        "reinforcement_support_mat_unsupported",
        `${labelOf(target)} has no modeled supports; verify how it is held before build.`,
        "warning"
      );
      result.uncovered.push({ target_id: target.target_id, mat_id: target.mat_id });
      continue;
    }
    total += positions.length;
    if (total > MAX_SUPPORTS) {
      c.issue(
        "supports",
        "reinforcement_numeric_range_invalid",
        "Modeled support positions exceed the supported numeric range."
      );
      return result;
    }
    result.requirements.push({ ...target, count: positions.length, positions });
    for (const position of positions) {
      result.placements.push({
        target_id: target.target_id,
        mat_id: target.mat_id,
        x: position.x,
        z: position.z,
        base: target.base,
        base_elevation_inches: target.base_elevation_inches,
        required_height_inches: target.required_height_inches
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
    if (![r, bottom, top].some((v) => v === null)) {
      bounds(r, 0, outer - radius, "pillar.longitudinal.radius_inches");
      bounds(bottom, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.bottom_end_inches");
      bounds(top, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.top_end_inches");
      if (top <= bottom) issue("pillar.longitudinal", "reinforcement_length_invalid", "Longitudinal bar ends require a positive cut length.");
      if (n > 1 && less(2 * r * Math.sin(Math.PI / n), diameter)) {
        issue("pillar.longitudinal", "reinforcement_bar_overlap", "Longitudinal bars overlap on the authored radius.");
      }
      group("pillar/longitudinal", "longitudinal", n, top - bottom, (i) => {
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
    if ([id, y, d, allowance].some((v) => v === null)) return;
    const r = d / 2;
    if (less(d, diameter)) issue(
      `${field}.centerline_diameter_inches`,
      "reinforcement_hoop_self_overlap",
      "Hoop centerline diameter is smaller than the bar diameter."
    );
    bounds(y, covers.bottom + radius, dimensions.depth - covers.top - radius, `${field}.center_y_inches`);
    bounds(r, 0, outer - radius, `${field}.centerline_diameter_inches`);
    for (const other of hoops) {
      if (less(Math.hypot(other.y - y, other.r - r), diameter)) {
        issue(field, "reinforcement_hoop_overlap", "Hoop envelopes overlap.");
      }
    }
    hoops.push({ y, r });
    group(id, "hoop", 1, Math.PI * d + allowance, () => ({
      kind: "hoop",
      center: { x: center, y, z: center },
      centerline_radius_inches: r,
      diameter_inches: diameter,
      cut_allowance_inches: allowance
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
  if (hoops.length) issue(
    "pillar.hoops",
    "reinforcement_hoop_allowance_authored",
    "Hoop cut allowance is authored explicitly; hooks, laps and structural adequacy require review.",
    "warning"
  );
  c.supportContext = {
    kind: "pillar",
    center,
    outer,
    diameter,
    covers,
    dimensions,
    cage: long ? { bottom_end_inches: long.bottom } : null
  };
}
function quantityTotals(counts, quantity) {
  const totals = {};
  for (const [key, value] of Object.entries(counts)) {
    const length = key.endsWith("_length_inches");
    totals[length ? key.replace("_length_inches", "_feet") : key] = (length ? value / 12 : value) * quantity;
  }
  totals.total_steel_feet = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + totals[`${role}_feet`], 0);
  return totals;
}
function calculateFoundationReinforcementModel(item = {}, design, options = {}) {
  item = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const geometryLimit = options?.geometryLimit ?? MAX_GEOMETRY;
  const base = {
    version: 2,
    componentId: item.component_id ?? null,
    instanceCount: null,
    engineeringApproved: false,
    status: "invalid",
    issues: [],
    perInstance: null,
    totals: null,
    groups: [],
    geometry: [],
    omittedGeometryCount: 0,
    supports: { status: "unconfigured", mode: "unconfigured", count: null, requirements: [], uncovered: [], placements: [], context: null }
  };
  const foundationIssues = foundationItemGeometryIssues({ ...item, include_rebar: false });
  if (foundationIssues.length) return {
    ...base,
    issues: foundationIssues.map(({ field, code, message }) => ({ field, code, message, severity: "error" }))
  };
  const quantity = Number(item.quantity ?? 1);
  base.instanceCount = quantity;
  if (!item.include_rebar) return {
    ...base,
    status: "off",
    perInstance: emptyQuantities(),
    totals: quantityTotals(emptyQuantities(), quantity),
    supports: { status: "not_required", mode: null, count: 0, requirements: [], uncovered: [], placements: [], context: null }
  };
  const c = modelContext(item, design ?? {}, geometryLimit);
  if (!Number.isSafeInteger(geometryLimit) || geometryLimit < 0 || geometryLimit > MAX_GEOMETRY) {
    c.issue("geometryLimit", "reinforcement_geometry_budget_invalid", `Geometry budget must be a whole number from zero to ${MAX_GEOMETRY}.`);
  }
  if (design?.version !== 2) {
    if (design?.version === void 0 || design?.version === null) c.required("version", "An explicit version-2 reinforcement design is required.");
    else c.issue("version", "reinforcement_version_invalid", "This model accepts only version 2.");
  }
  const diameter = c.number(design?.bar_diameter_inches, "bar_diameter_inches");
  const covers = Object.fromEntries(["side", "top", "bottom"].map((key) => [
    key,
    c.number(design?.cover_inches?.[key], `cover_inches.${key}`, { zero: true })
  ]));
  if (!c.issues.some((i) => i.severity === "error")) {
    const dimensions = {
      length: Number(item.length_inches),
      width: Number(item.width_inches),
      depth: Number(item.depth_inches),
      diameter: Number(item.diameter)
    };
    if (item.foundation_type === "spread_foot") spreadSteel(c, dimensions, covers, diameter);
    else pillarSteel(c, dimensions, covers, diameter);
  }
  const supports = supportsPlan(c);
  const totals = quantityTotals(c.counts, quantity);
  const count = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + c.counts[`${role}_count`], 0);
  if (!c.issues.some((i) => i.severity === "error") && !count) {
    c.issue("design", "reinforcement_empty_design", "Enabled reinforcement requires steel geometry; otherwise turn rebar off explicitly.");
  }
  const safeCounts = Object.entries(c.counts).filter(([key]) => !key.endsWith("_length_inches"));
  const safeTotals = Object.entries(totals).filter(([key]) => !key.endsWith("_feet"));
  if (!Number.isSafeInteger(count) || [...safeCounts, ...safeTotals].some(([, v]) => !Number.isSafeInteger(v)) || Object.values(totals).some((v) => !Number.isFinite(v))) {
    c.issue("quantities", "reinforcement_numeric_range_invalid", "Scaled reinforcement quantities exceed the supported numeric range.");
  }
  if (c.issues.some((i) => i.severity === "error")) return {
    ...base,
    status: c.missing ? "incomplete" : "invalid",
    issues: c.issues
  };
  const omitted = count - c.geometry.length;
  if (omitted) c.issue(
    "geometry",
    "reinforcement_geometry_truncated",
    `${omitted} steel primitives are omitted from this per-instance preview; complete quantities remain reported.`,
    "warning"
  );
  return {
    ...base,
    status: "valid",
    issues: c.issues,
    perInstance: c.counts,
    totals,
    groups: c.groups,
    geometry: c.geometry,
    omittedGeometryCount: omitted,
    supports
  };
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementPreview3D.js
var FOUNDATION_3D_PREVIEW_LIMITS = Object.freeze({ instances: 64, steelPrimitives: 2048, supportMarkers: 1024 });
var IN = 1 / 12;
var renderable = (number) => Number.isFinite(number) && Number.isFinite(Math.fround(number));
var positive = (number) => renderable(number) && number > 0 && Math.fround(number) > 0;
var point = (value) => value && ["x", "y", "z"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
var localPoint = (length, depth, width) => (value) => [(value.x - length / 2) * IN, (value.y - depth / 2) * IN, (value.z - width / 2) * IN];
function steelPrimitive(primitive, length, depth, width) {
  const local = localPoint(length, depth, width);
  const radiusFeet = primitive.diameter_inches / 24;
  if (!positive(radiusFeet)) return null;
  const base = { id: primitive.id, role: primitive.role, kind: primitive.kind, radiusFeet };
  if (primitive.kind === "segment" || primitive.kind === "tie_reference") {
    if (!point(primitive.from) || !point(primitive.to)) return null;
    const from = local(primitive.from), to = local(primitive.to);
    const lengthFeet = Math.hypot(...to.map((value, index) => value - from[index]));
    if (![...from, ...to].every(renderable) || !positive(lengthFeet)) return null;
    return { ...base, from, to, lengthFeet };
  }
  if (primitive.kind === "hoop" && point(primitive.center)) {
    const center = local(primitive.center), centerlineRadiusFeet = primitive.centerline_radius_inches * IN;
    if (!center.every(renderable) || !positive(centerlineRadiusFeet)) return null;
    return { ...base, center, centerlineRadiusFeet, allowanceNotDrawn: primitive.cut_allowance_inches > 0 };
  }
  return null;
}
function supportPrimitive(placement, ordinal, local) {
  if (!positive(placement?.required_height_inches)) return null;
  const x = foundationInputNumber(placement.x), z = foundationInputNumber(placement.z);
  const base = foundationInputNumber(placement.base_elevation_inches);
  if (x === null || z === null || base === null || base < 0) return null;
  const from = local({ x, y: base, z }), to = local({ x, y: base + placement.required_height_inches, z });
  const lengthFeet = Math.hypot(...to.map((value, index) => value - from[index]));
  if (![...from, ...to].every(renderable) || !positive(lengthFeet)) return null;
  return {
    id: `support:${placement.target_id ?? "mat"}:${ordinal}`,
    role: "support",
    kind: "segment",
    radiusFeet: 0.5 / 24,
    from,
    to,
    lengthFeet,
    target: placement.target_id ?? null,
    matId: placement.mat_id ?? null,
    base: placement.base ?? null,
    requiredHeightInches: placement.required_height_inches,
    nominalMarker: true
  };
}
function buildFoundationReinforcementPreview3D(project = {}, { showReinforcement = true, placementMode = "inspection" } = {}) {
  const instances = [], issues = [];
  let cursorX = 0, steelCount = 0, clipped = false, hasVersioned = false;
  const add = (index, message, severity = "warning") => issues.push({ index, message: `Foundation ${index + 1}: ${message}`, severity });
  if (placementMode !== "inspection" && placementMode !== "layout") return {
    instances,
    issues: [{ index: null, message: "Foundation placement mode is unsupported.", severity: "error" }],
    clipped: false,
    hasVersioned: false,
    steelCount,
    engineeringApproved: false,
    placementMode: null
  };
  if (!Array.isArray(project?.items)) return {
    instances,
    issues: [{ index: null, message: "Foundation items are unavailable for this preview.", severity: "error" }],
    clipped: false,
    hasVersioned: false,
    steelCount,
    engineeringApproved: false,
    placementMode
  };
  project.items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      add(index, "definition is not a record.", "error");
      return;
    }
    const geometry = foundationGeometryValidation(item, index);
    const version = item.reinforcement_calculation_version;
    const versioned = version != null && version !== 1;
    hasVersioned ||= versioned;
    if (instances.length >= FOUNDATION_3D_PREVIEW_LIMITS.instances) {
      clipped = true;
      return;
    }
    if (geometry.issues.length) {
      geometry.issues.forEach((issue) => add(index, issue.message, "error"));
      return;
    }
    const offset = foundationInputNumber(item.grade_offset_inches ?? 0);
    const rotation = foundationInputNumber(item.rotation_degrees ?? 0);
    if (offset === null || rotation === null) {
      add(index, "grade offset or rotation is not a finite decimal.", "error");
      return;
    }
    const length = Number(item.foundation_type === "pillar" ? item.diameter : item.length_inches);
    const width = Number(item.foundation_type === "pillar" ? item.diameter : item.width_inches);
    const depth = Number(item.depth_inches);
    const dimensionsFeet = [length * IN, depth * IN, width * IN];
    if (!dimensionsFeet.every(positive) || !renderable(offset * IN)) {
      add(index, "dimensions exceed the 3D numeric range.", "error");
      return;
    }
    let report = null, steel = [], supports = [];
    if (versioned) {
      if (version !== 2) add(index, "reinforcement calculation version is unsupported; no legacy steel is substituted.", "error");
      else if (item.include_rebar != null && typeof item.include_rebar !== "boolean") add(index, "reinforcement on/off selection is invalid.", "error");
      else {
        report = calculateFoundationReinforcementModel(item, item.reinforcement_design, { geometryLimit: FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives });
        report.issues.forEach((issue) => add(index, issue.message, issue.severity));
        if (report.status === "valid" && showReinforcement) {
          steel = report.geometry.map((primitive) => steelPrimitive(primitive, length, depth, width));
          if (steel.some((primitive) => primitive === null)) {
            add(index, "some steel geometry exceeds the 3D numeric range.", "error");
            clipped = true;
          }
          steel = steel.filter(Boolean);
          clipped ||= report.omittedGeometryCount > 0;
          const local = localPoint(length, depth, width);
          const placements = Array.isArray(report.supports?.placements) ? report.supports.placements : [];
          supports = placements.map((placement, ordinal) => supportPrimitive(placement, ordinal, local));
          if (supports.some((primitive) => primitive === null)) {
            add(index, "some support markers exceed the 3D numeric range.", "error");
            clipped = true;
          }
          supports = supports.filter(Boolean).slice(0, FOUNDATION_3D_PREVIEW_LIMITS.supportMarkers);
          clipped ||= supports.length < placements.length;
        }
      }
    }
    if (placementMode === "layout") {
      const pos = layoutPositionInches(item);
      if (!pos.valid) {
        add(index, "saved placement coordinates are invalid; item is skipped rather than mapped to zero.", "error");
        return;
      }
      const positionFeet = [
        pos.x_inches * IN + dimensionsFeet[0] / 2,
        -dimensionsFeet[1] / 2 + offset * IN,
        pos.z_inches * IN + dimensionsFeet[2] / 2
      ];
      if (!positionFeet.every(renderable)) {
        add(index, "saved placement position exceeds the 3D numeric range.", "error");
        return;
      }
      if (geometry.quantity > 1) add(index, "quantity greater than one has additional locations that are not recorded; one representative is shown.");
      const drawn = steel.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount));
      clipped ||= drawn.length < steel.length;
      steelCount += drawn.length;
      const drawnSupports = supports.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount));
      clipped ||= drawnSupports.length < supports.length;
      steelCount += drawnSupports.length;
      instances.push({
        index,
        instanceIndex: 0,
        type: item.foundation_type,
        dimensionsFeet,
        positionFeet,
        rotationRadians: -(rotation % 360 * Math.PI) / 180,
        steel: drawn,
        supports: drawnSupports,
        reinforcementStatus: report?.status ?? (versioned ? "invalid" : "legacy"),
        versioned,
        engineeringApproved: false
      });
      return;
    }
    const shown = Math.min(geometry.quantity, FOUNDATION_3D_PREVIEW_LIMITS.instances - instances.length);
    clipped ||= shown < geometry.quantity;
    const footprint = Math.max(dimensionsFeet[0], dimensionsFeet[2]);
    for (let instanceIndex = 0; instanceIndex < shown; instanceIndex += 1) {
      const positionFeet = [cursorX + footprint / 2, -dimensionsFeet[1] / 2 + offset * IN, 0];
      if (!positionFeet.every(renderable)) {
        add(index, "inspection position exceeds the 3D numeric range.", "error");
        clipped = true;
        break;
      }
      const drawn = steel.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount));
      clipped ||= drawn.length < steel.length;
      steelCount += drawn.length;
      const drawnSupports = supports.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount));
      clipped ||= drawnSupports.length < supports.length;
      steelCount += drawnSupports.length;
      instances.push({
        index,
        instanceIndex,
        type: item.foundation_type,
        dimensionsFeet,
        positionFeet,
        rotationRadians: rotation % 360 * Math.PI / 180,
        steel: drawn,
        supports: drawnSupports,
        reinforcementStatus: report?.status ?? (versioned ? "invalid" : "legacy"),
        versioned,
        engineeringApproved: false
      });
      cursorX += footprint + 2;
    }
  });
  return { instances, issues, clipped, hasVersioned, steelCount, engineeringApproved: false, placementMode };
}
export {
  FOUNDATION_3D_PREVIEW_LIMITS,
  buildFoundationReinforcementPreview3D
};
