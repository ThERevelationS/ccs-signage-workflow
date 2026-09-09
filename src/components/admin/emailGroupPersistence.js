import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalizedName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function fieldsMatch(record, desired) {
  return Object.entries(desired || {}).every(([field, value]) => JSON.stringify(normalize(record?.[field])) === JSON.stringify(normalize(value)));
}

async function listGroups(entity) {
  if (typeof entity?.list !== "function") throw new Error("Email groups could not be loaded safely.");
  const rows = await entity.list("-created_date", 500);
  if (!Array.isArray(rows)) throw new Error("Email group lookup did not return a record list.");
  return rows;
}

function groupNameMatches(rows, name, excludeId = "") {
  const wanted = normalizedName(name);
  return rows.filter(row => row?.id !== excludeId && normalizedName(row?.name) === wanted);
}

export async function createEmailGroupIfAbsent({ entity, data, label = "Email group" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name || !Array.isArray(data?.emails) || data.emails.length === 0) {
    throw new Error(`${label} requires a name and at least one email address.`);
  }

  const before = await listGroups(entity);
  const existing = groupNameMatches(before, name);
  if (existing.length > 1) throw new Error(`${label} name "${name}" already has duplicate records. No group was changed.`);
  if (existing.length === 1) return { record: existing[0], status: "existing" };
  const beforeIds = new Set(before.map(row => row?.id).filter(Boolean));

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, name });
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const verified = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : created;
    if (verified?.id && fieldsMatch(verified, { ...data, name })) return { record: verified, status: "created" };
  }

  const after = await listGroups(entity).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  const matches = groupNameMatches(after, name);
  if (matches.length === 1) {
    const only = matches[0];
    if (!fieldsMatch(only, { ...data, name })) {
      throw new Error(`${label} name "${name}" was created concurrently with different values. Reload before editing it.`);
    }
    return { record: only, status: beforeIds.has(only.id) ? "existing" : "recovered" };
  }
  if (matches.length > 1) {
    throw new Error(`${label} name "${name}" was created concurrently more than once. No group was deleted automatically; reload and review the duplicates.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the group was created. Reload before retrying.`);
}

export async function updateEmailGroupIfUnchanged({ entity, group, nextFields, label = "Email group" } = {}) {
  if (!group?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const rows = await listGroups(entity);
  const duplicates = groupNameMatches(rows, nextFields?.name, group.id);
  if (duplicates.length > 0) throw new Error(`Another email group named "${nextFields.name}" already exists.`);

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: group.id,
    expectedUpdatedAt: group.updated_date || "",
    expectedFields: expectedEntityFields(group, nextFields),
    nextFields,
    guardFields: {},
    label,
  });
}

function ruleReferencesGroup(rule, groupId) {
  return (rule?.actions || []).some(action =>
    (action?.action_config?.recipients || []).some(recipient => recipient?.type === "email_group" && recipient?.value === groupId)
  );
}

export async function deleteEmailGroupIfUnused({ entity, automationRuleEntity, group, label = "Email group deletion" } = {}) {
  if (!group?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  if (typeof automationRuleEntity?.list === "function") {
    const rules = await automationRuleEntity.list("-updated_date", 500);
    const references = (rules || []).filter(rule => ruleReferencesGroup(rule, group.id));
    if (references.length > 0) {
      const names = references.slice(0, 3).map(rule => rule.name || rule.id).join(", ");
      throw new Error(`${label} is still referenced by ${references.length} automation rule${references.length === 1 ? "" : "s"}${names ? ` (${names})` : ""}. Remove those references before deleting the group.`);
    }
  }

  return deleteEntityIfUnchanged({
    entity,
    record: group,
    guardFields: {},
    label,
  });
}
