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
const revisitPopupSource = readFileSync(
  new URL("../src/components/sips/RevisitDatePopup.jsx", import.meta.url),
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
  assert.match(collapseGuard, /if \(!isOpen \|\| isLoading \|\| showTemplateBuilder \|\| showRevisitPopup \|\| showOtherPopup \|\|\s*incompleteWarning \|\| validationDialog \|\| noChecklistWarning\) return;/);
  assert.match(collapseGuard, /focusedSearchId &&\s*!findRenderedChecklistItemElement\(\[focusedSearchId\]\)\?\.getClientRects\(\)\.length/);
  assert.match(collapseGuard, /focusedNeedsInputId &&\s*!findRenderedChecklistItemElement\(\[focusedNeedsInputId\]\)\?\.getClientRects\(\)\.length/);
  assert.match(collapseGuard, /if \(!hiddenSearch && !hiddenNeedsInput\) return;/);
  assert.match(collapseGuard, /if \(hiddenSearch\) \{\s*setFocusedSearchId\(null\);\s*setChecklistSearchIndex\(-1\);/);
  assert.match(collapseGuard, /if \(hiddenNeedsInput\) setFocusedNeedsInputId\(null\);/);
  assert.match(collapseGuard, /showCompletedItems, focusedSearchId, focusedNeedsInputId,\s*needsInputPrimaryCount\]/);
  assert.match(collapseGuard, /collapsedProducts,\s*expandedItems/);
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
    source.indexOf("  // Warning dialogs must keep focus inside their modal while displayed."));
  assert.match(scheduler, /window\.clearTimeout\(pendingNavigationFocusTimerRef\.current\)/);
  assert.match(scheduler, /if \(navigationFocusVersionRef\.current !== version\) return;/);
  assert.match(scheduler, /useLayoutEffect\(\(\) => \{/);
  assert.match(scheduler, /if \(!isOpen \|\| isLoading \|\| showTemplateBuilder \|\| showRevisitPopup \|\| showOtherPopup\) \{\s*cancelPendingNavigationFocus\(\)/);
  assert.match(scheduler, /return cancelPendingNavigationFocus;/);
  assert.match(scheduler, /\[isOpen, isLoading, showTemplateBuilder, showRevisitPopup, showOtherPopup, workOrder\?\.id\]/);
  assert.equal((source.match(/scheduleNavigationFocus\(\(\) => \{/g) || []).length, 4);
  assert.match(source, /const clearChecklistSearch = \(\) => \{\s*cancelPendingNavigationFocus\(\)/);
  assert.match(source, /onClick=\{\(\) => \{\s*if \(saveInFlightRef\.current \|\| loadInFlightRef\.current \|\| isSaving \|\| isLoading\) return;\s*cancelPendingNavigationFocus\(\);\s*setShowTemplateBuilder\(true\)/);

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
    "window", "useLayoutEffect", "isOpen", "isLoading", "showTemplateBuilder", "showRevisitPopup", "showOtherPopup", "workOrder",
    "pendingNavigationFocusTimerRef", "navigationFocusVersionRef",
    scheduler + "\nreturn { scheduleNavigationFocus, cancelPendingNavigationFocus };"
  );
  const harness = createHarness(fakeWindow, callback => { cleanup = callback(); },
    true, false, false, false, null, { id: "test-order" }, { current: null }, { current: 0 });
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

check("Save and Revisit opens focus-safe confirmation without bypassing date selection", () => {
  const saveClick = source.slice(source.indexOf("  const handleSaveClick = () => {"),
    source.indexOf("  // Called after user picks (or skips) a revisit date"));
  const calls = [];
  const makeClick = new Function("isRegistered", "isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef",
    "blockOnUnsubmittedDrafts", "cancelPendingNavigationFocus", "setPendingRevisitDate",
    "loadedRevisitDateSnapshot", "setShowRevisitPopup", "setPendingRevisitRetry",
    "failedRevisitSelectionRef", "const saveOutcomeUncertain = false;\n" + saveClick + "\nreturn handleSaveClick;");
  const cancel = () => calls.push("cancel focus");
  const setDate = date => calls.push(["revisit date", date]);
  const setOpen = open => calls.push(["confirmation open", open]);
  const setRetry = date => calls.push(["retry date", date]);
  const failedChoice = { current: undefined };
  const click = () => makeClick(true, false, { current: false }, false, { current: false }, () => false,
    cancel, setDate, "2099-02-17", setOpen, setRetry, failedChoice)();
  makeClick(false, false, { current: false }, false, { current: false }, () => false,
    cancel, setDate, "2099-02-17", setOpen, setRetry, failedChoice)();
  assert.deepEqual(calls, []);
  click();
  assert.deepEqual(calls, [
    "cancel focus", ["revisit date", "2099-02-17"], ["retry date", undefined], ["confirmation open", true]
  ]);
  calls.length = 0;
  failedChoice.current = "2099-03-18";
  click();
  assert.deepEqual(calls, [
    "cancel focus", ["revisit date", "2099-02-17"], ["retry date", "2099-03-18"], ["confirmation open", true]
  ]);
  calls.length = 0;
  failedChoice.current = null;
  click();
  assert.deepEqual(calls, [
    "cancel focus", ["revisit date", "2099-02-17"], ["retry date", null], ["confirmation open", true]
  ]);
  assert.match(source, /<RevisitDatePopup\s+isOpen=\{showRevisitPopup\}/);
  assert.match(source, /onSave=\{handleRevisitSave\}/);
  assert.match(source, /const handleRevisitSave = async \(dateString\) => \{\s*if \(saveOutcomeUncertain \|\| isSaving \|\| saveInFlightRef\.current \|\| isLoading \|\| loadInFlightRef\.current\) return;\s*if \(blockOnUnsubmittedDrafts\("save"\)\) \{\s*setShowRevisitPopup\(false\);\s*return;\s*\}\s*setShowRevisitPopup\(false\);\s*await saveChecklist\(dateString\);/);

  const searchRecovery = source.slice(source.indexOf("// When checklist edits remove a navigated match"),
    source.indexOf("// A collapsed product, hierarchy, or Completed section"));
  const collapseRecovery = source.slice(source.indexOf("// A collapsed product, hierarchy, or Completed section"),
    source.indexOf("// Search typing and inline editor state"));
  for (const effect of [searchRecovery, collapseRecovery]) {
    assert.match(effect, /if \(!isOpen \|\| isLoading \|\| showTemplateBuilder \|\| showRevisitPopup \|\| showOtherPopup \|\|\s*incompleteWarning \|\| validationDialog \|\| noChecklistWarning\) return;/);
    assert.match(effect, /showRevisitPopup/);
  }
});

check("cancelled Revisit confirmation returns focus to Save & Revisit without saving", () => {
  assert.match(source, /const saveRevisitButtonRef = useRef\(null\);/);
  assert.match(source, /ref=\{saveRevisitButtonRef\}\s*onClick=\{handleSaveClick\}/);
  assert.match(source, /<RevisitDatePopup\s+isOpen=\{showRevisitPopup\}/);
  assert.match(source, /returnFocusRef=\{saveRevisitButtonRef\}/);
  assert.match(revisitPopupSource, /onCloseAutoFocus=\{handleRevisitCloseAutoFocus\}/);
  assert.match(revisitPopupSource, /onClick=\{cancelDateSelection\}/);
  assert.match(revisitPopupSource, /onClick=\{\(\) => submitDate\(selected\)\}/);
  assert.match(revisitPopupSource, /onClick=\{\(\) => submitDate\(null\)\}/);

  const section = revisitPopupSource.slice(
    revisitPopupSource.indexOf("  const submitDate = (date) => {"),
    revisitPopupSource.indexOf("  const quickDates =")
  );
  const makeHandlers = new Function(
    "isSubmitting", "restoreFocusAfterCancelRef", "setIsSubmitting",
    "onSave", "onClose", "format", "returnFocusRef", "onSubmittedCloseAutoFocus",
    section + "\nreturn { submitDate, cancelDateSelection, handleRevisitCloseAutoFocus };"
  );
  let closed = 0, focused = 0, prevented = 0, saveCloseCallbacks = 0;
  const saved = [], submitting = [];
  const focusRef = { current: {
    isConnected: true, disabled: false, focus: () => { focused += 1; }
  }};
  const restoreRef = { current: false };
  const handler = makeHandlers(false, restoreRef,
    value => submitting.push(value), value => saved.push(value),
    () => { closed += 1; }, () => "2099-03-15", focusRef, () => { saveCloseCallbacks += 1; });

  handler.cancelDateSelection();
  assert.equal(closed, 1);
  assert.equal(restoreRef.current, true);
  handler.handleRevisitCloseAutoFocus({ preventDefault: () => { prevented += 1; } });
  assert.equal(focused, 1);
  assert.equal(prevented, 1);
  assert.equal(restoreRef.current, false);
  assert.deepEqual(saved, []);
  assert.deepEqual(submitting, []);
  handler.handleRevisitCloseAutoFocus({ preventDefault: () => { prevented += 1; } });
  assert.equal(focused, 1);
  assert.equal(saveCloseCallbacks, 1);

  handler.submitDate(new Date(2099, 2, 15));
  assert.deepEqual(saved, ["2099-03-15"]);
  assert.deepEqual(submitting, [true]);
  assert.equal(restoreRef.current, false);
  handler.handleRevisitCloseAutoFocus({ preventDefault: () => { prevented += 1; } });
  assert.equal(focused, 1); // Saving must not shift focus behind the closing workflow.
  assert.equal(saveCloseCallbacks, 2);
  assert.equal(prevented, 3);

  const blocked = makeHandlers(true, { current: false }, () => {}, () => {
    throw new Error("Saving twice must be blocked");
  }, () => { throw new Error("Cancel while saving must be blocked"); },
  () => "", focusRef);
  blocked.cancelDateSelection();
  blocked.submitDate(null);
  const absentTarget = makeHandlers(false, { current: false }, () => {}, () => {},
    () => {}, () => "", { current: { isConnected: false, disabled: false, focus: () => {
      throw new Error("Disconnected trigger must not receive focus");
    } } });
  absentTarget.cancelDateSelection();
  absentTarget.handleRevisitCloseAutoFocus({ preventDefault: () => {} });
});

check("warning dialogs restore keyboard focus to editing after dismissal", () => {
  assert.match(source, /ref=\{completeButtonRef\}\s*onClick=\{handleCheckOff\}/);
  assert.match(source, /if \(incompleteWarning \|\| validationDialog \|\| noChecklistWarning \|\| unfinishedEditsWarning\) cancelPendingNavigationFocus\(\)/);
  const getFocusBody = (comment) => {
    const section = source.slice(source.indexOf(comment));
    const start = section.indexOf("onCloseAutoFocus={(event) => {");
    const end = section.indexOf("\n          }}", start);
    assert.ok(start >= 0 && end > start, comment);
    return section.slice(start + "onCloseAutoFocus={(event) => {".length, end);
  };
  const completeBody = getFocusBody("{/* Incomplete Warning */}");
  const noChecklistBody = getFocusBody("{/* No Checklist Warning */}");
  const validationBody = getFocusBody("{/* Validation guidance */}");

  let prevented = 0, completedFocus = 0, statusFocus = 0, searchFocus = 0;
  const event = { preventDefault: () => { prevented++; } };
  const completeButtonRef = { current: { isConnected: true, disabled: false,
    focus: () => { completedFocus++; } } };
  const completeHandler = new Function("event", "isOpen", "completeButtonRef", completeBody);
  completeHandler(event, true, completeButtonRef);
  assert.equal(completedFocus, 1);
  completeHandler(event, false, completeButtonRef);
  assert.equal(completedFocus, 1);
  completeButtonRef.current.disabled = true;
  completeHandler(event, true, completeButtonRef);
  assert.equal(completedFocus, 1);
  completeButtonRef.current.disabled = false;

  const completeOverrideRef = { current: false };
  const noChecklistHandler = new Function("event", "isOpen", "completeButtonRef",
    "completingWithoutChecklistRef", noChecklistBody);
  noChecklistHandler(event, true, completeButtonRef, completeOverrideRef);
  assert.equal(completedFocus, 2);
  completeOverrideRef.current = true;
  noChecklistHandler(event, true, completeButtonRef, completeOverrideRef);
  assert.equal(completedFocus, 2);
  assert.equal(completeOverrideRef.current, false);

  const validationItemRef = { current: "item-1" };
  const statusControl = { getClientRects: () => [{ width: 1 }], disabled: false,
    isConnected: true, focus: () => { statusFocus++; } };
  const searchInputRef = { current: { isConnected: true, disabled: false,
    focus: () => { searchFocus++; } } };
  const validationHandler = new Function("event", "isOpen", "validationFocusItemIdRef",
    "findRenderedChecklistItemElement", "checklistSearchInputRef",
    "checklistCloseButtonRef", "showOtherPopup", "otherPopupValidationReturnRef",
    "customStatusInputRef", "otherPopupValidationPendingRef", "isLoading", "staleValidationFocusRef", validationBody);
  const findRow = ([id]) => {
    assert.equal(id, "item-1");
    return { querySelector: (selector) => {
      assert.equal(selector, '[aria-label^="Status for "]');
      return statusControl;
    } };
  };
  validationHandler(event, true, validationItemRef, findRow, searchInputRef,
    { current: null }, null, { current: null }, { current: null }, { current: false }, false, { current: false });
  assert.equal(statusFocus, 1);
  assert.equal(validationItemRef.current, null);
  validationItemRef.current = "item-1";
  statusControl.disabled = true;
  validationHandler(event, true, validationItemRef, findRow, searchInputRef,
    { current: null }, null, { current: null }, { current: null }, { current: false }, false, { current: false });
  assert.equal(statusFocus, 1);
  assert.equal(searchFocus, 1);

  // A warning on top of the custom-status popup must return focus inside
  // that popup instead of its underlying checklist row.
  let optionFocus = 0, inputFocus = 0;
  const selectedOption = { isConnected: true, disabled: false,
    getClientRects: () => [1], focus: () => { optionFocus++; } };
  const customInput = { isConnected: true, disabled: false,
    getClientRects: () => [1], focus: () => { inputFocus++; } };
  const optionReturnRef = { current: selectedOption };
  statusControl.disabled = false;
  validationItemRef.current = "item-1";
  validationHandler(event, true, validationItemRef, findRow, searchInputRef,
    { current: null }, { itemId: "item-1" }, optionReturnRef, { current: customInput }, { current: false }, false, { current: false });
  assert.equal(optionFocus, 1);
  assert.equal(statusFocus, 1);
  assert.equal(optionReturnRef.current, null);
  validationItemRef.current = "item-1";
  validationHandler(event, true, validationItemRef, findRow, searchInputRef,
    { current: null }, { itemId: "item-1" }, optionReturnRef, { current: customInput }, { current: false }, false, { current: false });
  assert.equal(inputFocus, 1);
  assert.equal(statusFocus, 1);
  // Unmounted preset option falls back to the still-visible custom input.
  selectedOption.isConnected = false;
  optionReturnRef.current = selectedOption;
  validationItemRef.current = "item-1";
  validationHandler(event, true, validationItemRef, findRow, searchInputRef,
    { current: null }, { itemId: "item-1" }, optionReturnRef, { current: customInput }, { current: false }, false, { current: false });
  assert.equal(optionFocus, 1);
  assert.equal(inputFocus, 2);
  assert.equal(statusFocus, 1);
  assert.equal(prevented, 9);
});

check("rejected custom-status entries retain draft and popup selection", () => {
  const customHandler = source.slice(
    source.indexOf("  const handleCreateCustomValue = (itemId) => {"),
    source.indexOf("  // Apply only genuinely new template content")
  );
  assert.match(customHandler, /otherPopupValidationReturnRef\.current = customStatusInputRef\.current;/);
  assert.ok(customHandler.includes("if (!applyChecklistStatus(itemId, value, { fromOtherPopup: true })) return;"));
  assert.ok(customHandler.indexOf("if (!applyChecklistStatus") <
    customHandler.indexOf('setCustomDropdownValue("");'));
  assert.ok(customHandler.indexOf("otherPopupValidationReturnRef.current = null;") <
    customHandler.indexOf('setCustomDropdownValue("");'));

  const popup = source.slice(source.indexOf("{/* Other Dropdown Popup */}"));
  assert.match(popup, /ref=\{customStatusInputRef\}/);
  assert.match(popup, /onClick=\{\(event\) => \{\s*if \(!showOtherPopup\?\.itemId \|\| otherPopupValidationPendingRef\.current \|\| validationDialog\) return;\s*otherPopupValidationReturnRef\.current = event\.currentTarget;/);
  assert.ok(popup.includes("if (applyChecklistStatus(showOtherPopup.itemId, dd.name, { fromOtherPopup: true })) {"));
  assert.match(popup, /otherPopupDismissedRef\.current = true;[\s\S]*customStatusDraftsByItemIdRef\.current\.delete\(showOtherPopup\.itemId\);/);
  assert.match(popup, /value=\{customDropdownValue\}/);
});

check("custom-status Cancel, Escape and close preserve per-row drafts and restore focus", () => {
  const popup = source.slice(source.indexOf("{/* Other Dropdown Popup */}"));
  assert.match(popup, /onOpenChange=\{\(open\) => \{ if \(!open\) dismissOtherPopup\(\); \}\}/);
  assert.match(popup, /onCloseAutoFocus=\{handleOtherPopupCloseAutoFocus\}/);
  assert.match(popup, /onClick=\{dismissOtherPopup\}/);
  assert.equal((source.match(/openOtherPopup\((?:displayItem|detail|stDisplayItem)\.id\)/g) || []).length, 3);
  assert.match(source, /onChange=\{\(e\) => updateCustomStatusDraft\(e\.target\.value\)\}/);
  assert.match(source, /customStatusDraftsByItemIdRef\.current\.delete\(itemId\)/);
  assert.match(source, /customStatusDraftsByItemIdRef\.current\.clear\(\);[\s\S]*?\}, \[workOrder\?\.id\]\);/);

  const handlers = source.slice(source.indexOf("  const openOtherPopup = (itemId) => {"),
    source.indexOf("  const handleCreateCustomValue = (itemId) => {"));
  const createHandlers = new Function("customStatusDraftsByItemIdRef", "otherPopupFocusItemIdRef",
    "otherPopupDismissedRef", "otherPopupValidationReturnRef", "showOtherPopup",
    "validationDialog", "setCustomDropdownValue", "setShowOtherPopup", "isOpen",
    "findRenderedChecklistItemElement", "checklistSearchInputRef", "checklistCloseButtonRef",
    "cancelPendingNavigationFocus", "otherPopupValidationPendingRef", "isLoading",
    handlers + "\nreturn { openOtherPopup, updateCustomStatusDraft, dismissOtherPopup, handleOtherPopupCloseAutoFocus };");
  const drafts = { current: new Map() }, focusItem = { current: null };
  const dismissed = { current: false }, validationReturn = { current: null };
  let activePopup = null, shownDraft = "", focusedStatus = 0, focusedSearch = 0, prevented = 0;
  const status = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focusedStatus++; } };
  const search = { current: { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focusedSearch++; } } };
  const create = (warning = null) => createHandlers(drafts, focusItem, dismissed,
    validationReturn, activePopup, warning, value => { shownDraft = value; },
    value => { activePopup = value; }, true,
    ([itemId]) => itemId === "A" ? { querySelector: () => status } : null,
    search, { current: null }, () => {}, { current: false }, false);
  const closingEvent = { preventDefault() { prevented++; } };

  create().openOtherPopup("A");
  assert.equal(shownDraft, "");
  create().updateCustomStatusDraft("Unfinished A");
  create().dismissOtherPopup(); // Cancel; also used by Escape and X.
  assert.equal(activePopup, null);
  create().handleOtherPopupCloseAutoFocus(closingEvent);
  assert.equal(focusedStatus, 1);
  assert.equal(prevented, 1);
  assert.equal(drafts.current.get("A"), "Unfinished A");

  create().openOtherPopup("B");
  assert.equal(shownDraft, ""); // A's text never appears in B.
  create().updateCustomStatusDraft("Unfinished B");
  create().dismissOtherPopup();
  create().handleOtherPopupCloseAutoFocus(closingEvent);
  assert.equal(focusedSearch, 1); // Row missing: Search is a safe fallback.
  create().openOtherPopup("A");
  assert.equal(shownDraft, "Unfinished A");
  create({ title: "Approver Required" }).dismissOtherPopup();
  assert.deepEqual(activePopup, { itemId: "A" }); // Cannot close behind validation.
  assert.equal(drafts.current.get("B"), "Unfinished B");

  create().dismissOtherPopup();
  create().handleOtherPopupCloseAutoFocus(closingEvent);
  assert.equal(focusedStatus, 2);
  assert.equal(prevented, 3);
});

check("Other status transitions defer focus until popup close, including Completed rows", () => {
  const statusBody = source.slice(source.indexOf("  const applyChecklistStatus = (itemId, value"),
    source.indexOf("  const checkIfComplete ="));
  assert.match(statusBody, /if \(!fromOtherPopup\) scheduleNavigationFocus/);
  assert.match(completedSource, /openOtherPopup\(item\.id\)/);
  assert.match(completedSource, /openOtherPopup\(stItem\.id\)/);
  assert.match(source, /<ChecklistCompletedSection[\s\S]*?openOtherPopup=\{openOtherPopup\}/);
  assert.doesNotMatch(completedSource, /setShowOtherPopup/);
  const makeStatus = new Function("checklistItemById", "dropdownConditionByName",
    "areChildrenComplete", "validationFocusItemIdRef", "setValidationDialog",
    "setFocusedSearchId", "setFocusedNeedsInputId", "setChecklistSearchIndex",
    "scheduleNavigationFocus", "checklistSearchInputRef", "updateChecklistItem", "otherPopupValidationPendingRef",
    statusBody + "\nreturn applyChecklistStatus;");
  const item = { id: "A", approved_by: "Reviewer", custom_dropdown_value: "Continued" };
  const conditions = new Map([
    ["Continued", { is_completed: false }],
    ["Completed", { is_completed: true }]
  ]);
  const events = [];
  const setValue = value => events.push(["updated", value.custom_dropdown_value]);
  const apply = makeStatus(new Map([["A", item]]), conditions, () => true,
    { current: null }, () => events.push("warning"),
    () => events.push("clear search"), () => events.push("clear needs"),
    () => events.push("reset index"), () => events.push("timer"),
    { current: { focus() {} } }, (id, updates) => { assert.equal(id, "A"); setValue(updates); }, { current: false }, { current: false });

  assert.equal(apply("A", "Completed", { fromOtherPopup: true }), true);
  assert.ok(events.includes("clear search"));
  assert.ok(events.includes("reset index"));
  assert.ok(events.some(e => Array.isArray(e) && e[1] === "Completed"));
  assert.equal(events.includes("timer"), false);
  item.custom_dropdown_value = "Completed";
  events.length = 0;
  assert.equal(apply("A", "Continued", { fromOtherPopup: true }), true);
  assert.equal(events.includes("timer"), false);
  item.custom_dropdown_value = "Continued";
  events.length = 0;
  assert.equal(apply("A", "Completed"), true);
  assert.equal(events.filter(e => e === "timer").length, 1);
});

check("successful Other application clears draft and requests post-close focus", () => {
  const customBody = source.slice(source.indexOf("  const handleCreateCustomValue = (itemId) => {"),
    source.indexOf("  // Apply only genuinely new template content"));
  const makeCustom = new Function("customDropdownValue", "otherPopupValidationReturnRef",
    "customStatusInputRef", "applyChecklistStatus", "otherPopupDismissedRef",
    "customStatusDraftsByItemIdRef", "setCustomDropdownValue", "setShowOtherPopup",
    "otherPopupValidationPendingRef", "validationDialog",
    customBody + "\nreturn handleCreateCustomValue;");
  const draftMap = { current: new Map([["A", "draft"]]) };
  const dismissFlag = { current: false };
  let cleared = 0, closed = 0;
  const args = [ "  Completed  ", { current: null }, { current: {} },
    () => false, dismissFlag, draftMap,
    () => { cleared++; }, () => { closed++; }, { current: false }, null ];
  makeCustom(...args)("A");
  assert.equal(draftMap.current.get("A"), "draft");
  assert.equal(cleared, 0);
  assert.equal(closed, 0);
  assert.equal(dismissFlag.current, false);
  args[3] = (id, value, options) => {
    assert.equal(id, "A");
    assert.equal(value, "Completed");
    assert.deepEqual(options, { fromOtherPopup: true });
    return true;
  };
  makeCustom(...args)("A");
  assert.equal(draftMap.current.has("A"), false);
  assert.equal(dismissFlag.current, true);
  assert.equal(cleared, 1);
  assert.equal(closed, 1);
  const popup = source.slice(source.indexOf("{/* Other Dropdown Popup */}"));
  const closeFlag = popup.indexOf("otherPopupDismissedRef.current = true;");
  const clearDraft = popup.indexOf("customStatusDraftsByItemIdRef.current.delete(showOtherPopup.itemId)");
  const closeModal = popup.indexOf("setShowOtherPopup(null);");
  assert.ok(closeFlag > 0 && clearDraft > closeFlag && closeModal > clearDraft);
});

check("Other popup closure skips collapsed rows and uses visible fallback controls", () => {
  const handlers = source.slice(
    source.indexOf("  const openOtherPopup = (itemId) => {"),
    source.indexOf("  const handleCreateCustomValue = (itemId) => {")
  );
  assert.match(handlers, /const openOtherPopup = \(itemId\) => \{\s*[\s\S]*?cancelPendingNavigationFocus\(\)/);
  const make = new Function(
    "customStatusDraftsByItemIdRef", "otherPopupFocusItemIdRef",
    "otherPopupDismissedRef", "otherPopupValidationReturnRef",
    "showOtherPopup", "validationDialog", "setCustomDropdownValue",
    "setShowOtherPopup", "isOpen", "findRenderedChecklistItemElement",
    "checklistSearchInputRef", "checklistCloseButtonRef",
    "cancelPendingNavigationFocus", "otherPopupValidationPendingRef", "isLoading",
    handlers + "\nreturn { openOtherPopup, dismissOtherPopup, handleOtherPopupCloseAutoFocus };"
  );
  const focusId = { current: null };
  const dismissed = { current: false };
  const status = { isConnected: true, disabled: false, getClientRects: () => [],
    focus: () => { throw Error("Collapsed status must not receive focus"); } };
  let focusSearch = 0, focusClose = 0, cancelTimer = 0, prevented = 0;
  const search = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focusSearch++; } };
  const close = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focusClose++; } };
  let rowVisible = true;
  const create = (isOpen = true, isLoading = false) => make(
    { current: new Map() }, focusId, dismissed, { current: null }, null,
    null, () => {}, () => {}, isOpen,
    () => rowVisible ? { querySelector: () => status } : null,
    { current: search }, { current: close }, () => { cancelTimer++; }, { current: false },
    isLoading
  );
  const event = { preventDefault() { prevented++; } };

  create().openOtherPopup("A");
  assert.equal(cancelTimer, 1);
  create().dismissOtherPopup();
  create().handleOtherPopupCloseAutoFocus(event);
  assert.equal(focusSearch, 1); // Collapsed product: status still mounted but hidden.
  assert.equal(focusClose, 0);
  assert.equal(prevented, 1);

  rowVisible = false; // Completed section collapsed/unmounted while popup was open.
  search.disabled = true;
  create().openOtherPopup("B");
  create().dismissOtherPopup();
  create().handleOtherPopupCloseAutoFocus(event);
  assert.equal(focusClose, 1);
  assert.equal(focusSearch, 1);
  assert.equal(prevented, 2);

  create().openOtherPopup("B");
  create().dismissOtherPopup();
  create(false).handleOtherPopupCloseAutoFocus(event);
  assert.equal(focusClose, 1); // Parent closing must not refocus a background control.
  assert.equal(prevented, 2);
  focusId.current = null; // Work Order reload invalidated the original trigger.
  dismissed.current = true;
  create().handleOtherPopupCloseAutoFocus(event);
  assert.equal(prevented, 3);
  assert.equal(focusClose, 1);
  create().openOtherPopup("B");
  create().dismissOtherPopup();
  create(true, true).handleOtherPopupCloseAutoFocus(event);
  assert.equal(prevented, 4); // Loading suppresses native stale-trigger restoration.
  assert.equal(focusClose, 1);
  assert.match(source, /showRevisitPopup \|\| showOtherPopup \|\|\s*incompleteWarning \|\| validationDialog \|\| noChecklistWarning\) return;/);
});

check("rapid successive status warnings preserve popup draft and focus until each warning closes", () => {
  const statusBody = source.slice(source.indexOf("  const applyChecklistStatus = (itemId, value"),
    source.indexOf("  const checkIfComplete ="));
  const customBody = source.slice(source.indexOf("  const handleCreateCustomValue = (itemId) => {"),
    source.indexOf("  // Apply only genuinely new template content"));
  const warningSource = source.slice(source.indexOf("{/* Validation guidance */}"));
  const focusStart = warningSource.indexOf("onCloseAutoFocus={(event) => {");
  const focusEnd = warningSource.indexOf("\n          }}", focusStart);
  const focusBody = warningSource.slice(focusStart + "onCloseAutoFocus={(event) => {".length, focusEnd);
  const createStatus = new Function("checklistItemById", "dropdownConditionByName",
    "areChildrenComplete", "validationFocusItemIdRef", "setValidationDialog",
    "setFocusedSearchId", "setFocusedNeedsInputId", "setChecklistSearchIndex",
    "scheduleNavigationFocus", "checklistSearchInputRef", "updateChecklistItem",
    "otherPopupValidationPendingRef", "staleValidationFocusRef", statusBody + "\nreturn applyChecklistStatus;");
  const createCustom = new Function("customDropdownValue", "otherPopupValidationReturnRef",
    "customStatusInputRef", "applyChecklistStatus", "otherPopupDismissedRef",
    "customStatusDraftsByItemIdRef", "setCustomDropdownValue", "setShowOtherPopup",
    "otherPopupValidationPendingRef", "validationDialog",
    customBody + "\nreturn handleCreateCustomValue;");
  const closeWarning = new Function("event", "isOpen", "validationFocusItemIdRef",
    "findRenderedChecklistItemElement", "checklistSearchInputRef", "checklistCloseButtonRef",
    "showOtherPopup", "otherPopupValidationReturnRef", "customStatusInputRef",
    "otherPopupValidationPendingRef", "isLoading", "staleValidationFocusRef", focusBody);
  assert.match(source, /const dismissOtherPopup = \(\) => \{\s*if \(validationDialog \|\| otherPopupValidationPendingRef\.current\) return;/);
  assert.match(source, /const openOtherPopup = \(itemId\) => \{\s*if \(otherPopupValidationPendingRef\.current \|\| validationDialog\) return;/);
  assert.match(source, /otherPopupValidationPendingRef\.current = false;[\s\S]*?if \(!isOpen \|\| isLoading \|\| staleValidationFocusRef\.current\) \{/);
  assert.match(source, /otherPopupValidationPendingRef\.current = false;[\s\S]*?\}, \[workOrder\?\.id\]\);/);

  const item = { id: "item-1", type: "detail", approved_by: null,
    custom_dropdown_value: "Continued" };
  let childrenComplete = false, cleared = 0, closed = 0, focused = 0;
  const warnings = [];
  const pending = { current: false }, focusItem = { current: null };
  const input = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus() { focused++; } };
  const returnRef = { current: null }, draftRef = { current: new Map([["item-1", "Completed"]]) };
  const dismissed = { current: false };
  const apply = createStatus(new Map([["item-1", item]]),
    new Map([["Completed", { is_completed: true }]]), () => childrenComplete,
    focusItem, value => warnings.push(value), () => {}, () => {}, () => {},
    () => {}, { current: null }, () => {}, pending, { current: false });
  // Retain a stale null validationDialog closure to exercise same-tick double clicks.
  const submit = createCustom("  Completed  ", returnRef, { current: input },
    apply, dismissed, draftRef, () => { cleared++; }, () => { closed++; },
    pending, null);
  const dismiss = () => closeWarning({ preventDefault() {} }, true, focusItem,
    () => { throw Error("Do not focus behind the popup"); },
    { current: null }, { current: null }, { itemId: "item-1" }, returnRef,
    { current: input }, pending, false, { current: false });

  submit("item-1"); // Approver Required.
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].title, "Approver Required");
  assert.equal(pending.current, true);
  assert.equal(returnRef.current, input);
  submit("item-1"); // Must not overwrite the first warning or its target.
  assert.equal(warnings.length, 1);
  assert.equal(returnRef.current, input);
  assert.equal(draftRef.current.get("item-1"), "Completed");
  assert.equal(closed, 0);
  dismiss();
  assert.equal(pending.current, false);
  assert.equal(focused, 1);
  assert.equal(returnRef.current, null);

  item.approved_by = "Reviewer";
  submit("item-1"); // Tasks Still Open on the next attempt.
  assert.equal(warnings.length, 2);
  assert.equal(warnings[1].title, "Tasks Still Open");
  submit("item-1");
  assert.equal(warnings.length, 2);
  dismiss();
  assert.equal(focused, 2);
  assert.equal(draftRef.current.has("item-1"), true);

  childrenComplete = true;
  submit("item-1");
  assert.equal(warnings.length, 2);
  assert.equal(draftRef.current.has("item-1"), false);
  assert.equal(closed, 1);
  assert.equal(cleared, 1);
  assert.equal(dismissed.current, true);
});

