import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { buildGlLookup } from "./glExport";

// One catalog fetch → name → GL-code map, shared by every GL-coded export
// surface (Ops Reports, Reconciliation). Each source read degrades to an
// empty list on denial/failure so a missing catalog never blocks the export —
// affected rows simply export unmapped and are counted for the operator.
export async function loadGlLookup() {
  const [markupCategories, inventoryItems, partTemplates] = await Promise.all([
    loadAllEntityRows({
      entity: staffEntities.MarkupCategory,
      sort: "sort_order",
      label: "GL markup categories",
      cacheTtlMs: 30000,
    }).catch(() => []),
    loadAllEntityRows({
      entity: staffEntities.Inventory,
      sort: "material_type",
      label: "GL inventory items",
      cacheTtlMs: 30000,
    }).catch(() => []),
    loadAllEntityRows({
      entity: staffEntities.PartTemplate,
      sort: "template_name",
      label: "GL part templates",
      cacheTtlMs: 30000,
    }).catch(() => []),
  ]);
  return buildGlLookup({ markupCategories, inventoryItems, partTemplates });
}
