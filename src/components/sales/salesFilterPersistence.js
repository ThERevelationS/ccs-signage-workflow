import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalizeName(value) {
  return String(value || "").trim();
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || "");
    const bStamp = String(b?.created_date || "");
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

async function readNameTypeMatches(entity, name, type) {
  const rows = await entity.filter({ name, type });
  if (!Array.isArray(rows)) throw new Error("Sales filter lookup did not return a record list.");
  const wantedName = normalizeName(name).toLowerCase();
  return rows.filter((row) => normalizeName(row?.name).toLowerCase() === wantedName && row?.type === type);
}

export async function createSalesFilterIfAbsent({ entity, data, label = "Sales filter" } = {}) {
  const name = normalizeName(data?.name);
  const type = data?.type;
  if (!name || !type || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const before = await readNameTypeMatches(entity, name, type);
  if (before.length) return { record: canonical(before), status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, name });
  } catch (error) {
    createError = error;
  }

  const after = await readNameTypeMatches(entity, name, type);
  if (after.length === 1) {
    return { record: after[0], status: created?.id === after[0].id ? "created" : "recovered" };
  }
  if (after.length > 1) {
    const keep = canonical(after);
    if (created?.id && created.id !== keep?.id) {
      const ours = after.find((row) => row.id === created.id);
      if (ours) {
        await deleteEntityIfUnchanged({
          entity,
          record: ours,
          guardFields: { name: ours.name, type: ours.type },
          label: `${label} duplicate cleanup`,
        });
        const finalRows = await readNameTypeMatches(entity, name, type);
        if (finalRows.length === 1) return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review the matching records.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function createUniqueSalesFilterCopy({ entity, source, createdByName, label = "Sales filter copy" } = {}) {
  if (!source?.type) throw new Error(`${label} is missing its source filter type.`);
  const baseName = normalizeName(source.name) || "Filter";
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${index})`;
    const result = await createSalesFilterIfAbsent({
      entity,
      data: {
        name,
        type: source.type,
        conditions: source.conditions || [],
        column_settings: source.column_settings || [],
        is_standard: false,
        created_by_name: createdByName || "Unknown",
        selected_by: [],
      },
      label,
    });
    if (result.status !== "existing") return result;
  }
  throw new Error(`${label} could not find an unused copy name.`);
}

export async function updateSalesFilterIfUnchanged({ entity, record, nextFields, label = "Sales filter" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  if (record.is_standard) throw new Error(`${label} is a standard item and cannot be edited here.`);

  const nextName = normalizeName(nextFields?.name || record.name);
  const nextType = nextFields?.type || record.type;
  const collisions = await readNameTypeMatches(entity, nextName, nextType);
  if (collisions.some((row) => row.id !== record.id)) {
    throw new Error(`Another ${nextType === "column_preset" ? "column preset" : "filter"} named "${nextName}" already exists.`);
  }

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields: { ...nextFields, name: nextName },
    guardFields: { is_standard: false },
    label,
  });
}

export async function deleteSalesFilterIfUnchanged({ entity, record, label = "Sales filter" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  if (record.is_standard) throw new Error(`${label} is a standard item and cannot be deleted.`);
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { is_standard: false },
    label,
  });
}

export async function setSalesFilterSelectionSafely({
  entity,
  recordId,
  userEmail,
  selected,
  label = "Sales filter selection",
  maxAttempts = 3,
} = {}) {
  const id = String(recordId || "").trim();
  const email = String(userEmail || "").trim();
  if (!id || !email || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} no longer exists.`);
    if (current.is_standard) throw new Error(`${label} cannot modify a standard item.`);

    const selectedBy = Array.isArray(current.selected_by) ? current.selected_by : [];
    const hasEmail = selectedBy.includes(email);
    if (hasEmail === Boolean(selected)) return current;

    const nextSelectedBy = selected
      ? [...selectedBy, email]
      : selectedBy.filter((value) => value !== email);
    const version = String(current.updated_date || "").trim();
    if (!version) throw new Error(`${label} is missing its current record version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: version },
        { $set: { selected_by: nextSelectedBy } },
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      const afterSelectedBy = Array.isArray(afterError?.selected_by) ? afterError.selected_by : [];
      if (afterError?.id && afterSelectedBy.includes(email) === Boolean(selected)) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update could not be verified.`);
    }
    if (result.updated > 1) throw new Error(`${label} unexpectedly matched multiple records.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      const savedSelectedBy = Array.isArray(saved?.selected_by) ? saved.selected_by : [];
      if (!saved?.id || savedSelectedBy.includes(email) !== Boolean(selected)) {
        throw new Error(`${label} saved but could not be verified.`);
      }
      return saved;
    }
  }

  throw new Error(`${label} changed repeatedly while saving. Reload before retrying.`);
}
