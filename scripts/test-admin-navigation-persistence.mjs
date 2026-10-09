import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getAdminNavigationStorageKey,
  readAdminNavigation,
  resolveAdminNavigation,
  sanitizeAdminNavigation,
  storeAdminNavigation,
} from "../src/components/admin/adminNavigationPersistence.js";

function mockStorage() {
  const data = new Map();
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
  };
}

test("Saved Admin tabs are isolated to a real user identity", () => {
  const one = getAdminNavigationStorageKey({ id: "USR-001", email: "user1@example.test" });
  const two = getAdminNavigationStorageKey({ id: "USR-002", email: "user2@example.test" });
  assert.notEqual(one, two);
  assert.equal(one, getAdminNavigationStorageKey({ id: "usr-001", email: "updated@example.test" }));
  assert.equal(getAdminNavigationStorageKey({ email: "ADMIN@EXAMPLE.TEST" }),
    getAdminNavigationStorageKey({ email: "admin@example.test" }));
  assert.equal(getAdminNavigationStorageKey(null), null);
  assert.equal(getAdminNavigationStorageKey({ full_name: "No confirmed identity" }), null);

  const storage = mockStorage();
  assert.equal(storeAdminNavigation(storage, one, { tab: "timeclock", subtab: "pto" }, true), true);
  assert.deepEqual(readAdminNavigation(storage, one, true), { tab: "timeclock", subtab: "pto" });
  assert.equal(readAdminNavigation(storage, two, true), null);
  assert.deepEqual(JSON.parse(storage.getItem(one)), { tab: "timeclock", subtab: "pto" });
});

test("Explicit Admin URLs override saved tab and nested subtab", () => {
  const saved = { tab: "backend", subtab: "monitoring" };
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams(""), saved, true), saved);
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("tab=timeclock&subtab=pto"), saved, true),
    { tab: "timeclock", subtab: "pto" });
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("tab=backend"), saved, true),
    { tab: "backend", subtab: "backup" });
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("subtab=pto"), saved, true), saved);
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("tab=not-real"), saved, true),
    { tab: "automations", subtab: null });
});

test("Revoked or unknown Admin sections never restore after role change", () => {
  const key = getAdminNavigationStorageKey({ id: "admin-test" });
  const storage = mockStorage();
  storeAdminNavigation(storage, key, { tab: "backend", subtab: "client_trash" }, true);
  const downgraded = readAdminNavigation(storage, key, false);
  assert.deepEqual(downgraded, { tab: "automations", subtab: null });
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("tab=backend&subtab=client_trash"), downgraded, false),
    { tab: "automations", subtab: null });
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams("tab=users"), downgraded, false),
    { tab: "users", subtab: null });
  // The next accessible view replaces the stale restricted preference.
  storeAdminNavigation(storage, key, downgraded, false);
  assert.deepEqual(readAdminNavigation(storage, key, true), { tab: "automations", subtab: null });
  assert.deepEqual(sanitizeAdminNavigation({ tab: "backend", subtab: "fake" }, true),
    { tab: "backend", subtab: "backup" });
  assert.deepEqual(sanitizeAdminNavigation({ tab: "users", subtab: "pto" }, true),
    { tab: "users", subtab: null });
});

test("Storage denial, malformed entries and missing identity fail open to safe default", () => {
  const denied = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(readAdminNavigation(denied, "test", true), null);
  assert.equal(storeAdminNavigation(denied, "test", { tab: "users" }, true), false);
  assert.equal(storeAdminNavigation(mockStorage(), null, { tab: "users" }, true), false);
  const storage = mockStorage();
  const key = "test";
  for (const raw of ["{", "null", "[]", '"invalid"']) {
    storage.setItem(key, raw);
    assert.equal(readAdminNavigation(storage, key, false), null);
  }
  assert.deepEqual(resolveAdminNavigation(new URLSearchParams(), null, false),
    { tab: "automations", subtab: null });
});

test("Admin portal persists only after unlock and uses saved nested destination", () => {
  const src = readFileSync("src/pages/AdminSettings.jsx", "utf8");
  assert.match(src, /!searchParams\.has\("tab"\) && isUnlocked/);
  assert.match(src, /readAdminNavigation\(browserStorage, navigationKey, isAdmin\)/);
  assert.match(src, /if \(isUnlocked && navigationKey\)/);
  assert.match(src, /storeAdminNavigation\(browserStorage, navigationKey,/);
  assert.match(src, /resolveAdminNavigation\(searchParams, savedNavigation, isAdmin\)/);
  assert.match(src, /selectedAdminTab === "timeclock" \? selectedAdminSubtab : "entries"/);
  assert.match(src, /selectedAdminTab === "backend" \? selectedAdminSubtab : "backup"/);
});
