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

// .audit-work/foundation-o012-handoff/fixture/src/api/base44Client.js
var base44 = {
  entities: new Proxy({}, { get: () => void 0 }),
  functions: { invoke: async () => ({ data: {} }) },
  auth: { me: async () => ({ email: "harness@test.local", role: "admin" }) },
  asServiceRole: { entities: new Proxy({}, { get: () => void 0 }) }
};

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

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/builder/builderMutationRecovery.js
function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}
var STALE_PENDING_BUILDER_MUTATION_MS = 24 * 60 * 60 * 1e3;

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/foundation/foundationSyncRecovery.js
var MAX_ID = 200;
var MAX_TS = 64;
var bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
function validateFoundationSyncAttempt(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.schema_version !== 1) return false;
  return bounded(a.key, MAX_ID) && bounded(a.source_project_id, MAX_ID) && bounded(a.estimate_id, MAX_ID) && bounded(a.requested_at, MAX_TS) && ISO_RE.test(a.requested_at) && !Number.isNaN(Date.parse(a.requested_at));
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/foundation/foundationBuilderRecovery.js
async function verifyFoundationRecoverySource({ sourceId, expectedSourceVersion }) {
  const saved = await staffEntities.FoundationProject.get(sourceId);
  if (saved?.id !== sourceId || !expectedSourceVersion || saved.updated_date !== expectedSourceVersion) {
    throw new Error("The Foundation project changed in another session. Reload it before recovering this Builder synchronization.");
  }
  return saved;
}
async function loadFoundationBuilderRecovery({ sourceId, estimateId, expectedSourceVersion }) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (estimate?.id !== estimateId) throw new Error("The linked estimate could not be verified before Builder recovery.");
  const line = (estimate.line_items || []).find((item) => item.module_key === "foundation" && item.project_id === sourceId);
  const pending = pendingBuilderMutation(line);
  if (!pending) return null;
  if (!line.builder_product_id || typeof pending.key !== "string" || pending.estimate_id !== estimateId || pending.builder_product_id !== line.builder_product_id || pending.estimate_line_id && (line.line_id || pending.line_patch?.line_id) && pending.estimate_line_id !== (line.line_id || pending.line_patch?.line_id)) {
    throw new Error("The pending Builder operation does not match this Foundation Product. Review it in the linked estimate.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  const sourceProject = await verifyFoundationRecoverySource({ sourceId, expectedSourceVersion });
  const receipt = sourceProject.builder_sync_attempt;
  if (receipt != null && (!validateFoundationSyncAttempt(receipt) || receipt.source_project_id !== sourceId || receipt.estimate_id !== estimateId)) {
    throw new Error("The saved Foundation sync receipt does not match this estimate. Reload and review it before recovery.");
  }
  const operationSourceVersion = pending.line_patch?.updated_date_snapshot || line.updated_date_snapshot;
  if (!operationSourceVersion || operationSourceVersion !== sourceProject.updated_date) {
    throw new Error("This Builder operation belongs to a different Foundation source revision. Reload and review it before recovery.");
  }
  return { sourceProject, pendingKey: pending.key };
}
export {
  loadFoundationBuilderRecovery,
  verifyFoundationRecoverySource
};
