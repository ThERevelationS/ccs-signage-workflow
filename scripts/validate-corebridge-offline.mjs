import assert from "node:assert/strict";
import { buildJobRegisterCsv, csvCell, selectJobRegisterRows, JOB_REGISTER_COLUMNS } from "../base44/shared/corebridgeOfflineCsv.mjs";

const rows = [
  { id: "job-a", client_name: 'A "Sign", Inc.', title: "One\nTwo", current_stage: "sales", completed: false, deleted: false, estimate_amount: 1250, actual_cost: 900, contact_email: "=cmd|' /C calc'!A0", corbridge_invoice_number: "01234" },
  { id: "job-b", client_name: "B", current_stage: "completed", deleted: false, actual_cost: 800 },
  { id: "job-c", client_name: "C", completed: true, deleted: true, actual_cost: 500 },
  { id: "job-d", client_name: "D", completed: true, deleted: false, actual_cost: 700 },
];
assert.equal(selectJobRegisterRows(rows).length, 3, "deleted jobs must never export");
assert.deepEqual(selectJobRegisterRows(rows, "incomplete").map(x => x.id), ["job-a"]);
assert.deepEqual(selectJobRegisterRows(rows, "completed").map(x => x.id), ["job-b", "job-d"]);
assert.throws(() => selectJobRegisterRows(rows, "unknown"), /Invalid/);

const {csv, count} = buildJobRegisterCsv(rows);
assert.equal(count, 3);
assert(csv.startsWith("\uFEFF"), "Excel UTF-8 BOM required");
assert(csv.includes('"A ""Sign"", Inc."'), "quotes escaped");
assert(csv.includes('"One\nTwo"'), "multiline descriptions quoted");
assert(csv.includes('"\'=cmd|\' /C calc\'!A0"'), "spreadsheet formula escaped");
assert(csv.includes('"01234"'), "leading-zero invoice number retained as text");
assert(!csv.includes("900") && !csv.includes("800") && !csv.includes("700"), "no internal costs");
assert(!JOB_REGISTER_COLUMNS.some(([key]) => /cost|profit|margin/i.test(key)), "no cost fields in CSV mapping");
for (const dangerous of ["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(1)", "\t=1"]) {
  assert(csvCell(dangerous).startsWith('"\''), dangerous + " formula not escaped");
}
assert.equal(csvCell("Safe, text"), '"Safe, text"');
assert.equal(buildJobRegisterCsv(rows, "completed").count, 2);
assert.equal(rows[0].contact_email, "=cmd|' /C calc'!A0", "source data must remain untouched");
console.log("CoreBridge offline CSV checks: 17 PASS");
