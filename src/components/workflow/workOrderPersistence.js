import { base44 } from "@/api/base44Client";

const SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id",
]);

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

export function sanitizeWorkOrderFormPatch(formData = {}) {
  return Object.entries(formData || {}).reduce((patch, [key, value]) => {
    if (!SYSTEM_FIELDS.has(key)) patch[key] = value;
    return patch;
  }, {});
}

export function workOrderPatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}

export function createWorkOrderArrayItemLocator(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Work Order array item could not be identified safely.");
  }
  const rawId = item.id;
  if (rawId !== null && rawId !== undefined && String(rawId).trim()) {
    return { id: String(rawId) };
  }
  return { snapshot: normalize(item) };
}

export function findOptionalWorkOrderArrayItemIndex(items, locator, label = "Work Order item") {
  if (!Array.isArray(items) || !locator) {
    throw new Error(`${label} could not be located safely.`);
  }
  const matches = [];
  items.forEach((item, index) => {
    const matched = locator.id
      ? String(item?.id ?? "") === locator.id
      : sameValue(item, locator.snapshot);
    if (matched) matches.push(index);
  });
  if (matches.length > 1) {
    throw new Error(`${label} is ambiguous in the latest Work Order data. Reload before saving.`);
  }
  return matches.length === 1 ? matches[0] : -1;
}

export function findWorkOrderArrayItemIndex(items, locator, label = "Work Order item") {
  const index = findOptionalWorkOrderArrayItemIndex(items, locator, label);
  if (index >= 0) return index;
  throw new Error(`${label} changed or disappeared in another session. Reload before saving.`);
}

export async function mutateLocatedWorkOrderArrayItem({
  workOrderId,
  field,
  item,
  mutateItem,
  remove = false,
  label = "Work Order item",
  maxAttempts = 3,
}) {
  const locator = createWorkOrderArrayItemLocator(item);
  return mutateWorkOrderArrayField({
    workOrderId,
    field,
    label,
    maxAttempts,
    mutate: (currentItems) => {
      const index = findWorkOrderArrayItemIndex(currentItems, locator, label);
      if (remove) return currentItems.filter((_, currentIndex) => currentIndex !== index);
      const nextItem = mutateItem?.(currentItems[index], index);
      if (!nextItem || typeof nextItem !== "object") {
        throw new Error(`${label} update did not produce a valid item.`);
      }
      return currentItems.map((currentItem, currentIndex) => currentIndex === index ? nextItem : currentItem);
    },
  });
}

export async function mutateWorkOrderArrayField({ workOrderId, field, mutate, label = "Work Order", maxAttempts = 3 }) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrderId || "").trim();
  const fieldName = String(field || "").trim();
  if (!id || !fieldName || typeof mutate !== "function" || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} could not initialize its concurrency-safe array update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not be verified before updating ${fieldName}.`);
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its loaded version. Reload it before saving.`);

    const currentArray = current[fieldName] == null ? [] : current[fieldName];
    if (!Array.isArray(currentArray)) {
      throw new Error(`${label} ${fieldName} data is not an array. No change was made.`);
    }
    const nextArray = mutate(currentArray, current);
    if (!Array.isArray(nextArray)) {
      throw new Error(`${label} ${fieldName} update did not produce a valid array.`);
    }
    if (sameValue(currentArray, nextArray)) return current;

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: { [fieldName]: nextArray } },
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && sameValue(afterError[fieldName] ?? [], nextArray)) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional array-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      return saved;
    }
    // Another session changed the Work Order after our preflight read. Re-read
    // and re-apply the caller's deterministic array mutation to the latest value.
  }

  throw new Error(`${label} changed repeatedly in another session. Reload it before saving.`);
}

export async function updateWorkOrderFromLoadedSnapshot({ workOrder, formData, label = "Work Order" }) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrder?.id || "").trim();
  const expectedUpdatedAt = String(workOrder?.updated_date || "").trim();
  if (!id || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  if (!expectedUpdatedAt) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }

  const patch = sanitizeWorkOrderFormPatch(formData);
  let result;
  try {
    result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt },
      { $set: patch },
    );
  } catch (error) {
    const current = await entity.get(id).catch(() => null);
    if (current && workOrderPatchMatches(current, patch)) return current;
    throw error;
  }

  if (!result || typeof result.updated !== "number") {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }

  if (result.updated === 1) {
    const saved = await entity.get(id).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    return saved;
  }

  const current = await entity.get(id).catch(() => null);
  if (current && workOrderPatchMatches(current, patch)) {
    return current;
  }

  throw new Error(`${label} changed in another session. Reload it before saving. No Work Order fields were overwritten.`);
}
