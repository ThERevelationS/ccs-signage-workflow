import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const cleanName = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

export function sameImportedValue(a, b) {
  const emptyA = a === undefined || a === null || a === "";
  const emptyB = b === undefined || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function importedPayloadMatches(record, payload) {
  return !!record && Object.entries(payload || {}).every(([field, value]) => sameImportedValue(record[field], value));
}

const canonicalRecord = (rows = []) => [...rows].sort((a, b) => {
  const dateCompare = String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
  return dateCompare || String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;

export async function createImportedInventoryRowSafely({
  entity,
  payload = {},
  nameField,
  name,
  label = "Imported inventory row",
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
      status: created?.id === only.id ? "created" : "recovered",
    };
  }

  if (after.length > 1) {
    const canonical = canonicalRecord(after);
    const ours = created?.id ? after.find((row) => row.id === created.id) : null;

    // Never delete another session's row. We may remove only our own row, and
    // only when it is deterministically the losing duplicate. If ours is the
    // canonical winner, leave the foreign loser untouched and fail closed so
    // that session can clean up its own row or an admin can review it.
    if (ours?.id && canonical?.id && ours.id !== canonical.id) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { [field]: ours[field] },
        label: `${label} concurrent duplicate cleanup`,
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
