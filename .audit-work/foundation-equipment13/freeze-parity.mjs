import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { calcEquipment } from "../foundation-catalog-pricing11/calc-b.mjs";

const root = ".audit-work/foundation-equipment13";
const input = JSON.parse(fs.readFileSync(`${root}/frozen-inputs.json`, "utf8"));
const observations = JSON.parse(fs.readFileSync(`${root}/observed-defects.json`, "utf8")).observed;
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const clone = value => JSON.parse(JSON.stringify(value));
const inventory = [
  { ...input.inventory[0], cost_per_week: 500, cost_per_month: 1500 },
  { ...input.inventory[1], cost_per_week: 60, cost_per_month: 180, compatible_sub_attachment_ids: ["sub"] },
  { id: "sub", material_type: "sub_attachment", material_name: "Synthetic extension", cost_per_day: 7, cost_per_week: 30, cost_per_month: 90 },
];
const base = {
  _id: "row-parity", equipment_id: "eq", rental_period: "day", rental_duration: 1,
  include_delivery: false, attachment_counts: {}, sub_attachment_counts: {},
  equipment_cost: 123, authored_metadata: { preserve: "unchanged" },
};
const cases = [];
// These three results are already derived/checked. Reuse them as frozen data.
for (const [name, entry, amount] of [
  ["existing-render-conflict", observations.renderMutation.before, observations.renderMutation.engineBefore],
  ["existing-normalized", observations.normalizedAttachmentsIgnoredByUi.entry, observations.normalizedAttachmentsIgnoredByUi.engineCost],
  ["existing-zero-overrides", observations.zeroOverridesIgnoredByUi.entry, observations.zeroOverridesIgnoredByUi.engineCost],
]) {
  cases.push({ name, entry, inventory: input.inventory, expected: { ...entry, equipment_cost: amount } });
}
const specs = [
  ["daily", {}, 100],
  ["weekly-two", { rental_period: "week", rental_duration: 2 }, 1000],
  ["monthly", { rental_period: "month" }, 1500],
  ["legacy-duration-zero-fallback", { rental_duration: 0 }, 100],
  ["custom-quantity-zero", { custom_qty: 0 }, 0],
  ["custom-quantity-two", { custom_qty: 2 }, 200],
  ["custom-rate-zero", { custom_rate: 0 }, 0],
  ["custom-rate-and-quantity", { custom_rate: 7.5, custom_qty: 2 }, 15],
  ["flat-delivery", { rental_duration: 2, include_delivery: true }, 220],
  ["delivery-override-zero", { include_delivery: true, custom_delivery_charge: 0 }, 100],
  ["legacy-negative-rate-preserved-not-approved", { custom_rate: -3, custom_qty: 2 }, -6],
  ["counts-two", { attachment_counts: { att: 2 } }, 130],
  ["counts-zero", { attachment_counts: { att: 0 } }, 100],
  ["counts-numeric-string", { attachment_counts: { att: "2" } }, 130],
  ["legacy-id", { attachment_counts: null, attachment_ids: ["att"] }, 115],
  ["legacy-id-duplicates", { attachment_counts: null, attachment_ids: ["att", "att"] }, 130],
  ["normalized-over-shadows", { attachments: [{ id: "att", qty: 2 }], attachment_counts: { att: 99 }, attachment_ids: ["att"] }, 130],
  ["normalized-inventory-id", { attachments: [{ inventory_id: "att", qty: 2 }] }, 130],
  ["legacy-normalized-zero-is-one", { attachments: [{ id: "att", qty: 0 }] }, 115],
  ["normalized-default-one", { attachments: [{ id: "att" }] }, 115],
  ["normalized-duplicates", { attachments: [{ id: "att", qty: 1 }, { id: "att", qty: 2 }] }, 145],
  ["sub-without-parent-still-priced", { sub_attachment_counts: { sub: 2 } }, 114],
  ["attachment-plus-sub", { attachment_counts: { att: 1 }, sub_attachment_counts: { sub: 3 } }, 136],
  ["null-duration-and-quantity", { rental_duration: null, custom_qty: null }, 100],
  ["unknown-period-legacy-flat-delivery", { rental_period: "hour", include_delivery: true }, 20],
  ["empty-counts-win-over-ids", { attachment_counts: {}, attachment_ids: ["att"] }, 100],
];
for (const [name, patch, amount] of specs) {
  const entry = freeze({ ...clone(base), ...clone(patch) });
  const frozenInventory = freeze(clone(inventory));
  const expected = calcEquipment([entry], frozenInventory)[0];
  assert.equal(expected.equipment_cost, amount, name);
  assert.deepEqual(entry, { ...clone(base), ...clone(patch) }, `${name}: original engine mutated source`);
  cases.push({ name, entry, inventory: frozenInventory, expected });
}
const sources = {};
for (const name of ["foundationCalc.js", "legacyFoundationCalc.js", "poleCalculator.js", "wallCalculator.js", "wallCapCalculator.js", "foundationCatalogIntegrity.js"]) {
  const file = `src/components/estimator/foundation/${name}`;
  sources[file] = fs.readFileSync(file, "utf8");
}
fs.copyFileSync(".audit-work/foundation-catalog-pricing11/calc-b.mjs", `${root}/engine-before.mjs`);
fs.writeFileSync(`${root}/engine-source-before.json`, JSON.stringify(sources, null, 2));
fs.writeFileSync(`${root}/complete-catalog-parity-inputs.json`, JSON.stringify({
  synthetic: true,
  note: "Frozen original economics, not approval of legacy invalid values; three existing diagnostic results reused, new cases checked with literal anchors on original real engine.",
  cases,
}, null, 2));
fs.writeFileSync(`${root}/frozen-original-hashes.json`, JSON.stringify({
  engine: crypto.createHash("sha256").update(fs.readFileSync(`${root}/engine-before.mjs`)).digest("hex"),
  sources: Object.fromEntries(Object.entries(sources).map(([file, body]) => [file, crypto.createHash("sha256").update(body).digest("hex")])),
}, null, 2));
console.log(`FROZEN equipment original: ${cases.length} complete-catalog cases; literal financial anchors checked; no source implementation changes.`);
