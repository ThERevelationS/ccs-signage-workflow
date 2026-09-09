import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalizeArray(value) {
  return Array.isArray(value) ? value : (value == null ? [] : [value]);
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function taskMatchesPayload(row, data) {
  if (!row) return false;
  return String(row.text || "") === String(data.text || "")
    && String(row.stage || "") === String(data.stage || "")
    && String(row.created_by_name || "") === String(data.created_by_name || "")
    && !!row.completed === !!data.completed
    && sameJson(normalizeArray(row.assigned_to), normalizeArray(data.assigned_to))
    && sameJson(row.sub_tasks || [], data.sub_tasks || []);
}

async function readMatchingTasks(entity, data, label) {
  if (typeof entity?.filter !== "function") throw new Error(`${label} cannot verify matching tasks.`);
  const rows = await entity.filter({ text: data.text });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a task list.`);
  return rows.filter((row) => taskMatchesPayload(row, data));
}

export async function createGeneralTaskWithRecovery({ entity, data, label = "General task" } = {}) {
  if (!String(data?.text || "").trim() || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const before = await readMatchingTasks(entity, data, label);
  const beforeIds = new Set(before.map((row) => row.id));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  const after = await readMatchingTasks(entity, data, label);
  const newMatches = after.filter((row) => !beforeIds.has(row.id));

  if (created?.id) {
    const exact = after.find((row) => row.id === created.id) || await entity.get?.(created.id).catch(() => null);
    if (exact?.id && taskMatchesPayload(exact, data)) return exact;
  }

  if (newMatches.length === 1) return newMatches[0];
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once concurrently. No task was deleted automatically; reload and review before retrying.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Do not retry blindly; reload tasks first.`);
}

export async function updateGeneralTaskIfUnchanged({ entity, task, nextFields, label = "General task" } = {}) {
  if (!task?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: task.id,
    expectedUpdatedAt: task.updated_date || "",
    expectedFields: expectedEntityFields(task, nextFields),
    nextFields,
    guardFields: { text: task.text },
    label,
  });
}

export async function deleteGeneralTaskIfUnchanged({ entity, task, label = "General task" } = {}) {
  if (!task?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record: task,
    guardFields: { text: task.text },
    label,
  });
}
