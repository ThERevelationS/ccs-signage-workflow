import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const verifyLogin = readFileSync("base44/functions/verifyLogin/entry.ts", "utf8");
const verifySession = readFileSync("base44/functions/verifySession/entry.ts", "utf8");
const importer = readFileSync("base44/functions/importSalesPipeline/entry.ts", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(page.includes('const canImportExport = currentUser?.role === "admin" || currentUser?.can_import_export === true;'),
  "Sales page must derive import/export permission from the authenticated Sign Shop session user");
check(!page.includes("base44.entities.AuthorizedEmail") &&
      !page.includes("AuthorizedEmail.filter("),
  "Sales page must not re-query RLS-protected AuthorizedEmail from the browser");
check(!page.includes("setCanImportExport("),
  "Permission must not retain stale React state across identity changes");
check(page.includes("{canImportExport && !showDuplicateCleanup && ("),
  "Top Tools import/export actions must remain permission-gated");
check(page.includes("canImportExport={canImportExport}"),
  "Spreadsheet must receive the same authoritative permission gate");

check(sheet.includes("customFilters = [], canImportExport = false"),
  "Spreadsheet permission prop must fail closed by default");
check(sheet.includes("{canImportExport && (") &&
      sheet.includes("onClick={() => fileInputRef.current?.click()}") &&
      sheet.includes("onClick={exportToExcel}"),
  "Dormant inline Import and Export controls must share the same permission gate");
check(sheet.includes("{isRegistered && (") &&
      sheet.includes("onClick={addNewRow}"),
  "New Client remains a registered-user action independent of import/export permission");

check(verifyLogin.includes("can_import_export: user.can_import_export"),
  "Fresh login response must carry the authoritative import/export permission");
check(verifySession.includes("can_import_export: user.can_import_export"),
  "Restored sessions must refresh import/export permission from AuthorizedEmail");
check(importer.includes("const canImport = actor?.role === 'admin' || actor?.can_import_export === true;") &&
      importer.includes("if (!canImport) return Response.json({ error: 'Sales Pipeline import permission is required.' }, { status: 403 });"),
  "Backend import must independently enforce the same permission even if UI is bypassed");

console.log("Sales import/export session permission: " + checks + "/" + checks + " PASS.");
