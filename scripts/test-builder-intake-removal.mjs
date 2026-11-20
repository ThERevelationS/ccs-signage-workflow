import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";
import * as router from "react-router-dom";
import * as jsxRuntime from "react/jsx-runtime";

const entries = {
  Foundation: ["foundation", "FoundationProject"],
  ChannelLetter: ["channel_letters", "ChannelLetterInstallation"],
  Vinyl: ["vinyl", "VinylProject"],
  CNC: ["cnc", "CNCProject"],
  Laser: ["laser", "LaserProject"],
  Metal: ["metal", "MetalProject"],
  BrickStone: ["brick_stone", "BrickStoneProject"],
  Maintenance: ["maintenance", "MaintenanceProject"],
  Painting: ["painting", "Project"],
  CustomItems: ["custom_items", "CustomItemsProject"],
};
for (const [name, [key, entity]] of Object.entries(entries)) {
  const page = fs.readFileSync(`src/pages/${name}Estimator.jsx`, "utf8");
  assert.match(page, new RegExp(`withStandaloneBuilderRedirect\\(${name}Estimator, "${key}", "${entity}"\\)`), name);
  assert.doesNotMatch(page, /<(?:TabBadgeTrigger|TabBtn|TabsTrigger|TabsContent)\b[^>]*\bvalue=["']project["']/, name);
  assert.doesNotMatch(page, /<(?:Label|label)\b[^>]*>\s*(?:Client Name|Project Name|Estimate Number|Project Link)\b/i, name);
  if (!["Foundation", "BrickStone", "Painting", "CustomItems"].includes(name)) {
    assert.match(page, /useState\("(?:letters|workflows|items)"\)/, `${name} starts on a working tab`);
    assert.match(page, /<TabsContent value="summary"[\s\S]*?<Textarea[^>]*value=\{project\.notes/, `${name} retains notes in Summary`);
  }
  if (name !== "CustomItems") assert.match(page, /onSaveAsCopy=\{embedded \? undefined : handleSaveAsCopy\}/, `${name} hides Save As Copy`);
}
for (const name of ["ChannelLetter", "Vinyl", "Maintenance"]) {
  const page = fs.readFileSync(`src/pages/${name}Estimator.jsx`, "utf8");
  assert.match(page, /Job conditions/);
  assert.match(page, /estimate\?\.site_address/);
  assert.match(page, /<AddressAutocomplete[\s\S]*?value=\{project\.site_address/);
}
for (const name of ["ChannelLetter", "Vinyl", "CNC", "Laser", "Metal", "Maintenance", "Painting"]) {
  const page = fs.readFileSync(`src/pages/${name}Estimator.jsx`, "utf8");
  assert.match(page, /if \(!embedded && \(!project(?:\?)?\.project_name/, `${name} skips intake validation when embedded`);
}
const cnc = fs.readFileSync("src/pages/CNCEstimator.jsx", "utf8");
assert.match(cnc, /Job conditions[\s\S]*?fixed_setup_hours[\s\S]*?setup_time_percentage/);
const maintenance = fs.readFileSync("src/pages/MaintenanceEstimator.jsx", "utf8");
assert.match(maintenance, /Job conditions[\s\S]*?service_interval_months[\s\S]*?Service Environment/);
assert.match(maintenance, /value=\{project\.markup_percent/);
const painting = fs.readFileSync("src/pages/PaintingEstimator.jsx", "utf8");
assert.match(painting, /Job conditions[\s\S]*?paint_supplies_per_sqft/);
assert.match(painting, /Cost Summary[\s\S]*?<Textarea value=\{project\.notes/);
const channel = fs.readFileSync("src/pages/ChannelLetterEstimator.jsx", "utf8");
assert.match(channel, /<TabsContent value="letters"[^>]*>\s*\{jobConditions\}/);
assert.match(channel, /<TabsContent value="items"[^>]*>\s*\{!showLettersTab && jobConditions\}/);
assert.match(channel, /\[activeTab, scope, showLettersTab\]/);

globalThis.__redirectReact = React;
globalThis.__redirectJsx = jsxRuntime;
globalThis.__redirectRouter = router;
globalThis.__redirectEntities = {};
globalThis.__redirectLoadRows = async () => [];
const result = await esbuild.build({
  entryPoints: ["src/components/estimator/aio/StandaloneBuilderRedirect.jsx"],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "redirect-stubs",
    setup(build) {
      const modules = {
        react: "export const useEffect=globalThis.__redirectReact.useEffect, useState=globalThis.__redirectReact.useState;",
        "react/jsx-runtime": "export const jsx=globalThis.__redirectJsx.jsx, jsxs=globalThis.__redirectJsx.jsxs, Fragment=globalThis.__redirectJsx.Fragment;",
        "react-router-dom": "export const Link=globalThis.__redirectRouter.Link, Navigate=globalThis.__redirectRouter.Navigate, useSearchParams=globalThis.__redirectRouter.useSearchParams;",
        "@/components/staff/staffEntities": "export const staffEntities=globalThis.__redirectEntities;",
        "@/lib/loadAllEntityRows": "export const loadAllEntityRows=(...args)=>globalThis.__redirectLoadRows(...args);",
      };
      build.onResolve({ filter: /.*/ }, ({ path }) => modules[path] ? { path, namespace: "stub" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({ contents: modules[path], loader: "js" }));
    },
  }],
});
const { findBuilderEstimate, withStandaloneBuilderRedirect } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const linked = { id: "e1", line_items: [{ module_key: "vinyl", project_id: "p1" }] };
const rows = { e1: linked, wrong: { id: "wrong", line_items: [] } };
let queries = [];
const entities = {
  AllInOneEstimate: { get: async (id) => rows[id] || null },
  VinylProject: { get: async () => ({ estimate_id: "e1" }) },
};
const loadRows = async (options) => { queries.push(options); return [linked]; };
const args = { projectId: "p1", moduleKey: "vinyl", entityName: "VinylProject", entities, loadRows };
assert.equal(await findBuilderEstimate({ ...args, projectId: "" }), null);
assert.equal(await findBuilderEstimate({ ...args, estimateId: "e1" }), "e1");
assert.equal(await findBuilderEstimate({ ...args, estimateId: "wrong" }), "e1");
assert.equal(queries.length, 0);
entities.VinylProject.get = async () => ({});
assert.equal(await findBuilderEstimate(args), "e1");
assert.deepEqual(queries[0].query, { "line_items.project_id": "p1" });
assert.equal(await findBuilderEstimate({ ...args, loadRows: async () => [] }), null);
assert.equal(await findBuilderEstimate({ ...args, loadRows: async () => [{ ...linked, deleted: true }] }), null);
await assert.rejects(() => findBuilderEstimate({ ...args, loadRows: async () => [linked, { ...linked, id: "e2" }] }), /multiple estimates/);
entities.AllInOneEstimate.get = async () => { throw Object.assign(new Error("missing"), { status: 404 }); };
assert.equal(await findBuilderEstimate({ ...args, estimateId: "missing" }), "e1");
entities.VinylProject.get = async () => { throw new Error("offline"); };
await assert.rejects(() => findBuilderEstimate(args), /offline/);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let location;
function LocationProbe() {
  const current = router.useLocation();
  location = current.pathname + current.search;
  return null;
}
const Entry = withStandaloneBuilderRedirect(() => React.createElement("div", { id: "editor" }, "Builder"), "vinyl", "VinylProject");
let reads = 0;
Object.assign(globalThis.__redirectEntities, {
  AllInOneEstimate: { get: async () => { reads++; return linked; } },
  VinylProject: { get: async () => { reads++; return {}; } },
});
globalThis.__redirectLoadRows = async () => { reads++; return []; };
async function mountEntry(route, embedded = false) {
  let tree;
  await act(async () => {
    tree = create(React.createElement(router.MemoryRouter, { initialEntries: [route], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(LocationProbe),
      React.createElement(router.Routes, null,
        React.createElement(router.Route, { path: "/VinylEstimator", element: React.createElement(Entry, { embedded }) }),
        React.createElement(router.Route, { path: "*", element: React.createElement("div", { id: "destination" }) })
      )
    ));
    await Promise.resolve();
  });
  return tree;
}
let tree = await mountEntry("/VinylEstimator?id=p1&estimateId=e1", true);
assert.equal(tree.root.findAllByProps({ id: "editor" }).length, 1);
assert.equal(reads, 0, "embedded mode does not run redirect reads");
await act(async () => tree.unmount());
tree = await mountEntry("/VinylEstimator?id=p1&estimateId=e1");
assert.equal(location, "/EstimateDetail?id=e1");
assert.equal(tree.root.findAllByProps({ id: "editor" }).length, 0);
await act(async () => tree.unmount());
tree = await mountEntry("/VinylEstimator");
assert.equal(location, "/EstimatorProducts");
await act(async () => tree.unmount());
globalThis.__redirectLoadRows = async () => [linked];
tree = await mountEntry("/VinylEstimator?edit=p1");
assert.equal(location, "/EstimateDetail?id=e1", "a project-only link resolves its estimate line");
await act(async () => tree.unmount());
console.log("PASS builder intake removal and standalone redirect");
