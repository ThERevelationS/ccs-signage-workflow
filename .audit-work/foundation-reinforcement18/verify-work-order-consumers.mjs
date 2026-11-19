import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { foundationReinforcementPartDescriptors } from "../../src/components/estimator/foundation/foundationReinforcementPartDescriptors.js";
import { captureFoundationReinforcementFrozenPricing } from "../../src/components/estimator/foundation/foundationReinforcementFrozenPricing.js";

const DIR = ".audit-work/foundation-reinforcement18/";
const CONVERSION = "src/components/estimator/estimateConversionService.js";
const PARTS = "src/components/jobs/productsToPartsModel.js";
const PRINT = "src/components/jobs/printTemplates/workOrderPrintModel.js";
const ORIGINAL = "src/components/jobs/printTemplates/templates/original.js";
const PROJECTION = path.resolve("src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js");
const graphs = {};
async function moduleFrom(file, manifest = false) {
  const source = fs.readFileSync(file, "utf8");
  const names = new Map();
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g))
    names.set(match[2], match[1].split(",").map(name => name.trim()).filter(Boolean));
  const fixture = {
    base44: "export const base44={entities:{}};",
    staffEntities: "export const staffEntities={};",
    loadAllEntityRows: `export const loadAllEntityRows=()=>{globalThis.__unexpectedHandoff.push("loadAllEntityRows");throw Error("Synthetic fixture forbids SDK reads");};`,
    getModuleLabel: `export const getModuleLabel=()=>"Foundation";`,
  };
  const compiled = await build({
    entryPoints: [path.resolve(file)], bundle: true, platform: "node", format: "esm",
    alias: { "@": path.resolve("src") }, write: false, outdir: "out", metafile: true,
    plugins: [{ name: "real-consumers-with-blocked-manifest-io", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.kind === "entry-point") return null;
        if (args.path === "./_shared" && args.importer.endsWith("before-namespace-original.js")) {
          return { path: path.resolve("src/components/jobs/printTemplates/templates/_shared.js") };
        }
        if (!manifest || args.importer !== path.resolve(file)) return null;
        if (args.path.endsWith("foundationReinforcementWorkOrderPart")) return { path: PROJECTION };
        if (!names.has(args.path)) throw Error("Unexpected conversion import " + args.path);
        return { path: args.path, namespace: "blocked" };
      });
      builder.onLoad({ filter: /.*/, namespace: "blocked" }, args => ({
        contents: names.get(args.path).map(name => fixture[name] ||
          `export const ${name}=()=>{globalThis.__unexpectedHandoff.push(${JSON.stringify(name)});throw Error("Synthetic fixture forbids ${name}");};`).join("\n"),
        loader: "js",
      }));
    } }],
  });
  graphs[file] = compiled.metafile;
  return import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
}
globalThis.__unexpectedHandoff = [];
const conversion = await moduleFrom(CONVERSION, true);
const beforeConversion = await moduleFrom(DIR + "before-namespace-estimateConversionService.js", true);
const partsModel = await moduleFrom(PARTS);
const beforeParts = await moduleFrom(DIR + "before-namespace-productsToPartsModel.js");
const printModels = [
  { name: "local", actual: await moduleFrom(PRINT), before: await moduleFrom(DIR + "before-namespace-workOrderPrintModel.js") },
  { name: "sandbox-candidate", actual: await moduleFrom(DIR + "workOrderPrintModel-sandbox-candidate.js"),
    before: await moduleFrom(DIR + "remote-workOrderPrintModel.js") },
];
const renderer = await moduleFrom(ORIGINAL);
const beforeRenderer = await moduleFrom(DIR + "before-namespace-original.js");
const clone = structuredClone;
const base = JSON.parse(fs.readFileSync(DIR + "part-descriptors-fixture.json", "utf8"));
const make = (item = base) => foundationReinforcementPartDescriptors({ item, itemIndex: 0 }).map(descriptor => {
  const part = { ...descriptor, id: "synthetic-" + descriptor.part_type,
    estimate_id: "synthetic-estimate", builder_product_id: "synthetic-builder", builder_sync_state: "linked",
    source_module_key: "foundation", is_active: true,
    current_unit_cost: descriptor.unit_cost, current_extended_cost: descriptor.extended_cost,
    frozen_unit_cost: descriptor.unit_cost, frozen_extended_cost: descriptor.extended_cost,
    pricing_basis_snapshot: { ...descriptor.pricing_basis_snapshot, reinforcement_catalog_basis_current: true } };
  part.pricing_basis_snapshot.reinforcement_frozen_pricing = captureFoundationReinforcementFrozenPricing(part);
  return part;
});
const estimate = { id: "synthetic-estimate", estimate_number: "SYN-1",
  line_items: [{ line_id: "synthetic-line", builder_product_id: "synthetic-builder", module_key: "foundation",
    client_product_name: "Synthetic foundation" }] };
