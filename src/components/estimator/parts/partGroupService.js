import { base44 } from "@/api/base44Client";
import { makeStableId } from "@/components/estimator/builder/builderService";
import { stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

async function nextRevisionNumber(builderProductId) {
  const rows = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []);
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

async function patchEstimateLine(builder, patch) {
  if (!builder?.estimate_id) return;
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id).catch(() => null);
  if (!estimate) return;
  const lineItems = (estimate.line_items || []).map((line) =>
    line.builder_product_id === builder.id ? { ...line, ...patch } : line
  );
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
}

export async function clonePartGroupInProduct({ builderProductId, groupId }) {
  if (!builderProductId || !groupId) throw new Error("Part Group is required.");
  const [builder, group, allParts, allGroups] = await Promise.all([
    base44.entities.BuilderProduct.get(builderProductId),
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
  ]);
  if (!builder || !group || group.builder_product_id !== builderProductId) throw new Error("Part Group could not be loaded.");

  const sourceParts = (allParts || [])
    .filter((part) => part.is_active !== false && part.part_group_id === groupId)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!sourceParts.length) throw new Error("This Part Group does not contain any active Parts.");

  const timestamp = nowIso();
  const isCustom = builder.module_key === "custom";
  const newGroup = await base44.entities.BuilderPartGroup.create({
    ...stripEntitySystemFields(group),
    builder_product_id: builder.id,
    group_key: makeStableId("group"),
    group_name: `${group.group_name || "Part Group"} Copy`,
    sort_order: (allGroups || []).filter((row) => row.is_active !== false).length,
    is_collapsed: false,
    is_active: true,
  });

  const activePartCount = (allParts || []).filter((part) => part.is_active !== false).length;
  const clonedParts = [];
  for (let index = 0; index < sourceParts.length; index += 1) {
    const sourcePart = sourceParts[index];
    const cloned = await base44.entities.BuilderPart.create({
      ...stripEntitySystemFields(sourcePart),
      builder_product_id: builder.id,
      part_group_id: newGroup.id,
      part_key: makeStableId("part"),
      sort_order: activePartCount + index,
      builder_sync_state: isCustom ? "manual" : "manual_addon",
      source_path: "",
      builder_detached_at: "",
      builder_detached_reason: isCustom ? "" : "Independent Part created by cloning a Part Group.",
      builder_detached_snapshot: {},
      reattach_candidate_id: "",
      reattach_candidate_name: "",
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      is_active: true,
      notes: `${sourcePart.notes ? `${sourcePart.notes}\n` : ""}Cloned with Part Group “${group.group_name || "Part Group"}”.`,
    });
    clonedParts.push(cloned);
  }

  const addedFrozen = clonedParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = clonedParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost);
  const previousCurrent = num(builder.current_recalculated_cost, previousFrozen);
  const nextFrozen = previousFrozen + addedFrozen;
  const nextCurrent = previousCurrent + addedCurrent;
  const nextState = Math.abs(nextCurrent - nextFrozen) > 0.005 ? "changed" : "current";
  const previousCustomer = num(builder.frozen_customer_price, previousFrozen);

  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextFrozen,
    frozen_customer_price: previousCustomer + addedFrozen,
    current_recalculated_cost: nextCurrent,
    price_state: nextState,
    price_delta: nextCurrent - nextFrozen,
    price_delta_percent: nextFrozen ? ((nextCurrent - nextFrozen) / nextFrozen) * 100 : 0,
    part_count: activePartCount + clonedParts.length,
    group_count: (allGroups || []).filter((row) => row.is_active !== false).length + 1,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  await patchEstimateLine(builder, {
    total_snapshot: nextFrozen,
    live_total_snapshot: nextCurrent,
    price_state: nextState,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  });

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousFrozen,
    new_total_cost: nextFrozen,
    previous_customer_price: previousCustomer,
    new_customer_price: previousCustomer + addedFrozen,
    changed_parts: clonedParts.map((part) => ({
      part_id: part.id,
      part_name: part.part_name,
      action: "clone_part_group",
      source_group_id: group.id,
      new_group_id: newGroup.id,
      frozen_extended_cost: num(part.frozen_extended_cost),
    })),
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousFrozen },
    price_snapshot_after: { total: nextFrozen },
    notes: `Cloned Part Group “${group.group_name || "Part Group"}” with ${clonedParts.length} Part${clonedParts.length === 1 ? "" : "s"}. Builder-linked source Parts were copied as independent add-ons so future Builder saves cannot overwrite the clone.`,
  });

  return { group: newGroup, parts: clonedParts };
}
