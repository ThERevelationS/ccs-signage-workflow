import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18";
const source = fs.readFileSync(`${DIR}/builder-partSync-source-current.js`, "utf8");
const dependencies = new Map();
for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g)) {
  dependencies.set(match[2], match[1].split(",").map(name => name.trim()).filter(Boolean));
}
await build({
  stdin: { contents: source + "\nexport { effectiveCurrentUnitCost };\n", sourcefile: "remote-partSync.js", resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/builder-boundary-bundle.mjs`,
  plugins: [{ name: "block-all-external-operations", setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (!dependencies.has(args.path)) throw Error(`Unexpected import: ${args.path}`);
      return { path: args.path, namespace: "blocked" };
    });
    b.onLoad({ filter: /.*/, namespace: "blocked" }, args => ({
      contents: dependencies.get(args.path).map(name => `export const ${name} = () => { throw Error("External dependency must not execute in the synthetic boundary fixture"); };`).join("\n"),
      loader: "js",
    }));
  } }],
});
const { extractBuilderParts, effectiveCurrentUnitCost } =
  await import(pathToFileURL(path.resolve(`${DIR}/builder-boundary-bundle.mjs`)));
const catalog = { id: "legacy-by-size", material_type: "rebar", rebar_size: "#4", cost_per_unit: 9, unit: "ft" };
const catalogs = { FoundationInventory: { rows: [catalog], byId: new Map([[catalog.id, catalog]]) } };
const base = { component_id: "synthetic-foundation", foundation_type: "spread_foot", include_rebar: true,
  reinforcement_calculation_version: 2, reinforcement_material: { kind: "manual", name: "Explicit manual steel", unit: "ft" } };
const observed = [];
function capture(name, item, verify) {
  const parts = extractBuilderParts("foundation", { items: [item] }, catalogs);
  verify(parts);
  observed.push({ name, syntheticInput: item, parts });
}
capture("ordinary positive split remains40 material/72 labor (112 total)",
  { ...base, rebar_feet: 20, rebar_rate: 2, rebar_cost: 112 }, parts => {
    assert.equal(parts.find(p => p.part_type === "material").extended_cost, 40);
    assert.equal(parts.find(p => p.part_type === "labor").extended_cost, 72);
    assert.equal(parts.reduce((sum, p) => sum + p.extended_cost, 0), 112);
  });
capture("explicit0 rate incorrectly classifies all72 steel labor as material",
  { ...base, rebar_feet: 20, rebar_rate: 0, custom_rebar_cost_per_ft: 0, rebar_cost: 72 }, parts => {
    assert.equal(parts.length, 1); assert.equal(parts[0].part_type, "material"); assert.equal(parts[0].extended_cost, 72);
  });
capture("explicit0 aggregatefeet becomes1ft and48labor is classified as material",
  { ...base, rebar_feet: 0, rebar_rate: 2, rebar_cost: 48 }, parts => {
    assert.equal(parts.length, 1); assert.equal(parts[0].quantity, 1); assert.equal(parts[0].extended_cost, 48);
    assert.equal(parts[0].part_type, "material");
  });
capture("manualv2 material is incorrectly linked to legacy #4 catalog row",
  { ...base, rebar_feet: 20, rebar_rate: 2, rebar_cost: 112 }, parts => {
    assert.equal(parts[0].inventory_item_id, "legacy-by-size"); assert.equal(parts[0].part_name, "#4 Rebar");
  });
capture("stable v2 catalog ID is ignored in favor of legacy size lookup",
  { ...base, reinforcement_material: { kind: "catalog", inventory_id: "explicit-other-id" }, rebar_feet: 20, rebar_rate: 2, rebar_cost: 112 }, parts => {
    assert.equal(parts[0].inventory_item_id, "legacy-by-size");
  });
const zeroCurrentRate = effectiveCurrentUnitCost({ unit_cost: 0 }, catalog);
assert.equal(zeroCurrentRate, 9);
fs.writeFileSync(`${DIR}/builder-boundary-observations.json`, JSON.stringify({
  synthetic: true, readOnly: true, remoteSourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
  observed, explicitZeroCurrentUnitCostObservation: zeroCurrentRate,
  conclusion: "Version2 must not activate before extraction and current-unit-cost handling use explicit accepted basis and material/labor split.",
}, null, 2) + "\n");
console.log("Synthetic boundary observations confirmed: 5 extraction cases plus explicit-zero unit-cost fallback; no external dependency executed.");
