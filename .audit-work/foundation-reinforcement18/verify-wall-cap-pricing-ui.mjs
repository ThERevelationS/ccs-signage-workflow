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
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: DIR + "wall-cap-pricing-ui.mjs",
  alias: { "@": path.resolve("src") }, external: ["react", "react-dom", "react/*", "react-dom/*"],
});
const windowStub = {};
windowStub.self = windowStub;
windowStub.top = windowStub;
globalThis.window = windowStub;
const { default: Panel } = await import(pathToFileURL(path.resolve(DIR + "wall-cap-pricing-ui.mjs")));
const model = await build({
  entryPoints: ["src/components/estimator/foundation/wallCapCalculator.js"], bundle: true,
  platform: "node", format: "esm", write: false,
});
const { calcWallCaps } = await import("data:text/javascript;base64," + Buffer.from(model.outputFiles[0].text).toString("base64"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cap = freeze({ id: "cap", cap_inventory_id: "inventory-one", length_inches: 18,
  cost: 21, cap_name: "Acknowledged cap", stock_length_inches: 48 });
const row = freeze({ id: "inventory-one", material_type: "wall_cap",
  material_name: "Synthetic cap", cap_stock_price: 25, cap_stock_length_inches: 48 });
const text = node => !node ? "" : typeof node === "string" ? node : (Array.isArray(node) ? node : node.children || []).map(text).join(" ");
const cases = [
  { name: "invalid live rate shows the saved cost as saved despite an available material option", inventory: [{ ...row, cap_stock_price: null }], caps: [cap], amount: "$21.00", saved: true },
  { name: "valid full stock rate is current and never labeled as a frozen amount", inventory: [row], caps: [cap], amount: "$25.00", saved: false },
  { name: "explicit catalog zero is current and visible as zero, not unavailable", inventory: [{ ...row, cap_stock_price: 0 }], caps: [cap], amount: "$0.00", saved: false },
  { name: "missing history stays Not saved without a fabricated zero cost", inventory: [{ ...row, cap_stock_price: null }], caps: [{ ...cap, cost: undefined }], amount: "Not saved", saved: true, noZero: true },
  { name: "recorded zero history remains saved zero when the current price is missing", inventory: [{ ...row, cap_stock_price: "" }], caps: [{ ...cap, cost: 0 }], amount: "$0.00", saved: true },
  { name: "deleted material keeps its unavailable selection and acknowledged amount", inventory: [], caps: [cap], amount: "$21.00", saved: true, missing: true },
];
const results = [];
for (const scenario of cases) {
  const inventory = freeze(scenario.inventory), original = JSON.stringify(scenario.caps), caps = freeze(calcWallCaps(freeze(scenario.caps), inventory).caps);
  let renderer, calls = 0;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(Panel, { caps, options: inventory, onChange: () => { calls += 1; } })); });
    const view = text(renderer.toJSON());
    assert.ok(view.includes(scenario.amount), view);
    assert.equal(view.includes("Saved amounts (not current pricing)"), scenario.saved, view);
    if (scenario.noZero) assert.ok(!view.includes("$0.00"));
    if (scenario.missing) assert.ok(view.includes("Catalog cap unavailable"));
    assert.equal(calls, 0); assert.equal(JSON.stringify(scenario.caps), original);
    results.push({ name: scenario.name, ok: true }); console.log("ok", scenario.name);
  } catch (error) { results.push({ name: scenario.name, ok: false, error: error.stack }); console.error("FAIL", scenario.name, error.message); }
  finally { if (renderer) await act(async () => { renderer.unmount(); }); }
}
fs.writeFileSync(DIR + "wall-cap-pricing-ui-verification.json", JSON.stringify({
  results, syntheticOnly: true, sdkCalls: 0, financialValuesWritten: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
