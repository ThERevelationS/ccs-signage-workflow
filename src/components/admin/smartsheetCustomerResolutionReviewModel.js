import { normalizeCustomerText } from "./smartsheetCustomerResolutionModel.js";

export const DEFAULT_SMARTSHEET_CUSTOMER_REVIEW = Object.freeze({
  schema_version: 1,
  decisions: Object.freeze({}),
});

export function mergeSmartsheetCustomerReview(saved = {}) {
  return {
    schema_version: 1,
    ...(saved || {}),
    decisions: { ...(saved?.decisions || {}) },
  };
}

export function customerReviewDecisionKey({ dataset, sheetId, normalizedName } = {}) {
  const safeDataset = String(dataset || "").trim().toLowerCase();
  const safeSheetId = String(sheetId || "").trim();
  const safeName = normalizeCustomerText(normalizedName);
  if (!safeDataset || !safeSheetId || !safeName) return "";
  return `${safeDataset}|${safeSheetId}|${safeName}`;
}

function postBaselineRowIds(rolloutPreview) {
  return new Set(
    (rolloutPreview?.classifications || [])
      .filter((item) => item?.outcome === "post_baseline_new")
      .map((item) => String(item?.row_id || ""))
      .filter(Boolean),
  );
}

function rowCustomerName(row, dataset) {
  return dataset === "sales"
    ? String(row?.values?.client_name || "").trim()
    : String(row?.values?.customer_name || "").trim();
}

function validSavedDecision(decision, { dataset, sheetId, normalizedName } = {}) {
  if (!decision || typeof decision !== "object") return null;
  if (String(decision.dataset || "") !== String(dataset || "")) return null;
  if (String(decision.sheet_id || "") !== String(sheetId || "")) return null;
  if (normalizeCustomerText(decision.normalized_name) !== normalizeCustomerText(normalizedName)) return null;
  if (!["use_existing_customer", "create_new_customer"].includes(decision.action)) return null;
  if (decision.action === "use_existing_customer" && !String(decision.customer_id || "").trim()) return null;
  return decision;
}

export function buildCustomerResolutionReviewGroups({
  rows = [],
  rolloutPreview = null,
  dataset = "",
  sheetId = "",
  reviewState = DEFAULT_SMARTSHEET_CUSTOMER_REVIEW,
} = {}) {
  const eligibleRowIds = postBaselineRowIds(rolloutPreview);
  const groups = new Map();

  for (const row of rows || []) {
    const rowId = String(row?.row_id || "");
    if (!eligibleRowIds.has(rowId) || row?.status !== "new_record") continue;

    const sourceName = rowCustomerName(row, dataset);
    const normalizedName = normalizeCustomerText(sourceName);
    const key = normalizedName || "__missing_customer_name__";
    const resolution = row?.customer_resolution || null;
    const existing = groups.get(key) || {
      key,
      dataset,
      sheet_id: String(sheetId || ""),
      source_name: sourceName || "Missing customer name",
      normalized_name: normalizedName,
      row_count: 0,
      row_numbers: [],
      outcome: resolution?.outcome || "needs_name",
      reason: resolution?.reason || "",
      recommended_customer_id: resolution?.recommended_customer_id || "",
      recommended_company_name: resolution?.recommended_company_name || "",
      recommended_score: Number(resolution?.recommended_score || 0),
      candidates: Array.isArray(resolution?.candidates) ? resolution.candidates : [],
    };

    existing.row_count += 1;
    if (row?.row_number && existing.row_numbers.length < 20) existing.row_numbers.push(row.row_number);
    groups.set(key, existing);
  }

  const decisions = reviewState?.decisions || {};
  const result = [...groups.values()].map((group) => {
    const decisionKey = customerReviewDecisionKey({
      dataset,
      sheetId,
      normalizedName: group.normalized_name,
    });
    const savedDecision = validSavedDecision(decisions[decisionKey], {
      dataset,
      sheetId,
      normalizedName: group.normalized_name,
    });

    const exactResolution = ["exact_company", "exact_alias"].includes(group.outcome)
      && Boolean(group.recommended_customer_id);

    return {
      ...group,
      decision_key: decisionKey,
      decision: savedDecision,
      review_required: !exactResolution && group.outcome !== "needs_name",
      resolution_state: group.outcome === "needs_name"
        ? "blocked_missing_name"
        : savedDecision
          ? "decided"
          : exactResolution
            ? "exact_existing"
            : "needs_decision",
    };
  });

  const priority = {
    needs_decision: 0,
    blocked_missing_name: 1,
    decided: 2,
    exact_existing: 3,
  };
  result.sort((left, right) =>
    (priority[left.resolution_state] ?? 99) - (priority[right.resolution_state] ?? 99)
    || right.row_count - left.row_count
    || left.source_name.localeCompare(right.source_name));

  const summary = result.reduce((acc, group) => {
    acc.total_unique += 1;
    if (group.resolution_state === "exact_existing") acc.exact_existing += 1;
    if (group.resolution_state === "needs_decision") acc.needs_decision += 1;
    if (group.resolution_state === "blocked_missing_name") acc.blocked_missing_name += 1;
    if (group.decision?.action === "use_existing_customer") acc.decided_existing += 1;
    if (group.decision?.action === "create_new_customer") acc.decided_new += 1;
    return acc;
  }, {
    total_unique: 0,
    exact_existing: 0,
    needs_decision: 0,
    blocked_missing_name: 0,
    decided_existing: 0,
    decided_new: 0,
  });

  return { groups: result, summary };
}