check("Work Order switch and reload cancel stale warning focus and drafts", () => {
  const resetSource = source.slice(source.indexOf("  const resetOtherPopupForReload = () => {"),
    source.indexOf("  useEffect(() => {\n    resetOtherPopupForReload();"));
  const reset = new Function("staleValidationFocusRef", "validationFocusItemIdRef",
    "customStatusDraftsByItemIdRef", "otherPopupValidationReturnRef",
    "otherPopupValidationPendingRef", "otherPopupFocusItemIdRef",
    "otherPopupDismissedRef", "setCustomDropdownValue", "setShowOtherPopup",
    "setValidationDialog", "unfinishedDraftTargetRef", "focusCustomDraftOnOpenRef",
    "setUnfinishedEditsWarning", resetSource + "\nreturn resetOtherPopupForReload;");
  const stale = { current: false }, item = { current: "old-row" };
  const drafts = { current: new Map([["old-row", "Do not carry"]] ) };
  const returnTarget = { current: { focus() { throw Error("Stale focus"); } } };
  const pending = { current: true }, popupItem = { current: "old-row" };
  const dismissed = { current: true };
  const draftFocus = { current: { kind: "new-item" } }, reopen = { current: true };
  const updates = [];
  reset(stale, item, drafts, returnTarget, pending, popupItem, dismissed,
    value => updates.push(["draft", value]), value => updates.push(["popup", value]),
    value => updates.push(["warning", value]), draftFocus, reopen,
    value => updates.push(["unfinished", value]))();
  assert.equal(stale.current, true);
  assert.equal(item.current, null);
  assert.equal(returnTarget.current, null);
  assert.equal(pending.current, false);
  assert.equal(popupItem.current, null);
  assert.equal(dismissed.current, false);
  assert.equal(drafts.current.size, 0);
  assert.equal(draftFocus.current, null);
  assert.equal(reopen.current, false);
  assert.deepEqual(updates, [["unfinished", null], ["draft", ""], ["popup", null], ["warning", null]]);
  assert.match(source, /useEffect\(\(\) => \{\s*resetOtherPopupForReload\(\);[\s\S]*?failedRevisitWorkOrderIdRef\.current = null;\s*\}, \[workOrder\?\.id\]\);/);
  // The loader may clear old focus/error state before taking its request token.
  // Verify the safety operations and their required order instead of assuming
  // those setup steps must be adjacent in the source.
  const loadStart = source.indexOf("  const loadData = async () => {");
  assert.ok(loadStart >= 0, "Checklist loader exists");
  const loaderSetup = source.slice(loadStart, source.indexOf("    try {", loadStart));
  const safetySteps = [
    "if (saveInFlightRef.current) return;",
    "const requestId = ++loadDataRequestRef.current;",
    "loadInFlightRef.current = true;",
    "setIsLoading(true);",
  ];
  let previousStepIndex = -1;
  for (const step of safetySteps) {
    const stepIndex = loaderSetup.indexOf(step);
    assert.ok(stepIndex > previousStepIndex, `Checklist load safety step missing or reordered: ${step}`);
    previousStepIndex = stepIndex;
  }
  const loaderBody = source.slice(loadStart, source.indexOf("  const getDropdownName = (dropdownId) => {", loadStart));
  const verifiedRowIndex = loaderBody.indexOf('if (!currentWO) throw new Error(');
  const cleanupIndex = loaderBody.indexOf('resetOtherPopupForReload();');
  assert.ok(verifiedRowIndex >= 0 && cleanupIndex > verifiedRowIndex,
    'Reload cleanup must happen after verifying a replacement Work Order');
  assert.ok(cleanupIndex < loaderBody.indexOf('setChecklist(reconstructedChecklist);'),
    'Old editor focus and drafts must clear before applying the verified new checklist');
  assert.match(loaderBody.slice(verifiedRowIndex, cleanupIndex), /saveFailureFocusPendingRef\.current = false;[\s\S]*?failedRevisitWorkOrderIdRef\.current !== workOrder\.id[\s\S]*?failedRevisitSelectionRef\.current = undefined;/);
  assert.match(source, /failedRevisitSelectionRef\.current = undefined;\s*failedRevisitWorkOrderIdRef\.current = null;\s*\}, \[workOrder\?\.id\]\);/);
  assert.ok(!loaderSetup.includes('resetOtherPopupForReload();'),
    'An in-flight or failed reload must not erase local custom-status drafts');

  const warning = source.slice(source.indexOf("{/* Validation guidance */}"));
  const first = warning.indexOf("onCloseAutoFocus={(event) => {");
  const last = warning.indexOf("\n          }}", first);
  const code = warning.slice(first + "onCloseAutoFocus={(event) => {".length, last);
  const close = new Function("event", "isOpen", "validationFocusItemIdRef",
    "findRenderedChecklistItemElement", "checklistSearchInputRef", "checklistCloseButtonRef",
    "showOtherPopup", "otherPopupValidationReturnRef", "customStatusInputRef",
    "otherPopupValidationPendingRef", "isLoading", "staleValidationFocusRef", code);
  let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  close(event, true, item, () => { throw Error("Old row queried"); }, { current: null },
    { current: null }, null, returnTarget, { current: null }, pending, false, stale);
  assert.equal(prevented, 1);
  assert.equal(item.current, null);
  assert.equal(returnTarget.current, null);
  item.current = "old-row";
  close(event, true, item, () => { throw Error("Old row queried during reload"); },
    { current: null }, { current: null }, null, returnTarget,
    { current: null }, pending, true, { current: false });
  assert.equal(prevented, 2);
  assert.equal(item.current, null);
});

