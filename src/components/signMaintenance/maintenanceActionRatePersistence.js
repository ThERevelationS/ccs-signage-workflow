import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function matchesPayload(row = {}, payload = {}) {
  return Object.entries(payload).every(([key, value]) => sameValue(row?.[key], value));
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const dateCompare = String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
    return dateCompare || String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function createMaintenanceActionRateIfAbsent({
  entity,
  payload,
  label = "Maintenance action rate",
} = {}) {
  const signType = String(payload?.sign_type || "").trim();
  const action = String(payload?.action || "").trim();
  if (!signType || !action || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ sign_type: signType, action });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => row?.sign_type === signType && row?.action === action);
  };

  const before = await readMatches();
  if (before.length === 1) return { record: before[0], status: "existing" };
  if (before.length > 1) {
    throw new Error(`${label} already has multiple rows for ${signType}/${action}. No row was changed.`);
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  const after = await readMatches();
  if (after.length === 1) {
    if (!matchesPayload(after[0], payload)) {
      throw new Error(`${label} was created concurrently with different values. Reload before saving again.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered",
    };
  }

  if (after.length > 1) {
    const keep = canonical(after);
    const ours = created?.id ? after.find((row) => row.id === created.id) : null;
    if (ours && ours.id !== keep?.id) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { sign_type: ours.sign_type, action: ours.action },
        label: `${label} concurrent duplicate cleanup`,
      });
      const finalRows = await readMatches();
      if (finalRows.length === 1) {
        return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review ${signType}/${action}.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether ${signType}/${action} was created. Reload before retrying.`);
}
