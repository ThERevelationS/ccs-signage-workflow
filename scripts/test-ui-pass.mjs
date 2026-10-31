// UI-kit adoption pass for the queues / jobs / customer-360 surfaces.
// Two checks per assigned file:
//   1. the shared kit primitives it adopted are actually imported/used
//   2. event-handler proxy -- the onClick attribute count must not drop
//      below the pre-migration baseline captured from git history
//      (git show <first-kit-commit>~1:<file>), so the pass proves no
//      handler was removed while restyling.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");
const onClicks = (s) => (s.match(/onClick=/g) || []).length;

// --- 1. Kit adoption ---------------------------------------------------------
const KIT_TOKENS = {
  "src/pages/ProductQueues.jsx": ["PageHeader", "breadcrumbs", "Queues", "Product Queues"],
  "src/components/queues/ProductQueue.jsx": [
    "FilterBar", "FilterField", "FilterSearchInput", "FilterSelect",
    "DataTableShell", "RecordLink", "StatusChip",
  ],
  "src/components/jobs/JobWorkspace.jsx": [
    "PageHeader", "breadcrumbs", "StatusChip", "RecordLink", "EmptyState",
    "KpiStrip", "DataTableShell", "FilterSearchInput",
  ],
  "src/pages/Customer360.jsx": ["PageHeader", "EmptyState", "breadcrumbs"],
  "src/components/customer360/Sections.jsx": ["EmptyState", "RecordLink", "KitStatusChip", "emptyActionTo"],
  "src/components/customer360/DataList.jsx": ["EmptyState", "emptyActionLabel", "emptyActionTo"],
  "src/components/customer360/KpiStrip.jsx": ["KpiStrip", "@/components/kit", "tiles"],
};

for (const [file, tokens] of Object.entries(KIT_TOKENS)) {
  const s = src(file);
  assert.ok(s.includes("components/kit"), `${file} must import from the shared kit`);
  for (const t of tokens) {
    assert.ok(s.includes(t), `${file} must use ${t}`);
  }
}

// Local status/badge tone helpers must be gone -- statuses render through
// kit StatusChip / statusTones only.
const jw = src("src/components/jobs/JobWorkspace.jsx");
assert.ok(!jw.includes("const TONE ="), "JobWorkspace local TONE map removed");
assert.ok(!jw.includes("STAGE_TONE"), "JobWorkspace local STAGE_TONE removed");
assert.ok(!jw.includes("PAYMENT_TONE"), "JobWorkspace local PAYMENT_TONE removed");
const pq = src("src/components/queues/ProductQueue.jsx");
assert.ok(!/const badge\s*=\s*\(/.test(pq), "ProductQueue local badge() helper removed");
const c360 = src("src/pages/Customer360.jsx");
assert.ok(!c360.includes("HeaderBadge"), "Customer360 HeaderBadge replaced by PageHeader status");

// --- 2. Handler-preservation proxy --------------------------------------------
// Baselines: onClick= counts from git history at the last commit before the
// kit pass touched each file (git log -S components/kit, parent commit).
const HANDLER_BASELINE = {
  "src/pages/ProductQueues.jsx": 1,
  "src/pages/Customer360.jsx": 3,
  "src/components/customer360/Sections.jsx": 0,
  "src/components/customer360/DataList.jsx": 0,
  "src/components/customer360/KpiStrip.jsx": 0,
  "src/components/queues/ProductQueue.jsx": 11,
  "src/components/jobs/JobWorkspace.jsx": 5,
};
for (const [file, before] of Object.entries(HANDLER_BASELINE)) {
  const now = onClicks(src(file));
  assert.ok(
    now >= before,
    `${file}: onClick count regressed (${before} -> ${now}) -- a handler was likely removed`
  );
}

console.log("PASS ui-pass");
