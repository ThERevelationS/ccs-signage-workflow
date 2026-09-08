import { expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

export async function setExclusiveBooleanSafely({
  entity,
  targetId,
  field,
  next,
  expectedTargetUpdatedAt = "",
  readRows,
  label = "exclusive selection",
} = {}) {
  if (!entity || !targetId || !field || typeof readRows !== "function") {
    throw new Error(`${label} could not initialize safely.`);
  }

  const before = await readRows();
  if (!Array.isArray(before)) throw new Error(`${label} could not verify the complete record set.`);
  const target = before.find((row) => row.id === targetId);
  if (!target?.id) throw new Error(`${label} target no longer exists. Reload before changing it.`);
  if (expectedTargetUpdatedAt && String(target.updated_date || "") !== String(expectedTargetUpdatedAt)) {
    throw new Error(`${label} target changed in another session. Reload before changing it.`);
  }

  let confirmedWrites = 0;
  let plannedWrites = 1;
  const targetPatch = { [field]: !!next };
  await replaceEntityFieldsIfUnchanged({
    entity,
    id: target.id,
    expectedUpdatedAt: target.updated_date || "",
    expectedFields: expectedEntityFields(target, targetPatch),
    nextFields: targetPatch,
    label: `${label} target`,
  });
  confirmedWrites += 1;

  if (next) {
    const afterTarget = await readRows();
    if (!Array.isArray(afterTarget)) {
      throw new Error(`${label} target was saved, but the complete record set could not be re-verified.`);
    }
    const others = afterTarget.filter((row) => row.id !== targetId && row[field] === true);
    plannedWrites += others.length;
    for (const row of others) {
      const clearPatch = { [field]: false };
      try {
        await replaceEntityFieldsIfUnchanged({
          entity,
          id: row.id,
          expectedUpdatedAt: row.updated_date || "",
          expectedFields: expectedEntityFields(row, clearPatch),
          nextFields: clearPatch,
          label: `${label} previous selection`,
        });
        confirmedWrites += 1;
      } catch (error) {
        throw new Error(`${label} stopped after ${confirmedWrites} of ${plannedWrites} required changes were confirmed. Reload before retrying; no remaining records were skipped automatically. ${error?.message || ""}`.trim());
      }
    }
  }

  const finalRows = await readRows();
  if (!Array.isArray(finalRows)) {
    throw new Error(`${label} changes were made, but final verification could not load the complete record set.`);
  }
  const finalTarget = finalRows.find((row) => row.id === targetId);
  if (!finalTarget || !!finalTarget[field] !== !!next) {
    throw new Error(`${label} could not verify the final target state. Reload before retrying.`);
  }
  if (next) {
    const primaries = finalRows.filter((row) => row[field] === true);
    if (primaries.length !== 1 || primaries[0].id !== targetId) {
      throw new Error(`${label} detected another concurrent selection during final verification. Reload before retrying.`);
    }
  }

  return { rows: finalRows, target: finalTarget, confirmedWrites, plannedWrites };
}

export async function replaceRelationshipIdsIfUnchanged({
  entity,
  row,
  field,
  nextIds,
  label = "equipment relationship",
} = {}) {
  if (!row?.id || !field || !Array.isArray(nextIds)) throw new Error(`${label} could not initialize safely.`);
  const patch = { [field]: nextIds };
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: row.id,
    expectedFields: expectedEntityFields(row, patch),
    nextFields: patch,
    label,
  });
}
