function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable(value[key]);
    return result;
  }, {});
}

function sameValue(a, b) {
  const emptyA = a === undefined || a === null || a === "";
  const emptyB = b === undefined || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

function matchesPayload(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue(row[field], value));
}

export async function createBuilderPartGroupWithRecovery({
  entity,
  data,
  label = "Builder Part Group",
} = {}) {
  const builderProductId = String(data?.builder_product_id || "").trim();
  const groupKey = String(data?.group_key || "").trim();
  if (!builderProductId || !groupKey || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const loadMatches = async () => {
    const rows = await entity.filter({ builder_product_id: builderProductId, group_key: groupKey });
    if (!Array.isArray(rows)) throw new Error(`${label} identity lookup did not return a record list.`);
    return rows.filter((row) =>
      String(row?.builder_product_id || "") === builderProductId &&
      String(row?.group_key || "") === groupKey
    );
  };

  const before = await loadMatches();
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows with the same Product/Group key. No row was changed; reload and review the duplicate Part Groups.`);
  }
  if (before.length === 1) {
    if (!matchesPayload(before[0], data)) {
      throw new Error(`${label} appeared concurrently with different data. The existing Part Group was not overwritten.`);
    }
    return { record: before[0], status: "existing" };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  let after;
  try {
    after = await loadMatches();
  } catch (verifyError) {
    if (created?.id && matchesPayload(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }

  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Group key. No uncertain Part Group was deleted; reload and review the duplicate groups.`);
  }
  if (after.length === 1) {
    if (!matchesPayload(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part Group was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered",
    };
  }

  if (created?.id && matchesPayload(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part Group was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}
