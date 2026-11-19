// Ordinary UI verification for the masonry (wall material) pricing candidates.
// Server-renders the actual candidate FoundationWallsPanel + FoundationBOM with
// frozen lead-authored core candidates (wallCalculator/foundationCalc/
// foundationCatalogIntegrity) and asserts on the produced markup.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const foundation = "/app/src/components/estimator/foundation/";
const require2 = createRequire(import.meta.url);
const read = name => JSON.parse(fs.readFileSync(dir + name, "utf8"));
const hash = text => createHash("sha256").update(text).digest("hex");

const sources = new Map();
for (const file of read("wall-cap-geometry-sandbox-final-scope.json").files)
  sources.set("/app/" + file.path, file.text ?? file.normalized);
for (const artifact of [
  "wall-cap-physical-source.json",
  "wall-cap-geometry-remote-validation.json",
  "masonry-material-pole-source.json",
]) for (const file of read(artifact).files) sources.set("/app/" + file.path, file.content);
for (const name of ["wallCalculator.js", "foundationCalc.js", "foundationCatalogIntegrity.js",
                    "FoundationWallsPanel.jsx", "FoundationBOM.jsx"])
  sources.set(foundation + name, fs.readFileSync(dir + "masonry-material-candidate-" + name, "utf8"));

// server-render test stubs for UI primitives and the closed visual editor
sources.set("/app/src/components/ui/button.jsx",
  'import React from "react";\nexport const Button = (p) => React.createElement("button", p);\nexport default Button;\n');
sources.set("/app/src/components/ui/input.jsx",
  'import React from "react";\nexport const Input = (p) => React.createElement("input", p);\nexport default Input;\n');
sources.set(foundationStub(), 'import React from "react";\nexport default function WallShapeEditor(){ return null; }\n');
function foundationStub() { return "/app/src/components/estimator/foundation/WallShapeEditor.jsx"; }
// server-render test stubs: lucide icons render nothing
sources.set("/app/node_modules-stub/lucide-react.js",
  'export const Trash2 = () => null;\nexport const Plus = () => null;\nexport const PenLine = () => null;\n');

const entry = "/app/masonry-ui-entry.jsx";
sources.set(entry, `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FoundationWallsPanel from "${foundation}FoundationWallsPanel.jsx";
import FoundationBOM from "${foundation}FoundationBOM.jsx";
import { calcWalls } from "${foundation}wallCalculator.js";
export { React, renderToStaticMarkup, FoundationWallsPanel, FoundationBOM, calcWalls };
`);

const loaded = {};
const build = await esbuild.build({
  entryPoints: [entry], bundle: true, platform: "node", format: "cjs",
  write: false, metafile: true, logLevel: "silent", jsx: "automatic",
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
  plugins: [{
    name: "exact-sandbox-source",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        let base;
        if (args.path === "lucide-react") base = "/app/node_modules-stub/lucide-react";
        else if (args.path.startsWith("/app/")) base = args.path;
        else if (args.path.startsWith("@/")) base = "/app/src/" + args.path.slice(2);
        else if (args.path.startsWith("."))
          base = path.posix.resolve(path.posix.dirname(args.importer), args.path);
        else return { external: true };
        const resolved = [base, base + ".js", base + ".jsx"].find(p => sources.has(p));
        if (!resolved) throw Error("Missing frozen source; do not use held local work: " + args.path);
        return { path: resolved, namespace: "sandbox-source" };
      });
      builder.onLoad({ filter: /.*/, namespace: "sandbox-source" }, args => {
        const contents = sources.get(args.path);
        loaded[args.path] = hash(contents);
        return { contents, loader: args.path.endsWith(".jsx") ? "jsx" : "js" };
      });
    },
  }],
});
assert.deepEqual(build.warnings, []);
const module = { exports: {} };
new Function("module", "exports", "require", build.outputFiles[0].text)(module, module.exports, require2);
const { React, renderToStaticMarkup, FoundationWallsPanel, FoundationBOM, calcWalls } = module.exports;
const { createElement: ce } = React;

const { fixture: seed } = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8"));
const clone = () => JSON.parse(JSON.stringify(seed));
const results = [];
const html = {};

function render(x, pricingUnavailable, itemPricing = [], name = "") {
  const panel = renderToStaticMarkup(React.createElement(FoundationWallsPanel,
    { walls: x.project.walls, options: x.inventory, onChange: () => {} }));
  const bom = renderToStaticMarkup(React.createElement(FoundationBOM,
    { walls: x.project.walls, totals: {}, inventory: x.inventory, itemPricing, pricingUnavailable }));
  const h = panel + "\n" + bom;
  if (name) html[name] = h;
  return { panel, bom, all: h };
}
const has = (h, s) => assert.ok(h.includes(s), "expected to find: " + s);
const notHas = (h, s) => assert.ok(!h.includes(s), "expected NOT to find: " + s);
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e.stack }); }
}

