import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { equivalent, trackedConditionalSave } from "../base44/shared/fieldAudit.ts";
import { validateNeutralSalesCloseout } from "../base44/shared/salesNeutralCloseoutGuard.mjs";
import {
  captureSalesTransitionGuards,
  untouchedSalesTransitionGuards,
  isSalesTransitionSnapshotCurrent,
} from "../src/components/sales/salesTaskStageMapping.mjs";

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rejected = (record, patch, label) => {
  assert.throws(() => validateNeutralSalesCloseout(record, patch, equivalent), { status: 409 }, label);
  checks++;
};

const active = {
  id: "synthetic-sales-transition", updated_date: "v1",
  in_pipeline: true, sales_status: "quoted",
  current_task_description: "Waiting on Deposit",
};
const marker = "2026-10-08T12:00:00.000Z";
check(isSalesTransitionSnapshotCurrent(active, { ...active }), "Unchanged loaded Sales snapshot can be confirmed.");
for (const stale of [
  { sales_status: "won" },
  { in_pipeline: false },
  { current_task_description: "Lost" },
  { sales_neutral_closed_at: marker },
  { id: "other-work-order" },
]) {
  check(!isSalesTransitionSnapshotCurrent(active, { ...active, ...stale }),
    "Stale or different Sales classification/task cannot be confirmed.");
}
const neutral = {
  current_task_description: "Closed - Did not Lose",
  in_pipeline: false, sales_neutral_closed_at: marker, follow_up_date: "",
};
validateNeutralSalesCloseout(active, neutral, equivalent);
checks++;
const closed = { ...active, ...neutral };
validateNeutralSalesCloseout(closed, neutral, equivalent);
checks++;
rejected({ ...active, sales_status: "won" }, neutral, "A Won opportunity cannot silently become neutral.");
rejected({ ...active, sales_status: "lost" }, neutral, "A Lost opportunity cannot silently become neutral.");
rejected({ ...active, in_pipeline: false }, neutral, "A historical WorkOrder cannot be reclassified as neutral.");
rejected(active, { ...neutral, current_task_description: "WIP - Designing" }, "Neutral closeout requires the correct task.");
rejected(active, { ...neutral, in_pipeline: true }, "Neutral closeout must exit Current Pipeline.");
rejected(active, { ...neutral, follow_up_date: "2026-10-12" }, "Closeout must clear follow-up.");
rejected(active, { ...neutral, sales_neutral_closed_at: "" }, "Neutral closeout must contain an audit timestamp.");
rejected(active, { ...neutral, sales_neutral_closed_at: "yesterday" }, "Neutral closeout must have an ISO timestamp.");
rejected(active, { ...neutral, sales_status: "won" }, "Neutral closeout cannot fabricate Won.");
rejected(closed, { ...neutral, sales_neutral_closed_at: "2026-10-08T12:01:00.000Z" }, "Replaying a changed neutral timestamp must be rejected.");

const guards = captureSalesTransitionGuards(active);
equal(guards, { sales_status: "quoted", in_pipeline: true }, "Loaded Sales classification is retained.");
equal(untouchedSalesTransitionGuards(guards, { current_task_description: "Follow up with Customer - Post-Estimate" }), guards,
  "Task-only edit guards both status and pipeline membership.");
equal(untouchedSalesTransitionGuards(guards, { sales_status: "lost", current_task_description: "Lost" }),
  { in_pipeline: true }, "Stage change compares status through its own expected-field baseline.");
equal(untouchedSalesTransitionGuards(guards, neutral),
  { sales_status: "quoted" }, "Neutral closeout checks status but guards pipeline membership through expected fields.");
equal(captureSalesTransitionGuards(
  { ...active, sales_status: "lost" }, { sales_status: "quoted" }, guards
), guards, "Subsequent optimistic edits cannot replace originally loaded guard values.");
equal(captureSalesTransitionGuards(
  { ...active, sales_status: "lost" }, { sales_status: "quoted" }
), guards, "Pending status changes use the original CAS baseline.");

const salesSheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const persistence = readFileSync("src/components/workflow/workOrderPersistence.js", "utf8");
const wrapper = readFileSync("src/components/shared/trackedFieldPersistence.js", "utf8");
const historyBackend = readFileSync("base44/functions/fieldHistoryAction/entry.ts", "utf8");
check(salesSheet.includes("&& !confirmedTaskTransition") && salesSheet.includes("}, false, true);"),
  "Confirmed neutral transition bypasses repeated task mapping confirmation.");
check(salesSheet.includes("pendingChanges: proposedUpdates") &&
  (salesSheet.match(/\.\.\.\(statusTransition\.pendingChanges \|\| \{\}\)/g) || []).length === 2,
  "Follow-up outcome/completion and rule-driven edits survive a terminal or neutral confirmation.");
check(salesSheet.includes("isSalesTransitionSnapshotCurrent(statusTransition.workOrder, current)"),
  "Confirmation checks its opened snapshot before writing.");
check(!salesSheet.includes('"sales_quote_sent_verified_at", "sales_neutral_closed_at"'),
  "Neutral closure timestamp is eligible for regular-user CellHistory recording.");
const opportunity = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
check(opportunity.includes('"sales_neutral_closed_at"') && opportunity.includes("Neutral closure confirmed"),
  "Opportunity Detail displays explicit neutral closure in history.");
check(salesSheet.includes("pendingSalesGuardsRef.current[orderId] = captureSalesTransitionGuards") &&
  salesSheet.includes("guardFields: untouchedSalesTransitionGuards(pendingSalesGuardsRef.current[orderId], changes)"),
  "Quick edits preserve untouched Sales classification guards.");
