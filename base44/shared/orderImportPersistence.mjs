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


export async function createImportedOrderWithRecovery({
  entity,
  data,
  readMatches,
  label = "Order import create",
  maxRateLimitRetries = 3,
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  if (!payload || typeof entity?.create !== "function" || typeof readMatches !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readVerifiedMatches = async (phase) => {
    const rows = await readMatches();
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} lookup did not return an Order list.`);
    const unique = [];
    const seen = new Set();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(row);
    }
    return unique;
  };

  const retries = Math.max(0, Math.min(5, Number(maxRateLimitRetries) || 0));
  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const before = await readVerifiedMatches("preflight");
    if (before.length > 1) {
      throw new OrderImportConflictError(`${label} found multiple existing Orders with the same import identity. No new Order was created.`);
    }
    if (before.length === 1) {
      return { record: before[0], status: "reused" };
    }

    let created = null;
    let createError = null;
    try {
      created = await entity.create(payload);
    } catch (error) {
      createError = error;
    }

    if (created?.id) return { record: created, status: "created" };

    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    let after;
    try {
      after = await readVerifiedMatches("recovery");
    } catch (verificationError) {
      throw new Error(
        `${label} create response was unavailable and its recovery lookup also failed. ` +
        `Do not retry blindly; reload the import state first. ${verificationError?.message || ""}`.trim()
      );
    }

    if (after.length === 1) return { record: after[0], status: "recovered" };
    if (after.length > 1) {
      throw new OrderImportConflictError(
        `${label} may have been created more than once during concurrent processing or while the create response was unavailable. ` +
        `No Orders were deleted; review the matching rows before retrying.`
      );
    }

    if (createError?.status === 429 && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 2000));
      continue;
    }
    if (createError) {
      const error = new Error(
        `${createError?.message || `${label} could not be created.`} No matching Order was visible after recovery checks. ` +
        `Reload the import state before retrying.`
      );
      if (createError?.status) error.status = createError.status;
      throw error;
    }
    throw new Error(`${label} could not verify whether the Order was created. Reload the import state before retrying.`);
  }

  throw new Error(`${label} exhausted its retry-safe create attempts.`);
}
