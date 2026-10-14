// SIPS browser acceptance uses only the local Vite fixture endpoint.
// No production Base44 client, credentials or live records are ever imported.
async function fixture(op, data = {}) {
  const response = await fetch("/__sips_fixture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ...data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Synthetic fixture request failed");
  return result;
}
// Match the current protected Work Order field-save API in this in-memory
// browser fixture. It never calls an actual Base44 backend function.
const equal = (a, b) => {
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return true;
  const normalize = value => Array.isArray(value) ? value.map(normalize) :
    value && typeof value === "object" ? Object.keys(value).sort().reduce((result, key) => {
      result[key] = normalize(value[key]);
      return result;
    }, {}) : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
};

async function syntheticFieldHistoryAction(request) {
  if (request?.action !== "save" || request.entity_type !== "WorkOrder" || !request.entity_id) {
    throw new Error("Unsupported isolated field-history request");
  }
  const before = await fixture("get", { id: request.entity_id });
  if (!before) return { data: { success: false, error: "Synthetic Work Order not found" } };
  const changed = Object.entries(request.next_fields || {}).find(([field, next]) =>
    !Object.hasOwn(request.expected_fields || {}, field) ||
    (!equal(before[field], request.expected_fields[field]) && !equal(before[field], next))
  );
  if (changed) return { data: { success: false, error: `This field changed in another session (${changed[0]}). Reload before saving.` } };
  const changedGuard = Object.entries(request.guard_fields || {}).find(([field, expected]) => !equal(before[field], expected));
  if (changedGuard) return { data: { success: false, error: "The record no longer matches its loaded state." } };
  // Mirror production's idempotent already-saved response: concurrent identical
  // submissions do not create a second write or strand the winning UI's focus.
  if (Object.entries(request.next_fields || {}).every(([field, next]) => equal(before[field], next))) {
    return { data: { success: true, record: before } };
  }
  try {
    const result = await fixture("updateMany", {
      query: { id: request.entity_id, updated_date: before.updated_date },
      patch: { $set: request.next_fields },
    });
    if (result.updated !== 1) {
      return { data: { success: false, error: "This record changed during saving. Reload before trying again." } };
    }
    const after = await fixture("get", { id: request.entity_id });
    if (!after) throw new Error("Synthetic saved Work Order disappeared");
    return { data: { success: true, record: after } };
  } catch (error) {
    return { data: { success: false, error: error.message } };
  }
}

export const base44 = {
  functions: {
    invoke: (name, request) => {
      if (name !== "fieldHistoryAction") throw new Error("Unexpected synthetic backend function: " + name);
      return syntheticFieldHistoryAction(request);
    },
  },
  entities: {
    WorkOrder: {
      filter: (query, sort, limit, skip) => fixture("list", { query, sort, limit, skip }),
      get: (id) => fixture("get", { id }),
      updateMany: (query, patch) => fixture("updateMany", { query, patch }),
    },
    AuthorizedEmail: { list: async () => [] },
    GlobalSettings: {
      filter: async (query) => query?.setting_key === "salesTaskDescriptions"
        ? [{ setting_key: "salesTaskDescriptions", setting_value: { items: [
          { text: "Synthetic install", page: "SIPs", wip: true },
        ] } }]
        : [],
    },
  },
};
