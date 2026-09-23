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
import { buildSmartsheetCreationReadiness } from "../src/components/admin/smartsheetCreationReadinessModel.js";
import {
  analyzeSmartsheetColumns,
  buildVerifiedSmartsheetBinding,
} from "../src/components/admin/smartsheetMappingModel.js";
import {
  enforceSmartsheetBackendSafety,
  smartsheetWriteControlsLocked,
} from "../src/components/admin/smartsheetSyncSafetyModel.js";
import {
  buildSmartsheetBaselinePreflight,
  smartsheetAnalysisMatchesProfile,
  smartsheetDryRunMatchesAnalysis,
  smartsheetTargetIdentity,
} from "../src/components/admin/smartsheetMappingFreshnessModel.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const legacyUnsafeConfig = {
  global_enabled: true,
  observation_mode: false,
  backup_before_write: true,
  sales: {
    mirror_enabled: true,
    importer_enabled: true,
    pull_enabled: true,
    push_enabled: true,
    create_base44_from_smartsheet: true,
    create_smartsheet_from_base44: true,
  },
  orders: {
    mirror_enabled: true,
    importer_enabled: false,
    pull_enabled: true,
    push_enabled: true,
    create_base44_from_smartsheet: true,
    create_smartsheet_from_base44: true,
  },
};
const readOnlySafeConfig = enforceSmartsheetBackendSafety(legacyUnsafeConfig);
assert(readOnlySafeConfig.global_enabled === false, "Read-only backend must force global sync OFF.");
assert(readOnlySafeConfig.observation_mode === true, "Read-only backend must force observation mode ON.");
for (const dataset of ["sales", "orders"]) {
  for (const flag of ["mirror_enabled", "pull_enabled", "push_enabled", "create_base44_from_smartsheet", "create_smartsheet_from_base44"]) {
    assert(readOnlySafeConfig[dataset][flag] === false, `Read-only backend must force ${dataset}.${flag} OFF.`);
  }
}
assert(readOnlySafeConfig.sales.importer_enabled === true, "Backend safety must not silently disable the separate manual importer.");
assert(legacyUnsafeConfig.global_enabled === true && legacyUnsafeConfig.orders.pull_enabled === true,
  "Backend safety normalization must not mutate the loaded settings object.");
const writeCapableConfig = enforceSmartsheetBackendSafety(legacyUnsafeConfig, { writeBackendAvailable: true });
assert(writeCapableConfig.global_enabled === true && writeCapableConfig.orders.pull_enabled === true,
  "An explicitly write-capable backend may preserve configured write intent.");
assert(smartsheetWriteControlsLocked(null) === true, "Write controls must fail closed before backend status loads.");
assert(smartsheetWriteControlsLocked({ write_actions_available: false }) === true, "Read-only backend must lock write controls.");
assert(smartsheetWriteControlsLocked({ write_actions_available: true }) === false, "Write controls may unlock only after explicit backend capability.");

