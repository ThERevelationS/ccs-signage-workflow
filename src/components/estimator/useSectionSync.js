import { base44 } from "@/api/base44Client";
import { getModule } from "./moduleRegistry";
import { sourceProjectTotal } from "./builder/builderService";
import { liveCustomerUnitPrice, sourceProjectEconomics } from "./customerPricing";

// Re-reads source sub-estimates for compatibility. Builder-backed Products have
// already been reconciled by ensureEstimateBuilderProducts(), which is the single
// authoritative Product/Part pricing path; do not overwrite those live snapshots
// here with a second, less-complete calculation.
export async function refreshSectionSnapshots(lineItems) {
  const lines = lineItems || [];
  const refreshed = await Promise.all(
    lines.map(async (line) => {
      const mod = getModule(line.module_key);
      if (!mod || !line.project_id) return line;

      const record = await base44.entities[mod.entity].get(line.project_id).catch(() => null);
      if (!record) return line;

      if (line.builder_product_id) {
        return {
          ...line,
          project_name: record.project_name || line.project_name,
          updated_date_snapshot: record.updated_date,
        };
      }

      const sourceTotal = sourceProjectTotal(line, record);
      const frozenTotal = Number(line.total_snapshot || 0);
      const keepLegacyState = line.price_state === "legacy_frozen";
      const economics = keepLegacyState
        ? { internalCost: sourceTotal, customerPrice: liveCustomerUnitPrice(line) }
        : sourceProjectEconomics(line.module_key, record, sourceTotal);
      const liveTotal = economics.internalCost;
      const changed = Math.abs(liveTotal - frozenTotal) > 0.005;
      const hasDetachedParts = Number(line.detached_part_count || 0) > 0 || line.needs_reattach_review;

      return {
        ...line,
        project_name: record.project_name || line.project_name,
        live_total_snapshot: liveTotal,
        live_customer_price_snapshot: economics.customerPrice,
        price_state: hasDetachedParts
          ? "detached_parts"
          : keepLegacyState
            ? "legacy_frozen"
            : changed
              ? "changed"
              : "current",
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