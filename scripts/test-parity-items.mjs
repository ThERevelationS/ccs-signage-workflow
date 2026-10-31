// Parity-items test — asserts the additive parity work landed and behaves:
//   1. GL-coded CSV export (date, memo, entity_ref, gl_account, debit, credit)
//      in Reconciliation + OpsReportView, with unmapped-row reporting.
//   2. CustomerPortal Statements section (open invoices, running balance,
//      printable statement, defensive deposit display, proof-approval terms).
//   3. Per-vendor aggregated statement on the Purchase Orders surface.
//   4. Printable walk-in receipt after successful checkout.
//   5. invoicingAction/entry.ts untouched by parity markers (concurrent work).
//
// Run: node scripts/test-parity-items.mjs  →  PASS parity-items
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GL_EXPORT_HEADERS,
  buildGlLookup,
  glExportRows,
  paymentsToGlEntries,
  reportToGlEntries,
} from "../src/components/shared/glExport.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond) => {
  if (cond) console.log(`ok   - ${name}`);
  else { failures += 1; console.error(`FAIL - ${name}`); }
};

// ---------------------------------------------------------------- GL model
check("GL headers are exactly date/memo/entity_ref/gl_account/debit/credit",
  JSON.stringify(GL_EXPORT_HEADERS) === JSON.stringify(["date", "memo", "entity_ref", "gl_account", "debit", "credit"]));

const lookup = buildGlLookup({
  markupCategories: [{ category_name: "Standard", gl_code: "4100" }],
  inventoryItems: [{ item_name: "Banner 13oz", income_account: "4000" }],
});
const payEntries = paymentsToGlEntries({
  payments: [
    { id: "p1", paid_date: "2026-11-02", customer: "Acme", invoice_number: "INV-1001", amount: 12.5, category: "standard" },
    { id: "p2", paid_date: "2026-11-02", customer: "NoMap", invoice_number: "INV-1002", amount: 5 },
  ],
  batch: { batch_number: "B-7" },
});
const gl = glExportRows(payEntries, lookup);
check("payment rows export with resolved gl_account", gl.rows[0]?.[3] === "4100");
check("payment row shape is the 6-col journal line",
  gl.rows[0]?.length === 6 && gl.rows[0][0] === "2026-11-02" && gl.rows[0][2] === "INV-1001" && gl.rows[0][4] === "12.50" && gl.rows[0][5] === "");
check("unmapped rows export with blank gl_account and are counted",
  gl.unmapped === 1 && gl.rows[1]?.[3] === "");

const rep = reportToGlEntries({
  columns: [
    { key: "month", format: "date" },
    { key: "customer" },
    { key: "billed", format: "money" },
    { key: "collected", format: "money" },
  ],
  rows: [["2026-11", "Acme", 100, 80]],
  source: "AR aging",
});
check("report rows emit one journal line per money column", rep.length === 2);
check("report debit/credit sides follow column semantics",
  rep[0]?.debit === 100 && rep[0]?.credit === 0 && rep[1]?.debit === 0 && rep[1]?.credit === 80);

// ------------------------------------------------------- GL surfaces (static)
const glSrc = read("src/components/shared/glExport.js");
check("glExport.js ships the entry adapters",
  glSrc.includes("paymentsToGlEntries") && glSrc.includes("reportToGlEntries") && glSrc.includes("resolveGlAccount"));
check("glExport.js reports the unmapped count", glSrc.includes("unmapped"));
const lookupSrc = read("src/components/shared/loadGlLookup.js");
check("loadGlLookup reads the three GL-mapped catalogs",
  lookupSrc.includes("staffEntities.MarkupCategory") &&
  lookupSrc.includes("staffEntities.Inventory") &&
  lookupSrc.includes("staffEntities.PartTemplate") &&
  lookupSrc.includes("buildGlLookup"));
check("glExport resolves catalog GL fields (gl_code/income_account)",
  glSrc.includes("gl_code") && glSrc.includes("income_account"));

const recon = read("src/pages/Reconciliation.jsx");
check("Reconciliation wires the GL export", recon.includes("paymentsToGlEntries") && recon.includes("glExportRows"));
check("Reconciliation shows 'Download GL export'", recon.includes("Download GL export"));
check("Reconciliation surfaces the unmapped count", recon.includes("unmapped"));

const ops = read("src/components/reports/OpsReportView.jsx");
check("OpsReportView wires the GL export", ops.includes("reportToGlEntries") && ops.includes("glExportRows"));
check("OpsReportView shows 'Download GL export'", ops.includes("Download GL export"));
check("OpsReportView keeps the normal CSV export", ops.includes("Export CSV"));

// ------------------------------------------------------ Customer portal (static)
const portal = read("src/pages/CustomerPortal.jsx");
check("Portal builds statements through the shared model", portal.includes("buildStatement"));
check("Portal has a Statements section", portal.includes("Statements"));
check("Portal offers 'Download statement'", portal.includes("Download statement"));
check("Portal lists open invoices", portal.includes("openInvoices"));
check("Portal shows the open balance total", portal.includes("openBalance"));
check("Portal tracks a running balance", portal.includes("running"));
check("Portal renders the printable StatementView", portal.includes("<StatementView"));
check("Portal deposit display is defensive (optional chaining)",
  portal.includes("job?.deposit_required") && portal.includes("job?.deposit_amount"));
check("Portal surfaces proof-approval terms defensively",
  portal.includes("proof_approval_terms") && portal.includes("quote_terms_conditions"));

// ------------------------------------------------------- Vendor statement (static)
const vs = read("src/components/procurement/VendorStatement.jsx");
check("VendorStatement aggregates via derivePoReceipt", vs.includes("derivePoReceipt"));
check("VendorStatement groups POs by status", vs.includes("byStatus"));
check("VendorStatement rolls up expected-vs-received totals",
  vs.includes("received") && vs.includes("open"));
check("VendorStatement is printable", vs.includes("window.print") && vs.includes("stmt-print-root"));
const po = read("src/pages/PurchaseOrders.jsx");
check("PurchaseOrders imports VendorStatement",
  po.includes('from "@/components/procurement/VendorStatement"'));
check("PurchaseOrders has a 'Vendor statement' button", po.includes("Vendor statement") && po.includes("showVendorStatement"));

// ------------------------------------------------------- Walk-in receipt (static)
const wr = read("src/components/walkin/WalkInReceipt.jsx");
check("WalkInReceipt uses the statement print pattern", wr.includes("stmt-print-root") && wr.includes("stmt-printing"));
check("WalkInReceipt prints via window.print", wr.includes("window.print"));
check("WalkInReceipt shows tender and change", wr.includes("amount_tendered") && wr.includes("change_due"));
check("WalkInReceipt shows a thank-you footer", /thank you/i.test(wr));
const wis = read("src/components/walkin/WalkInSale.jsx");
check("WalkInSale imports WalkInReceipt", wis.includes('from "./WalkInReceipt"'));
check("WalkInSale offers 'Print receipt' after checkout", wis.includes("Print receipt") && wis.includes("showReceiptPrint"));

// ------------------------------------------------------------ concurrency guard
const inv = read("base44/functions/invoicingAction/entry.ts");
check("invoicingAction carries no parity markers (untouched)",
  !inv.includes("GL_EXPORT_HEADERS") && !inv.includes("WalkInReceipt") && !inv.includes("VendorStatement"));

if (failures) {
  console.error(`\n${failures} parity check(s) failed`);
  process.exit(1);
}
console.log("\nPASS parity-items");
