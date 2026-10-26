import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const adminSettings = read("src/pages/AdminSettings.jsx");
const notificationService = read("src/components/workflow/NotificationService.jsx");
const workflowEngine = read("base44/shared/workflowTriggerEngine.ts");
const deadlineReminders = read("base44/functions/checkDeadlineReminders/entry.ts");

const setLiteral = (source, name) => {
  const match = source.match(new RegExp(`${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
  assert.ok(match, `AdminSettings must define ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
};

const processTriggersEntry = read("base44/functions/processWorkflowTriggers/entry.ts");
const opportunityWorkspace = read("base44/functions/opportunityWorkspaceAction/entry.ts");
const timeClockAction = read("base44/functions/timeClockAction/entry.ts");
const detectSalesDuplicates = read("base44/functions/detectSalesDuplicates/entry.ts");
const manageFeatureReports = read("base44/functions/manageFeatureReports/entry.ts");
const onboardingAccountAction = read("base44/functions/onboardingAccountAction/entry.ts");
const issuePasswordReset = read("base44/functions/issuePasswordReset/entry.ts");
const monitorJurisdictionChanges = read("base44/functions/monitorJurisdictionChanges/entry.ts");
const jurisdictionPersistence = read("src/components/permitting/jurisdictionPersistence.js");
const faceEnrollmentDialog = read("src/components/timeclock/FaceEnrollmentDialog.jsx");
const userManagement = read("src/components/admin/UserManagement.jsx");

test("live trigger sets match real emitters", () => {
  const engine = setLiteral(adminSettings, "WORKFLOW_ENGINE_TRIGGER_SET");
  const order = setLiteral(adminSettings, "ORDER_TRIGGER_SET");
  const deadline = setLiteral(adminSettings, "DEADLINE_TRIGGER_SET");
  const orderDeadline = setLiteral(adminSettings, "ORDER_DEADLINE_TRIGGER_SET");
  const sales = setLiteral(adminSettings, "SALES_TRIGGER_SET");
  const salesDeadline = setLiteral(adminSettings, "SALES_DEADLINE_TRIGGER_SET");
  const timeClock = setLiteral(adminSettings, "TIME_CLOCK_TRIGGER_SET");
  const pendingImport = setLiteral(adminSettings, "PENDING_IMPORT_TRIGGER_SET");
  const featureReport = setLiteral(adminSettings, "FEATURE_REPORT_TRIGGER_SET");
  const users = setLiteral(adminSettings, "USER_TRIGGER_SET");
  const jurisdiction = setLiteral(adminSettings, "JURISDICTION_TRIGGER_SET");

  // No overlap between the execution paths.
  const all = [...engine, ...order, ...deadline, ...orderDeadline, ...sales, ...salesDeadline, ...timeClock,
    ...pendingImport, ...featureReport, ...users, ...jurisdiction];
  assert.equal(new Set(all).size, all.length, "trigger sets must not overlap");

  // Every client-emitted engine/order trigger must actually be emitted by
  // NotificationService (permit events arrive from other callers).
  const clientEmitted = [...engine, ...order].filter(t => !t.startsWith("permit_"));
  for (const t of clientEmitted) {
    assert.ok(
      notificationService.includes(`"${t}"`),
      `"${t}" is advertised as live but NotificationService never emits it`
    );
  }

  // Every engine/order trigger must have a matchesTrigger case server-side.
  for (const t of [...engine, ...order]) {
    assert.ok(
      workflowEngine.includes(`'${t}'`),
      `"${t}" is advertised as live but workflowTriggerEngine never matches it`
    );
  }
  // Externally-emitted events must be accepted by the endpoint.
  // permit_followup_* are internal — checkPermitFollowupReminders calls the
  // engine directly, so they legitimately aren't in the endpoint's allowlist.
  for (const t of [...clientEmitted, "permit_submitted", "permit_received"]) {
    assert.ok(
      processTriggersEntry.includes(`'${t}'`),
      `"${t}" is advertised as live but processWorkflowTriggers rejects it`
    );
  }

  // Every deadline trigger must be evaluated by the daily checker.
  for (const t of [...deadline, ...orderDeadline, ...salesDeadline]) {
    assert.ok(
      deadlineReminders.includes(`'${t}'`),
      `"${t}" is advertised as live but checkDeadlineReminders never evaluates it`
    );
  }

  // Sales events are emitted server-side by opportunityWorkspaceAction after
  // verified saves, and matched by the engine via its record-context map.
  for (const t of sales) {
    assert.ok(
      opportunityWorkspace.includes(`"${t}"`),
      `"${t}" is advertised as live but opportunityWorkspaceAction never emits it`
    );
    assert.ok(
      workflowEngine.includes(`${t}: 'Opportunity'`),
      `"${t}" is advertised as live but the engine maps no record context for it`
    );
  }

  // Time Clock / PTO events are emitted server-side by timeClockAction after
  // verified writes, matched by the engine record map, and accepted by the
  // endpoint (it receives the record id, not a Work Order).
  const timeClockEntities = {
    time_clock_in: 'TimeEntry',
    time_clock_out: 'TimeEntry',
    time_clock_in_late: 'TimeEntry',
    time_clock_out_early: 'TimeEntry',
    time_entry_long_shift: 'TimeEntry',
    time_entry_no_clock_out: 'TimeEntry',
    time_entry_notes_updated: 'TimeEntry',
    time_off_requested: 'TimeOffRequest',
    time_off_updated: 'TimeOffRequest',
    time_off_approved: 'TimeOffRequest',
    time_off_denied: 'TimeOffRequest',
    time_off_cancelled: 'TimeOffRequest',
    job_allocation_added: 'TimeClockLaborSegment',
    pto_balance_low: 'UserPTOBalance',
  };
  for (const t of timeClock) {
    assert.ok(
      timeClockAction.includes(`'${t}'`),
      `"${t}" is advertised as live but timeClockAction never emits it`
    );
    assert.ok(
      workflowEngine.includes(`${t}: '${timeClockEntities[t]}'`),
      `"${t}" is advertised as live but the engine maps no record context for it`
    );
    assert.ok(
      processTriggersEntry.includes(`'${t}'`),
      `"${t}" is advertised as live but processWorkflowTriggers rejects it`
    );
  }

  // Remaining record-context domains — every advertised trigger must appear
  // in a real emitter, the engine's record map, and the endpoint allowlist.
  const recordEmitters = {
    pending_import_created: { files: [detectSalesDuplicates], entity: 'PendingImport' },
    duplicate_detected: { files: [detectSalesDuplicates], entity: 'PendingImport' },
    feature_report_submitted: { files: [manageFeatureReports], entity: 'FeatureReport' },
    feature_report_status_changed: { files: [manageFeatureReports], entity: 'FeatureReport' },
    feature_report_completed: { files: [manageFeatureReports], entity: 'FeatureReport' },
    user_registered: { files: [onboardingAccountAction], entity: 'AuthorizedEmail' },
    user_password_reset: { files: [issuePasswordReset], entity: 'AuthorizedEmail' },
    user_face_enrolled: { files: [faceEnrollmentDialog], entity: 'AuthorizedEmail' },
    user_role_changed: { files: [userManagement], entity: 'AuthorizedEmail' },
    jurisdiction_profile_created: { files: [jurisdictionPersistence], entity: 'JurisdictionProfile' },
    jurisdiction_profile_updated: { files: [jurisdictionPersistence, monitorJurisdictionChanges], entity: 'JurisdictionProfile' },
    regulation_alert_created: { files: [monitorJurisdictionChanges], entity: 'RegulationAlert' },
  };
  for (const [t, spec] of Object.entries(recordEmitters)) {
    const advertised = [...pendingImport, ...featureReport, ...users, ...jurisdiction].includes(t);
    assert.ok(advertised, `"${t}" has an emitter but is not in any live trigger set`);
    for (const file of spec.files) {
      assert.ok(
        file.includes(`'${t}'`) || file.includes(`"${t}"`),
        `"${t}" is advertised as live but a declared emitter file never emits it`
      );
    }
    assert.ok(
      workflowEngine.includes(`${t}: '${spec.entity}'`),
      `"${t}" is advertised as live but the engine maps no ${spec.entity} record context for it`
    );
    assert.ok(
      processTriggersEntry.includes(`'${t}'`),
      `"${t}" is advertised as live but processWorkflowTriggers rejects it`
    );
  }
});

test("supported action sets match real executors", () => {
  const engineActions = setLiteral(adminSettings, "ENGINE_SUPPORTED_ACTIONS");
  const deadlineActions = setLiteral(adminSettings, "DEADLINE_SUPPORTED_ACTIONS");

  for (const a of engineActions) {
    assert.ok(
      workflowEngine.includes(`case '${a}'`),
      `"${a}" is advertised as engine-supported but executeAction has no case for it`
    );
  }
  for (const a of deadlineActions) {
    assert.ok(
      deadlineReminders.includes(`case '${a}'`),
      `"${a}" is advertised as deadline-supported but checkDeadlineReminders has no case for it`
    );
  }
  // Order events carry no Work Order, so only send_email can execute — the
  // engine must guard mutations accordingly.
  assert.ok(
    workflowEngine.includes("Action requires a Work Order"),
    "engine must skip mutating actions when no Work Order exists"
  );
});

test("dead options are marked and warned about in the builder", () => {
  // Trigger picker marks un-wired options.
  assert.ok(
    adminSettings.includes('getTriggerSupportedActions(t.value) ? "" : " (not working yet)"'),
    "dead triggers must be marked in the picker"
  );
  // Per-trigger warning under the editor.
  assert.ok(
    adminSettings.includes("isn't connected to anything yet, so a rule using it won't run"),
    "dead trigger warning missing"
  );
  // Every advertised action must have a server-side executor — nothing in
  // the picker may be a dead option.
  const actionBlock = adminSettings.match(/const ACTION_TYPES = \[([\s\S]*?)\];/);
  assert.ok(actionBlock, "ACTION_TYPES must exist");
  const advertisedActions = [...actionBlock[1].matchAll(/value: "([^"]+)"/g)].map(m => m[1]);
  for (const a of advertisedActions) {
    assert.ok(
      workflowEngine.includes(`case '${a}'`),
      `"${a}" is selectable in the builder but executeAction has no case for it`
    );
  }
  // Per-action unsupported warning.
  assert.ok(
    adminSettings.includes("it will be skipped"),
    "unsupported action warning missing"
  );
  // AND-mixed-event hint.
  assert.ok(
    adminSettings.includes('triggers.some(t => t.logic === "and")'),
    "AND-mixed-event warning missing"
  );
  // Order filters are applied server-side — the engine must evaluate them.
  assert.ok(
    workflowEngine.includes("condition.request_type") && workflowEngine.includes("condition.min_quantity"),
    "engine must evaluate order filters"
  );
  // Plain-English summary.
  assert.ok(adminSettings.includes("describeAutomation(triggers, actions)"), "plain-English summary missing");
  // Saved-rule badge.
  assert.ok(adminSettings.includes("Won't run — not wired yet"), "saved-rule badge missing");
});

test("every advertised trigger resolves to a status", () => {
  const triggerBlock = adminSettings.match(/const TRIGGER_TYPES = \[([\s\S]*?)\];/);
  assert.ok(triggerBlock, "TRIGGER_TYPES must exist");
  const values = [...triggerBlock[1].matchAll(/value: "([^"]+)"/g)].map(m => m[1]);
  assert.ok(values.length > 50, "expected the full advertised trigger list");

  const live = new Set([
    ...setLiteral(adminSettings, "WORKFLOW_ENGINE_TRIGGER_SET"),
    ...setLiteral(adminSettings, "ORDER_TRIGGER_SET"),
    ...setLiteral(adminSettings, "DEADLINE_TRIGGER_SET"),
    ...setLiteral(adminSettings, "ORDER_DEADLINE_TRIGGER_SET"),
    ...setLiteral(adminSettings, "SALES_TRIGGER_SET"),
    ...setLiteral(adminSettings, "SALES_DEADLINE_TRIGGER_SET"),
    ...setLiteral(adminSettings, "TIME_CLOCK_TRIGGER_SET"),
    ...setLiteral(adminSettings, "PENDING_IMPORT_TRIGGER_SET"),
    ...setLiteral(adminSettings, "FEATURE_REPORT_TRIGGER_SET"),
    ...setLiteral(adminSettings, "USER_TRIGGER_SET"),
    ...setLiteral(adminSettings, "JURISDICTION_TRIGGER_SET"),
  ]);
  for (const v of values) {
    assert.ok(typeof v === "string" && v.length > 0, "trigger values must be non-empty strings");
  }
  // Helpers the UI relies on must exist, and the picker must consult the
  // capability map so every non-live value is flagged automatically.
  assert.ok(adminSettings.includes("const getTriggerSupportedActions"));
  assert.ok(adminSettings.includes("const actionRunsForTriggers"));
  assert.ok(adminSettings.includes("const ruleIsRunnable"));
  assert.ok(adminSettings.includes("getTriggerSupportedActions(t.value)"), "picker consults capability map");
  assert.ok(live.size > 0, "at least some triggers must be live");
});

test("automation rules execute server-side through the engine endpoint", () => {
  // NotificationService must hand AutomationRule processing to
  // processWorkflowTriggers with a session credential — not evaluate
  // rule actions client-side (which silently ran send_email only).
  assert.ok(
    notificationService.includes("invoke('processWorkflowTriggers'"),
    "NotificationService must route automation events to the engine endpoint"
  );
  assert.ok(
    notificationService.includes("session_token:"),
    "the engine call must carry a session credential"
  );
  assert.ok(
    !notificationService.includes("entities.AutomationRule"),
    "client must not load or evaluate AutomationRule rows itself"
  );
  assert.ok(
    !notificationService.includes('action.action_type === "send_email"'),
    "client must not execute rule actions itself"
  );
  // The endpoint still authenticates every request.
  assert.ok(
    processTriggersEntry.includes("authenticateSignShopSession"),
    "endpoint must authenticate the session"
  );
  // Engine honors each trigger row's declared AND/OR logic.
  assert.ok(
    workflowEngine.includes("trigger?.logic === 'and'"),
    "engine must combine triggers with their declared logic"
  );
});
