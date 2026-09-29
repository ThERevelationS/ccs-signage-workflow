import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  personValuesReferToSameUser,
} from "../src/components/admin/smartsheetTranslationModel.js";
import { canonicalBase44SalesAssignee, smartsheetSalesAssigneeLabel } from "../base44/shared/smartsheetSalesAssigneeTranslation.mjs";
import {
  buildCells,
  buildSnapshot,
  parseRowToFields,
} from "../base44/shared/smartsheetSyncFields.ts";
import {
  SALES_SYNC_ALLOWED_FIELDS,
  filterSalesColumnBindings,
} from "../base44/shared/smartsheetSalesSafety.mjs";

const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const filterDialog = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const assigneeSelect = readFileSync("src/components/sales/TaskAssigneeSelect.jsx", "utf8");
const syncAction = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

const users = [
  { full_name: "Brett Heinlein", email: "brett@cincisigns.com", sales_roles: ["Task Assigned", "Project Manager", "Estimator", "Designer"] },
  { full_name: "Carl Heinlein", email: "carl@cincisigns.com", sales_roles: ["Task Assigned", "Project Manager", "Estimator"] },
  { full_name: "Kyle Heinlein", email: "kyle@cincisigns.com", sales_roles: ["Task Assigned", "Project Manager", "Estimator"] },
  { full_name: "Twyla Heinlein", email: "twyla@cincisigns.com", sales_roles: ["Task Assigned", "Project Manager", "Estimator"] },
  { full_name: "Alex Smith", email: "alex.smith@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "Alex Jones", email: "alex.jones@example.com", sales_roles: ["Task Assigned"] },
];

for (const [short, full] of [
  ["Brett", "Brett Heinlein"],
  ["Carl", "Carl Heinlein"],
  ["Kyle", "Kyle Heinlein"],
  ["Twyla", "Twyla Heinlein"],
]) {
  check(personValuesReferToSameUser(short, full, users),
    `${short} must resolve to its unique authorized full name`);
  check(personValuesReferToSameUser(full, short, users),
    `${full} must resolve back to its short legacy name`);
}
check(personValuesReferToSameUser(" brett ", "BRETT HEINLEIN", users),
  "Identity matching must be case/whitespace tolerant");
check(!personValuesReferToSameUser("Alex", "Alex Smith", users),
  "Ambiguous first names must never be guessed");
check(personValuesReferToSameUser("Legacy Person", " legacy person ", users),
  "Identical unresolved legacy labels must retain normalized exact matching");
check(!personValuesReferToSameUser("Legacy", "Legacy Person", users),
  "Unknown short names must not be expanded without one authorized match");

same(smartsheetSalesAssigneeLabel("Brett Heinlein"), "Brett",
  "Smartsheet push translation must use first name only");
same(smartsheetSalesAssigneeLabel("Carl"), "Carl",
  "Already-short Smartsheet labels remain unchanged");
same(smartsheetSalesAssigneeLabel("Terri Tarter <admin@cincicustomsigns.com>"), "Terri",
  "Legacy display-name/email labels translate to first name");
same(smartsheetSalesAssigneeLabel(""), "", "Blank assignee stays blank");
for (const [short, full] of [
  ["Brett", "Brett Heinlein"],
  ["Carl", "Carl Heinlein"],
  ["Kyle", "Kyle Heinlein"],
  ["Twyla", "Twyla Heinlein"],
]) {
  same(canonicalBase44SalesAssignee(short, users).name, full,
    `Smartsheet pull must canonicalize ${short} to ${full}`);
  same(canonicalBase44SalesAssignee(full, users).name, full,
    `Already-canonical ${full} must remain canonical on pull`);
}
same(canonicalBase44SalesAssignee("Alex", users).state, "ambiguous",
  "Ambiguous Smartsheet first names must fail closed");
same(canonicalBase44SalesAssignee("Unknown Person", users).state, "unresolved",
  "Unknown Smartsheet assignees must fail closed instead of creating a raw Base44 assignment");

const bindings = { current_task_assigned_to: "3326787726927748" };
const cells = buildCells({ current_task_assigned_to: "Brett Heinlein" }, bindings, "sales");
same(cells.length, 1, "One bound assignee must build one Smartsheet cell");
same(cells[0].columnId, "3326787726927748", "Assignee must use the permanent configured column ID");
same(cells[0].value, "Brett", "Runtime Smartsheet cell must contain first name only");
same(buildSnapshot({ current_task_assigned_to: "Brett Heinlein" }, bindings, "sales")["3326787726927748"], "Brett",
  "Conflict snapshot must store the same translated first-name value that was pushed");

const pulled = parseRowToFields({
  id: "row-1",
  cells: [{ column_id: "3326787726927748", value: "Brett", display_value: "Brett" }],
}, bindings, "sales");
same(pulled.current_task_assigned_to, "Brett",
  "Smartsheet pull keeps its first-name representation; Base44 matching handles the alias without mass migration");

const filtered = filterSalesColumnBindings({
  current_task_assigned_to: "3326787726927748",
  sales_rep: "280218450585476",
});
same(filtered.current_task_assigned_to, "3326787726927748",
  "Current Task Assigned To must be an explicitly allowed Sales sync binding");
check(!("sales_rep" in filtered), "Sales Rep must remain Base44-only");
check(SALES_SYNC_ALLOWED_FIELDS.includes("current_task_assigned_to"),
  "Sales sync allowlist must explicitly include Current Task Assigned To");

check(spreadsheet.includes('current_task_assigned_to: "Task Assigned"') &&
      spreadsheet.includes('project_manager: "PM"') &&
      spreadsheet.includes('estimator: "Estimator"') &&
      spreadsheet.includes('designer: "Designer"'),
  "Preset identity matching must use the same role scopes as the filter editor");
same((spreadsheet.match(/personValuesReferToSameUser\(/g) || []).length, 5,
  "Preset equality operators and selected-value column filters must all use person alias matching");
check(spreadsheet.includes("values.some((val) => fieldValue == val)") &&
      spreadsheet.includes("fieldValue != condValue") &&
      spreadsheet.includes("fv == value"),
  "Non-user filter equality semantics must remain unchanged");
check(filterDialog.includes('aria-label="Horizontal Sales Pipeline column preview"') &&
      filterDialog.includes('className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"'),
  "Compact always-visible column checkboxes and horizontal preview must remain intact");
check(assigneeSelect.includes("const selectedName = resolvedValue.name || value;") &&
      assigneeSelect.includes('value={selectedName ? `name:${options.indexOf(selectedName)}` : "none"}') &&
      assigneeSelect.includes('<SelectValue>{selectedName || "Unassigned"}</SelectValue>'),
  "Task assignee UI must display unique first-name aliases as their authorized canonical full name");
check(syncAction.includes("canonicalBase44SalesAssignee(val, salesAssigneeUsers)") &&
      syncAction.includes("fieldValues[key] = resolution.name;"),
  "Sales Smartsheet pull must write canonical authorized full names into Base44");
check(syncAction.includes("assignee_translation_review_required: salesAssigneeTranslationIssues.length") &&
      syncAction.includes("linked records keep their existing Base44 assignee") &&
      !syncAction.includes("No Sales records were changed."),
  "Unresolved or ambiguous historical Smartsheet assignees must be reported without freezing the entire Sales pull");

console.log(`Sales person alias + Smartsheet first-name translation: ${checks}/${checks} PASS.`);
