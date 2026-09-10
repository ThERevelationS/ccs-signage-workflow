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

export async function createWorkOrderWithRecovery({ data, label = "Work Order", entity = base44.entities.WorkOrder } = {}) {
  const payload = sanitizeWorkOrderFormPatch(data || {});
  const title = String(payload.title || "").trim();
  if (!title || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ title }, "-created_date", 500);
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a Work Order list.`);
    if (rows.length >= 500) throw new Error(`${label} has too many same-title Work Orders to verify creation safely. Review existing jobs before retrying.`);
    return rows.filter((row) => workOrderPatchMatches(row, payload));
  };

  const before = await readMatches();
  const beforeIds = new Set(before.map((row) => row.id));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const saved = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    return { record: saved?.id ? saved : created, status: "created" };
  }

  const after = await readMatches();
  const newMatches = after.filter((row) => !beforeIds.has(row.id));
  if (newMatches.length === 1) return { record: newMatches[0], status: "recovered" };
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No Work Orders were deleted; reload and review matching jobs before retrying.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
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

export async function replaceWorkOrderFieldsIfUnchanged({
  workOrderId,
  expectedFields,
  nextFields,
  label = "Work Order fields",
  maxAttempts = 3,
}) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrderId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!id || !expected || !desired || fieldNames.length === 0 || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} could not initialize its concurrency-safe replacement.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Work Order before saving.`);
    if (current.deleted === true) {
      throw new Error(`${label} was blocked because this Work Order is in Trash. Restore it before making changes.`);
    }

    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;

    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Work Order fields were overwritten.`);
      }
    }

    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Work Order version. Reload before saving.`);
    const result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt, deleted: { $ne: true } },
      { $set: desired },
    );
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional replacement result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
    // Another unrelated field may have changed after the preflight read. Re-read
    // and retry only while every protected field still equals its loaded or desired value.
  }

  throw new Error(`${label} Work Order changed repeatedly while saving. Reload and try again.`);
}

export async function transitionWorkOrderFromLoadedSnapshot({
  workOrder,
  newStage,
  completed,
  normalizeLegacyNotes = false,
  label = "Work Order transition",
}) {
  const id = String(workOrder?.id || "").trim();
  const stage = String(newStage || "").trim();
  if (!id || !stage) throw new Error(`${label} is missing its Work Order or destination stage.`);

  const expectedFields = { current_stage: workOrder.current_stage };
  const nextFields = { current_stage: stage };
  if (typeof completed === "boolean") {
    expectedFields.completed = workOrder.completed;
    nextFields.completed = completed;
  }

  if (normalizeLegacyNotes && typeof workOrder.notes === "string" && workOrder.notes.trim()) {
    expectedFields.notes = workOrder.notes;
    nextFields.notes = [{
      text: workOrder.notes,
      timestamp: workOrder.created_date || new Date().toISOString(),
      created_by: workOrder.created_by || "Unknown",
    }];
  }

  return replaceWorkOrderFieldsIfUnchanged({
    workOrderId: id,
    expectedFields,
    nextFields,
    label,
  });
}

export async function replaceWorkOrderArrayFieldIfUnchanged({
  workOrderId,
  field,
  expectedArray,
  nextArray,
  label = "Work Order array",
  maxAttempts = 3,
}) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrderId || "").trim();
  const fieldName = String(field || "").trim();
  const expected = expectedArray == null ? [] : expectedArray;
  const desired = nextArray == null ? [] : nextArray;
  if (!id || !fieldName || !Array.isArray(expected) || !Array.isArray(desired) || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} could not initialize its concurrency-safe replacement.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Work Order before saving.`);
    if (current.deleted === true) {
      throw new Error(`${label} was blocked because this Work Order is in Trash. Restore it before making changes.`);
    }
    const currentArray = current[fieldName] == null ? [] : current[fieldName];
    if (!Array.isArray(currentArray)) {
      throw new Error(`${label} data is not an array. No change was made.`);
    }
    if (sameValue(currentArray, desired)) return current;
    if (!sameValue(currentArray, expected)) {
      throw new Error(`${label} changed in another session. Reload it before saving. No checklist changes were overwritten.`);
    }

    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Work Order version. Reload before saving.`);
    const result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt, deleted: { $ne: true } },
      { $set: { [fieldName]: desired } },
    );
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional replacement result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
    // Another field may have changed after the preflight read. Re-read and retry
    // only if this same checklist field still matches the originally loaded snapshot.
  }

  throw new Error(`${label} Work Order changed repeatedly while saving. Reload and try again.`);
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
    if (current.deleted === true) {
      throw new Error(`${label} was blocked because this Work Order is in Trash. Restore it before making changes.`);
    }
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
        { id, updated_date: expectedUpdatedAt, deleted: { $ne: true } },
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

