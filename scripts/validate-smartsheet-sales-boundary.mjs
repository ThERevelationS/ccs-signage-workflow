import {
  SALES_SYNC_ALLOWED_FIELDS,
  filterSalesColumnBindings,
  isLegacyTerminalSalesTask,
  shouldCreateSmartsheetSalesRecordInPipeline,
} from "../base44/shared/smartsheetSalesSafety.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const configuredBindings = {
  client_name: "3087579177346948",
  work_notes: "2555898341156740",
  notes_serialized: "2555898341156740",
  lead_source: "4072653460557700",
  est_inv_at: "4624329576763268",
  estimate_amount: "5655853885876100",
  current_task_description: "4783818077955972",
  title: "4872970838167428",
  sales_status: "999",
  sales_rep: "280218450585476",
  date_estimate_sent: "7591178804717444",
  current_task_deadline: "3828410546972548",
  expected_close_date: "123",
  lost_reason: "456",
};

const filtered = filterSalesColumnBindings(configuredBindings);
assert(
  JSON.stringify(Object.keys(filtered).sort()) === JSON.stringify([...SALES_SYNC_ALLOWED_FIELDS].sort()),
  "Sales Smartsheet backend must keep only the explicit Sales sync allowlist."
);
for (const protectedField of [
  "title",
  "sales_status",
  "sales_rep",
  "date_estimate_sent",
  "current_task_deadline",
  "expected_close_date",
  "lost_reason",
  "work_notes",
]) {
  assert(!(protectedField in filtered), `Protected Base44 field leaked through Sales Smartsheet bindings: ${protectedField}`);
}

assert(isLegacyTerminalSalesTask("Lost"), "Lost task text must classify as legacy terminal.");
assert(isLegacyTerminalSalesTask("Completed Sale"), "Completed Sale task text must classify as legacy terminal.");
assert(isLegacyTerminalSalesTask("Closed - Attempted Follow-up/No Response"), "Closed task text must classify as legacy terminal.");
assert(!isLegacyTerminalSalesTask("On Hold - Follow Up with Customer"), "On Hold task text must remain active.");
assert(!isLegacyTerminalSalesTask("Follow up with Customer - Post-Estimate"), "Active follow-up task text must remain active.");

assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Lost" }) === false,
  "Smartsheet legacy terminal rows must not be created as modern pipeline records."
);
assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Completed Sale" }) === false,
  "Completed Sale rows must not be created as modern pipeline records."
);
assert(
  shouldCreateSmartsheetSalesRecordInPipeline({ current_task_description: "Prospect Initiation" }) === true,
  "Active Smartsheet rows should still create as modern pipeline opportunities."
);

console.log("Smartsheet Sales boundary validation passed.");
