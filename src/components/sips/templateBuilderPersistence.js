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
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || "");
    const bStamp = String(b?.created_date || "");
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function createChecklistSubItemIfAbsent({ entity, data, label = "Checklist sub-template" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ name });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => String(row?.name || "").trim().toLowerCase() === name.toLowerCase());
  };

  const before = await readMatches();
  if (before.length) return { record: canonical(before), status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, name });
  } catch (error) {
    createError = error;
  }

  const after = await readMatches();
  if (after.length === 1) {
    return { record: after[0], status: created?.id === after[0].id ? "created" : "recovered" };
  }
  if (after.length > 1) {
    const keep = canonical(after);
    if (created?.id && created.id !== keep?.id) {
      const createdRow = after.find((row) => row.id === created.id);
      if (createdRow) {
        await deleteEntityIfUnchanged({
          entity,
          record: createdRow,
          guardFields: { name: createdRow.name },
          label: `${label} duplicate cleanup`,
        });
        const finalRows = await readMatches();
        if (finalRows.length === 1) return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review the matching rows.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function updateChecklistSubItemIfUnchanged({ entity, record, nextFields, label = "Checklist sub-template" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    guardFields: { name: record.name },
    label,
  });
}

export async function deleteChecklistSubItemIfUnchanged({ entity, record, label = "Checklist sub-template" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { name: record.name },
    label,
  });
}

export async function reorderChecklistSubItemsIfUnchanged({ entity, loadedRows = [], reorderedRows = [], label = "Checklist sub-template reorder" } = {}) {
  const loadedById = new Map((loadedRows || []).map((row) => [row.id, row]));
  const desired = (reorderedRows || []).map((row, index) => ({ row, order: index }));
  if (desired.length !== loadedRows.length || desired.some(({ row }) => !loadedById.has(row.id))) {
    throw new Error(`${label} could not verify the loaded row set.`);
  }

  const liveRows = await Promise.all(desired.map(({ row }) => entity.get(row.id)));
  for (let i = 0; i < desired.length; i += 1) {
    const loaded = loadedById.get(desired[i].row.id);
    const live = liveRows[i];
    if (!live?.id || String(live.updated_date || "") !== String(loaded.updated_date || "") || !sameValue(live.order, loaded.order)) {
      throw new Error(`${label} was blocked because ${loaded.name || loaded.id} changed in another session.`);
    }
  }

  const saved = [];
  try {
    for (let i = 0; i < desired.length; i += 1) {
      const loaded = loadedById.get(desired[i].row.id);
      if (sameValue(loaded.order, desired[i].order)) continue;
      const updated = await replaceEntityFieldsIfUnchanged({
        entity,
        id: loaded.id,
        expectedUpdatedAt: liveRows[i].updated_date || "",
        expectedFields: { order: loaded.order },
        nextFields: { order: desired[i].order },
        guardFields: { name: loaded.name },
        label: `${label}: ${loaded.name || loaded.id}`,
      });
      saved.push({ loaded, updated });
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const step of [...saved].reverse()) {
      try {
        await replaceEntityFieldsIfUnchanged({
          entity,
          id: step.updated.id,
          expectedUpdatedAt: step.updated.updated_date || "",
          expectedFields: { order: step.updated.order },
          nextFields: { order: step.loaded.order },
          guardFields: { name: step.loaded.name },
          label: `${label} rollback: ${step.loaded.name || step.loaded.id}`,
        });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError?.message || "rollback failed");
      }
    }
    const suffix = rollbackErrors.length
      ? ` Some earlier order changes could not be rolled back safely: ${rollbackErrors.join("; ")}`
      : " Earlier order changes were rolled back.";
    throw new Error(`${error?.message || `${label} failed.`}${suffix}`);
  }

  return Promise.all(reorderedRows.map((row) => entity.get(row.id)));
}

export async function saveSettingMapEntryIfUnchanged({
  entity,
  settingRecord,
  entryKey,
  expectedEntry,
  nextEntry,
  remove = false,
  label = "Template setting entry",
  maxAttempts = 3,
} = {}) {
  const id = String(settingRecord?.id || "").trim();
  const key = String(entryKey || "").trim();
  if (!id || !key || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe map update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id || current.setting_key !== settingRecord.setting_key) {
      throw new Error(`${label} setting changed identity. Reload before saving.`);
    }
    const currentMap = current.setting_value && typeof current.setting_value === "object" && !Array.isArray(current.setting_value)
      ? current.setting_value
      : {};
    const currentEntry = currentMap[key];
    const desiredPresent = !remove;
    const alreadyDesired = remove ? !Object.prototype.hasOwnProperty.call(currentMap, key) : sameValue(currentEntry, nextEntry);
    if (alreadyDesired) return current;
    if (!sameValue(currentEntry, expectedEntry)) {
      throw new Error(`${label} changed in another session. Other template changes were preserved; reload this template before saving.`);
    }

    const nextMap = { ...currentMap };
    if (desiredPresent) nextMap[key] = nextEntry;
    else delete nextMap[key];

    const version = String(current.updated_date || "").trim();
    if (!version) throw new Error(`${label} is missing its current settings version.`);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: { setting_value: nextMap } });
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      const afterMap = afterError?.setting_value && typeof afterError.setting_value === "object" ? afterError.setting_value : {};
      const converged = remove ? !Object.prototype.hasOwnProperty.call(afterMap, key) : sameValue(afterMap[key], nextEntry);
      if (converged) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== "number") throw new Error(`${label} conditional settings update could not be verified.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} saved but could not be re-read.`);
      return saved;
    }
  }

  throw new Error(`${label} changed repeatedly while saving. Reload before retrying.`);
}
