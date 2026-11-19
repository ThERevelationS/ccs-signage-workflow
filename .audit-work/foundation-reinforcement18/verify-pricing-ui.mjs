import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dir = ".audit-work/foundation-reinforcement18/";
const output = dir + "pricing-ui-test-bundle.mjs";
await build({
  stdin: { contents: `
    export { default as PricingInfo } from "./src/components/estimator/foundation/FoundationReinforcementPricingInfo.jsx";
    export * from "./src/components/estimator/foundation/foundationReinforcementFrozenPricing.js";
    export * from "./src/components/estimator/foundation/foundationReinforcementPartDescriptors.js";
  `, resolveDir: process.cwd(), sourcefile: "pricing-ui-fixture.jsx" },
  bundle: true, platform: "node", format: "esm", jsx: "automatic", outfile: output,
  external: ["react", "react/jsx-runtime", "react-dom/server"],
});
const { PricingInfo, foundationReinforcementPricingPresentation: present,
  captureFoundationReinforcementFrozenPricing: capture,
  foundationReinforcementPartDescriptors: descriptors } = await import(pathToFileURL(process.cwd() + "/" + output));
const base = JSON.parse(fs.readFileSync(dir + "part-descriptors-fixture.json", "utf8"));
const clone = structuredClone;
const part = (item = base, index = 0) => {
  const d = descriptors({ item, itemIndex: 0 })[index];
  const p = { ...d, builder_sync_state: "linked", current_unit_cost: d.unit_cost, current_extended_cost: d.extended_cost,
    frozen_unit_cost: d.unit_cost, frozen_extended_cost: d.extended_cost };
  p.pricing_basis_snapshot.reinforcement_catalog_basis_current = true;
  return p;
};
const saved = p => ({ ...p, pricing_basis_snapshot: { ...p.pricing_basis_snapshot, reinforcement_frozen_pricing: capture(p) } });
const render = p => renderToStaticMarkup(React.createElement(PricingInfo, {
  presentation: present(p), formatMoney: value => "$" + value.toFixed(2),
}));
const text = html => html.replace(/<[^>]*>/g, "").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").trim();
const rows = html => Object.fromEntries([...html.matchAll(/<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gs)].map(match => [text(match[1]), text(match[2])]));
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); } };
check("recorded material shows exact frozen and last-calculated basis with physical quantity", () => {
  const html = render(saved(part())), r = rows(html);
  assert.equal(r["Frozen quantity"], "20 ft"); assert.equal(r["Frozen unit cost"], "$2.00 / ft"); assert.equal(r["Frozen extended"], "$40.00");
  assert.equal(r["Last priced quantity"], "20 ft"); assert.equal(r["Last unit cost"], "$2.00 / ft"); assert.equal(r["Last extended"], "$40.00");
  assert.equal(r["Physical steel"], "20 ft"); assert.equal(r["Physical weight"], "13.36 lb");
  assert.match(text(html), /engineering and purchasing review required/i);
});
check("recorded labor uses hours and60per-hour, not72per-hour", () => {
  const html = render(saved(part(base, 1))), r = rows(html);
  assert.equal(r["Frozen quantity"], "1.2 hr"); assert.equal(r["Frozen unit cost"], "$60.00 / hr"); assert.equal(r["Frozen extended"], "$72.00");
  assert.ok(!text(html).includes("$72.00 / hr"));
});
check("unrecorded legacy labor retains72amount without inventing a frozen hourly rate", () => {
  const p = part(base, 1); p.frozen_unit_cost = 72;
  const html = render(p), r = rows(html);
  assert.equal(r["Frozen quantity"], "Not recorded"); assert.equal(r["Frozen unit cost"], "Not recorded");
  assert.equal(r["Frozen extended"], "$72.00"); assert.equal(r["Last unit cost"], "$60.00 / hr");
  assert.ok(!text(html).includes("$72.00 / hr"));
});
check("zero priced footage remains distinct from20physical feet", () => {
  const x = clone(base); Object.assign(x, { custom_rebar_qty: 0, rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.basis.quantity_override_ft = 0;
  const r = rows(render(part(x)));
  assert.equal(r["Last priced quantity"], "0 ft"); assert.equal(r["Physical steel"], "20 ft"); assert.equal(r["Last extended"], "$0.00");
});
check("invalid frozen context never displays an asserted per-unit rate", () => {
  const p = saved(part()); p.pricing_basis_snapshot.reinforcement_frozen_pricing.quantity = 21;
  const html = render(p), r = rows(html);
  assert.equal(r["Frozen quantity"], "Unavailable"); assert.equal(r["Frozen unit cost"], "Unavailable");
  assert.equal(r["Frozen extended"], "$40.00"); assert.match(text(html), /frozen price basis is invalid/i);
});
check("missing current values display unavailable rather than zero or copied frozen rates", () => {
  const p = saved(part()); delete p.current_unit_cost;
  const r = rows(render(p)); assert.equal(r["Last priced quantity"], "Unavailable");
  assert.equal(r["Last unit cost"], "Unavailable"); assert.equal(r["Last extended"], "Unavailable"); assert.equal(r["Frozen extended"], "$40.00");
});
check("pending removal displays proposed zero amount without a fake zero-rate recipe", () => {
  const p = saved(part()); p.builder_data.__builder_pending_removal = true;
  Object.assign(p, { current_unit_cost: 0, current_extended_cost: 0 }); p.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
  const html = render(p), r = rows(html);
  assert.equal(r["Last priced quantity"], "Removal pending"); assert.equal(r["Last unit cost"], "Not applicable");
  assert.equal(r["After removal"], "$0.00"); assert.equal(r["Frozen extended"], "$40.00"); assert.equal(r["Physical steel"], undefined);
  assert.ok(!text(html).includes("Catalog basis is unverified"));
});
check("stale catalog is identified without replacing saved projection amounts", () => {
  const p = saved(part()); p.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
  const html = render(p); assert.equal(rows(html)["Last extended"], "$40.00");
  assert.match(text(html), /catalog basis is unverified/i);
});
check("independent origin metadata does not render as a live reinforcement definition", () => {
  for (const state of ["manual", "manual_addon", "detached_override"]) {
    const p = saved(part()); p.builder_sync_state = state; assert.equal(render(p), "");
  }
});
const changed = clone(base);
Object.assign(changed, { rebar_feet: 40, rebar_geometry_feet: 40, rebar_weight_lbs: 26.72,
  rebar_geometry_weight_lbs: 26.72, rebar_material_cost: 80, rebar_cost: 152 });
Object.assign(changed.reinforcement_cost_snapshot.amounts, { priced_feet: 40, geometry_feet: 40,
  priced_weight_lbs: 26.72, geometry_weight_lbs: 26.72, material_cost: 80, steel_cost: 152 });
const changedPart = part(changed);
changedPart.frozen_extended_cost = 40;
changedPart.pricing_basis_snapshot.reinforcement_frozen_pricing = capture(part());
changedPart.price_state = "changed";
const legacyLabor = part(base, 1); legacyLabor.frozen_unit_cost = 72;
const zeroItem = clone(base);
Object.assign(zeroItem, { custom_rebar_qty: 0, rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 72 });
Object.assign(zeroItem.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, steel_cost: 72 });
zeroItem.reinforcement_cost_snapshot.basis.quantity_override_ft = 0;
const stalePart = saved(part()); stalePart.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
const badPart = saved(part()); badPart.pricing_basis_snapshot.reinforcement_frozen_pricing.quantity = 21;
const removal = saved(part()); removal.builder_data.__builder_pending_removal = true;
Object.assign(removal, { current_unit_cost: 0, current_extended_cost: 0 });
removal.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
const independent = saved(part()); independent.builder_sync_state = "manual_addon";
const large = clone(base);
Object.assign(large, { custom_rebar_qty: 1e21, custom_rebar_cost_per_ft: 0, rebar_feet: 1e21,
  rebar_weight_lbs: 6.68e20, rebar_rate: 0, rebar_material_cost: 0, rebar_cost: 72 });
Object.assign(large.reinforcement_cost_snapshot.amounts, { priced_feet: 1e21, priced_weight_lbs: 6.68e20, material_cost: 0, steel_cost: 72 });
Object.assign(large.reinforcement_cost_snapshot.material, { cost_per_ft: 0, rate_source: "custom_rebar_cost_per_ft" });
Object.assign(large.reinforcement_cost_snapshot.basis, { cost_per_ft: 0, quantity_override_ft: 1e21 });
const control = part(); control.pricing_basis_snapshot = {};
const fixtures = [
  { name: "changed", part: changedPart, status: "Price review needed", expected: { "Frozen quantity": "20 ft", "Frozen unit cost": "$2.00 / ft", "Frozen extended": "$40.00", "Last priced quantity": "40 ft", "Last extended": "$80.00", "Physical steel": "40 ft" } },
  { name: "labor", part: saved(part(base, 1)), expected: { "Frozen quantity": "1.2 hr", "Frozen unit cost": "$60.00 / hr", "Frozen extended": "$72.00" } },
  { name: "legacy-labor", part: legacyLabor, expected: { "Frozen quantity": "Not recorded", "Frozen unit cost": "Not recorded", "Frozen extended": "$72.00", "Last unit cost": "$60.00 / hr" } },
  { name: "zero", part: saved(part(zeroItem)), expected: { "Last priced quantity": "0 ft", "Physical steel": "20 ft", "Last extended": "$0.00" } },
  { name: "stale", part: stalePart, status: "Recalculation required", expected: { "Last extended": "$40.00" } },
  { name: "invalid", part: badPart, status: "Review frozen basis", expected: { "Frozen quantity": "Unavailable", "Frozen unit cost": "Unavailable", "Frozen extended": "$40.00" } },
  { name: "removal", part: removal, status: "Removal pending", expected: { "Last priced quantity": "Removal pending", "Last unit cost": "Not applicable", "After removal": "$0.00", "Frozen extended": "$40.00" } },
  { name: "independent", part: independent, ordinary: true },
  { name: "large", part: saved(part(large)), expected: { "Last priced quantity": "1,000,000,000,000,000,000,000 ft", "Physical steel": "20 ft", "Last extended": "$0.00" } },
  { name: "legacy-control", part: control, ordinary: true },
].map((fixture, index) => ({ ...fixture, part: { ...fixture.part, id: "synthetic-part-" + index,
  builder_product_id: "synthetic-builder", estimate_id: "synthetic-estimate", source_module_key: "foundation", is_active: true, sort_order: 0 } }));
fs.writeFileSync(dir + "pricing-browser-fixtures.json", JSON.stringify({ synthetic: true, fixtures }, null, 2) + "\n");
fs.writeFileSync(dir + "pricing-ui-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Pricing UI: ${results.filter(r => r.ok).length}/${results.length}; failed=${results.filter(r => !r.ok).length}`);
process.exitCode = results.some(r => !r.ok) ? 1 : 0;
