import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Validation failures thrown before a request reaches the server are marked
// so callers can release write locks immediately instead of forcing an
// uncertain-outcome recovery for a write that was never dispatched.
const persistenceSource = readFileSync("src/components/admin/automationRulePersistence.js", "utf8");
const pageSource = readFileSync("src/pages/AdminSettings.jsx", "utf8");

const stubUrl = "data:text/javascript," + encodeURIComponent(
  'export const base44={functions:{invoke:(...args)=>globalThis.__syntheticInvoke(...args)}};'
);
const persistence = await import("data:text/javascript," + encodeURIComponent(
  persistenceSource.replace('from "@/api/base44Client"', `from "${stubUrl}"`)
));
const {
  createAutomationRuleIfAbsent, updateAutomationRuleIfUnchanged, deleteAutomationRuleIfUnchanged,
} = persistence;

const record = { id: "r1", enabled: true, updated_date: "v1" };
const validFields = { name: "Rule", enabled: true, priority: 0, triggers: [], actions: [] };

async function expectPreDispatch(fn, pattern) {
  globalThis.__syntheticInvoke = () => { throw new Error("dispatch must not be reached"); };
  await assert.rejects(fn, error =>
    error?.automationPreDispatch === true && pattern.test(error.message));
}

test("Pre-dispatch validation failures are marked before any server request", async () => {
  await expectPreDispatch(() => createAutomationRuleIfAbsent({ data: { name: "  " }, adminCapability: "cap" }),
    /requires a name/);
  await expectPreDispatch(() => createAutomationRuleIfAbsent({ data: validFields, adminCapability: " " }),
    /requires a current Admin Settings authorization/);
  await expectPreDispatch(() => updateAutomationRuleIfUnchanged({ record: null, nextFields: validFields, adminCapability: "cap" }),
    /no longer loaded/);
  await expectPreDispatch(() => updateAutomationRuleIfUnchanged({ record, nextFields: validFields, adminCapability: "" }),
    /requires a current Admin Settings authorization/);
  await expectPreDispatch(() => updateAutomationRuleIfUnchanged({ record: { id: "r1", enabled: "yes" }, nextFields: { enabled: false }, exactVersion: false, adminCapability: "cap" }),
    /enabled-state change could not be verified locally/);
  await expectPreDispatch(() => updateAutomationRuleIfUnchanged({ record, nextFields: { enabled: true }, exactVersion: false, adminCapability: "cap" }),
    /enabled-state change could not be verified locally/);
  await expectPreDispatch(() => deleteAutomationRuleIfUnchanged({ record: {}, adminCapability: "cap" }),
    /no longer loaded/);
  await expectPreDispatch(() => deleteAutomationRuleIfUnchanged({ record, adminCapability: null }),
    /requires a current Admin Settings authorization/);
});

test("Post-dispatch failures never carry the pre-dispatch marker", async () => {
  globalThis.__syntheticInvoke = () => { throw new Error("synthetic lost receipt"); };
  for (const attempt of [
    () => createAutomationRuleIfAbsent({ data: validFields, adminCapability: "cap" }),
    () => updateAutomationRuleIfUnchanged({ record, nextFields: validFields, adminCapability: "cap" }),
    () => updateAutomationRuleIfUnchanged({ record, nextFields: { enabled: false }, exactVersion: false, adminCapability: "cap" }),
    () => deleteAutomationRuleIfUnchanged({ record, adminCapability: "cap" }),
  ]) {
    await assert.rejects(attempt, error =>
      error?.automationPreDispatch !== true && /synthetic lost receipt/.test(error.message));
  }
  // A structured server rejection is also post-dispatch: the request arrived.
  globalThis.__syntheticInvoke = () => Promise.resolve({ data: { error: "server rejected" } });
  await assert.rejects(
    deleteAutomationRuleIfUnchanged({ record, adminCapability: "cap" }),
    error => error?.automationPreDispatch !== true && /server rejected/.test(error.message));
});

test("AdminSettings dispatches writes with the current stored capability, not the mount-time snapshot", () => {
  assert.match(pageSource, /const writeCapability = getStoredAdminSettingsCapability\(\);/);
  assert.equal((pageSource.match(/adminCapability: writeCapability/g) || []).length, 4);
});

test("Pre-dispatch save failures surface the real error and never fence the draft", () => {
  const save = pageSource.slice(pageSource.indexOf("  const handleSave = async () => {"),
    pageSource.indexOf("  const verifyUncertainAutomationSave = async () => {"));
  assert.match(save, /if \(writeDispatched && error\?\.automationPreDispatch !== true\)/);
  assert.match(save, /setAutomationSaveError\(error\?\.message \|\| "This automation could not be saved\."\)/);
});

test("Pre-dispatch operation failures release the write lock without an uncertain review", () => {
  const operation = pageSource.slice(pageSource.indexOf("  const runAutomationOperation = async (kind, rule) => {"),
    pageSource.indexOf("  const handleDelete = (rule) =>"));
  assert.match(operation, /if \(error\?\.automationPreDispatch === true\)/);
  assert.match(operation, /automationOperationRef\.current = null;\s*setAutomationOperation\(null\);\s*automationOperationEvidence\.current = null;\s*setAutomationOperationReview\(null\);\s*setAutomationSaveError\(error\?\.message/);
  assert.match(operation, /there is nothing to verify|nothing to verify/i);
});
