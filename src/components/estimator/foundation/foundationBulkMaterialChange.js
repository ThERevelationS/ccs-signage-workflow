// O-094 (CMP-H03) — bulk material change. Swaps a catalog material id across
// the assembly rows WHERE THAT MATERIAL FIELD ACTUALLY LIVES — the target
// catalog below is the applicability map: a concrete mix can only reach
// selected_concrete_id slots, a cap material only cap_inventory_id, and so
// on. Unknown targets fail closed; there is no free-form field write.
//
// Pure: the source project is never mutated and no price field is authored.
// Output is a template-patch-shaped delta — merge as {...prev, ...patch};
// only arrays that actually changed are supplied (absent keys preserve), and
// each supplied array replaces its whole list, matching
// prepareFoundationTemplatePatch patch semantics.
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deepClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const cloneRow = (r) => {
  try {
    return deepClone(r);
  } catch {
    return isRecord(r) ? { ...r } : r;
  }
};

// Applicability catalog: material slot -> the row fields that hold that
// catalog id. items.selected_pole_id is the LEGACY item-level pole field
// (poleCalculator marks it advisory, not priced) — it still holds a pole
// material id, so a bulk pole swap rewrites it alongside poles[].pole_id.
// items.custom_concrete_cost_per_cy is a PRICE override, never a material id,
// and is deliberately excluded (its count is reported as an advisory so the
// caller can surface "custom price still applies" after a mix swap).
// project_concrete_type is a descriptive type string (e.g. "4000psi"), not a
// catalog id — not a bulk target.
export const FOUNDATION_BULK_MATERIAL_TARGETS = {
  concrete: {
    label: "Concrete mix",
    fields: { items: ["selected_concrete_id"] },
    project_field: "selected_concrete_id",
  },
  forming: {
    label: "Forming material",
    fields: { items: ["selected_forming_id"] },
  },
  wall_material: {
    label: "Wall material",
    fields: { walls: ["materialId"] },
  },
  internal_wall_material: {
    label: "Internal wall material",
    fields: { walls: ["internalMaterialId"] },
  },
  wall_cap: {
    label: "Wall cap material",
    fields: { wall_caps: ["cap_inventory_id"] },
  },
  pole: {
    label: "Pole material",
    fields: { poles: ["pole_id"], items: ["selected_pole_id"] },
  },
};

// Blank-equivalent current values: panels treat "", undefined, and null as
// "no selection", so all three normalize to "" for replace/fill matching.
const currentValue = (row, field) => {
  const v = row?.[field];
  return v === undefined || v === null ? "" : v;
};

// applyFoundationBulkMaterial(project, spec) -> { patch, summary }.
//   target   — a FOUNDATION_BULK_MATERIAL_TARGETS key (fail closed otherwise)
//   value    — the catalog material id to write; "" clears the selection
//   mode     — "all" (default): write every applicable slot in scope
//              "replace": only slots whose current value === from (from
//                         required, normalized like current values)
//              "fill_blank": only empty slots
//   include_project_default — targets with a project_field also update the
//              project-level default when it differs (default true); only
//              meaningful for "all"/"replace" intents — a project default
//              change accompanies any row write scope.
//   component_ids — optional row scope; only rows whose component_id is listed
//              are eligible (unknown ids are ignored, not errors: the set is a
//              filter, not a selection contract)
export function applyFoundationBulkMaterial(project, {
  target,
  value,
  mode = "all",
  from,
  include_project_default = true,
  component_ids,
} = {}) {
  if (!isRecord(project)) throw new Error("foundation bulk material: project must be a record");
  const spec = FOUNDATION_BULK_MATERIAL_TARGETS[target];
  if (!spec) {
    throw new Error(
      `foundation bulk material: unknown target ${JSON.stringify(target)} — valid targets: ${Object.keys(FOUNDATION_BULK_MATERIAL_TARGETS).join(", ")}`,
    );
  }
  if (typeof value !== "string") throw new Error("foundation bulk material: value must be a material id string (\"\" clears)");
  if (mode !== "all" && mode !== "replace" && mode !== "fill_blank") {
    throw new Error('foundation bulk material: mode must be "all", "replace", or "fill_blank"');
  }
  if (mode === "replace" && typeof from !== "string") {
    throw new Error('foundation bulk material: mode "replace" requires a from value (string; "" matches blanks)');
  }
  if (component_ids !== undefined && component_ids !== null && !Array.isArray(component_ids)) {
    throw new Error("foundation bulk material: component_ids must be an array when supplied");
  }
  const scope = Array.isArray(component_ids) ? new Set(component_ids) : null;
  const inScope = (row) => !scope || (typeof row?.component_id === "string" && scope.has(row.component_id));

  const shouldWrite = (current) => {
    if (mode === "all") return current !== value;
    if (mode === "replace") return current === from && current !== value;
    return current === "" && value !== ""; // fill_blank
  };

  const patch = {};
  const rowsChanged = {};
  const fieldsTouched = new Set();
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
        if (kind === "items" && r.custom_concrete_cost_per_cy !== undefined && r.custom_concrete_cost_per_cy !== null) {
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

  // The project-level default participates under the same mode rules — in
  // "replace" mode it moves only when it currently holds `from`, in
  // "fill_blank" only when blank. It is project state, not a row, so
  // component_ids scope does not apply to it.
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
      ...(mode === "replace" ? { from } : {}),
      rows_changed: rowsChanged,
      rows_total: Object.values(rowsChanged).reduce((a, n) => a + n, 0),
      project_default_changed: projectDefaultChanged,
      fields_touched: [...fieldsTouched],
      // Advisory: changed items carrying a per-item custom concrete price keep
      // it — the mix swap does not reprice the override.
      custom_price_rows_kept: customPriceRows,
    },
  };
}
