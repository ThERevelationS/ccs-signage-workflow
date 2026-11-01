import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function matchesPayload(row = {}, payload = {}) {
  return Object.entries(payload || {}).every(([field, value]) => sameValue(row?.[field], value));
}

export async function createInventoryRecordWithRecovery({
  entity,
  data = {},
  nameField,
  label = "Inventory item",
} = {}) {
  const field = String(nameField || "").trim();
  const name = String(data?.[field] ?? "").trim();
  if (!field || !name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readCandidates = async () => {
    const rows = await entity.filter({ [field]: data[field] });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows;
  };

  const before = await readCandidates();
  const beforeIds = new Set(before.map((row) => row?.id).filter(Boolean));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const verified = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    if (verified?.id && !matchesPayload(verified, data)) {
      throw new Error(`${label} was created but its stored values do not match this save. Reload the inventory and review the new row before retrying.`);
    }
    return { record: verified?.id ? verified : created, status: "created" };
  }

  const after = await readCandidates();
  const newExactMatches = after.filter((row) => !beforeIds.has(row?.id) && matchesPayload(row, data));
  if (newExactMatches.length === 1) {
    return { record: newExactMatches[0], status: "recovered" };
  }
  if (newExactMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No inventory rows were deleted; reload and review the new matching rows before retrying.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload the inventory before retrying.`);
}

export async function deleteInventoryRecordIfUnchanged({
  entity,
  record,
  nameField,
  label = "Inventory item",
} = {}) {
  const field = String(nameField || "").trim();
  const guardFields = field && Object.prototype.hasOwnProperty.call(record || {}, field)
    ? { [field]: record[field] }
    : {};
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields,
    label,
  });
}

// Cascade-check before inventory delete: estimate Parts link to inventory rows
// via inventory_item_id. Deleting a referenced row would orphan those links, so
// callers must run this first and block the delete when references exist.
export async function findInventoryPartReferences(recordId) {
  const id = String(recordId || "");
  if (!id || typeof base44?.entities?.BuilderPart?.filter !== "function") {
    throw new Error("Estimate Part references could not be verified.");
  }
  const rows = await base44.entities.BuilderPart.filter({ inventory_item_id: id });
  const list = Array.isArray(rows) ? rows : [];
  return {
    count: list.length,
    names: list.map((p) => p.part_name || p.part_key || "Part").slice(0, 5),
  };
}

// Usage history: resolve estimate Parts → BuilderProducts → distinct estimates
// so inventory rows can show a "used in N estimates" badge. Sequential product
// reads are bounded by how many products consume the item.
export async function findInventoryEstimateUsage(recordId) {
  const id = String(recordId || "");
  if (!id || typeof base44?.entities?.BuilderPart?.filter !== "function" || typeof base44?.entities?.BuilderProduct?.get !== "function") {
    throw new Error("Estimate usage could not be verified.");
  }
  const rows = await base44.entities.BuilderPart.filter({ inventory_item_id: id });
  const parts = Array.isArray(rows) ? rows : [];
  const productIds = [...new Set(parts.map((p) => p?.builder_product_id).filter(Boolean))];
  const estimateIds = new Set();
  for (const productId of productIds) {
    const product = await base44.entities.BuilderProduct.get(productId).catch(() => null);
    if (product?.estimate_id) estimateIds.add(product.estimate_id);
  }
  return { parts: parts.length, products: productIds.length, estimates: estimateIds.size, estimateIds: [...estimateIds].slice(0, 25) };
}

const COST_FIELD_RX = /cost|rate|price/i;

// Writes InventoryCostHistory rows for any cost/rate/price-named field whose
// value changed between the loaded row and the saved payload. The entity is
// backend-only, so rows are written by the session-authenticated
// inventoryAction function. Best-effort: failures are swallowed so the audit
// never blocks an inventory save.
export async function recordInventoryCostChanges({ itemId, entityKey, before = {}, after = {}, fields = [], note = "Inventory edit" } = {}) {
  const sessionToken = getSessionToken();
  if (!itemId || !sessionToken) return 0;
  const costFields = new Set((fields || []).filter((f) => f?.name && COST_FIELD_RX.test(f.name)).map((f) => f.name));
  const candidates = new Set([...costFields, ...Object.keys(after).filter((k) => COST_FIELD_RX.test(k))]);
  const changes = [];
  for (const field of candidates) {
    const oldVal = Number(before[field]);
    const newVal = Number(after[field]);
    if (!Number.isFinite(oldVal) || !Number.isFinite(newVal) || Math.abs(oldVal - newVal) <= 0.000001) continue;
    changes.push({ cost_field: String(field), old_cost: oldVal, new_cost: newVal });
  }
  if (changes.length === 0) return 0;
  try {
    const response = await base44.functions.invoke("inventoryAction", {
      session_token: sessionToken,
      action: "record_cost_history",
      inventory_item_id: String(itemId),
      entity_key: String(entityKey || ""),
      note: String(note || ""),
      changes,
    });
    return Number((response?.data || response)?.written ?? 0);
  } catch {
    return 0; // audit must not fail the save
  }
}

// Reads go through the session-gated staffDataRead gateway (admin tier).
export async function loadInventoryCostHistory({ itemId, entityKey = "", limit = 5 } = {}) {
  if (!itemId || !getSessionToken()) return [];
  const query = entityKey
    ? { inventory_item_id: String(itemId), entity_key: String(entityKey) }
    : { inventory_item_id: String(itemId) };
  const rows = await staffEntities.InventoryCostHistory.filter(query, "-created_date", limit).catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  return list
    .sort((a, b) => String(b?.created_date || "").localeCompare(String(a?.created_date || "")))
    .slice(0, limit);
}
