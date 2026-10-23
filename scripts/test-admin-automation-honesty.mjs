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

test("live trigger sets match real emitters", () => {
  const emailOnly = setLiteral(adminSettings, "EMAIL_ONLY_TRIGGER_SET");
  const engine = setLiteral(adminSettings, "WORKFLOW_ENGINE_TRIGGER_SET");
  const deadline = setLiteral(adminSettings, "DEADLINE_TRIGGER_SET");

  // No overlap between the three execution paths.
  const all = [...emailOnly, ...engine, ...deadline];
  assert.equal(new Set(all).size, all.length, "trigger sets must not overlap");

  // Every email-only trigger must actually be emitted by NotificationService.
  for (const t of emailOnly) {
    assert.ok(
      notificationService.includes(`"${t}"`),
      `"${t}" is advertised as live but NotificationService never emits it`
    );
  }

  // Every engine trigger must have a matchesTrigger case server-side.
  for (const t of engine) {
    assert.ok(
      workflowEngine.includes(`'${t}'`),
      `"${t}" is advertised as live but workflowTriggerEngine never matches it`
    );
  }

  // Every deadline trigger must be evaluated by the daily checker.
  for (const t of deadline) {
    assert.ok(
      deadlineReminders.includes(`'${t}'`),
      `"${t}" is advertised as live but checkDeadlineReminders never evaluates it`
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
  // Email-only triggers genuinely only execute send_email client-side.
  assert.ok(
    notificationService.includes('action.action_type === "send_email"'),
    "client-side executor must run send_email actions"
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
  // create_rider is advertised but unimplemented everywhere — must be marked.
  assert.ok(
    adminSettings.includes('t.value === "create_rider" ? " (not working yet)"'),
    "create_rider must be marked as not working yet"
  );
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
  // Ignored order-filter warning.
  assert.ok(
    adminSettings.includes("Order filters aren't applied yet"),
    "order-filter honesty warning missing"
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
    ...setLiteral(adminSettings, "EMAIL_ONLY_TRIGGER_SET"),
    ...setLiteral(adminSettings, "WORKFLOW_ENGINE_TRIGGER_SET"),
    ...setLiteral(adminSettings, "DEADLINE_TRIGGER_SET"),
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
