import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { deriveLaserItem } from "../src/components/estimator/laser/laserItemDerivation.js";
import { laserItemIssues } from "../src/components/estimator/laser/laserPricingAvailability.js";

const source = readFileSync(new URL("../src/pages/LaserEstimator.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  const addItem = () => {");
const end = source.indexOf("\n\n  // File attach", start);
assert.ok(start >= 0 && end > start, "actual addItem handler is available");
const addItemSource = source.slice(start, end);
let project = { items: [] };
const globalSettings = { cut_speed_1_4: 30, acrylic_cut_multiplier: 2, laser_engrave_speed_sqipm: 6, acrylic_engrave_multiplier: 1.5 };
const addItem = runInNewContext(`${addItemSource}\naddItem`, {
  project,
  globalSettings,
  setProject: (update) => { project = update(project); },
  newBuilderItemId: () => "synthetic-item",
  deriveLaserItem,
  setTimeout: () => {},
  document: {},
});
addItem();
const item = project.items[0];
assert.equal(item.total_cut_length_inches, 72);
assert.equal(item.cut_speed_ipm, 60);
assert.equal(item.engrave_speed_sqipm, 9);
assert.ok(!laserItemIssues(item).some((issue) => issue.code === "laser_cut_length_unavailable"));
assert.ok(laserItemIssues({ ...item, total_cut_length_inches: 0 }).some((issue) => issue.code === "laser_cut_length_unavailable"));
assert.equal(deriveLaserItem({ ...item, width: 18 }, "width", globalSettings).total_cut_length_inches, 84);
const engraving = deriveLaserItem({ ...item, item_type: "engrave_and_cut" }, "item_type", globalSettings);
assert.equal(engraving.total_cut_length_inches, 72);
assert.equal(engraving.engrave_area_sqin, 288);
const lettering = deriveLaserItem({ ...item, item_type: "lettering" }, "item_type", { laser_letter_perimeter_factor: 4 });
assert.equal(lettering.total_cut_length_inches, 480);
const unchanged = deriveLaserItem({ ...item, description: "new description" }, "description", globalSettings);
assert.equal(unchanged.total_cut_length_inches, 72);
assert.equal(item.description, "");
assert.match(source, /return deriveLaserItem\(\{ \.\.\.item, \[field\]: value \}, field, globalSettings\)/);
console.log("PASS Laser addItem default and shared derivation (13 assertions)");
