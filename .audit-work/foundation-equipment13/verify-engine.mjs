import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = ".audit-work/foundation-equipment13";
// The src modules import the Vite `@/` alias (loadAllEntityRows, inventory
// normalization) — alias it so the bundle resolves outside Vite.
const alias = { "@": path.resolve("src") };
await build({
  entryPoints: ["src/components/estimator/foundation/foundationCalc.js"],
  bundle: true, format: "esm", outfile: `${root}/engine-after.mjs`, alias,
});
await build({
  entryPoints: ["src/components/estimator/foundation/foundationEquipmentBindings.js"],
  bundle: true, format: "esm", outfile: `${root}/bindings-after.mjs`, alias,
});
const { calcEquipment, calcEquipmentPricing, equipmentCostTotal, calcProject } = await import(pathToFileURL(path.resolve(`${root}/engine-after.mjs`)));
const { setFoundationEquipmentCount: setCount, resolveFoundationEquipment } = await import(pathToFileURL(path.resolve(`${root}/bindings-after.mjs`)));
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cases = JSON.parse(fs.readFileSync(`${root}/complete-catalog-parity-inputs.json`, "utf8")).cases;
const results = [];
for (const c of cases) {
  const entry = freeze(clone(c.entry));
  const inventory = freeze(clone(c.inventory));
  assert.deepEqual(calcEquipment([entry], inventory), [c.expected], c.name);
  const detail = calcEquipmentPricing([entry], inventory)[0];
  assert.deepEqual(detail.pricedEntry, c.expected, c.name);
  assert.deepEqual(detail.issues, [], c.name);
  assert.equal(detail.totalCost, c.expected.equipment_cost, c.name);
  assert.deepEqual(entry, c.entry, `${c.name} mutation`);
  results.push({ case: c.name, pass: true, group: "original_complete_catalog" });
}
const { inventory: inv, entry: base } = JSON.parse(fs.readFileSync(`${root}/frozen-inputs.json`, "utf8"));
const check = (name, fn) => { fn(); results.push({ case: name, pass: true }); };
const priced = (entry, inventory = inv) => calcEquipmentPricing([freeze(clone(entry))], freeze(clone(inventory)))[0];
for (const amount of [600, 0]) {
  check(`missing parent preserves ${amount}`, () => {
    const entry = { ...base, equipment_cost: amount };
    const row = priced(entry, []);
    assert.deepEqual(row.pricedEntry, entry);
    assert.equal(row.issues[0].kind, "equipment");
    assert.equal(row.baseCost, null);
    assert.equal(row.deliveryCost, null);
  });
}
check("missing parent absent snapshot stays absent", () => {
  const entry = clone(base);
  delete entry.equipment_cost;
  assert.equal(Object.hasOwn(priced(entry, []).pricedEntry, "equipment_cost"), false);
});
check("missing selected child preserves whole row, no fresh partial price", () => {
  const entry = { ...base, attachment_counts: { att: 1 }, equipment_cost: 115 };
  const row = priced(entry, inv.filter(i => i.id !== "att"));
  assert.deepEqual(row.pricedEntry, entry);
  assert.equal(row.issues[0].kind, "attachment");
  assert.equal(row.baseCost, null);
  assert.equal(row.attachmentRows[0].cost, null);
});
check("missing sub preserves whole row", () => {
  const entry = { ...base, sub_attachment_counts: { missing_sub: 2 }, equipment_cost: 160 };
  assert.deepEqual(priced(entry).pricedEntry, entry);
  assert.equal(priced(entry).issues[0].kind, "sub_attachment");
});
check("zero map count is inactive, no missing-ref issue", () => {
  const row = priced({ ...base, attachment_counts: { missing: 0 }, sub_attachment_counts: { gone: 0 } });
  assert.deepEqual(row.issues, []);
  assert.equal(row.totalCost, 100);
});
check("normalized numeric zero still rents one and requires a record", () => {
  const entry = { ...base, attachments: [{ id: "missing", qty: 0 }], equipment_cost: 155 };
  assert.deepEqual(priced(entry).pricedEntry, entry);
  assert.equal(priced(entry).issues[0].inventoryId, "missing");
});
check("empty map suppresses unavailable shadow IDs", () => {
  const row = priced({ ...base, attachment_counts: {}, attachment_ids: ["missing"] });
  assert.deepEqual(row.issues, []);
  assert.equal(row.totalCost, 100);
});
check("legacy type restriction is preserved", () => {
  const entry = { ...base, attachment_counts: null, attachment_ids: ["att"], equipment_cost: 115 };
  const row = priced(entry, inv.map(i => i.id === "att" ? { ...i, material_type: "sub_attachment" } : i));
  assert.deepEqual(row.pricedEntry, entry);
  assert.equal(row.issues[0].kind, "attachment");
});
check("project exposes equipment issues and coherent saved subtotal", () => {
  const project = freeze({ items: [], selected_equipment: [{ ...base, equipment_cost: 600 }] });
  const result = calcProject(project, [], {});
  assert.equal(result.totals.total_equipment_cost, 600);
  assert.equal(result.catalogIssues[0].kind, "equipment");
  assert.equal(equipmentCostTotal(result.equipment), 600);
});
check("normalized edit preserves metadata and clears hidden shadows", () => {
  const source = freeze({ ...clone(base), attachments: [{ id: "att", qty: 2, note: "keep" }], attachment_counts: { shadow: 99 } });
  const next = setCount(source, { kind: "attachment", id: "att", quantity: 3 });
  assert.deepEqual(next.attachments, [{ id: "att", qty: 3, note: "keep" }]);
  assert.deepEqual(next.attachment_counts, {});
  assert.deepEqual(next.attachment_ids, []);
  assert.equal(calcEquipment([next], inv)[0].equipment_cost, 145);
  assert.equal(source.attachments[0].qty, 2);
  const removed = setCount(source, { kind: "attachment", id: "att", quantity: 0 });
  assert.deepEqual(removed.attachments, []);
  assert.equal(calcEquipment([removed], inv)[0].equipment_cost, 100);
});
check("explicit map edit preserves untouched raw counts", () => {
  const source = freeze({ ...clone(base), attachment_counts: { att: 2, other: "2" } });
  const next = setCount(source, { kind: "attachment", id: "att", quantity: 1 });
  assert.deepEqual(next.attachment_counts, { att: 1, other: "2" });
  assert.deepEqual(source.attachment_counts, { att: 2, other: "2" });
});
check("legacy duplicate IDs migrate only on explicit edit", () => {
  const source = freeze({ ...clone(base), attachment_counts: null, attachment_ids: ["att", "att"] });
  assert.equal(resolveFoundationEquipment(source, inv).attachmentRows.length, 2);
  const next = setCount(source, { kind: "attachment", id: "att", quantity: 3 });
  assert.deepEqual(next.attachment_counts, { att: 3 });
  assert.deepEqual(next.attachment_ids, []);
  assert.equal(calcEquipment([next], inv)[0].equipment_cost, 145);
  assert.deepEqual(source.attachment_ids, ["att", "att"]);
});
check("normalized duplicate metadata is not silently collapsed", () => {
  const source = freeze({ ...clone(base), attachments: [{ id: "att", qty: 1, note: "a" }, { id: "att", qty: 2, note: "b" }] });
  assert.throws(() => setCount(source, { kind: "attachment", id: "att", quantity: 3 }), /Duplicate/);
  assert.equal(source.attachments.length, 2);
  assert.deepEqual(setCount(source, { kind: "attachment", id: "att", quantity: 0 }).attachments, []);
});
check("sub quantities update immutably without altering main selection", () => {
  const source = freeze({ ...clone(base), sub_attachment_counts: { sub: 2, other: 3 } });
  const next = setCount(source, { kind: "sub_attachment", id: "sub", quantity: 0 });
  assert.deepEqual(next.sub_attachment_counts, { other: 3 });
  assert.deepEqual(next.attachment_ids, ["att"]);
  assert.deepEqual(source.sub_attachment_counts, { sub: 2, other: 3 });
});
check("safe map keys do not mutate prototypes", () => {
  const source = freeze({ ...clone(base), attachment_counts: Object.fromEntries([["__proto__", 2]]) });
  const next = setCount(source, { kind: "attachment", id: "__proto__", quantity: 3 });
  assert.equal(Object.getPrototypeOf(next.attachment_counts), Object.prototype);
  assert.equal(Object.hasOwn(next.attachment_counts, "__proto__"), true);
  assert.equal(next.attachment_counts.__proto__, 3);
});
check("invalid edits fail without mutating history", () => {
  const source = freeze(clone(base));
  for (const quantity of [-1, 0.5, "2", NaN, Infinity]) {
    assert.throws(() => setCount(source, { kind: "attachment", id: "att", quantity }), /whole numbers/);
  }
  assert.deepEqual(source, base);
});
fs.writeFileSync(`${root}/engine-verification.json`, JSON.stringify({ synthetic: true, passed: results.length, failed: 0, results }, null, 2));
console.log(`PASS equipment critical engine/selection passed=${results.length} failed=0 (original parity ${cases.length})`);
