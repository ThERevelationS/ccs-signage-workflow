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
  if (!leftEmpty && !rightEmpty && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue(record?.[field], value));
}

export async function createBuilderProductWithRecovery({
  entity,
  data,
  label = "Builder Product",
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const estimateId = String(payload?.estimate_id || "").trim();
  const lineId = String(payload?.estimate_line_id || "").trim();
  if (!payload || !estimateId || !lineId || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readIdentity = async (phase) => {
    const rows = await entity.filter({ estimate_id: estimateId, estimate_line_id: lineId });
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} did not return a Builder Product list.`);
    return rows;
  };

  const before = await readIdentity("preflight");
  if (before.length > 1) {
    throw new Error(`${label} found multiple Products for the same Estimate line. No Product was changed; reload and review the duplicate Builder Products.`);
  }
  if (before.length === 1) {
    throw new Error(`${label} appeared in another session while this create was starting. Reload the Estimate before continuing so the existing Product is reconciled normally.`);
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let after;
  try {
    after = await readIdentity("recovery");
  } catch (verificationError) {
    if (created?.id) return { record: created, status: "created_unverified_identity" };
    throw new Error(
      `${label} create response was unavailable and its recovery lookup also failed. ` +
      `Do not retry blindly; reload the Estimate first. ${verificationError?.message || ""}`.trim()
    );
  }

  if (after.length > 1) {
    throw new Error(
      `${label} may have been created more than once by simultaneous Estimate activity. ` +
      `No Builder Product was deleted automatically; reload and review the duplicate Estimate-line Products before continuing.`
    );
  }

  if (after.length === 1) {
    const only = after[0];
    if (created?.id) {
      if (String(only.id) === String(created.id)) return { record: only, status: "created" };
      throw new Error(`${label} returned a create receipt, but a different Product owns the Estimate-line identity. No Product was deleted; reload before continuing.`);
    }
    if (payloadMatches(only, payload)) return { record: only, status: "recovered" };
    throw new Error(
      `${label} create response was unavailable and a different Product now owns the Estimate-line identity. ` +
      `Reload the Estimate so that Product can be reconciled without overwriting it.`
    );
  }

  if (created?.id) return { record: created, status: "created_unverified_identity" };
  if (createError) {
    throw new Error(
      `${createError?.message || `${label} could not be created.`} No matching Builder Product was visible after recovery. ` +
      `Reload the Estimate before retrying.`
    );
  }
  throw new Error(`${label} could not verify whether the Builder Product was created. Reload the Estimate before retrying.`);
}
