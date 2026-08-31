import { base44 } from "@/api/base44Client";
import { getModule } from "./moduleRegistry";
import { sourceProjectTotal } from "./builder/builderService";

// Re-reads source sub-estimates for comparison WITHOUT overwriting the accepted
// estimate price. `total_snapshot` is the frozen/accepted cost; current source
// math lives in `live_total_snapshot` until the user explicitly accepts Update Price.
export async function refreshSectionSnapshots(lineItems) {
  const lines = lineItems || [];
  const refreshed = await Promise.all(
    lines.map(async (line) => {
      const mod = getModule(line.module_key);
      if (!mod || !line.project_id) return line;

      const record = await base44.entities[mod.entity].get(line.project_id).catch(() => null);
      if (!record) return line;

      const liveTotal = sourceProjectTotal(line, record);
      const frozenTotal = Number(line.total_snapshot || 0);
      const changed = Math.abs(liveTotal - frozenTotal) > 0.005;
      const keepLegacyState = line.price_state === "legacy_frozen";

      return {
        ...line,
        project_name: record.project_name || line.project_name,
        live_total_snapshot: liveTotal,
        price_state: keepLegacyState ? "legacy_frozen" : changed ? "changed" : "current",
        last_price_check_at: new Date().toISOString(),
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