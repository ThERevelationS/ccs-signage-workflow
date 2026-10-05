import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_SYNC_ALLOWED_FIELDS,
  filterSalesColumnBindings,
  salesPullSnapshotAligned,
} from "../base44/shared/smartsheetSalesSafety.mjs";
import { SMARTSHEET_MAPPING_BLUEPRINTS } from "../src/components/admin/smartsheetMappingModel.js";
import { SALES_MAPPABLE_FIELDS } from "../src/components/admin/smartsheetSyncFields.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

check(!SALES_SYNC_ALLOWED_FIELDS.includes("date_estimate_sent"),
  "Authoritative quote-sent date is excluded from the Sales Smartsheet sync allowlist.");
check(SALES_SYNC_ALLOWED_FIELDS.includes("current_task_deadline"),
  "Current Task Deadline remains an approved Workflow sync field.");

const filtered = filterSalesColumnBindings({
  date_estimate_sent: "7591178804717444",
  current_task_deadline: "3828410546972548",
  current_task_description: "4783818077955972",
});
check(!Object.prototype.hasOwnProperty.call(filtered, "date_estimate_sent"),
  "A stale saved quote-date binding is stripped by the backend boundary.");
same(filtered.current_task_deadline, "3828410546972548",
  "The verified task-deadline binding remains active.");
same(filtered.current_task_description, "4783818077955972",
  "Current Task Description remains active.");

const quoteBlueprint = SMARTSHEET_MAPPING_BLUEPRINTS.sales.find((row) => row.field === "date_estimate_sent");
const deadlineBlueprint = SMARTSHEET_MAPPING_BLUEPRINTS.sales.find((row) => row.field === "current_task_deadline");
same(quoteBlueprint?.direction, "base44_only",
  "Admin semantic mapping marks Estimate Sent as Base44-only.");
same(quoteBlueprint?.transform, "internal_history",
  "Estimate Sent is treated as protected internal/history state.");
same(quoteBlueprint?.suggestedNames, [],
  "Admin semantic mapping cannot auto-match Quote Sent/Estimate Sent columns.");
same(deadlineBlueprint?.direction, "two_way",
  "Current Task Deadline remains explicitly two-way.");
same(deadlineBlueprint?.transform, "date",
  "Current Task Deadline remains a date mapping.");

const frontendKeys = SALES_MAPPABLE_FIELDS.map((field) => field.key).sort();
same(frontendKeys, [...SALES_SYNC_ALLOWED_FIELDS].sort(),
  "Admin binding picker exposes exactly the backend-approved Sales allowlist.");
check(!frontendKeys.includes("date_estimate_sent"),
  "Admin binding picker cannot create a quote-date binding.");
check(frontendKeys.includes("current_task_deadline"),
  "Admin binding picker still exposes Current Task Deadline.");

const backendFieldsSource = readFileSync("base44/shared/smartsheetSyncFields.ts", "utf8");
check(!backendFieldsSource.includes('{ key: "date_estimate_sent", label: "Date Estimate Sent"'),
  "Shared backend field vocabulary no longer exposes Date Estimate Sent.");
check(backendFieldsSource.includes('{ key: "current_task_deadline", label: "Current Task Deadline", type: "date" }'),
  "Shared backend field vocabulary retains Current Task Deadline.");

const historySource = readFileSync("base44/functions/fieldHistoryAction/entry.ts", "utf8");
check(historySource.includes("filterSalesColumnBindings(profile?.column_bindings || {})"),
  "WorkOrder remote field history also filters stale Sales bindings through the approved boundary.");

check(salesPullSnapshotAligned({
  smartsheet_last_synced_at: "2026-10-01T00:00:00Z",
  smartsheet_sync_snapshot: {
    "4783818077955972": "Follow up",
    "3828410546972548": "2026-10-10",
    "7591178804717444": "Van vinyl removal",
  },
}, {
  "4783818077955972": "Follow up",
  "3828410546972548": "2026-10-10",
}),
  "Removing the quote-date binding does not invalidate snapshots solely because an old extra column remains stored.");

console.log("Sales quote-date Smartsheet protection: " + checks + "/" + checks + " PASS.");
