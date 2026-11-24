import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const stubs = {
  "@/components/staff/staffEntities": "export const staffEntities = globalThis.__removalEntities;",
  "@/components/estimator/builder/builderMutationRecovery": `
    export const builderMutationHash = () => "test-hash";
    export const pendingBuilderMutation = (line) => line?.price_acceptance_pending?.key ? line.price_acceptance_pending : null;
  `,
  "@/components/estimator/estimateMutationGuard": `
    export async function assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt = "", allowPriceAcceptanceKey = "" } = {}) {
      if (expectedUpdatedAt && estimate.updated_date !== expectedUpdatedAt) throw new Error("stale estimate");
      const pending = estimate.line_items.find((line) => line.price_acceptance_pending?.key)?.price_acceptance_pending;
      if (pending && pending.key !== allowPriceAcceptanceKey) throw new Error("pending mutation");
    }
  `,
};
const localModules = {
  "@/components/estimator/moduleRegistry": "src/components/estimator/moduleRegistry.js",
  "@/components/estimator/estimatePersistence": "src/components/estimator/estimatePersistence.js",
  "@/components/estimator/builder/builderEntityPersistence": "src/components/estimator/builder/builderEntityPersistence.js",
};
globalThis.__removalEntities = {};
const bundle = await build({
  entryPoints: ["src/components/estimator/products/productRemovalService.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
  plugins: [{
    name: "removal-stubs",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@\// }, ({ path }) => {
        if (stubs[path]) return { path, namespace: "removal-stub" };
        if (localModules[path]) return { path: resolve(localModules[path]) };
        throw new Error(`Unexpected import ${path}`);
      });
      buildContext.onLoad({ filter: /.*/, namespace: "removal-stub" }, ({ path }) => ({ contents: stubs[path], loader: "js" }));
    },
  }],
});
const { removeProductFromEstimate, resumeProductRemoval } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

const clone = (value) => structuredClone(value);
const missing = () => Object.assign(new Error("Record not found"), { status: 404 });

function fixture() {
  const line = {
    line_id: "line", module_key: "cnc", owned: true, project_id: "project",
    builder_product_id: "builder", client_product_name: "CNC",
  };
  const stores = Object.fromEntries([
    ["AllInOneEstimate", [{ id: "estimate", updated_date: "e1", status: "draft", line_items: [line] }]],
    ["CNCProject", [{ id: "project", updated_date: "source-v1" }]],
    ["BuilderProduct", [{ id: "builder", updated_date: "builder-v1" }]],
    ["BuilderPart", [{ id: "part", updated_date: "old", builder_product_id: "builder" }]],
    ["BuilderPartGroup", [{ id: "group", updated_date: "group-v1", builder_product_id: "builder" }]],
    ["BuilderPriceRevision", [{ id: "revision", updated_date: "revision-v1", builder_product_id: "builder" }]],
  ].map(([name, rows]) => [name, new Map(rows.map((row) => [row.id, clone(row)]))]));
  const stale = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, clone([...rows.values()])]));
  const ctx = { stores, stale, deletes: [], filters: [], faults: {}, onDelete: null, freshOverrides: {} };
  const entities = {};
  for (const [name, rows] of Object.entries(stores)) {
    entities[name] = {
      get: async (id) => {
        const fault = ctx.faults[`${name}:${id}`];
        if (fault) throw fault;
        const row = rows.get(id);
        if (!row) throw missing();
        return clone(row);
      },
      filter: async (query) => clone(stale[name].filter((row) => row.builder_product_id === query.builder_product_id)),
      filterFresh: async (query, sort, limit) => {
        ctx.filters.push({ name, query: clone(query), sort, limit });
        if (Object.prototype.hasOwnProperty.call(ctx.freshOverrides, name)) return clone(ctx.freshOverrides[name]);
        return clone([...rows.values()].filter((row) => row.builder_product_id === query.builder_product_id));
      },
      updateMany: async (query, update) => {
        const row = rows.get(query.id);
        if (!row || row.updated_date !== query.updated_date) return { updated: 0 };
        Object.assign(row, clone(update.$set), { updated_date: `${row.updated_date}-next` });
        return { updated: 1 };
      },
      deleteMany: async (query) => {
        const row = rows.get(query.id);
        if (!row || row.updated_date !== query.updated_date || (query.builder_product_id && row.builder_product_id !== query.builder_product_id)) return { deleted: 0 };
        rows.delete(query.id);
        ctx.deletes.push({ name, id: query.id, query: clone(query) });
        await ctx.onDelete?.(name, query.id);
        return { deleted: 1 };
      },
    };
  }
  Object.keys(globalThis.__removalEntities).forEach((key) => delete globalThis.__removalEntities[key]);
  Object.assign(globalThis.__removalEntities, entities);
  ctx.entities = entities;
  ctx.line = line;
  ctx.remove = () => removeProductFromEstimate({ estimateId: "estimate", line, expectedEstimateUpdatedAt: "e1" });
  ctx.resume = () => resumeProductRemoval({ estimateId: "estimate", lineId: "line" });
  return ctx;
}

