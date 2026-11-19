// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/estimateLifecycle.js
var PROTECTED_STATUSES = /* @__PURE__ */ new Set(["sent", "approved", "archived", "cancelled"]);
function isEstimateProtected(status) {
  return PROTECTED_STATUSES.has(String(status || ""));
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/estimateRevisionService.js
async function getOpenEstimateRevision() {
  return null;
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/estimateMutationGuard.js
var PENDING_TTL_MS = 24 * 60 * 60 * 1e3;
function getPendingEstimatePriceAcceptance(estimate) {
  const line = (estimate?.line_items || []).find((item) => {
    const pending = item?.price_acceptance_pending;
    if (!String(pending?.key || "").trim()) return false;
    const startedAt = Date.parse(pending?.started_at || "");
    if (Number.isFinite(startedAt) && Date.now() - startedAt > PENDING_TTL_MS) return false;
    return true;
  });
  return line ? { line, pending: line.price_acceptance_pending } : null;
}
async function assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt = "", allowPriceAcceptanceKey = "" } = {}) {
  if (!estimate?.id) throw new Error("Estimate could not be verified for this change.");
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(estimate.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error("This estimate changed in another session. Reload it before changing Products or Parts.");
  }
  const allowedKey = String(allowPriceAcceptanceKey || "").trim();
  const pendingEntry = getPendingEstimatePriceAcceptance(estimate);
  const pendingKey = String(pendingEntry?.pending?.key || "").trim();
  if (pendingKey && pendingKey !== allowedKey) {
    throw new Error("A Builder mutation is still being recovered for this Product. Resume that operation before changing Products or Parts.");
  }
  if (estimate.deleted === true) {
    throw new Error("This estimate is in Trash. Restore it before changing Products or Parts.");
  }
  const status = String(estimate.status || "draft");
  if (status === "cancelled") {
    throw new Error("This estimate is cancelled and permanently locked. Product or Part changes cannot be added.");
  }
  if (status === "archived") {
    throw new Error("This estimate is archived and locked. Restore it to an active status before changing Products or Parts.");
  }
  if (!isEstimateProtected(status)) return null;
  const revision = await getOpenEstimateRevision(estimate.id);
  if (!revision) {
    throw new Error(`This estimate is ${status} and protected. Start an Estimate Revision before adding Products or Parts.`);
  }
  return revision;
}

// .audit-work/foundation-o012-handoff/fixture/src/components/staff/staffEntities.js
var store = () => {
  if (!globalThis.__ccsEntities) globalThis.__ccsEntities = /* @__PURE__ */ new Map();
  return globalThis.__ccsEntities;
};
var table = (name) => {
  const s = store();
  if (!s.has(name)) s.set(name, /* @__PURE__ */ new Map());
  return s.get(name);
};
var clone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var notFound = () => Object.assign(new Error("Record not found."), { status: 404 });
var bump = () => globalThis.__ccsNow ? globalThis.__ccsNow() : (/* @__PURE__ */ new Date()).toISOString();
var matches = (row, query = {}) => Object.entries(query).every(([key, want]) => {
  if (key === "id") return row?.id === want;
  return JSON.stringify(row?.[key] ?? null) === JSON.stringify(want ?? null);
});
var applySet = (row, update = {}) => {
  const patch = update.$set || update;
  const next = { ...row, ...clone(patch) };
  next.updated_date = bump();
  return next;
};
var api = (name) => ({
  async get(id) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    return clone(row);
  },
  async filter(query = {}, _sort = void 0, _limit = void 0) {
    return [...table(name).values()].filter((r) => matches(r, query)).map(clone);
  },
  async list() {
    return [...table(name).values()].map(clone);
  },
  async create(data) {
    const id = data?.id || `${name}-${table(name).size + 1}-${Math.random().toString(36).slice(2, 8)}`;
    const now = bump();
    const row = { ...clone(data), id, created_date: data?.created_date || now, updated_date: data?.updated_date || now };
    table(name).set(id, row);
    return clone(row);
  },
  async update(id, data) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    const next = applySet(row, data);
    table(name).set(id, next);
    return clone(next);
  },
  async updateMany(query = {}, update = {}) {
    let updated = 0;
    for (const [id, row] of table(name)) {
      if (!matches(row, query)) continue;
      table(name).set(id, applySet(row, update));
      updated += 1;
    }
    return { updated };
  },
  async delete(id) {
    return table(name).delete(id);
  },
  async deleteMany(query = {}) {
    let deleted = 0;
    for (const [id, row] of table(name)) {
      if (matches(row, query)) {
        table(name).delete(id);
        deleted += 1;
      }
    }
    return { deleted };
  },
  async count(query = {}) {
    return [...table(name).values()].filter((r) => matches(r, query)).length;
  },
  subscribe() {
    return () => {
    };
  }
});
var cache = /* @__PURE__ */ new Map();
var staffEntities = new Proxy({}, {
  get(_, name) {
    if (typeof name !== "string") return void 0;
    if (!cache.has(name)) cache.set(name, api(name));
    return cache.get(name);
  }
});

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/builder/sourceProjectPersistence.js
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function sourcePatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}
async function preflightBuilderSourceMutation({ estimateId = "" } = {}) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate?.id) throw new Error("Estimate could not be verified before saving this Builder source.");
  await assertEstimateProductMutationAllowed(estimate);
  return estimate;
}
async function updateBuilderSourceProject({
  entity,
  sourceId,
  expectedUpdatedAt,
  data,
  estimateId = "",
  label = "Builder source project"
}) {
  if (!entity?.updateMany || !entity?.get || !sourceId) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = String(expectedUpdatedAt || "").trim();
  if (!expected) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }
  await preflightBuilderSourceMutation({ estimateId });
  const verified = (record) => !!record && record.id === sourceId && typeof record.updated_date === "string" && record.updated_date.length > 0 && sourcePatchMatches(record, data);
  const conflict = () => new Error(`${label} changed in another session. Reload it before saving.`);
  let result;
  try {
    result = await entity.updateMany(
      { id: sourceId, updated_date: expected },
      { $set: data }
    );
  } catch (error) {
    const current2 = await entity.get(sourceId).catch(() => null);
    if (verified(current2)) return current2;
    throw error;
  }
  if (!result || !Number.isInteger(result.updated) || result.updated !== 0 && result.updated !== 1) {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }
  if (result.updated === 1) {
    const saved = await entity.get(sourceId).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    if (!verified(saved)) throw conflict();
    return saved;
  }
  const current = await entity.get(sourceId).catch(() => null);
  if (verified(current)) {
    return current;
  }
  throw conflict();
}
export {
  preflightBuilderSourceMutation,
  sourcePatchMatches,
  updateBuilderSourceProject
};
