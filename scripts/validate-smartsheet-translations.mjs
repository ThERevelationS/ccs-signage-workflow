import assert from "node:assert/strict";
import { SMARTSHEET_MAPPING_BLUEPRINTS } from "../src/components/admin/smartsheetMappingModel.js";
import { buildSmartsheetDryRunPreview } from "../src/components/admin/smartsheetDryRunModel.js";
import {
  LEAD_SOURCE_ALIASES,
  parseCanonicalSmartsheetNotes,
  reconcilePicklistOptions,
  resolveSmartsheetPerson,
  serializeBase44WorkNotes,
  smartsheetPersonLabelForUser,
} from "../src/components/admin/smartsheetTranslationModel.js";

const notesField = SMARTSHEET_MAPPING_BLUEPRINTS.sales.find((field) => field.field === "work_notes");
assert.equal(notesField?.transform, "notes_process");
assert.equal(notesField?.direction, "two_way");
assert.ok(SMARTSHEET_MAPPING_BLUEPRINTS.sales.some(
  (field) => field.field === "description" && field.direction === "base44_only",
));
assert.ok(!SMARTSHEET_MAPPING_BLUEPRINTS.sales.some(
  (field) => field.field === "title" && field.direction !== "base44_only",
));

const notes = [
  {
    id: 1,
    type: "client",
    text: "Called customer about revised monument sign.",
    timestamp: "2026-09-20T14:30:00.000Z",
    created_by: "Brett Heinlein",
    sub_tasks: [{ id: 11, text: "Send revised rendering", completed: false }],
  },
  {
    id: 2,
    type: "permitting",
    text: "Permit application submitted.",
    timestamp: "2026-09-21T16:00:00.000Z",
    created_by: "Twyla Heinlein",
    sub_tasks: [],
  },
];

const combined = serializeBase44WorkNotes(notes);
assert.ok(combined.includes("[2026-09-20 | Client Communication | Brett Heinlein]"));
assert.ok(combined.includes("- [ ] Send revised rendering"));
assert.ok(combined.includes("[2026-09-21 | Permitting Steps | Twyla Heinlein]"));

const parsed = parseCanonicalSmartsheetNotes(combined);
assert.equal(parsed.canonical, true);
assert.equal(parsed.notes.length, 2);
assert.equal(parsed.notes[0].type, "client");
assert.equal(parsed.notes[0].date, "2026-09-20");
assert.equal(parsed.notes[0].sub_tasks[0].text, "Send revised rendering");
assert.equal(parseCanonicalSmartsheetNotes("9/20 Brett called customer").canonical, false);

const aliasedSources = reconcilePicklistOptions({
  base44Options: ["Website", "Referral"],
  smartsheetOptions: ["Web", "Referral"],
  aliases: LEAD_SOURCE_ALIASES,
});
assert.equal(aliasedSources.synchronized, true, "Website/Web alias should reconcile without duplicating values.");

const sourceExpansion = reconcilePicklistOptions({
  base44Options: ["Web", "Referral"],
  smartsheetOptions: ["Web", "Referral", "Other"],
  aliases: LEAD_SOURCE_ALIASES,
});
assert.deepEqual(sourceExpansion.addToBase44, ["Other"]);

const taskExpansion = reconcilePicklistOptions({
  base44Options: ["Conduct Site Survey", "SIPs"],
  smartsheetOptions: ["Conduct Site Survey"],
});
assert.deepEqual(taskExpansion.addToSmartsheet, ["SIPs"]);

const users = [
  { full_name: "Brett Heinlein", email: "brett@cincisigns.com", sales_roles: ["Task Assigned"] },
  { full_name: "Carl Heinlein", email: "carl@cincisigns.com", sales_roles: ["Task Assigned"] },
  { full_name: "John Smith", email: "john.smith@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "John Doe", email: "john.doe@example.com", sales_roles: ["Task Assigned"] },
];

assert.equal(resolveSmartsheetPerson("Brett", users).user?.full_name, "Brett Heinlein");
assert.equal(resolveSmartsheetPerson("Carl Heinlein", users).state, "exact");
assert.equal(resolveSmartsheetPerson("John", users).state, "ambiguous");
assert.equal(resolveSmartsheetPerson("PJ", users).state, "unresolved");
assert.equal(
  smartsheetPersonLabelForUser(users[0], ["Brett", "Carl"], users),
  "Brett",
);
assert.equal(
  smartsheetPersonLabelForUser({ full_name: "Matias", email: "matias@example.com" }, ["Brett"], [...users, { full_name: "Matias", email: "matias@example.com" }]),
  "Matias",
);

const dryRun = buildSmartsheetDryRunPreview({
  sheetId: "8702703019812740",
  smartsheetRows: [{
    id: "row-1",
    row_number: 1,
    cells: [
      { column_id: "1", value: "Acme", display_value: "Acme" },
      { column_id: "2", value: combined, display_value: combined },
      { column_id: "3", value: "Brett", display_value: "Brett" },
      { column_id: "4", value: "E-100", display_value: "E-100" },
    ],
  }],
  base44Rows: [{
    id: "wo-1",
    smartsheet_sheet_id: "8702703019812740",
    smartsheet_row_id: "row-1",
    client_name: "Acme",
    work_notes: notes,
    current_task_assigned_to: "Brett Heinlein",
    est_inv_at: "E-100",
  }],
  customers: [],
  authorizedUsers: users,
  blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.sales,
  columnBindings: {
    client_name: { column_id: "1" },
    work_notes: { column_id: "2" },
    current_task_assigned_to: { column_id: "3" },
    est_inv_at: { column_id: "4" },
  },
  dataset: "sales",
});
assert.equal(dryRun.rows[0].status, "linked_same");
assert.deepEqual(dryRun.rows[0].differences, []);

console.log("Smartsheet translation regression: PASS");
