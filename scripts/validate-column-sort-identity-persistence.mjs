import assert from "node:assert/strict";
import {
  DEFAULT_COLUMN_SORT_CONFIG,
  persistColumnSortState,
  readColumnSortConfig,
  resolveColumnSortState,
  updateColumnSortState,
} from "../src/components/shared/columnSortPersistence.mjs";
import { readFileSync } from "node:fs";

const backing = new Map();
const storage = {
  getItem(key) {
    return backing.has(key) ? backing.get(key) : null;
  },
  setItem(key, value) {
    backing.set(key, String(value));
  },
};

const guestKey = "salesPipeline_sort_guest";
const userAKey = "salesPipeline_sort_a@example.com";
const userBKey = "salesPipeline_sort_b@example.com";

const guestConfig = {
  key: "sales_rep",
  direction: "asc",
  customFilter: { filterType: "selected", selectedValues: ["Carl"] },
};
const userAConfig = {
  key: "estimate_amount",
  direction: "desc",
  customFilter: { filterType: "range", numberRange: { from: 1000, to: 5000 } },
};
const userBConfig = {
  key: "follow_up_date",
  direction: "asc",
  customFilter: null,
};

storage.setItem(guestKey, JSON.stringify(guestConfig));
storage.setItem(userAKey, JSON.stringify(userAConfig));
storage.setItem(userBKey, JSON.stringify(userBConfig));

const guestState = { storageKey: guestKey, config: readColumnSortConfig(guestKey, storage) };
assert.deepEqual(guestState.config, guestConfig, "Guest state should load its own saved filter.");

const resolvedA = resolveColumnSortState(guestState, userAKey, storage);
assert.equal(resolvedA.storageKey, userAKey, "Identity transition should bind state to User A's key.");
assert.deepEqual(resolvedA.config, userAConfig, "Identity transition should load User A's saved state, not keep guest state.");

const beforeA = storage.getItem(userAKey);
assert.equal(
  persistColumnSortState(guestState, userAKey, storage),
  false,
  "A stale prior-identity state must never persist into the new identity key.",
);
assert.equal(storage.getItem(userAKey), beforeA, "User A's saved state must remain untouched during the transition render.");

const updatedA = updateColumnSortState(
  guestState,
  userAKey,
  (current) => ({ ...current, direction: "asc" }),
  storage,
);
assert.equal(updatedA.storageKey, userAKey, "An interaction during transition must target the current identity.");
assert.equal(updatedA.config.key, userAConfig.key, "Transition-time interaction must start from the current identity's stored config.");
assert.equal(updatedA.config.direction, "asc", "Transition-time interaction should apply only the requested change.");
assert.equal(persistColumnSortState(updatedA, userAKey, storage), true, "Current identity state should persist normally.");

const resolvedB = resolveColumnSortState(updatedA, userBKey, storage);
assert.deepEqual(resolvedB.config, userBConfig, "User A -> User B should load User B's own saved state.");
assert.equal(
  persistColumnSortState(updatedA, userBKey, storage),
  false,
  "User A's in-memory state must never overwrite User B during identity transition.",
);
assert.deepEqual(JSON.parse(storage.getItem(userBKey)), userBConfig, "User B's state must remain unchanged.");

const missing = readColumnSortConfig("missing", storage);
assert.deepEqual(missing, DEFAULT_COLUMN_SORT_CONFIG, "Missing identity state should fail closed to default sorting/filtering.");

storage.setItem("broken", "{not-json");
const originalConsoleError = console.error;
console.error = () => {};
const broken = readColumnSortConfig("broken", storage);
console.error = originalConsoleError;
assert.deepEqual(broken, DEFAULT_COLUMN_SORT_CONFIG, "Malformed saved state should fail closed to defaults.");

const source = readFileSync("src/components/shared/ColumnHeaderContextMenu.jsx", "utf8");
assert.match(source, /const \[sortState, setSortState\] = useState\(\(\) => \(\{[\s\S]*?storageKey,[\s\S]*?config: readColumnSortConfig\(storageKey\)/,
  "Hook state must remember which identity/storage key owns the config.");
assert.match(source, /if \(sortState\.storageKey === storageKey\) return;[\s\S]*?setSortState\(resolveColumnSortState\(sortState, storageKey\)\)/,
  "Hook must reload when the authenticated storage key changes.");
assert.match(source, /persistColumnSortState\(sortState, storageKey\)/,
  "Hook persistence must use the identity guard rather than blindly saving on storage-key changes.");
assert.match(source, /updateColumnSortState\(current, storageKey, nextConfig\)/,
  "Interactions during identity transition must resolve against the current identity before updating.");

console.log("Shared column sort/filter identity persistence: PASS.");
