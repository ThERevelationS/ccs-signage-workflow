import { buildSmartsheetDryRunPreview } from "../src/components/admin/smartsheetDryRunModel.js";
import {
  buildSmartsheetRolloutBaseline,
  buildSmartsheetRolloutPreview,
  classifySmartsheetRolloutRow,
} from "../src/components/admin/smartsheetRolloutModel.js";
import {
  buildCreateNewCustomerDecision,
  buildCustomerResolutionReviewGroups,
  buildUseExistingCustomerDecision,
  customerReviewDecisionKey,
  setCustomerReviewDecision,
} from "../src/components/admin/smartsheetCustomerResolutionReviewModel.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const salesBindings = {
  client_name: { column_id: "1" },
  title: { column_id: "2" },
  current_task_description: { column_id: "3" },
};

const salesBlueprint = [
  { field: "client_name", label: "Customer", direction: "two_way", transform: "customer_resolution" },
  { field: "title", label: "Job Description", direction: "two_way", transform: "text" },
  { field: "current_task_description", label: "Next Action", direction: "two_way", transform: "text" },
];

function salesRow(id, rowNumber, customer, title, task) {
  return {
    id,
    row_number: rowNumber,
    cells: [
      { column_id: "1", value: customer },
      { column_id: "2", value: title },
      { column_id: "3", value: task },
    ],
  };
}

const customers = [
  {
    id: "customer-1",
    company_name: "Acme Signs",
    legacy_client_names: ["Acme Old"],
  },
];

const salesPreview = buildSmartsheetDryRunPreview({
  sheetId: "8702703019812740",
  smartsheetRows: [
    salesRow("s1", 1, "Acme Old", "Old quote", "Lost"),
    salesRow("s2", 2, "Acme Old", "Second old quote", "Completed Sale"),
    salesRow("s3", 3, "Brand New Co", "Lobby signs", "Call Friday"),
    salesRow("s4", 4, "Maybe Current Co", "Wayfinding", "Closed loop follow up"),
  ],
  base44Rows: [],
  customers,
  blueprint: salesBlueprint,
  columnBindings: salesBindings,
  dataset: "sales",
});

assert(salesPreview.summary.new_record === 4, "All synthetic Workflow rows should remain proposals only.");
assert(salesPreview.customerSummary.exact_alias === 2, "Repeated approved aliases should remain row-level matches.");
assert(salesPreview.uniqueCustomerSummary.exact_alias === 1, "Repeated approved aliases must deduplicate to one customer decision.");
assert(salesPreview.rolloutPreview.summary.legacy_terminal === 2, "Only exact terminal task text should route to legacy/history.");
assert(salesPreview.rolloutPreview.summary.manual_backfill_review === 2, "Non-terminal preexisting Workflow rows must require manual review.");
assert(salesPreview.rolloutPreview.auto_create_eligible === 0, "Pre-rollout Workflow rows must never be automatically creatable.");

const closedLoop = classifySmartsheetRolloutRow({
  status: "new_record",
  row_id: "s5",
  row_number: 5,
  values: {
    client_name: "Safety Check Co",
    current_task_description: "Closed loop follow up",
  },
}, "sales");
assert(closedLoop.outcome === "manual_backfill_review", "Near-match task text must not be treated as a terminal history signal.");

const orderRollout = buildSmartsheetRolloutPreview({
  dataset: "orders",
  rows: [
    {
      status: "new_record",
      row_id: "o1",
      row_number: 10,
      values: { customer_name: "Acme Signs", description: "Old order" },
      customer_resolution: { outcome: "exact_company" },
    },
    {
      status: "new_record",
      row_id: "o2",
      row_number: 11,
      values: { customer_name: "Brand New Co", description: "Another old order" },
      customer_resolution: { outcome: "new_customer" },
    },
  ],
});

assert(orderRollout.summary.historical_external === 2, "Existing Order Request proposals must stay historical/external at rollout.");
assert(orderRollout.summary.manual_backfill_review === 0, "Order baseline rows should not silently become generic create candidates.");
assert(orderRollout.auto_create_eligible === 0, "Existing Order Request rows must not automatically repopulate Base44.");

