import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

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

function matchesPayload(row = {}, payload = {}) {
  return Object.entries(payload).every(([field, value]) => sameValue(row?.[field], value));
}

export async function createFeatureReportWithRecovery({ entity, data, label = "Feature report" } = {}) {
  const title = String(data?.title || "").trim();
  if (!title || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ title });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => matchesPayload(row, data));
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
    return { record: saved?.id ? saved : created, status: "created" };
  }

  const after = await readMatches();
  const newMatches = after.filter((row) => !beforeIds.has(row.id));
  if (newMatches.length === 1) return { record: newMatches[0], status: "recovered" };
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No report was deleted; reload and review matching reports before retrying.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function updateFeatureReportFields({ entity, record, nextFields, label = "Feature report" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is missing its loaded version. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date,
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    label,
  });
}

export async function deleteFeatureReportSafely({ entity, record, label = "Feature report" } = {}) {
  return deleteEntityIfUnchanged({
    entity,
    record,
    label,
  });
}
