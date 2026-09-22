import { buildSmartsheetDryRunPreview } from "../src/components/admin/smartsheetDryRunModel.js";
import {
  buildSmartsheetRolloutPreview,
  classifySmartsheetRolloutRow,
} from "../src/components/admin/smartsheetRolloutModel.js";

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

console.log("Smartsheet rollout regression validation: PASS");
