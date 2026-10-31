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
function isEntityNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || error?.response?.statusCode || error?.data?.status || 0);
  if (status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
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
async function deleteBuilderEntityIfUnchanged({
  entity,
  record,
  guardFields = {},
  label = "Builder record"
} = {}) {
  const id = String(record?.id || "").trim();
  const updatedDate = String(record?.updated_date || "").trim();
  if (!id || !updatedDate || typeof entity?.deleteMany !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe delete.`);
  }
  const query = { id, updated_date: updatedDate, ...guardFields };
  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    let current2;
    try {
      current2 = await entity.get(id);
    } catch (verificationError) {
      if (isEntityNotFoundError(verificationError)) {
        return { deleted: true, convergedAfterResponseLoss: true };
      }
      throw new Error(
        `${label} delete returned an error and its outcome could not be verified. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
      );
    }
    if (!current2) return { deleted: true, convergedAfterResponseLoss: true };
    throw error;
  }
  if (!result || typeof result.deleted !== "number") {
    throw new Error(`${label} conditional-delete result could not be verified.`);
  }
  if (result.deleted === 1) return { deleted: true };
  if (result.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count.`);
  }
  let current;
  try {
    current = await entity.get(id);
  } catch (verificationError) {
    if (isEntityNotFoundError(verificationError)) {
      return { deleted: true, alreadyDeleted: true };
    }
    throw new Error(
      `${label} deletion matched no current version and the record could not be re-read. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!current) return { deleted: true, alreadyDeleted: true };
  throw new Error(`${label} changed in another session. It was not deleted.`);
}
var expectedEntityFields = expectedBuilderEntityFields;
var replaceEntityFieldsIfUnchanged = replaceBuilderEntityFieldsIfUnchanged;
var deleteEntityIfUnchanged = deleteBuilderEntityIfUnchanged;

// src/components/vinylInventory/vinylInventoryPersistence.js
function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalized(value[key]);
    return out;
  }, {});
}
function sameValue2(a, b) {
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
function stripMeta(row = {}) {
  const payload = { ...row };
  ["id", "created_date", "updated_date", "created_by_id"].forEach((key) => delete payload[key]);
  return payload;
}
function rowMatchesData(row, data) {
  return Object.entries(data || {}).every(([key, value]) => sameValue2(row?.[key], value));
}
async function createVinylRecordWithRecovery({ entity, data, label = "Vinyl inventory record" } = {}) {
  const name = String(data?.vinyl_name || "").trim();
  if (!name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const readMatches = async () => {
    const rows = await entity.filter({ vinyl_name: name });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => rowMatchesData(row, data));
  };
  const before = await readMatches();
  const beforeIds = new Set(before.map((row) => row.id));
  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }
  if (created?.id) {
    const saved = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    return { record: saved?.id ? saved : created, status: "created", ownershipCertain: true };
  }
  const after = await readMatches();
  const newMatches = after.filter((row) => !beforeIds.has(row.id));
  if (newMatches.length === 1) {
    return { record: newMatches[0], status: "recovered", ownershipCertain: false };
  }
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No rows were deleted; reload and review the new matching records before retrying.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
async function updateVinylIfUnchanged({ entity, record, nextFields, label = "Vinyl inventory record" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    guardFields: { vinyl_name: record.vinyl_name },
    label
  });
}
async function deleteVinylIfUnchanged({ entity, record, label = "Vinyl inventory record" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { vinyl_name: record.vinyl_name },
    label
  });
}
async function duplicateVinylSafely({
  entity,
  source,
  copyData,
  groupKey,
  label = "Vinyl inventory duplicate"
} = {}) {
  if (!source?.id) throw new Error(`${label} source is no longer loaded.`);
  if (typeof entity?.get !== "function") throw new Error(`${label} could not verify its source record.`);
  const live = await entity.get(source.id);
  if (!live?.id || String(live.updated_date || "") !== String(source.updated_date || "")) {
    throw new Error(`${label} was blocked because the source vinyl changed in another session.`);
  }
  const copyResult = await createVinylRecordWithRecovery({ entity, data: copyData, label });
  let savedSource = live;
  if (!live.product_group_key) {
    try {
      savedSource = await updateVinylIfUnchanged({
        entity,
        record: live,
        nextFields: { product_group_key: groupKey },
        label: `${label} source grouping`
      });
    } catch (error) {
      if (copyResult.ownershipCertain) {
        try {
          await deleteVinylIfUnchanged({
            entity,
            record: copyResult.record,
            label: `${label} rollback copy`
          });
        } catch (rollbackError) {
          throw new Error(`${error?.message || `${label} could not group the source.`} The new copy also could not be rolled back safely: ${rollbackError?.message || "rollback failed"}`);
        }
      } else {
        throw new Error(`${error?.message || `${label} could not group the source.`} The create response was ambiguous, so no uncertain copy was deleted; reload and review the matching vinyl records.`);
      }
      throw error;
    }
  }
  return { source: savedSource, copy: copyResult.record, copyStatus: copyResult.status };
}
export {
  createVinylRecordWithRecovery,
  deleteVinylIfUnchanged,
  duplicateVinylSafely,
  stripMeta as stripVinylRecordMeta,
  updateVinylIfUnchanged
};
