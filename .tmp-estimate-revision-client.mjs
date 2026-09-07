// v:@/api/base44Client
var base44 = new Proxy({}, { get(_t, p) {
  return globalThis.__clientBase44?.[p];
} });

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
function summarizeEstimateChanges(before = {}, after = {}) {
  const changes = [];
  if (String(before.status || "") !== String(after.status || "")) {
    changes.push(`Status: ${before.status || "draft"} \u2192 ${after.status || "draft"}`);
  }
  if (num(before.quote_version) !== num(after.quote_version)) {
    changes.push(`Customer quote issued: Version ${num(after.quote_version)} \xB7 ${after.quote_issue_date || "date not recorded"}`);
  }
  if (Math.abs(num(before.quote_total) - num(after.quote_total)) > 5e-3) {
    changes.push(`Customer quote total: ${num(before.quote_total).toFixed(2)} \u2192 ${num(after.quote_total).toFixed(2)}`);
  }
  if (Math.abs(num(before.total_cost) - num(after.total_cost)) > 5e-3) {
    changes.push(`Internal cost: ${num(before.total_cost).toFixed(2)} \u2192 ${num(after.total_cost).toFixed(2)}`);
  }
  if (JSON.stringify(before.line_items || []) !== JSON.stringify(after.line_items || [])) {
    changes.push("Product scope / Product pricing changed");
  }
  const quoteKeys = [
    "discount_percent",
    "contingency_percent",
    "tax_percent",
    "deposit_percent",
    "shipping_fee",
    "permit_fee",
    "hide_section_prices",
    "quote_title",
    "quote_intro_text",
    "scope_inclusions",
    "scope_exclusions",
    "payment_terms",
    "quote_terms_conditions",
    "warranty_text",
    "lead_time_text"
  ];
  if (quoteKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Customer quote settings / terms changed");
  }
  const detailKeys = [
    "project_name",
    "client_name",
    "customer_id",
    "po_number",
    "site_address",
    "order_contact",
    "contact_name",
    "contact_email",
    "contact_phone",
    "salesperson",
    "target_install_date",
    "priority",
    "tags"
  ];
  if (detailKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Estimate / customer details changed");
  }
  return changes.length ? changes : ["Estimate saved with no material customer-facing change detected"];
}

// src/components/estimator/quoteLifecycle.js
var whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
function quoteIssueKey(estimateId, quoteVersion) {
  const id = String(estimateId || "").trim();
  const version = Math.max(0, whole(quoteVersion));
  return id && version > 0 ? `estimate:${id}:quote:v${version}` : "";
}

// src/components/estimator/loadAllEntityRows.js
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog"
} = {}) {
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
    const page = hasFilter ? await entity.filter(query, sort || void 0, safePageSize, skip) : await entity.list(sort || void 0, safePageSize, skip);
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
    if (page.length < safePageSize) return collected;
    skip += safePageSize;
  }
  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
}

