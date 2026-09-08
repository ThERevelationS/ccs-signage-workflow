import { base44 } from "@/api/base44Client";

const SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id",
]);

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

export function sanitizeWorkOrderFormPatch(formData = {}) {
  return Object.entries(formData || {}).reduce((patch, [key, value]) => {
    if (!SYSTEM_FIELDS.has(key)) patch[key] = value;
    return patch;
  }, {});
}

export function workOrderPatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}

export async function updateWorkOrderFromLoadedSnapshot({ workOrder, formData, label = "Work Order" }) {
  const entity = base44.entities.WorkOrder;
  const id = String(workOrder?.id || "").trim();
  const expectedUpdatedAt = String(workOrder?.updated_date || "").trim();
  if (!id || !entity?.updateMany || !entity?.get) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  if (!expectedUpdatedAt) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }

  const patch = sanitizeWorkOrderFormPatch(formData);
  let result;
  try {
    result = await entity.updateMany(
      { id, updated_date: expectedUpdatedAt },
      { $set: patch },
    );
  } catch (error) {
    const current = await entity.get(id).catch(() => null);
    if (current && workOrderPatchMatches(current, patch)) return current;
    throw error;
  }

  if (!result || typeof result.updated !== "number") {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }

  if (result.updated === 1) {
    const saved = await entity.get(id).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    return saved;
  }

  const current = await entity.get(id).catch(() => null);
  if (current && workOrderPatchMatches(current, patch)) {
    return current;
  }

  throw new Error(`${label} changed in another session. Reload it before saving. No Work Order fields were overwritten.`);
}
