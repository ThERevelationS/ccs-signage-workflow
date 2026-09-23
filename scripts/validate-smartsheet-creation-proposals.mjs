import { strict as assert } from "node:assert";
import { SMARTSHEET_MAPPING_BLUEPRINTS } from "../src/components/admin/smartsheetMappingModel.js";
import { buildSmartsheetRolloutBaseline, buildSmartsheetRolloutPreview } from "../src/components/admin/smartsheetRolloutModel.js";
import { buildSmartsheetCreationReadiness } from "../src/components/admin/smartsheetCreationReadinessModel.js";
import {
  blockSmartsheetCrossSheetCustomerConflicts,
  buildSmartsheetControlledCreationProposals,
} from "../src/components/admin/smartsheetControlledCreationProposalModel.js";
import { customerReviewDecisionKey } from "../src/components/admin/smartsheetCustomerResolutionReviewModel.js";

const SALES_ID = "8702703019812740";
const ORDERS_ID = "4963691473987460";
const today = "2026-09-22";
const customers = [
  { id: "customer-1", company_name: "Acme Signs", legacy_client_names: ["Acme Old"] },
  { id: "customer-2", company_name: "Other Company", legacy_client_names: ["Other Old"] },
];
const exactAlias = {
  outcome: "exact_alias",
  recommended_customer_id: "customer-1",
  recommended_company_name: "Acme Signs",
};
const newName = { outcome: "new_customer", recommended_customer_id: "", recommended_company_name: "" };
const source = (rowId, rowNumber, values, customerResolution = exactAlias, status = "new_record") => ({
  row_id: rowId,
  row_number: rowNumber,
  status,
  values,
  customer_resolution: customerResolution,
});
const binding = (fields) => Object.fromEntries(fields.map((field, index) => [field, { column_id: String(index + 1) }]));
const salesBinding = binding([
  "client_name", "title", "current_task_description", "lead_source",
  "estimate_amount", "date_estimate_sent", "date_initial_contact",
]);
const ordersBinding = binding([
  "customer_name", "request_type", "description", "quantity", "requestor_name", "date_needed",
]);
const salesBaseline = buildSmartsheetRolloutBaseline({
  sheetId: SALES_ID, capturedAt: "2026-09-22T15:00:00.000Z", rows: [{ row_id: "old-sales" }],
});
const orderBaseline = buildSmartsheetRolloutBaseline({
  sheetId: ORDERS_ID, capturedAt: "2026-09-22T15:00:00.000Z", rows: [{ row_id: "old-order" }],
});

function decision(dataset, sheetId, name, action, extra = {}) {
  const normalized = name.toLowerCase().trim();
  return {
    [customerReviewDecisionKey({ dataset, sheetId, normalizedName: normalized })]: {
      action,
      dataset,
      sheet_id: sheetId,
      source_name: name,
      normalized_name: normalized,
      proposed_company_name: name,
      decided_at: "2026-09-22T16:00:00.000Z",
      ...extra,
    },
  };
}
const salesDecisions = {
  ...decision("sales", SALES_ID, "Acme Typo", "use_existing_customer", {
    customer_id: "customer-1", company_name: "Acme Signs", remember_alias: true,
  }),
  ...decision("sales", SALES_ID, "Fresh Co", "create_new_customer"),
  ...decision("sales", SALES_ID, "Cross Sheet Co", "create_new_customer"),
};
const orderDecisions = {
  ...decision("orders", ORDERS_ID, "Fresh Order Co", "create_new_customer"),
  ...decision("orders", ORDERS_ID, "Cross Sheet Co", "create_new_customer"),
};
const salesRows = [
  source("old-sales", 1, { client_name: "Acme Old", title: "Old work" }),
  source("s-existing", 2, {
    client_name: "Acme Old", title: "Pylon sign", lead_source: "Referral",
    estimate_amount: "$1,234.50", date_estimate_sent: "09/21/2026", date_initial_contact: "2026-09-10",
  }),
  source("s-alias", 3, { client_name: "Acme Typo", title: "Boutique sign" }, { outcome: "close_review" }),
  source("s-new-1", 4, { client_name: "Fresh Co", title: "Lobby signs" }, newName),
  source("s-new-2", 5, { client_name: "Fresh Co", title: "Wall signs" }, newName),
  source("s-dup-1", 6, { client_name: "Acme Old", title: "Repeated work" }),
  source("s-dup-2", 7, { client_name: "Acme Old", title: "Repeated work" }),
  source("s-terminal", 8, { client_name: "Acme Old", title: "Terminal task", current_task_description: "Lost" }),
  source("s-future", 9, { client_name: "Acme Old", title: "Future quote", date_estimate_sent: "2030-02-02" }),
  source("s-money", 10, { client_name: "Acme Old", title: "Invalid estimate", estimate_amount: "not a number" }),
  source("s-date", 11, { client_name: "Acme Old", title: "Invalid date", date_initial_contact: "2026-02-30" }),
  source("s-candidate", 12, { client_name: "Acme Old", title: "Existing Base44 record" }, exactAlias, "candidate"),
  source("s-unresolved", 13, { client_name: "Unapproved Co", title: "Unresolved" }, newName),
  source("s-cross", 14, { client_name: "Cross Sheet Co", title: "Cross-sheet job" }, newName),
];
const orderRows = [
  source("old-order", 1, { customer_name: "Acme Old", request_type: "Other", description: "Historical" }),
  source("o-existing", 2, {
    customer_name: "Acme Old", request_type: "vInYl", description: "Outdoor vinyl",
    quantity: "4 rolls", date_needed: "09/28/2026", requestor_name: "Foreman",
  }),
  source("o-new", 3, { customer_name: "Fresh Order Co", request_type: "Supplies", description: "Ink" }, newName),
  source("o-cross", 4, { customer_name: "Cross Sheet Co", request_type: "Substrate", description: "Panels" }, newName),
  source("o-missing", 5, { customer_name: "Acme Old", request_type: "Other", description: "" }),
  source("o-type", 6, { customer_name: "Acme Old", request_type: "Hardware", description: "Fasteners" }),
];