export async function softDeleteWorkOrderFromLoadedSnapshot({
  workOrder,
  deletedBy = "unknown",
  label = "Work Order delete",
}) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrder?.id || "").trim();
  const expectedUpdatedAt = String(workOrder?.updated_date || "").trim();
  const actor = String(deletedBy || "unknown").trim() || "unknown";
  if (!id || !expectedUpdatedAt || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} is missing its loaded Work Order version. Reload before deleting.`);
  }

  const current = await entity.get(id);
  if (!current?.id) throw new Error(`${label} could not verify its Work Order before deleting.`);
  if (current.deleted === true) return current;
  if (String(current.updated_date || "").trim() !== expectedUpdatedAt) {
    throw new Error(`${label} was blocked because the Work Order changed after it was loaded. Reload before deleting. Nothing was deleted.`);
  }

  const deletedAt = new Date().toISOString();
  let result;
  try {
    result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt },
      { $set: { deleted: true, deleted_at: deletedAt, deleted_by: actor } },
    );
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    if (afterError?.deleted === true) return afterError;
    throw error;
  }

  if (!result || typeof result.updated !== "number") {
    throw new Error(`${label} result could not be verified.`);
  }
  if (result.updated === 1) {
    const saved = await entity.get(id).catch(() => null);
    if (!saved) throw new Error(`${label} succeeded but the deleted Work Order could not be re-read.`);
    return saved;
  }

  const after = await entity.get(id).catch(() => null);
  if (after?.deleted === true) return after;
  throw new Error(`${label} was blocked because the Work Order changed while deletion was being confirmed. Reload before deleting. Nothing was deleted.`);
}

export async function restoreWorkOrderFromLoadedTrashSnapshot({
  workOrder,
  label = "Work Order recovery",
}) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrder?.id || "").trim();
  const expectedUpdatedAt = String(workOrder?.updated_date || "").trim();
  if (!id || !expectedUpdatedAt || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} is missing its loaded Work Order version. Reload trash before recovering.`);
  }

  const current = await entity.get(id);
  if (!current?.id) throw new Error(`${label} could not verify its Work Order before recovering.`);
  if (current.deleted !== true) return current;
  if (String(current.updated_date || "").trim() !== expectedUpdatedAt) {
    throw new Error(`${label} was blocked because the deleted Work Order changed after trash was loaded. Reload trash before recovering.`);
  }

  let result;
  try {
    result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt },
      { $set: { deleted: false, deleted_at: null, deleted_by: null } },
    );
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    if (afterError && afterError.deleted !== true) return afterError;
    throw error;
  }

  if (!result || typeof result.updated !== "number") {
    throw new Error(`${label} result could not be verified.`);
  }
  if (result.updated === 1) {
    const saved = await entity.get(id).catch(() => null);
    if (!saved) throw new Error(`${label} succeeded but the recovered Work Order could not be re-read.`);
    return saved;
  }

  const after = await entity.get(id).catch(() => null);
  if (after && after.deleted !== true) return after;
  throw new Error(`${label} was blocked because the deleted Work Order changed while recovery was being confirmed. Reload trash before recovering.`);
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
      { id, updated_date: expectedUpdatedAt, deleted: { $ne: true } },
      { $set: patch },
    );
  } catch (error) {
    const current = await entity.get(id).catch(() => null);
    if (current?.deleted === true) {
      throw new Error(`${label} was blocked because this Work Order is in Trash. Restore it before making changes.`);
    }
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
  if (current?.deleted === true) {
    throw new Error(`${label} was blocked because this Work Order is in Trash. Restore it before making changes.`);
  }
  if (current && workOrderPatchMatches(current, patch)) {
    return current;
  }

  throw new Error(`${label} changed in another session. Reload it before saving. No Work Order fields were overwritten.`);
}
