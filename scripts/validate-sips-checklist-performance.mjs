import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level guard for the long-checklist hierarchy indexes. The goal is to
// ensure render paths reuse typed child arrays instead of repeatedly filtering
// the same parent children on every unrelated re-render.
const source = readFileSync(
  new URL("../src/components/sips/ProductChecklistDialog.jsx", import.meta.url),
  "utf8"
);
const completedSource = readFileSync(
  new URL("../src/components/sips/ChecklistCompletedSection.jsx", import.meta.url),
  "utf8"
);

let passed = 0;
function check(name, run) {
  run();
  console.log("PASS " + name);
  passed += 1;
}

check("typed child hierarchy is memoized with the checklist", () => {
  assert.match(
    source,
    /const \{ checklistItemById, checklistChildrenByParentId, checklistChildrenByParentType, childrenCompleteByItemId \} = useMemo\(\(\) => \{/
  );
  assert.match(source, /const childrenByParentType = new Map\(\);/);
  assert.match(source, /childrenByParentType\.set\(item\.parent_id, \{ task: \[\], detail: \[\], subtask: \[\] \}\);/);
  assert.match(source, /\}, \[checklist\]\);/);
});

check("main checklist rendering reuses memoized typed task and detail arrays", () => {
  assert.match(source, /const tasks = checklistChildrenByParentType\.get\(item\.id\)\?\.task \|\| \[\];/);
  assert.match(source, /const details = \(checklistChildrenByParentType\.get\(item\.id\)\?\.detail \|\| \[\]\)\.map/);
  assert.match(source, /tasks: checklistChildrenByParentType\.get\(detail\.id\)\?\.task \|\| \[\]/);
  assert.match(source, /const \{ displayItem, isCompleted: isItemCompleted, attentionLabel \} = renderMeta;/);
});

check("checklist-option rendering reuses the same memoized row metadata", () => {
  assert.match(source, /const renderMeta = checklistRenderMetaById\.get\(rawItem\.id\);/);
  assert.match(source, /const \{ displayItem: stDisplayItem, isCompleted: isStItemCompleted, attentionLabel \} = renderMeta;/);
});

check("subtask render paths no longer filter parent children on every render", () => {
  assert.equal(
    /\(checklistChildrenByParentId\.get\(task\.id\) \|\| \[\]\)\.filter\(st => st\.type === 'subtask'\)/.test(source),
    false
  );
  assert.match(source, /\(checklistChildrenByParentType\.get\(task\.id\)\?\.subtask \|\| \[\]\)\.map/);
});

check("task and detail render setup no longer filters the same item children", () => {
  assert.equal(/itemChildren\.filter\(i => i\.type === 'task'\)/.test(source), false);
  assert.equal(/itemChildren\.filter\(i => i\.type === 'detail'\)/.test(source), false);
  assert.equal(/stItemChildren\.filter\(i => i\.type === 'task'\)/.test(source), false);
  assert.equal(/stItemChildren\.filter\(i => i\.type === 'detail'\)/.test(source), false);
});

