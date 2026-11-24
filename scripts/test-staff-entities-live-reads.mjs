import assert from "node:assert/strict";
import { build } from "esbuild";

const liveNames = ["BuilderProduct", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision"];
const names = [...liveNames, "Customer"];
const rows = Object.fromEntries(names.map((name) => [name, { id: `${name}-1`, updated_date: "v1" }]));
const calls = [];
globalThis.__liveReadInvoke = async (fn, body) => {
  calls.push({ fn, body });
  if (fn === "estimatorProjectWrite" && body.op !== "filter") {
    rows[body.entity].updated_date = `${body.op}-version`;
    return { result: { updated: 1, deleted: 1 }, record: { ...rows[body.entity] }, deleted: true };
  }
  if (Array.isArray(body.entities)) {
    return { entities: Object.fromEntries(body.entities.map(({ entity }) => [entity, [{ ...rows[entity] }]])) };
  }
  if (body.id) return { item: { ...rows[body.entity] } };
  return { items: [{ ...rows[body.entity] }] };
};
const stubs = {
  "@/components/fleet/fleetInvoke": "export const invokeFleet=(...args)=>globalThis.__liveReadInvoke(...args); export const isFleetCoolingDown=()=>false;",
  "@/components/auth/EmailGate": "export const getSessionToken=()=> 'synthetic';",
  "@/api/rateLimitCooldown": "export const noteRateLimit=()=>{};",
};
const bundle = await build({
  entryPoints: ["src/components/staff/staffEntities.js"], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "live-read-stubs",
    setup(context) {
      context.onResolve({ filter: /^@\// }, ({ path }) => {
        if (!stubs[path]) throw new Error(`Unexpected import ${path}`);
        return { path, namespace: "stub" };
      });
      context.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({ contents: stubs[path], loader: "js" }));
    },
  }],
});
const { staffEntities } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
for (const entity of liveNames) {
  const start = calls.length;
  assert.equal((await staffEntities[entity].filter({ scope: "x" }, "sort_order", 50))[0].updated_date, "v1");
  rows[entity].updated_date = "v2";
  assert.equal((await staffEntities[entity].filter({ scope: "x" }, "sort_order", 50))[0].updated_date, "v1");
  assert.equal(calls.length - start, 1, `${entity} filter uses the client TTL`);

  const listStart = calls.length;
  assert.equal((await staffEntities[entity].list({ sort: "sort_order", limit: 50 })).items[0].updated_date, "v2");
  rows[entity].updated_date = "v3";
  assert.equal((await staffEntities[entity].list({ sort: "sort_order", limit: 50 })).items[0].updated_date, "v2");
  assert.equal(calls.length - listStart, 1, `${entity} paged list uses the client TTL`);

  const flightStart = calls.length;
  const [first, second] = await Promise.all([
    staffEntities[entity].filter({ scope: "flight" }),
    staffEntities[entity].filter({ scope: "flight" }),
  ]);
  assert.equal(first[0].updated_date, "v3");
  assert.equal(second[0].updated_date, "v3");
  assert.equal(calls.length - flightStart, 1, `${entity} concurrent requests remain coalesced`);
}

for (const [method, args] of [
  ["updateMany", [{ id: "BuilderPart-1" }, { $set: { value: 1 } }]],
  ["create", [{ value: 1 }]],
  ["deleteMany", [{ id: "BuilderPart-1" }]],
  ["update", ["BuilderPart-1", { value: 1 }]],
  ["delete", ["BuilderPart-1"]],
]) {
  const query = { scope: `mutation-${method}` };
  const listOptions = { sort: `mutation-${method}` };
  const before = rows.BuilderPart.updated_date;
  assert.equal((await staffEntities.BuilderPart.filter(query))[0].updated_date, before);
  assert.equal((await staffEntities.BuilderPart.list(listOptions)).items[0].updated_date, before);
  const start = calls.length;
  await staffEntities.BuilderPart[method](...args);
  assert.equal((await staffEntities.BuilderPart.filter(query))[0].updated_date, `${method}-version`);
  assert.equal(calls.length - start, 2, `${method} busts the BuilderPart client cache`);
  const listStart = calls.length;
  assert.equal((await staffEntities.BuilderPart.list(listOptions)).items[0].updated_date, `${method}-version`);
  assert.equal(calls.length - listStart, 1, `${method} busts the BuilderPart list cache`);
}
let start = calls.length;
const fresh = await staffEntities.BuilderPart.filterFresh({ scope: "x" }, "sort_order", 50);
assert.equal(fresh[0].updated_date, "delete-version");
assert.equal(calls.length - start, 1, "filterFresh bypasses client cache");
assert.equal(calls.at(-1).fn, "estimatorProjectWrite");
assert.equal(calls.at(-1).body.op, "filter");

start = calls.length;
assert.equal((await staffEntities.Customer.filter({ scope: "ordinary" }))[0].updated_date, "v1");
rows.Customer.updated_date = "v2";
assert.equal((await staffEntities.Customer.filter({ scope: "ordinary" }))[0].updated_date, "v1");
assert.equal(calls.length - start, 1, "Customer filter still hits client TTL");
start = calls.length;
assert.equal((await staffEntities.Customer.list()).at(0).updated_date, "v2");
rows.Customer.updated_date = "v3";
assert.equal((await staffEntities.Customer.list()).at(0).updated_date, "v2");
assert.equal(calls.length - start, 1, "Customer list still hits client TTL");
start = calls.length;
assert.equal((await staffEntities.Customer.get("Customer-1")).updated_date, "v3");
rows.Customer.updated_date = "v4";
assert.equal((await staffEntities.Customer.get("Customer-1")).updated_date, "v4");
assert.equal(calls.length - start, 2, "point reads still hit transport");
assert.notEqual(calls.at(-2).body.cursor, calls.at(-1).body.cursor, "point read cursors remain unique");
assert.ok(calls.every((call) => ["staffDataRead", "estimatorProjectWrite"].includes(call.fn)));
console.log("PASS staffEntities Builder client cache, all facade write invalidations, filterFresh, Customer TTL, point reads");
