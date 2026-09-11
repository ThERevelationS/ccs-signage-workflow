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

function checklistSnapshotMap(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} could not verify the complete sub-template catalog.`);
  const map = new Map();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    const updatedDate = String(row?.updated_date || "").trim();
    if (!id || !updatedDate) throw new Error(`${label} requires complete loaded sub-template identities and versions.`);
    if (map.has(id)) throw new Error(`${label} found a duplicate sub-template id.`);
    map.set(id, { row, updatedDate });
  }
  return map;
}

function sameChecklistMembership(left, right) {
  if (left.size !== right.size) return false;
  for (const id of left.keys()) if (!right.has(id)) return false;
  return true;
}

export async function reorderChecklistSubItemsIfUnchanged({ entity, loadedRows = [], reorderedRows = [], readCurrentRows, label = "Checklist sub-template reorder" } = {}) {
  if (typeof readCurrentRows !== "function") throw new Error(`${label} requires a complete-catalog reader before reordering.`);
  const loadedById = checklistSnapshotMap(loadedRows, label);
  const reorderedById = checklistSnapshotMap(reorderedRows, label);
  if (!sameChecklistMembership(loadedById, reorderedById)) {
    throw new Error(`${label} could not verify the loaded row set.`);
  }
  for (const [id, loaded] of loadedById) {
    if (reorderedById.get(id)?.updatedDate !== loaded.updatedDate) {
      throw new Error(`${label} received a stale reordered row set.`);
    }
  }

  const liveRows = await readCurrentRows();
  const liveById = checklistSnapshotMap(liveRows, label);
  if (!sameChecklistMembership(loadedById, liveById)) {
    throw new Error(`${label} was blocked because the sub-template catalog changed in another session. Nothing was reordered.`);
  }
  for (const [id, loaded] of loadedById) {
    const live = liveById.get(id);
    if (live.updatedDate !== loaded.updatedDate || !sameValue(live.row.order, loaded.row.order)) {
      throw new Error(`${label} was blocked because ${loaded.row.name || id} changed in another session. Nothing was reordered.`);
    }
  }

  const desired = reorderedRows.map((row, index) => ({ row, order: index }));
  const saved = [];
  try {
    for (const step of desired) {
      const loaded = loadedById.get(step.row.id)?.row;
      const live = liveById.get(step.row.id)?.row;
      if (sameValue(loaded.order, step.order)) continue;
      const updated = await replaceEntityFieldsIfUnchanged({
        entity,
        id: loaded.id,
        expectedUpdatedAt: live.updated_date || "",
        expectedFields: { order: loaded.order },
        nextFields: { order: step.order },
        guardFields: { name: loaded.name },
        label: `${label}: ${loaded.name || loaded.id}`,
      });
      saved.push({ loaded, updated });
    }

    const finalRows = await readCurrentRows();
    const finalById = checklistSnapshotMap(finalRows, label);
    if (!sameChecklistMembership(reorderedById, finalById)) {
      throw new Error(`${label} changed membership during final verification.`);
    }
    for (let index = 0; index < reorderedRows.length; index += 1) {
      const current = finalById.get(reorderedRows[index].id)?.row;
      if (!current || !sameValue(current.order, index)) {
        throw new Error(`${label} final order changed before it could be verified.`);
      }
    }
    return finalRows;
  } catch (error) {
    if (saved.length === 0) throw error;
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