check(salesSheet.includes("delete pendingSalesGuardsRef.current[orderId];") &&
  salesSheet.includes("pendingSalesGuardsRef.current = {};"),
  "Successful saves and discards clear transition guards.");
check(persistence.includes("nextFields, guardFields = {}") && persistence.includes("nextFields, guardFields});"),
  "WorkOrder persistence forwards guards without changing callers that omit them.");
check(wrapper.includes("guard_fields:guardFields") && historyBackend.includes("body.guard_fields"),
  "Backend validates guard fields against the current authoritative WorkOrder.");
check(historyBackend.includes("sales_stage_changed_at sales_neutral_closed_at lost_reason") &&
  historyBackend.includes("validateNeutralSalesCloseout(record,patch,equivalent)"),
  "Backend accepts and validates the neutral marker.");
check(historyBackend.includes("if(!equivalent(record[f],expected[f]) && !equivalent(record[f],v))") &&
  historyBackend.includes("trackedConditionalSave(base44,type,record,patch,actor)"),
  "Backend checks edited-field baselines before committing a single WorkOrder patch.");
check(historyBackend.includes("FieldAudit.filter") && historyBackend.includes("CellHistory.filter"),
  "Normal history UI reads the current FieldAudit and legacy CellHistory without duplicate client writes.");

// Synthetic server-side conditional WorkOrder saves: one updateMany and audit
// records for every changed field; never touch production entities.
let live = { ...active };
let version = 1;
let updates = 0;
let auditRows = [];
let auditWrites = 0;
let forceConflict = false;
const base44 = { asServiceRole: { entities: {
  FieldAudit: {
    bulkCreate: async (rows) => {
      const added = rows.map((row, index) => ({ ...row, id: "synthetic-audit-" + (auditRows.length + index) }));
      auditRows.push(...added);
      return added;
    },
    bulkUpdate: async (rows) => {
      auditWrites++;
      for (const row of rows) {
        const found = auditRows.find((item) => item.id === row.id);
        if (found) found.status = row.status;
      }
    },
  },
  WorkOrder: {
    updateMany: async (query, update) => {
      updates++;
      if (forceConflict || query.updated_date !== live.updated_date) return { updated: 0 };
      live = { ...live, ...update.$set, updated_date: "v" + (++version) };
      return { updated: 1 };
    },
    get: async () => ({ ...live }),
  },
} } };
const actor = { full_name: "Synthetic Test", email: "synthetic@example.invalid" };
const wonPatch = {
  current_task_description: "SIPs",
  sales_status: "won",
  close_date: "2026-10-08",
  follow_up_date: "",
};
const saved = await trackedConditionalSave(base44, "WorkOrder", { ...live }, wonPatch, actor);
equal(saved.sales_status, "won", "Confirmed status is saved as Won.");
equal(saved.current_task_description, "SIPs", "Task and stage save within the same WorkOrder patch.");
equal(updates, 1, "One atomic conditional WorkOrder write saves the full transition.");
equal(auditRows.map((row) => row.field_name).sort(), Object.keys(wonPatch).filter((field) => !equivalent(active[field], wonPatch[field])).sort(),
  "All actually changed fields receive their own audit events.");
check(auditRows.every((row) => row.status === "committed"), "Successful WorkOrder save commits every audit event.");
const beforeConflict = { ...live };
forceConflict = true;
await assert.rejects(
  trackedConditionalSave(base44, "WorkOrder", { ...live }, {
    current_task_description: "WIP - Designing",
    sales_status: "lost",
  }, actor),
  /changed during saving/
);
checks++;
equal(live, beforeConflict, "Concurrent version conflict does not modify WorkOrder fields.");
check(auditRows.filter((row) => row.status === "aborted").length === 2,
  "Rejected transition marks prepared audit events aborted.");
check(auditWrites === 2, "Both successful and rejected writes finalize audit intent.");

// Reopening preserves the prior committed audit events while clearing only
// active closeout fields; a later neutral close records the follow-up outcome.
forceConflict = false;
const reopened = await trackedConditionalSave(base44, "WorkOrder", { ...live }, {
  current_task_description: "Follow up with Customer - Post-Estimate",
  sales_status: "follow_up", close_date: "", lost_reason: "",
}, actor);
equal(reopened.sales_status, "follow_up", "Confirmed reopening restores an active Sales stage.");
equal(reopened.close_date, "", "Reopening clears the active close date.");
check(auditRows.some(row => row.field_name === "close_date" && row.status === "committed"),
  "Prior close date evidence remains in historical audit events.");
const followUpNeutral = {
  ...neutral,
  sales_last_follow_up_completed_at: "2026-10-08T12:01:00.000Z",
  sales_last_follow_up_outcome: "No response",
};
validateNeutralSalesCloseout(reopened, followUpNeutral, equivalent);
const neutralSaved = await trackedConditionalSave(base44, "WorkOrder", { ...live }, followUpNeutral, actor);
equal(neutralSaved.in_pipeline, false, "Neutral closure removes current pipeline membership.");
equal(neutralSaved.sales_status, "follow_up", "Neutral close does not fabricate Won/Lost status.");
equal(neutralSaved.sales_last_follow_up_outcome, "No response", "Follow-up outcome survives neutral closure.");
equal(neutralSaved.sales_last_follow_up_completed_at, "2026-10-08T12:01:00.000Z",
  "Follow-up completed timestamp survives neutral closure.");
check(auditRows.some(row => row.field_name === "sales_neutral_closed_at" && row.status === "committed"),
  "Neutral closure marker receives committed audit history.");
console.log("Sales transition atomicity, guards and neutral closeout: " + checks + "/" + checks + " PASS.");
