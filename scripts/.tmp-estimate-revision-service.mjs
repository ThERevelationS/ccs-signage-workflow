// stub:stub-base44
var base44 = { entities: {}, functions: {} };

// src/components/estimator/estimateLifecycle.js
var SYSTEM_FIELDS = /* @__PURE__ */ new Set(["id", "created_date", "updated_date", "created_by_id", "created_by", "edit_reason"]);
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function estimateAuditSnapshot(estimate = {}, { quoteTotal, internalCost } = {}) {
  const snapshot = {};
  Object.entries(estimate || {}).forEach(([key, value]) => {
    if (SYSTEM_FIELDS.has(key)) return;
    snapshot[key] = value;
  });
  snapshot.total_cost = internalCost === void 0 ? num(estimate.total_cost) : num(internalCost);
  snapshot.quote_total = quoteTotal === void 0 ? num(estimate.quote_total) : num(quoteTotal);
  return JSON.parse(JSON.stringify(snapshot));
}

// src/components/estimator/loadAllEntityRows.js
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
var RATE_LIMIT_MAX_RETRIES = 3;
var RATE_LIMIT_BASE_DELAY_MS = 1200;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}
async function withRateLimitRetry(fn) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (typeof error?.ccsGovernorRetried === "number") throw error;
      if (attempt < RATE_LIMIT_MAX_RETRIES && isRateLimitError(error)) {
        await sleep(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
var readCache = /* @__PURE__ */ new Map();
var CACHE_MAX_AGE_MS = 3e4;
async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog",
  cacheTtlMs = 0
} = {}) {
  const cacheKey = cacheTtlMs > 0 ? JSON.stringify([label, query, sort, pageSize, maxRows]) : null;
  if (cacheKey) {
    const hit = readCache.get(cacheKey);
    if (hit && Date.now() - hit.at < Math.min(cacheTtlMs, CACHE_MAX_AGE_MS)) return hit.rows;
  }
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const collected = [];
  const seen = /* @__PURE__ */ new Set();
  let skip = 0;
  while (skip < safeMaxRows) {
    const page = await withRateLimitRetry(
      () => hasFilter ? entity.filter(query, sort || void 0, safePageSize, skip) : entity.list(sort || void 0, safePageSize, skip)
    );
    if (!Array.isArray(page)) {
      throw new Error(`${label} could not be verified completely. Estimating was blocked rather than using a partial catalog.`);
    }
    for (let index = 0; index < page.length; index += 1) {
      const row = page[index];
      const key = rowIdentity(row, skip + index);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
    }
    if (page.length < safePageSize) {
      if (cacheKey) readCache.set(cacheKey, { at: Date.now(), rows: collected });
      return collected;
    }
    skip += safePageSize;
  }
  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
}

// src/components/estimator/estimatePersistence.js
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
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}
async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  const guardNames = Object.keys(guards);
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Estimate before saving.`);
    if ((current.deleted === true || expected.deleted === true) && !Object.prototype.hasOwnProperty.call(desired, "deleted")) {
      throw new Error(`${label} was blocked because this Estimate is in Trash. Restore it before saving. No Estimate fields were overwritten.`);
    }
    for (const fieldName of guardNames) {
      if (!sameValue(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Estimate version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} Estimate changed repeatedly while saving. Reload and try again.`);
}

