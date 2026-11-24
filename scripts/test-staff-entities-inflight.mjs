import assert from "node:assert/strict";
import { build } from "esbuild";

let token = "session-a";
let holdWrites = false;
const reads = [];
const writes = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
globalThis.__inflightToken = () => token;
globalThis.__inflightInvoke = (fn, body) => {
  if (fn === "staffDataRead") {
    return new Promise((resolve, reject) => reads.push({ body, token, resolve, reject }));
  }
  return new Promise((resolve, reject) => {
    writes.push({ fn, body, resolve, reject });
    if (!holdWrites) resolve({ record: { id: "written" }, result: { updated: 1 }, deleted: true });
  });
};

const stubs = {
  "@/components/fleet/fleetInvoke": "export const invokeFleet=(...args)=>globalThis.__inflightInvoke(...args); export const isFleetCoolingDown=()=>false;",
  "@/components/auth/EmailGate": "export const getSessionToken=()=>globalThis.__inflightToken();",
  "@/api/rateLimitCooldown": "export const noteRateLimit=()=>{};",
};
const bundle = await build({
  stdin: {
    contents: 'export { staffEntities } from "./src/components/staff/staffEntities.js"; export { loadAllEntityRows } from "./src/lib/loadAllEntityRows.js";',
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "staff-inflight-stubs",
    setup(context) {
      context.onResolve({ filter: /^@\// }, ({ path }) => {
        if (!stubs[path]) throw new Error(`Unexpected import ${path}`);
        return { path, namespace: "stub" };
      });
      context.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({ contents: stubs[path], loader: "js" }));
    },
  }],
});
const { staffEntities, loadAllEntityRows } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

async function waitReads(count) {
  const started = Date.now();
  while (reads.length < count && Date.now() - started < 3000) await sleep(10);
  assert.equal(reads.length, count, `expected ${count} read invokes`);
}
function resolveRead(index, value) {
  const read = reads[index];
  const rows = [{ id: `row-${value}`, value }];
  if (read.body.entities) {
    read.resolve({ entities: Object.fromEntries(read.body.entities.map(({ entity }) => [entity, rows])) });
  } else read.resolve({ items: rows });
}

assert.notStrictEqual(staffEntities.Settings, staffEntities.Settings);
assert.notStrictEqual(staffEntities.BuilderPart, staffEntities.BuilderPart);

{
  const start = reads.length;
  const first = staffEntities.Settings.list("name", 20, 0);
  await waitReads(start + 1);
  await sleep(200);
  const second = staffEntities.Settings.list({ sort: "name", limit: 20, skip: 0 });
  await sleep(200);
  assert.equal(reads.length, start + 1, "identical reads share beyond the batch window");
  resolveRead(start, "shared");
  const [array, paged] = await Promise.all([first, second]);
  assert.deepEqual(paged, { items: array, has_more: false, next_cursor: null });
  assert.notStrictEqual(array, paged.items);
  array.push({ id: "extra" });
  assert.equal(paged.items.length, 1);
  assert.equal((await staffEntities.Settings.list("name", 20, 0)).length, 1, "caller cannot mutate cached array");
}

{
  const start = reads.length;
  const first = staffEntities.Settings.filter({ scope: "arg-a" });
  await waitReads(start + 1);
  await sleep(200);
  const second = staffEntities.Settings.filter({ scope: "arg-b" });
  await waitReads(start + 2);
  resolveRead(start, "arg-a");
  resolveRead(start + 1, "arg-b");
  assert.equal((await first)[0].value, "arg-a");
  assert.equal((await second)[0].value, "arg-b");
}

for (const entity of ["Settings", "BuilderPart"]) {
  const start = reads.length;
  const query = { scope: `write-race-${entity}` };
  const first = staffEntities[entity].filter(query);
  await waitReads(start + 1);
  await sleep(200);
  holdWrites = true;
  const write = staffEntities[entity].update("synthetic", {});
  const second = staffEntities[entity].filter(query);
  await waitReads(start + 2);
  resolveRead(start, "pre-write");
  assert.equal((await first)[0].value, "pre-write");
  const joined = staffEntities[entity].filter(query);
  await sleep(200);
  assert.equal(reads.length, start + 2, `${entity} old completion must not remove the new in-flight entry`);
  resolveRead(start + 1, "during-write");
  const [secondRows, joinedRows] = await Promise.all([second, joined]);
  assert.deepEqual(secondRows, joinedRows);
  assert.notStrictEqual(secondRows, joinedRows);
  writes.at(-1).resolve({ record: { id: "written" } });
  await write;
  holdWrites = false;
  const after = staffEntities[entity].filter(query);
  await waitReads(start + 3);
  resolveRead(start + 2, "post-write");
  assert.equal((await after)[0].value, "post-write");
}

