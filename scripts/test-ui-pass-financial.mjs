// UI-kit adoption pass for the financial / procurement surfaces:
//   Invoices, PurchaseOrders, Reconciliation, CustomerStatements, JobCosting,
//   plus the invoicing / reconciliation / procurement / statements components.
// Mirrors scripts/test-ui-pass.mjs (queues/jobs/customer360). Two checks per
// assigned file:
//   1. the shared kit primitives it adopted are actually imported/used
//   2. event-handler proxy -- the onClick attribute count must not drop
//      below the pre-migration baseline captured before the kit pass, so
//      the pass proves no handler was removed while restyling.
// Plus print-surface guards: VendorStatement / StatementView keep their
// window.print() markup and stay kit-free.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");
const onClicks = (s) => (s.match(/onClick=/g) || []).length;

// --- 1. Kit adoption ---------------------------------------------------------
const KIT_TOKENS = {
  "src/pages/Invoices.jsx": [
    "PageHeader", "breadcrumbs", "Financials", "Invoices",
    "FilterBar", "FilterSearchInput", "KpiStrip",
    "DataTableShell", "StatusChip", "RecordLink", "emptyState", "filterInputCls",
  ],
  "src/pages/PurchaseOrders.jsx": [
    "PageHeader", "breadcrumbs", "Financials", "Purchase Orders",
    "FilterBar", "FilterSearchInput",
    "DataTableShell", "StatusChip", "RecordLink", "emptyState", "filterInputCls",
  ],
  "src/pages/Reconciliation.jsx": [
    "PageHeader", "breadcrumbs", "Financials", "Reconciliation",
    "KpiStrip", "DataTableShell", "StatusChip", "emptyState",
  ],
  "src/pages/CustomerStatements.jsx": [
    "PageHeader", "breadcrumbs", "Financials", "Customer Statements",
    "FilterField", "FilterSearchInput",
    "DataTableShell", "RecordLink", "emptyState", "filterInputCls",
  ],
  "src/pages/JobCosting.jsx": [
    "PageHeader", "breadcrumbs", "Financials", "Job Costing",
    "FilterBar", "FilterSearchInput", "KpiStrip",
    "DataTableShell", "StatusChip", "RecordLink", "emptyState",
  ],
  "src/components/invoicing/CreditRefundDialogs.jsx": ["filterInputCls"],
  "src/components/reconciliation/LocationsPanel.jsx": ["StatusChip", "EmptyState", "filterInputCls"],
  "src/components/reconciliation/ReconcileWizard.jsx": ["filterInputCls"],
  "src/components/procurement/ReceivePanel.jsx": ["StatusChip"],
};

for (const [file, tokens] of Object.entries(KIT_TOKENS)) {
  const s = src(file);
  assert.ok(s.includes("components/kit"), `${file} must import from the shared kit`);
  for (const t of tokens) {
    assert.ok(s.includes(t), `${file} must use ${t}`);
  }
}

// Local status/badge tone maps must be gone -- statuses render through kit
// StatusChip / statusTones only.
const inv = src("src/pages/Invoices.jsx");
assert.ok(!inv.includes("STATUS_STYLES"), "Invoices local STATUS_STYLES removed");
const po = src("src/pages/PurchaseOrders.jsx");
assert.ok(!po.includes("STATUS_STYLES"), "PurchaseOrders local STATUS_STYLES removed");
assert.ok(!po.includes("const StatusBadge"), "PurchaseOrders local StatusBadge removed");
const rp = src("src/components/procurement/ReceivePanel.jsx");
assert.ok(!rp.includes("LINE_BADGE_STYLES"), "ReceivePanel local LINE_BADGE_STYLES removed");

// Print surfaces keep their print markup and were not kit-ified.
for (const file of ["src/components/procurement/VendorStatement.jsx", "src/components/statements/StatementView.jsx"]) {
  const s = src(file);
  assert.ok(s.includes("stmt-print-root"), `${file} print root preserved`);
  assert.ok(s.includes("window.print"), `${file} window.print() preserved`);
  assert.ok(!s.includes("components/kit"), `${file} print markup untouched (no kit imports)`);
}

// --- 2. Handler-preservation proxy --------------------------------------------
// Baselines: onClick= counts captured from the pre-migration remote files.
const HANDLER_BASELINE = {
  "src/pages/Invoices.jsx": 43,
  "src/pages/PurchaseOrders.jsx": 20,
  "src/pages/Reconciliation.jsx": 7,
  "src/pages/CustomerStatements.jsx": 8,
  "src/pages/JobCosting.jsx": 9,
  "src/components/invoicing/CreditRefundDialogs.jsx": 7,
  "src/components/reconciliation/LocationsPanel.jsx": 5,
  "src/components/reconciliation/ReconcileWizard.jsx": 5,
  "src/components/procurement/ReceivePanel.jsx": 5,
  "src/components/procurement/VendorStatement.jsx": 2,
  "src/components/statements/StatementView.jsx": 3,
};
for (const [file, before] of Object.entries(HANDLER_BASELINE)) {
  const now = onClicks(src(file));
  assert.ok(
    now >= before,
    `${file}: onClick count regressed (${before} -> ${now}) -- a handler was likely removed`
  );
}

console.log("PASS ui-pass-financial");
