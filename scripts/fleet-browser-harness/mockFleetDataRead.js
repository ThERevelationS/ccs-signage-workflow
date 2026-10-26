// Shared in-memory fleetDataRead router for synthetic browser acceptance.
// Mirrors the real function's { entity, query, sort, limit, skip } request and
// { success, items } response contract so page loaders exercise the same shape
// they get in production. Never imports a live Base44 client.
const clone = (value) => JSON.parse(JSON.stringify(value));
const getField = (row, key) => String(key).split(".").reduce((v, p) => (v == null ? v : v[p]), row);

const matchValue = (row, key, cond) => {
  const value = getField(row, key);
  if (cond && typeof cond === "object" && !Array.isArray(cond)) {
    if ("$in" in cond) return cond.$in.includes(value);
    if ("$ne" in cond) return value !== cond.$ne;
    if ("$gte" in cond) return value >= cond.$gte;
    if ("$lte" in cond) return value <= cond.$lte;
    if ("$gt" in cond) return value > cond.$gt;
    if ("$lt" in cond) return value < cond.$lt;
    if ("$regex" in cond) return new RegExp(cond.$regex, "i").test(String(value ?? ""));
    return value === cond;
  }
  return value === cond;
};

const matchRow = (row, query) => {
  if (!query || !Object.keys(query).length) return true;
  if (Array.isArray(query.$or) && !query.$or.some((q) => matchRow(row, q))) return false;
  if (Array.isArray(query.$and) && !query.$and.every((q) => matchRow(row, q))) return false;
  return Object.entries(query).every(([key, cond]) => key.startsWith("$") || matchValue(row, key, cond));
};

const sortRows = (rows, sort) => {
  if (!sort) return rows;
  const parts = String(sort).split(",").map((p) => p.trim()).filter(Boolean);
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const desc = part.startsWith("-");
      const key = desc ? part.slice(1) : part;
      const av = getField(a, key);
      const bv = getField(b, key);
      if (av === bv) continue;
      const cmp = av == null ? -1 : bv == null ? 1 : String(av) < String(bv) ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
};

// store: { EntityName: rows[] }. hooks.onRead(entity, request) can inject the
// latency/failure/counter behavior a suite needs (e.g. the work-order list hooks).
export function makeFleetDataRead(store, hooks = {}) {
  return async ({ entity, query, sort, limit = 500, skip = 0 }) => {
    if (!(entity in store)) throw new Error("Synthetic fleetDataRead: unregistered entity " + entity);
    if (hooks.onRead) await hooks.onRead(entity, { query, sort, limit, skip });
    const rows = sortRows(store[entity].filter((row) => matchRow(row, query)), sort);
    return { data: { success: true, items: clone(rows.slice(skip, skip + limit)) } };
  };
}

export const SYNTHETIC_SESSION_USER = {
  id: "synthetic-admin",
  email: "synthetic@example.test",
  full_name: "Synthetic Admin",
  role: "admin",
};

// verifySession handler matching EmailGate's restore contract.
export function verifySyntheticSession({ token }) {
  return token
    ? { data: { valid: true, user: clone(SYNTHETIC_SESSION_USER) } }
    : { data: { valid: false } };
}
