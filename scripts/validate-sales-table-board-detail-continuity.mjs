import fs from "node:fs";

const source = fs.readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const checks = [
  ["view cleanup is limited to report/task surfaces", /if \(!\["insights", "daily"\]\.includes\(viewMode\)\) return;/],
  ["view cleanup clears selected opportunity", /if \(!\["insights", "daily"\]\.includes\(viewMode\)\) return;[\s\S]*?setSelectedWorkOrder\(null\);/],
  ["table/board are not named in view cleanup guard", !/if \(!\[(?:[^\]]*"table"|[^\]]*"board")/.test(source)],
  ["mobile card surface renders shared opportunity dialogs", /if \(isMobile && viewMode !== "board"\)[\s\S]*?\{renderOpportunityDialogs\(\)\}/],
  ["board surface renders shared opportunity dialogs", /if \(viewMode === "board"\)[\s\S]*?<SalesPipelineKanban[\s\S]*?\{renderOpportunityDialogs\(\)\}/],
  ["table surface renders shared opportunity dialogs", /<SalesPipelineTableBody[\s\S]*?\{renderOpportunityDialogs\(\)\}/],
  ["board opens the same opportunity detail flow", /<SalesPipelineKanban[\s\S]*?onOpenDetails=\{openOpportunityDetails\}/],
  ["mobile cards open the same opportunity detail flow", /<SalesPipelineMobileCards[\s\S]*?onOpenDetails=\{openOpportunityDetails\}/],
  ["table rows open the same opportunity detail flow", /<SalesPipelineTableBody[\s\S]*?setSelectedWorkOrder=\{openOpportunityDetails\}/],
  ["selected row queue index is preserved while still visible", /if \(currentIndex >= 0\) \{\s*selectedQueueIndexRef\.current = currentIndex;\s*return;/],
  ["navigation resolves against current filtered queue", /const currentIndex = filteredWorkOrders\.findIndex\(\(row\) => row\.id === selectedWorkOrder\.id\);/],
  ["navigation moves selected opportunity without forcing full details", /setSelectedWorkOrder\(filteredWorkOrders\[targetIndex\]\);\s*setShowFullWorkOrderDetails\(false\);/],
];

let pass = 0;
for (const [label, expectation] of checks) {
  const ok = expectation === true || (expectation instanceof RegExp && expectation.test(source));
  if (!ok) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    pass += 1;
  }
}
console.log(`Sales Table/Board detail continuity: ${pass}/${checks.length} PASS.`);
