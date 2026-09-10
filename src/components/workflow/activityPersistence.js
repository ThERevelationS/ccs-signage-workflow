function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  const leftEmpty = a === null || a === undefined || a === "";
  const rightEmpty = b === null || b === undefined || b === "";
  if (leftEmpty && rightEmpty) return true;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue(record?.[field], value));
}

function failure(message, error = null) {
  return {
    logged: false,
    status: "not_logged",
    warning: [message, error?.message].filter(Boolean).join(" ").trim(),
  };
}

/**
 * ActivityLog is audit/telemetry attached to an already-completed business action.
 * A logging outage must never make the caller believe that the WorkOrder mutation
 * itself failed. This helper attempts exactly one create, recovers a lost response
 * when it can identify one newly-created exact audit row, and otherwise fails
 * closed without throwing or deleting audit records.
 */
export async function createActivityLogBestEffort({
  entity,
  data,
  label = "Activity log",
  settleMs = 40,
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const workOrderId = String(payload?.work_order_id || "").trim();
  const actionType = String(payload?.action_type || "").trim();
  const actorEmail = String(payload?.performed_by_email || "").trim();
  if (!payload || !workOrderId || !actionType || !actorEmail || typeof entity?.create !== "function") {
    return failure(`${label} could not initialize.`);
  }

  const canRecover = typeof entity?.filter === "function";
  const readMatches = async () => {
    const rows = await entity.filter(
      {
        work_order_id: workOrderId,
        action_type: actionType,
        performed_by_email: actorEmail,
      },
      "-created_date",
      200,
    );
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return an activity list.`);
    return rows.filter((row) => payloadMatches(row, payload));
  };

  let beforeIds = new Set();
  let recoveryAvailable = canRecover;
  if (canRecover) {
    try {
      const before = await readMatches();
      beforeIds = new Set(before.map((row) => row.id));
    } catch (error) {
      // Logging is best-effort. A failed preflight must not block the business
      // action or its notification, but it means response-loss recovery is unsafe.
      recoveryAvailable = false;
    }
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  if (created?.id) return { logged: true, status: "created", record: created, warning: "" };
  if (!recoveryAvailable) {
    return failure(
      `${label} could not be verified after its create attempt. The Work Order action remains saved; no logging retry was attempted.`,
      createError,
    );
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let after;
  try {
    after = await readMatches();
  } catch (error) {
    return failure(
      `${label} create outcome could not be verified. The Work Order action remains saved; do not repeat it just to recreate audit history.`,
      error,
    );
  }

  const newMatches = after.filter((row) => !beforeIds.has(row.id));
  if (newMatches.length === 1) {
    return { logged: true, status: "recovered", record: newMatches[0], warning: "" };
  }
  if (newMatches.length > 1) {
    return failure(
      `${label} may have been recorded more than once while its create response was unavailable. No ActivityLog row was deleted automatically.`,
    );
  }

  return failure(
    `${label} was not confirmed. The Work Order action remains saved; do not repeat the business action just to recreate the audit row.`,
    createError,
  );
}
