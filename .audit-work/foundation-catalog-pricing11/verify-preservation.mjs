import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const out = ".audit-work/foundation-catalog-pricing11";
const prefix = "src/components/estimator/foundation/";
const before = JSON.parse(fs.readFileSync(`${out}/baselines.json`, "utf8"));
const prior = JSON.parse(fs.readFileSync(`${out}/remote-calculators-utf8.json`, "utf8"));
const baseline = new Map([...prior.files, ...before.files].map(f => [f.path, f.content]));
const frozen = JSON.parse(fs.readFileSync(`${out}/calculator-loss-repro.json`, "utf8"));
const { pole, cap, wall } = frozen.inputs;
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
freeze(frozen.inputs);

// The src modules import the Vite `@/` alias (loadAllEntityRows, inventory
// normalization) — bare Node cannot resolve it, so the leaves come through
// the same esbuild bundle path as the calc graph with `@` -> `./src`.
const bundleExports = async (file) => {
  const result = await build({
    entryPoints: [`${prefix}${file}`],
    bundle: true, write: false, format: "esm", platform: "node",
    alias: { "@": path.resolve("src") },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const { calcPoles } = await bundleExports("poleCalculator.js");
const { calcWallCaps } = await bundleExports("wallCapCalculator.js");
const { calcWalls } = await bundleExports("wallCalculator.js");
const { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } = await bundleExports("foundationCatalogIntegrity.js");

const compile = async (original) => {
  const plugins = original ? [{
    name: "frozen-original",
    setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        const resolved = args.importer
          ? path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path))
          : path.posix.normalize(args.path);
        const file = baseline.has(resolved) ? resolved : `${resolved}.js`;
        assert.ok(baseline.has(file), `unfrozen baseline import: ${file}`);
        return { path: file, namespace: "frozen" };
      });
      b.onLoad({ filter: /.*/, namespace: "frozen" }, args => ({
        contents: baseline.get(args.path), loader: "js",
      }));
    },
  }] : [];
  const result = await build({
    entryPoints: [`${prefix}foundationCalc.js`],
    bundle: true, write: false, format: "esm", platform: "node", plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const current = await compile(false);
const original = await compile(true);
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); console.log("ok", name); };
check("missing pole retains its complete supplied snapshot", () => {
  assert.deepEqual(calcPoles([pole], [])[0], pole);
});
check("missing cap retains supplied price, stock length and authored metadata", () => {
  assert.deepEqual(calcWallCaps([cap], []).caps[0], cap);
});
check("missing outer wall retains the coherent saved cost object", () => {
  assert.deepEqual(calcWalls({ walls: [wall] }, [])[0], wall);
});
check("missing internal wall cannot silently remove the internal cost", () => {
  const source = { ...wall, materialId: "outer", includeInternalWall: true, internalMaterialId: "inner" };
  const row = calcWalls({ walls: [source] }, [{ id: "outer", cost_per_unit: 2 }])[0];
  assert.deepEqual(row, source);
  assert.notEqual(row.calculatedCosts, source.calculatedCosts);
});
check("absent snapshots stay absent, rather than manufactured zero-valued fields", () => {
  assert.equal(Object.hasOwn(calcPoles([{ pole_id: "missing" }], [])[0], "total_cost"), false);
  assert.equal(Object.hasOwn(calcWallCaps([{ cap_inventory_id: "missing" }], []).caps[0], "cost"), false);
  assert.deepEqual(calcWalls({ walls: [{ materialId: "missing" }] }, [])[0].calculatedCosts, {});
});
check("zero is a saved amount; absent, coerced and invalid values are not", () => {
  assert.equal(hasFoundationCostSnapshot(0), true);
  for (const value of [null, undefined, "", false, "0", NaN, Infinity, {}, []]) {
    assert.equal(hasFoundationCostSnapshot(value), false);
  }
});
const project = freeze({ items: [], poles: [pole], wall_caps: [cap], walls: [wall] });
check("project flags each missing reference without mutating snapshot inputs", () => {
  const result = current.calcProject(project, []);
  assert.deepEqual(result.poles[0], pole);
  assert.deepEqual(result.wallCaps[0], cap);
  assert.deepEqual(result.walls[0], wall);
  assert.deepEqual(result.catalogIssues.map(i => i.field).sort(), ["cap_inventory_id", "materialId", "pole_id"]);
  assert.ok(result.catalogIssues.every(i => i.code === "catalog_item_unavailable"));
});
check("unassigned selections differ from unavailable selections", () => {
  assert.equal(foundationAssemblyCatalogIssues({ poles: [{}] }, [])[0].code, "catalog_item_unassigned");
});
check("disabled internal walls do not require an internal selection", () => {
  const issues = foundationAssemblyCatalogIssues({ walls: [{ materialId: "outer", includeInternalWall: false }] }, [{ id: "outer" }]);
  assert.deepEqual(issues, []);
});
const inventory = freeze([
  { id: pole.pole_id, material_type: "pole", cost_per_unit: 10, pole_pricing_mode: "per_lf" },
  { id: cap.cap_inventory_id, material_type: "wall_cap", cap_stock_price: 17, cap_stock_length_inches: 48 },
  { id: wall.materialId, material_type: "wall_material", wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, cost_per_unit: 2 },
]);
check("complete-catalog outputs match the frozen original cost engine exactly", () => {
  const actual = current.calcProject(project, inventory);
  const expected = original.calcProject(project, inventory);
  assert.deepEqual(actual.catalogIssues, []);
  delete actual.catalogIssues;
  assert.deepEqual(actual, expected);
});
check("complete catalogs with legitimate zero pole override and cap rate remain unchanged", () => {
  const zeroProject = { ...project, poles: [{ ...pole, custom_cost_per_unit: 0 }] };
  const zeroInventory = inventory.map(row => row.id === cap.cap_inventory_id ? { ...row, cap_stock_price: 0 } : row);
  const actual = current.calcProject(zeroProject, zeroInventory);
  assert.equal(actual.poles[0].total_cost, 0);
  assert.equal(actual.wallCaps[0].cost, 0);
  delete actual.catalogIssues;
  assert.deepEqual(actual, original.calcProject(zeroProject, zeroInventory));
});
fs.writeFileSync(`${out}/preservation-verification.json`, JSON.stringify({
  synthetic: true, cases, completeCatalogParity: true, inputsFrozen: true,
  scope: "Snapshot preservation and missing-reference status; no engineering/formula correctness claim.",
}, null, 2));
console.log(`PASS catalog-preservation cases=${cases.length}`);
