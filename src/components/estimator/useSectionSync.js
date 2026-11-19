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

// Mirrors the canonical not-found detection in builderEntityPersistence
// (isEntityNotFoundError): a genuinely-missing record is "already gone" while
// every other fetch failure stays an error so a caller never reports a
// section removed when it was not.
const isNotFound = (e) => {
  const status = Number(e?.status || e?.response?.status || e?.response?.statusCode || e?.data?.status || 0);
  if (status === 404) return true;
  const message = [
    e?.message,
    e?.response?.data?.message,
    e?.response?.data?.error,
    e?.data?.message,
    e?.data?.error,
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return message.includes("not found") || message.includes("does not exist");
};

// Owned sections are created by the estimate, so removing one removes its
// record. (O-014u note: this export had no callers at HEAD 37d401b5a and was
// a latent swallowed-delete defect — fixed rather than removed so the
// documented API stays available but can never fail silently.)
// Returns true when the record is deleted or already gone, false when the
// line is not an owned section (nothing to delete). Transient delete errors
// rethrow so the caller can surface or retry them.
export async function deleteOwnedSection(line) {
  const mod = getModule(line?.module_key);
  if (!line?.owned || !mod || !line.project_id) return false;
  try {
    await base44.entities[mod.entity].delete(line.project_id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  return true;
}