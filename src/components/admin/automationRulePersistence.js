import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || "");
    const bStamp = String(b?.created_date || "");
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function createAutomationRuleIfAbsent({ entity, data, label = "Automation Rule" } = {}) {
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
      const losing = after.find((row) => row.id === created.id);
      if (losing) {
        await deleteEntityIfUnchanged({
          entity,
          record: losing,
          guardFields: { name: losing.name },
          label: `${label} duplicate cleanup`,
        });
        const finalRows = await readMatches();
        if (finalRows.length === 1) return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review the matching rules.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function updateAutomationRuleIfUnchanged({ entity, record, nextFields, exactVersion = true, label = "Automation Rule" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: exactVersion ? record.updated_date || "" : "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    guardFields: { name: record.name },
    label,
  });
}

export async function deleteAutomationRuleIfUnchanged({ entity, record, label = "Automation Rule" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { name: record.name },
    label,
  });
}
