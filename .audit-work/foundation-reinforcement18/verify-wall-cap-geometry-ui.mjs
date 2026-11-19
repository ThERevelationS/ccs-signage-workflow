import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: ["src/components/estimator/foundation/FoundationWallCapsPanel.jsx"],
  bundle: true, platform: "node", format: "esm", jsx: "automatic",
  alias: { "@": path.resolve("src") }, external: ["react", "react-dom", "react/*", "react-dom/*"],
  outfile: DIR + "wall-cap-geometry-ui.mjs", metafile: true,
});
assert.ok(built.metafile.inputs["src/components/estimator/foundation/FoundationWallCapsPanel.jsx"]);
assert.ok(built.metafile.inputs["src/components/estimator/foundation/wallCapCalculator.js"]);
const win = {}; win.self = win; win.top = win; globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { default: Panel } = await import(pathToFileURL(path.resolve(DIR + "wall-cap-geometry-ui.mjs")));
const cap = Object.freeze({ component_id: "piece", id: "piece", cap_inventory_id: "a",
  length_inches: 18, cost: 21, cap_name: "Saved cap", stock_length_inches: 48 });
const stock = Object.freeze({ id: "a", material_type: "wall_cap", material_name: "A",
  cap_stock_length_inches: 48, cap_stock_price: 25 });
const longer = Object.freeze({ ...stock, id: "b", material_name: "B", cap_stock_length_inches: 96 });
const shorter = Object.freeze({ ...longer, cap_stock_length_inches: 12 });
const text = node => typeof node === "string" ? node : (node.children || []).map(text).join(" ");
const results = [];
let opened = [];
async function fixture(caps = [cap], options = [stock, longer]) {
  const calls = [];
  const props = next => ({ caps: next, options, onChange: value => { calls.push(value); } });
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(Panel, props(caps))); });
  opened.push(view);
  return { root: view.root, calls, last: () => calls.at(-1),
    update: async next => { await act(async () => { view.update(React.createElement(Panel, props(next))); }); } };
}
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
  finally {
    for (const view of opened) await act(async () => { view.unmount(); });
    opened = [];
  }
}
await check("material replacement keeps the authored cut and all raw snapshot fields", async () => {
  const f = await fixture();
  await act(async () => { f.root.findByProps({ "aria-label": "Cap material" }).props.onChange({ target: { value: "b" } }); });
  assert.equal(f.calls.length, 1); assert.deepEqual(f.last()[0], { ...cap, cap_inventory_id: "b" });
});
await check("shorter stock does not silently shorten a requested cut", async () => {
  const f = await fixture([cap], [stock, shorter]);
  await act(async () => { f.root.findByProps({ "aria-label": "Cap material" }).props.onChange({ target: { value: "b" } }); });
  assert.equal(f.last()[0].length_inches, 18); assert.equal(f.last()[0].cost, 21);
  await f.update(f.last());
  assert.equal(f.root.findByType("input").props["aria-invalid"], true);
  assert.ok(text(f.root).includes("selected stock length (12 in)"));
  assert.ok(text(f.root).includes("Saved stock length:"));
});
await check("clearing a cut stays blank and cannot revert to an explicit legacy hint", async () => {
  const f = await fixture([{ ...cap, cut_length_inches: 18 }]);
  await act(async () => { f.root.findByType("input").props.onChange({ target: { value: "" } }); });
  assert.equal(f.last()[0].length_inches, ""); assert.equal(f.last()[0].cost, 21);
  await f.update(f.last());
  const input = f.root.findByType("input");
  assert.equal(input.props.value, ""); assert.equal(input.props["aria-invalid"], true);
  const id = input.props["aria-describedby"]; assert.equal(typeof id, "string");
  assert.ok(text(f.root.findByProps({ id })).includes("finite positive cut length"));
});
await check("a negative cut is not changed into a one-inch cut", async () => {
  const f = await fixture();
  await act(async () => { f.root.findByType("input").props.onChange({ target: { value: "-1" } }); });
  assert.equal(f.last()[0].length_inches, -1);
  await f.update(f.last()); assert.equal(f.root.findByType("input").props["aria-invalid"], true);
});
await check("valid decimal input keeps numeric storage and source identity", async () => {
  const f = await fixture();
  await act(async () => { f.root.findByType("input").props.onChange({ target: { value: "12.5" } }); });
  assert.equal(f.last()[0].length_inches, 12.5); assert.equal(f.last()[0].component_id, "piece");
  assert.equal(f.last()[0].cost, 21);
});
await check("adding with unrecorded stock dimensions does not invent a 48-inch cut", async () => {
  const f = await fixture([], [{ ...stock, cap_stock_length_inches: undefined }]);
  await act(async () => { f.root.findByType("button").props.onClick(); });
  assert.equal(f.last()[0].length_inches, ""); assert.equal(Object.hasOwn(f.last()[0], "cost"), false);
});
await check("explicit Add may initialize a full cut from a genuinely recorded stock length", async () => {
  const f = await fixture([], [stock]);
  await act(async () => { f.root.findByType("button").props.onClick(); });
  assert.equal(f.last()[0].length_inches, 48);
});
await check("a recorded legacy-only cut is displayed without auto-migration or a change on mount", async () => {
  const legacy = { ...cap, cut_length_inches: 18 }; delete legacy.length_inches;
  const f = await fixture([Object.freeze(legacy)]);
  assert.equal(f.root.findByType("input").props.value, 18); assert.equal(f.calls.length, 0);
  await act(async () => { f.root.findByProps({ "aria-label": "Cap material" }).props.onChange({ target: { value: "b" } }); });
  assert.equal(Object.hasOwn(f.last()[0], "length_inches"), false); assert.equal(f.last()[0].cut_length_inches, 18);
});
await check("an unrecorded saved cut stays blank rather than displaying a fabricated full-stock cut", async () => {
  const missing = { ...cap }; delete missing.length_inches;
  const f = await fixture([missing]);
  assert.equal(f.root.findByType("input").props.value, ""); assert.equal(f.root.findByType("input").props["aria-invalid"], true);
  assert.equal(f.calls.length, 0);
});
await check("a malformed stored cut is not passed as an object into a number control", async () => {
  const f = await fixture([{ ...cap, length_inches: {} }]);
  assert.equal(f.root.findByType("input").props.value, ""); assert.equal(f.root.findByType("input").props["aria-invalid"], true);
});
await check("oversized input remains visible with an accessible stock-fit diagnostic", async () => {
  const f = await fixture([{ ...cap, length_inches: 49 }], [stock]);
  const input = f.root.findByType("input");
  assert.equal(input.props.value, 49); assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-label"], "Cap 1 cut length (inches)");
  assert.ok(text(f.root).includes("no extra quantity is assumed"));
  assert.ok(text(f.root).includes("Saved amounts (not current pricing)"));
});
await check("unknown live stock is clearly distinct from a saved 48-inch snapshot", async () => {
  const f = await fixture([cap], [{ ...stock, cap_stock_length_inches: null }]);
  assert.equal(f.root.findByType("input").props.value, 18);
  assert.ok(text(f.root).includes("Saved stock length:"));
  assert.ok(text(f.root).includes("selected catalog stock length must be a recorded finite positive number"));
  assert.equal(f.calls.length, 0); assert.equal(cap.length_inches, 18); assert.equal(cap.cost, 21);
});
fs.writeFileSync(DIR + "wall-cap-geometry-ui-verification.json", JSON.stringify({ results, syntheticOnly: true,
  actualBusinessWrites: 0, reinforcementV2Activated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