for (const entity of ["Settings", "BuilderPart"]) {
  const start = reads.length;
  const query = { scope: `overlap-${entity}` };
  const oldRead = staffEntities[entity].filter(query);
  await waitReads(start + 1);
  await staffEntities[entity].update("synthetic", {});
  resolveRead(start, "stale");
  assert.equal((await oldRead)[0].value, "stale");
  const after = staffEntities[entity].filter(query);
  await waitReads(start + 2);
  resolveRead(start + 1, "fresh");
  assert.equal((await after)[0].value, "fresh", `${entity} overlapping read must not populate the cache`);
}

{
  const start = reads.length;
  const query = { scope: "failed-write-overlap" };
  const oldRead = staffEntities.Settings.filter(query);
  await waitReads(start + 1);
  holdWrites = true;
  const write = staffEntities.Settings.update("synthetic", {});
  const error = new Error("synthetic write failure");
  writes.at(-1).reject(error);
  await assert.rejects(write, (caught) => caught === error);
  holdWrites = false;
  resolveRead(start, "stale-after-failure");
  await oldRead;
  const after = staffEntities.Settings.filter(query);
  await waitReads(start + 2);
  resolveRead(start + 1, "fresh-after-failure");
  assert.equal((await after)[0].value, "fresh-after-failure");
}

{
  const start = reads.length;
  holdWrites = true;
  const first = staffEntities.Settings.filter({ scope: "write-before-batch-flush" });
  const write = staffEntities.Settings.update("synthetic", {});
  const second = staffEntities.Settings.filter({ scope: "write-before-batch-flush" });
  await waitReads(start + 1);
  resolveRead(start, "before-flush-write");
  await waitReads(start + 2);
  resolveRead(start + 1, "after-flush-write");
  assert.equal((await first)[0].value, "before-flush-write");
  assert.equal((await second)[0].value, "after-flush-write");
  writes.at(-1).resolve({ record: { id: "written" } });
  await write;
  holdWrites = false;
}

{
  const start = reads.length;
  const first = staffEntities.Settings.filter({ scope: "failure" });
  await waitReads(start + 1);
  await sleep(200);
  const second = staffEntities.Settings.filter({ scope: "failure" });
  const outcomes = Promise.allSettled([first, second]);
  const error = Object.assign(new Error("synthetic rate limit"), { status: 429 });
  reads[start].reject(error);
  for (const outcome of await outcomes) {
    assert.equal(outcome.status, "rejected");
    assert.strictEqual(outcome.reason, error);
  }
  const retry = staffEntities.Settings.filter({ scope: "failure" });
  await waitReads(start + 2);
  resolveRead(start + 1, "retry");
  assert.equal((await retry)[0].value, "retry");
}

{
  const start = reads.length;
  const first = staffEntities.Settings.filter({ scope: "session" });
  await waitReads(start + 1);
  token = "session-b";
  const second = staffEntities.Settings.filter({ scope: "session" });
  await waitReads(start + 2);
  assert.equal(reads[start].token, "session-a");
  assert.equal(reads[start + 1].token, "session-b");
  resolveRead(start, "session-a");
  resolveRead(start + 1, "session-b");
  assert.equal((await first)[0].value, "session-a");
  assert.equal((await second)[0].value, "session-b");
  token = "session-a";
}

for (const entity of ["PartTemplate", "QuickProduct", "QuickProductCategory"]) {
  const start = reads.length;
  const first = staffEntities[entity].list();
  const second = staffEntities[entity].list();
  await waitReads(start + 2);
  resolveRead(start, "private-a");
  resolveRead(start + 1, "private-b");
  assert.equal((await first)[0].value, "private-a");
  assert.equal((await second)[0].value, "private-b");
}

{
  const start = reads.length;
  const options = { query: { scope: "loadAll" }, sort: "name" };
  const first = loadAllEntityRows({ ...options, entity: staffEntities.Settings });
  await waitReads(start + 1);
  await sleep(200);
  const second = loadAllEntityRows({ ...options, entity: staffEntities.Settings });
  await sleep(200);
  assert.equal(reads.length, start + 1, "facade shares paged reads across distinct loadAllEntityRows proxies");
  resolveRead(start, "loadAll");
  const [firstRows, secondRows] = await Promise.all([first, second]);
  assert.deepEqual(firstRows, secondRows);
  assert.notStrictEqual(firstRows, secondRows);
}

console.log("PASS staff-entities-inflight");
