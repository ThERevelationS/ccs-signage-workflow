import { staffEntities } from "@/components/staff/staffEntities";
import { copyProductIntoEstimate } from "@/components/estimator/products/clipboardService";
import { softDeleteEstimateFromLoadedSnapshot } from "@/components/estimator/estimatePersistence";

const isOpenDraft = (row) => row && (row.status || "draft") === "draft" && row.deleted !== true;

export const mergeableLines = (estimate) =>
  (estimate?.line_items || []).filter((line) => line?.builder_product_id);

// Other draft estimates that can be merged into the target, newest first.
export async function listMergeCandidateDrafts(targetId) {
  const rows = await staffEntities.AllInOneEstimate.filter({ status: "draft" }, "-updated_date", 100);
  return (rows || []).filter((row) => row.id !== targetId && isOpenDraft(row) && mergeableLines(row).length > 0);
}

// Copies the chosen products from `sourceId` into `targetId` one at a time, then
// optionally moves the source draft to Trash once every chosen product landed.
export async function mergeDraftSections({ targetId, sourceId, builderProductIds = [], trashSource = false, deletedBy = "unknown", onProgress }) {
  if (!targetId || !sourceId || targetId === sourceId) throw new Error("Pick a different draft to merge from.");
  if (!builderProductIds.length) throw new Error("Select at least one product to merge.");
  const [target, source] = await Promise.all([
    staffEntities.AllInOneEstimate.get(targetId),
    staffEntities.AllInOneEstimate.get(sourceId),
  ]);
  if (!isOpenDraft(target)) throw new Error("Only a draft estimate can receive merged products.");
  if (!isOpenDraft(source)) throw new Error("The source estimate is no longer an open draft. Reload and pick again.");
  const wanted = new Set(builderProductIds);
  const lines = mergeableLines(source).filter((line) => wanted.has(line.builder_product_id));
  if (lines.length !== wanted.size) throw new Error("Some selected products are no longer on the source draft. Reload and pick again.");

  const copied = [];
  for (const line of lines) {
    try {
      await copyProductIntoEstimate({ sourceEstimateId: sourceId, line, targetEstimateId: targetId });
    } catch (error) {
      const done = copied.length ? ` ${copied.length} product(s) were already merged: ${copied.join(", ")}.` : "";
      throw new Error(`${error?.message || "A product could not be merged."}${done} The source draft was left unchanged.`);
    }
    copied.push(line.client_product_name || line.project_name || "Product");
    onProgress?.(copied.length, lines.length);
  }

  let trashed = false;
  if (trashSource) {
    const latest = await staffEntities.AllInOneEstimate.get(sourceId);
    await softDeleteEstimateFromLoadedSnapshot({ entity: staffEntities.AllInOneEstimate, estimate: latest, deletedBy, label: "Merged source estimate" });
    trashed = true;
  }
  return { copied: copied.length, trashed };
}