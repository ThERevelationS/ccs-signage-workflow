import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  stdin: {
    contents: `import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Actual from "./src/components/estimator/foundation/FoundationBOM.jsx";
import Before from "./${DIR}bom-before-local.jsx";
export const render = (kind, props) => renderToStaticMarkup(React.createElement(kind === "before" ? Before : Actual, props));`,
    resolveDir: process.cwd(), sourcefile: "bom-ssr-entry.jsx", loader: "jsx",
  },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", metafile: true,
  outfile: DIR + "bom-ui-ssr.cjs", alias: { "@": path.resolve("src") },
  plugins: [{ name: "frozen-before-bom-relative-imports", setup(builder) {
    builder.onResolve({ filter: /^\.\// }, args => {
      if (!args.importer.endsWith("bom-before-local.jsx")) return null;
      return { path: path.resolve("src/components/estimator/foundation", args.path + ".js") };
    });
  } }],
});
const inputs = Object.keys(compiled.metafile.inputs);
assert.ok(inputs.includes("src/components/estimator/foundation/FoundationBOM.jsx"));
assert.ok(inputs.includes("src/components/estimator/foundation/foundationReinforcementBOMRows.js"));
assert.ok(!inputs.some(file => file.includes("base44Client") || file.includes("staffEntities") || file.includes("node_modules/@base44/")));
const { render } = createRequire(import.meta.url)(path.resolve(DIR + "bom-ui-ssr.cjs"));
const base = JSON.parse(fs.readFileSync(DIR + "active-v2-dispatch-frozen-inputs.json", "utf8")).item;
const zero = structuredClone(base);
Object.assign(zero, { custom_rebar_qty: 0, rebar_feet: 0, rebar_weight_lbs: 0,
  rebar_material_cost: 0, rebar_labor_cost: 48, rebar_labor_hours: 0.8, rebar_cost: 48 });
Object.assign(zero.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0,
  material_cost: 0, labor_cost: 48, labor_hours: 0.8, steel_cost: 48 });
const legacy = { component_id: "legacy", include_rebar: true, rebar_feet: 10, rebar_weight_lbs: 6.68, rebar_cost: 20 };
const unknownSplit = structuredClone(base); delete unknownSplit.rebar_material_cost; delete unknownSplit.rebar_labor_cost;
const blocked = { available: false, issues: [{ message: "Synthetic pricing block; saved costs retained." }] };
const prefix = "Foundation synthetic";
const cases = [
  {
    name: "zero-mixed", props: { items: [zero, legacy], itemPricing: [{ available: true }, { available: true }] },
    expected: [
      { name: "Rebar (6.68 lbs)", quantity: "10 LF", cost: "$20.00", note: [] },
      { name: `${prefix} - Synthetic (material)`, quantity: "20 LF physical / 0 LF priced", cost: "$0.00",
        note: ["Physical weight: 13.36 lb. Priced weight: 0 lb.", "Not a purchasing plan."] },
      { name: `${prefix} - reinforcement labor`, quantity: "0.8 hr", cost: "$48.00",
        note: ["Internal reinforcement labor cost, separate from steel material."] },
    ],
    subtotal: "$68.00", pricingUnavailable: false,
  },
  {
    name: "blocked-unrecorded-split", props: { items: [unknownSplit], itemPricing: [blocked], pricingUnavailable: true },
    expected: [
      { name: `${prefix} (saved) \u2014 concrete`, quantity: "Not saved", cost: "$0.00", note: [] },
      { name: `${prefix} - reinforcement (combined saved amount)`, quantity: "20 LF physical / 20 LF priced", cost: "$112.00",
        note: ["Acknowledged saved quantities and amounts", "Material/labor split: Not saved.", "without an invented breakdown"] },
    ],
    subtotal: "Pricing unavailable", pricingUnavailable: true,
  },
  {
    name: "blocked-removal", props: { items: [{ ...base, include_rebar: false }], itemPricing: [blocked], pricingUnavailable: true },
    expected: [
      { name: `${prefix} (saved) \u2014 concrete`, quantity: "Not saved", cost: "$0.00", note: [] },
      { name: `${prefix} - Synthetic (material)`, quantity: "20 LF physical / 20 LF priced", cost: "$40.00",
        note: ["Acknowledged saved quantities and amounts"] },
      { name: `${prefix} - reinforcement labor`, quantity: "1.2 hr", cost: "$72.00",
        note: ["Acknowledged saved quantities and amounts"] },
    ],
    subtotal: "Pricing unavailable", pricingUnavailable: true,
  },
  {
    name: "unknown-basis", props: { items: [{ component_id: "unknown", reinforcement_calculation_version: 2, include_rebar: true }] },
    expected: [
      { name: "Foundation unknown - Reinforcing steel (material)", quantity: "Not saved LF physical / Not saved LF priced", cost: "Not saved",
        note: ["Physical weight: Not saved lb.", "Not a purchasing plan."] },
      { name: "Foundation unknown - reinforcement labor", quantity: "Not saved hr", cost: "Not saved",
        note: ["Internal reinforcement labor cost, separate from steel material."] },
    ],
    subtotal: "Pricing unavailable", pricingUnavailable: true,
  },
  {
    name: "inconsistent-split", props: { items: [{ ...base, rebar_labor_cost: 73 }] },
    expected: [
      { name: `${prefix} - reinforcement (combined saved amount)`, quantity: "20 LF physical / 20 LF priced", cost: "$112.00",
        note: ["Stored material/labor split does not reconcile.", "without an invented breakdown"] },
    ],
    subtotal: "Pricing unavailable", pricingUnavailable: true,
  },
  {
    name: "ordinary", props: { items: [legacy] },
    expected: [{ name: "Rebar (6.68 lbs)", quantity: "10 LF", cost: "$20.00", note: [] }],
    subtotal: "$20.00", pricingUnavailable: false, exactLegacyHtml: true,
  },
];
const frozen = [];
for (const fixture of cases) {
  const html = render("after", fixture.props), before = render("before", fixture.props);
  if (fixture.exactLegacyHtml) assert.equal(html, before, "Ordinary BOM markup must remain exactly unchanged.");
  const file = `bom-frozen-${fixture.name}.html`;
  fs.writeFileSync(DIR + file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div class="max-w-4xl mx-auto p-4">${html}</div></body></html>`);
  frozen.push({ ...fixture, file });
}
fs.writeFileSync(DIR + "bom-ui-meta.json", JSON.stringify(compiled.metafile, null, 2) + "\n");
fs.writeFileSync(DIR + "bom-ui-frozen-cases.json", JSON.stringify({ fixtures: frozen }, null, 2) + "\n");
console.log("Captured six synthetic BOM views from actual component/helper; ordinary markup byte-identical; no SDK graph.");
