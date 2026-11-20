import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const names = ["PartTemplate", "QuickProduct", "QuickProductCategory"];
const rows = Object.fromEntries(names.map((name) => [name, [
  { id: "alice", owner_email: " Alice@example.test ", product_group: "my", name: "Alice" },
  { id: "bob", owner_email: "bob@example.test", product_group: "my", name: "Bob" },
  { id: "global", owner_email: "bob@example.test", product_group: "global", name: "Shared" },
  { id: "legacy", created_by_id: "old-platform-user", product_group: "my", name: "Legacy" },
]]));
let handler;
let readCalls = 0;
const readArgs = [];
const entities = Object.fromEntries(names.map((name) => [name, {
  async get(id) {
    const row = rows[name].find((item) => item.id === id);
    if (!row) throw Object.assign(new Error("not found"), { status: 404 });
    return { ...row };
  },
  async read(query, sortOrOptions, limit, skip) {
    readCalls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const options = sortOrOptions && typeof sortOrOptions === "object" ? sortOrOptions : null;
    const start = options?.skip || skip || 0;
    const size = options?.limit || limit || 100;
    const matching = query ? rows[name].filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)) : rows[name];
    readArgs.push({ name, query, start, size, sort: options?.sort || sortOrOptions, fields: options?.fields });
    const page = matching.slice(start, start + size).map((row) => options?.fields
      ? Object.fromEntries(options.fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]))
      : { ...row });
    return options ? { items: page, next_cursor: start + size < matching.length ? "next" : null, has_more: start + size < matching.length } : page;
  },
  async list(sortOrOptions, limit, skip) { return this.read(null, sortOrOptions, limit, skip); },
  async filter(query, sortOrOptions, limit, skip) {
    return this.read(query, sortOrOptions, limit, skip);
  },
  async count() { return rows[name].length; },
}]));
const libraryModule = { exports: {} };
runInNewContext(transformSync(readFileSync("base44/shared/libraryFilteredRead.ts", "utf8"), {
  loader: "ts", format: "cjs",
}).code, { module: libraryModule, exports: libraryModule.exports });
const loaderModule = { exports: {} };
runInNewContext(transformSync(readFileSync("src/lib/loadAllEntityRows.js", "utf8"), {
  loader: "js", format: "cjs",
}).code, { module: loaderModule, exports: loaderModule.exports, console, setTimeout });
const imports = {
  "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => ({ asServiceRole: { entities } }) },
  "../../shared/fleetStaffSession.ts": { resolveFleetStaffUser: async (_sdk, token) => token === "admin"
    ? { email: "admin@example.test", role: "admin" }
    : { email: `${token}@example.test`, role: "staff" } },
  "../../shared/entityRateLimitRetry.ts": { withEntityRateLimitRetry: (sdk) => sdk, entityCallIsolateStats: () => ({ calls: 0 }) },
  "../../shared/libraryFilteredRead.ts": libraryModule.exports,
};
const source = transformSync(readFileSync("base44/functions/staffDataRead/entry.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
runInNewContext(source, {
  require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
  module: { exports: {} }, exports: {}, Deno: { serve: (fn) => { handler = fn; } }, Response, TextEncoder, console, setTimeout,
});
async function invoke(body, token = "alice") {
  const result = await handler(new Request("https://example.test", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, session_token: token }),
  }));
  return { status: result.status, body: await result.json() };
}
const ids = (items) => items.map((row) => row.id).join(",");
for (const entity of names) {
  const [alice, bob] = await Promise.all([invoke({ entity }), invoke({ entity }, "bob")]);
  assert.equal(ids(alice.body.items), "alice,global,legacy");
  assert.equal(ids(bob.body.items), "bob,global,legacy");
  assert.equal((await invoke({ entity, id: "bob", cursor: "point-synthetic" })).status, 404);
  assert.equal((await invoke({ entity, id: "alice", cursor: "point-synthetic" })).status, 200);
  assert.equal((await invoke({ entity, id: "bob" }, "admin")).status, 200);
  assert.equal(ids((await invoke({ entity }, "admin")).body.items), "alice,bob,global,legacy");
  const batch = await invoke({ requests: [{ entity }, { entity, id: "bob" }] });
  assert.equal(ids(batch.body.results[0].body.items), "alice,global,legacy");
  assert.equal(batch.body.results[1].status, 404);
  const entityBatch = await invoke({ entities: [{ entity }] }, "bob");
  assert.equal(ids(entityBatch.body.entities[entity]), "bob,global,legacy");
  const projected = await invoke({ entity, fields: ["id", "name"], limit: 2 });
  assert.equal(ids(projected.body.items), "alice,global");
  assert.equal(projected.body.truncated, true);
  assert.equal(projected.body.has_more, true);
  assert.equal(projected.body.next_cursor, null);
  assert.equal(Object.hasOwn(projected.body.items[0], "owner_email"), false);
  assert.equal(Object.hasOwn(projected.body.items[0], "product_group"), false);
  assert.equal((await invoke({ entity, count: true })).status, 400);
  assert.equal((await invoke({ entity, count: true }, "admin")).body.count, 4);
}
for (const entity of names) {
  rows[entity] = [
    ...Array.from({ length: 1001 }, (_, i) => ({ id: `hidden-${i}`, owner_email: "bob@example.test", product_group: "my", kind: "match" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `visible-${i}`, owner_email: "alice@example.test", product_group: "my", kind: "match" })),
    { id: "different", owner_email: "alice@example.test", product_group: "my", kind: "other" },
  ];
  const request = { entity, query: { kind: "match" }, sort: "id", limit: 2 };
  const listed = await invoke({ entity, limit: 2 });
  assert.equal(ids(listed.body.items), "visible-0,visible-1");
  assert.equal(listed.body.has_more, true);
  assert.equal(ids((await invoke({ entity, limit: 2, skip: 2 })).body.items), "visible-2,different");
  const start = readArgs.length;
  const first = await invoke(request);
  assert.equal(ids(first.body.items), "visible-0,visible-1");
  assert.equal(first.body.returned, 2);
  assert.equal(first.body.has_more, true);
  assert.equal(first.body.truncated, true);
  assert.equal(first.body.next_cursor, null);
  assert.deepEqual(readArgs.slice(start).map((arg) => [arg.start, arg.size, arg.sort]), [[0, 1000, "id"], [1000, 1000, "id"]]);
  const second = await invoke({ ...request, skip: 2 });
  assert.equal(ids(second.body.items), "visible-2");
  assert.equal(second.body.has_more, false);
  assert.equal(second.body.truncated, false);
  assert.equal(second.body.next_cursor, null);
  const exact = await invoke({ ...request, limit: 3 });
  assert.equal(ids(exact.body.items), "visible-0,visible-1,visible-2");
  assert.equal(exact.body.has_more, false);
  const projected = await invoke({ ...request, fields: ["id"] });
  assert.equal(ids(projected.body.items), "visible-0,visible-1");
  assert.equal(Object.hasOwn(projected.body.items[0], "owner_email"), false);
  assert.equal(Object.hasOwn(projected.body.items[0], "product_group"), false);
  const facade = {
    async filter(query, sort, limit, skip) {
      const result = await invoke({ entity, query, sort, limit, skip });
      if (result.status !== 200) throw new Error(result.body.error);
      return result.body.items;
    },
  };
  const loaded = await loaderModule.exports.loadAllEntityRows({ entity: facade, query: { kind: "match" }, sort: "id", pageSize: 2 });
  assert.equal(ids(loaded), "visible-0,visible-1,visible-2");
  const batch = await invoke({ requests: [request, { ...request, skip: 2 }] });
  assert.equal(ids(batch.body.results[0].body.items), "visible-0,visible-1");
  assert.equal(ids(batch.body.results[1].body.items), "visible-2");
  const entityBatch = await invoke({ entities: [request] });
  assert.equal(ids(entityBatch.body.entities[entity]), "visible-0,visible-1");
  assert.equal((await invoke({ ...request, cursor: "opaque" })).status, 400);
  assert.equal((await invoke({ requests: [{ ...request, cursor: "opaque" }] })).body.results[0].status, 400);
  const admin = await invoke({ ...request, fields: ["id"], cursor: "opaque" }, "admin");
  assert.equal(ids(admin.body.items), "hidden-0,hidden-1");
  assert.equal(admin.body.next_cursor, "next");
  assert.equal(readArgs.at(-1).size, 2);
  rows[entity] = Array.from({ length: 5000 }, (_, i) => ({ id: `row-${i}`, owner_email: "bob@example.test", product_group: "my" }));
  const cap = await invoke({ entity });
  assert.equal(cap.status, 413);
  assert.equal(cap.body.error, "This library is too large to filter; ask an admin.");
  const capBatch = await invoke({ requests: [{ entity }] });
  assert.equal(capBatch.body.results[0].status, 413);
  assert.equal((await invoke({ entities: [{ entity }] })).body.errors[entity].status, 413);
  rows[entity].pop();
  assert.equal((await invoke({ entity })).status, 200);
}
const before = readCalls;
await invoke({ entity: "QuickProduct" });
rows.QuickProduct = [{ id: "shared", owner_email: "bob@example.test", product_group: "global" }];
assert.equal(ids((await invoke({ entity: "QuickProduct" })).body.items), "shared");
rows.QuickProduct[0].product_group = "my";
const afterVisibilityChange = await invoke({ entity: "QuickProduct" });
assert.equal(ids(afterVisibilityChange.body.items), "");
assert.equal(readCalls - before, 7);
console.log("PASS staffDataRead library visibility, filtered pagination, batches, cap, projections and counts");