// 1. current valid: 6 units * 2 = 12 material + 45 labor = 57
check("current valid", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.project.walls = calcWalls(x.project, x.inventory, x.settings);
  const { all, panel, bom } = render(x, false, [], "valid");
  has(panel, "$57.00");
  has(bom, "Synthetic wall units"); has(bom, "6 units"); has(bom, "$12.00");
  notHas(all, "Saved amounts"); notHas(all, "Pricing unavailable");
});
// 2. missing rate with ACK
check("missing rate with acknowledged snapshot", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.inventory[0].cost_per_unit = null;
  const { all, panel, bom } = render(x, true, [{ available: false, issues: [{ message: "Wall 1: record a finite nonnegative price." }] }], "ack-missing");
  has(panel, "$408.00"); has(panel, "Saved amounts (not current pricing)");
  has(panel, "wall-0-pricing");
  has(bom, "6 units"); has(bom, "$321.00"); has(bom, "$17.00"); has(bom, "Pricing unavailable");
  has(panel, "Not saved"); // courses/laborhrs/linear not recorded in ACK
  notHas(bom, "Synthetic wall units"); // saved rows must not claim the current catalog name
});
// 3. new row missing rate, no ACK
check("new row missing rate without acknowledgment", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.inventory[0].cost_per_unit = null;
  x.project.walls[0].calculatedCosts = {};
  const { all, bom } = render(x, true, [{ available: false, issues: [{ message: "Wall 1: record a finite nonnegative price." }] }], "new-unknown");
  has(all, "Not saved"); has(all, "Pricing unavailable"); has(all, "Saved amounts (not current pricing)");
  notHas(all, "$0.00");
});
// 4. genuine zero rate
check("genuine zero rate", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.inventory[0].cost_per_unit = 0;
  x.project.walls = calcWalls(x.project, x.inventory, x.settings);
  const { all, bom } = render(x, false, [], "zero");
  has(all, "$45.00"); has(bom, "$0.00"); has(bom, "6 units");
  notHas(all, "Pricing unavailable"); notHas(all, "Saved amounts");
});
// 5. internal rate missing
check("internal missing rate keeps acknowledged snapshot", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.inventory.push({ id: "internal-mat", material_type: "wall_material",
    material_name: "InnerMat", wall_material_subtype: "concrete",
    wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 4,
    cost_per_unit: null });
  const saved = JSON.parse(JSON.stringify(x.project.walls));
  x.project.walls[0].includeInternalWall = true;
  x.project.walls[0].internalMaterialId = "internal-mat";
  x.project.walls = calcWalls(x.project, x.inventory, x.settings, { savedWalls: saved });
  const { all, panel, bom } = render(x, true, [{ available: false, issues: [{ message: "Wall 1: internal price unavailable." }] }], "internal-missing");
  has(panel, "$408.00"); has(panel, "Saved amounts (not current pricing)");
  has(panel, "wall-0-pricing"); notHas(bom, "InnerMat"); // saved rows must not claim the current catalog name
});
// 6. both outer+internal missing -> two messages, no dup key crash
check("both outer and internal missing", () => {
  const x = JSON.parse(JSON.stringify(seed));
  x.inventory[0].cost_per_unit = null;
  x.project.walls[0].includeInternalWall = true;
  x.project.walls[0].internalMaterialId = "internal-mat";
  const errs = [];
  const oldErr = console.error; console.error = (m) => errs.push(String(m));
  let h;
  try { h = render(x, true, [], "both-missing").all; } finally { console.error = oldErr; }
  const m = h.match(/<p>/g);
  assert.ok(m && m.length >= 2, "expected >=2 issue paragraphs");
  has(h, "Saved amounts (not current pricing)");
  assert.ok(!errs.some(e => /same key|duplicate key/i.test(e)), "duplicate key warning: " + errs.join(";"));
});

const okCount = results.filter(r => r.ok).length;
for (const r of results) console.log((r.ok ? "ok " : "FAIL ") + r.name + (r.ok ? "" : " :: " + r.error.split("\n")[0]));
fs.writeFileSync(dir + "masonry-ui-verification.json", JSON.stringify({ results, loaded }, null, 2));
fs.writeFileSync(dir + "masonry-ui-html.json", JSON.stringify(html, null, 2));
fs.writeFileSync(dir + "masonry-ui-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs) }, null, 2));
console.log(`masonry-ui passed=${okCount} failed=${results.length - okCount}`);
if (okCount !== results.length) process.exit(1);
