// src/components/estimator/builder/builderEntityPersistence.js
function isEntityNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || error?.response?.statusCode || error?.data?.status || 0);
  if (status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
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
var deleteEntityIfUnchanged = deleteBuilderEntityIfUnchanged;

// src/components/estimator/idempotentEntityCreate.js
var canonicalRecord = (rows = []) => [...rows].sort((a, b) => {
  const aStamp = String(a?.created_date || "");
  const bStamp = String(b?.created_date || "");
  if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function matchesPayload(row, payload) {
  return !!row && Object.entries(payload || {}).every(([field, value]) => sameValue(row[field], value));
}
function newCreationRequestKey(prefix = "create") {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${String(prefix || "create").trim()}:${token}`;
}
async function ensureIdempotentEntityCreate({
  entity,
  keyField = "idempotency_key",
  key,
  data,
  label = "Record"
} = {}) {
  const cleanField = String(keyField || "").trim();
  const cleanKey = String(key || "").trim();
  if (!entity?.filter || !entity?.create || !cleanField || !cleanKey) {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const payload = { ...data, [cleanField]: cleanKey };
  const load = async () => {
    const rows = await entity.filter({ [cleanField]: cleanKey });
    if (!Array.isArray(rows)) throw new Error(`${label} retry state could not be verified.`);
    return rows.filter((row) => String(row?.[cleanField] || "").trim() === cleanKey);
  };
  const existing = await load();
  if (existing.length > 1) {
    throw new Error(`${label} already has multiple records with this retry key. No row was deleted; reload and review the duplicates before continuing.`);
  }
  if (existing.length === 1) {
    if (!matchesPayload(existing[0], payload)) {
      throw new Error(`${label} retry key already belongs to a record with different data. No row was changed.`);
    }
    return existing[0];
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  let afterCreate;
  try {
    afterCreate = await load();
  } catch (verifyError) {
    if (created?.id && matchesPayload(created, payload)) return created;
    throw new Error(`${label} create outcome could not be verified. Do not retry blindly; reload first. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (afterCreate.length === 1) {
    if (!matchesPayload(afterCreate[0], payload)) {
      throw new Error(`${label} retry key exists but its live data does not match this create. No row was changed or deleted.`);
    }
    return afterCreate[0];
  }
  if (afterCreate.length > 1) {
    const keep = canonicalRecord(afterCreate);
    const ours = created?.id ? afterCreate.find((row) => row.id === created.id) : null;
    if (ours && ours.id !== keep?.id && matchesPayload(ours, payload)) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { [cleanField]: cleanKey },
        label: `${label} losing retry duplicate`
      });
      const finalRows = await load();
      if (finalRows.length === 1 && finalRows[0]?.id === keep?.id && matchesPayload(finalRows[0], payload)) {
        return finalRows[0];
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review records with this retry key.`);
  }
  if (created?.id && matchesPayload(created, payload)) return created;
  if (createError) {
    throw new Error(`${label} create failed and no matching record was visible on recovery read. Do not retry blindly; reload first. ${createError?.message || ""}`.trim());
  }
  throw new Error(`${label} create response could not be verified. Do not retry blindly; reload first.`);
}
export {
  ensureIdempotentEntityCreate,
  newCreationRequestKey
};
