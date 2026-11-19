import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { calcEquipment } from "../foundation-catalog-pricing11/calc-b.mjs";

const out = ".audit-work/foundation-equipment13";
const clone = value => JSON.parse(JSON.stringify(value));
const input = {
  inventory: [
    { id: "eq", material_type: "excavation_equipment", material_name: "Synthetic drill", cost_per_day: 100, pickup_delivery_cost: 20, is_spread_foot_excavation: true, compatible_attachment_ids: ["att"] },
    { id: "att", material_type: "attachment", material_name: "Synthetic bit", cost_per_day: 15, allow_multiple: true },
  ],
  entry: { _id: "selected-eq", equipment_id: "eq", rental_period: "day", rental_duration: 1, include_delivery: false, attachment_counts: {}, attachment_ids: ["att"], equipment_cost: 100 },
};
fs.writeFileSync(`${out}/frozen-inputs.json`, JSON.stringify(input, null, 2));
const kids = names => names.map(name => `export const ${name}=p=>p.children??null;`).join("\n");
const stubs = {
  "@/components/ui/card": kids(["Card", "CardContent", "CardHeader", "CardTitle"]),
  "@/components/ui/button": "export const Button=p=><button {...p}>{p.children}</button>;",
  "@/components/ui/label": "export const Label=p=><label>{p.children}</label>;",
  "@/components/ui/select": kids(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"]),
  "@/components/ui/badge": "export const Badge=p=><span>{p.children}</span>;",
  "@/components/ui/checkbox": "export const Checkbox=p=><input checked={p.checked} type='checkbox'/>;",
  "lucide-react": "export const Plus=()=>null;export const Trash2=()=>null;export const Wrench=()=>null;",
};
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/FoundationEquipmentTab.jsx"],
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  external: ["react", "react/*"], alias: { "@": path.resolve("src") },
  plugins: [{
    name: "visual-only",
    setup(b) {
      b.onResolve({ filter: /.*/ }, a => Object.hasOwn(stubs, a.path) ? { path: a.path, namespace: "visual" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "visual" }, a => ({ contents: stubs[a.path], loader: "jsx" }));
    },
  }],
});
fs.writeFileSync(`${out}/equipment-real.mjs`, compiled.outputFiles[0].text);
const Equipment = (await import(pathToFileURL(path.resolve(`${out}/equipment-real.mjs`)))).default;
const text = node => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node?.children ? text(node.children) : "";
};
const render = async (entry, inventory) => {
  let root;
  let updates = 0;
  let dirtyCalls = 0;
  try {
    await act(async () => {
      root = TestRenderer.create(React.createElement(Equipment, {
        foundationItems: [{ foundation_type: "spread_foot" }],
        inventory, selectedEquipmentList: [entry],
        onUpdate: () => { updates += 1; }, markDirty: () => { dirtyCalls += 1; },
      }));
    });
    return { text: text(root.toJSON()), updates, dirtyCalls };
  } finally {
    if (root) await act(async () => root.unmount());
  }
};
const observed = {};
{
  const entry = clone(input.entry);
  const before = clone(entry);
  const engineBefore = calcEquipment([entry], input.inventory)[0].equipment_cost;
  const ui = await render(entry, input.inventory);
  const engineAfter = calcEquipment([entry], input.inventory)[0].equipment_cost;
  assert.equal(engineBefore, 100);
  assert.equal(engineAfter, 115);
  assert.deepEqual(before.attachment_counts, {});
  assert.deepEqual(entry.attachment_counts, { att: 1 });
  assert.equal(ui.updates, 0);
  assert.equal(ui.dirtyCalls, 0);
  observed.renderMutation = { before, after: entry, engineBefore, engineAfter, updates: ui.updates, dirtyCalls: ui.dirtyCalls };
}
{
  const entry = { ...clone(input.entry), attachment_ids: [], attachments: [{ id: "att", qty: 2 }] };
  const ui = await render(entry, input.inventory);
  const engineCost = calcEquipment([entry], input.inventory)[0].equipment_cost;
  assert.equal(engineCost, 130);
  assert.ok(ui.text.includes("Total: $100.00"));
  observed.normalizedAttachmentsIgnoredByUi = { entry, engineCost, cardTotalShown: 100 };
}
{
  const entry = { ...clone(input.entry), attachment_ids: [], custom_rate: 0, custom_qty: 2, include_delivery: true, custom_delivery_charge: 0 };
  const ui = await render(entry, input.inventory);
  const engineCost = calcEquipment([entry], input.inventory)[0].equipment_cost;
  assert.equal(engineCost, 0);
  assert.ok(ui.text.includes("Total: $120.00"));
  observed.zeroOverridesIgnoredByUi = { entry, engineCost, cardTotalShown: 120 };
}
{
  const entry = { ...clone(input.entry), attachment_ids: [], equipment_cost: 600 };
  const ui = await render(entry, []);
  const engineCost = calcEquipment([entry], [])[0].equipment_cost;
  assert.equal(engineCost, 0);
  assert.equal(ui.text.includes("Synthetic drill"), false);
  observed.missingEquipment = { savedSnapshot: 600, engineCost, selectedRowVisible: false };
}
{
  const entry = { ...clone(input.entry), attachment_ids: [], attachment_counts: { att: 1 }, equipment_cost: 115 };
  const inventory = input.inventory.filter(row => row.id !== "att");
  const engineCost = calcEquipment([entry], inventory)[0].equipment_cost;
  assert.equal(engineCost, 100);
  observed.missingAttachment = { savedSnapshot: entry.equipment_cost, engineCost };
}
fs.writeFileSync(`${out}/observed-defects.json`, JSON.stringify({
  synthetic: true,
  scope: "Diagnostic reproductions on fresh matched source, not regression acceptance or pricing changes.",
  observed,
}, null, 2));
console.log("OBSERVED: five equipment defects reproduced using real EquipmentTab and real calcEquipment; no source edits.");
