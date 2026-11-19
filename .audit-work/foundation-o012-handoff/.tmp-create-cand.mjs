// .audit-work/foundation-o012-handoff/fixture/src/api/base44Client.js
var base44 = {
  entities: new Proxy({}, { get: () => void 0 }),
  functions: { invoke: async () => ({ data: {} }) },
  auth: { me: async () => ({ email: "harness@test.local", role: "admin" }) },
  asServiceRole: { entities: new Proxy({}, { get: () => void 0 }) }
};

// .audit-work/foundation-o012-handoff/fixture/src/functions/generateDocNumber.js
async function generateDocNumber() {
  return { data: { number: "EST-9001" } };
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/estimateMutationGuard.js
var PENDING_TTL_MS = 24 * 60 * 60 * 1e3;

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

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/builder/builderMutationRecovery.js
function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}
var STALE_PENDING_BUILDER_MUTATION_MS = 24 * 60 * 60 * 1e3;
function assertNoPendingLinesForCopy(lines = [], action = "copying sections") {
  const line = (lines || []).find((item) => pendingBuilderMutation(item));
  if (!line) return;
  const name = line.client_product_name || line.project_name || "A selected section";
  throw new Error(`"${name}" has a Builder mutation still being recovered. Resume it on this estimate before ${action}.`);
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/estimateCreationService.js
function newEstimateCreationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `estimate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function ensureNewEstimate({ creationKey, estimate, sessionToken, allowNumberReuse = false }) {
  const key = String(creationKey || "").trim();
  if (!key) throw new Error("Estimate creation key is required.");
  const response = await base44.functions.invoke("ensureNewEstimate", {
    creation_key: key,
    estimate,
    session_token: sessionToken,
    allow_estimate_number_reuse: allowNumberReuse === true
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.estimate?.id) throw new Error("The new Estimate could not be verified after creation.");
  return result.estimate;
}
var DUPLICATE_EXCLUDE = /* @__PURE__ */ new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "estimate_number",
  "status",
  "quote_version",
  "work_order_id",
  "customer_po",
  "internal_approval",
  "deleted",
  "deleted_at",
  "deleted_by",
  "accepted_at",
  "accepted_by_name",
  "accepted_by_email",
  "sent_at",
  "sent_to_email",
  "delivery_id",
  "quote_issue_date",
  "quote_issue_key",
  "quote_expiration_date",
  "revision_reason",
  "closed_revision_id",
  "edit_reason",
  "cancel_reason",
  "cancelled_at",
  "archived_at",
  "archived_reason",
  "is_template",
  "split_from_estimate_id",
  "duplicated_from_estimate_id",
  "last_product_removal_key",
  "last_product_removal_line_id",
  "last_product_removal_at",
  "pipeline_sync_pending",
  "pipeline_sync_error",
  "creation_request_key"
]);
var duplicateNumberByCreationKey = /* @__PURE__ */ new Map();
function buildDuplicateEstimate(source = {}, { keepEstimateNumber = false, skipPendingGuard = false } = {}) {
  const clone2 = {};
  for (const [key, value] of Object.entries(source)) {
    if (DUPLICATE_EXCLUDE.has(key) || key.startsWith("_")) continue;
    clone2[key] = value;
  }
  clone2.status = "draft";
  clone2.estimate_number = keepEstimateNumber ? String(source.estimate_number || "").trim() : "";
  clone2.duplicated_from_estimate_id = source.id || "";
  if (!skipPendingGuard) assertNoPendingLinesForCopy(clone2.line_items, "duplicating this estimate");
  return clone2;
}
function estimateLineSelectionKey(line, index) {
  return line?.line_id || line?.builder_product_id || line?.project_id || `i${index}`;
}
function buildSplitEstimate(source = {}, { lineItemIds = [] } = {}) {
  const clone2 = buildDuplicateEstimate(source, { skipPendingGuard: true });
  const keep = new Set(lineItemIds);
  const lines = Array.isArray(source?.line_items) ? source.line_items : [];
  const selectedKeys = lines.map(estimateLineSelectionKey);
  if (!keep.size || [...keep].some((key) => selectedKeys.filter((candidate) => candidate === key).length !== 1)) {
    throw new Error("The selected products changed or have ambiguous identifiers. Reload and select them again.");
  }
  clone2.line_items = lines.filter((line, index) => keep.has(selectedKeys[index]));
  assertNoPendingLinesForCopy(clone2.line_items, "splitting this estimate");
  clone2.split_from_estimate_id = source.id || "";
  clone2.project_name = `${source.project_name || source.estimate_number || "Estimate"} (split)`;
  return clone2;
}
async function splitEstimate({ source, lineItemIds, sessionToken, creationKey = newEstimateCreationKey() }) {
  if (!source?.id) throw new Error("The source estimate is not loaded.");
  if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) throw new Error("Select at least one line item to split.");
  const estimate = buildSplitEstimate(source, { lineItemIds });
  const created = await ensureNewEstimate({
    creationKey,
    estimate,
    sessionToken
  });
  if (!created?.id) throw new Error("The split estimate could not be verified after creation.");
  return created;
}
async function duplicateEstimate({ source, sessionToken, creationKey = newEstimateCreationKey(), keepEstimateNumber = false }) {
  if (!source?.id) throw new Error("The source estimate is not loaded.");
  const estimate = buildDuplicateEstimate(source, { keepEstimateNumber });
  if (!keepEstimateNumber) {
    if (!duplicateNumberByCreationKey.has(creationKey)) {
      const res = await generateDocNumber({ doc_type: "estimate", session_token: sessionToken });
      const number = String(res?.data?.number || res?.number || "").trim();
      if (!number) throw new Error("A new estimate number could not be issued.");
      duplicateNumberByCreationKey.set(creationKey, number);
    }
    estimate.estimate_number = duplicateNumberByCreationKey.get(creationKey);
  }
  const created = await ensureNewEstimate({
    creationKey,
    estimate,
    sessionToken,
    allowNumberReuse: keepEstimateNumber
  });
  if (!created?.id) throw new Error("The duplicated estimate could not be verified after creation.");
  return created;
}
export {
  buildDuplicateEstimate,
  buildSplitEstimate,
  duplicateEstimate,
  ensureNewEstimate,
  estimateLineSelectionKey,
  newEstimateCreationKey,
  splitEstimate
};
