// O-070 anchor verifier — esbuild-bundles the real module (extensionless
// imports resolve like Vite) then asserts the pure-model contract under Node.
// Run: node .audit-work/o070-anchor/verify-o070.mjs  (also remote via sandbox run)
import * as esbuild from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/estimator/foundation/foundationLandscapeAnchor.js");
const OUT = join(HERE, ".verify-bundle.mjs");

const built = await esbuild.build({
  entryPoints: [SRC], bundle: true, format: "esm", platform: "node",
  outfile: OUT, logLevel: "silent",
});
void built;
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const {
  LANDSCAPE_ANCHOR_VERSION,
  sanitizeLandscapeAnchor,
  landscapeAnchorConfirmed,
  landscapePointToPlan,
  planPointToLandscape,
  foundationFootprintRects,
  diagnoseLandscapeFoundation,
} = M;

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name, extra); } };

// --- sanitize ---
ok(sanitizeLandscapeAnchor(null) === null, "sanitize null -> null");
ok(sanitizeLandscapeAnchor({}).confirmed === false, "empty anchor unconfirmed");
const a = sanitizeLandscapeAnchor({ origin_x_inches: "120", origin_z_inches: 48, rotation_degrees: 95, confirmed: true });
ok(a.origin_x_inches === 120 && a.origin_z_inches === 48 && a.rotation_degrees === 90, "sanitize coerces + clamps cardinal");
ok(a.version === LANDSCAPE_ANCHOR_VERSION, "version stamped");
ok(landscapeAnchorConfirmed({ origin_x_inches: 1, origin_z_inches: 2, confirmed: true }) === true, "confirmed gate true");
ok(landscapeAnchorConfirmed({ origin_x_inches: 1, confirmed: true }) === false, "confirmed gate needs both coords");

// --- rotation mapping round-trip ---
const anchor = { origin_x_inches: 100, origin_z_inches: 200, rotation_degrees: 90, confirmed: true };
const plan = landscapePointToPlan(anchor, 10, 5);
ok(plan && plan.x === 95 && plan.z === 210, "rot90 maps correctly", JSON.stringify(plan));
const back = planPointToLandscape(anchor, plan.x, plan.z);
ok(back && back.x === 10 && back.z === 5, "round-trip inverse", JSON.stringify(back));
const a0 = { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 0, confirmed: true };
const p0 = landscapePointToPlan(a0, 12, 24);
ok(p0.x === 12 && p0.z === 24, "rot0 identity");
const a180 = { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 180, confirmed: true };
const p180 = landscapePointToPlan(a180, 12, 24);
ok(p180.x === -12 && p180.z === -24, "rot180 negates");
ok(landscapePointToPlan({ confirmed: true }, 1, 2) === null, "null origin -> null");

// --- footprints ---
const items = [
  { foundation_type: "spread", length_inches: 36, width_inches: 24, x_inches: 0, z_inches: 0 },
  { foundation_type: "pillar", diameter: 18, x_inches: 60, z_inches: 60 },
  { foundation_type: "spread", length_inches: "bad", width_inches: 10, x_inches: 0, z_inches: 0 },
];
const fr = foundationFootprintRects(items);
ok(fr.rects.length === 2 && fr.skipped.length === 1, "footprints resolve + skip invalid");
ok(fr.rects[0].w === 36 && fr.rects[0].d === 24, "spread rect dims");
ok(fr.rects[1].w === 18 && fr.rects[1].d === 18, "pillar diameter -> square");

// --- diagnostics: unconfirmed gate ---
const landscape = {
  cell_size_inches: 12,
  cells: { "0,0": "grass", "2,1": "mulch", "9,7": "stone" },
  objects: [{ x_inches: 6, z_inches: 6, setback_inches: 24 }],
  foundation_anchor: { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 0, confirmed: false },
};
const d0 = diagnoseLandscapeFoundation({ landscape, items, cellSizeInches: 12, gridCols: 24, gridRows: 16 });
ok(d0.confirmed === false && d0.overlays.length === 0 && d0.cells_in_footprints.length === 0, "unconfirmed -> empty pass");

// --- diagnostics: confirmed, rot0, origin at plan(0,0) ---
landscape.foundation_anchor = { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 0, confirmed: true };
const d1 = diagnoseLandscapeFoundation({ landscape, items, cellSizeInches: 12, gridCols: 24, gridRows: 16 });
ok(d1.confirmed === true && d1.overlays.length === 2, "confirmed -> overlays per resolved footprint");
ok(d1.overlays[0].rect.x === 0 && d1.overlays[0].rect.w === 36, "overlay rect = plan rect at origin");
const cells1 = d1.cells_in_footprints.map((c) => c.cell);
ok(cells1.includes("0,0") && cells1.includes("2,1"), "cells under spread footprint", JSON.stringify(cells1));
ok(!cells1.includes("9,7"), "far cell not flagged");
ok(d1.objects[0].kind === "inside-footprint" && d1.objects[0].item_index === 0, "object inside spread flagged");

// --- setback measurement ---
landscape.objects = [
  { x_inches: 50, z_inches: 10, setback_inches: 12 },
  { x_inches: 42, z_inches: 10, setback_inches: 12 },
  { x_inches: 96, z_inches: 96 },
  { z_inches: 5 },
];
const d2 = diagnoseLandscapeFoundation({ landscape, items, cellSizeInches: 12, gridCols: 24, gridRows: 16 });
ok(d2.objects[0].kind === "placed" && Math.abs(d2.objects[0].measured_inches - 14) < 1e-9, "setback measured 14 -> ok");
ok(d2.objects[1].kind === "setback-violation" && Math.abs(d2.objects[1].measured_inches - 6) < 1e-9, "setback 6 < required 12 -> violation");
ok(d2.objects[2].kind === "placed" && d2.objects[2].required_inches === null, "no setback authored -> placed");
ok(d2.objects[3].kind === "unplaced", "unplaced object flagged");

// --- rotation affects overlays ---
landscape.foundation_anchor = { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 90, confirmed: true };
const d3 = diagnoseLandscapeFoundation({ landscape, items: [items[0]], cellSizeInches: 12, gridCols: 24, gridRows: 16 });
const ov = d3.overlays[0].rect;
ok(ov.x === 0 && ov.z === -36 && ov.w === 24 && ov.d === 36, "rot90 swaps axes on overlay", JSON.stringify(ov));

// --- no cell size -> honest note, not guess ---
landscape.foundation_anchor = { origin_x_inches: 0, origin_z_inches: 0, rotation_degrees: 0, confirmed: true };
const d4 = diagnoseLandscapeFoundation({ landscape: { ...landscape, cell_size_inches: "bad" }, items, cellSizeInches: NaN, gridCols: 24, gridRows: 16 });
ok(d4.confirmed === true && d4.cells_in_footprints.length === 0 && d4.notes.some((n) => n.includes("cell size")), "missing cell size -> note not guess");
ok(d4.overlays[0].inside_grid === null, "inside_grid unknown without cell size");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-o070: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
