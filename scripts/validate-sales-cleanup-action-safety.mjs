import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const form = readFileSync("src/components/workflow/WorkOrderForm.jsx", "utf8");
const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };

const cleanupSwitch = page.indexOf("{showDuplicateCleanup ? (");
const spreadsheetBranch = page.indexOf("<SalesPipelineSpreadsheet", cleanupSwitch);
check(cleanupSwitch >= 0 && spreadsheetBranch > cleanupSwitch &&
  page.slice(cleanupSwitch, spreadsheetBranch).includes("<BulkDuplicateCleanup />"),
  "Duplicate Cleanup replaces the spreadsheet, making its imperative actions unavailable.");

const nav = page.split('<section aria-label="Sales Pipeline navigation"')[1]?.split("</section>")[0] || "";
const tools = nav.split('<DropdownMenuContent align="end" className="w-52">')[1]?.split("</DropdownMenuContent>")[0] || "";
check(nav.includes("{isRegistered && !showDuplicateCleanup && ("),
  "New Client is hidden when Duplicate Cleanup replaces the Sales spreadsheet.");
check(nav.includes('onClick={() => setShowNewClientForm(true)}') &&
  nav.includes('className="clay-button order-2 col-span-5'),
  "New Client remains prominent in the normal phone and desktop toolbar.");
check(nav.includes('showDuplicateCleanup && (') &&
  nav.includes('setShowDuplicateCleanup(false)') &&
  nav.includes("Return to Pipeline"),
  "Duplicate Cleanup exposes Return to Pipeline in place of New Client.");
check(tools.includes("{canImportExport && !showDuplicateCleanup && ("),
  "Import, export and history remain permission-gated and unavailable without the spreadsheet.");
for (const action of ["importFromExcel()", "exportToExcel()", "openImportHistory()"]) {
  check(tools.includes("spreadsheetRef.current?." + action),
    "The existing " + action + " action is preserved in normal Sales mode.");
}
check(tools.includes("setShowDuplicateCleanup((open) => !open)"),
  "Returning from Duplicate Cleanup remains possible from Tools.");

const formSave = page.split("onSave={async (data) => {")[1]?.split("\n          }}")[0] || "";
check(formSave.includes("const spreadsheet = spreadsheetRef.current;") &&
  formSave.includes('typeof spreadsheet?.handleCreateFromForm !== "function"'),
  "An in-flight New Client form verifies that its spreadsheet save target still exists.");
check(formSave.includes('throw new Error("Return to the Sales Pipeline before saving this client. Your form entries have been kept.");'),
  "Missing destination produces an explicit recoverable error instead of a false success.");
check(!formSave.includes("await spreadsheetRef.current?.handleCreateFromForm"),
  "The save path cannot silently skip creation via optional chaining.");
check(formSave.indexOf("throw new Error(") < formSave.indexOf("await spreadsheet.handleCreateFromForm(data);") &&
  formSave.indexOf("await spreadsheet.handleCreateFromForm(data);") < formSave.indexOf("setShowNewClientForm(false);"),
  "New Client closes only after a verified creation operation finishes.");
check(spreadsheet.includes("handleCreateFromForm") &&
  spreadsheet.includes("createWorkOrderWithRecovery("),
  "The original recovery-safe WorkOrder creation handler remains the destination.");
const submit = form.split("const handleSubmit = async (e) => {")[1]?.split("\n  const activeNotes")[0] || "";
check(submit.includes("await onSave?.(submitData);") &&
  submit.indexOf("await onSave?.(submitData);") < submit.indexOf("onClose?.();"),
  "The shared WorkOrder form awaits the Sales save before closing.");
check(submit.includes('catch (error)') && submit.includes('setSubmitError(error?.message'),
  "The shared form displays a failed or blocked save and retains its draft.");

console.log(`Sales contextual action availability and New Client save safety: ${checks}/${checks} PASS.`);
