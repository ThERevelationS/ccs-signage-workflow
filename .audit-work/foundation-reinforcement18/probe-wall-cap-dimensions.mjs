import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const DIR = ".audit-work/foundation-reinforcement18/";
await build({
  entryPoints: ["src/components/estimator/foundation/FoundationWallCapsPanel.jsx"],
  bundle: true, format: "esm", platform: "node", jsx: "automatic",
  outfile: DIR + "wall-cap-dimensions-baseline-ui.mjs",
  alias: { "@": path.resolve("src") }, external: ["react", "react-dom", "react/*", "react-dom/*"],
});
const win = {}; win.self = win; win.top = win; globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { default: Panel } = await import(pathToFileURL(path.resolve(DIR + "wall-cap-dimensions-baseline-ui.mjs")));
const row = { id: "cap-a", material_type: "wall_cap", material_name: "Synthetic cap A",
  cap_stock_length_inches: 48, cap_stock_price: 25 };
const replacement = { ...row, id: "cap-b", material_name: "Synthetic cap B", cap_stock_length_inches: 96 };
const cap = Object.freeze({ id: "piece", cap_inventory_id: row.id, length_inches: 18, cost: 21,
  stock_length_inches: 48 });
const results = [];
async function render(caps, options, run) {
  let view, patch;
  await act(async () => { view = TestRenderer.create(React.createElement(Panel, {
    caps, options, onChange: next => { patch = next; },
  })); });
  try { await run(view.root, () => patch); }
  finally { await act(async () => { view.unmount(); }); }
}
await render([cap], [row, replacement], async (root, patch) => {
  await act(async () => { root.findByProps({ "aria-label": "Cap material" }).props.onChange({ target: { value: "cap-b" } }); });
  assert.equal(patch()[0].length_inches, 96);
  results.push({ case: "material replacement", authoredCut: 18, selectedStock: 96, emittedCut: patch()[0].length_inches });
});
await render([cap], [row], async (root, patch) => {
  await act(async () => { root.findByType("input").props.onChange({ target: { value: "" } }); });
  assert.equal(patch()[0].length_inches, 1);
  results.push({ case: "cleared cut input", typed: "", emittedCut: patch()[0].length_inches });
});
await render([], [{ ...row, cap_stock_length_inches: undefined }], async (root, patch) => {
  await act(async () => { root.findByType("button").props.onClick(); });
  assert.equal(patch()[0].length_inches, 48);
  results.push({ case: "new cap with missing catalog stock length", catalogStock: null, emittedCut: patch()[0].length_inches });
});
const missing = { ...cap }; delete missing.length_inches;
await render([missing], [row], async root => {
  assert.equal(root.findByType("input").props.value, 48);
  results.push({ case: "unrecorded saved cut input", recordedCut: null, displayedCut: root.findByType("input").props.value });
});
assert.equal(cap.length_inches, 18); assert.equal(cap.cost, 21);
fs.writeFileSync(DIR + "wall-cap-dimension-baseline-probe.json", JSON.stringify({
  syntheticOnly: true, applicationSourceUnchanged: true, results,
}, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
