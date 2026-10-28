import assert from "node:assert/strict";
import {
  addRecentCustomerId,
  loadRecentCustomerIds,
  normalizeRecentCustomerIds,
  resolveRecentCustomers,
  saveRecentCustomerIds,
} from "../src/components/estimator/recentCustomerHistory.js";

assert.deepEqual(normalizeRecentCustomerIds([" a ", "b", "a", "", null, "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
assert.deepEqual(normalizeRecentCustomerIds(["a"], 0), []);
assert.deepEqual(normalizeRecentCustomerIds("not an array"), []);
assert.deepEqual(addRecentCustomerId(["a", "b", "a"], "b"), ["b", "a"]);
assert.deepEqual(addRecentCustomerId(["a", "b"], "c"), ["c", "a", "b"]);
assert.deepEqual(addRecentCustomerId(["a"], " "), ["a"]);

{
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(loadRecentCustomerIds(storage), []);
  assert.equal(saveRecentCustomerIds(["one", "two", "one"], storage), true);
  assert.deepEqual(loadRecentCustomerIds(storage), ["one", "two"]);
}

{
  const brokenStorage = {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { throw new Error("quota exceeded"); },
  };
  assert.deepEqual(loadRecentCustomerIds(brokenStorage), []);
  assert.equal(saveRecentCustomerIds(["one"], brokenStorage), false);
}

assert.deepEqual(
  resolveRecentCustomers(
    [{ id: "two", company_name: "Two" }, { id: "one", company_name: "One" }],
    ["one", "missing", "two"],
  ).map((customer) => customer.company_name),
  ["One", "Two"],
);

console.log("PASS recent customer history (15 assertions)");
