// Behavioral checks: staffDataRead never returns AuthorizedEmail.hr_data to a
// staff caller other than the record's owner or an admin, and refuses hr_data
// as a filter/sort oracle for non-admins.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const output = await build({
  entryPoints: ["base44/functions/staffDataRead/entry.ts"], bundle: true, write: false,
  format: "esm", platform: "neutral",
  plugins: [{ name: "mock-boundaries", setup(b) {
    b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: "sdk", namespace: "mock" }));
    b.onResolve({ filter: /fleetStaffSession\.ts$/ }, () => ({ path: "session", namespace: "mock" }));
    b.onResolve({ filter: /entityRateLimitRetry\.ts$/ }, () => ({ path: "retry", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ loader: "js", contents:
      path === "sdk" ? "export const createClientFromRequest = () => globalThis.staffReadFixture;"
      : path === "session" ? "export const resolveFleetStaffUser = async (_b, t) => globalThis.staffReadUsers[t] || null;"
      : "export const withEntityRateLimitRetry = (c) => c;" }));
  } }],
});
let handler;
globalThis.Deno = { serve: (fn) => { handler = fn; } };
await import("data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64"));

const rows = [
  { id: "a", email: "Sam@ccs.test", full_name: "Sam", role: "user", password_hash: "x", hr_data: { date_of_birth: "1990-01-01" } },
  { id: "b", email: "boss@ccs.test", full_name: "Boss", role: "admin", password_hash: "y", hr_data: { address: "1 Main St" } },
];
const queries = [];
globalThis.staffReadUsers = {
  sam: { id: "a", email: "sam@ccs.test", role: "user" },
  admin: { id: "b", email: "boss@ccs.test", role: "admin" },
};
globalThis.staffReadFixture = { asServiceRole: { entities: { AuthorizedEmail: {
  list: async () => structuredClone(rows),
  filter: async (q) => { queries.push(q); return structuredClone(rows); },
  get: async (id) => structuredClone(rows.find((r) => r.id === id) || null),
} } } };

let n = 0;
const call = async (body) => {
  // Distinct `limit` per call keeps each request out of the gateway's read cache.
  const res = await handler(new Request("http://x", { method: "POST",
    body: JSON.stringify({ entity: "AuthorizedEmail", limit: 100 + (++n), ...body }) }));
  return { status: res.status, body: await res.json() };
};

test("non-admin list sees hr_data only on their own row", async () => {
  const { status, body } = await call({ session_token: "sam" });
  assert.equal(status, 200);
  const own = body.items.find((r) => r.id === "a");
  const other = body.items.find((r) => r.id === "b");
  assert.deepEqual(own.hr_data, { date_of_birth: "1990-01-01" });
  assert.ok(!("hr_data" in other), "coworker hr_data must be stripped");
  assert.ok(body.items.every((r) => !("password_hash" in r)));
});

test("non-admin get of another user's record strips hr_data", async () => {
  const { body } = await call({ session_token: "sam", id: "b" });
  assert.ok(!("hr_data" in body.item));
  assert.equal(body.item.full_name, "Boss");
});

test("admin still sees every hr_data", async () => {
  const { body } = await call({ session_token: "admin" });
  assert.ok(body.items.every((r) => r.hr_data && !("password_hash" in r)));
});

test("non-admin cannot filter or sort on hr_data", async () => {
  for (const query of [
    { hr_data: { date_of_birth: "1990-01-01" } },
    { "hr_data.date_of_birth": "1990-01-01" },
    { "hr_data.date_of_birth": { $regex: "^19" } },
    { password_hash: "x" },
  ]) {
    const before = queries.length;
    const { status } = await call({ session_token: "sam", query });
    assert.equal(status, 400, JSON.stringify(query));
    assert.equal(queries.length, before, "refused filter must not reach the entity");
  }
  for (const sort of ["hr_data", "-hr_data.date_of_birth"]) {
    assert.equal((await call({ session_token: "sam", sort })).status, 400, sort);
  }
  assert.equal((await call({ session_token: "admin", query: { "hr_data.city": "Cincinnati" } })).status, 200);
});

test("cached staff reads are not shared across callers", async () => {
  const body = { entity: "AuthorizedEmail", limit: 7 };
  const as = async (token) => (await (await handler(new Request("http://x", { method: "POST",
    body: JSON.stringify({ ...body, session_token: token }) }))).json()).items;
  globalThis.staffReadUsers.boss2 = { id: "b", email: "boss@ccs.test", role: "user" };
  const samView = await as("sam");
  const bossView = await as("boss2");
  assert.ok(samView.find((r) => r.id === "a").hr_data);
  assert.ok(!("hr_data" in bossView.find((r) => r.id === "a")), "Sam's cached row must not leak to another caller");
  console.log("PASS staff-read-hr-data");
});
