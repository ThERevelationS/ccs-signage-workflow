import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalized(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}

function stripMeta(row = {}) {
  const payload = { ...row };
  ["id", "created_date", "updated_date", "created_by_id"].forEach((key) => delete payload[key]);
  return payload;
}

function rowMatchesData(row, data) {
  return Object.entries(data || {}).every(([key, value]) => sameValue(row?.[key], value));
}

export async function createVinylRecordWithRecovery({ entity, data, label = "Vinyl inventory record" } = {}) {
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

export async function updateVinylIfUnchanged({ entity, record, nextFields, label = "Vinyl inventory record" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    guardFields: { vinyl_name: record.vinyl_name },
    label,
  });
}

export async function deleteVinylIfUnchanged({ entity, record, label = "Vinyl inventory record" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { vinyl_name: record.vinyl_name },
    label,
  });
}

export async function duplicateVinylSafely({
  entity,
  source,
  copyData,
  groupKey,
  label = "Vinyl inventory duplicate",
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
        label: `${label} source grouping`,
      });
    } catch (error) {
      if (copyResult.ownershipCertain) {
        try {
          await deleteVinylIfUnchanged({
            entity,
            record: copyResult.record,
            label: `${label} rollback copy`,
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

export { stripMeta as stripVinylRecordMeta };
