import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

function load(file, imports = {}) {
  const source = transformSync(readFileSync(file, "utf8"), { loader: "js", format: "cjs" }).code;
  const module = { exports: {} };
  runInNewContext(source, {
    module, exports: module.exports, console,
    require: (name) => {
      if (!imports[name]) throw new Error(`Unexpected import ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

const ownership = load("src/components/estimator/products/libraryOwnership.js");
const { ownerOf, isLegacyUnowned, isLibraryOwner, canSeeLibraryItem, canEditLibraryItem } = ownership;
const alice = { email: " ALICE@Example.test ", role: "staff", id: "alice" };
const bob = { email: "bob@example.test", role: "staff", id: "bob" };
const admin = { email: "admin@example.test", role: "admin" };
const mine = { owner_email: " Alice@example.test ", product_group: "my", created_by_id: "service_1" };
const shared = { ...mine, product_group: "global" };
const legacy = { owner_email: "", product_group: "my", created_by_id: "platform-user" };

assert.equal(ownerOf(mine), "alice@example.test");
assert.equal(isLegacyUnowned(mine), false);
assert.equal(isLegacyUnowned(legacy), true);
assert.equal(isLegacyUnowned({ created_by_id: "service_123" }), true);
assert.equal(isLegacyUnowned({ created_by_id: "platform-user" }), true);
assert.equal(isLibraryOwner(mine, alice), true);
assert.equal(isLibraryOwner(mine, bob), false);
assert.equal(isLibraryOwner(mine, null), false);
assert.equal(isLibraryOwner(legacy, bob), true);
assert.equal(canSeeLibraryItem(mine, alice), true);
assert.equal(canSeeLibraryItem(mine, bob), false);
assert.equal(canSeeLibraryItem(mine, admin), false);
assert.equal(canSeeLibraryItem(shared, bob), true);
assert.equal(canSeeLibraryItem(legacy, bob), true);
assert.equal(canEditLibraryItem(mine, alice), true);
assert.equal(canEditLibraryItem(mine, bob), false);
assert.equal(canEditLibraryItem(mine, admin), true);
assert.equal(canEditLibraryItem(shared, bob), false);
assert.equal(canEditLibraryItem(legacy, bob), true);

let session = alice;
const part = { id: "part", updated_date: "p1", part_name: "Sample", is_active: true };
const group = { id: "group", updated_date: "g1", group_name: "Group" };
const builder = { id: "builder", updated_date: "b1", builder_name: "Builder" };
const partEntity = { get: async () => part };
const groupEntity = { get: async () => group };
const libraryRows = [
  { id: "mine", owner_email: "alice@example.test", product_group: "my", is_active: true, template_name: "Mine", product_name: "Mine" },
  { id: "other", owner_email: "bob@example.test", product_group: "my", is_active: true, template_name: "Other", product_name: "Other" },
  { id: "shared", owner_email: "bob@example.test", product_group: "global", is_active: true, template_name: "Shared", product_name: "Shared" },
  { id: "legacy", product_group: "my", is_active: true, template_name: "Legacy", product_name: "Legacy" },
];
const templateEntity = { filterFresh: async () => [], get: async (id) => libraryRows.find((row) => row.id === id) };
const quickEntity = { get: async (id) => libraryRows.find((row) => row.id === id) };
const saves = [];
const imports = {
  "@/components/auth/EmailGate": { getSessionUser: () => session },
  "@/components/estimator/products/libraryOwnership": ownership,
  "@/components/estimator/products/snapshotUtils": { cloneSnapshot: (row) => ({ ...row }), stripEntitySystemFields: (row) => row },
  "@/components/estimator/parts/partPackageService": { addPartPackageToProduct: async ({ sourceId }) => ({ sourceId }) },
  "@/components/estimator/builder/builderMutationRecovery": { builderMutationHash: (value) => JSON.stringify(value), pendingBuilderMutation: () => null },
  "@/components/estimator/products/reusableSaveIdempotency": { ensureReusableRecord: async (options) => { saves.push(options); return options; } },
  "@/components/estimator/loadAllEntityRows": { loadAllEntityRows: async ({ entity, query }) =>
    entity === partEntity ? [part] : (entity === templateEntity || entity === quickEntity) && !query ? libraryRows : [] },
  "@/components/estimator/builder/builderService": { snapshotHash: () => "hash" },
  "@/components/estimator/parts/partState": {},
  "@/components/estimator/customerPricing": { acceptedCustomerUnitPrice: () => 0, liveCustomerUnitPrice: () => 0 },
  "@/components/estimator/estimateMutationGuard": { assertEstimateProductMutationAllowed: async () => { throw new Error("ownership passed"); } },
  "@/components/estimator/builder/partSync": {},
  "@/components/estimator/estimatePersistence": {},
  "@/components/estimator/builder/builderEntityPersistence": {},
  "@/components/staff/staffEntities": { staffEntities: {
    BuilderPart: partEntity, BuilderPartGroup: groupEntity, PartTemplate: templateEntity,
    BuilderProduct: { get: async () => builder }, QuickProduct: quickEntity,
    AllInOneEstimate: { get: async () => ({ id: "est", line_items: [] }) },
  } },
};
const partService = load("src/components/estimator/parts/partTemplateService.js", imports);
const quickService = load("src/components/estimator/products/quickProductService.js", imports);
const actions = [
  () => partService.savePartTemplate({ part }),
  () => partService.savePartGroupTemplate({ group, parts: [part] }),
  () => quickService.saveProductAsQuickProduct({ estimateId: "est", line: { builder_product_id: "builder", line_id: "line" } }),
];
for (const action of actions) {
  session = alice;
  const first = await action();
  session = { ...alice, email: "alice@example.test" };
  const retry = await action();
  session = bob;
  const other = await action();
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.notEqual(first.idempotencyKey, other.idempotencyKey);
  assert.equal(Object.hasOwn(first.data, "owner_email"), false);
}
assert.equal(saves.length, 9);
session = alice;
const ids = (items) => Array.from(items, (row) => row.id).sort().join(",");
assert.equal(ids(await partService.listPartTemplates()), "legacy,mine,shared");
assert.equal(ids(await quickService.listQuickProducts()), "legacy,mine,shared");
assert.equal((await partService.instantiatePartTemplate({ template: libraryRows[0] })).sourceId, "mine");
await assert.rejects(partService.instantiatePartTemplate({ template: libraryRows[1] }), /no longer available/);
await assert.rejects(quickService.instantiateQuickProduct({ estimateId: "est", quickProduct: libraryRows[0] }), /ownership passed/);
await assert.rejects(quickService.instantiateQuickProduct({ estimateId: "est", quickProduct: libraryRows[1] }), /no longer available/);
session = admin;
assert.equal(ids(await partService.listPartTemplates()), "legacy,shared");
assert.equal(ids(await quickService.listQuickProducts()), "legacy,shared");
for (const file of [
  "src/components/estimator/aio/CreateQuickProductModal.jsx",
  "src/components/estimator/parts/SavePartTemplateModal.jsx",
  "src/pages/EstimatorParts.jsx",
  "src/pages/EstimatorProducts.jsx",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /Only visible to me/, file);
  assert.match(source, /Visible to everyone/, file);
}
for (const file of ["src/pages/EstimatorParts.jsx", "src/pages/EstimatorProducts.jsx"]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /Only me/, file);
  assert.match(source, /Everyone/, file);
  assert.match(source, /ownerOf\(/, file);
  assert.doesNotMatch(source, /created_by_id|startsWith\("service_"\)/, file);
}
console.log("PASS library ownership matrix, service visibility, and per-user part/group/product save keys");
