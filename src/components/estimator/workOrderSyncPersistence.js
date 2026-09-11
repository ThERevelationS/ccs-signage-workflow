import { base44 } from "@/api/base44Client";

export async function createEstimateLinkedWorkOrderWithRecovery({
  entity,
  estimateId,
  data,
  convergeCreated,
  label = "Estimate-linked Work Order",
} = {}) {
  const linkedEstimateId = String(estimateId || "").trim();
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  if (
    !linkedEstimateId ||
    !payload ||
    String(payload.estimate_id || "").trim() !== linkedEstimateId ||
    typeof entity?.filter !== "function" ||
    typeof entity?.create !== "function"
  ) {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const before = await entity.filter({ estimate_id: linkedEstimateId });
  if (!Array.isArray(before)) {
    throw new Error(`${label} lookup did not return a Work Order list.`);
  }
  if (before.length > 0) {
    throw new Error(`${label} appeared in another session while this create was starting. Reload before continuing so an existing estimate-linked Work Order is not duplicated.`);
  }
  const beforeIds = new Set(before.map((row) => row?.id).filter(Boolean));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    return typeof convergeCreated === "function" ? convergeCreated(created) : created;
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  let after;
  try {
    after = await entity.filter({ estimate_id: linkedEstimateId });
  } catch (readError) {
    throw new Error(`${label} create response was unavailable and its recovery lookup also failed. Reload before retrying so an already-created Work Order is not duplicated. ${readError?.message || ""}`.trim());
  }
  if (!Array.isArray(after)) {
    throw new Error(`${label} recovery lookup did not return a Work Order list. Reload before retrying.`);
  }

  const newMatches = after.filter((row) => row?.id && !beforeIds.has(row.id));
  if (newMatches.length === 1) {
    return typeof convergeCreated === "function" ? convergeCreated(newMatches[0]) : newMatches[0];
  }
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No Work Orders were deleted because the losing create could not be identified safely; reload and review the estimate-linked jobs before retrying.`);
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No new estimate-linked Work Order was visible on the recovery read. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function deleteCreatedDuplicateWorkOrderIfUnchanged({
  entity,
  created,
  label = "Created duplicate Work Order",
} = {}) {
  const id = String(created?.id || "").trim();
  const expectedUpdatedAt = String(created?.updated_date || "").trim();
  const estimateId = String(created?.estimate_id || "").trim();
  if (!id || !expectedUpdatedAt || !estimateId || typeof entity?.get !== "function") {
    throw new Error(`${label} could not be identified safely for duplicate cleanup.`);
  }

  let response;
  try {
    response = await base44.functions.invoke("deleteCreatedDuplicateWorkOrder", {
      id,
      expected_updated_date: expectedUpdatedAt,
      estimate_id: estimateId,
    });
  } catch (error) {
    let afterError;
    try {
      afterError = await entity.get(id);
    } catch (verificationError) {
      throw new Error(`${label} delete response failed and the record's absence could not be verified. Reload before retrying duplicate cleanup. ${verificationError?.message || ""}`.trim());
    }
    if (!afterError) return { status: "confirmed_absent" };
    throw error;
  }

  const result = response?.data || response || {};
  if (result?.error) throw new Error(result.error);
  if (["deleted_now", "confirmed_absent", "already_absent"].includes(result?.status)) {
    return { status: result.status };
  }

  let after;
  try {
    after = await entity.get(id);
  } catch (verificationError) {
    throw new Error(`${label} cleanup returned an unknown result and the record's current state could not be verified. Reload before retrying duplicate cleanup. ${verificationError?.message || ""}`.trim());
  }
  if (!after) return { status: "confirmed_absent" };

  throw new Error(`${label} cleanup returned an unknown result, so the losing duplicate was left intact for review.`);
}

export function expectedWorkOrderFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}
