import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
// Static defense: this retired gateway must never gain an outbound CoreBridge path.
const gateway = readFileSync(new URL("../base44/functions/corebridgeApiAction/entry.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../src/components/admin/CorebridgeApiSettings.jsx", import.meta.url), "utf8");
assert(gateway.includes("actor?.role !== 'admin'"), "server-side sign-shop admin check required");
assert(gateway.includes("'export_jobs_csv', 'audit_workorders', 'verify_sept22_backup'"), "only the two read-only CCS actions may be allowed");
assert(!gateway.includes("safeExternalFetch") && !gateway.includes("COREBRIDGE_SUBSCRIPTION_KEY"), "no external CoreBridge API path or subscription secret allowed");
assert(!adminUi.includes("testCorebridgeApiConnection") && !adminUi.includes("getCorebridgeApiAccountSummary"), "retired API buttons must not return");
console.log("CoreBridge offline CSV and retired-gateway checks PASS");
