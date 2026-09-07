import { base44 } from "@/api/base44Client";
import { cloneSnapshot } from "@/components/estimator/products/snapshotUtils";
import { addPartPackageToProduct } from "@/components/estimator/parts/partPackageService";
import { builderMutationHash } from "@/components/estimator/builder/builderMutationRecovery";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const detached = (part) => part?.builder_sync_state === "detached_override" || ["detached", "reattach_available"].includes(part?.inventory_link_state) || part?.price_state === "detached";

function normalizeOptions(options = {}) {
  const tags = [...new Set((options.tags || []).map((value) => String(value || "").trim()).filter(Boolean))];
  return {
    template_name: String(options.template_name || "Saved Part").trim() || "Saved Part",
    product_group: options.product_group === "global" ? "global" : "my",
    category: String(options.category || "").trim(),
    tags,
    description: String(options.description || ""),
    notes: String(options.notes || ""),
  };
}

function searchText(values) {
  return values.flat().filter(Boolean).join(" ").toLowerCase();
}

export async function savePartTemplate({ estimateId = "", builderProductId = "", part, options = {} }) {
  if (!part?.id) throw new Error("Part is required.");
  const livePart = await base44.entities.BuilderPart.get(part.id);
  if (!livePart) throw new Error("This Part no longer exists. Reload the Product before saving it to the Part Library.");
  if (part.updated_date && livePart.updated_date && part.updated_date !== livePart.updated_date) {
    throw new Error("This Part changed in another session. Reload the Product and review the latest Part before saving it to the Part Library.");
  }
  const meta = normalizeOptions({ template_name: livePart.client_label || livePart.part_name || "Saved Part", ...options });
  const idempotencyKey = `part_template_save:${builderMutationHash({
    template_type: "part",
    part_id: livePart.id,
    part_updated_date: livePart.updated_date || "",
    estimate_id: estimateId || "",
    builder_product_id: builderProductId || livePart.builder_product_id || "",
    meta,
  })}`;
  return ensureReusableRecord({
    entity: base44.entities.PartTemplate,
    idempotencyKey,
    label: "Saved Part",
    data: {
    ...meta,
    template_version: 1,
    template_type: "part",
    source_module_key: livePart.source_module_key || "",
    source_part_type: livePart.part_type || "",
    source_part_subtype: livePart.part_subtype || "",
    created_from_estimate_id: estimateId,
    created_from_product_id: builderProductId || livePart.builder_product_id || "",
    created_from_part_id: livePart.id,
    created_from_part_group_id: livePart.part_group_id || "",
    part_snapshot: cloneSnapshot(livePart),
    group_snapshot: {},
    parts_snapshot: [],
    part_count: 1,
    frozen_cost: num(livePart.frozen_extended_cost),
    current_cost: num(livePart.current_extended_cost, num(livePart.frozen_extended_cost)),
    contains_detached_parts: detached(livePart),
    search_text: searchText([meta.template_name, meta.category, meta.tags, livePart.part_name, livePart.client_label, livePart.part_type, livePart.part_subtype, livePart.inventory_item_name, livePart.source_module_key]),
    is_active: true,
    },
  });
}