function preview(dataset, rows, baseline, decisions, bindingMap, catalog = customers) {
  const sheetId = dataset === "sales" ? SALES_ID : ORDERS_ID;
  const rolloutPreview = buildSmartsheetRolloutPreview({ rows, dataset, baseline, sheetId });
  const creationReadiness = buildSmartsheetCreationReadiness({
    rows, rolloutBaseline: baseline, rolloutPreview, dataset, sheetId,
    customerReviewState: { schema_version: 1, decisions },
  });
  const proposals = buildSmartsheetControlledCreationProposals({
    rows, creationReadiness, dataset, sheetId, customers: catalog,
    blueprint: SMARTSHEET_MAPPING_BLUEPRINTS[dataset],
    columnBindings: bindingMap, today,
  });
  return { rolloutPreview, creationReadiness, proposals };
}
function row(previewData, rowId) {
  const result = previewData.proposals.rows.find((candidate) => candidate.row_id === rowId);
  assert.ok(result, `Expected post-baseline row ${rowId}`);
  return result;
}
function has(rowValue, code) {
  return rowValue.blockers.some((blocker) => blocker.code === code);
}

const notCaptured = preview("sales", salesRows, null, salesDecisions, salesBinding);
assert.equal(notCaptured.proposals.state, "baseline_required");
assert.equal(notCaptured.proposals.rows.length, 0);
assert.equal(notCaptured.proposals.automatic_creates, 0);

const sales = preview("sales", salesRows, salesBaseline, salesDecisions, salesBinding);
const orders = preview("orders", orderRows, orderBaseline, orderDecisions, ordersBinding);
assert.equal(sales.rolloutPreview.summary.manual_backfill_review, 1);
assert.equal(sales.proposals.summary.post_baseline_rows, salesRows.length - 1, "Baseline IDs must be excluded");
assert.equal(orders.proposals.summary.post_baseline_rows, orderRows.length - 1);
assert.equal(sales.proposals.automatic_creates, 0);
assert.equal(sales.proposals.creation_enabled, false);
assert.equal(orders.proposals.creation_enabled, false);
assert.ok(!sales.proposals.rows.some((item) => item.row_id === "old-sales"));
assert.ok(!orders.proposals.rows.some((item) => item.row_id === "old-order"));

