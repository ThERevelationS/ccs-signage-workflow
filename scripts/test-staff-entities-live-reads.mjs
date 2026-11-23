import assert from "node:assert/strict";
import { build } from "esbuild";

const liveNames = ["BuilderProduct", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision"];
const names = [...liveNames, "Customer"];
const rows = Object.fromEntries(names.map((name) => [name, { id: `${name}-1`, updated_date: "v1" }]));
const calls = [];
globalThis.__liveReadInvoke = async (fn, body) => {
  calls.push({ fn, body });
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
  assert.equal((await staffEntities[entity].filter({ scope: "x" }, "sort_order", 50))[0].updated_date, "v2");
  assert.equal(calls.length - start, 2, `${entity} filter bypasses the client TTL`);

  const listStart = calls.length;
  assert.equal((await staffEntities[entity].list({ sort: "sort_order", limit: 50 })).items[0].updated_date, "v2");
  rows[entity].updated_date = "v3";
  assert.equal((await staffEntities[entity].list({ sort: "sort_order", limit: 50 })).items[0].updated_date, "v3");
  assert.equal(calls.length - listStart, 2, `${entity} paged list bypasses the client TTL`);

  const flightStart = calls.length;
  const [first, second] = await Promise.all([
    staffEntities[entity].filter({ scope: "flight" }),
    staffEntities[entity].filter({ scope: "flight" }),
  ]);
  assert.equal(first[0].updated_date, "v3");
  assert.equal(second[0].updated_date, "v3");
  assert.equal(calls.length - flightStart, 1, `${entity} concurrent requests remain coalesced`);
}

let start = calls.length;
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
assert.ok(calls.every((call) => call.fn === "staffDataRead"));
console.log("PASS staffEntities live Builder reads: filter, paged list, in-flight dedupe, Customer TTL, point reads");