check("status condition options are indexed instead of scanning all conditions per row", () => {
  assert.match(source, /const \{ dropdownConditionById, dropdownConditionOrderById \} = useMemo/);
  assert.match(source, /const dropdownOptionsByChecklistItemId = useMemo/);
  assert.match(source, /dropdownOptionsByChecklistItemId\.get\(displayItem\.id\)/);
  assert.match(source, /dropdownOptionsByChecklistItemId\.get\(detail\.id\)/);
  assert.match(source, /dropdownOptionsByChecklistItemId\.get\(stDisplayItem\.id\)/);
  assert.equal(/dropdownConditions\s*\n\s*\.filter\(dd =>/.test(source), false);
  assert.equal(/dropdownConditions\.find\(d => d\.id === dropdownId\)/.test(source), false);
});

check("indexed condition options preserve configured global condition order", () => {
  assert.match(source, /dropdownConditionOrderById: new Map\(dropdownConditions\.map\(\(condition, index\) => \[condition\.id, index\]\)\)/);
  assert.match(source, /\.sort\(\(a, b\) => \(dropdownConditionOrderById\.get\(a\.id\)/);
});

check("completed section reuses indexed status options", () => {
  assert.match(source, /dropdownOptionsByChecklistItemId=\{dropdownOptionsByChecklistItemId\}/);
  assert.match(completedSource, /dropdownOptionsByChecklistItemId\.get\(item\.id\)/);
  assert.match(completedSource, /dropdownOptionsByChecklistItemId\.get\(stItem\.id\)/);
  assert.equal(/dropdownConditions\.filter\(/.test(completedSource), false);
});

check("completed section memoizes visible groups and count in one pass", () => {
  assert.match(completedSource, /const \{ renderGroups, totalCount \} = useMemo\(\(\) => \{/);
  assert.match(completedSource, /Object\.entries\(completedChecklist\)\.forEach/);
  assert.match(completedSource, /return \{ renderGroups: groups, totalCount: count \};/);
  assert.match(completedSource, /\}, \[completedChecklist\]\);/);
  assert.match(completedSource, /renderGroups\.map/);
});

check("collapse-all state is memoized across unrelated checklist renders", () => {
  assert.match(source, /const allDetailsCollapsed = useMemo\(/);
  assert.match(source, /\[expandableChecklistIds, expandedItems\]/);
  assert.match(source, /const allProductsCollapsed = useMemo\(/);
  assert.match(source, /\[activeProductNames, collapsedProducts\]/);
});

check("search and Needs Input navigation use direct rendered-row lookup first", () => {
  assert.match(source, /const findRenderedChecklistItemElement = \(candidateIds\) => \{/);
  assert.match(source, /document\.querySelector\(`\[data-sips-checklist-item-id=/);
  assert.match(source, /window\.CSS\?\.escape/);
  assert.match(source, /findRenderedChecklistItemElement\(\[scrollTargetId\]\)/);
  assert.match(source, /findRenderedChecklistItemElement\(\[item\.id, item\.parent_id, topLevelId\]\)/);
});

check("row display hierarchy metadata is memoized instead of rebuilt per render", () => {
  assert.match(source, /const checklistRenderMetaById = useMemo\(\(\) => \{/);
  assert.match(source, /displayItem: \{ \.\.\.item, tasks, details \}/);
  assert.match(source, /attentionLabel: itemAttentionLabelById\.get\(item\.id\) \|\| null/);
  assert.match(source, /const renderMeta = checklistRenderMetaById\.get\(rawItem\.id\);/);
  assert.equal(/const itemTasks = checklistChildrenByParentType\.get\(item\.id\)/.test(source), false);
  assert.equal(/const stItemTasks = checklistChildrenByParentType\.get\(stItem\.id\)/.test(source), false);
});

check("attention badges use one memoized row lookup", () => {
  assert.equal(/getItemAttentionLabel\(/.test(source), false);
  assert.match(source, /const \{ displayItem, isCompleted: isItemCompleted, attentionLabel \} = renderMeta;/);
  assert.match(source, /const detailAttentionLabel = detailRenderMeta\?\.attentionLabel \|\| null;/);
  assert.match(source, /const \{ displayItem: stDisplayItem, isCompleted: isStItemCompleted, attentionLabel \} = renderMeta;/);
});

check("Needs Input navigation reuses memoized active/completed membership", () => {
  assert.match(source, /const needsInputNavigationIndex = useMemo\(\(\) => \{/);
  assert.match(source, /const activeProductByItemId = new Map\(\);/);
  assert.match(source, /return \{ activeIds, completedIds, activeProductByItemId \};/);
  assert.match(source, /\}, \[activeChecklist, completedChecklist\]\);/);
  assert.match(source, /const \{ activeIds, completedIds, activeProductByItemId \} = needsInputNavigationIndex;/);
  assert.match(source, /activeProductByItemId\.get\(target\.id\)/);
  assert.equal(/const findItemProductName =/.test(source), false);
});

check("active search index is built during active/completed classification", () => {
  assert.match(source, /searchIndex: checklistSearchIndexData/);
  assert.match(source, /const addSearchEntry = \(item, productName, subTemplateName = ""\) => \{/);
  assert.match(source, /searchIndex\.push\(\{ item, productName, searchableText \}\);/);
  assert.match(source, /if \(!isCompleted\) addSearchEntry\(item, productName\);/);
  assert.match(source, /if \(!parentCompleted\) addSearchEntry\(item, productName, stName\);/);
  assert.equal(/const checklistSearchIndexData = useMemo\(/.test(source), false);
});

check("nested checklist indentation preserves phone width", () => {
  assert.match(source, /className="ml-0 sm:ml-4 mt-2 border-l-2 border-blue-300 pl-2 sm:pl-3"/);
  assert.match(source, /className="ml-2 sm:ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-2"/);
  assert.match(source, /className="ml-1 sm:ml-4 mt-1 space-y-0\.5 border-l border-orange-200 pl-1\.5"/);
  assert.match(source, /className="ml-1 sm:ml-4 mt-1 space-y-0\.5"/);
  assert.match(source, /ml-1 sm:ml-4 mt-0\.5 flex flex-wrap sm:flex-nowrap items-center gap-1 bg-yellow-50/);
  assert.match(source, /ml-1 sm:ml-3 mt-0\.5 flex flex-wrap sm:flex-nowrap items-center gap-1 bg-yellow-50/);
  assert.equal(source.includes("className={`ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50"), false);
  assert.equal(source.includes("className={`ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50"), false);
});

check("inline nested add controls use reduced phone indentation", () => {
  assert.match(source, /className="ml-1 sm:ml-4 mt-0\.5 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-yellow-50/);
  assert.match(source, /className="ml-1 sm:ml-4 mt-2 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-2 bg-orange-50/);
  assert.match(source, /className="ml-1 sm:ml-3 mt-0\.5 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-yellow-50/);
  assert.match(source, /className="ml-1 sm:ml-4 mt-1 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-orange-50/);
});

check("inline add task and detail forms reserve a full phone input row", () => {
  assert.equal((source.match(/className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"/g) || []).length, 8);
  assert.match(source, /className="flex flex-wrap items-center justify-end sm:justify-start gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400"/);
  assert.match(source, /className="flex flex-wrap items-center justify-end sm:justify-start gap-2 bg-orange-50 p-1\.5 rounded border-l-4 border-orange-400"/);
  assert.match(source, /className="flex flex-wrap items-center justify-end sm:justify-start gap-1"/);
});

check("inline editors reserve a full phone row for text and actions", () => {
  assert.equal((source.match(/className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0"/g) || []).length, 10);
  assert.equal(source.includes('className="flex-1 flex gap-1 min-w-0"'), false);
});

check("task assignment actions use a dedicated phone row", () => {
  assert.equal((source.match(/className="basis-full sm:basis-auto flex flex-wrap items-center justify-end sm:justify-start gap-1"/g) || []).length, 3);
  assert.equal((source.match(/<MultiUserSelectInline/g) || []).length, 3);
});

check("main and detail quick-add actions use a dedicated phone row", () => {
  assert.equal((source.match(/className="basis-full sm:basis-auto flex justify-end sm:justify-start gap-1/g) || []).length, 4);
  assert.equal(source.includes('className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity"'), false);
});

check("standalone destructive actions use an intentional phone row", () => {
  const destructivePhoneRows = source
    .split('className="basis-full sm:basis-auto flex justify-end sm:justify-start">')
    .slice(1)
    .map(section => section.slice(0, 700));
  assert.equal(destructivePhoneRows.length, 3);
  assert.ok(destructivePhoneRows.some(section => section.includes("deleteChecklistItem(displayItem.id)")));
  assert.ok(destructivePhoneRows.some(section => section.includes("deleteChecklistItem(detail.id)")));
  assert.ok(destructivePhoneRows.some(section => section.includes("deleteChecklistItem(stDisplayItem.id)")));
});

check("deep sub-template detail tasks can wrap on phones", () => {
  assert.match(source, /className={\`flex flex-wrap sm:flex-nowrap items-center gap-1 bg-orange-50 p-0\.5 rounded group\/stdtask/);
  assert.equal(source.includes("className={`flex items-center gap-1 bg-orange-50 p-0.5 rounded group/stdtask"), false);
});

check("Needs Input navigation moves keyboard focus to the revealed row", () => {
  assert.match(source, /targetElement\.focus\(\{ preventScroll: true \}\);/);
  assert.equal((completedSource.match(/data-sips-checklist-item-id=\{String\([^)]*\.id\)\} tabIndex=\{-1\}/g) || []).length, 2);
});

check("search navigation focuses every rendered result row without adding tab stops", () => {
  assert.equal((source.match(/targetElement\.focus\(\{ preventScroll: true \}\);/g) || []).length, 2);
  assert.equal((source.match(/data-sips-checklist-item-id=\{String\([^)]*\.id\)\} tabIndex=\{-1\}/g) || []).length, 10);
  assert.equal(source.includes("data-sips-checklist-item-id={String(task.id)} key={task.id}"), false);
  assert.equal(source.includes("data-sips-checklist-item-id={String(subtask.id)} key={subtask.id}"), false);
});

check("clearing search returns keyboard focus to the search field", () => {
  assert.match(source, /const checklistSearchInputRef = useRef\(null\);/);
  assert.match(source, /ref=\{checklistSearchInputRef\}/);
  assert.match(source, /checklistSearchInputRef\.current\?\.focus\(\);/);
  assert.match(source, /e\.key === "Escape" && checklistSearchQuery/);
});

check("Escape from a focused search result returns to search without hijacking child controls", () => {
  assert.match(source, /const handleChecklistResultKeyDown = \(e\) => \{/);
  assert.match(source, /e\.key !== "Escape"/);
  assert.match(source, /e\.target\?\.hasAttribute\?\.\("data-sips-checklist-item-id"\)/);
  assert.match(source, /focusedSearchId && checklistSearchQuery/);
  assert.match(source, /className="flex-1 overflow-y-auto space-y-3 pr-0\.5"/);
  assert.match(source, /onKeyDown=\{handleChecklistResultKeyDown\}/);
});

check("Escape from a Needs Input target returns to the Needs Input summary", () => {
  assert.match(source, /const needsInputSummaryRef = useRef\(null\);/);
  assert.match(source, /ref=\{needsInputSummaryRef\}/);
  assert.match(source, /if \(!focusedNeedsInputId\) return;/);
  assert.match(source, /setFocusedNeedsInputId\(null\);/);
  assert.match(source, /needsInputSummaryRef\.current\?\.focus\(\);/);
});

check("navigation highlights clear when interaction leaves the highlighted row", () => {
  assert.match(source, /const clearNavigationHighlightOutsideRow = \(target\) => \{/);
  assert.match(source, /target\?\.closest\?\.\("\[data-sips-checklist-item-id\]"\)/);
  assert.match(source, /targetRowId !== String\(focusedSearchId\)/);
  assert.match(source, /targetRowId !== String\(focusedNeedsInputId\)/);
  assert.match(source, /const handleChecklistResultBlurCapture = \(e\) => \{/);
  assert.match(source, /if \(nextRow === currentRow\) return;/);
  assert.match(source, /onPointerDownCapture=\{\(e\) => clearNavigationHighlightOutsideRow\(e\.target\)\}/);
  assert.match(source, /onBlurCapture=\{handleChecklistResultBlurCapture\}/);
});

check("status transitions safely release Active/Completed navigation focus", () => {
  const statusHandler = source.slice(source.indexOf("const applyChecklistStatus ="), source.indexOf("const checkIfComplete ="));
  assert.match(statusHandler, /wasCompleted !== willBeCompleted/);
  assert.match(statusHandler, /setFocusedSearchId\(null\);/);
  assert.match(statusHandler, /setFocusedNeedsInputId\(null\);/);
  assert.match(statusHandler, /setChecklistSearchIndex\(-1\);/);
  assert.match(statusHandler, /scheduleNavigationFocus\(\(\) => checklistSearchInputRef\.current\?\.focus\(\)\)/);
  assert.ok(statusHandler.indexOf("if (!item.approved_by)") < statusHandler.indexOf("wasCompleted !== willBeCompleted"));
  assert.ok(statusHandler.indexOf("if (selectedCondition?.is_completed && !areChildrenComplete(itemId))")
    < statusHandler.indexOf("wasCompleted !== willBeCompleted"));
});

check("reclassified or resolved navigation results do not retain stale highlights", () => {
  assert.match(source, /focusedSearchId && !checklistSearchResults\.some/);
  assert.match(source, /!needsInputNavigationIndex\.activeIds\.has\(focusedSearchId\)/);
  assert.match(source, /focusedNeedsInputSourceIdRef\.current = target\.id/);
  assert.match(source, /focusedNeedsInputId && !needsInputPrimaryItems\.some/);
  assert.match(source, /findRenderedChecklistItemElement\(\[focusedNeedsInputId\]\)/);
  assert.match(source, /needsInputPrimaryCount > 0 \? needsInputSummaryRef\.current : checklistSearchInputRef\.current/);
});

check("confirmed checklist deletion clears stale Search and Needs Input navigation", () => {
  const confirmHandler = source.slice(source.indexOf("const confirmDeleteChecklistItem ="), source.indexOf("// Descendant completion"));
  assert.match(confirmHandler, /getDescendantIds\(pendingDelete\.itemId\)/);
  assert.match(confirmHandler, /deleteFocusRecoveryRef\.current = true/);
  assert.match(confirmHandler, /setFocusedSearchId\(null\)/);
  assert.match(confirmHandler, /setFocusedNeedsInputId\(null\)/);
  assert.match(confirmHandler, /focusedNeedsInputSourceIdRef\.current = null/);
  assert.match(confirmHandler, /setChecklistSearchIndex\(-1\)/);
  assert.match(confirmHandler, /setChecklist\(prev => prev\.filter\(item => !deleteIds\.has\(item\.id\)\)\)/);
  assert.match(confirmHandler, /setPendingDelete\(null\)/);
});

check("delete confirmation restores focus after unmount, while Cancel keeps native restoration", () => {
  const deletionDialog = source.slice(source.indexOf("{/* Checklist item deletion */}"), source.indexOf("{/* Validation guidance */}"));
  assert.match(deletionDialog, /onCloseAutoFocus=\{\(event\) => \{/);
  assert.match(deletionDialog, /if \(!deleteFocusRecoveryRef\.current\) return;/);
  assert.match(deletionDialog, /event\.preventDefault\(\);/);
  assert.match(deletionDialog, /deleteFocusRecoveryRef\.current = false;/);
  assert.match(deletionDialog, /checklistSearchInputRef\.current \|\| checklistCloseButtonRef\.current/);
  assert.match(deletionDialog, /if \(fallback && !fallback\.disabled\) fallback\.focus\(\)/);
  assert.match(deletionDialog, /<AlertDialogCancel className="h-11 sm:h-9">Cancel<\/AlertDialogCancel>/);
  assert.match(source, /<Button ref=\{checklistCloseButtonRef\} variant="outline" onClick=\{requestClose\}/);
});

check("collapsing products, details, or Completed clears only hidden navigation results", () => {
  const collapseGuard = source.slice(
    source.indexOf("// A collapsed product, hierarchy, or Completed section"),
    source.indexOf("// Search typing and inline editor state")
  );
  assert.match(collapseGuard, /if \(!isOpen \|\| isLoading \|\| showTemplateBuilder\) return;/);
  assert.match(collapseGuard, /focusedSearchId &&\s*!findRenderedChecklistItemElement\(\[focusedSearchId\]\)\?\.getClientRects\(\)\.length/);
  assert.match(collapseGuard, /focusedNeedsInputId &&\s*!findRenderedChecklistItemElement\(\[focusedNeedsInputId\]\)\?\.getClientRects\(\)\.length/);
  assert.match(collapseGuard, /if \(!hiddenSearch && !hiddenNeedsInput\) return;/);
  assert.match(collapseGuard, /if \(hiddenSearch\) \{\s*setFocusedSearchId\(null\);\s*setChecklistSearchIndex\(-1\);/);
  assert.match(collapseGuard, /if \(hiddenNeedsInput\) setFocusedNeedsInputId\(null\);/);
  assert.match(collapseGuard, /showCompletedItems, focusedSearchId, focusedNeedsInputId, needsInputPrimaryCount\]/);
  assert.match(collapseGuard, /collapsedProducts, expandedItems/);
});

check("collapsing does not steal focus from visible controls and recovers stranded focus", () => {
  const collapseGuard = source.slice(
    source.indexOf("// A collapsed product, hierarchy, or Completed section"),
    source.indexOf("// Search typing and inline editor state")
  );
  assert.match(collapseGuard, /const activeElement = document\.activeElement;/);
  assert.match(collapseGuard, /const activeRow = activeElement\?\.closest\?\.\("\[data-sips-checklist-item-id\]"\);/);
  assert.match(collapseGuard, /activeElement === document\.body \|\|\s*\(activeRow && !activeRow\.getClientRects\(\)\.length\)/);
  assert.match(collapseGuard, /if \(focusIsStranded\) \{/);
  assert.match(collapseGuard, /hiddenNeedsInput && needsInputPrimaryCount > 0\s*\? needsInputSummaryRef\.current\s*: checklistSearchInputRef\.current \|\| checklistCloseButtonRef\.current/);
  assert.match(collapseGuard, /destination\?\.focus\(\);/);
  assert.equal((collapseGuard.match(/destination\?\.focus\(\)/g) || []).length, 1);
});

check("delayed focus callbacks cancel on dialog close or Template Builder switch", () => {
  const scheduler = source.slice(source.indexOf("  const cancelPendingNavigationFocus = () => {"),
    source.indexOf("  const startEditItem ="));
  assert.match(scheduler, /window\.clearTimeout\(pendingNavigationFocusTimerRef\.current\)/);
  assert.match(scheduler, /if \(navigationFocusVersionRef\.current !== version\) return;/);
  assert.match(scheduler, /useLayoutEffect\(\(\) => \{/);
  assert.match(scheduler, /if \(!isOpen \|\| isLoading \|\| showTemplateBuilder\) cancelPendingNavigationFocus\(\)/);
  assert.match(scheduler, /return cancelPendingNavigationFocus;/);
  assert.match(scheduler, /\[isOpen, isLoading, showTemplateBuilder, workOrder\?\.id\]/);
  assert.equal((source.match(/scheduleNavigationFocus\(\(\) => \{/g) || []).length, 3);
  assert.match(source, /const clearChecklistSearch = \(\) => \{\s*cancelPendingNavigationFocus\(\)/);
  assert.match(source, /onClick=\{\(\) => \{\s*cancelPendingNavigationFocus\(\);\s*setShowTemplateBuilder\(true\)/);

  // Execute the actual scheduler with fake timers. Even a late callback
  // must not focus a stale result after replacement or dialog cleanup.
  const pending = new Map();
  let nextId = 0;
  let cleanup = null;
  const fakeWindow = {
    setTimeout(callback) { const id = ++nextId; pending.set(id, callback); return id; },
    clearTimeout(id) { pending.delete(id); }
  };
  const createHarness = new Function(
    "window", "useLayoutEffect", "isOpen", "isLoading", "showTemplateBuilder", "workOrder",
    "pendingNavigationFocusTimerRef", "navigationFocusVersionRef",
    scheduler + "\nreturn { scheduleNavigationFocus, cancelPendingNavigationFocus };"
  );
  const harness = createHarness(fakeWindow, callback => { cleanup = callback(); },
    true, false, false, { id: "test-order" }, { current: null }, { current: 0 });
  const focused = [];
  harness.scheduleNavigationFocus(() => focused.push("old"));
  const staleCallback = [...pending.values()][0];
  harness.scheduleNavigationFocus(() => focused.push("new"));
  assert.equal(pending.size, 1);
  staleCallback();
  assert.deepEqual(focused, []);
  const [activeTimerId, activeTimerCallback] = [...pending.entries()][0];
  pending.delete(activeTimerId); // Simulate the timer firing and leaving the queue.
  activeTimerCallback();
  assert.deepEqual(focused, ["new"]);
  harness.scheduleNavigationFocus(() => focused.push("closed"));
  const closedCallback = [...pending.values()][0];
  cleanup();
  assert.equal(pending.size, 0);
  closedCallback();
  assert.deepEqual(focused, ["new"]);
});

console.log(passed + "/" + passed + " SIPS checklist hierarchy performance checks passed");