const existing = row(sales, "s-existing");
assert.equal(existing.proposal_ready, true);
assert.deepEqual(existing.customer.relationship, { field: "customer_id", existing_customer_id: "customer-1" });
assert.equal(existing.proposed_payload.customer_id, "customer-1");
assert.equal(existing.proposed_payload.client_name, "Acme Signs", "Existing Customer must use canonical name");
assert.equal(existing.proposed_payload.estimate_amount, 1234.5);
assert.equal(existing.proposed_payload.date_estimate_sent, "2026-09-21");
assert.equal(existing.proposed_payload.lead_source, "Referral");
assert.equal(existing.proposed_payload.current_stage, "sales");
assert.equal(existing.proposed_payload.sales_status, "lead");
assert.equal(existing.proposed_payload.in_pipeline, true);
assert.equal(existing.proposed_payload.smartsheet_row_id, "s-existing");
assert.equal(existing.proposed_payload.smartsheet_sheet_id, SALES_ID);
for (const forbidden of [
  "sales_last_activity_at", "sales_stage_changed_at", "smartsheet_last_synced_at",
  "quote_date", "close_date", "estimate_id", "probability", "profit_margin",
]) {
  assert.ok(!(forbidden in existing.proposed_payload), `Must not fabricate ${forbidden}`);
}
assert.equal(existing.relationships.estimate.action, "unlinked_no_authoritative_estimate_match");

const alias = row(sales, "s-alias");
assert.equal(alias.proposal_ready, true);
assert.equal(alias.customer.customer_id, "customer-1");
assert.equal(alias.customer.alias_plan.alias, "Acme Typo");
assert.equal(alias.customer.alias_plan.field, "legacy_client_names");
assert.deepEqual(customers[0].legacy_client_names, ["Acme Old"], "Proposal must not mutate Customer aliases");
assert.equal(alias.proposed_payload.client_name, "Acme Signs");

const fresh1 = row(sales, "s-new-1");
const fresh2 = row(sales, "s-new-2");
assert.equal(fresh1.proposal_ready, true);
assert.equal(fresh2.proposal_ready, true);
assert.equal(fresh1.customer.key, fresh2.customer.key, "Two rows must share ONE proposed Customer");
assert.deepEqual(fresh1.customer.customer_payload, { company_name: "Fresh Co", customer_status: "prospect" });
assert.equal(fresh1.proposed_payload.customer_id, undefined, "No invented Customer ID");
assert.equal(fresh1.relationships.customer.planned_customer_key, fresh2.customer.key);
assert.equal(sales.proposals.summary.new_customer_groups, 2, "One Fresh and one Cross-sheet group before reconciliation");

for (const id of ["s-dup-1", "s-dup-2"]) {
  assert.equal(row(sales, id).proposal_ready, false);
  assert.ok(has(row(sales, id), "possible_duplicate_new_rows"));
}
assert.ok(has(row(sales, "s-terminal"), "terminal_task_review"));
assert.ok(has(row(sales, "s-future"), "future_estimate_sent"));
assert.ok(has(row(sales, "s-money"), "invalid_field"));
assert.ok(has(row(sales, "s-date"), "invalid_field"));
assert.ok(has(row(sales, "s-candidate"), "existing_record_candidate"));
assert.ok(has(row(sales, "s-unresolved"), "customer_review_required"));
assert.equal(row(sales, "s-unresolved").customer, null);

const orderExisting = row(orders, "o-existing");
assert.equal(orderExisting.proposal_ready, true);
assert.equal(orderExisting.proposed_payload.request_type, "Vinyl");
assert.equal(orderExisting.proposed_payload.quantity, "4 rolls");
assert.equal(orderExisting.proposed_payload.date_needed, "2026-09-28");
assert.equal(orderExisting.proposed_payload.customer_id, "customer-1");
assert.equal(orderExisting.proposed_payload.status, "pending");
assert.ok(!("work_order_id" in orderExisting.proposed_payload), "Do not invent WorkOrder relationships");
assert.equal(orderExisting.relationships.work_order.action, "unlinked_no_authoritative_workorder_match");
assert.equal(row(orders, "o-new").proposal_ready, true);
assert.ok(has(row(orders, "o-missing"), "missing_description"));
assert.ok(has(row(orders, "o-type"), "invalid_request_type"));

