import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Every Admin write that requires the Admin Settings capability must read the
// current stored authorization at dispatch time. A prop captured when the page
// mounted can silently go stale while the tab sits open, carrying an expired
// credential to the server. The prop is gone entirely so the stale-snapshot
// pattern cannot be reintroduced.
const pageSource = readFileSync("src/pages/AdminSettings.jsx", "utf8");
const emailGroups = readFileSync("src/components/admin/EmailGroupsManager.jsx", "utf8");
const pto = readFileSync("src/components/admin/PTOManagement.jsx", "utf8");
const calendar = readFileSync("src/components/admin/AdminCalendarSettings.jsx", "utf8");

test("No child panel receives or forwards a mount-time capability snapshot", () => {
  for (const [name, source] of [["PTOManagement", pto], ["EmailGroupsManager", emailGroups]]) {
    assert.match(source, new RegExp(`export default function ${name}\\(\\)`), `${name} must not take a capability prop`);
  }
  assert.match(calendar, /export default function AdminCalendarSettings\(\)/);
  assert.match(calendar, /function AdminEventFormDialog\(\{ event, isOpen, onClose, onSaved \}\)/);
  for (const name of ["PTOManagement", "AdminCalendarSettings", "EmailGroupsManager"]) {
    assert.match(pageSource, new RegExp(`<${name} />`), `AdminSettings must render ${name} without a capability prop`);
  }
  assert.doesNotMatch(pageSource, /adminCapability=\{adminCapability\}/,
    "AdminSettings must not hold a capability state snapshot to pass down");
});

test("Each panel resolves the current stored capability inside every write handler", () => {
  const panels = [
    ["EmailGroupsManager", emailGroups, ["handleSave", "handleDelete"]],
    ["PTOManagement", pto, ["handleSavePolicy", "handleDeletePolicy", "assignPolicyToUser"]],
    ["AdminCalendarSettings", calendar, ["handleDeleteEvent", "handleSave"]],
  ];
  for (const [name, source, handlers] of panels) {
    assert.match(source, /import \{ getStoredAdminSettingsCapability \} from "@\/components\/auth\/EmailGate"/,
      `${name} must import the fresh-capability reader`);
    for (const handler of handlers) {
      const start = source.indexOf(`const ${handler} = async`);
      assert.ok(start >= 0, `${name}.${handler} must exist`);
      const body = source.slice(start, start + 4000);
      assert.match(body, /const writeCapability = getStoredAdminSettingsCapability\(\);/,
        `${name}.${handler} must read the current stored capability before dispatching`);
      assert.match(body, /adminCapability: writeCapability/,
        `${name}.${handler} must dispatch with the fresh read, not a snapshot`);
      assert.doesNotMatch(body, /adminCapability,\s*\n?\s*label:/,
        `${name}.${handler} must not forward a bare prop into a write`);
    }
  }
});

test("The persistence helpers still reject empty capabilities before dispatch", () => {
  const emailGroupPersistence = readFileSync("src/components/admin/emailGroupPersistence.js", "utf8");
  const ptoPersistence = readFileSync("src/components/timeclock/ptoPersistence.js", "utf8");
  const calendarPersistence = readFileSync("src/components/calendar/calendarEventPersistence.js", "utf8");
  for (const source of [emailGroupPersistence, ptoPersistence, calendarPersistence]) {
    assert.match(source, /admin_capability: require(?:Admin)?Capability\(adminCapability, label\)/);
  }
});

test("The browser fixture exercises dispatch-time freshness end to end", () => {
  const browser = readFileSync("scripts/test-admin-navigation-browser.mjs", "utf8");
  assert.match(browser, /function requireCapability\(adminCapability,label\)/,
    "mockEmailGroupPersistence must mirror the real helper's pre-dispatch guard");
  assert.match(browser, /__adminEmailGroupWriteCalls/,
    "the mock must record the capability forwarded across the helper boundary");
  assert.match(browser, /forwards the current stored capability at write time/);
  assert.match(browser, /capability expiring mid-draft fails before dispatch and keeps the draft/);
  assert.match(browser, /__adminCapabilityExpired=true/,
    "the mid-draft expiry check must expire storage after the dialog opened");
});
