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

// src/components/masterInventory/inventoryPersistence.js
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
function matchesPayload(row = {}, payload = {}) {
  return Object.entries(payload || {}).every(([field, value]) => sameValue(row?.[field], value));
}
async function createInventoryRecordWithRecovery({
  entity,
  data = {},
  nameField,
  label = "Inventory item"
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
async function deleteInventoryRecordIfUnchanged({
  entity,
  record,
  nameField,
  label = "Inventory item"
} = {}) {
  const field = String(nameField || "").trim();
  const guardFields = field && Object.prototype.hasOwnProperty.call(record || {}, field) ? { [field]: record[field] } : {};
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields,
    label
  });
}
export {
  createInventoryRecordWithRecovery,
  deleteInventoryRecordIfUnchanged
};
