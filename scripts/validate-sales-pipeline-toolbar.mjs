import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const count = (snippet) => page.split(snippet).length - 1;
let checks = 0;
const check = (condition, description) => { assert.ok(condition, description); checks += 1; };

check(count('aria-label="Sales Pipeline navigation"') === 1, "One clear toolbar region.");
check(page.includes('className="grid min-w-0 grid-cols-12 items-center gap-2 sm:flex sm:flex-wrap"'), "Primary controls use a deliberate 12-column phone layout and wrap on desktop.");
check(count('aria-label="Workspace"') === 1, "Workspace selector is retained.");
for (const label of ["Current Pipeline", "Won / Lost Outcomes", "Legacy History", "All Records"]) {
  check(page.includes('>' + label + '</SelectItem>'), "Workspace option retained: " + label);
}
check(count('aria-label="Pipeline view"') === 1 && page.includes('sm:hidden'), "Mobile view selector is present.");
check(count('role="group" aria-label="View"') === 1 && page.includes('sm:flex'), "Desktop segmented view remains.");
for (const name of ["table", "board", "daily", "insights"]) {
  check(page.includes('chooseView("' + name + '")'), "Desktop view reachable: " + name);
}
check(page.includes('if (nextView === "daily" || nextView === "insights")'), "Daily and Insights still clear incompatible filters.");
check(count('aria-label="Search sales pipeline"') === 1, "Search remains directly accessible.");
check(count('setShowNewClientForm(true)') === 1 && page.includes('{isRegistered && !showDuplicateCleanup && ('), "New Client remains registered-user only and unavailable while the spreadsheet is unmounted.");
check(count('aria-label="Sales Pipeline tools"') === 1, "One labeled Tools control.");
const tools = page.split('<DropdownMenuContent align="end" className="w-52">')[1]?.split('</DropdownMenuContent>')[0];
check(Boolean(tools), "Tools menu exists.");
check(tools.indexOf('{canImportExport && !showDuplicateCleanup && (') >= 0, "Import/export actions retain their permission gate and are hidden while Duplicate Cleanup unmounts the spreadsheet.");
for (const action of ["importFromExcel()", "exportToExcel()", "openImportHistory()"]) {
  check(count('spreadsheetRef.current?.' + action) === 1 &&
    tools.includes('spreadsheetRef.current?.' + action), "Original ref action moved, not duplicated: " + action);
}
check(tools.includes('setShowDuplicateCleanup((open) => !open)'), "Duplicate Cleanup remains available.");
check(page.includes('showDuplicateCleanup && (') &&
  page.includes('setShowDuplicateCleanup(false)'), "An obvious Return to Pipeline action appears during cleanup.");
check(count('aria-label="Information Filters"') === 1 && count('aria-label="Column Filters"') === 1,
  "Existing filters and column presets retained.");
check(page.includes('aria-label="Sales Pipeline filters and column layouts"'), "The secondary filter row is separated.");
check(page.includes('value={outcomePeriod}') && page.includes('recordScope === "outcomes"'),
  "Outcome period is still contextual.");
check(page.includes('SALES_PRIMARY_ATTENTION.map((option)') &&
  page.includes('visibleSalesMoreAttentionGroups(pipelineSummary, attentionFilter).map((group, index)') &&
  page.includes('onSelect={() => applyAttentionFilter(option.key)}'),
  "The existing attention filters are exposed through compact shortcuts and grouped More Filters.");
check(page.includes('aria-label="Quick Sales attention filters"') &&
  page.includes('aria-label="Clear active Sales information and attention filters"'),
  "Quick attention controls are labeled and active filters can be cleared.");
check(page.includes('onSummaryChange={setPipelineSummary}') &&
  page.includes('activeColumnPreset={activeColumnPreset}'), "Sales data and saved preset handoff remain unchanged.");

console.log(`Sales Pipeline top toolbar structure and preserved actions: ${checks}/${checks} PASS.`);