// src/components/estimator/estimateRevisionService.js
var num2 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
async function nextRevisionNumber(estimateId) {
  const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId }, sort: "revision_number", label: "Estimate revisions" });
  return Math.max(0, ...(rows || []).map((row) => num2(row.revision_number))) + 1;
}
async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId, revision_status: "open" }, sort: "revision_number", label: "Open Estimate revisions" });
  return (rows || []).slice().sort((a, b) => num2(b.revision_number) - num2(a.revision_number))[0] || null;
}
async function listEstimateRevisions(estimateId, { strict = false } = {}) {
  if (!estimateId) return [];
  try {
    const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId }, sort: "revision_number", label: "Estimate revisions" });
    return (rows || []).slice().sort((a, b) => num2(b.revision_number) - num2(a.revision_number));
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}
async function startEstimateRevision({ estimate, reason, quoteTotal, internalCost }) {
  if (!estimate?.id) throw new Error("Estimate is required to start a revision.");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A revision reason is required.");
  const existing = await getOpenEstimateRevision(estimate.id);
  if (existing) return existing;
  const before = estimateAuditSnapshot(estimate, { quoteTotal, internalCost });
  const quoteVersion = Math.max(0, Math.floor(num2(before.quote_version)));
  const revisionPayload = {
    estimate_id: estimate.id,
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimate.id, quoteVersion),
    revision_type: "manual_revision",
    revision_status: "open",
    reason: cleanReason,
    previous_status: before.status || "draft",
    new_status: before.status || "draft",
    previous_quote_total: num2(before.quote_total),
    new_quote_total: num2(before.quote_total),
    previous_total_cost: num2(before.total_cost),
    new_total_cost: num2(before.total_cost),
    change_summary: ["Revision opened \u2014 changes not yet finalized"],
    estimate_snapshot_before: before,
    estimate_snapshot_after: {},
    started_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const response = await base44.functions.invoke("ensureOpenEstimateRevision", {
    estimate_id: estimate.id,
    expected_estimate_updated_date: estimate.updated_date || "",
    reason: cleanReason,
    revision: revisionPayload
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after starting.");
  return result.revision;
}
async function completeEstimateRevision({ revision, estimate, quoteTotal, internalCost, workOrderId = "" }) {
  if (!revision?.id) return null;
  const current = await base44.entities.EstimateRevision.get(revision.id).catch(() => null);
  if (current?.revision_status === "completed") return current;
  const sourceRevision = current || revision;
  const before = sourceRevision.estimate_snapshot_before || {};
  const after = estimateAuditSnapshot(estimate, { quoteTotal, internalCost });
  const quoteVersion = Math.max(0, Math.floor(num2(after.quote_version)));
  const payload = {
    revision_status: "completed",
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimate.id || revision.estimate_id, quoteVersion),
    new_status: after.status || sourceRevision.previous_status || "draft",
    new_quote_total: num2(after.quote_total),
    new_total_cost: num2(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_after: after,
    completed_at: (/* @__PURE__ */ new Date()).toISOString(),
    work_order_id: workOrderId || sourceRevision.work_order_id || ""
  };
  const updated = await base44.entities.EstimateRevision.update(sourceRevision.id, payload);
  return { ...sourceRevision, ...payload, ...updated || {} };
}
async function recordEstimateLifecycleRevision({
  estimateBefore,
  estimateAfter,
  reason,
  revisionType = "status_transition",
  quoteTotalBefore,
  quoteTotalAfter,
  internalCostBefore,
  internalCostAfter,
  workOrderId = "",
  notes = "",
  deliveryEvidence = null
}) {
  if (!estimateBefore?.id && !estimateAfter?.id) throw new Error("Estimate is required for revision history.");
  const estimateId = estimateAfter?.id || estimateBefore.id;
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  const before = estimateAuditSnapshot(estimateBefore || {}, { quoteTotal: quoteTotalBefore, internalCost: internalCostBefore });
  const after = estimateAuditSnapshot(estimateAfter || {}, { quoteTotal: quoteTotalAfter, internalCost: internalCostAfter });
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const quoteVersion = Math.max(0, Math.floor(num2(after.quote_version)));
  return base44.entities.EstimateRevision.create({
    estimate_id: estimateId,
    revision_number: await nextRevisionNumber(estimateId),
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
    revision_type: revisionType,
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    new_status: after.status || "draft",
    previous_quote_total: num2(before.quote_total),
    new_quote_total: num2(after.quote_total),
    previous_total_cost: num2(before.total_cost),
    new_total_cost: num2(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_before: before,
    estimate_snapshot_after: after,
    started_at: timestamp,
    completed_at: timestamp,
    work_order_id: workOrderId || "",
    delivery_evidence: deliveryEvidence || {},
    notes: String(notes || "").trim()
  });
}
async function ensureEstimateLifecycleRevision({ idempotencyKey = "", ...payload }) {
  const cleanKey = String(idempotencyKey || "").trim();
  const estimateId = payload.estimateAfter?.id || payload.estimateBefore?.id || "";
  if (!estimateId) throw new Error("Estimate is required for revision history.");
  if (!cleanKey) return recordEstimateLifecycleRevision(payload);
  const cleanReason = String(payload.reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  const before = estimateAuditSnapshot(payload.estimateBefore || {}, {
    quoteTotal: payload.quoteTotalBefore,
    internalCost: payload.internalCostBefore
  });
  const after = estimateAuditSnapshot(payload.estimateAfter || {}, {
    quoteTotal: payload.quoteTotalAfter,
    internalCost: payload.internalCostAfter
  });
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const quoteVersion = Math.max(0, Math.floor(num2(after.quote_version)));
  const revisionPayload = {
    estimate_id: estimateId,
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
    revision_type: payload.revisionType || "status_transition",
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    new_status: after.status || "draft",
    previous_quote_total: num2(before.quote_total),
    new_quote_total: num2(after.quote_total),
    previous_total_cost: num2(before.total_cost),
    new_total_cost: num2(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_before: before,
    estimate_snapshot_after: after,
    started_at: timestamp,
    completed_at: timestamp,
    work_order_id: payload.workOrderId || "",
    delivery_evidence: payload.deliveryEvidence || {},
    notes: cleanKey,
    idempotency_key: cleanKey
  };
  const response = await base44.functions.invoke("ensureEstimateLifecycleRevision", {
    idempotency_key: cleanKey,
    revision: revisionPayload
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate lifecycle revision could not be verified after recording.");
  return result.revision;
}
async function attachQuoteDeliveryEvidenceToIssuanceRevision({ estimateId, quoteVersion, evidence }) {
  const version = Math.max(0, Math.floor(num2(quoteVersion)));
  if (!estimateId || version <= 0 || !evidence) return { revision: null, warning: "" };
  const issueKey = quoteIssueKey(estimateId, version);
  const rows = await loadAllEntityRows({
    entity: base44.entities.EstimateRevision,
    query: { estimate_id: estimateId, quote_issue_key: issueKey },
    sort: "revision_number",
    label: "Quote issuance revisions"
  });
  const issuanceRevision = (rows || []).find((row) => {
    const beforeVersion = Math.max(0, Math.floor(num2(row.estimate_snapshot_before?.quote_version)));
    const afterVersion = Math.max(0, Math.floor(num2(row.estimate_snapshot_after?.quote_version, row.quote_version)));
    return row.revision_status === "completed" && afterVersion === version && beforeVersion !== afterVersion;
  }) || null;
  if (!issuanceRevision) {
    return { revision: null, warning: `Quote Version ${version} was delivered, but its issuance revision could not be located for fallback delivery evidence.` };
  }
  const existingEvidence = issuanceRevision.delivery_evidence || {};
  if (existingEvidence.gmail_message_id || existingEvidence.delivery_id || existingEvidence.attachment_file_url) {
    return { revision: issuanceRevision, warning: "" };
  }
  const deliveryEvidence = {
    delivery_id: evidence.deliveryId || "",
    gmail_message_id: evidence.gmailMessageId || "",
    recipient_email: evidence.recipientEmail || "",
    sent_at: evidence.sentAt || (/* @__PURE__ */ new Date()).toISOString(),
    attachment_file_url: evidence.archive?.fileUrl || "",
    attachment_sha256: evidence.archive?.sha256 || "",
    attachment_size_bytes: Number(evidence.archive?.sizeBytes || 0)
  };
  const updated = await base44.entities.EstimateRevision.update(issuanceRevision.id, { delivery_evidence: deliveryEvidence });
  return { revision: { ...issuanceRevision, delivery_evidence: deliveryEvidence, ...updated || {} }, warning: "" };
}
export {
  attachQuoteDeliveryEvidenceToIssuanceRevision,
  completeEstimateRevision,
  ensureEstimateLifecycleRevision,
  getOpenEstimateRevision,
  listEstimateRevisions,
  recordEstimateLifecycleRevision,
  startEstimateRevision
};