const mappingBlueprint = [
  { field: "customer", label: "Customer", direction: "two_way", transform: "customer_resolution", suggestedNames: [] },
  { field: "amount", label: "Estimate Amount", direction: "two_way", transform: "money", suggestedNames: [] },
  { field: "due", label: "Due Date", direction: "two_way", transform: "date", suggestedNames: [] },
  { field: "type", label: "Request Type", direction: "two_way", transform: "status_translation", suggestedNames: [] },
  { field: "internal", label: "Internal", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
];
const compatibleAnalysis = analyzeSmartsheetColumns(mappingBlueprint, [
  { id: "101", title: "Customer", type: "TEXT_NUMBER" },
  { id: "102", title: "Estimate Amount", type: "TEXT_NUMBER" },
  { id: "103", title: "Due Date", type: "DATE" },
  { id: "104", title: "Request Type", type: "PICKLIST", validation: true, options: ["Substrate", "Vinyl", "Supplies", "Other"] },
]);
assert(compatibleAnalysis.counts.matched === 4, "Compatible live columns should remain matched.");
assert(compatibleAnalysis.counts.incompatible === 0, "Compatible live columns must not be reported as incompatible.");
assert(compatibleAnalysis.counts.protected === 1, "Base44-only mapping fields must remain protected.");
const compatibleBinding = buildVerifiedSmartsheetBinding({
  status: "ready",
  sheet: { id: "8702703019812740", name: "Workflow" },
  analysis: compatibleAnalysis,
});
assert(Object.keys(compatibleBinding.column_bindings).length === 4, "Only compatible non-protected columns should bind.");

const incompatibleDate = analyzeSmartsheetColumns([
  { field: "due", label: "Due Date", direction: "two_way", transform: "date", suggestedNames: [] },
], [{ id: "201", title: "Due Date", type: "TEXT_NUMBER" }]);
assert(incompatibleDate.counts.incompatible === 1, "A date mapping must reject a same-title non-DATE column.");
assert(incompatibleDate.fields[0].compatibility.reason.includes("DATE"), "Date mismatch should explain the required column type.");
let incompatibleBindingBlocked = false;
try {
  buildVerifiedSmartsheetBinding({ status: "ready", sheet: { id: "1", name: "Test" }, analysis: incompatibleDate });
} catch {
  incompatibleBindingBlocked = true;
}
assert(incompatibleBindingBlocked, "Permanent binding must fail when any column match is type-incompatible.");

const systemManagedWrite = analyzeSmartsheetColumns([
  { field: "job", label: "Job Description", direction: "two_way", transform: "text", suggestedNames: [] },
], [{ id: "301", title: "Job Description", type: "TEXT_NUMBER", system_column_type: "AUTO_NUMBER" }]);
assert(systemManagedWrite.counts.incompatible === 1, "A future writable mapping must reject system-managed Smartsheet columns.");
assert(systemManagedWrite.fields[0].compatibility.reason.includes("System-managed"), "System-column mismatch should explain why binding is blocked.");

const salesMappingResult = {
  status: "ready",
  sheet: { id: "8702703019812740", name: "Workflow" },
  analysis: compatibleAnalysis,
};
const ordersMappingResult = {
  status: "ready",
  sheet: { id: "4963691473987460", name: "Order Request" },
  analysis: compatibleAnalysis,
};
const mappingConfig = {
  sales: { smartsheet_sheet_id: "8702703019812740", smartsheet_sheet_name: "Workflow" },
  orders: { smartsheet_sheet_id: "4963691473987460", smartsheet_sheet_name: "Order Request" },
};
assert(smartsheetTargetIdentity(mappingConfig.sales) === "id:8702703019812740", "Permanent sheet ID must be the target identity when present.");
assert(smartsheetAnalysisMatchesProfile(salesMappingResult, mappingConfig.sales) === true, "Fresh mapping evidence must match the configured permanent sheet ID.");
assert(smartsheetAnalysisMatchesProfile(salesMappingResult, { ...mappingConfig.sales, smartsheet_sheet_id: "999" }) === false,
  "Changing a configured sheet ID must stale the earlier live mapping analysis.");
const syntheticBindings = Object.fromEntries(Object.entries(compatibleBinding.column_bindings).map(([field, binding]) => [field, { ...binding }]));
const freshDryRun = {
  sales: {
    sheet_id: "8702703019812740", total_row_count: 2, returned_row_count: 2,
    column_bindings: syntheticBindings, preview: { rows: [{ row_id: "s1" }, { row_id: "s2" }] },
  },
  orders: {
    sheet_id: "4963691473987460", total_row_count: 2, returned_row_count: 2,
    column_bindings: syntheticBindings, preview: { rows: [{ row_id: "o1" }, { row_id: "o2" }] },
  },
};
assert(smartsheetDryRunMatchesAnalysis(freshDryRun.sales, salesMappingResult, mappingConfig.sales) === true,
  "Row preview must retain the exact live mapping column IDs it was built from.");
const readyPreflight = buildSmartsheetBaselinePreflight({
  dryRunPreview: freshDryRun,
  liveMappingAnalysis: { sales: salesMappingResult, orders: ordersMappingResult },
  config: mappingConfig,
});
assert(readyPreflight.ready === true, "Matching fresh mapping evidence and complete previews should pass baseline preflight.");
const changedTargetPreflight = buildSmartsheetBaselinePreflight({
  dryRunPreview: freshDryRun,
  liveMappingAnalysis: { sales: salesMappingResult, orders: ordersMappingResult },
  config: { ...mappingConfig, sales: { ...mappingConfig.sales, smartsheet_sheet_id: "999" } },
});
assert(changedTargetPreflight.ready === false, "Changing a target sheet after Preview Rows must block baseline capture.");
const changedBindingPreview = {
  ...freshDryRun.sales,
  column_bindings: { ...syntheticBindings, customer: { column_id: "different-column" } },
};
assert(smartsheetDryRunMatchesAnalysis(changedBindingPreview, salesMappingResult, mappingConfig.sales) === false,
  "Changing a preview binding must stale that preview against the live mapping analysis.");
const partialPreviewPreflight = buildSmartsheetBaselinePreflight({
  dryRunPreview: { ...freshDryRun, orders: { ...freshDryRun.orders, returned_row_count: 1 } },
  liveMappingAnalysis: { sales: salesMappingResult, orders: ordersMappingResult },
  config: mappingConfig,
});
assert(partialPreviewPreflight.ready === false, "A partial full-sheet preview must block baseline capture.");

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

const readinessBaseline = buildSmartsheetRolloutBaseline({
  sheetId: "4963691473987460",
  capturedAt: "2026-09-22T23:00:00.000Z",
  rows: [{ row_id: "base-order" }],
});
const readinessRows = [
  {
    status: "new_record",
    row_id: "ready-1",
    row_number: 31,
    values: { customer_name: "Acme Old", request_type: "Vinyl", description: "Print vinyl" },
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
    row_id: "customer-blocked",
    row_number: 32,
    values: { customer_name: "Needs Decision Co", request_type: "Supplies", description: "Tape" },
    customer_resolution: {
      outcome: "new_customer",
      recommended_customer_id: "",
      recommended_company_name: "",
      recommended_score: 0,
      candidates: [],
      reason: "No plausible existing Base44 Customer was found.",
    },
  },
  {
    status: "new_record",
    row_id: "field-blocked",
    row_number: 33,
    values: { customer_name: "Acme Old", request_type: "Vinyl", description: "" },
    customer_resolution: {
      outcome: "exact_alias",
      recommended_customer_id: "customer-1",
      recommended_company_name: "Acme Signs",
      recommended_score: 99,
      candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 99, reasons: ["exact approved alias"] }],
    },
  },
  {
    status: "candidate",
    row_id: "candidate-blocked",
    row_number: 34,
    candidate_count: 1,
    values: { customer_name: "Acme Signs", request_type: "Other", description: "Existing-looking row" },
  },
  {
    status: "new_record",
    row_id: "invalid-type",
    row_number: 35,
    values: { customer_name: "Acme Old", request_type: "Hardware", description: "Fasteners" },
    customer_resolution: {
      outcome: "exact_alias",
      recommended_customer_id: "customer-1",
      recommended_company_name: "Acme Signs",
      recommended_score: 99,
      candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 99, reasons: ["exact approved alias"] }],
    },
  },
];
const readinessRollout = buildSmartsheetRolloutPreview({
  dataset: "orders",
  sheetId: "4963691473987460",
  baseline: readinessBaseline,
  rows: readinessRows,
});
const readiness = buildSmartsheetCreationReadiness({
  rows: readinessRows,
  rolloutBaseline: readinessBaseline,
  rolloutPreview: readinessRollout,
  dataset: "orders",
  sheetId: "4963691473987460",
  customerReviewState: { schema_version: 1, decisions: {} },
});
assert(readiness.summary.post_baseline_rows === 5, "All row IDs absent from the baseline must be inspected by creation readiness.");
assert(readiness.summary.ready_for_controlled_create_review === 1, "Only the fully resolved, schema-complete row should be data-ready.");
assert(readiness.summary.blocked_customer === 1, "Unresolved post-baseline Customer must block future creation.");
assert(readiness.summary.blocked_required_fields === 2, "Missing Description and invalid Request Type must block future creation.");
assert(readiness.summary.blocked_existing_record === 1, "A post-baseline existing-record candidate must block duplicate creation.");
assert(readiness.automatic_creates === 0, "Readiness must never authorize automatic creation.");

