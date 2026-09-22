import { normalizeCustomerText } from "./smartsheetCustomerResolutionModel.js";
import { buildCustomerResolutionReviewGroups } from "./smartsheetCustomerResolutionReviewModel.js";

const ORDER_REQUEST_TYPES = new Set(["substrate", "vinyl", "supplies", "other"]);

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function matchingBaseline(baseline, sheetId) {
  if (!baseline?.captured_at) return null;
  if (String(baseline.sheet_id || "") !== String(sheetId || "")) return null;
  const rowIds = Array.isArray(baseline.row_ids)
    ? baseline.row_ids.map((value) => String(value || "")).filter(Boolean)
    : [];
  if (!rowIds.length) return null;
  return { ...baseline, row_id_set: new Set(rowIds) };
}

function blocker(code, label, detail = "") {
  return { code, label, detail };
}

function requiredFieldBlockers(row, dataset) {
  const values = row?.values || {};
  const blockers = [];

  if (dataset === "sales") {
    if (!cleanText(values.client_name)) {
      blockers.push(blocker("missing_customer", "Customer missing", "WorkOrder requires Customer."));
    }
    if (!cleanText(values.title)) {
      blockers.push(blocker("missing_title", "Job Description missing", "WorkOrder requires Job Description."));
    }
    return blockers;
  }

  if (dataset === "orders") {
    if (!cleanText(values.customer_name)) {
      blockers.push(blocker("missing_customer", "Customer missing", "Order requires Customer."));
    }
    if (!cleanText(values.request_type)) {
      blockers.push(blocker("missing_request_type", "Request Type missing", "Order requires Request Type."));
    } else if (!ORDER_REQUEST_TYPES.has(cleanText(values.request_type).toLowerCase())) {
      blockers.push(blocker(
        "invalid_request_type",
        "Request Type invalid",
        `Expected Substrate, Vinyl, Supplies, or Other; found "${cleanText(values.request_type)}".`,
      ));
    }
    if (!cleanText(values.description)) {
      blockers.push(blocker("missing_description", "Description missing", "Order requires Description."));
    }
  }

  return blockers;
}

function customerStateForRow(row, dataset, reviewGroupsByName) {
  const name = dataset === "sales" ? row?.values?.client_name : row?.values?.customer_name;
  const normalizedName = normalizeCustomerText(name);
  if (!normalizedName) {
    return {
      ready: false,
      state: "missing_name",
      blocker: blocker("customer_name_missing", "Customer name missing", "Customer resolution cannot run without a customer name."),
    };
  }

  const group = reviewGroupsByName.get(normalizedName);
  if (!group) {
    return {
      ready: false,
      state: "review_missing",
      blocker: blocker("customer_review_missing", "Customer resolution missing", "Re-run Preview Rows so this post-baseline customer can be resolved."),
    };
  }

  if (group.resolution_state === "exact_existing") {
    return {
      ready: true,
      state: group.outcome === "exact_alias" ? "exact_alias" : "exact_existing",
      customer_id: group.recommended_customer_id || "",
      company_name: group.recommended_company_name || "",
    };
  }

  if (group.decision?.action === "use_existing_customer") {
    return {
      ready: true,
      state: "reviewed_existing",
      customer_id: group.decision.customer_id || "",
      company_name: group.decision.company_name || "",
      remember_alias: Boolean(group.decision.remember_alias),
    };
  }

  if (group.decision?.action === "create_new_customer") {
    return {
      ready: true,
      state: "approved_new_customer",
      proposed_company_name: group.decision.proposed_company_name || group.source_name,
    };
  }

  if (group.resolution_state === "blocked_missing_name") {
    return {
      ready: false,
      state: "missing_name",
      blocker: blocker("customer_name_missing", "Customer name missing", "Customer resolution cannot run without a customer name."),
    };
  }

  return {
    ready: false,
    state: "needs_decision",
    blocker: blocker("customer_review_required", "Customer review required", "Choose an existing Customer or explicitly approve a future new Customer."),
  };
}

