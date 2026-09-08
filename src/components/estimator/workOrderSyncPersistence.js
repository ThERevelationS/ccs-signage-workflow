export async function deleteCreatedDuplicateWorkOrderIfUnchanged({
  entity,
  created,
  label = "Created duplicate Work Order",
} = {}) {
  const id = String(created?.id || "").trim();
  const expectedUpdatedAt = String(created?.updated_date || "").trim();
  if (!id || !expectedUpdatedAt || typeof entity?.deleteMany !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not be identified safely for duplicate cleanup.`);
  }

  const query = { id, updated_date: expectedUpdatedAt };
  const estimateId = String(created?.estimate_id || "").trim();
  if (estimateId) query.estimate_id = estimateId;

  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    if (!afterError) return { status: "already_absent" };
    throw error;
  }

  if (!result || typeof result.deleted !== "number") {
    throw new Error(`${label} deletion result could not be verified.`);
  }
  if (result.deleted === 1) return { status: "deleted_now" };
  if (result.deleted > 1) {
    throw new Error(`${label} deletion matched more than one Work Order unexpectedly.`);
  }

  const after = await entity.get(id).catch(() => null);
  if (!after) return { status: "already_absent" };

  throw new Error(`${label} changed after it was created, so the losing duplicate was left intact for review instead of being deleted.`);
}

export function expectedWorkOrderFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}