export async function savePartGroupTemplate({ estimateId = "", builderProductId = "", group, parts = [], options = {} }) {
  if (!group?.id) throw new Error("Part Group is required.");
  const loadedActiveParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!loadedActiveParts.length) throw new Error("Part Group does not contain any active Parts.");

  const [liveGroup, liveRows] = await Promise.all([
    base44.entities.BuilderPartGroup.get(group.id),
    loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { part_group_id: group.id }, sort: "sort_order", label: "Saved Part Group members" }),
  ]);
  if (!liveGroup) throw new Error("This Part Group no longer exists. Reload the Product before saving it to the Part Library.");
  if (group.updated_date && liveGroup.updated_date && group.updated_date !== liveGroup.updated_date) {
    throw new Error("This Part Group changed in another session. Reload the Product before saving it to the Part Library.");
  }
  const activeParts = (liveRows || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const loadedById = new Map(loadedActiveParts.map((part) => [part.id, part]));
  const membershipChanged = activeParts.length !== loadedActiveParts.length || activeParts.some((part) => !loadedById.has(part.id));
  const memberVersionChanged = activeParts.some((livePart) => {
    const loaded = loadedById.get(livePart.id);
    return !!(loaded?.updated_date && livePart.updated_date && loaded.updated_date !== livePart.updated_date);
  });
  if (membershipChanged || memberVersionChanged) {
    throw new Error("One or more Parts in this Part Group changed in another session. Reload the Product and review the current group before saving it to the Part Library.");
  }

  const meta = normalizeOptions({ template_name: liveGroup.client_label || liveGroup.group_name || "Saved Part Group", ...options });
  const first = activeParts[0] || {};
  const idempotencyKey = `part_group_template_save:${builderMutationHash({
    template_type: "part_group",
    group_id: liveGroup.id,
    group_updated_date: liveGroup.updated_date || "",
    parts: activeParts.map((part) => [part.id, part.updated_date || ""]),
    estimate_id: estimateId || "",
    builder_product_id: builderProductId || liveGroup.builder_product_id || "",
    meta,
  })}`;
  return ensureReusableRecord({
    entity: base44.entities.PartTemplate,
    idempotencyKey,
    label: "Saved Part Group",
    data: {
    ...meta,
    template_version: 1,
    template_type: "part_group",
    source_module_key: first.source_module_key || "",
    source_part_type: "part_group",
    source_part_subtype: "",
    created_from_estimate_id: estimateId,
    created_from_product_id: builderProductId || liveGroup.builder_product_id || "",
    created_from_part_group_id: liveGroup.id,
    created_from_part_id: "",
    part_snapshot: {},
    group_snapshot: { ...cloneSnapshot(liveGroup), snapshot_source_group_id: liveGroup.id },
    parts_snapshot: activeParts.map(cloneSnapshot),
    part_count: activeParts.length,
    frozen_cost: activeParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0),
    current_cost: activeParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0),
    contains_detached_parts: activeParts.some(detached),
    search_text: searchText([meta.template_name, meta.category, meta.tags, liveGroup.group_name, liveGroup.client_label, liveGroup.description, first.source_module_key, activeParts.map((part) => [part.part_name, part.client_label, part.part_type, part.part_subtype, part.inventory_item_name])]),
    is_active: true,
    },
  });
}

export async function listPartTemplates({ includeInactive = false } = {}) {
  const [rows, me] = await Promise.all([
    loadAllEntityRows({ entity: base44.entities.PartTemplate, sort: "template_name", label: "Part Library" }),
    base44.auth.me().catch(() => null),
  ]);
  return (rows || [])
    .filter((row) => {
      if (!includeInactive && row.is_active === false) return false;
      if (row.product_group === "global") return true;
      return !row.created_by_id || (!!me?.id && row.created_by_id === me.id);
    })
    .sort((a, b) => String(a.template_name || "").localeCompare(String(b.template_name || "")));
}

export async function instantiatePartTemplate({ estimateId, targetBuilderProductId, template, expectedEstimateUpdatedAt = "" }) {
  if (!template?.id) throw new Error("Saved Part is required.");
  const [liveTemplate, me] = await Promise.all([
    base44.entities.PartTemplate.get(template.id),
    base44.auth.me().catch(() => null),
  ]);
  if (!liveTemplate) throw new Error("This Saved Part no longer exists. Reopen the Part Library to refresh it.");
  if (liveTemplate.is_active === false) throw new Error("This Saved Part is now inactive and cannot be added. Reopen the Part Library to refresh it.");
  const accessible = liveTemplate.product_group === "global" || !liveTemplate.created_by_id || (!!me?.id && liveTemplate.created_by_id === me.id);
  if (!accessible) throw new Error("This Saved Part is no longer available to your account.");
  if (template.updated_date && liveTemplate.updated_date && template.updated_date !== liveTemplate.updated_date) {
    throw new Error("This Saved Part changed after the Part Library opened. Reopen the library and review the latest reusable snapshot before adding it.");
  }
  const isGroup = liveTemplate.template_type === "part_group";
  return addPartPackageToProduct({
    estimateId,
    targetBuilderProductId,
    itemType: isGroup ? "part_group" : "part",
    itemName: liveTemplate.template_name || (isGroup ? "Saved Part Group" : "Saved Part"),
    payload: isGroup
      ? { group: cloneSnapshot(liveTemplate.group_snapshot || {}), parts: (liveTemplate.parts_snapshot || []).map(cloneSnapshot) }
      : { part: cloneSnapshot(liveTemplate.part_snapshot || {}) },
    sourceType: "library",
    sourceId: liveTemplate.id,
    expectedEstimateUpdatedAt,
  });
}
