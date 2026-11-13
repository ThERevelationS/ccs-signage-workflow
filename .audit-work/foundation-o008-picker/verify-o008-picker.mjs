// O-008 tail — FoundationItemCard picker supplier grouping. The card's
// catalog pickers group options by the boundary's canonical supplier key
// (groupInventoryBySupplier): named suppliers section alphabetically,
// unrecorded suppliers form the unassigned group sorted LAST, and the picker
// stays flat when no row records a supplier. Behavior tests run the real
// grouping helper; structure checks assert the Picker consumes it.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({
  entryPoints: [join(HERE, "../../src/components/masterInventory/inventoryNormalization.js")],
  bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent",
});
const { groupInventoryBySupplier } = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

// --- behavior: grouping on picker-shaped normalized rows -------------------
const concrete = [
  { id: "c1", material_name: "4000 PSI", supplier: "Citywide Ready-Mix", supplier_key: "citywide_ready_mix" },
  { id: "c2", material_name: "4500 PSI", supplier: "citywide ", supplier_key: "citywide" },
  { id: "c3", material_name: "3000 PSI", supplier: "Dixie Concrete", supplier_key: "dixie_concrete" },
  { id: "c4", material_name: "Sack mix" }, // no supplier recorded
];
const groups = groupInventoryBySupplier(concrete);
ok(groups.length === 4, "four groups: three suppliers + unassigned");
ok(groups[0].key === "citywide" && groups[1].key === "citywide_ready_mix" && groups[2].key === "dixie_concrete" && groups[3].key === null,
  "named groups alphabetical, unassigned sorts last", JSON.stringify(groups.map((g) => g.key)));
ok(groups[0].rows.length === 1 && groups[0].rows[0].id === "c2" && groups[1].rows[0].id === "c1",
  "distinct authored suppliers stay separate — never merged");
ok(groups[3].rows.length === 1 && groups[3].rows[0].id === "c4", "unrecorded supplier lands in unassigned group");
ok(groups[0].label === "citywide" && groups[1].label === "Citywide Ready-Mix", "label keeps first-seen authored spelling");

// Canonical key collapses vendor spelling variants — "citywide " and
// "Citywide Ready-Mix" key differently (distinct authored suppliers stay
// separate — never merged), but case/space variants of the SAME name join.
const variants = groupInventoryBySupplier([
  { id: "v1", material_name: "A", supplier: "Citywide" },
  { id: "v2", material_name: "B", supplier: "citywide " },
  { id: "v3", material_name: "C", supplier: "CITYWIDE" },
]);
ok(variants.length === 1 && variants[0].rows.length === 3, "case/space supplier variants group together");
ok(variants[0].label === "Citywide", "variant group label is first authored spelling");

// All-unassigned input: single null group — the Picker's flat fallback path.
const flat = groupInventoryBySupplier([
  { id: "f1", material_name: "X" },
  { id: "f2", material_name: "Y" },
]);
ok(flat.length === 1 && flat[0].key === null, "no recorded suppliers -> one unassigned group (flat render)");
ok(groupInventoryBySupplier(undefined).length === 0, "non-array options -> zero groups");

// Supplier authored via non-string garbage stays unassigned — never grouped.
const junk = groupInventoryBySupplier([{ id: "j1", supplier: 42 }, { id: "j2", supplier: { name: "x" } }]);
ok(junk.length === 1 && junk[0].key === null, "non-string supplier values stay unassigned");

// --- structure: the Picker consumes the canonical grouping ------------------
const card = readFileSync(join(HERE, "../../src/components/estimator/foundation/FoundationItemCard.jsx"), "utf8");
ok(card.includes('groupInventoryBySupplier'), "card imports the canonical grouping helper");
ok(/groupInventoryBySupplier\(rows\)/.test(card), "picker groups its option rows");
ok(card.includes("<optgroup"), "picker renders optgroup sections");
ok(/label=\{`Supplier: \$\{group\.label \|\| "— not recorded"\}`\}/.test(card), "optgroup labels match the InventoryTable convention");
ok(/groups\.some\(\(g\) => g\.key !== null\)/.test(card), "flat fallback when no supplier keys exist");
ok(card.includes("Catalog item unavailable"), "missing-catalog-value option preserved");
ok(/Array\.isArray\(options\)/.test(card), "non-array options guarded");
// pickers that get grouped: concrete + forming both pass through <Picker />.
ok(/label="Concrete"[\s\S]*?options=\{catalog\.concrete\}/.test(card), "concrete picker uses the grouped Picker");
ok(/label="Forming material"[\s\S]*?options=\{catalog\.forming \|\| \[\]\}/.test(card), "forming picker uses the grouped Picker");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-o008-picker: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