const newCustomerReviewKey = customerReviewDecisionKey({
  dataset: "orders",
  sheetId: "4963691473987460",
  normalizedName: "Needs Decision Co",
});
const approvedNewState = setCustomerReviewDecision(
  { schema_version: 1, decisions: {} },
  newCustomerReviewKey,
  {
    action: "create_new_customer",
    dataset: "orders",
    sheet_id: "4963691473987460",
    normalized_name: "needs decision co",
    source_name: "Needs Decision Co",
    proposed_company_name: "Needs Decision Co",
    decided_at: "2026-09-22T23:01:00.000Z",
  },
);
const readinessAfterCustomerDecision = buildSmartsheetCreationReadiness({
  rows: readinessRows,
  rolloutBaseline: readinessBaseline,
  rolloutPreview: readinessRollout,
  dataset: "orders",
  sheetId: "4963691473987460",
  customerReviewState: approvedNewState,
});
assert(readinessAfterCustomerDecision.summary.ready_for_controlled_create_review === 2, "An explicit new-Customer review decision may clear only the Customer blocker.");
assert(readinessAfterCustomerDecision.automatic_creates === 0, "Even data-ready rows must remain non-automatic.");

const salesReadinessBaseline = buildSmartsheetRolloutBaseline({
  sheetId: "8702703019812740",
  capturedAt: "2026-09-22T23:02:00.000Z",
  rows: [{ row_id: "base-sales" }],
});
const salesReadinessRows = [{
  status: "new_record",
  row_id: "sales-missing-title",
  row_number: 40,
  values: { client_name: "Acme Old", title: "" },
  customer_resolution: {
    outcome: "exact_alias",
    recommended_customer_id: "customer-1",
    recommended_company_name: "Acme Signs",
    recommended_score: 99,
    candidates: [{ customer_id: "customer-1", company_name: "Acme Signs", score: 99, reasons: ["exact approved alias"] }],
  },
}];
const salesReadinessRollout = buildSmartsheetRolloutPreview({
  dataset: "sales",
  sheetId: "8702703019812740",
  baseline: salesReadinessBaseline,
  rows: salesReadinessRows,
});
const salesReadiness = buildSmartsheetCreationReadiness({
  rows: salesReadinessRows,
  rolloutBaseline: salesReadinessBaseline,
  rolloutPreview: salesReadinessRollout,
  dataset: "sales",
  sheetId: "8702703019812740",
});
assert(salesReadiness.summary.blocked_required_fields === 1, "WorkOrder Job Description is a real schema-required creation field.");

console.log("Smartsheet rollout regression validation: PASS");
