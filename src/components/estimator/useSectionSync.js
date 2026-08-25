import { base44 } from "@/api/base44Client";
import { getModule, MODULE_TOTAL_FIELD } from "./moduleRegistry";

// Re-reads every section's source sub-estimate and returns refreshed line items
// (total + name), so an estimate always opens with current section pricing.
export async function refreshSectionSnapshots(lineItems) {
  const lines = lineItems || [];
  const refreshed = await Promise.all(
    lines.map(async (line) => {
      const mod = getModule(line.module_key);
      const totalField = MODULE_TOTAL_FIELD[line.module_key];
      if (!mod || !totalField || !line.project_id) return line;

      const record = await base44.entities[mod.entity].get(line.project_id).catch(() => null);
      if (!record) return line;

      return {
        ...line,
        project_name: record.project_name || line.project_name,
        total_snapshot: Number(record[totalField] || 0),
        updated_date_snapshot: record.updated_date,
      };
    })
  );
  return refreshed;
}

// Owned sections are created by the estimate, so removing one removes its record.
export async function deleteOwnedSection(line) {
  const mod = getModule(line?.module_key);
  if (!line?.owned || !mod || !line.project_id) return;
  await base44.entities[mod.entity].delete(line.project_id).catch(() => null);
}