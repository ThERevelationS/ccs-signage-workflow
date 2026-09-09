import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || "");
    const bStamp = String(b?.created_date || "");
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

async function readNameMatches(entity, name, label) {
  const rows = await entity.filter({ name });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a template list.`);
  const target = normalizeName(name);
  return rows.filter((row) => normalizeName(row?.name) === target);
}

export async function createTaskTemplateIfAbsent({ entity, data, label = "Task template" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const before = await readNameMatches(entity, name, label);
  if (before.length) return { record: canonical(before), status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, name });
  } catch (error) {
    createError = error;
  }

  const after = await readNameMatches(entity, name, label);
  if (after.length === 1) {
    return { record: after[0], status: created?.id === after[0].id ? "created" : "recovered" };
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once. No template was deleted automatically; reload and review the duplicate names.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function updateTaskTemplateIfUnchanged({ entity, template, nextFields, label = "Task template" } = {}) {
  if (!template?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: template.id,
    expectedUpdatedAt: template.updated_date || "",
    expectedFields: expectedEntityFields(template, nextFields),
    nextFields,
    guardFields: { name: template.name },
    label,
  });
}

export async function deleteTaskTemplateIfUnchanged({ entity, template, label = "Task template" } = {}) {
  if (!template?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record: template,
    guardFields: { name: template.name },
    label,
  });
}
