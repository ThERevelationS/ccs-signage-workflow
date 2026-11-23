import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";

const calls = [];
let failure = null;
let hold = null;
globalThis.__partsBatchEntities = new Proxy({}, {
  get(_, entity) {
    return {
      filter: async (query, sort, limit, skip) => {
        calls.push({ entity, query, sort, limit, skip });
        const value = query.builder_product_id;
        const ids = typeof value === "string" ? [value] : value.$in;
        if (hold && ids.includes("in-flight") && hold.remaining > 0) {
          hold.remaining--;
          if (!hold.remaining) hold.started();
          await hold.promise;
        }
        const error = failure?.(entity, ids);
        if (error) throw error;
        const rows = ids.flatMap((id) => entity === "BuilderPart"
          ? [{ id: `${entity}-${id}-1`, builder_product_id: id }, { id: `${entity}-${id}-2`, builder_product_id: id }]
          : [{ id: `${entity}-${id}`, builder_product_id: id }]);
        rows.push({ id: `${entity}-unrequested`, builder_product_id: "unrequested" });
        return rows.slice(skip, skip + limit);
      },
    };
  },
});

const bundle = await build({
  entryPoints: ["src/components/estimator/aio/builderPartsBatchLoader.js"],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "builder-parts-batch-stubs",
    setup(context) {
      context.onResolve({ filter: /^@\/components\/staff\/staffEntities$/ }, () => ({ path: "staff", namespace: "stub" }));
      context.onResolve({ filter: /^@\/components\/estimator\/loadAllEntityRows$/ }, () => ({ path: path.resolve("src/lib/loadAllEntityRows.js") }));
      context.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const staffEntities = globalThis.__partsBatchEntities;",
        loader: "js",
      }));
    },
  }],
});
const { loadBuilderPartsAndGroups } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

{
  const ids = ["a", "b", "c", "d", "e"];
  const results = await Promise.all([...ids, "a"].map(loadBuilderPartsAndGroups));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ entity }) => entity).sort(), ["BuilderPart", "BuilderPartGroup"]);
  for (const call of calls) {
    assert.deepEqual(call.query, { builder_product_id: { $in: ids } });
    assert.equal(call.sort, "sort_order");
    assert.equal(call.limit, 500);
    assert.equal(call.skip, 0);
  }
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(results[i].parts.map((row) => row.builder_product_id), [ids[i], ids[i]]);
    assert.deepEqual(results[i].groups.map((row) => row.builder_product_id), [ids[i]]);
  }
  assert.notStrictEqual(results[0].parts, results[5].parts);
  assert.notStrictEqual(results[0].groups, results[5].groups);
  results[0].parts.pop();
  results[0].groups.pop();
  assert.equal(results[5].parts.length, 2);
  assert.equal(results[5].groups.length, 1);
}

{
  calls.length = 0;
  const result = await loadBuilderPartsAndGroups("single");
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.query, { builder_product_id: "single" });
  assert.deepEqual(result.parts.map((row) => row.builder_product_id), ["single", "single"]);
  assert.deepEqual(result.groups.map((row) => row.builder_product_id), ["single"]);
}

{
  calls.length = 0;
  const ids = Array.from({ length: 450 }, (_, index) => `product-${index}`);
  const results = await Promise.all(ids.map(loadBuilderPartsAndGroups));
  assert.equal(calls.length, 6);
  for (const entity of ["BuilderPart", "BuilderPartGroup"]) {
    const chunks = calls.filter((call) => call.entity === entity);
    assert.deepEqual(chunks.map((call) => call.query.builder_product_id.$in.length), [200, 200, 50]);
    assert.deepEqual(chunks.flatMap((call) => call.query.builder_product_id.$in), ids);
  }
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(results[i].parts.map((row) => row.builder_product_id), [ids[i], ids[i]]);
    assert.deepEqual(results[i].groups.map((row) => row.builder_product_id), [ids[i]]);
  }
}

for (const failingEntity of ["BuilderPart", "BuilderPartGroup"]) {
  calls.length = 0;
  const error = new Error(`synthetic ${failingEntity} failure`);
  failure = (entity) => entity === failingEntity ? error : null;
  const results = await Promise.allSettled(["failure-a", "failure-b", "failure-c", "failure-a"].map(loadBuilderPartsAndGroups));
  assert.equal(calls.length, 2);
  for (const result of results) {
    assert.equal(result.status, "rejected");
    assert.strictEqual(result.reason, error);
  }
  failure = null;
}

{
  calls.length = 0;
  const error = new Error("synthetic first chunk failure");
  failure = (entity, ids) => entity === "BuilderPart" && ids.includes("chunk-0") ? error : null;
  const ids = Array.from({ length: 201 }, (_, index) => `chunk-${index}`);
  const results = await Promise.allSettled(ids.map(loadBuilderPartsAndGroups));
  for (const result of results.slice(0, 200)) {
    assert.equal(result.status, "rejected");
    assert.strictEqual(result.reason, error);
  }
  assert.equal(results[200].status, "fulfilled");
  assert.equal(results[200].value.parts[0].builder_product_id, "chunk-200");
  failure = null;
}

{
  calls.length = 0;
  await loadBuilderPartsAndGroups("sequential");
  await loadBuilderPartsAndGroups("sequential");
  assert.equal(calls.length, 4, "calls after a completed flush start a new read");
}

{
  calls.length = 0;
  let release, notifyStarted;
  hold = {
    remaining: 2,
    promise: new Promise((resolve) => { release = resolve; }),
    started: () => notifyStarted(),
  };
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const first = loadBuilderPartsAndGroups("in-flight");
  await started;
  const second = await loadBuilderPartsAndGroups("in-flight");
  assert.equal(calls.length, 4, "a call after flush starts another batch even while the first is in flight");
  release();
  const firstResult = await first;
  assert.notStrictEqual(firstResult.parts, second.parts);
  assert.notStrictEqual(firstResult.groups, second.groups);
  hold = null;
}

console.log("PASS builder-parts-batch-loader");
