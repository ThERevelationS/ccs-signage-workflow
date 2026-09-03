import { base44 } from "@/api/base44Client";
import { cloneSnapshot } from "@/components/estimator/products/snapshotUtils";
import { addPartPackageToProduct } from "@/components/estimator/parts/partPackageService";

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
  const meta = normalizeOptions({ template_name: part.client_label || part.part_name || "Saved Part", ...options });
  return base44.entities.PartTemplate.create({
    ...meta,
    template_version: 1,
    template_type: "part",
    source_module_key: part.source_module_key || "",
    source_part_type: part.part_type || "",
    source_part_subtype: part.part_subtype || "",
    created_from_estimate_id: estimateId,
    created_from_product_id: builderProductId || part.builder_product_id || "",
    created_from_part_id: part.id,
    created_from_part_group_id: part.part_group_id || "",
    part_snapshot: cloneSnapshot(part),
    group_snapshot: {},
    parts_snapshot: [],
    part_count: 1,
    frozen_cost: num(part.frozen_extended_cost),
    current_cost: num(part.current_extended_cost, num(part.frozen_extended_cost)),
    contains_detached_parts: detached(part),
    search_text: searchText([meta.template_name, meta.category, meta.tags, part.part_name, part.client_label, part.part_type, part.part_subtype, part.inventory_item_name, part.source_module_key]),
    is_active: true,
  });
}

export async function savePartGroupTemplate({ estimateId = "", builderProductId = "", group, parts = [], options = {} }) {
  if (!group?.id) throw new Error("Part Group is required.");
  const activeParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!activeParts.length) throw new Error("Part Group does not contain any active Parts.");
  const meta = normalizeOptions({ template_name: group.client_label || group.group_name || "Saved Part Group", ...options });
  const first = activeParts[0] || {};
  return base44.entities.PartTemplate.create({
    ...meta,
    template_version: 1,
    template_type: "part_group",
    source_module_key: first.source_module_key || "",
    source_part_type: "part_group",
    source_part_subtype: "",
    created_from_estimate_id: estimateId,
    created_from_product_id: builderProductId || group.builder_product_id || "",
    created_from_part_group_id: group.id,
    created_from_part_id: "",
    part_snapshot: {},
    group_snapshot: { ...cloneSnapshot(group), snapshot_source_group_id: group.id },
    parts_snapshot: activeParts.map(cloneSnapshot),
    part_count: activeParts.length,
    frozen_cost: activeParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0),
    current_cost: activeParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0),
    contains_detached_parts: activeParts.some(detached),
    search_text: searchText([meta.template_name, meta.category, meta.tags, group.group_name, group.client_label, group.description, first.source_module_key, activeParts.map((part) => [part.part_name, part.client_label, part.part_type, part.part_subtype, part.inventory_item_name])]),
    is_active: true,
  });
}

export async function listPartTemplates({ includeInactive = false } = {}) {
  const [rows, me] = await Promise.all([
    base44.entities.PartTemplate.list(),
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

export async function instantiatePartTemplate({ estimateId, targetBuilderProductId, template }) {
  if (!template?.id) throw new Error("Saved Part is required.");
  const isGroup = template.template_type === "part_group";
  return addPartPackageToProduct({
    estimateId,
    targetBuilderProductId,
    itemType: isGroup ? "part_group" : "part",
    itemName: template.template_name || (isGroup ? "Saved Part Group" : "Saved Part"),
    payload: isGroup
      ? { group: cloneSnapshot(template.group_snapshot || {}), parts: (template.parts_snapshot || []).map(cloneSnapshot) }
      : { part: cloneSnapshot(template.part_snapshot || {}) },
    sourceType: "library",
    sourceId: template.id,
  });
}
