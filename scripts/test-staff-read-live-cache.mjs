import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const liveNames = ["BuilderProduct", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision"];
const names = [...liveNames, "Customer"];
const rows = Object.fromEntries(names.map((name) => [name, { id: `${name}-1`, scope: "match", updated_date: "v1" }]));
const calls = Object.fromEntries(names.map((name) => [name, { list: 0, filter: 0, get: 0 }]));
const entities = Object.fromEntries(names.map((name) => [name, {
  async get(id) {
    calls[name].get++;
    return rows[name].id === id ? { ...rows[name] } : null;
  },
  async list() {
    calls[name].list++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return [{ ...rows[name] }];
  },
  async filter(query) {
    calls[name].filter++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Object.entries(query || {}).every(([key, value]) => rows[name][key] === value) ? [{ ...rows[name] }] : [];
  },
}]));
let handler;
const imports = {
  "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => ({ asServiceRole: { entities } }) },
  "../../shared/fleetStaffSession.ts": { resolveFleetStaffUser: async () => ({ email: "staff@example.test", role: "admin" }) },
  "../../shared/entityRateLimitRetry.ts": { withEntityRateLimitRetry: (sdk) => sdk, entityCallIsolateStats: () => ({ calls: 0 }) },
  "../../shared/libraryFilteredRead.ts": { loadVisibleLibraryRows: () => { throw new Error("Unexpected library read"); } },
};
const source = transformSync(readFileSync("base44/functions/staffDataRead/entry.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
runInNewContext(source, {
  require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
  module: { exports: {} }, exports: {}, Deno: { serve: (fn) => { handler = fn; } }, Response, TextEncoder, console, setTimeout,
});
async function invoke(body) {
  const response = await handler(new Request("https://example.test", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, session_token: "synthetic" }),
  }));
  assert.equal(response.status, 200);
  return response.json();
}

for (const entity of liveNames) {
  const request = { entity, query: { scope: "match" }, limit: 10 };
  assert.equal((await invoke(request)).items[0].updated_date, "v1");
  rows[entity].updated_date = "v2";
  assert.equal((await invoke(request)).items[0].updated_date, "v2", `${entity} sequential filter is fresh`);
  assert.equal(calls[entity].filter, 2);

  assert.equal((await invoke({ entity })).items[0].updated_date, "v2");
  rows[entity].updated_date = "v3";
  assert.equal((await invoke({ entity })).items[0].updated_date, "v3", `${entity} sequential list is fresh`);
  assert.equal(calls[entity].list, 2);

  assert.equal((await invoke({ requests: [request] })).results[0].body.items[0].updated_date, "v3");
  rows[entity].updated_date = "v4";
  assert.equal((await invoke({ requests: [request] })).results[0].body.items[0].updated_date, "v4");
  assert.equal((await invoke({ entities: [request] })).entities[entity][0].updated_date, "v4");
  rows[entity].updated_date = "v5";
  assert.equal((await invoke({ entities: [request] })).entities[entity][0].updated_date, "v5");

  const before = calls[entity].filter;
  const [first, second] = await Promise.all([invoke(request), invoke(request)]);
  assert.equal(first.items[0].updated_date, "v5");
  assert.equal(second.items[0].updated_date, "v5");
  assert.equal(calls[entity].filter - before, 1, `${entity} concurrent identical reads share one call`);
}

const customerFilter = { entity: "Customer", query: { scope: "match" }, limit: 10 };
assert.equal((await invoke(customerFilter)).items[0].updated_date, "v1");
rows.Customer.updated_date = "v2";
assert.equal((await invoke(customerFilter)).items[0].updated_date, "v1", "non-Builder filter keeps TTL cache");
assert.equal(calls.Customer.filter, 1);
assert.equal((await invoke({ entity: "Customer" })).items[0].updated_date, "v2");
rows.Customer.updated_date = "v3";
assert.equal((await invoke({ entity: "Customer" })).items[0].updated_date, "v2", "non-Builder list keeps TTL cache");
assert.equal(calls.Customer.list, 1);
const point = { entity: "Customer", id: "Customer-1" };
assert.equal((await invoke(point)).item.updated_date, "v3");
rows.Customer.updated_date = "v4";
assert.equal((await invoke(point)).item.updated_date, "v4", "point reads remain uncached");
assert.equal(calls.Customer.get, 2);

console.log("PASS staffDataRead live Builder caches: single, both batches, in-flight dedupe, Customer TTL, point reads");
