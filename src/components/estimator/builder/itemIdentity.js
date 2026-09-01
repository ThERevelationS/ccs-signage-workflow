// Stable hidden identities for repeated Builder rows.
//
// Existing Git-era records did not carry row IDs, while BuilderPart reconciliation
// historically used array indexes. Seed old rows with their current legacy index
// ("0", "1", ...) so the first adoption does NOT change any existing Part keys.
// New rows receive generated IDs, which then survive delete/reorder operations.

export function newBuilderItemId(prefix = "item") {
  const uuid = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

export function seedBuilderItemIds(items = []) {
  return (items || []).map((item, index) => ({
    ...(item || {}),
    builder_item_id: String(item?.builder_item_id ?? index),
  }));
}

export function builderItemToken(item, index) {
  const value = item?.builder_item_id;
  return value === undefined || value === null || value === "" ? String(index) : String(value);
}