export function buildSmartsheetCreationReadiness({
  rows = [],
  rolloutBaseline = null,
  rolloutPreview = null,
  dataset = "",
  sheetId = "",
  customerReviewState = null,
} = {}) {
  const baseline = matchingBaseline(rolloutBaseline, sheetId);
  if (!baseline) {
    return {
      state: "baseline_required",
      automatic_creates: 0,
      summary: {
        post_baseline_rows: 0,
        ready_for_controlled_create_review: 0,
        blocked_customer: 0,
        blocked_required_fields: 0,
        blocked_existing_record: 0,
        blocked_empty: 0,
      },
      rows: [],
    };
  }

  const customerReview = buildCustomerResolutionReviewGroups({
    rows,
    rolloutPreview,
    dataset,
    sheetId,
    reviewState: customerReviewState,
  });
  const reviewGroupsByName = new Map(
    (customerReview.groups || [])
      .filter((group) => group.normalized_name)
      .map((group) => [group.normalized_name, group]),
  );

  const postBaselineRows = (rows || []).filter((row) => {
    const rowId = String(row?.row_id || "");
    return Boolean(rowId && !baseline.row_id_set.has(rowId));
  });

  const readinessRows = postBaselineRows.map((row) => {
    const blockers = [];
    const rowId = String(row?.row_id || "");
    let customer = null;

    if (row.status === "linked_same" || row.status === "linked_different") {
      blockers.push(blocker(
        "already_linked",
        "Already linked",
        "This Smartsheet row already has a stable Base44 record link and must never create another record.",
      ));
    } else if (row.status === "candidate") {
      blockers.push(blocker(
        "existing_record_candidate",
        "Existing Base44 record candidate",
        "Review/link the existing candidate instead of creating a duplicate.",
      ));
    } else if (row.status === "ambiguous") {
      blockers.push(blocker(
        "existing_record_ambiguous",
        "Existing Base44 record ambiguous",
        `${Number(row.candidate_count || 0)} existing Base44 records are plausible. Resolve the record match before creation.`,
      ));
    } else if (row.status === "empty") {
      blockers.push(blocker("empty_row", "Empty row", "No meaningful mapped values are present."));
    } else if (row.status !== "new_record") {
      blockers.push(blocker("unknown_row_state", "Unknown row state", "This row is not in a safe new-record state."));
    }

    if (row.status === "new_record") {
      blockers.push(...requiredFieldBlockers(row, dataset));
      customer = customerStateForRow(row, dataset, reviewGroupsByName);
      if (!customer.ready && customer.blocker && !blockers.some((item) => item.code === customer.blocker.code)) {
        blockers.push(customer.blocker);
      }
    }

    const ready = row.status === "new_record" && blockers.length === 0;
    return {
      row_id: rowId,
      row_number: Number(row?.row_number || 0) || null,
      label: dataset === "sales"
        ? cleanText(row?.values?.client_name || row?.values?.title) || "Unnamed row"
        : cleanText(row?.values?.customer_name || row?.values?.description) || "Unnamed row",
      row_status: row.status,
      ready_for_controlled_create_review: ready,
      automatic_create_eligible: false,
      customer,
      blockers,
    };
  });

  const summary = readinessRows.reduce((acc, item) => {
    acc.post_baseline_rows += 1;
    if (item.ready_for_controlled_create_review) {
      acc.ready_for_controlled_create_review += 1;
      return acc;
    }
    if (item.blockers.some((entry) => ["customer_review_required", "customer_review_missing", "customer_name_missing", "missing_customer"].includes(entry.code))) {
      acc.blocked_customer += 1;
    }
    if (item.blockers.some((entry) => ["missing_title", "missing_request_type", "invalid_request_type", "missing_description"].includes(entry.code))) {
      acc.blocked_required_fields += 1;
    }
    if (item.blockers.some((entry) => ["already_linked", "existing_record_candidate", "existing_record_ambiguous"].includes(entry.code))) {
      acc.blocked_existing_record += 1;
    }
    if (item.blockers.some((entry) => entry.code === "empty_row")) {
      acc.blocked_empty += 1;
    }
    return acc;
  }, {
    post_baseline_rows: 0,
    ready_for_controlled_create_review: 0,
    blocked_customer: 0,
    blocked_required_fields: 0,
    blocked_existing_record: 0,
    blocked_empty: 0,
  });

  return {
    state: "ready",
    baseline_captured_at: baseline.captured_at,
    baseline_row_count: Number(baseline.row_count || baseline.row_id_set.size),
    automatic_creates: 0,
    summary,
    rows: readinessRows,
  };
}
