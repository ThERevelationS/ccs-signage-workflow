const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const assigned = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

// Preserve the original calculator's storage precedence, including empty maps.
export function resolveFoundationEquipment(entry = {}, inventory = [], index = 0) {
  const source = entry || {};
  const equipment = inventory.find(row => row.id === source.equipment_id);
  let attachmentMode = "none";
  let attachmentRows = [];
  if (source.attachments?.length) {
    attachmentMode = "normalized";
    attachmentRows = source.attachments.map((row, rowIndex) => {
      const id = row.id || row.inventory_id;
      return {
        id, quantity: row.qty || 1, sourceRecord: row, rowIndex, field: "attachments",
        inventory: inventory.find(item => item.id === id),
      };
    });
  } else if (source.attachment_counts) {
    attachmentMode = "counts";
    attachmentRows = Object.entries(source.attachment_counts).map(([id, quantity], rowIndex) => ({
      id, quantity: num(quantity), rowIndex, field: "attachment_counts",
      inventory: inventory.find(item => item.id === id && item.material_type === "attachment"),
    }));
  } else if (source.attachment_ids?.length) {
    attachmentMode = "legacy_ids";
    attachmentRows = source.attachment_ids.map((id, rowIndex) => ({
      id, quantity: 1, rowIndex, field: "attachment_ids",
      inventory: inventory.find(item => item.id === id && item.material_type === "attachment"),
    }));
  }
  const subAttachmentRows = Object.entries(source.sub_attachment_counts || {}).map(([id, quantity], rowIndex) => ({
    id, quantity: num(quantity), rowIndex, field: "sub_attachment_counts",
    inventory: inventory.find(item => item.id === id && item.material_type === "sub_attachment"),
  }));
  const issues = [];
  const check = (id, record, kind, field) => {
    if (assigned(id) && record) return;
    const hasSelection = assigned(id);
    issues.push({
      kind, index, componentId: source.component_id ?? source._id ?? null, field,
      inventoryId: hasSelection ? id : null,
      code: hasSelection ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `Equipment ${index + 1}: ${hasSelection ? `${kind.replaceAll("_", " ")} ${String(id)} is unavailable` : `select a catalog ${kind.replaceAll("_", " ")}`}.`,
    });
  };
  check(source.equipment_id, equipment, "equipment", "equipment_id");
  for (const row of attachmentRows) {
    if (attachmentMode === "normalized" || row.quantity !== 0) {
      check(row.id, row.inventory, "attachment", row.field);
    }
  }
  for (const row of subAttachmentRows) {
    if (row.quantity !== 0) check(row.id, row.inventory, "sub_attachment", row.field);
  }
  return { equipment, attachmentMode, attachmentRows, subAttachmentRows, issues };
}

export function foundationEquipmentCatalogIssues(entries = [], inventory = []) {
  return entries.flatMap((entry, index) => resolveFoundationEquipment(entry, inventory, index).issues);
}

// Migration happens only on an explicit edit; viewing a legacy row is pure.
export function setFoundationEquipmentCount(entry, { kind, id, quantity }) {
  if (kind !== "attachment" && kind !== "sub_attachment") throw new Error("Unknown equipment selection kind.");
  if (!assigned(id)) throw new Error("Select a catalog item before changing its quantity.");
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Attachment quantities must be nonnegative whole numbers.");
  }
  const source = entry || {};
  if (kind === "attachment" && source.attachments?.length) {
    const matches = source.attachments.filter(row => (row.id || row.inventory_id) === id);
    if (matches.length > 1 && quantity !== 0) {
      throw new Error("Duplicate attachment references require review. Remove the duplicates and add one selection.");
    }
    let attachments = source.attachments.filter(row => (row.id || row.inventory_id) !== id);
    if (quantity > 0) {
      if (matches.length) {
        attachments = source.attachments.map(row => (row.id || row.inventory_id) === id ? { ...row, qty: quantity } : row);
      } else {
        attachments = [...attachments, { id, qty: quantity }];
      }
    }
    // Do not resurrect ignored legacy charges when the final normalized row goes.
    return { ...source, attachments, attachment_counts: {}, attachment_ids: [] };
  }
  const field = kind === "sub_attachment" ? "sub_attachment_counts" : "attachment_counts";
  const raw = source[field];
  if (raw && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error("This legacy quantity map needs review before editing.");
  }
  const counts = new Map(Object.entries(raw || {}));
  if (kind === "attachment" && !raw) {
    for (const legacyId of source.attachment_ids || []) {
      if (typeof legacyId !== "string") throw new Error("Legacy numeric attachment IDs need reassignment before editing.");
      counts.set(legacyId, (counts.get(legacyId) || 0) + 1);
    }
  }
  if (typeof id !== "string") throw new Error("Legacy numeric attachment IDs need reassignment before editing.");
  if (quantity === 0) counts.delete(id);
  else counts.set(id, quantity);
  const next = { ...source, [field]: Object.fromEntries(counts) };
  return kind === "attachment" ? { ...next, attachments: [], attachment_ids: [] } : next;
}
