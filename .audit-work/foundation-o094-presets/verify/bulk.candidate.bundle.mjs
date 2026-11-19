// .audit-work/foundation-o094-presets/candidates/src/components/estimator/foundation/foundationBulkMaterialChange.js
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRow = (r) => {
  try {
    return deepClone(r);
  } catch {
    return isRecord(r) ? { ...r } : r;
  }
};
var FOUNDATION_BULK_MATERIAL_TARGETS = {
  concrete: {
    label: "Concrete mix",
    fields: { items: ["selected_concrete_id"] },
    project_field: "selected_concrete_id"
  },
  forming: {
    label: "Forming material",
    fields: { items: ["selected_forming_id"] }
  },
  wall_material: {
    label: "Wall material",
    fields: { walls: ["materialId"] }
  },
  internal_wall_material: {
    label: "Internal wall material",
    fields: { walls: ["internalMaterialId"] }
  },
  wall_cap: {
    label: "Wall cap material",
    fields: { wall_caps: ["cap_inventory_id"] }
  },
  pole: {
    label: "Pole material",
    fields: { poles: ["pole_id"], items: ["selected_pole_id"] }
  }
};
var currentValue = (row, field) => {
  const v = row?.[field];
  return v === void 0 || v === null ? "" : v;
};
function applyFoundationBulkMaterial(project, {
  target,
  value,
  mode = "all",
  from,
  include_project_default = true,
  component_ids
} = {}) {
  if (!isRecord(project)) throw new Error("foundation bulk material: project must be a record");
  const spec = FOUNDATION_BULK_MATERIAL_TARGETS[target];
  if (!spec) {
    throw new Error(
      `foundation bulk material: unknown target ${JSON.stringify(target)} \u2014 valid targets: ${Object.keys(FOUNDATION_BULK_MATERIAL_TARGETS).join(", ")}`
    );
  }
  if (typeof value !== "string") throw new Error('foundation bulk material: value must be a material id string ("" clears)');
  if (mode !== "all" && mode !== "replace" && mode !== "fill_blank") {
    throw new Error('foundation bulk material: mode must be "all", "replace", or "fill_blank"');
  }
  if (mode === "replace" && typeof from !== "string") {
    throw new Error('foundation bulk material: mode "replace" requires a from value (string; "" matches blanks)');
  }
  if (component_ids !== void 0 && component_ids !== null && !Array.isArray(component_ids)) {
    throw new Error("foundation bulk material: component_ids must be an array when supplied");
  }
  const scope = Array.isArray(component_ids) ? new Set(component_ids) : null;
  const inScope = (row) => !scope || typeof row?.component_id === "string" && scope.has(row.component_id);
  const shouldWrite = (current) => {
    if (mode === "all") return current !== value;
    if (mode === "replace") return current === from && current !== value;
    return current === "" && value !== "";
  };
  const patch = {};
  const rowsChanged = {};
  const fieldsTouched = /* @__PURE__ */ new Set();
  let customPriceRows = 0;
  for (const [kind, fields] of Object.entries(spec.fields)) {
    const rows = project[kind];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    let changed = 0;
    const next = rows.map((r) => {
      if (!isRecord(r) || !inScope(r)) return cloneRow(r);
      let edited = null;
      for (const f of fields) {
        const cur = currentValue(r, f);
        if (shouldWrite(cur)) {
          if (!edited) edited = cloneRow(r);
          edited[f] = value;
          fieldsTouched.add(`${kind}.${f}`);
        }
      }
      if (edited) {
        changed += 1;
        if (kind === "items" && r.custom_concrete_cost_per_cy !== void 0 && r.custom_concrete_cost_per_cy !== null) {
          customPriceRows += 1;
        }
        return edited;
      }
      return cloneRow(r);
    });
    if (changed > 0) {
      patch[kind] = next;
      rowsChanged[kind] = changed;
    }
  }
  let projectDefaultChanged = false;
  if (spec.project_field && include_project_default !== false) {
    const normalized = currentValue(project, spec.project_field);
    if (shouldWrite(normalized)) {
      patch[spec.project_field] = value;
      projectDefaultChanged = true;
      fieldsTouched.add(`project.${spec.project_field}`);
    }
  }
  return {
    patch,
    summary: {
      operation: "bulk_material",
      target,
      label: spec.label,
      value,
      mode,
      ...mode === "replace" ? { from } : {},
      rows_changed: rowsChanged,
      rows_total: Object.values(rowsChanged).reduce((a, n) => a + n, 0),
      project_default_changed: projectDefaultChanged,
      fields_touched: [...fieldsTouched],
      // Advisory: changed items carrying a per-item custom concrete price keep
      // it — the mix swap does not reprice the override.
      custom_price_rows_kept: customPriceRows
    }
  };
}
export {
  FOUNDATION_BULK_MATERIAL_TARGETS,
  applyFoundationBulkMaterial
};
