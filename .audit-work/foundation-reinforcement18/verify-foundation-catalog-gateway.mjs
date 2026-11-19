import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const sources = JSON.parse(fs.readFileSync(DIR + "schema-gate-current-source.json", "utf8"));
const front = JSON.parse(fs.readFileSync(DIR + "catalog-auth-current-source.json", "utf8"));
const source = sources.files.find(file => file.path === "base44/functions/staffEntityWrite/entry.ts").content;
const facade = front.files.find(file => file.path === "src/components/staff/staffEntities.js").content;
const mode = process.argv[2] || "baseline";
assert.ok(["baseline", "candidate"].includes(mode));
const target = "base44/functions/staffEntityWrite/entry.ts";
const candidateFile = DIR + "catalog-gateway-candidate-entry.ts";
const actual = mode === "baseline" ? source : fs.readFileSync(candidateFile, "utf8");
const clone = structuredClone;
const initial = {
  id: "synthetic-catalog", updated_date: "2026-11-07T12:00:00.000Z",
  material_type: "rebar", material_name: "Synthetic rebar", cost_per_unit: 2, unit: "lf",
};
let handler;
globalThis.Deno = { serve: fn => { handler = fn; } };
globalThis.fetch = () => { throw Error("Offline proof forbids network"); };
globalThis.__catalogGatewayEnv = { user: null, row: clone(initial), calls: [], invokes: [] };
const sdk = `
export function createClientFromRequest() {
  const env=globalThis.__catalogGatewayEnv;
  const entity={
    async get(id){env.calls.push(["get",id]);return env.row?.id===id?structuredClone(env.row):null;},
    async create(data){env.calls.push(["create",structuredClone(data)]);env.row={...structuredClone(data),id:"synthetic-created",updated_date:"synthetic-new-version"};return structuredClone(env.row);},
    async updateMany(query,update){env.calls.push(["updateMany",structuredClone(query),structuredClone(update)]);
      if(env.row?.id!==query.id||env.row?.updated_date!==query.updated_date)return {updated:0};
      env.row={...env.row,...structuredClone(update.$set),updated_date:"synthetic-next-version"};return {updated:1};},
    async deleteMany(query){env.calls.push(["deleteMany",structuredClone(query)]);
      const matched=env.row&&Object.entries(query).every(([k,v])=>env.row[k]===v);
      if(matched)env.row=null;return {deleted:matched?1:0};},
    async delete(){throw Error("Unconditional delete forbidden");},
    async update(){throw Error("Unconditional update forbidden");},
  };
  return {asServiceRole:{entities:new Proxy({},{get(_,name){
    if(name!=="FoundationInventory")throw Error("Unexpected entity "+String(name));return entity;
  }})}};
}`;
const stubs = {
  "npm:@base44/sdk@0.8.25": sdk,
  "../../shared/signShopSession.ts": `export async function authenticateSignShopSession(_,token){
    return token==="synthetic-session"?globalThis.__catalogGatewayEnv.user:null;}`,
  "../../shared/entityRateLimitRetry.ts": `export const withEntityRateLimitRetry=client=>client;`,
};
const bundled = await build({
  stdin: { contents: actual, sourcefile: target, loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false, metafile: true,
  plugins: [{ name: "offline-fresh-gateway", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      assert.ok(Object.hasOwn(stubs, args.path), "Unexpected backend dependency: " + args.path);
      return { path: args.path, namespace: "offline" };
    });
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }],
});
await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
assert.equal(typeof handler, "function");
globalThis.__catalogGatewayInvoke = async (name, data) => {
  assert.equal(name, "staffEntityWrite");
  const env = globalThis.__catalogGatewayEnv;
  env.invokes.push({ name, data: clone(data) });
  const response = await handler(new Request("https://offline.invalid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, session_token: "synthetic-session" }),
  }));
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error), { status: response.status });
  return { status: response.status, data: body };
};
const facadeStubs = {
  "@/components/fleet/fleetInvoke": `export const invokeFleet=(...args)=>globalThis.__catalogGatewayInvoke(...args);
    export const isFleetCoolingDown=()=>false;`,
  "@/components/auth/EmailGate": `export const getSessionToken=()=>globalThis.__catalogGatewayEnv.user?"synthetic-session":"";`,
  "@/api/rateLimitCooldown": `export const noteRateLimit=()=>{throw Error("Unexpected rate limit");};`,
};
const shim = await build({
  stdin: { contents: facade, sourcefile: "src/components/staff/staffEntities.js", loader: "js" },
  bundle: true, platform: "node", format: "esm", write: false, metafile: true,
  plugins: [{ name: "offline-real-staff-facade", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      assert.ok(Object.hasOwn(facadeStubs, args.path), "Unexpected facade dependency: " + args.path);
      return { path: args.path, namespace: "offline" };
    });
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: facadeStubs[args.path], loader: "js" }));
  } }],
});
const { staffEntities } = await import("data:text/javascript;base64," + Buffer.from(shim.outputFiles[0].text).toString("base64"));
const entity = staffEntities.FoundationInventory;
const reset = role => {
  globalThis.__catalogGatewayEnv = {
    user: role ? { email: "synthetic@example.invalid", role } : null,
    row: clone(initial), calls: [], invokes: [],
  };
  return globalThis.__catalogGatewayEnv;
};
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
const operations = {
  create: () => entity.create({ material_type: "rebar", material_name: "Synthetic rebar", cost_per_unit: 2 }),
  updateMany: () => entity.updateMany({ id: initial.id, updated_date: initial.updated_date }, {
    $set: { material_name: "Synthetic edit", cost_per_unit: 2 },
  }),
  deleteMany: () => entity.deleteMany({ id: initial.id, updated_date: initial.updated_date }),
};
for (const [op, invoke] of Object.entries(operations)) {
  await check(`fresh page/facade ${op} reaches gateway and ${mode === "baseline" ? "rejects even admin" : "permits admin only"}`, async () => {
    const env = reset("admin");
    if (mode === "baseline") {
      await assert.rejects(invoke(), error => error.status === 403 && /cannot be written/.test(error.message));
      assert.deepEqual(env.calls, []); assert.deepEqual(env.row, initial);
    } else {
      await invoke();
      assert.equal(env.calls.filter(call => call[0] === op).length, 1);
      if (op === "create") assert.equal(env.row.id, "synthetic-created");
      if (op === "updateMany") assert.equal(env.row.material_name, "Synthetic edit");
      if (op === "deleteMany") assert.equal(env.row, null);
    }
    assert.equal(env.invokes.length, 1); assert.equal(env.invokes[0].data.entity, "FoundationInventory");
    assert.equal(env.invokes[0].data.op, op);
  });
}
await check("ordinary staff cannot mutate catalog even when bypassing UI controls", async () => {
  for (const invoke of Object.values(operations)) {
    const env = reset("user");
    await assert.rejects(invoke(), error => error.status === 403);
    assert.deepEqual(env.calls, []); assert.deepEqual(env.row, initial);
  }
});
await check("missing session fails before facade invoke and direct gateway returns401 with no entity access", async () => {
  const env = reset(null);
  await assert.rejects(operations.create(), /Sign-in required/);
  assert.deepEqual(env.invokes, []); assert.deepEqual(env.calls, []);
  const response = await handler(new Request("https://offline.invalid", {
    method: "POST", body: JSON.stringify({ entity: "FoundationInventory", op: "create" }),
  }));
  assert.equal(response.status, 401); assert.deepEqual(env.calls, []);
});
await check("unconditional and unsupported catalog operations stay denied for admin", async () => {
  const env = reset("admin");
  for (const [op, data] of [["update", { cost_per_unit: 4 }], ["delete", {}], ["bulkCreate", {}]]) {
    await assert.rejects(globalThis.__catalogGatewayInvoke("staffEntityWrite", {
      entity: "FoundationInventory", op, id: initial.id, data,
    }), error => error.status === 403);
  }
  assert.deepEqual(env.calls, []);
});
if (mode === "candidate") {
  await check("stale conditional updates report0 and never overwrite a newer catalog edit", async () => {
    const env = reset("admin");
    const result = await entity.updateMany({ id: initial.id, updated_date: "stale" }, { $set: { material_name: "Stale" } });
    assert.deepEqual(result, { updated: 0 }); assert.deepEqual(env.row, initial);
  });
  await check("facade conditional delete honors the loaded version and preserves newer catalog records", async () => {
    const env = reset("admin");
    const result = await entity.deleteMany({ id: initial.id, updated_date: "stale" });
    assert.deepEqual(result, { deleted: 0 }); assert.deepEqual(env.row, initial);
    assert.deepEqual(env.calls.find(call => call[0] === "deleteMany")[1], { id: initial.id, updated_date: "stale" });
    assert.equal(Object.hasOwn(env.invokes[0].data, "id"), false, "Existing facade contract must remain unchanged");
  });
  await check("catalog delete rejects conflicting envelope/query identities and malformed anchors before entity access", async () => {
    for (const payload of [
      { id: "different-record", query: { id: initial.id, updated_date: initial.updated_date } },
      { query: { id: {}, updated_date: initial.updated_date } },
      { query: { id: initial.id, updated_date: 123 } },
      { query: { id: initial.id, updated_date: " " } },
      { query: { id: " ", updated_date: initial.updated_date } },
      { query: [] },
    ]) {
      const env = reset("admin");
      await assert.rejects(globalThis.__catalogGatewayInvoke("staffEntityWrite", {
        entity: "FoundationInventory", op: "deleteMany", ...payload,
      }), error => error.status === 400);
      assert.deepEqual(env.calls, []); assert.deepEqual(env.row, initial);
    }
  });
  await check("catalog writes reject unanchored update/delete queries and nested operators before mutation", async () => {
    for (const payload of [
      { op: "updateMany", id: initial.id, query: { id: initial.id }, update: { $set: { cost_per_unit: 4 } } },
      { op: "updateMany", id: initial.id, query: { id: initial.id, updated_date: initial.updated_date, material_type: "rebar" }, update: { $set: { cost_per_unit: 4 } } },
      { op: "deleteMany", id: initial.id, query: {} },
      { op: "deleteMany", id: initial.id, query: { id: initial.id, updated_date: initial.updated_date, material_type: { $ne: "" } } },
      { op: "create", data: { material_name: "Synthetic", nested: { $set: { cost_per_unit: 4 } } } },
    ]) {
      const env = reset("admin");
      await assert.rejects(globalThis.__catalogGatewayInvoke("staffEntityWrite", { entity: "FoundationInventory", ...payload }),
        error => error.status === 400);
      assert.ok(env.calls.every(call => call[0] === "get"), "No mutations permitted");
      assert.deepEqual(env.row, initial);
    }
  });
}
const page = front.files.find(file => file.path === "src/pages/FoundationInventory.jsx").content;
assert.ok(page.includes("const FoundationInventoryEntity = staffEntities.FoundationInventory;"));
assert.ok(page.includes("entity: FoundationInventoryEntity"));
fs.writeFileSync(DIR + `foundation-catalog-gateway-${mode}-verification.json`, JSON.stringify({
  results, source: "Fresh sandbox source snapshot", actualStaffFacade: true, authenticationMocked: true,
  syntheticEntitiesOnly: true, realStorageVerified: false, schemaChanged: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
