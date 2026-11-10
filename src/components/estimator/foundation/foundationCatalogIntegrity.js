import { foundationEquipmentCatalogIssues } from "./foundationEquipmentBindings";
import { foundationWallCapCatalogIssues } from "./wallCapCalculator";

export function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, label, code = "catalog_item_unavailable") => issues.push({
    kind: "foundation", index, componentId: item.component_id ?? null, field,
    inventoryId: id ?? null, code,
    message: `Foundation ${index + 1}: ${label} is unavailable.`,
  });
  const selected = id => id !== undefined && id !== null && id !== "";
  const check = (field, types, label) => {
    const id = item[field];
    if (!selected(id)) return;
    const row = inventory.find(record => record.id === id);
    // O-009 (CMP-A09) -- inactive vs deleted: a present row with
    // `show_in_foundation === false` is INACTIVE (a de-facto deactivation,
    // `catalog_item_inactive`) vs a missing row's `catalog_item_unavailable`
    // (the query-filtered-inactive-indistinguishable-from-deleted hole).
    if (row && row.show_in_foundation === false) {
      add(field, id, label, "catalog_item_inactive");
      return;
    }
    if (!row || !types.includes(row.material_type)) {
      add(field, id, label, row ? "catalog_item_type_mismatch" : "catalog_item_unavailable");
    }
  };
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "selected concrete catalog material");
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "selected forming catalog material");
  if (item.reinforcement_calculation_version != null && item.reinforcement_calculation_version !== 1) {
    if (item.reinforcement_calculation_version === 2 && item.include_rebar && item.reinforcement_material?.kind === "catalog") {
      const id = item.reinforcement_material.inventory_id;
      const matches = selected(id) ? inventory.filter(row => row.id === id) : [];
      if (matches.length !== 1 || matches[0].material_type !== "rebar") {
        add("reinforcement_material.inventory_id", id, "selected reinforcement catalog material",
          !selected(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable");
      }
    }
    return issues;
  }
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const size = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size || "#4";
    if (!inventory.some(row => row.material_type === "rebar" && row.rebar_size === size)) {
      add(field, null, `rebar catalog size ${size || "(not selected)"}`, size ? "catalog_item_unavailable" : "catalog_item_unassigned");
    }
  }
  return issues;
}

// Check catalog availability and the explicit wall-cap full-stock price basis.
export function foundationAssemblyCatalogIssues(project, inventory = []) {
  const available = new Set(inventory.map((row) => row.id));
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned = (typeof id === "string" && id.trim() !== "")
      || (typeof id === "number" && Number.isFinite(id));
    if (assigned && available.has(id)) return;
    issues.push({
      kind,
      index,
      componentId: row.component_id ?? row.id ?? null,
      field,
      inventoryId: assigned ? id : null,
      code: assigned ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `${label} ${index + 1}: ${assigned ? "selected catalog material is unavailable" : "select a catalog material"}.`,
    });
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  for (const [index, wall] of (project?.walls || []).entries()) {
    check(wall, index, "wall", "materialId", "Wall");
    if (wall.includeInternalWall) {
      check(wall, index, "internal_wall", "internalMaterialId", "Internal wall");
    }
  }
  return [
    ...issues,
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory),
  ];
}

// A missing snapshot is not evidence of a free material.
export function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}
