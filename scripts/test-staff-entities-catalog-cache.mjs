import assert from "node:assert/strict";
import { build } from "esbuild";

const catalogs = [
  "MarkupTier", "QuoteDefaults", "Settings", "LaborServiceInventory", "FoundationInventory",
  "BrickStoneInventory", "Inventory", "VinylInventory", "VinylMachine", "ChannelLetterInstallInventory",
  "ChannelLetterInstallEquipment", "DimensionalLetterMaterial", "MaintenanceInventory", "MaintenanceEquipment",
  "MaintenanceActionRate", "SignLightingInventory", "SignHardwareInventory", "SignPartsSuppliesInventory",
];
let token = "session-a";
let now = 1_000_000;
let failure = null;
let heldRead = null;
const calls = [];
const versions = new Map();
globalThis.__catalogCacheToken = () => token;
globalThis.__catalogCacheInvoke = async (fn, body) => {
  calls.push({ fn, body });
  if (fn !== "staffDataRead") {
    if (failure) throw failure;
    versions.set(body.entity, (versions.get(body.entity) ?? 0) + 1);
    return { record: { op: body.op }, result: { op: body.op }, deleted: true };
  }
  const requests = body.entities || [body];
  const entries = Object.fromEntries(requests.map(({ entity }) => [entity, [{ entity, version: versions.get(entity) ?? 0 }]]));
  if (heldRead && requests.some(({ query }) => query?.hold)) {
    heldRead.started();
    await heldRead.promise;
  }
  return body.entities ? { entities: entries } : { items: entries[body.entity] };
};
const stubs = {
  "@/components/fleet/fleetInvoke": "export const invokeFleet=(...args)=>globalThis.__catalogCacheInvoke(...args); export const isFleetCoolingDown=()=>false;",
  "@/components/auth/EmailGate": "export const getSessionToken=()=>globalThis.__catalogCacheToken();",
  "@/api/rateLimitCooldown": "export const noteRateLimit=()=>{};",
};
const bundle = await build({
  entryPoints: ["src/components/staff/staffEntities.js"], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "catalog-cache-stubs",
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
const realNow = Date.now;
Date.now = () => now;
const reads = () => calls.filter(({ fn }) => fn === "staffDataRead").length;
const advance = (ms) => { now += ms; };
try {
  for (const entity of catalogs) {
    const start = reads();
    await staffEntities[entity].list();
    await staffEntities[entity].list();
    assert.equal(reads() - start, 1, `${entity} is cached`);
  }
  advance(31_000);
  const start = reads();
  await staffEntities.FoundationInventory.list();
  assert.equal(reads(), start, "catalog remains cached after 31 seconds");
  advance(15 * 60_000 + 1 - 31_000);
  await staffEntities.FoundationInventory.list();
  assert.equal(reads(), start + 1, "catalog expires after 15 minutes");

  for (const entity of ["Customer", "GlobalSettings", "BuilderPart", "BuilderPartGroup", "BuilderProduct", "BuilderPriceRevision"]) {
    const before = reads();
    await staffEntities[entity].list();
    await staffEntities[entity].list();
    advance(31_000);
    await staffEntities[entity].list();
    assert.equal(reads() - before, 2, `${entity} expires after 30 seconds`);
  }

  let before = reads();
  await staffEntities.VinylInventory.list("name");
  await staffEntities.VinylInventory.list("-name");
  await staffEntities.VinylInventory.filter({ active: true }, "name");
  await staffEntities.VinylInventory.filter({ active: false }, "name");
  await staffEntities.VinylInventory.filter({ active: true }, "-name");
  await staffEntities.VinylInventory.filter({ active: true }, "name");
  assert.equal(reads() - before, 5, "sort and query participate in cache keys");

  const writeAt = now;
  await staffEntities.VinylInventory.create({ name: "synthetic" });
  before = reads();
  assert.equal((await staffEntities.VinylInventory.list("name"))[0].version, 1);
  assert.equal(reads() - before, 1, "write immediately invalidates cached list");
  advance(10_000);
  before = reads();
  await staffEntities.VinylInventory.filter({ settling: true });
  advance(31_000);
  await staffEntities.VinylInventory.filter({ settling: true });
  assert.equal(reads() - before, 2, "read during settle expires in 30 seconds");
  now = writeAt + 61_000;
  before = reads();
  await staffEntities.VinylInventory.filter({ settled: true });
  advance(31_000);
  await staffEntities.VinylInventory.filter({ settled: true });
  assert.equal(reads() - before, 1, "read after settle uses long TTL");
  advance(15 * 60_000 + 1 - 31_000);
  await staffEntities.VinylInventory.filter({ settled: true });
  assert.equal(reads() - before, 2, "settled read expires after 15 minutes");

  let releaseRead, notifyStarted;
  heldRead = {
    promise: new Promise((resolve) => { releaseRead = resolve; }),
    started: () => notifyStarted(),
  };
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const inFlight = staffEntities.MaintenanceInventory.filter({ hold: true });
  await started;
  await staffEntities.MaintenanceInventory.update("synthetic", {});
  advance(61_000);
  releaseRead();
  assert.equal((await inFlight)[0].version, 0, "in-flight response captured pre-write data");
  heldRead = null;
  before = reads();
  advance(31_000);
  assert.equal((await staffEntities.MaintenanceInventory.filter({ hold: true }))[0].version, 1);
  assert.equal(reads() - before, 1, "overlapping read stays short-lived even after settle");

  for (const [method, args, expected] of [
    ["create", [{}], { op: "create" }],
    ["update", ["synthetic", {}], { op: "update" }],
    ["updateMany", [{ id: "synthetic" }, {}], { op: "updateMany" }],
    ["delete", ["synthetic"], true],
    ["deleteMany", [{ id: "synthetic" }], { op: "deleteMany" }],
  ]) {
    const query = { method };
    await staffEntities.MarkupTier.filter(query);
    assert.deepEqual(await staffEntities.MarkupTier[method](...args), expected, `${method} preserves its return value`);
    before = reads();
    await staffEntities.MarkupTier.filter(query);
    assert.equal(reads() - before, 1, `${method} busts on success`);
    failure = new Error(`synthetic ${method} failure`);
    const original = failure;
    await assert.rejects(staffEntities.MarkupTier[method](...args), (error) => error === original, `${method} preserves rejection`);
    failure = null;
    before = reads();
    await staffEntities.MarkupTier.filter(query);
    assert.equal(reads() - before, 1, `${method} busts on failure`);
  }

  before = reads();
  await staffEntities.QuoteDefaults.filter({ session: true });
  token = "session-b";
  await staffEntities.QuoteDefaults.filter({ session: true });
  assert.equal(reads() - before, 2, "different sessions use separate keys");

  before = reads();
  await staffEntities.PartTemplate.list();
  await staffEntities.PartTemplate.list();
  assert.equal(reads() - before, 2, "private libraries remain uncached");
  console.log("PASS staff-entities-catalog-cache");
} finally {
  Date.now = realNow;
}