const orderBaseline = buildSmartsheetRolloutBaseline({
  sheetId: "4963691473987460",
  sheetVersion: 44,
  capturedAt: "2026-09-22T22:00:00.000Z",
  rows: [
    { row_id: "o1" },
    { row_id: "o2" },
  ],
});
assert(orderBaseline.row_count === 2, "Baseline must preserve the complete unique row-ID count.");
assert(orderBaseline.sheet_version === 44, "Baseline must preserve the observed Smartsheet sheet version.");

const orderAfterBaseline = buildSmartsheetRolloutPreview({
  dataset: "orders",
  sheetId: "4963691473987460",
  baseline: orderBaseline,
  rows: [
    {
      status: "new_record",
      row_id: "o1",
      row_number: 10,
      values: { customer_name: "Acme Signs", description: "Old order" },
      customer_resolution: { outcome: "exact_company" },
    },
    {
      status: "new_record",
      row_id: "o2",
      row_number: 11,
      values: { customer_name: "Brand New Co", description: "Another old order" },
      customer_resolution: { outcome: "new_customer" },
    },
    {
      status: "new_record",
      row_id: "o3",
      row_number: 12,
      values: { customer_name: "Later Co", description: "Added after rollout" },
      customer_resolution: { outcome: "exact_company" },
    },
  ],
});
assert(orderAfterBaseline.baseline_state === "captured", "Matching sheet baseline must become authoritative for rollout classification.");
assert(orderAfterBaseline.summary.historical_external === 2, "Rows present at baseline must remain historical/external.");
assert(orderAfterBaseline.summary.post_baseline_new === 1, "Only unseen row IDs should classify as new after baseline.");
assert(orderAfterBaseline.creation_review_eligible === 1, "A post-baseline row may enter creation review.");
assert(orderAfterBaseline.auto_create_eligible === 0, "Post-baseline discovery must not itself perform or authorize automatic creation.");

const wrongSheetBaseline = buildSmartsheetRolloutPreview({
  dataset: "orders",
  sheetId: "111",
  baseline: orderBaseline,
  rows: [{
    status: "new_record",
    row_id: "o3",
    row_number: 12,
    values: { customer_name: "Later Co", description: "Added after rollout" },
  }],
});
assert(wrongSheetBaseline.baseline_state === "not_captured", "A baseline from a different sheet must never classify rows.");

let duplicateBaselineBlocked = false;
try {
  buildSmartsheetRolloutBaseline({
    sheetId: "4963691473987460",
    capturedAt: "2026-09-22T22:00:00.000Z",
    rows: [{ row_id: "dup" }, { row_id: "dup" }],
  });
} catch {
  duplicateBaselineBlocked = true;
}
assert(duplicateBaselineBlocked, "Duplicate or incomplete row identities must block baseline capture.");

const salesBaseline = buildSmartsheetRolloutBaseline({
  sheetId: "8702703019812740",
  capturedAt: "2026-09-22T22:00:00.000Z",
  rows: [{ row_id: "s1" }, { row_id: "s2" }, { row_id: "s3" }, { row_id: "s4" }],
});
const salesPostBaseline = classifySmartsheetRolloutRow({
  status: "new_record",
  row_id: "s5",
  row_number: 5,
  values: {
    client_name: "Later Sales Co",
    current_task_description: "Lost",
  },
}, "sales", {
  baseline: salesBaseline,
  sheetId: "8702703019812740",
});
assert(salesPostBaseline.outcome === "post_baseline_new", "A row first seen after baseline must not be silently routed into legacy history from task text.");

