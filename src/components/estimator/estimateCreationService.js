import { base44 } from "@/api/base44Client";

export function newEstimateCreationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `estimate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function ensureNewEstimate({ creationKey, estimate, sessionToken }) {
  const key = String(creationKey || "").trim();
  if (!key) throw new Error("Estimate creation key is required.");
  const response = await base44.functions.invoke("ensureNewEstimate", {
    creation_key: key,
    estimate,
    session_token: sessionToken,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.estimate?.id) throw new Error("The new Estimate could not be verified after creation.");
  return result.estimate;
}

// Fields that identify or audit the SOURCE estimate and must not carry over
// to a duplicate. The clone keeps project content, customer links, line_items,
// pricing waterfall inputs, and display settings; it restarts as a fresh
// draft with a new estimate_number and empty lifecycle/audit state.
const DUPLICATE_EXCLUDE = new Set([
  "id", "created_date", "updated_date", "created_by",
  "estimate_number", "status", "quote_version",
  "work_order_id", "customer_po",
  "internal_approval", "deleted", "deleted_at", "deleted_by",
  "accepted_at", "accepted_by_name", "accepted_by_email",
  "sent_at", "sent_to_email", "delivery_id",
  "quote_issue_date", "quote_issue_key", "quote_expiration_date",
  "revision_reason", "closed_revision_id",
  "pipeline_sync_pending", "pipeline_sync_error",
  "creation_request_key",
]);

export function buildDuplicateEstimate(source = {}) {
  const clone = {};
  for (const [key, value] of Object.entries(source)) {
    if (DUPLICATE_EXCLUDE.has(key) || key.startsWith("_")) continue;
    clone[key] = value;
  }
  clone.status = "draft";
  clone.estimate_number = "";
  return clone;
}

export async function duplicateEstimate({ source, sessionToken }) {
  if (!source?.id) throw new Error("The source estimate is not loaded.");
  const estimate = buildDuplicateEstimate(source);
  const created = await ensureNewEstimate({
    creationKey: newEstimateCreationKey(),
    estimate,
    sessionToken,
  });
  if (!created?.id) throw new Error("The duplicated estimate could not be verified after creation.");
  return created;
}
