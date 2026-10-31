// src/components/estimator/builder/builderEntityPersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function expectedBuilderEntityFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}
async function replaceBuilderEntityFieldsIfUnchanged({
  entity,
  id,
  expectedUpdatedAt = "",
  expectedFields,
  nextFields,
  guardFields = {},
  label = "Builder record",
  maxAttempts = 3
} = {}) {
  const recordId = String(id || "").trim();
  const expectedVersion = String(expectedUpdatedAt || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!recordId || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(recordId);
    if (!current?.id) throw new Error(`${label} could not be re-read before saving.`);
    for (const [fieldName, value] of Object.entries(guards)) {
      if (!sameValue(current[fieldName], value)) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    if (expectedVersion && String(current.updated_date || "") !== expectedVersion) {
      throw new Error(`${label} changed in another session. Reload before saving.`);
    }
    for (const fieldName of fieldNames) {
      if (!sameValue(current[fieldName], expected[fieldName]) && !sameValue(current[fieldName], desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const currentVersion = String(current.updated_date || "").trim();
    if (!currentVersion) throw new Error(`${label} is missing its current version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id: recordId, updated_date: currentVersion },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(recordId).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) return afterError;
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(recordId).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} changed repeatedly while saving. Reload and try again.`);
}
var expectedEntityFields = expectedBuilderEntityFields;
var replaceEntityFieldsIfUnchanged = replaceBuilderEntityFieldsIfUnchanged;

// src/components/foundation/foundationInventoryPersistence.js
var version = (row) => String(row?.updated_date || "");
var idSet = (rows = []) => [...rows].map((row) => String(row?.id || "")).filter(Boolean).sort();
var sameIds = (a = [], b = []) => {
  const left = idSet(a);
  const right = idSet(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
};
async function reorderFoundationItemsSafely({ entity, loadedItems = [], reorderedItems = [], readCurrentItems, label = "Foundation inventory order" } = {}) {
  if (!entity || typeof readCurrentItems !== "function") throw new Error(`${label} cannot run without the inventory entity and complete-list reader.`);
  if (!sameIds(loadedItems, reorderedItems)) throw new Error(`${label} changed item membership before saving. Reload before retrying.`);
  if (loadedItems.some((row) => !row?.id || !row?.updated_date)) throw new Error(`${label} requires complete loaded item versions before saving.`);
  const currentItems = await readCurrentItems();
  if (!sameIds(loadedItems, currentItems)) throw new Error(`${label} changed in another session. No order changes were saved; reload before retrying.`);
  const loadedById = new Map(loadedItems.map((row) => [row.id, row]));
  const currentById = new Map(currentItems.map((row) => [row.id, row]));
  for (const [id, loaded] of loadedById) {
    const current = currentById.get(id);
    if (!current || version(current) !== version(loaded)) throw new Error(`${label} changed in another session. No order changes were saved; reload before retrying.`);
  }
  const plan = reorderedItems.map((row, index) => ({ id: row.id, desired: index, current: currentById.get(row.id) })).filter((step) => Number(step.current?.sort_order ?? 0) !== step.desired);
  let confirmed = 0;
  for (const step of plan) {
    try {
      await replaceEntityFieldsIfUnchanged({
        entity,
        id: step.id,
        expectedUpdatedAt: step.current.updated_date || "",
        expectedFields: expectedEntityFields(step.current, { sort_order: step.desired }),
        nextFields: { sort_order: step.desired },
        label: `${label} item`
      });
      confirmed += 1;
    } catch (error) {
      throw new Error(`${label} stopped after ${confirmed} of ${plan.length} required order changes were confirmed. Reload before retrying; remaining rows were not skipped automatically. ${error?.message || ""}`.trim());
    }
  }
  const finalItems = await readCurrentItems();
  if (!sameIds(reorderedItems, finalItems)) throw new Error(`${label} changed membership during final verification. Reload before retrying.`);
  const finalById = new Map(finalItems.map((row) => [row.id, row]));
  for (let index = 0; index < reorderedItems.length; index += 1) {
    const current = finalById.get(reorderedItems[index].id);
    if (!current || Number(current.sort_order ?? 0) !== index) throw new Error(`${label} final verification failed. Reload before retrying.`);
  }
  return { items: finalItems, confirmed, planned: plan.length };
}
export {
  reorderFoundationItemsSafely
};
