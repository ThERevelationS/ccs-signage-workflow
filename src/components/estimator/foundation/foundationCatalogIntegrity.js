// Availability only: this does not validate rates, geometry, or engineering.
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
  for (const [index, cap] of (project?.wall_caps || []).entries()) {
    check(cap, index, "wall_cap", "cap_inventory_id", "Wall cap");
  }
  for (const [index, wall] of (project?.walls || []).entries()) {
    check(wall, index, "wall", "materialId", "Wall");
    if (wall.includeInternalWall) {
      check(wall, index, "internal_wall", "internalMaterialId", "Internal wall");
    }
  }
  return issues;
}

// A missing snapshot is not evidence of a free material.
export function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}
