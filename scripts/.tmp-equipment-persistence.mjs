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

// src/components/masterInventory/equipmentPersistence.js
async function setExclusiveBooleanSafely({
  entity,
  targetId,
  field,
  next,
  expectedTargetUpdatedAt = "",
  expectedRowVersions = null,
  readRows,
  label = "exclusive selection"
} = {}) {
  if (!entity || !targetId || !field || typeof readRows !== "function") {
    throw new Error(`${label} could not initialize safely.`);
  }
  const before = await readRows();
  if (!Array.isArray(before)) throw new Error(`${label} could not verify the complete record set.`);
  const target = before.find((row) => row.id === targetId);
  if (!target?.id) throw new Error(`${label} target no longer exists. Reload before changing it.`);
  if (expectedTargetUpdatedAt && String(target.updated_date || "") !== String(expectedTargetUpdatedAt)) {
    throw new Error(`${label} target changed in another session. Reload before changing it.`);
  }
  let confirmedWrites = 0;
  let plannedWrites = 1;
  const targetPatch = { [field]: !!next };
  await replaceEntityFieldsIfUnchanged({
    entity,
    id: target.id,
    expectedUpdatedAt: target.updated_date || "",
    expectedFields: expectedEntityFields(target, targetPatch),
    nextFields: targetPatch,
    label: `${label} target`
  });
  confirmedWrites += 1;
  if (next) {
    const afterTarget = await readRows();
    if (!Array.isArray(afterTarget)) {
      throw new Error(`${label} target was saved, but the complete record set could not be re-verified.`);
    }
    const others = afterTarget.filter((row) => row.id !== targetId && row[field] === true);
    plannedWrites += others.length;
    for (const row of others) {
      if (expectedRowVersions && typeof expectedRowVersions === "object") {
        if (!Object.prototype.hasOwnProperty.call(expectedRowVersions, row.id)) {
          throw new Error(`${label} detected a new concurrent selection before it could be cleared. Reload before retrying.`);
        }
        const expectedVersion = expectedRowVersions[row.id];
        if (expectedVersion && String(row.updated_date || "") !== String(expectedVersion)) {
          throw new Error(`${label} detected a concurrent change to another selected record before it could be cleared. Reload before retrying.`);
        }
      }
      const clearPatch = { [field]: false };
      try {
        await replaceEntityFieldsIfUnchanged({
          entity,
          id: row.id,
          expectedUpdatedAt: row.updated_date || "",
          expectedFields: expectedEntityFields(row, clearPatch),
          nextFields: clearPatch,
          label: `${label} previous selection`
        });
        confirmedWrites += 1;
      } catch (error) {
        throw new Error(`${label} stopped after ${confirmedWrites} of ${plannedWrites} required changes were confirmed. Reload before retrying; no remaining records were skipped automatically. ${error?.message || ""}`.trim());
      }
    }
  }
  const finalRows = await readRows();
  if (!Array.isArray(finalRows)) {
    throw new Error(`${label} changes were made, but final verification could not load the complete record set.`);
  }
  const finalTarget = finalRows.find((row) => row.id === targetId);
  if (!finalTarget || !!finalTarget[field] !== !!next) {
    throw new Error(`${label} could not verify the final target state. Reload before retrying.`);
  }
  if (next) {
    const primaries = finalRows.filter((row) => row[field] === true);
    if (primaries.length !== 1 || primaries[0].id !== targetId) {
      throw new Error(`${label} detected another concurrent selection during final verification. Reload before retrying.`);
    }
  }
  return { rows: finalRows, target: finalTarget, confirmedWrites, plannedWrites };
}
async function replaceRelationshipIdsIfUnchanged({
  entity,
  row,
  field,
  nextIds,
  label = "equipment relationship"
} = {}) {
  if (!row?.id || !field || !Array.isArray(nextIds)) throw new Error(`${label} could not initialize safely.`);
  const patch = { [field]: nextIds };
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: row.id,
    expectedFields: expectedEntityFields(row, patch),
    nextFields: patch,
    label
  });
}
export {
  replaceRelationshipIdsIfUnchanged,
  setExclusiveBooleanSafely
};