const product = { id: "synthetic-builder", builder_product_id: "synthetic-builder", estimate_line_id: "synthetic-line" };
const printOptions = { printedAt: "2026-11-06T12:00:00.000Z", company: { name: "Synthetic company" } };
const stored = value => JSON.parse(JSON.stringify(value));
const withoutScrollRegions = html => html
  .replace(/<div class="wo-table-scroll" role="region" aria-label="Work Order (?:products|materials)" tabindex="0">\s*(<table[\s\S]*?<\/table>)\s*<\/div>/g, "$1")
  .replace("  .wo-table-scroll { max-width: 100%; overflow-x: auto; }\n", "")
  .replace("  @media print { .wo-table-scroll { max-width: none; overflow: visible; } }\n", "")
  .replace(/>\s+</g, "><");
const manifest = parts => conversion.buildEstimateMaterialsManifest(estimate, { parts });
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
};
const canonicalRows = await manifest(make());
await check("conversion manifest serializes frozen material40 and labor72 with separate physical metadata", () => {
  const rows = stored(canonicalRows);
  assert.equal(rows.length, 2);
  const steel = rows.find(row => row.part_type === "material"), labor = rows.find(row => row.part_type === "labor");
  assert.equal(steel.quantity, 20); assert.equal(steel.unit_cost, 2); assert.equal(steel.extended_cost, 40);
  assert.equal(labor.quantity, 1.2); assert.equal(labor.unit_cost, 60); assert.equal(labor.extended_cost, 72);
  for (const row of rows) {
    assert.equal(row.source_estimate_id, estimate.id); assert.equal(row.estimate_line_id, "synthetic-line");
    assert.equal(row.builder_product_id, "synthetic-builder"); assert.equal(row.section_name, "Synthetic foundation");
    const h = row.foundation_reinforcement_handoff;
    assert.equal(h.last_calculated.reinforcement_snapshot.physical_quantity_ft, 20);
    assert.equal(h.engineering_approved, false); assert.equal(h.procurement_ready, false);
    assert.deepEqual(h.purchasing, { state: "unplanned" });
  }
});
await check("embedded and manifest-catalog parts retain identical112-dollar frozen rollups", () => {
  const embedded = partsModel.productParts({ ...product, parts: stored(canonicalRows) });
  const catalog = partsModel.productParts(product, { partsCatalog: stored(canonicalRows) });
  assert.equal(embedded.length, 2); assert.equal(catalog.length, 2);
  for (const rows of [embedded, catalog]) {
    const steel = rows.find(row => row.part_type === "material"), labor = rows.find(row => row.part_type === "labor");
    assert.equal(steel.unit_cost_cents, 200); assert.equal(steel.extended_cents, 4000);
    assert.equal(labor.unit_cost_cents, 6000); assert.equal(labor.extended_cents, 7200);
    const summary = partsModel.partsSummary(product, rows);
    assert.equal(summary.total_cost_cents, 11200); assert.equal(summary.uncosted_parts, 0);
    assert.equal(summary.by_type.materials.cost_cents, 4000); assert.equal(summary.by_type.labor.cost_cents, 7200);
  }
});
await check("raw embedded Builder Parts use frozen20 even when the last calculation prices40", async () => {
  const prior = make()[0], item = clone(base);
  Object.assign(item, { rebar_feet: 40, rebar_geometry_feet: 40, rebar_weight_lbs: 26.72,
    rebar_geometry_weight_lbs: 26.72, rebar_material_cost: 80, rebar_cost: 152 });
  Object.assign(item.reinforcement_cost_snapshot.amounts, { priced_feet: 40, geometry_feet: 40,
    priced_weight_lbs: 26.72, geometry_weight_lbs: 26.72, material_cost: 80, steel_cost: 152 });
  const current = make(item)[0]; current.frozen_extended_cost = 40;
  current.pricing_basis_snapshot.reinforcement_frozen_pricing = prior.pricing_basis_snapshot.reinforcement_frozen_pricing;
  const [row] = partsModel.productParts({ ...product, parts: [current] });
  assert.equal(row.quantity, 20); assert.equal(row.extended_cents, 4000);
  assert.equal(row.foundation_reinforcement_handoff.last_calculated.quantity, 40);
  const [converted] = await manifest([current]);
  assert.equal(converted.quantity, 20); assert.equal(converted.extended_cost, 40);
});
const unknown = make()[1];
delete unknown.pricing_basis_snapshot.reinforcement_frozen_pricing;
unknown.frozen_unit_cost = 72;
const [unknownRow] = await manifest([unknown]);
await check("unknown legacy hourly basis stays absent through JSON and both normalization paths", () => {
  const row = stored(unknownRow);
  assert.equal(Object.hasOwn(row, "quantity"), false); assert.equal(Object.hasOwn(row, "unit_cost"), false);
  for (const source of [row, unknown]) {
    const [actual] = partsModel.productParts({ ...product, parts: [source] });
    assert.equal(actual.quantity, null); assert.equal(actual.unit_cost_cents, null);
    assert.equal(actual.unit, ""); assert.equal(actual.extended_cents, 7200);
  }
});
await check("catalog enrichment cannot invent missing historical hours or a72-per-hour rate", () => {
  const row = stored(unknownRow);
  const fakeCurrentCatalog = [{ ...row, quantity: 1.2, unit: "hr", unit_cost: 999, extended_cost: 1198.8 }];
  const [actual] = partsModel.productParts({ ...product, parts: [row] }, { partsCatalog: fakeCurrentCatalog });
  assert.equal(actual.quantity, null); assert.equal(actual.unit_cost_cents, null); assert.equal(actual.extended_cents, 7200);
  assert.equal(actual.enriched, false); assert.deepEqual(actual.enriched_fields, []);
});
const zero = clone(base); zero.custom_rebar_qty = 0;
Object.assign(zero, { rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 72 });
Object.assign(zero.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, steel_cost: 72 });
const zeroRows = await manifest(make(zero));
await check("priced zero never erases physical20 or becomes one priced foot in the Work Order", () => {
  const rows = partsModel.productParts({ ...product, parts: stored(zeroRows) });
  const steel = rows.find(row => row.part_type === "material");
  assert.equal(steel.quantity, 0); assert.equal(steel.extended_cents, 0); assert.equal(steel.unit_cost_cents, 200);
  assert.equal(steel.foundation_reinforcement_handoff.last_calculated.reinforcement_snapshot.physical_quantity_ft, 20);
  assert.equal(partsModel.partsSummary(product, rows).total_cost_cents, 7200);
});
const ordinary = [
  { id: "ordinary-material", builder_product_id: "synthetic-builder", part_key: "ordinary",
    part_name: "Ordinary material", part_type: "material", quantity: 20, unit: "ft",
    frozen_unit_cost: 2, frozen_extended_cost: 40, is_active: true },
  { ...make()[0], id: "independent-part", builder_sync_state: "detached_override",
    manual_cost_override: true, manual_cost: 7, frozen_extended_cost: 140 },
];
await check("ordinary and independent manifests and normalized rows match their frozen pre-change behavior", async () => {
  assert.deepEqual(await manifest(ordinary), await beforeConversion.buildEstimateMaterialsManifest(estimate, { parts: ordinary }));
  const actual = partsModel.productParts({ ...product, parts: ordinary });
  assert.deepEqual(actual, beforeParts.productParts({ ...product, parts: ordinary }));
  assert.ok(actual.every(row => !Object.hasOwn(row, "foundation_reinforcement_handoff")));
});
for (const model of printModels) {
  await check(`${model.name} shop print preserves ordinary rows and unrelated fields while keeping unknown Product costs unknown`, () => {
    const wo = { id: "synthetic-work-order", title: "Synthetic", products: [], materials: [
      { part_name: "Ordinary steel", part_type: "material", quantity: 20, unit: "ft", unit_cost: 2, extended_cost: 40 },
    ] };
    const actual = model.actual.buildWorkOrderPrintModel(wo, printOptions);
    const before = model.before.buildWorkOrderPrintModel(wo, printOptions);
    const expected = { ...before, fmt: undefined, totals: { ...before.totals, internal: {
      ...before.totals.internal, total_cost: null, total_margin: null, margin_pct: null,
    } } };
    assert.deepEqual({ ...actual, fmt: undefined }, expected);
    assert.equal(actual.totals.internal.total_cost, null);
    assert.equal(actual.totals.internal.total_margin, null);
    assert.deepEqual(Object.keys(actual.fmt).sort(), Object.keys(before.fmt).sort());
    for (const key of Object.keys(before.fmt)) {
      const samples = key === "fmtDate" ? ["", "2026-11-06", null] : [undefined, null, "", 0, 2, 40, 72.555];
      for (const sample of samples) assert.equal(actual.fmt[key](sample), before.fmt[key](sample), `${key}(${sample})`);
    }
    const html = renderer.renderOriginalHtml(actual, { autoPrint: false });
    assert.equal((html.match(/class="wo-table-scroll"/g) || []).length, 2);
    assert.equal(withoutScrollRegions(html), withoutScrollRegions(beforeRenderer.renderOriginalHtml(actual, { autoPrint: false })));
  });
  await check(`${model.name} shop print separates priced0 and physical20 and escapes the review note`, () => {
    const wo = { id: "synthetic-work-order", materials: stored(zeroRows) };
    wo.materials.find(row => row.part_type === "material").foundation_reinforcement_handoff.last_calculated
      .reinforcement_snapshot.material.name = "<img src=x onerror=alert(1)>";
    const steel = wo.materials.find(row => row.part_type === "material");
    steel.foundation_reinforcement_handoff.definition_reference.reinforcement_cost_snapshot.material.name = "<img src=x onerror=alert(1)>";
    const actual = model.actual.buildWorkOrderPrintModel(wo, printOptions);
    const material = actual.materials.find(row => row.type === "material");
    assert.equal(material.qty, 0); assert.equal(material.unit_cost, 2); assert.equal(material.ext_cost, 0);
    assert.ok(material.reinforcement_note.includes("Frozen priced quantity: 0 ft."));
    assert.ok(material.reinforcement_note.includes("Physical steel (last calculated): 20 ft; 13.36 lb."));
    assert.ok(material.reinforcement_note.includes("not a purchasing plan"));
    const html = renderer.renderOriginalHtml(actual, { autoPrint: false });
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!html.includes("<img src=x onerror=alert(1)>"));
    assert.ok(html.includes("Engineering and purchasing review required."));
  });
  await check(`${model.name} shop print retains72 without creating hourly pricing for unknown history`, () => {
    const actual = model.actual.buildWorkOrderPrintModel({ materials: [stored(unknownRow)] }, printOptions);
    assert.equal(actual.materials.length, 1);
    const [row] = actual.materials;
    assert.equal(row.qty, ""); assert.equal(row.unit, ""); assert.equal(row.unit_cost, null); assert.equal(row.ext_cost, 72);
    assert.ok(row.reinforcement_note.includes("Not recorded"));
    const html = renderer.renderOriginalHtml(actual, { autoPrint: false });
    assert.ok(html.includes("$72.00")); assert.ok(!html.includes("$72.00 / hr"));
    assert.ok(html.includes("Frozen quantity and unit cost: Not recorded."));
  });
}
await check("manifest and normalization reject corrupt v2 state instead of silently using generic pricing", async () => {
  const invalid = make()[0]; invalid.current_extended_cost = 41;
  await assert.rejects(manifest([invalid]), error => error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID");
  assert.throws(() => partsModel.productParts({ ...product, parts: [invalid] }),
    error => error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID");
});
await check("pure integration never reads or writes SDK records", () => {
  assert.deepEqual(globalThis.__unexpectedHandoff, []);
  for (const [file, meta] of Object.entries(graphs)) {
    assert.ok(!Object.keys(meta.inputs).some(input => input.includes("node_modules/@base44/")), file);
  }
});
fs.writeFileSync(DIR + "work-order-consumers-meta.json", JSON.stringify(graphs, null, 2) + "\n");
fs.writeFileSync(DIR + "work-order-consumers-verification.json", JSON.stringify({ synthetic: true, results,
  unexpectedOperations: globalThis.__unexpectedHandoff }, null, 2) + "\n");
if (results.every(row => row.ok)) {
  const fixtures = [
    { name: "zero", rows: zeroRows, expected: [
      { type: "material", quantity: "0 ft", unitCost: "$2.00", extended: "$0.00",
        note: ["Frozen priced quantity: 0 ft.", "Physical steel (last calculated): 20 ft; 13.36 lb.", "not a purchasing plan"] },
      { type: "labor", quantity: "1.2 hr", unitCost: "$60.00", extended: "$72.00",
        note: ["Frozen priced quantity: 1.2 hr.", "Last-calculated labor: 1.2 hr."] },
    ] },
    { name: "unknown-labor", rows: [unknownRow], expected: [
      { type: "labor", quantity: "\u2014", unitCost: "", extended: "$72.00",
        note: ["Frozen quantity and unit cost: Not recorded.", "Last-calculated labor: 1.2 hr."] },
    ] },
    { name: "ordinary", rows: [{ part_name: "Ordinary steel", part_type: "material", quantity: 20,
      unit: "ft", unit_cost: 2, extended_cost: 40 }], expected: [
      { type: "material", quantity: "20 ft", unitCost: "$2.00", extended: "$40.00", note: [] },
    ] },
  ];
  const capture = [];
  for (const model of printModels) {
    for (const fixture of fixtures) {
      const wo = { id: "synthetic-work-order", materials: stored(fixture.rows) };
      const actual = model.actual.buildWorkOrderPrintModel(wo, printOptions);
      const before = model.before.buildWorkOrderPrintModel(wo, printOptions);
      const name = `${model.name}-${fixture.name}`;
      const file = `print-frozen-${name}.html`, baseline = `print-before-${name}.html`;
      fs.writeFileSync(DIR + file, renderer.renderOriginalHtml(actual, { autoPrint: false }));
      fs.writeFileSync(DIR + baseline, beforeRenderer.renderOriginalHtml(before, { autoPrint: false }));
      capture.push({ name, file, baseline, expected: fixture.expected });
    }
  }
  fs.writeFileSync(DIR + "work-order-print-frozen-cases.json", JSON.stringify({ fixtures: capture }, null, 2) + "\n");
}
console.log(`Work Order consumers: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