export function buildUseExistingCustomerDecision({
  group,
  customerId,
  companyName,
  rememberAlias = false,
  decidedAt,
} = {}) {
  const safeCustomerId = String(customerId || "").trim();
  const safeCompanyName = String(companyName || "").trim();
  const safeDecidedAt = String(decidedAt || "").trim();
  if (!group?.normalized_name || !group?.dataset || !group?.sheet_id) {
    throw new Error("A post-baseline customer review group is required.");
  }
  if (!safeCustomerId || !safeCompanyName) throw new Error("Choose an existing Base44 Customer before saving this review decision.");
  if (!safeDecidedAt) throw new Error("A review decision timestamp is required.");

  return {
    action: "use_existing_customer",
    dataset: group.dataset,
    sheet_id: group.sheet_id,
    normalized_name: group.normalized_name,
    source_name: group.source_name,
    customer_id: safeCustomerId,
    company_name: safeCompanyName,
    remember_alias: Boolean(rememberAlias && normalizeCustomerText(group.source_name) !== normalizeCustomerText(safeCompanyName)),
    decided_at: safeDecidedAt,
  };
}

export function buildCreateNewCustomerDecision({ group, decidedAt } = {}) {
  const safeDecidedAt = String(decidedAt || "").trim();
  if (!group?.normalized_name || !group?.dataset || !group?.sheet_id) {
    throw new Error("A named post-baseline customer review group is required.");
  }
  if (!safeDecidedAt) throw new Error("A review decision timestamp is required.");

  return {
    action: "create_new_customer",
    dataset: group.dataset,
    sheet_id: group.sheet_id,
    normalized_name: group.normalized_name,
    source_name: group.source_name,
    proposed_company_name: group.source_name,
    decided_at: safeDecidedAt,
  };
}

export function setCustomerReviewDecision(reviewState, decisionKey, decision) {
  const safeKey = String(decisionKey || "").trim();
  if (!safeKey) throw new Error("A customer review decision key is required.");
  const current = mergeSmartsheetCustomerReview(reviewState);
  return {
    ...current,
    decisions: {
      ...current.decisions,
      [safeKey]: decision,
    },
  };
}

export function clearCustomerReviewDecision(reviewState, decisionKey) {
  const safeKey = String(decisionKey || "").trim();
  const current = mergeSmartsheetCustomerReview(reviewState);
  const decisions = { ...current.decisions };
  delete decisions[safeKey];
  return { ...current, decisions };
}