const checked = blockSmartsheetCrossSheetCustomerConflicts(sales.proposals, orders.proposals);
assert.equal(checked.conflicts.length, 1, "Same proposed new name across sheets must be grouped once");
assert.equal(checked.conflicts[0].normalized_name, "cross sheet co");
for (const [result, id] of [[checked.sales, "s-cross"], [checked.orders, "o-cross"]]) {
  const affected = result.rows.find((item) => item.row_id === id);
  assert.equal(affected.proposal_ready, false);
  assert.ok(has(affected, "cross_sheet_customer_collision"));
}
assert.equal(checked.sales.rows.find((item) => item.row_id === "s-new-1").proposal_ready, true);
assert.equal(checked.orders.rows.find((item) => item.row_id === "o-new").proposal_ready, true);
assert.equal(checked.sales.summary.proposal_ready + checked.sales.summary.blocked, checked.sales.summary.post_baseline_rows);
assert.equal(checked.orders.summary.proposal_ready + checked.orders.summary.blocked, checked.orders.summary.post_baseline_rows);

const staleSelected = preview("sales", [
  source("s-stale", 2, { client_name: "Some Co", title: "Stale selection" }, { outcome: "close_review" }),
], salesBaseline, decision("sales", SALES_ID, "Some Co", "use_existing_customer", {
  customer_id: "customer-deleted", company_name: "Some Co",
}), salesBinding);
assert.ok(has(row(staleSelected, "s-stale"), "selected_customer_missing"));

const staleNew = preview("orders", [
  source("o-stale-new", 2, { customer_name: "Acme Old", request_type: "Other", description: "New approval stale" }, exactAlias),
], orderBaseline, decision("orders", ORDERS_ID, "Acme Old", "create_new_customer"), ordersBinding);
assert.ok(has(row(staleNew, "o-stale-new"), "new_customer_matches_existing"));

const blockedDependent = preview("orders", [
  source("o-approved-missing", 3, {
    customer_name: "Fresh Order Co", request_type: "Vinyl", description: "",
  }, newName),
], orderBaseline, orderDecisions, ordersBinding);
assert.equal(row(blockedDependent, "o-approved-missing").proposal_ready, false);
assert.equal(row(blockedDependent, "o-approved-missing").customer?.kind, "new_customer",
  "An approved Customer and blocked dependent Order must still preview as one bundle");
assert.ok(has(row(blockedDependent, "o-approved-missing"), "missing_description"));

const similarNew = preview("orders", [
  source("o-similar", 3, {
    customer_name: "Acme Signz", request_type: "Other", description: "Test duplicate risk",
  }, {
    outcome: "close_review",
    candidates: [{ customer_id: "customer-1", company_name: "Acme Signs" }],
  }),
], orderBaseline, decision("orders", ORDERS_ID, "Acme Signz", "create_new_customer"), ordersBinding);
assert.ok(has(row(similarNew, "o-similar"), "similar_customer_risk"),
  "Approval does not hide a near-match existing-Customer risk");

const conflictingAlias = preview("sales", [
  source("s-alias-conflict", 4, { client_name: "Other Old", title: "Conflicting alias" }, {
    outcome: "close_review",
    recommended_customer_id: "customer-1",
    recommended_company_name: "Acme Signs",
    candidates: [{ customer_id: "customer-1", company_name: "Acme Signs" }],
  }),
], salesBaseline, decision("sales", SALES_ID, "Other Old", "use_existing_customer", {
  customer_id: "customer-1", company_name: "Acme Signs", remember_alias: true,
}), salesBinding);
assert.ok(has(row(conflictingAlias, "s-alias-conflict"), "alias_conflict"),
  "Approved alias belonging to another Customer must block the proposal");

const noReview = preview("sales", [
  source("s-later-approved", 2, { client_name: "New Decision Co", title: "New quote" }, newName),
], salesBaseline, {}, salesBinding);
assert.equal(row(noReview, "s-later-approved").proposal_ready, false);
const afterReview = preview("sales", [
  source("s-later-approved", 2, { client_name: "New Decision Co", title: "New quote" }, newName),
], salesBaseline, decision("sales", SALES_ID, "New Decision Co", "create_new_customer"), salesBinding);
assert.equal(row(afterReview, "s-later-approved").proposal_ready, true, "Saved review should recompute a complete proposal");

const wrongBaseline = buildSmartsheetCreationReadiness({
  rows: salesRows, rolloutBaseline: orderBaseline, dataset: "sales", sheetId: SALES_ID,
});
assert.equal(buildSmartsheetControlledCreationProposals({
  rows: salesRows, creationReadiness: wrongBaseline, dataset: "sales", sheetId: SALES_ID,
  customers, blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.sales, columnBindings: salesBinding,
}).state, "baseline_required");

console.log("Smartsheet controlled creation proposal regression: PASS");