await (async () => {
  const body = source.slice(source.indexOf("  const loadData = async () => {"),
    source.indexOf("  const getDropdownName = (dropdownId) => {"));
  assert.match(source, /return \(\) => \{ loadDataRequestRef\.current \+= 1; \};/);
  assert.match(body, /if \(requestId !== loadDataRequestRef\.current\) return;/);
  assert.match(body, /if \(requestId === loadDataRequestRef\.current\) \{\s*loadInFlightRef\.current = false;\s*setIsLoading\(false\)/);
  const makeLoad = new Function("scope", "with(scope) { " + body + "\nreturn loadData; }");
  const requestRef = { current: 0 }, pending = [];
  const checklists = [], loading = [], errors = [], loadErrors = [], loadedFlags = [];
  let invalidations = 0;
  const shared = {
    loadDataRequestRef: requestRef,
    loadErrorFocusPendingRef: { current: false },
    loadedWorkflowSnapshotRef: { current: null },
    saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
    saveFailureFocusPendingRef: { current: true },
    failedRevisitSelectionRef: { current: "old synthetic date" },
    failedRevisitWorkOrderIdRef: { current: "WO-A" },
    resetOtherPopupForReload: () => { invalidations++; },
    setEditingItemId: () => {}, setEditingItemText: () => {},
    setEditingProductName: () => {}, setEditingProductNameText: () => {},
    setNewItemInput: () => {}, setNewItemText: () => {},
    setShowAddGeneralChecklist: () => {}, setNewGeneralChecklistText: () => {},
    setIsLoading: value => loading.push(value),
    WorkOrder: { filter: ({ id }) => new Promise(resolve => pending.push({ id, resolve })) },
    AuthorizedEmail: {}, base44: { entities: { GlobalSettings: {} } },
    loadAllEntityRows: async () => [],
    loadSingleGlobalSetting: async () => ({ setting_value: { items: [] } }),
    setUsers: () => {}, setLoadedProductsSnapshot: () => {},
    setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
    setSaveError: value => errors.push(value),
    setLoadError: value => loadErrors.push(value),
    setHasLoadedChecklist: value => loadedFlags.push(value), setSaveOutcomeUncertain: () => {}, setProducts: () => {},
    setLoadedUiProductsSnapshot: () => {}, setLoadedChecklistSnapshot: () => {},
    setChecklist: items => checklists.push(items.map(item => item.id)),
    setLoadedUiChecklistSnapshot: () => {}, setDropdownConditions: () => {},
    setProductTypes: () => {}
  };
  const loadA = makeLoad({ ...shared, workOrder: { id: "WO-A" } });
  const loadB = makeLoad({ ...shared, workOrder: { id: "WO-B" } });
  const oldRequest = loadA();
  const newRequest = loadB();
  assert.equal(shared.saveFailureFocusPendingRef.current, true, "Pending load preserves prior failure focus");
  assert.equal(shared.failedRevisitSelectionRef.current, "old synthetic date", "Pending load preserves failed Revisit choice");
  assert.equal(invalidations, 0, "Pending loads must not reset unsaved drafts");
  assert.deepEqual(pending.map(call => call.id), ["WO-A", "WO-B"]);
  pending[1].resolve([{ id: "WO-B", current_task_assigned_to: "SIPs", sip_checklist: [{ id: "row-B", type: "checklist" }] }]);
  await newRequest;
  pending[0].resolve([{ id: "WO-A", current_task_assigned_to: "SIPs", sip_checklist: [{ id: "row-A", type: "checklist" }] }]);
  await oldRequest;
  assert.deepEqual(checklists, [["row-B"]]);
  assert.deepEqual(loading, [true, true, false]);
  assert.equal(invalidations, 1, "Only the successful current snapshot clears stale drafts");
  assert.equal(shared.saveFailureFocusPendingRef.current, false);
  assert.equal(shared.failedRevisitSelectionRef.current, undefined, "A different Work Order cannot inherit an earlier failed Revisit");
  assert.equal(shared.failedRevisitWorkOrderIdRef.current, null);
  assert.deepEqual(errors, [""]);
  assert.deepEqual(loadErrors, [""], "Successful load clears only the loading failure");
  assert.deepEqual(loadedFlags, [true], "Successful load establishes a trustworthy checklist");

  const missing = loadB();
  pending[2].resolve([]); // Missing Work Order must not leave loading stuck.
  await missing;
  assert.equal(loading.at(-1), false);
  assert.equal(shared.loadInFlightRef.current, false);
  assert.match(loadErrors.at(-1), /Work Order no longer available/);
  assert.equal(shared.loadErrorFocusPendingRef.current, true,
    'Failed reload schedules error focus only after loading finishes');
  assert.equal(invalidations, 1, "Missing record cannot discard the last local draft");
  assert.deepEqual(errors, [""], "Failed loading does not masquerade as a checklist save failure");
  assert.deepEqual(loadedFlags, [true], "Failed reload cannot mark an old record freshly loaded");
  const recovery = loadB();
  pending[3].resolve([{ id: "WO-B", current_task_assigned_to: "SIPs", sip_checklist: [{ id: "row-recovered", type: "checklist" }] }]);
  await recovery;
  assert.equal(loadErrors.at(-1), "", "Successful retry clears the load warning");
  assert.equal(shared.loadErrorFocusPendingRef.current, false,
    'Verified recovery cancels pending error focus');
  assert.equal(invalidations, 2, "Verified retry performs cleanup once");
  assert.deepEqual(checklists, [["row-B"], ["row-recovered"]]);
  assert.equal(shared.loadInFlightRef.current, false);
  console.log("PASS overlapping Work Order reloads ignore stale results and missing records recover on retry");
  passed++;
})();

await (async () => {
  // Failed first read and subsequent retry use isolated synthetic records.
  const body = source.slice(source.indexOf("  const loadData = async () => {"),
    source.indexOf("  const getDropdownName = (dropdownId) => {"));
  const makeLoad = new Function("scope", "with(scope) { " + body + "\nreturn loadData; }");
  let missing = true;
  const loadErrors = [], successfulLoads = [], rows = [], saveErrors = [];
  const scope = {
    workOrder: { id: "synthetic-initial" },
    saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
    saveFailureFocusPendingRef: { current: false }, failedRevisitSelectionRef: { current: undefined },
    failedRevisitWorkOrderIdRef: { current: null },
    loadDataRequestRef: { current: 0 }, loadedWorkflowSnapshotRef: { current: null },
    loadErrorFocusPendingRef: { current: false },
    resetOtherPopupForReload: () => {}, setIsLoading: () => {},
    WorkOrder: { filter: async () => missing ? [] : [{ id: "synthetic-initial", current_task_assigned_to: "SIPs", sip_checklist: [], products: [] }] },
    AuthorizedEmail: {}, base44: { entities: { GlobalSettings: {} } },
    loadAllEntityRows: async () => [],
    loadSingleGlobalSetting: async () => ({ setting_value: { items: [] } }),
    setUsers: () => {}, setLoadedProductsSnapshot: () => {},
    setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
    setSaveError: text => saveErrors.push(text),
    setLoadError: text => loadErrors.push(text),
    setHasLoadedChecklist: value => successfulLoads.push(value), setSaveOutcomeUncertain: () => {},
    setEditingItemId: () => {}, setEditingItemText: () => {},
    setEditingProductName: () => {}, setEditingProductNameText: () => {},
    setNewItemInput: () => {}, setNewItemText: () => {},
    setShowAddGeneralChecklist: () => {}, setNewGeneralChecklistText: () => {},
    setProducts: () => {}, setLoadedUiProductsSnapshot: () => {},
    setLoadedChecklistSnapshot: () => {}, setLoadedUiChecklistSnapshot: () => {},
    setChecklist: checklist => rows.push(checklist), setDropdownConditions: () => {},
    setProductTypes: () => {}, console: { error: () => {} }
  };
  const load = makeLoad(scope);
  await load();
  assert.equal(scope.loadInFlightRef.current, false);
  assert.equal(successfulLoads.length, 0, "Failed load is not a valid empty checklist");
  assert.equal(rows.length, 0);
  assert.match(loadErrors.at(-1), /no longer available/);
  assert.equal(scope.loadErrorFocusPendingRef.current, true);
  assert.deepEqual(saveErrors, [], "Load failure cannot masquerade as a save error");
  missing = false;
  await load();
  assert.deepEqual(successfulLoads, [true], "Only a successful read validates a genuine empty checklist");
  assert.deepEqual(rows, [[]]);
  assert.equal(loadErrors.at(-1), "");
  assert.equal(scope.loadErrorFocusPendingRef.current, false);
  assert.equal(scope.loadInFlightRef.current, false);
  console.log("PASS failed initial read cannot impersonate empty checklist; retry loads valid empty data");
  passed++;
})();

await (async () => {
  // The original Work Order may be trashed, completed, or converted to a rider
  // by another session while its checklist dialog remains mounted.
  const loaderSource = source.slice(source.indexOf("  const loadData = async () => {"),
    source.indexOf("  const getDropdownName = (dropdownId) => {"));
  const makeLoad = new Function("scope", "with(scope) { " + loaderSource + "\nreturn loadData; }");
  let server = { id: "synthetic-status", deleted: true, completed: false, is_rider: false };
  const errors = [], checklists = [], productState = [];
  let configuredTasks = [];
  const workflowRef = { current: { current_stage: "old-stage" } };
  const scope = {
    workOrder: { id: "synthetic-status" },
    saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
    saveFailureFocusPendingRef: { current: false }, failedRevisitSelectionRef: { current: undefined },
    failedRevisitWorkOrderIdRef: { current: null },
    loadDataRequestRef: { current: 0 }, loadedWorkflowSnapshotRef: workflowRef,
    loadErrorFocusPendingRef: { current: false },
    resetOtherPopupForReload: () => {}, setIsLoading: () => {},
    WorkOrder: { filter: async () => [structuredClone(server)] },
    AuthorizedEmail: {}, base44: { entities: { GlobalSettings: {} } },
    loadAllEntityRows: async () => [],
    loadSingleGlobalSetting: async ({ settingKey }) => ({ setting_value: { items: settingKey === "salesTaskDescriptions" ? configuredTasks : [] } }),
    setUsers: () => {}, setLoadedProductsSnapshot: () => {},
    setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
    setSaveError: () => {}, setLoadError: value => errors.push(value),
    setHasLoadedChecklist: () => {}, setSaveOutcomeUncertain: () => {},
    setEditingItemId: () => {}, setEditingItemText: () => {},
    setEditingProductName: () => {}, setEditingProductNameText: () => {},
    setNewItemInput: () => {}, setNewItemText: () => {},
    setShowAddGeneralChecklist: () => {}, setNewGeneralChecklistText: () => {},
    setProducts: value => productState.push(value), setLoadedUiProductsSnapshot: () => {},
    setLoadedChecklistSnapshot: () => {}, setLoadedUiChecklistSnapshot: () => {},
    setChecklist: value => checklists.push(value), setDropdownConditions: () => {},
    setProductTypes: () => {}, console: { error: () => {} },
  };
  const load = makeLoad(scope);
  await load();
  assert.match(errors.at(-1), /in Trash/);
  assert.equal(workflowRef.current.current_stage, "old-stage");
  assert.equal(checklists.length, 0);
  server = { ...server, deleted: false, completed: true };
  await load();
  assert.match(errors.at(-1), /no longer an active SIPS job/);
  assert.equal(checklists.length, 0);
  server = { ...server, completed: false, is_rider: true };
  await load();
  assert.match(errors.at(-1), /no longer an active SIPS job/);
  assert.equal(checklists.length, 0);
  assert.equal(productState.length, 0, "Ineligible reload cannot discard previous product edits");
  assert.deepEqual(workflowRef.current, { current_stage: "old-stage" });
  server = { ...server, is_rider: false, current_task_assigned_to: "Installation",
    current_task_description: "Install", sip_checklist: [{ id: "existing" }], products: [{ id: "prod" }] };
  await load();
  assert.match(errors.at(-1), /current task no longer belongs to SIPS/);
  assert.equal(checklists.length, 0, "Moved task must not replace the open checklist");
  assert.equal(productState.length, 0, "Moved task must not discard product drafts");
  assert.deepEqual(workflowRef.current, { current_stage: "old-stage" }, "Moved task does not update save baseline");
  server = { id: "synthetic-status", deleted: false, completed: false, is_rider: false,
    current_stage: "Production", current_task_assigned_to: "SIPs",
    current_task_description: "SIPs Prep", sip_completed: false, sip_checklist: [], products: [] };
  await load();
  assert.equal(errors.at(-1), "");
  assert.deepEqual(checklists, [[]]);
  assert.deepEqual(workflowRef.current, {
    completed: false, is_rider: false, current_stage: "Production",
    current_task_assigned_to: "SIPs", current_task_description: "SIPs Prep", sip_completed: false,
  });
  assert.equal(scope.loadInFlightRef.current, false);
  server = { ...server, current_task_assigned_to: "Installation", current_task_description: "SIP Review" };
  configuredTasks = [{ text: "SIP Review", page: "SIPs" }];
  await load();
  assert.equal(errors.at(-1), "", "SIPS page-configured tasks remain eligible");
  configuredTasks = [{ text: "SIP Review", wip: true }];
  await load();
  assert.equal(errors.at(-1), "", "WIP-configured tasks remain eligible");
  configuredTasks = [{ text: "Unrelated", page: "SIPs" }];
  await load();
  assert.match(errors.at(-1), /current task no longer belongs to SIPS/,
    "Unrelated configured task cannot make an installation job eligible");
  console.log("PASS deleted, completed, rider and moved-task Work Orders refuse stale reload; SIPs and WIP-configured tasks remain eligible");
  passed++;
})();

check("fresh SIP completion status governs whether Complete stays available after reload", () => {
  assert.match(source, /setLoadedSipCompletedSnapshot\(currentWO\.sip_completed\);/,
    "Reload must capture the latest server SIP completion status");
  assert.match(source, /\{isRegistered && !loadedSipCompletedSnapshot && \(\s*<Button\s+ref=\{completeButtonRef\}/,
    "Complete must disappear if another session completed SIP before reload");
  assert.doesNotMatch(source, /\{isRegistered && !workOrder\.sip_completed && \(/,
    "Never use the original board row's stale SIP completion value to show Complete");
  assert.match(source, /sip_completed: currentWO\.sip_completed \?\? null/,
    "Save-time guards must still fence concurrent SIP completion changes");
});

check("failed-load focus waits for dialogs and prioritizes the current loading error", () => {
  const marker = "  const focusLoadFailureIfReady = () => {";
  const start = source.indexOf(marker);
  assert.ok(start > 0);
  const helper = source.slice(start, source.indexOf("  useEffect(() => {", start));
  const makeFocus = new Function("ctx", "with(ctx) { " + helper + "\nreturn focusLoadFailureIfReady; }");
  let focused = 0, scrolled = 0;
  const pending = { current: true };
  const target = {
    isConnected: true, getClientRects: () => [1],
    focus(options) { assert.equal(options.preventScroll, true); focused++; },
    scrollIntoView(options) { assert.equal(options.block, "nearest"); scrolled++; }
  };
  const ctx = {
    loadErrorFocusPendingRef: pending, loadErrorAlertRef: { current: target },
    isOpen: true, isLoading: true, isSaving: false,
    showRevisitPopup: false, showTemplateBuilder: false,
    showOtherPopup: false, discardWarning: null,
  };
  const focus = makeFocus(ctx);
  focus();
  assert.equal(focused, 0, "Loading overlay keeps focus until its exit");
  ctx.isLoading = false;
  ctx.discardWarning = "reload";
  focus();
  assert.equal(focused, 0, "Discard confirmation retains keyboard focus");
  ctx.discardWarning = null;
  ctx.showRevisitPopup = true;
  focus();
  assert.equal(focused, 0, "Revisit confirmation retains keyboard focus");
  ctx.showRevisitPopup = false;
  ctx.isSaving = true;
  focus();
  assert.equal(focused, 0, "Saving UI cannot lose its focus");
  ctx.isSaving = false;
  ctx.loadErrorAlertRef.current = { ...target, isConnected: false };
  focus();
  assert.equal(focused, 0, "Unmounted error does not steal focus");
  ctx.loadErrorAlertRef.current = target;
  focus();
  assert.equal(focused, 1);
  assert.equal(scrolled, 1);
  assert.equal(pending.current, false);
  focus();
  assert.equal(focused, 1, "One failure is only focused once");
  pending.current = true;
  ctx.isOpen = false;
  focus();
  assert.equal(focused, 1);
  ctx.isOpen = true;
  focus();
  assert.equal(focused, 2, "Another failure can be focused after a subsequent retry");
  assert.match(source, /if \(!saveFailureFocusPendingRef\.current \|\| !isOpen \|\| isLoading \|\| isSaving \|\| loadError \|\|/,
    "A pending old save error cannot take focus from the current loading failure");
  assert.equal((source.match(/ref=\{loadErrorAlertRef\} role="alert" tabIndex=\{-1\}/g) || []).length, 2,
    "Initial-load and later-reload errors must be focusable");
});

check("failed-load UI separates errors, offers retry and blocks stale saves", () => {
  assert.match(source, /if \(!hasLoadedChecklist && loadError\) \{\s*return \(\s*<Dialog/);
  assert.match(source, /<DialogTitle>Could not load SIP checklist<\/DialogTitle>/);
  assert.match(source, /The checklist has not loaded\. No items have been changed or saved/);
  assert.match(source, /if \(!loadInFlightRef\.current\) void loadData\(\);/);
  assert.match(source, /onClick=\{onClose\}>Close<\/Button>/);
  assert.match(source, /Checklist reload failed/);
  assert.match(source, /previous checklist and unsaved edits are preserved/);
  assert.match(source, /onClick=\{requestReloadLatest\} disabled=\{isLoading \|\| isSaving\}>Retry loading checklist/);
  assert.match(source, /onClick=\{requestClose\} disabled=\{isLoading \|\| isSaving\}>Close checklist/);
  assert.match(source, /\{hasUnsavedChanges && <p className="mt-2 text-xs">Closing will ask you to confirm before discarding unsaved edits/);
  assert.match(source, /ref=\{completeButtonRef\}[\s\S]*?disabled=\{isSaving \|\| Boolean\(loadError\) \|\| saveOutcomeUncertain\}/);
  assert.match(source, /ref=\{saveRevisitButtonRef\}[\s\S]*?disabled=\{isSaving \|\| !isRegistered \|\| Boolean\(loadError\) \|\| saveOutcomeUncertain\}/);
  assert.ok(source.includes('setHasLoadedChecklist(true);') && source.includes('setLoadError("");'));
});

await (async () => {
  // Exercise confirmed reload through the actual handlers: a network failure
  // must preserve inline drafts, while a successful replacement discards them.
  const loaderSource = source.slice(source.indexOf("  const loadData = async () => {"),
    source.indexOf("  const getDropdownName = (dropdownId) => {"));
  const actionsSource = source.slice(source.indexOf("  const requestClose = () => {"),
    source.indexOf("  return (\n    <>", source.indexOf("  const requestClose = () => {")));
  const makeLoad = new Function("scope", "with(scope) { " + loaderSource + "\nreturn loadData; }");
  const makeActions = new Function("scope", "with(scope) { " + actionsSource +
    "\nreturn { requestReloadLatest, confirmDiscardChanges }; }");
  const calls = [], pending = [], loads = [], warnings = [];
  const drafts = {
    inline: "Unsubmitted task text",
    name: "Unsubmitted product name",
    newItem: "Another unsubmitted item",
    general: "Unsubmitted general item",
    custom: new Map([["row-A", "Unsubmitted Other status"]]),
  };
  const states = { failure: "", checklist: [{ id: "row-A" }] };
  const scope = {
    workOrder: { id: "WO-synthetic", sip_checklist: [{ id: "row-A" }] },
    isSaving: false, isLoading: false, hasUnsavedChanges: true,
    discardWarning: "reload",
    saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
    saveFailureFocusPendingRef: { current: true },
    failedRevisitSelectionRef: { current: "2099-08-25" },
    failedRevisitWorkOrderIdRef: { current: "WO-synthetic" },
    loadDataRequestRef: { current: 0 }, loadedWorkflowSnapshotRef: { current: null },
    loadErrorFocusPendingRef: { current: false },
    returnToReloadRef: { current: true },
    customStatusDraftsByItemIdRef: { current: drafts.custom },
    resetOtherPopupForReload() { drafts.custom.clear(); calls.push("clear custom drafts"); },
    setEditingItemId: () => calls.push("close inline editor"),
    setEditingItemText: value => { drafts.inline = value; },
    setEditingProductName: () => {},
    setEditingProductNameText: value => { drafts.name = value; },
    setNewItemInput: () => {},
    setNewItemText: value => { drafts.newItem = value; },
    setShowAddGeneralChecklist: () => {},
    setNewGeneralChecklistText: value => { drafts.general = value; },
    setDiscardWarning: value => warnings.push(value),
    cancelPendingNavigationFocus: () => {},
    onClose: () => { throw Error("Reload must not close checklist"); },
    setIsLoading: () => {},
    WorkOrder: { filter: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    AuthorizedEmail: {}, base44: { entities: { GlobalSettings: {} } },
    loadAllEntityRows: async () => [],
    loadSingleGlobalSetting: async () => ({ setting_value: { items: [] } }),
    setUsers: () => {}, setLoadedProductsSnapshot: () => {},
    setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
    setSaveError: () => {}, setLoadError: value => { states.failure = value; },
    setHasLoadedChecklist: () => {}, setSaveOutcomeUncertain: () => {},
    setProducts: () => {}, setLoadedUiProductsSnapshot: () => {},
    setLoadedChecklistSnapshot: () => {}, setLoadedUiChecklistSnapshot: () => {},
    setChecklist: value => { states.checklist = value; }, setDropdownConditions: () => {},
    setProductTypes: () => {}, console: { error: () => {} },
  };
  const realLoad = makeLoad(scope);
  scope.loadData = () => {
    const task = realLoad();
    loads.push(task);
    return task;
  };
  const actions = makeActions(scope);
  actions.requestReloadLatest();
  assert.deepEqual(warnings, ["reload"], "Unsaved edits always require confirmation");
  assert.equal(pending.length, 0);
  actions.confirmDiscardChanges();
  assert.equal(pending.length, 1);
  assert.equal(drafts.inline, "Unsubmitted task text");
  assert.equal(drafts.custom.get("row-A"), "Unsubmitted Other status");
  assert.equal(scope.failedRevisitSelectionRef.current, "2099-08-25");
  assert.equal(calls.length, 0, "Confirmed reload may not clean up drafts before the server replies");

  pending[0].reject(new Error("Synthetic network failure"));
  await loads[0];
  assert.match(states.failure, /Synthetic network failure/);
  assert.equal(scope.loadInFlightRef.current, false);
  assert.equal(drafts.inline, "Unsubmitted task text");
  assert.equal(drafts.name, "Unsubmitted product name");
  assert.equal(drafts.newItem, "Another unsubmitted item");
  assert.equal(drafts.general, "Unsubmitted general item");
  assert.equal(drafts.custom.get("row-A"), "Unsubmitted Other status");
  assert.equal(scope.failedRevisitSelectionRef.current, "2099-08-25");
  assert.deepEqual(states.checklist, [{ id: "row-A" }], "Failed reload cannot replace the previous checklist");

  actions.requestReloadLatest();
  assert.equal(warnings.at(-1), "reload", "Retry still requests explicit discard approval");
  actions.confirmDiscardChanges();
  assert.equal(pending.length, 2);
  pending[1].resolve([{ id: "WO-synthetic", current_task_assigned_to: "SIPs", sip_checklist: [{ id: "row-B", type: "checklist" }] }]);
  await loads[1];
  assert.deepEqual(states.checklist, [{ id: "row-B", type: "checklist" }]);
  assert.equal(states.failure, "");
  assert.equal(drafts.inline, "");
  assert.equal(drafts.name, "");
  assert.equal(drafts.newItem, "");
  assert.equal(drafts.general, "");
  assert.equal(drafts.custom.size, 0);
  assert.equal(scope.failedRevisitSelectionRef.current, "2099-08-25", "A verified reload must preserve a Revisit proposal missing from the server");
  assert.equal(scope.failedRevisitWorkOrderIdRef.current, "WO-synthetic");
  assert.ok(calls.includes("clear custom drafts"));
  // No follow-up write is performed. If a later read confirms that date was
  // committed, stop proposing it as an unconfirmed new choice.
  scope.hasUnsavedChanges = false;
  actions.requestReloadLatest();
  assert.equal(pending.length, 3, "Clean retry reloads without a destructive confirmation");
  pending[2].resolve([{ id: "WO-synthetic", current_task_assigned_to: "SIPs", sip_checklist: [{ id: "row-B", type: "checklist" }], sip_revisit_date: "2099-08-25" }]);
  await loads[2];
  assert.equal(scope.failedRevisitSelectionRef.current, undefined, "Confirmed server date consumes the pending suggestion");
  assert.equal(scope.failedRevisitWorkOrderIdRef.current, null);
  assert.match(source, /if \(isLoading\) \{[\s\S]*?<Dialog open=\{isOpen\} onOpenChange=\{\(\) => \{\}\}/,
    "The loading overlay must not dismiss the dialog by Escape or backdrop");
  console.log("PASS confirmed reload preserves all inline and status drafts on failure, then clears them only on verified success");
  passed++;
})();

check("Reload latest confirms unsaved edits and preserves them when cancelled", () => {
  const dirtyBody = source.slice(source.indexOf("  const hasUnsubmittedDrafts = ("),
    source.indexOf("  const requestClose = () => {"));
  const calculateDirty = new Function("newItemInput", "newItemText",
    "showAddGeneralChecklist", "newGeneralChecklistText", "editingItemId",
    "editingItemText", "checklistItemById", "editingProductName", "editingProductNameText",
    "customStatusDraftsByItemIdRef", "isLoading", "checklist", "loadedUiChecklistSnapshot",
    "products", "loadedUiProductsSnapshot",
    dirtyBody + "\nreturn hasUnsavedChanges;");
  const clean = [{ id: "item-1", text: "Existing" }];
  const dirtyArgs = [ { show: false }, "", false, "", null, "",
    new Map([["item-1", clean[0]]]), null, "", { current: new Map() },
    false, clean, clean, [], [] ];
  assert.equal(calculateDirty(...dirtyArgs), false);
  dirtyArgs[11] = [{ id: "item-1", text: "Changed" }];
  assert.equal(calculateDirty(...dirtyArgs), true);
  dirtyArgs[11] = clean;
  dirtyArgs[13] = [{ description: "New product" }];
  assert.equal(calculateDirty(...dirtyArgs), true);
  dirtyArgs[13] = [];
  dirtyArgs[0] = { show: true }; dirtyArgs[1] = "Unadded task";
  assert.equal(calculateDirty(...dirtyArgs), true);
  dirtyArgs[0] = { show: false }; dirtyArgs[1] = "";
  dirtyArgs[4] = "item-1"; dirtyArgs[5] = "Editing this task";
  assert.equal(calculateDirty(...dirtyArgs), true);
  dirtyArgs[4] = null;
  dirtyArgs[9] = { current: new Map([["item-1", "Custom draft"]]) };
  assert.equal(calculateDirty(...dirtyArgs), true);

  const actionBody = source.slice(source.indexOf("  const requestClose = () => {"),
    source.indexOf("  return (\n    <>", source.indexOf("  const requestClose = () => {")));
  const createActions = new Function("isSaving", "isLoading", "saveInFlightRef", "loadInFlightRef",
    "hasUnsavedChanges", "setDiscardWarning", "cancelPendingNavigationFocus", "onClose", "returnToReloadRef",
    "loadData", "discardWarning", "setEditingItemId", "setEditingItemText",
    "setEditingProductName", "setEditingProductNameText", "setNewItemInput",
    "setNewItemText", "setShowAddGeneralChecklist", "setNewGeneralChecklistText",
    actionBody + "\nreturn { requestClose, requestReloadLatest, confirmDiscardChanges };");
  const calls = [], focusFlag = { current: false };
  const make = (dirty, action = null, saving = false, loading = false) =>
    createActions(saving, loading, { current: false }, { current: false }, dirty, value => calls.push(["warning", value]),
      () => calls.push("cancel nav"), () => calls.push("close"), focusFlag,
      () => calls.push("reload"), action,
      value => calls.push(["editor", value]),
      value => calls.push(["text", value]), () => {}, () => {}, () => {},
      () => {}, () => {}, () => {});
  make(true).requestReloadLatest();
  assert.deepEqual(calls, [["warning", "reload"]]);
  assert.equal(focusFlag.current, true);
  // Cancelling the confirmation changes no loaded record or draft.
  calls.length = 0;
  assert.deepEqual(calls, []);
  make(true, "reload").confirmDiscardChanges();
  assert.equal(calls.filter(entry => entry === "reload").length, 1);
  assert.equal(calls.includes("close"), false);
  assert.equal(calls.some(entry => Array.isArray(entry) && entry[0] === "editor"), false,
    'Confirm must not discard inline editor text before the replacement loads');
  assert.equal(focusFlag.current, false);
  calls.length = 0;
  make(false).requestReloadLatest();
  assert.deepEqual(calls, ["reload"]);
  calls.length = 0;
  make(true, null, true).requestReloadLatest();
  make(true, null, false, true).requestReloadLatest();
  assert.deepEqual(calls, []);
  make(true).requestClose();
  assert.deepEqual(calls, [["warning", "close"]]);
  calls.length = 0;
  make(true, "close").confirmDiscardChanges();
  assert.equal(calls.includes("close"), true);
  assert.equal(calls.includes("reload"), false);

  const warning = source.slice(source.indexOf("{/* Unsaved changes warning */}"),
    source.indexOf("{/* Checklist item deletion */}"));
  assert.match(warning, /open=\{!!discardWarning\}/);
  assert.match(warning, /onClick=\{confirmDiscardChanges\}/);
  assert.match(warning, /Discard edits and reload latest\?/);
  assert.match(warning, /Discard & Reload/);
  assert.match(warning, /onOpenChange=\{\(open\) => \{ if \(!open\) setDiscardWarning\(null\); \}\}/);
  const focusStart = warning.indexOf("onCloseAutoFocus={(event) => {");
  const focusEnd = warning.indexOf("\n          }}", focusStart);
  const focusBody = warning.slice(focusStart + "onCloseAutoFocus={(event) => {".length, focusEnd);
  const focusOnCancel = new Function("event", "returnToReloadRef", "reloadLatestButtonRef",
    "isOpen", focusBody);
  let focusCount = 0, preventCount = 0;
  const reloadButton = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focusCount++; } };
  const restore = { current: true };
  focusOnCancel({ preventDefault: () => { preventCount++; } }, restore, { current: reloadButton }, true);
  assert.equal(focusCount, 1);
  assert.equal(preventCount, 1);
  assert.equal(restore.current, false);
  focusOnCancel({ preventDefault: () => { preventCount++; } }, restore, { current: reloadButton }, true);
  assert.equal(focusCount, 1);
  assert.equal(preventCount, 1);
  assert.match(source, /ref=\{reloadLatestButtonRef\}[^\n]*onClick=\{requestReloadLatest\}/);
  assert.match(source, /\}, \[isOpen, workOrder\?\.id\]\);/);
});

check("unfinished inline text blocks Save & Revisit and Complete before any write", () => {
  const guardBody = source.slice(source.indexOf("  const blockOnUnsubmittedDrafts = (action) => {"),
    source.indexOf("  const requestClose = () => {"));
  const makeGuard = new Function("hasUnsubmittedDrafts", "unfinishedEditsActionRef",
    "setUnfinishedEditsWarning", "unfinishedDraftTargetRef", "getUnsubmittedDraftTarget",
    guardBody + "\nreturn blockOnUnsubmittedDrafts;");
  let notices = [], persisted = 0, revisitOpens = 0, validated = 0;
  const actionRef = { current: null }, targetRef = { current: null };
  const block = makeGuard(true, actionRef, value => notices.push(value), targetRef,
    () => ({ kind: "new-item", itemId: "row-1" }));
  assert.equal(block("save"), true);
  assert.deepEqual(notices, ["save"]);
  assert.equal(actionRef.current, "save");
  assert.deepEqual(targetRef.current, { kind: "new-item", itemId: "row-1" });
  assert.equal(makeGuard(false, actionRef, value => notices.push(value), targetRef,
    () => null)("complete"), false);
  assert.deepEqual(notices, ["save"]);

  const saveClickSource = source.slice(source.indexOf("  const handleSaveClick = () => {"),
    source.indexOf("  // Called after user picks (or skips) a revisit date"));
  const makeClick = new Function("isRegistered", "isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef",
    "blockOnUnsubmittedDrafts", "cancelPendingNavigationFocus", "setPendingRevisitDate",
    "loadedRevisitDateSnapshot", "setShowRevisitPopup", "setPendingRevisitRetry", "failedRevisitSelectionRef",
    "const saveOutcomeUncertain = false;\n" + saveClickSource + "\nreturn handleSaveClick;");
  const retrySelections = [];
  makeClick(true, false, { current: false }, false, { current: false }, block, () => {}, () => {}, "2099-03-21",
    () => { revisitOpens++; }, value => retrySelections.push(value), { current: "2099-03-25" })();
  assert.equal(revisitOpens, 0);
  assert.deepEqual(retrySelections, [], "Rejected save must not replace the pending Revisit retry");
  const completeSource = source.slice(source.indexOf("  const handleCheckOff = async () => {"),
    source.indexOf("  const proceedWithCheckOff = async () => {"));
  const makeComplete = new Function("isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef", "blockOnUnsubmittedDrafts",
    "checkIfComplete", "completingWithoutChecklistRef", "setNoChecklistWarning",
    "setIncompleteWarning", "saveChecklist",
    "const saveOutcomeUncertain = false;\n" + completeSource + "\nreturn handleCheckOff;");
  makeComplete(false, { current: false }, false, { current: false }, block, () => { validated++; return { complete: true, hasChecklist: true }; },
    { current: false }, () => {}, () => {}, () => { persisted++; })();
  assert.equal(validated, 0);
  assert.equal(persisted, 0);
  assert.deepEqual(notices.slice(-2), ["save", "complete"]);

  const overrideSource = source.slice(source.indexOf("  const proceedWithCheckOff = async () => {"),
    source.indexOf("  // Called when Save button is clicked"));
  const makeOverride = new Function("isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef", "blockOnUnsubmittedDrafts",
    "completingWithoutChecklistRef", "setNoChecklistWarning", "saveChecklist",
    "const saveOutcomeUncertain = false;\n" + overrideSource + "\nreturn proceedWithCheckOff;");
  const overrideRef = { current: false };
  makeOverride(false, { current: false }, false, { current: false }, block, overrideRef, () => { throw Error("Override warning must remain open"); },
    () => { persisted++; })();
  assert.equal(overrideRef.current, false);
  assert.equal(persisted, 0);

  const directSaveStart = source.slice(source.indexOf("  const saveChecklist = async"),
    source.indexOf("    try {", source.indexOf("  const saveChecklist = async")));
  const makeSaveGuard = new Function("isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef",
    "blockOnUnsubmittedDrafts", "setIsSaving", "const saveOutcomeUncertain = false;\n" + directSaveStart + "\n  };\nreturn saveChecklist;");
  makeSaveGuard(false, { current: false }, false, { current: false }, block, () => { persisted++; })(null, { markComplete: true });
  assert.equal(persisted, 0);
  assert.equal(notices.at(-1), "complete");

  const clean = makeGuard(false, actionRef, value => notices.push(value), targetRef,
    () => null);
  makeClick(true, false, { current: false }, false, { current: false }, clean, () => {}, () => {}, "2099-03-21",
    () => { revisitOpens++; }, value => retrySelections.push(value), { current: "2099-03-25" })();
  assert.equal(revisitOpens, 1); // Still requires the Revisit date popup on a clean save.
  assert.deepEqual(retrySelections, ["2099-03-25"], "The explicit confirmation receives the failed Revisit selection");

  const revisitSave = source.slice(source.indexOf("  const handleRevisitSave = async (dateString) => {"),
    source.indexOf("  const saveChecklist = async"));
  const makeRevisitSave = new Function("isSaving", "saveInFlightRef", "isLoading", "loadInFlightRef",
    "blockOnUnsubmittedDrafts", "setShowRevisitPopup", "saveChecklist", "const saveOutcomeUncertain = false;\n" + revisitSave + "\nreturn handleRevisitSave;");
  const savedDates = [], popupStates = [];
  makeRevisitSave(false, { current: false }, false, { current: false }, block, value => popupStates.push(value),
    value => savedDates.push(value))("2099-04-12");
  assert.deepEqual(savedDates, []);
  assert.deepEqual(popupStates, [false]); // Stale Revisit submission must not write.
  popupStates.length = 0;
  makeRevisitSave(false, { current: false }, false, { current: false }, clean, value => popupStates.push(value),
    value => savedDates.push(value))("2099-04-12");
  assert.deepEqual(savedDates, ["2099-04-12"]);
  assert.deepEqual(popupStates, [false]);

  const popup = source.slice(source.indexOf("{/* Unsubmitted text must be applied or cancelled"));
  assert.match(popup, /Finish unfinished checklist text first/);
  assert.match(popup, /onClick=\{\(\) => setUnfinishedEditsWarning\(null\)\}/);
  assert.match(popup, /focusUnsubmittedDraft\(\)/);
  assert.match(source, /onClick=\{handleSaveClick\}/);
  assert.match(source, /onClick=\{handleCheckOff\}/);
});

check("unfinished edit warning returns focus to the exact draft, reopening nested rows", () => {
  for (const marker of ["new-item", "edit-item", "edit-product", "general"]) {
    assert.match(source, new RegExp('data-sips-unsubmitted-draft="' + marker + '"'));
  }
  assert.equal((source.match(/data-sips-unsubmitted-draft="edit-item"/g) || []).length,
    (source.match(/value=\{editingItemText\}/g) || []).length);
  assert.equal((source.match(/data-sips-unsubmitted-draft="new-item"/g) || []).length,
    (source.match(/value=\{newItemText\}/g) || []).length);

  const focusBody = source.slice(source.indexOf("  const focusUnsubmittedDraft = () => {"),
    source.indexOf("  const requestClose = () => {"));
  const makeFocus = new Function("ctx", "with (ctx) {\n" + focusBody +
    "\nreturn focusUnsubmittedDraft;\n}");
  let focused = 0, scrolled = 0, fallback = 0;
  let collapsed = { P: true }, expanded = {}, showCompleted = false;
  let reopened = null;
  const targetRef = { current: { kind: "new-item", itemId: "task", productName: "P" } };
  const customFocusRef = { current: false };
  const input = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { focused++; }, scrollIntoView: () => { scrolled++; } };
  const fallbackInput = { isConnected: true, disabled: false, getClientRects: () => [1],
    focus: () => { fallback++; } };
  let hidden = false;
  const ctx = {
    unfinishedDraftTargetRef: targetRef, focusCustomDraftOnOpenRef: customFocusRef,
    isOpen: true, isLoading: false,
    checklistItemById: new Map([
      ["task", { id: "task", parent_id: "root", product_name: "P" }],
      ["root", { id: "root", parent_id: null, product_name: "P" }]
    ]),
    checklistSearchInputRef: { current: fallbackInput }, checklistCloseButtonRef: { current: null },
    setCollapsedProducts(fn) { collapsed = fn(collapsed); },
    setExpandedItems(fn) { expanded = fn(expanded); },
    needsInputNavigationIndex: { completedIds: new Set() },
    setShowCompletedItems(value) { showCompleted = value; },
    scheduleNavigationFocus(fn) { fn(); },
    document: { querySelectorAll: () => hidden ? [] : [input] },
    findRenderedChecklistItemElement: () => ({ getClientRects: () => [1] }),
    openOtherPopup(id) { reopened = id; }
  };
  makeFocus(ctx)();
  assert.equal(targetRef.current, null);
  assert.equal(focused, 1);
  assert.equal(scrolled, 1);
  assert.equal(collapsed.P, false);
  assert.equal(expanded.root, true);
  assert.equal(expanded.task, true);

  targetRef.current = { kind: "custom", itemId: "task" };
  ctx.needsInputNavigationIndex.completedIds = new Set(["task"]);
  makeFocus(ctx)();
  assert.equal(reopened, "task");
  assert.equal(customFocusRef.current, true);
  assert.equal(showCompleted, true);
  const popup = source.slice(source.indexOf("{/* Other Dropdown Popup */}"));
  const at = popup.indexOf("onOpenAutoFocus={(event) => {");
  const end = popup.indexOf("\n          }}", at);
  const autoFocus = new Function("event", "focusCustomDraftOnOpenRef", "customStatusInputRef",
    popup.slice(at + "onOpenAutoFocus={(event) => {".length, end));
  let prevented = 0, customFocused = 0;
  autoFocus({ preventDefault: () => { prevented++; } }, customFocusRef,
    { current: { isConnected: true, disabled: false, focus: () => { customFocused++; } } });
  assert.equal(prevented, 1);
  assert.equal(customFocused, 1);
  assert.equal(customFocusRef.current, false);

  targetRef.current = { kind: "edit-item", itemId: "task" };
  hidden = true;
  makeFocus(ctx)();
  assert.equal(fallback, 1);
  targetRef.current = { kind: "custom", itemId: "deleted" };
  makeFocus(ctx)();
  assert.equal(fallback, 2);
  assert.equal(reopened, "task");
  assert.match(source, /unfinishedDraftTargetRef\.current = null;[\s\S]*focusCustomDraftOnOpenRef\.current = false;[\s\S]*setUnfinishedEditsWarning\(null\);/);
});

await (async () => {
  // Run the real save handler with a deferred persistence response to expose
  // React's same-tick state gap. All records and IO are synthetic.
  // Extract only the real async save handler; focus effects and memoized
  // rendering helpers below it require a mounted React component.
  const saveBody = source.slice(source.indexOf("  const saveChecklist = async ("),
    source.indexOf("  // Radix can restore focus while a Revisit dialog is closing."));
  const actionsBody = source.slice(source.indexOf("  const requestClose = () => {"),
    source.indexOf("  return (\n    <>", source.indexOf("  const requestClose = () => {")));
  const makeSave = new Function("scope", "with (scope) {\n" + saveBody + "\nreturn saveChecklist;\n}");
  const makeActions = new Function("scope", "with (scope) {\n" + actionsBody +
    "\nreturn { requestClose, requestReloadLatest, confirmDiscardChanges };\n}");
  let resolveWrite, rejectWrite;
  const writes = [], loadingFlags = [], savingFlags = [], closed = [], errors = [];
  const record = { id: "WO-A", sip_checklist: [], products: [], sip_revisit_date: "", sip_completed: false };
  const scope = {
    isSaving: false, isLoading: false,
    saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
    saveFailureFocusPendingRef: { current: false }, failedRevisitSelectionRef: { current: undefined },
    failedRevisitWorkOrderIdRef: { current: null },
    saveOutcomeUncertain: false,
    setSaveOutcomeUncertain: () => {},
    isDefinitiveSipsSaveRejection: () => true,
    reconcileInterruptedSipsSave: () => { throw Error("Explicit conflict must not attempt save reconciliation"); },
    loadedWorkflowSnapshotRef: { current: {
      completed: false, is_rider: false, current_stage: 'Production',
      current_task_assigned_to: 'SIPs', current_task_description: 'SIPs Prep', sip_completed: false,
    } },
    blockOnUnsubmittedDrafts: () => false,
    setIsSaving(value) { savingFlags.push(value); }, setIsLoading(value) { loadingFlags.push(value); },
    checklist: [], products: [], workOrder: record,
    loadedChecklistSnapshot: [], loadedProductsSnapshot: [],
    loadedRevisitDateSnapshot: "", loadedSipCompletedSnapshot: false,
    isFutureRevisitDate: () => false,
    setSaveError(message) { errors.push(message); },
    replaceWorkOrderFieldsIfUnchanged(args) {
      writes.push(args);
      return new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
    },
    onUpdate: () => {}, onClose: () => { closed.push("closed"); },
    setLoadedChecklistSnapshot: () => {}, setLoadedProductsSnapshot: () => {},
    setLoadedUiChecklistSnapshot: () => {}, setLoadedUiProductsSnapshot: () => {},
    setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
    setChecklist: () => {}, setProducts: () => {},
    hasUnsavedChanges: true, discardWarning: "reload",
    returnToReloadRef: { current: false },
    setDiscardWarning: () => { throw Error("Discard warning changed while save in flight"); },
    cancelPendingNavigationFocus: () => { throw Error("Focus cleanup interrupted save"); },
    loadData: () => { throw Error("Reload interrupted save"); },
    setEditingItemId: () => {}, setEditingItemText: () => {},
    setEditingProductName: () => {}, setEditingProductNameText: () => {},
    setNewItemInput: () => {}, setNewItemText: () => {},
    setShowAddGeneralChecklist: () => {}, setNewGeneralChecklistText: () => {},
    console: { error: () => {} }
  };
  const save = makeSave(scope);
  const actions = makeActions(scope);
  const first = save("2099-02-17");
  assert.equal(scope.saveInFlightRef.current, true);
  assert.equal(scope.saveFailureFocusPendingRef.current, false);
  assert.equal(writes.length, 1);
  // Second save, completion, reload and discard must do nothing even though
  // the captured isSaving/isLoading state remains false until React re-renders.
  await save("2099-02-18", { markComplete: true });
  actions.requestClose();
  actions.requestReloadLatest();
  actions.confirmDiscardChanges();
  assert.equal(writes.length, 1);
  assert.deepEqual(closed, []);
  assert.equal(writes[0].workOrderId, "WO-A");
  assert.deepEqual(writes[0].guardFields, scope.loadedWorkflowSnapshotRef.current,
    'Every checklist save requires the previously loaded task, stage and completion state');
  assert.equal(writes[0].nextFields.sip_revisit_date, "2099-02-17");
  assert.equal(writes[0].nextFields.sip_completed, undefined);
  resolveWrite({ sip_checklist: [], products: [], sip_revisit_date: "2099-02-17", updated_date: "2" });
  await first;
  assert.equal(scope.saveInFlightRef.current, false);
  assert.deepEqual(closed, ["closed"]);
  assert.deepEqual(savingFlags, [true, false]);

  // A rejected conditional write must release the guard for an explicit retry,
  // without closing the checklist or overwriting the previous record.
  closed.length = 0;
  const failed = save("2099-02-18");
  assert.equal(writes.length, 2);
  rejectWrite(Error("Another session changed the checklist"));
  await failed;
  assert.deepEqual(closed, []);
  assert.equal(scope.saveInFlightRef.current, false);
  assert.match(errors.at(-1), /Another session changed/);
  assert.equal(scope.saveFailureFocusPendingRef.current, true, "Failed save requests focus once dialogs settle");
  assert.equal(scope.failedRevisitSelectionRef.current, "2099-02-18", "Failed Revisit remains available for explicit retry");
  const retry = save("2099-02-19");
  assert.equal(writes.length, 3);
  resolveWrite({ sip_checklist: [], products: [], sip_revisit_date: "2099-02-19", updated_date: "3" });
  await retry;
  assert.deepEqual(closed, ["closed"]);
  assert.equal(scope.saveInFlightRef.current, false);
  assert.equal(scope.failedRevisitSelectionRef.current, undefined, "Successful retry consumes the failed selection");
  assert.equal(scope.saveFailureFocusPendingRef.current, false);

  // Load in flight blocks a save even when isLoading has not rendered yet.
  scope.loadInFlightRef.current = true;
  await save("2099-02-20");
  assert.equal(writes.length, 3);
  scope.loadInFlightRef.current = false;
  const changedContextSave = save("2099-02-21");
  assert.equal(writes.length, 4);
  rejectWrite(Error('The record no longer matches its loaded state.'));
  await changedContextSave;
  assert.equal(scope.saveInFlightRef.current, false);
  assert.match(errors.at(-1), /changed stage, task, or completion state in another session/);
  assert.deepEqual(closed, ["closed"], 'Guard conflict does not close the checklist or discard its drafts');
  assert.match(source, /const loadData = async \(\) => \{\s*if \(saveInFlightRef\.current\) return;/);
  assert.match(source, /saveInFlightRef\.current = false;\s*setIsSaving\(false\);/);
  console.log("PASS same-tick SIPS saves, Cancel and Reload serialize with retry-safe guards");
  passed++;
})();

check("checklist editor and custom status controls are inert during saving or failed reload", () => {
  assert.match(source, /className="flex-1 overflow-y-auto space-y-3 pr-0\.5"\s+inert=\{isSaving \|\| Boolean\(loadError\) \? "" : undefined\}\s+aria-busy=\{isSaving \|\| Boolean\(loadError\)\}/);
  assert.match(source, /showAddGeneralChecklist && \(\s*<div className="p-3 bg-gray-50 rounded-lg border mb-3" inert=\{isSaving \? "" : undefined\}/);
  assert.match(source, /<OtherDialogContent\s+inert=\{isSaving \? "" : undefined\}/);
  assert.match(source, /saveInFlightRef\.current = true;\s*saveFailureFocusPendingRef\.current = false;\s*setIsSaving\(true\);/);
  assert.match(source, /saveInFlightRef\.current = false;\s*setIsSaving\(false\);/);
});

check("checklist builder and Add Item actions cannot start during loading or saving", () => {
  assert.match(source, /if \(saveInFlightRef\.current \|\| loadInFlightRef\.current \|\| isSaving \|\| isLoading\) return;\s*cancelPendingNavigationFocus\(\);\s*setShowTemplateBuilder\(true\);\s*\}\}\s*disabled=\{isSaving \|\| isLoading \|\| Boolean\(loadError\)\}/);
  assert.match(source, /if \(!saveInFlightRef\.current && !loadInFlightRef\.current && !isSaving && !isLoading\) setShowAddGeneralChecklist\(true\);/);
  assert.match(source, /disabled=\{isSaving \|\| isLoading \|\| Boolean\(loadError\)\}\s+className="sm:flex-1 h-11 sm:h-10"\s*>\s*<Plus/);
});

check("save feedback is announced and Save & Revisit label recovers after save", () => {
  assert.match(source, /\{isSaving && \(\s*<div role="status" aria-live="polite"/);
  assert.match(source, /Saving SIP checklist… Editing is temporarily unavailable\./);
  assert.match(source, /\{isSaving \? "Saving…" : "Save & Revisit"\}/);
  assert.match(source, /onClick=\{handleSaveClick\}\s+disabled=\{isSaving \|\| !isRegistered \|\| Boolean\(loadError\) \|\| saveOutcomeUncertain\}/);
});


await (async () => {
  // The recovery helper must remain read-only and fail closed on incomplete
  // verification. No real Work Orders or provider APIs are involved.
  const helper = readFileSync(new URL("../src/components/sips/checklistSaveRecovery.js", import.meta.url), "utf8")
    .replace(/^export /gm, "");
  const { reconcileInterruptedSipsSave, isDefinitiveSipsSaveRejection } =
    new Function(helper + "\nreturn { reconcileInterruptedSipsSave, isDefinitiveSipsSaveRejection };")();
  const wanted = {
    sip_checklist: [{ id: "task", text: "Checked", sub_items: [{ value: "ok", id: "detail" }] }],
    products: [{ description: "Cabinet", id: "one" }],
    sip_revisit_date: "2099-05-21",
    sip_completed: true,
  };
  const guard = {
    current_stage: "Fabrication", current_task_assigned_to: "SIPs",
    completed: false, is_rider: false, sip_completed: false,
  };
  let current = {
    id: "WO-recovery", updated_date: "v2", deleted: false,
    ...wanted, current_stage: "Fabrication", current_task_assigned_to: "SIPs",
    completed: false, is_rider: false
  };
  let reads = 0;
  const read = async query => {
    assert.deepEqual(query, { id: "WO-recovery" });
    reads++;
    return [structuredClone(current)];
  };
  const verify = (nextFields = wanted, guardFields = guard, readWorkOrders = read) =>
    reconcileInterruptedSipsSave({ workOrderId: "WO-recovery", nextFields, guardFields, readWorkOrders });
  let outcome = await verify();
  assert.equal(outcome.verified, true);
  assert.equal(outcome.record.sip_revisit_date, "2099-05-21");
  assert.equal(reads, 1);
  outcome = await verify({ ...wanted, sip_revisit_date: "2099-05-22" });
  assert.equal(outcome.verified, false, "Different Revisit date is not successful recovery");
  outcome = await verify({ ...wanted, sip_completed: false });
  assert.equal(outcome.verified, false, "Incomplete SIP is not successful completion recovery");
  outcome = await verify({ ...wanted, products: [{ id: "other", description: "Cabinet" }] });
  assert.equal(outcome.verified, false, "Changed products cannot masquerade as committed save");
  outcome = await verify({ ...wanted, sip_checklist: [] });
  assert.equal(outcome.verified, false, "Missing checklist cannot masquerade as committed save");
  outcome = await verify(wanted, { ...guard, current_stage: "Installation" });
  assert.equal(outcome.verified, false, "Changed stage prevents silent completion");
  for (const data of [[], [current, current], [{ ...current, id: "WO-other" }], [{ ...current, deleted: true }]]) {
    assert.equal((await verify(wanted, guard, async () => data)).verified, false);
  }
  assert.equal((await verify(wanted, guard, async () => { throw Error("Read interrupted"); })).verified, false);
  assert.equal(isDefinitiveSipsSaveRejection(Error("The record no longer matches its loaded state.")), true);
  assert.equal(isDefinitiveSipsSaveRejection(Error("This task is no longer configured for SIPS or WIP.")), true);
  assert.equal(isDefinitiveSipsSaveRejection(Error("Network Error")), false);
  assert.equal(isDefinitiveSipsSaveRejection(Error("The saved field could not be verified.")), false);
  console.log("PASS read-only interrupted save verifier requires matching checklist, products, Revisit, completion and workflow");
  passed++;
})();

await (async () => {
  // Exercise the real SIPS save handler when the write response is interrupted.
  // The simulated provider can commit before throwing, fail before committing,
  // or reject deterministically; reads must never trigger another write.
  const helper = readFileSync(new URL("../src/components/sips/checklistSaveRecovery.js", import.meta.url), "utf8")
    .replace(/^export /gm, "");
  const { reconcileInterruptedSipsSave, isDefinitiveSipsSaveRejection } =
    new Function(helper + "\nreturn { reconcileInterruptedSipsSave, isDefinitiveSipsSaveRejection };")();
  const handler = source.slice(source.indexOf("  const saveChecklist = async ("),
    source.indexOf("  // Radix can restore focus while a Revisit dialog is closing."));
  const makeSave = new Function("scope", "with(scope) {\n" + handler + "\nreturn saveChecklist;\n}");
  const setup = behavior => {
    const workflow = {
      completed: false, is_rider: false, current_stage: "Fabrication",
      current_task_assigned_to: "SIPs", current_task_description: "SIPS Meeting", sip_completed: false
    };
    let remote = {
      id: "synthetic-recovery", sip_checklist: [], products: [],
      sip_revisit_date: "", sip_completed: false, ...workflow
    };
    const stats = { writes: 0, reads: 0, closed: 0, updates: 0, errors: [], uncertainty: [] };
    const scope = {
      saveOutcomeUncertain: false, isSaving: false, isLoading: false,
      saveInFlightRef: { current: false }, loadInFlightRef: { current: false },
      saveFailureFocusPendingRef: { current: false },
      failedRevisitSelectionRef: { current: undefined },
    failedRevisitWorkOrderIdRef: { current: null },
      loadedWorkflowSnapshotRef: { current: workflow },
      isDefinitiveSipsSaveRejection, reconcileInterruptedSipsSave,
      WorkOrder: { filter: async ({ id }) => {
        assert.equal(id, remote.id);
        stats.reads++;
        return [structuredClone(remote)];
      } },
      blockOnUnsubmittedDrafts: () => false, setIsSaving: () => {},
      setSaveOutcomeUncertain: value => { scope.saveOutcomeUncertain = value; stats.uncertainty.push(value); },
      checklist: [], products: [], workOrder: { ...remote },
      loadedChecklistSnapshot: [], loadedProductsSnapshot: [],
      loadedRevisitDateSnapshot: "", loadedSipCompletedSnapshot: false,
      isFutureRevisitDate: () => false,
      setSaveError: value => stats.errors.push(value),
      replaceWorkOrderFieldsIfUnchanged: async args => {
        stats.writes++;
        assert.equal(args.workOrderId, remote.id);
        if (behavior === "lost-committed") remote = { ...remote, ...args.nextFields, updated_date: "v2" };
        if (behavior === "explicit") throw Error("The record no longer matches its loaded state.");
        throw Error("Network Error");
      },
      setLoadedChecklistSnapshot: () => {}, setLoadedProductsSnapshot: () => {},
      setLoadedUiChecklistSnapshot: () => {}, setLoadedUiProductsSnapshot: () => {},
      setLoadedRevisitDateSnapshot: () => {}, setLoadedSipCompletedSnapshot: () => {},
      setChecklist: () => {}, setProducts: () => {},
      onUpdate: () => { stats.updates++; }, onClose: () => { stats.closed++; },
      console: { error: () => {} }
    };
    return { save: makeSave(scope), scope, stats, readRemote: () => remote };
  };
  const recovered = setup("lost-committed");
  await recovered.save("2099-06-12");
  assert.equal(recovered.stats.writes, 1, "Successful but interrupted save is never retried");
  assert.equal(recovered.stats.reads, 1, "Recovery verifies only by read");
  assert.equal(recovered.stats.closed, 1);
  assert.equal(recovered.stats.updates, 1);
  assert.equal(recovered.readRemote().sip_revisit_date, "2099-06-12");
  assert.equal(recovered.scope.workOrder.sip_revisit_date, "2099-06-12");
  assert.equal(recovered.scope.failedRevisitSelectionRef.current, undefined);

  const uncertain = setup("lost-uncommitted");
  await uncertain.save("2099-06-13");
  assert.equal(uncertain.stats.writes, 1);
  assert.equal(uncertain.stats.reads, 1);
  assert.equal(uncertain.stats.closed, 0);
  assert.equal(uncertain.scope.saveOutcomeUncertain, true);
  assert.equal(uncertain.scope.failedRevisitSelectionRef.current, "2099-06-13",
    "Interrupted save preserves the exact requested Revisit choice");
  assert.match(uncertain.stats.errors.at(-1), /could not be verified/);
  await uncertain.save("2099-06-14");
  assert.equal(uncertain.stats.writes, 1, "Unverified save cannot be resubmitted");
  assert.equal(uncertain.stats.reads, 1, "Blocked retry cannot start another read");

  const completed = setup("lost-committed");
  await completed.save(undefined, { markComplete: true });
  assert.equal(completed.stats.writes, 1, "Interrupted completion cannot create a second write");
  assert.equal(completed.stats.reads, 1, "Completion is confirmed read-only");
  assert.equal(completed.readRemote().sip_completed, true);
  assert.equal(completed.stats.closed, 1, "Verified completion may close normally");

  const rejected = setup("explicit");
  await rejected.save("2099-06-15");
  assert.equal(rejected.stats.writes, 1);
  assert.equal(rejected.stats.reads, 0, "Definitive rejection never triggers outcome recovery");
  assert.equal(rejected.scope.saveOutcomeUncertain, false);
  assert.equal(rejected.stats.closed, 0);
  assert.match(source, /saveOutcomeUncertain \? "SIP checklist save needs verification"/);
  assert.match(source, /Save and Complete are paused until Reload latest confirms the server record/);
  assert.match(source, /setSaveOutcomeUncertain\(false\);\s*loadErrorFocusPendingRef\.current = false;/,
    "Only successful checklist reload clears an uncertain save");
  console.log("PASS lost checklist-save and completion responses reconcile without duplicate writes; uncertain outcomes block retry and retain Revisit");
  passed++;
})();

console.log(passed + "/" + passed + " SIPS checklist hierarchy performance checks passed");
