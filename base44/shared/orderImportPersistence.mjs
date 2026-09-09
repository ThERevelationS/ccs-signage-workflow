function sameValue(a, b) {
  const leftEmpty = a === null || a === undefined || a === "";
  const rightEmpty = b === null || b === undefined || b === "";
  if (leftEmpty && rightEmpty) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class OrderImportConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderImportConflictError";
    this.code = "ORDER_IMPORT_CONFLICT";
  }
}

function requireLoadedOrder(order, label) {
  const id = String(order?.id || "").trim();
  const updatedDate = String(order?.updated_date || "").trim();
  if (!id || !updatedDate) {
    throw new Error(`${label} is missing its loaded Order version. Reload the import baseline before updating.`);
  }
  return { id };
}

function assertImportIdentityStable(current, loaded, nextFields, label) {
  if (current?.deleted === true) {
    throw new OrderImportConflictError(`${label} was moved to Order Trash while the import was running.`);
  }

  for (const field of ["customer_name", "description", "request_type", "work_order_id"]) {
    if (Object.prototype.hasOwnProperty.call(nextFields, field)) continue;
    if (!sameValue(current?.[field], loaded?.[field])) {
      throw new OrderImportConflictError(`${label} changed in another session (${field}). The import did not overwrite that change.`);
    }
  }
}

function targetFieldsConverged(record, nextFields) {
  return Object.entries(nextFields).every(([field, value]) => sameValue(record?.[field], value));
}

export async function replaceImportedOrderFieldsIfUnchanged({
  entity,
  order,
  nextFields,
  label = "Order import update",
  maxAttempts = 3,
} = {}) {
  const { id } = requireLoadedOrder(order, label);
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) {
      throw new OrderImportConflictError(`${label} no longer exists. The import did not recreate or overwrite it.`);
    }

    assertImportIdentityStable(current, order, desired, label);

    const alreadyDesired = targetFieldsConverged(current, desired);
    if (alreadyDesired) return { record: current, status: "already_desired" };

    for (const field of fieldNames) {
      if (!sameValue(current[field], order[field]) && !sameValue(current[field], desired[field])) {
        throw new OrderImportConflictError(`${label} changed in another session (${field}). The import did not overwrite that change.`);
      }
    }

    const currentVersion = String(current.updated_date || "").trim();
    if (!currentVersion) {
      throw new Error(`${label} is missing its current version. The import update was blocked.`);
    }

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: currentVersion },
        { $set: desired },
      );
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ""}`.trim());
      }
      if (afterError?.id) {
        assertImportIdentityStable(afterError, order, desired, label);
        if (targetFieldsConverged(afterError, desired)) {
          return { record: afterError, status: "converged_after_response_loss" };
        }
      }
      throw error;
    }

    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated > 1) {
      throw new Error(`${label} returned an impossible multi-record update count.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} succeeded but the Order could not be re-read.`);
      assertImportIdentityStable(saved, order, desired, label);
      if (!targetFieldsConverged(saved, desired)) {
        throw new OrderImportConflictError(`${label} changed again immediately after the import write. Reload before retrying.`);
      }
      return { record: saved, status: "updated" };
    }
  }

  throw new OrderImportConflictError(`${label} changed repeatedly while the import was saving it. Reload and retry the import.`);
}
