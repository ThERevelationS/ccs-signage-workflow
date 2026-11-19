// UI-kit adoption pass for the ops / CRM / comms / pricing / imports /
// walk-in surfaces: CommsFollowups, PricingAdmin, Imports, WalkIn,
// OpsReportView, CrmEventsQueue, FollowupQueue, NotificationTemplateEditor,
// the pricing editors, and ImportWizard.
// Mirrors scripts/test-ui-pass.mjs + test-ui-pass-financial.mjs. Two checks
// per assigned file:
//   1. the shared kit primitives it adopted are actually imported/used
//   2. event-handler proxy -- the onClick attribute count must not drop
//      below the pre-migration baseline captured before the kit pass, so
//      the pass proves no handler was removed while restyling.
// Plus a print-surface guard: WalkInReceipt keeps its window.print() markup
// and stays kit-free.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");
const onClicks = (s) => (s.match(/onClick=/g) || []).length;

// --- 1. Kit adoption ---------------------------------------------------------
const KIT_TOKENS = {
  "src/pages/CommsFollowups.jsx": [
    "PageHeader", "breadcrumbs", "Customers", "Follow-ups",
  ],
  "src/pages/PricingAdmin.jsx": [
    "PageHeader", "breadcrumbs", "Estimator Settings", "Pricing Admin",
  ],
  "src/pages/Imports.jsx": [
    "PageHeader", "breadcrumbs", "Queues", "Imports", "StatusChip", "EmptyState",
  ],
  "src/pages/WalkIn.jsx": [
    "PageHeader", "breadcrumbs", "Tools", "Walk-in Sale", "EmptyState",
  ],
  "src/components/crm/CrmEventsQueue.jsx": [
    "PageHeader", "breadcrumbs", "Customers",
    "FilterBar", "FilterField", "FilterSearchInput", "FilterSelect", "filterInputCls",
    "StatusChip", "RecordLink", "EmptyState",
  ],
  "src/components/comms/FollowupQueue.jsx": [
    "StatusChip", "RecordLink", "EmptyState",
  ],
  "src/components/comms/NotificationTemplateEditor.jsx": ["StatusChip"],
  "src/components/reports/OpsReportView.jsx": [
    "PageHeader", "breadcrumbs",
    "FilterBar", "FilterField", "FilterSelect", "filterInputCls", "EmptyState",
  ],
  "src/components/pricing/PricingMatrixTable.jsx": ["EmptyState"],
  "src/components/pricing/PricingCrudTable.jsx": ["EmptyState"],
  "src/components/pricing/MatrixSuggestPanel.jsx": ["EmptyState", "StatusChip"],
  "src/components/imports/ImportWizard.jsx": ["StatusChip"],
  "src/components/walkin/WalkInSale.jsx": ["StatusChip"],
};

for (const [file, tokens] of Object.entries(KIT_TOKENS)) {
  const s = src(file);
  assert.ok(s.includes("components/kit"), `${file} must import from the shared kit`);
  for (const t of tokens) {
    assert.ok(s.includes(t), `${file} must use ${t}`);
  }
}

// statusTones covers the ImportJob batch statuses used on the Imports history.
const tones = src("src/components/kit/statusTones.js");
for (const st of ["running", "paused"]) {
  assert.ok(tones.includes(`${st}:`), `statusTones must map the "${st}" batch status`);
}

// Local status/badge tone maps must be gone -- statuses render through kit
// StatusChip / statusTones only.
const imp = src("src/pages/Imports.jsx");
assert.ok(!imp.includes("STATUS_STYLES"), "Imports local STATUS_STYLES removed");
const crm = src("src/components/crm/CrmEventsQueue.jsx");
assert.ok(!crm.includes("outcomeTone"), "CrmEventsQueue local outcomeTone removed");
assert.ok(!/const badge\s*=\s*\(/.test(crm), "CrmEventsQueue local badge() helper removed");
const fq = src("src/components/comms/FollowupQueue.jsx");
assert.ok(!fq.includes("bg-rose-100 text-rose-800"), "FollowupQueue local badge classes removed");
const iw = src("src/components/imports/ImportWizard.jsx");
assert.ok(!iw.includes("<Badge"), "ImportWizard ui/Badge replaced by StatusChip");
const orv = src("src/components/reports/OpsReportView.jsx");
assert.ok(!orv.includes("const selectCls"), "OpsReportView local selectCls removed");

// Print surface keeps its print markup and was not kit-ified.
const receipt = src("src/components/walkin/WalkInReceipt.jsx");
assert.ok(receipt.includes("stmt-print-root"), "WalkInReceipt print root preserved");
assert.ok(receipt.includes("window.print"), "WalkInReceipt window.print() preserved");
assert.ok(!receipt.includes("components/kit"), "WalkInReceipt print markup untouched (no kit imports)");

// --- 2. Handler-preservation proxy --------------------------------------------
// Baselines: onClick= counts captured from the pre-migration remote files.
const HANDLER_BASELINE = {
  "src/pages/CrmEvents.jsx": 0,
  "src/pages/CommsFollowups.jsx": 2,
  "src/pages/OpsReports.jsx": 0,
  "src/pages/PricingAdmin.jsx": 3,
  "src/pages/Imports.jsx": 1,
  "src/pages/WalkIn.jsx": 1,
  "src/components/crm/CrmEventsQueue.jsx": 8,
  "src/components/comms/FollowupQueue.jsx": 3,
  "src/components/comms/NotificationTemplateEditor.jsx": 5,
  "src/components/reports/OpsReportView.jsx": 6,
  "src/components/pricing/PricingMatrixTable.jsx": 3,
  "src/components/pricing/PricingCrudTable.jsx": 3,
  "src/components/pricing/MatrixSuggestPanel.jsx": 4,
  "src/components/imports/ImportWizard.jsx": 8,
  "src/components/walkin/WalkInSale.jsx": 8,
  "src/components/walkin/WalkInReceipt.jsx": 2,
};
for (const [file, before] of Object.entries(HANDLER_BASELINE)) {
  const now = onClicks(src(file));
  assert.ok(
    now >= before,
    `${file}: onClick count regressed (${before} -> ${now}) -- a handler was likely removed`
  );
}

console.log("PASS ui-pass-ops");
