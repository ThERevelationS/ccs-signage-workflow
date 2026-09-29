import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level guard for the long-checklist hierarchy indexes. The goal is to
// ensure render paths reuse typed child arrays instead of repeatedly filtering
// the same parent children on every unrelated re-render.
const source = readFileSync(
  new URL("../src/components/sips/ProductChecklistDialog.jsx", import.meta.url),
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

check("main checklist rendering reuses typed task and detail arrays", () => {
  assert.match(source, /const itemTasks = checklistChildrenByParentType\.get\(item\.id\)\?\.task \|\| \[\];/);
  assert.match(source, /const itemDetails = \(checklistChildrenByParentType\.get\(item\.id\)\?\.detail \|\| \[\]\)\.map/);
  assert.match(source, /tasks: checklistChildrenByParentType\.get\(detail\.id\)\?\.task \|\| \[\]/);
});

check("checklist-option rendering reuses the same typed hierarchy", () => {
  assert.match(source, /const stItemTasks = checklistChildrenByParentType\.get\(stItem\.id\)\?\.task \|\| \[\];/);
  assert.match(source, /const stItemDetails = \(checklistChildrenByParentType\.get\(stItem\.id\)\?\.detail \|\| \[\]\)\.map/);
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

console.log(passed + "/" + passed + " SIPS checklist hierarchy performance checks passed");
