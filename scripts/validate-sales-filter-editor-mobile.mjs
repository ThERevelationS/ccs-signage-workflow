import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editor = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const pipeline = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const financials = readFileSync("src/pages/Financials.jsx", "utf8");
const section = (start, end) => {
  const from = editor.indexOf(start);
  const to = editor.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing section boundary: ${start}`);
  return editor.slice(from, to);
};
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const shell = section('<Dialog open={isOpen}', '{activeSubTab === "pool" && (');
const pool = section('{activeSubTab === "pool" && (', '{activeSubTab === "create" && activeTab === "filters"');
const filters = section('{activeSubTab === "create" && activeTab === "filters"', '{activeSubTab === "create" && activeTab === "columns"');
const columns = section('{activeSubTab === "create" && activeTab === "columns"', '</DialogContent>');
const row = section('<div key={index} className="mt-2 grid', '                        </Button>\n                      </div>');

check(shell.includes('className="clay-card min-w-0 border-none p-3 sm:p-5 dark:border dark:border-slate-700 dark:bg-slate-950 [&>button]:hidden"'),
  "Shared dialog must use compact phone padding and a restrained desktop/dark-mode shell");
check(shell.includes('maxWidth: activeTab === "columns" ? "96vw" : "90vw"') &&
      shell.includes('width: activeTab === "columns" ? "1400px" : "1100px"') &&
      shell.includes('maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column"'),
  "Column editor may widen toward full-screen while dialog bounds remain capped");
check(shell.includes('<DialogHeader className="shrink-0">') &&
      shell.includes('flex flex-wrap items-start justify-between gap-2') &&
      shell.includes('text-base font-bold leading-tight sm:text-2xl'),
  "Long dialog title and Close button must wrap without consuming the entire phone width");
check(shell.includes('className="clay-button min-h-11 shrink-0') &&
      shell.includes('hasUnsavedEdits ? saveItem({ closeAfterSave: true }) : requestClose()'),
  "Reachable 44px Close/Save & Close must retain guarded save behavior");
check(shell.includes('className="mb-3 flex shrink-0 flex-wrap gap-2 sm:mb-4"'),
  "Pool/Edit tabs must wrap instead of overflowing the dialog");
check((shell.match(/min-h-11 min-w-0 whitespace-normal text-xs sm:min-h-0 sm:text-sm/g) || []).length === 2,
  "Both sub-tab buttons need independent touch targets and compact desktop text");
check(shell.includes('onClick={() => requestNavigation(resetForm)}') &&
      shell.includes('requestNavigation(() => {'),
  "Switching sub-tabs must retain the unsaved-edit guard");
check(pool.includes('className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2"'),
  "Pool must scroll within the fixed-height dialog rather than clipping selected presets");
check(filters.includes('className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2"') &&
      filters.includes('className="clay-card min-w-0 space-y-4 p-3 sm:p-4"'),
  "Information Filter editor must scroll to its save buttons at phone heights");
check(columns.includes('className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"'),
  "Shared dialog must retain scrollable column editing");
check(row.includes('grid-cols-[minmax(0,1fr)_auto]') && row.includes('sm:flex sm:items-start') &&
      row.includes('sm:border-0 sm:bg-transparent sm:p-0'),
  "Each condition must stack into phone grid rows and preserve the compact desktop row");
check(row.includes('aria-label={`Filter field for condition ${index + 1}`}') &&
      row.includes('col-start-1 row-start-1 h-11 w-full min-w-0 text-xs sm:h-9 sm:flex-1'),
  "Field picker must fit beside its remove button and expose its condition number");
check(row.includes('aria-label={`Operator for condition ${index + 1}`}') &&
      row.includes('col-span-2 row-start-2 h-11 w-full min-w-0 text-xs sm:h-9 sm:w-40 sm:flex-none'),
  "Operator must use an independent full-width mobile row and retain desktop width");
check(row.includes('col-span-2 row-start-3 min-w-0 rounded-md border bg-white p-2 sm:flex-1') &&
      row.includes('className="h-11 w-full min-w-0 text-xs sm:h-7"'),
  "Multi-value dropdown wrapper and Add Value picker must shrink within the phone viewport");
check(row.includes('className="inline-flex max-w-full min-w-0 items-center') &&
      row.includes('className="min-w-0 break-words">{val}</span>') &&
      row.includes('aria-label={`Remove ${val} from condition ${index + 1}`}') &&
      row.includes('className="inline-flex h-11 w-11 shrink-0'),
  "Long selected values and removal controls must wrap and remain independently tappable");
check(row.includes('aria-label={`Values for condition ${index + 1}`}') &&
      row.includes('placeholder="Comma-separated values"'),
  "Raw multi-value entry must retain editable comma-separated values");
check(row.includes('aria-label={`Value for condition ${index + 1}`}') &&
      row.includes('col-span-2 row-start-3 h-11 w-full min-w-0 text-xs sm:h-9 sm:flex-1'),
  "Dropdown-based value picker must occupy the full mobile row");
check(row.includes('aria-label={`${selectedField?.label || "Value"} for condition ${index + 1}`}') &&
      row.includes('type={selectedField?.type === "number" ? "number" : "text"}'),
  "Plain text, numeric and date fields must retain their existing input types");
check((row.match(/col-span-2 row-start-3 h-11 w-full min-w-0 sm:h-9 sm:flex-1/g) || []).length === 2,
  "Both raw-value entry paths need full-width 44px phone controls");
check(row.includes('aria-label={`Remove condition ${index + 1}`}') &&
      row.includes('col-start-2 row-start-1 h-11 w-11 shrink-0 sm:h-9 sm:w-9') &&
      row.includes('disabled={filterConditions.length === 1 || isSaving}'),
  "Independent remove button must remain phone-sized, protect the final condition and lock during save");
check(filters.includes('onClick={addCondition}') &&
      filters.includes('className="mt-2 min-h-11 sm:min-h-0"'),
  "Add Condition must stay visible, reachable and phone-sized");
check(filters.includes('className="flex flex-wrap gap-2"') &&
      filters.includes('onClick={() => saveItem()}') &&
      filters.includes('onClick={() => requestNavigation(resetForm)} disabled={isSaving} className="min-h-11 sm:min-h-0"'),
  "Filter footer must wrap Save/Cancel without bypassing the unsaved-navigation guard");
check(row.includes('updateCondition(index, "field", value)') &&
      row.includes('updateCondition(index, "operator", value)') &&
      row.includes('updateCondition(index, "value", "")') &&
      row.includes('removeCondition(index)'),
  "Responsive markup must preserve existing condition-field, operator and remove actions");
check(editor.includes('dispatchColumnDraft({ type: "undo" })') &&
      editor.includes('dispatchColumnDraft({ type: "redo" })') &&
      editor.includes('className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"') &&
      editor.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Compact always-visible column grid, Undo/Redo and horizontal preview must remain intact");
check(editor.includes('setSalesFilterSelectionSafely') &&
      editor.includes('updateSalesFilterIfUnchanged') &&
      editor.includes('preserveLegacySalesColumnEntries'),
  "Shared save, conflict and historical column preservation must remain intact");
check(pipeline.includes('import CustomFilterDialog from "@/components/sales/CustomFilterDialog"') &&
      financials.includes('import CustomFilterDialog from "@/components/sales/CustomFilterDialog"'),
  "Sales Pipeline and Financials must continue using the same existing shared editor");
console.log(`Sales Filter editor responsive source regressions: ${checks}/${checks} PASS. Authenticated mobile/browser acceptance remains blocked.`);
