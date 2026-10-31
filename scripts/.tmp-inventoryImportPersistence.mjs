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

// src/components/masterInventory/inventoryImportPersistence.js
var cleanName = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameImportedValue(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function importedPayloadMatches(record, payload) {
  return !!record && Object.entries(payload || {}).every(([field, value]) => sameImportedValue(record[field], value));
}
var canonicalRecord = (rows = []) => [...rows].sort((a, b) => {
  const dateCompare = String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
  return dateCompare || String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;
async function createImportedInventoryRowSafely({
  entity,
  payload = {},
  nameField,
  name,
  label = "Imported inventory row"
} = {}) {
  const field = String(nameField || "").trim();
  const expectedName = cleanName(name ?? payload?.[field]);
  if (!field || !expectedName || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe create.`);
  }
  const readMatches = async () => {
    const rows = await entity.filter({ [field]: payload[field] });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => cleanName(row?.[field]) === expectedName);
  };
  const before = await readMatches();
  if (before.length) {
    return { record: canonicalRecord(before), status: "existing" };
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  const after = await readMatches();
  if (after.length === 1) {
    const only = after[0];
    if (!importedPayloadMatches(only, payload)) {
      throw new Error(`${label} name appeared concurrently with different stored values. Refresh the import preview before retrying.`);
    }
    return {
      record: only,
      status: created?.id === only.id ? "created" : "recovered"
    };
  }
  if (after.length > 1) {
    const canonical = canonicalRecord(after);
    const ours = created?.id ? after.find((row) => row.id === created.id) : null;
    if (ours?.id && canonical?.id && ours.id !== canonical.id) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { [field]: ours[field] },
        label: `${label} concurrent duplicate cleanup`
      });
      const finalRows = await readMatches();
      if (finalRows.length === 1 && finalRows[0]?.id === canonical.id) {
        return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
      throw new Error(`${label} removed this import's losing duplicate, but the same-name set is still ambiguous. Refresh the import preview before retrying.`);
    }
    throw new Error(`${label} was created concurrently more than once. No foreign or canonical row was deleted; refresh the import preview and review the duplicate names.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the row was created. Refresh the import preview before retrying.`);
}
export {
  createImportedInventoryRowSafely,
  importedPayloadMatches,
  sameImportedValue
};
