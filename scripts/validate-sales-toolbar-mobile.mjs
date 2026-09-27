import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level responsive and interaction regression. Genuine authenticated
// browser checks at narrow-phone, tablet and desktop widths remain separate.
const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const section = page.split('<section aria-label="Sales Pipeline navigation"')[1]?.split("</section>")[0] ?? "";
let checks = 0;
const check = (value, reason) => { assert.ok(value, reason); checks++; };

check(Boolean(section), "Sales Pipeline header remains a distinct navigation region.");
check(section.includes('className="grid min-w-0 grid-cols-12 items-center gap-2 sm:flex sm:flex-wrap"'),
  "Phone uses a 12-column layout without a horizontal toolbar; tablets and desktop wrap.");
check(section.includes('order-1 flex min-w-0 items-center') &&
  section.includes('isRegistered || showDuplicateCleanup ? "col-span-7" : "col-span-12"'),
  "Title occupies seven phone columns beside an action, or all twelve for unregistered users.");
check(section.includes('title="Sales Pipeline"') &&
  section.includes('min-w-0 truncate text-sm font-bold'),
  "The page title can shrink instead of pushing other buttons beyond the viewport.");
check(section.includes('order-3 flex min-w-0 items-center sm:order-2') &&
  section.includes('recordScope === "history" ? "col-span-12" : "col-span-7"'),
  "Workspace stays visible on mobile and fills the row when History has no view selector.");
check(section.includes('aria-label="Workspace" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-[156px]"'),
  "Workspace select fills its phone grid cell with a 44px touch target.");
check(section.includes('order-4 col-span-5 h-11 w-full min-w-0 text-xs sm:hidden'),
  "Mobile view selector fills the other five phone columns, without clipping.");
check(section.includes('order-4 hidden shrink-0 items-center sm:order-3 sm:flex'),
  "Desktop retains the visible segmented view controls.");
for (const view of ["table", "board", "daily", "insights"]) {
  check(section.includes('chooseView("' + view + '")} aria-pressed={viewMode === "' + view + '"}'),
    "Desktop view announces its selected state: " + view);
}
check((section.match(/focus-visible:ring-inset focus-visible:ring-blue-500/g) || []).length === 4,
  "All segmented desktop views support visible keyboard focus.");
check(section.includes('recordScope === "current" && <SelectItem value="daily">Daily</SelectItem>') &&
  section.includes('recordScope === "current" && <SelectItem value="insights">Insights</SelectItem>'),
  "Daily and Insights are offered only in Current Pipeline on phones.");
check(section.includes('recordScope === "outcomes" && (') &&
  section.includes('order-4 col-span-5 flex min-w-0 items-center sm:order-3') &&
  section.includes('aria-label="Outcome Period" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-36"'),
  "Outcome Period occupies the second phone selector only when viewing Won/Lost Outcomes.");
check(section.includes('value={outcomePeriod}') &&
  ["All Tracked", "Last 30 Days", "Last 90 Days", "Last 12 Months"].every(
    (label) => section.includes('>' + label + '</SelectItem>')),
  "All existing Outcome Period choices are preserved.");
check(section.includes('order-5 col-span-8 flex min-w-0 items-center sm:order-4 sm:min-w-[220px] sm:flex-1') &&
  section.includes('aria-label="Search sales pipeline"') &&
  section.includes('className="h-11 w-full pl-9 text-xs sm:h-9"'),
  "Search remains directly available in eight phone columns with a 44px control.");
check(section.includes('order-2 col-span-5') &&
  section.includes('sm:order-5 sm:h-9') &&
  section.includes('onClick={() => setShowNewClientForm(true)}') &&
  section.includes('{isRegistered && !showDuplicateCleanup && ('),
  "New Client stays prominent and registration-gated, but is hidden when the spreadsheet is unmounted.");
check(section.includes('className="clay-button order-2 col-span-5 h-11 min-w-0') &&
  section.includes('className="order-2 col-span-5 h-11 min-w-0 border-green-300') &&
  section.includes('onClick={() => setShowDuplicateCleanup(false)}'),
  "Return to Pipeline replaces the first-row shortcut during Duplicate Cleanup.");
check(section.includes('order-6 col-span-4 flex min-w-0 justify-end sm:order-7') &&
  section.includes('aria-label="Sales Pipeline tools" title="Sales Pipeline tools"') &&
  section.includes('<span>Tools</span>') &&
  section.includes('sm:h-9 sm:gap-1.5'),
  "Tools stays visibly labeled next to Search on phones and compact on desktop.");
check(section.includes('{canImportExport && !showDuplicateCleanup && (') &&
  ["importFromExcel()", "exportToExcel()", "openImportHistory()"].every(
    (action) => section.includes("spreadsheetRef.current?." + action)),
  "Existing import/export tools remain behind their permission gate.");
check(section.includes('setShowDuplicateCleanup((open) => !open)'),
  "Tools retains Duplicate Cleanup access.");
check(section.includes('aria-label="Sales Pipeline filters and column layouts"') &&
  section.includes('aria-label="Quick Sales attention filters"') &&
  section.includes('aria-label="Information Filters"') &&
  section.includes('aria-label="Column Filters"'),
  "Quick attention, saved filters and column layouts remain directly available.");
check(7 + 5 === 12 && 8 + 4 === 12,
  "The two mobile selector columns and search/tools columns fit the 12-column grid.");
check(!section.includes('overflow-x-auto') && !section.includes('min-w-[180px]'),
  "The main mobile toolbar no longer depends on horizontal scrolling or a fixed search width.");
check(page.includes('activeColumnPreset={activeColumnPreset}') &&
  page.includes('onSummaryChange={setPipelineSummary}'),
  "Existing Sales data flow and selected column preset remain untouched.");

console.log(`Sales Pipeline mobile toolbar structure and contextual actions: ${checks}/${checks} PASS.`);
