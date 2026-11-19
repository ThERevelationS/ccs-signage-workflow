// Read-only synthetic measurement of the accepted calculator; not a business-data query.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { calcProject } from "../foundation-materials14/calc-b.mjs";

const out = ".audit-work/foundation-reinforcement16/basic-inputs-before.json";
assert.equal(fs.existsSync(out), false, "Keep the original measurement; do not overwrite it.");
const fixture = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/complete-before.json", "utf8")).cases[1];
const pins = JSON.parse(fs.readFileSync(".audit-work/foundation-materials14/financial-core-hashes.json", "utf8"));
for (const [file, expected] of Object.entries(pins)) {
  if (file === "src/pages/FoundationEstimator.jsx") continue;
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), expected, file);
}
const savedProject = {
  ...fixture.project,
  items: fixture.expected.items,
};
const before = fixture.expected.items[0];
assert.equal(before.concrete_volume_cy, 1);
assert.equal(before.rebar_feet, 64);
assert.equal(before.quantity, 1);

const mutations = [
  { name: "zero instance quantity", patch: { quantity: 0 } },
  { name: "negative instance quantity", patch: { quantity: -2 } },
  { name: "fractional instance quantity", patch: { quantity: 1.5 } },
  { name: "negative footing length", patch: { length_inches: -36 } },
  { name: "zero footing depth", patch: { depth_inches: 0 } },
  { name: "trailing junk in width", patch: { width_inches: "36oops" } },
  { name: "unsupported foundation type", patch: { foundation_type: "unsupported", diameter: 24 } },
];
const numeric = value => typeof value === "number" && Number.isFinite(value)
  ? value : { type: typeof value, representation: String(value) };
const observations = mutations.map(({ name, patch }) => {
  const project = { ...fixture.project, items: [{ ...fixture.project.items[0], ...patch }] };
  const result = calcProject(project, fixture.inventory, fixture.settings, { savedProject });
  const item = result.items[0];
  assert.equal(result.catalogIssues.length, 0, name);
  assert.equal(result.itemPricing[0].available, true, name);
  return {
    name,
    authoredPatch: patch,
    catalogIssueCount: result.catalogIssues.length,
    currentPricingAvailable: result.itemPricing[0].available,
    calculated: Object.fromEntries([
      "quantity", "concrete_volume_cy", "concrete_bags", "rebar_feet", "item_total_cost",
    ].map(field => [field, numeric(item[field])])),
    projectGrandTotal: numeric(result.totals.grand_total),
  };
});
const byName = name => observations.find(row => row.name === name);
assert.equal(byName("zero instance quantity").calculated.quantity, 1);
assert.equal(byName("zero instance quantity").calculated.concrete_volume_cy, before.concrete_volume_cy);
assert.equal(byName("negative instance quantity").calculated.quantity, 1);
assert.equal(byName("negative instance quantity").calculated.concrete_volume_cy, -2);
assert.equal(byName("fractional instance quantity").calculated.concrete_volume_cy, 1.5);
assert.equal(byName("fractional instance quantity").calculated.rebar_feet, before.rebar_feet);
assert.equal(byName("negative footing length").calculated.concrete_volume_cy, -1);
assert.equal(byName("zero footing depth").calculated.concrete_volume_cy, 0);
assert.equal(byName("trailing junk in width").calculated.concrete_volume_cy, before.concrete_volume_cy);
const report = {
  synthetic: true,
  sourceCheckpoint: "6aed818c8e4b552cf32a811e",
  basis: "Frozen complete-before case 1; current unchanged financial engine; no baseline regeneration.",
  limitation: "Calculator/guard observations only; no page save, backend acceptance, or production-record test.",
  observations,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
for (const row of observations) console.log(JSON.stringify(row));
console.log("Captured seven synthetic input-validation observations; no application edits or backend writes.");
