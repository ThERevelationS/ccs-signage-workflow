// scripts/.tmp-b44-stub.mjs
var base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };

// src/functions/generateDocNumber.js
var generateDocNumber = (payload) => base44.functions.invoke("generateDocNumber", payload);

// src/components/estimator/estimateCreationService.js
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
function buildDuplicateEstimate(source = {}, { keepEstimateNumber = false } = {}) {
  const clone = {};
  for (const [key, value] of Object.entries(source)) {
    if (DUPLICATE_EXCLUDE.has(key) || key.startsWith("_")) continue;
    clone[key] = value;
  }
  clone.status = "draft";
  clone.estimate_number = keepEstimateNumber ? String(source.estimate_number || "").trim() : "";
  clone.duplicated_from_estimate_id = source.id || "";
  return clone;
}
function estimateLineSelectionKey(line, index) {
  return line?.line_id || line?.builder_product_id || line?.project_id || `i${index}`;
}
function buildSplitEstimate(source = {}, { lineItemIds = [] } = {}) {
  const clone = buildDuplicateEstimate(source);
  const keep = new Set(lineItemIds);
  const lines = Array.isArray(source?.line_items) ? source.line_items : [];
  const selectedKeys = lines.map(estimateLineSelectionKey);
  if (!keep.size || [...keep].some((key) => selectedKeys.filter((candidate) => candidate === key).length !== 1)) {
    throw new Error("The selected products changed or have ambiguous identifiers. Reload and select them again.");
  }
  clone.line_items = lines.filter((line, index) => keep.has(selectedKeys[index]));
  clone.split_from_estimate_id = source.id || "";
  clone.project_name = `${source.project_name || source.estimate_number || "Estimate"} (split)`;
  return clone;
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