const reviewRollout = {
  baseline_state: "captured",
  classifications: [
    { row_id: "r-old", outcome: "historical_external" },
    { row_id: "r1", outcome: "post_baseline_new" },
    { row_id: "r2", outcome: "post_baseline_new" },
    { row_id: "r3", outcome: "post_baseline_new" },
  ],
};
const reviewRows = [
  {
    status: "new_record",
    row_id: "r-old",
    row_number: 20,
    values: { customer_name: "Historical Co" },
    customer_resolution: { outcome: "new_customer", reason: "No plausible existing Base44 Customer was found." },
  },
  {
    status: "new_record",
    row_id: "r1",
    row_number: 21,
    values: { customer_name: "Acme Old" },
    customer_resolution: {
      outcome: "exact_alias",
      recommended_customer_id: "customer-1",
      recommended_company_name: "Acme Signs",
      recommended_score: 99,
      candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 99, reasons: ["exact approved alias"] }],
    },
  },
  {
    status: "new_record",
    row_id: "r2",
    row_number: 22,
    values: { customer_name: "Acme Signz" },
    customer_resolution: {
      outcome: "close_review",
      recommended_customer_id: "customer-1",
      recommended_company_name: "Acme Signs",
      recommended_score: 88,
      candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 88, reasons: ["very similar company name"] }],
    },
  },
  {
    status: "new_record",
    row_id: "r3",
    row_number: 23,
    values: { customer_name: "Acme Signz" },
    customer_resolution: {
      outcome: "close_review",
      recommended_customer_id: "customer-1",
      recommended_company_name: "Acme Signs",
      recommended_score: 88,
      candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 88, reasons: ["very similar company name"] }],
    },
  },
];

const unresolvedReview = buildCustomerResolutionReviewGroups({
  rows: reviewRows,
  rolloutPreview: reviewRollout,
  dataset: "orders",
  sheetId: "4963691473987460",
});
assert(unresolvedReview.summary.total_unique === 2, "Only post-baseline names should enter the customer review queue.");
assert(unresolvedReview.summary.exact_existing === 1, "Exact company/alias matches should resolve without a manual review decision.");
assert(unresolvedReview.summary.needs_decision === 1, "Close/ambiguous/new customer names should require an explicit decision.");
const typoGroup = unresolvedReview.groups.find((group) => group.normalized_name === "acme signz");
assert(typoGroup?.row_count === 2, "Repeated post-baseline customer names must collapse to one review decision.");

const existingDecision = buildUseExistingCustomerDecision({
  group: typoGroup,
  customerId: "customer-1",
  companyName: "Acme Signs",
  rememberAlias: true,
  decidedAt: "2026-09-22T22:30:00.000Z",
});
assert(existingDecision.remember_alias === true, "A differently spelled approved existing match should preserve planned-alias intent.");

const typoDecisionKey = customerReviewDecisionKey({
  dataset: "orders",
  sheetId: "4963691473987460",
  normalizedName: typoGroup.normalized_name,
});
const reviewedState = setCustomerReviewDecision({ schema_version: 1, decisions: {} }, typoDecisionKey, existingDecision);
const decidedReview = buildCustomerResolutionReviewGroups({
  rows: reviewRows,
  rolloutPreview: reviewRollout,
  dataset: "orders",
  sheetId: "4963691473987460",
  reviewState: reviewedState,
});
assert(decidedReview.summary.needs_decision === 0, "A saved existing-Customer review decision should resolve the grouped name.");
assert(decidedReview.summary.decided_existing === 1, "Existing-Customer decisions must be counted separately.");
assert(decidedReview.groups.find((group) => group.normalized_name === "acme signz")?.decision?.customer_id === "customer-1", "Saved customer choice must be restored by stable review key.");

const newOnlyGroup = {
  key: "fresh customer",
  dataset: "orders",
  sheet_id: "4963691473987460",
  source_name: "Fresh Customer",
  normalized_name: "fresh customer",
};
const newDecision = buildCreateNewCustomerDecision({
  group: newOnlyGroup,
  decidedAt: "2026-09-22T22:31:00.000Z",
});
assert(newDecision.action === "create_new_customer", "New-Customer approval must remain an explicit review decision.");
assert(newDecision.proposed_company_name === "Fresh Customer", "New-Customer review must preserve the original Smartsheet name.");

console.log("Smartsheet rollout regression validation: PASS");