// src/components/estimator/estimateRevisionService.js
var num2 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  const rows = await withRateLimitRetry(
    () => base44.entities.EstimateRevision.filter(
      { estimate_id: estimateId, revision_status: "open" },
      "-revision_number",
      50,
      0
    )
  ).catch(() => null);
  return (rows || [])[0] || null;
}
async function listEstimateRevisions(estimateId, { strict = false } = {}) {
  if (!estimateId) return [];
  try {
    const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId }, sort: "-revision_number", label: "Estimate revisions" });
    return (rows || []).slice().sort((a, b) => num2(b.revision_number) - num2(a.revision_number));
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}
async function startEstimateRevision({ estimate, reason, quoteTotal, internalCost, sessionToken = "" }) {
  if (!estimate?.id) throw new Error("Estimate is required to start a revision.");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A revision reason is required.");
  const existing = await getOpenEstimateRevision(estimate.id);
  if (existing) return existing;
  const response = await base44.functions.invoke("ensureOpenEstimateRevision", {
    estimate_id: estimate.id,
    expected_estimate_updated_date: estimate.updated_date || "",
    reason: cleanReason,
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after starting.");
  return result.revision;
}
async function completeEstimateRevision({ revision, estimate, sessionToken = "" }) {
  if (!revision?.id) return null;
  const estimateId = estimate?.id || revision.estimate_id || "";
  if (!estimateId) throw new Error("Estimate is required to complete a revision.");
  if (!sessionToken) {
    console.warn("Revision completion skipped \u2014 no session token; audit write deferred for reconciliation.");
    return null;
  }
  const response = await base44.functions.invoke("updateEstimateRevisionAudit", {
    action: "complete_manual_revision",
    estimate_id: estimateId,
    revision_id: revision.id,
    expected_revision_updated_date: revision.updated_date || "",
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after completion.");
  return result.revision;
}
async function ensureEstimateLifecycleRevision({ idempotencyKey = "", sessionToken = "", ...payload }) {
  const cleanKey = String(idempotencyKey || "").trim();
  const estimateId = payload.estimateAfter?.id || payload.estimateBefore?.id || "";
  if (!estimateId) throw new Error("Estimate is required for revision history.");
  if (!cleanKey) throw new Error("A stable lifecycle idempotency key is required.");
  const cleanReason = String(payload.reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  if (!sessionToken) {
    console.warn("Lifecycle revision skipped \u2014 no session token; audit write deferred for reconciliation.");
    return { id: "", skipped: true };
  }
  const before = estimateAuditSnapshot(payload.estimateBefore || {}, {
    quoteTotal: payload.quoteTotalBefore,
    internalCost: payload.internalCostBefore
  });
  const revisionPayload = {
    estimate_id: estimateId,
    revision_type: payload.revisionType || "status_transition",
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    previous_quote_total: num2(before.quote_total),
    previous_total_cost: num2(before.total_cost),
    estimate_snapshot_before: before,
    work_order_id: payload.workOrderId || "",
    delivery_evidence: payload.deliveryEvidence || {},
    notes: cleanKey,
    idempotency_key: cleanKey
  };
  const response = await base44.functions.invoke("ensureEstimateLifecycleRevision", {
    idempotency_key: cleanKey,
    revision: revisionPayload,
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate lifecycle revision could not be verified after recording.");
  return result.revision;
}
async function revertEstimateToRevision({
  estimateId,
  revisionId,
  sessionToken = "",
  entity = base44.entities.AllInOneEstimate
} = {}) {
  const id = String(estimateId || "").trim();
  if (!id) throw new Error("Estimate is required to revert.");
  const revId = String(revisionId || "").trim();
  if (!revId) throw new Error("A target revision is required to revert.");
  const [revision, estimate] = await Promise.all([
    base44.entities.EstimateRevision.get(revId),
    entity.get(id)
  ]);
  if (!revision?.id) throw new Error("The target revision could not be loaded \u2014 reload the revision history.");
  if (!estimate?.id) throw new Error("The estimate could not be loaded \u2014 reload before reverting.");
  if (String(revision.estimate_id || "") !== id) {
    throw new Error("That revision belongs to a different estimate.");
  }
  const snapshot = revision.estimate_snapshot_before;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Object.keys(snapshot).length) {
    throw new Error("This revision does not carry a restorable estimate snapshot.");
  }
  const nextFields = { ...snapshot, edit_reason: "" };
  const saved = await replaceEstimateFieldsIfUnchanged({
    entity,
    estimateId: id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate.updated_date },
    nextFields,
    label: `Estimate revert to revision ${revision.revision_number || revId}`
  });
  const revisionRow = await ensureEstimateLifecycleRevision({
    // Anchored on the pre-write version: a retry after a partial commit
    // re-reads the estimate (new updated_date → new key → a new audit row
    // is recorded rather than silently skipped).
    idempotencyKey: `revert:${revId}:${estimate.updated_date}`,
    sessionToken,
    estimateBefore: estimate,
    estimateAfter: saved,
    reason: `Reverted estimate to revision #${revision.revision_number || "?"} (${revision.reason || "no reason recorded"})`,
    revisionType: "revert",
    quoteTotalBefore: estimate.quote_total,
    quoteTotalAfter: snapshot.quote_total,
    internalCostBefore: estimate.total_cost,
    internalCostAfter: snapshot.total_cost,
    workOrderId: saved.work_order_id || estimate.work_order_id || ""
  });
  return { estimate: saved, revertRevision: revisionRow, targetRevision: revision };
}
var isEstimateAcceptanceSuperseded = (row) => String(row?.status || "accepted") === "superseded" || !!row?.superseded_at;
var activeEstimateAcceptances = (rows = []) => (Array.isArray(rows) ? rows : []).filter((row) => !isEstimateAcceptanceSuperseded(row));
var cleanQuoteRejectReason = (reason) => String(reason || "").trim().slice(0, 500);
var quoteRejectFollowUpKey = (estimateId) => `staff-reject-request:${String(estimateId || "").trim()}`;
var quoteRejectRevisionKey = (estimateId, expectedUpdatedAt = "") => `quote_reject:${String(estimateId || "").trim()}:${String(expectedUpdatedAt || "unknown").trim() || "unknown"}`;
var supersedeAcceptanceRevisionKey = (acceptanceId) => `supersede_acceptance:${String(acceptanceId || "").trim()}`;
async function attachQuoteDeliveryEvidenceToIssuanceRevision({ estimateId, quoteVersion, evidence, sessionToken = "" }) {
  const version = Math.max(0, Math.floor(num2(quoteVersion)));
  if (!estimateId || version <= 0 || !evidence) return { revision: null, warning: "" };
  if (!sessionToken) return { revision: null, warning: "Delivery evidence attach skipped \u2014 no session token." };
  const response = await base44.functions.invoke("updateEstimateRevisionAudit", {
    action: "attach_delivery_evidence",
    estimate_id: estimateId,
    quote_version: version,
    session_token: sessionToken,
    delivery_evidence: {
      delivery_id: evidence.deliveryId || "",
      gmail_message_id: evidence.gmailMessageId || "",
      recipient_email: evidence.recipientEmail || "",
      sent_at: evidence.sentAt || (/* @__PURE__ */ new Date()).toISOString(),
      attachment_file_url: evidence.archive?.fileUrl || "",
      attachment_sha256: evidence.archive?.sha256 || "",
      attachment_size_bytes: Number(evidence.archive?.sizeBytes || 0)
    }
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  return { revision: result?.revision || null, warning: result?.warning || "" };
}
export {
  activeEstimateAcceptances,
  attachQuoteDeliveryEvidenceToIssuanceRevision,
  cleanQuoteRejectReason,
  completeEstimateRevision,
  ensureEstimateLifecycleRevision,
  getOpenEstimateRevision,
  isEstimateAcceptanceSuperseded,
  listEstimateRevisions,
  quoteRejectFollowUpKey,
  quoteRejectRevisionKey,
  revertEstimateToRevision,
  startEstimateRevision,
  supersedeAcceptanceRevisionKey
};