{
  const f = fixture();
  f.stores.BuilderPart.get("part").updated_date = "fresh";
  assert.equal((await f.entities.BuilderPart.filter({ builder_product_id: "builder" }))[0].updated_date, "old");
  assert.deepEqual(await f.remove(), { removed: true, lineId: "line" });
  assert.deepEqual(f.deletes.map((d) => d.name), ["CNCProject", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision", "BuilderProduct"]);
  for (const name of ["CNCProject", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision", "BuilderProduct"]) assert.equal(f.stores[name].size, 0, name);
  assert.deepEqual(f.stores.AllInOneEstimate.get("estimate").line_items, []);
  assert.equal(f.deletes.find((d) => d.id === "part").query.updated_date, "fresh");
  assert.ok(f.filters.length >= 9);
  for (const call of f.filters) {
    assert.deepEqual(call.query, { builder_product_id: "builder" });
    assert.equal(call.limit, 500);
    assert.equal(call.sort, call.name === "BuilderPriceRevision" ? "revision_number" : "sort_order");
  }
}

{
  const f = fixture();
  f.onDelete = async (name) => {
    if (name === "CNCProject") f.faults["BuilderPart:part"] = Object.assign(new Error("offline"), { status: 500 });
  };
  await assert.rejects(f.remove(), /offline/);
  assert.deepEqual(f.deletes.map((d) => d.name), ["CNCProject"]);
  assert.equal(f.stores.BuilderPart.size, 1);
  assert.equal(f.stores.BuilderProduct.size, 1);
  assert.equal(f.stores.AllInOneEstimate.get("estimate").line_items[0].price_acceptance_pending.kind, "builder_product_remove");
  delete f.faults["BuilderPart:part"];
  f.onDelete = null;
  await f.resume();
  assert.equal(f.stores.BuilderProduct.size, 0);
  assert.equal(f.stores.BuilderPart.size, 0);
  assert.equal(f.stores.BuilderPriceRevision.size, 0);
  assert.deepEqual(f.stores.AllInOneEstimate.get("estimate").line_items, []);
}

{
  const f = fixture();
  f.faults["CNCProject:project"] = Object.assign(new Error("server failure"), { response: { status: 500 } });
  await assert.rejects(f.remove(), /server failure/);
  assert.equal(f.deletes.length, 0);
  assert.equal(f.stores.AllInOneEstimate.get("estimate").line_items[0].price_acceptance_pending, undefined);
}

for (const name of ["BuilderPart", "BuilderPartGroup", "BuilderPriceRevision"]) {
  const f = fixture();
  f.freshOverrides[name] = Array.from({ length: 500 }, (_, i) => ({ id: `${name}-${i}`, builder_product_id: "builder" }));
  await assert.rejects(f.remove(), /too many Builder child records to verify safely/i);
  assert.equal(f.deletes.length, 0);
  assert.equal(f.stores.AllInOneEstimate.get("estimate").line_items[0].price_acceptance_pending, undefined);
}

{
  const f = fixture();
  f.freshOverrides.BuilderPart = { items: [] };
  await assert.rejects(f.remove(), /child records could not be verified/i);
  assert.equal(f.deletes.length, 0);
}

{
  const f = fixture();
  f.onDelete = async (name) => {
    if (name === "BuilderPriceRevision") f.stores.BuilderPart.set("late-part", { id: "late-part", builder_product_id: "builder", updated_date: "late-v1" });
  };
  await assert.rejects(f.remove(), /A new Builder Part appeared while Product removal was pending/);
  assert.equal(f.stores.BuilderPart.has("late-part"), true);
  assert.equal(f.stores.BuilderProduct.has("builder"), true);
  assert.equal(f.stores.AllInOneEstimate.get("estimate").line_items[0].price_acceptance_pending.kind, "builder_product_remove");
}

{
  const f = fixture();
  f.stores.CNCProject.delete("project");
  f.stores.BuilderProduct.delete("builder");
  f.stores.BuilderPart.clear();
  f.stores.BuilderPartGroup.clear();
  f.stores.BuilderPriceRevision.clear();
  await f.remove();
  assert.deepEqual(f.stores.AllInOneEstimate.get("estimate").line_items, []);
}

console.log("PASS product removal service: fresh child reads, 404 recovery, non-404, caps, malformed rows, late child");
