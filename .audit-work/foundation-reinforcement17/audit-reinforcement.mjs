import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement17";
const output = `${DIR}/reinforcement-before.json`;
assert.ok(!fs.existsSync(output), "Frozen observations already exist; do not overwrite or rederive.");
const fresh = JSON.parse(fs.readFileSync(`${DIR}/fresh-source.json`, "utf8"));
const norm = text => text.replace(/\r\n/g, "\n");
for (const file of fresh.files.filter(file => file.path.startsWith("src/"))) {
  assert.equal(norm(file.content), norm(fs.readFileSync(file.path, "utf8")), file.path);
}
const matrix = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases;
buildSync({
  entryPoints: ["src/components/estimator/foundation/foundationCalc.js"], bundle: true,
  platform: "node", format: "esm", outfile: `${DIR}/accepted-calculator.mjs`,
});
const { calcProject } = await import(pathToFileURL(path.resolve(`${DIR}/accepted-calculator.mjs`)));
const clone = value => JSON.parse(JSON.stringify(value));
const runs = [
  ["single spread mat", 1, {}],
  ["two spread mats, separation 1 inch", 2, { rebar_layer_separation_inches: 1 }],
  ["two spread mats, separation 30 inches", 2, { rebar_layer_separation_inches: 30 }],
  ["negative spread spacing", 1, { rebar_spacing_width: -12 }],
  ["zero spread spacing", 1, { rebar_spacing_width: 0 }],
  ["fractional spread mat count", 1, { rebar_layers: 1.5 }],
  ["negative spread mat count", 1, { rebar_layers: -2 }],
  ["partial spacing string", 1, { rebar_spacing_length: "12oops" }],
  ["pillar one hoop, four longitudinal bars", 3, { pillar_rebar_layers: 1, pillar_vertical_rebar_count: 4 }],
  ["pillar three hoops, four longitudinal bars", 3, { pillar_rebar_layers: 3, pillar_vertical_rebar_count: 4 }],
  ["pillar explicit zero longitudinal bars", 3, { pillar_rebar_layers: 1, pillar_vertical_rebar_count: 0 }],
  ["pillar negative longitudinal bars", 3, { pillar_rebar_layers: 1, pillar_vertical_rebar_count: -2 }],
  ["pillar fractional hoop count", 3, { pillar_rebar_layers: 1.5 }],
  ["pillar oversized hoop", 3, { pillar_rebar_hoop_diameter: 40 }],
  ["pillar negative hoop diameter", 3, { pillar_rebar_hoop_diameter: -20 }],
  ["no rebar with unused invalid steel fields", 1, { include_rebar: false, rebar_spacing_width: -12, rebar_layers: -2 }],
];
const observations = runs.map(([name, caseIndex, patch]) => {
  const scenario = matrix[caseIndex];
  const project = clone(scenario.project);
  Object.assign(project.items[0], patch);
  const actual = calcProject(project, clone(scenario.inventory), clone(scenario.settings));
  const item = actual.items[0];
  return {
    name, frozenCase: scenario.name, authoredPatch: patch, project,
    rebarFeet: item.rebar_feet, rebarCost: item.rebar_cost, itemTotal: item.item_total_cost,
    concreteVolume: item.concrete_volume_cy, inputIssues: actual.inputIssues,
    catalogIssues: actual.catalogIssues, currentPricingAvailable: actual.itemPricing[0].available,
  };
});
const get = name => observations.find(row => row.name === name);
// Independent decomposition of the observed legacy formula, not a proposed structural design.
const spread = { horizontalFeet: 2 * 4 * 3, assumedVerticalFeet: 16 * (36 - 6) / 12 };
assert.equal(get("single spread mat").rebarFeet, spread.horizontalFeet + spread.assumedVerticalFeet);
assert.equal(get("two spread mats, separation 1 inch").rebarFeet, get("two spread mats, separation 30 inches").rebarFeet);
const pillar = { hoopFeet: Math.PI * 20 / 12, longitudinalFeet: 4 * (36 - 6) / 12 };
assert.ok(Math.abs(get("pillar one hoop, four longitudinal bars").rebarFeet - pillar.hoopFeet - pillar.longitudinalFeet) < 1e-12);
assert.equal(get("pillar explicit zero longitudinal bars").rebarFeet, get("pillar one hoop, four longitudinal bars").rebarFeet);
assert.equal(get("pillar oversized hoop").rebarFeet, get("pillar one hoop, four longitudinal bars").rebarFeet);
assert.ok(observations.every(row => row.inputIssues.length === 0 && row.catalogIssues.length === 0 && row.currentPricingAvailable));
const sourceHashes = Object.fromEntries(fresh.files.map(file => [
  file.path, createHash("sha256").update(file.content).digest("hex"),
]));
fs.writeFileSync(output, JSON.stringify({
  synthetic: true, acceptedHead: "0727ffe5a7e7c9fdccbfd9998b61a6094ae2b2af",
  sourceHashes, independentLegacyDecomposition: { spread, pillar }, observations,
}, null, 2) + "\n", { flag: "wx" });
for (const row of observations) console.log(`${row.name}: rebar=${row.rebarFeet}, cost=${row.rebarCost}, inputIssues=${row.inputIssues.length}, pricing=${row.currentPricingAvailable}`);
console.log("Frozen 16 synthetic observations. No application changes, backend calls or engineering approval.");
