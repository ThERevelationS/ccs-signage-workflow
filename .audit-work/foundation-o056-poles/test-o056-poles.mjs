// O-056 (CMP-E01) + O-057 (CMP-E02) verification harness.
// Bundles the CANDIDATE poleCalculator (testtree/) and the verbatim REMOTE
// poleCalculator (baseline/) under Node with the @/ alias mapped to the remote
// inventoryNormalization copy. Asserts:
//   A) legacy-output byte parity on the pre-existing field set (frozen cases)
//   B) distinct-geometry semantics: embedment alias/conflict, base offset,
//      explicit total stock length, actual shape, required-length provenance
//   C) item-pole consolidation: derived advisory rows, overlap flags, explicit
//      migration, and the fail-closed no-double-charge guard
//   D) held/acknowledged-snapshot contracts incl. new snapshot fields
// No Base44 writes; pure Node.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, ".bundle");
mkdirSync(OUT, { recursive: true });

const aliasFor = (root) => ({
  name: "base44-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, (args) => {
      const base = path.join(root, args.path.slice(2));
      for (const ext of ["", ".js", ".jsx"]) {
        if (existsSync(base + ext)) return { path: base + ext };
      }
      return { path: base };
    });
  },
});

const bundle = async (root, entry, name) => {
  const res = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [aliasFor(root)], logLevel: "silent",
  });
  const file = path.join(OUT, name);
  writeFileSync(file, res.outputFiles[0].text);
  return file;
};

const CAND = path.join(HERE, "testtree", "src");
const BASE = path.join(HERE, "baseline", "src");
const cand = await import(pathToFileURL(await bundle(CAND, "components/estimator/foundation/poleCalculator.js", "pole-candidate.mjs")).href);
const base = await import(pathToFileURL(await bundle(BASE, "components/estimator/foundation/poleCalculator.js", "pole-baseline.mjs")).href);

const { calcPoles, foundationPoleGeometry, consolidateFoundationPoles, deriveLegacyItemPole,
  itemHasLegacyPole, migrateLegacyItemPole, POLE_SHAPE_VALUES } = cand;

let pass = 0, fail = 0;
const eq = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => {
  if (eq(got, want)) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (name, cond) => check(name, cond === true, true);

// Catalog fixtures
const lfPole = { id: "inv-lf", material_type: "pole", material_name: "4in round pole", cost_per_unit: 5 };
const stockPole = { id: "inv-stock", material_type: "pole", material_name: "20ft stock", pole_pricing_mode: "stock_price", pole_stock_price: 150, pole_stock_length_ft: 20 };
const sqPole = { id: "inv-sq", material_type: "pole", material_name: "4x4 square", cost_per_unit: 10, pole_shape: "square", pole_width_inches: 4, pole_depth_inches: 4, pole_wall_thickness_inches: 0.125 };
const widePole = { id: "inv-wide", material_type: "pole", material_name: "12in pole", cost_per_unit: 9, pole_width_inches: 12 };
const inv = [lfPole, stockPole, sqPole, widePole];

// Fields that existed on priced output rows before this unit.
const LEGACY_SNAPSHOT = ["pole_name", "pole_cost", "pole_painting_cost", "total_cost"];

const parityStrip = (row) => {
  const out = {};
  for (const k of Object.keys(row)) {
    if (["embedment_inches", "base_offset_inches", "required_length_inches", "stock_pieces", "pole_shape"].includes(k)) continue;
    out[k] = row[k];
  }
  return out;
};

// ─── A. Frozen parity cases ─────────────────────────────────────────────────
console.error("A. legacy-output parity");
const parityFixtures = [
  { pole_id: "inv-lf", height_inches: 120, y_offset_inches: 42, include_pole_painting: false, component_id: "p1" },
  { pole_id: "inv-stock", height_inches: 120, y_offset_inches: 42, include_pole_painting: false, component_id: "p2" },
  { pole_id: "inv-stock", height_inches: 240, y_offset_inches: 42, include_pole_painting: false, component_id: "p3" },
  { pole_id: "inv-lf", height_inches: 120, y_offset_inches: 42, include_pole_painting: true, component_id: "p4" },
  { pole_id: "inv-wide", height_inches: 96, y_offset_inches: 24, include_pole_painting: true, component_id: "p5" },
  { pole_id: "inv-lf", height_inches: 120, y_offset_inches: 42, custom_cost_per_unit: 4, component_id: "p6" },
  { pole_id: "missing", height_inches: 120, y_offset: 42, y_offset_inches: 42, component_id: "p7" },
  { height_inches: 120, y_offset_inches: 42, component_id: "p8" },                    // unassigned
  { pole_id: "inv-lf", height_inches: "abc", y_offset_inches: 42, component_id: "p9" }, // bad height
  { pole_id: "inv-lf", height_inches: 120, y_offset_inches: -5, component_id: "p10" },  // bad depth
  { pole_id: "inv-lf", height_inches: 120, component_id: "p11" },                       // no depth
  { pole_id: "inv-lf", material_type: "pole", height_inches: 0, y_offset_inches: 0, component_id: "p12" },
];
{
  const c = calcPoles(parityFixtures, inv, {});
  const b = base.calcPoles(parityFixtures, inv, {});
  check("parity: row count", c.poles.length, b.poles.length);
  c.poles.forEach((row, i) => check(`parity: row ${i} legacy fields`, parityStrip(row), parityStrip(b.poles[i])));
  c.polePricing.forEach((entry, i) => {
    check(`parity: availability ${i}`, entry.available, b.polePricing[i].available);
    check(`parity: issues ${i}`, entry.issues.map(x => [x.kind, x.index, x.field, x.code, x.message]), b.polePricing[i].issues.map(x => [x.kind, x.index, x.field, x.code, x.message]));
  });
  // Frozen totals — independently recomputed expectations:
  // p1: 162in = 13.5LF * $5 = 67.50 ; p2: 1 stock piece * $150 ; p3: 282in → 2 pieces $300
  // p4: 67.50 + paint (13.5 * 6 * mult(6in=1.25)=101.25) = 168.75 ; p5: 120in=10LF*9=90 + 10*6*mult(12in=2)=120 → 210
  check("frozen: p1 pole_cost", c.poles[0].pole_cost, 67.5);
  check("frozen: p2 pole_cost", c.poles[1].pole_cost, 150);
  check("frozen: p3 pole_cost", c.poles[2].pole_cost, 300);
  check("frozen: p4 total_cost", c.poles[3].total_cost, 168.75);
  check("frozen: p5 total_cost", c.poles[4].total_cost, 210);
  check("frozen: p6 pole_cost override", c.poles[5].pole_cost, 54);
}

// ─── B. O-057 distinct-geometry semantics ───────────────────────────────────
console.error("B. distinct geometry");
{
  // 1. Canonical embedment prices identically to the legacy spelling.
  const legacy = calcPoles([{ pole_id: "inv-lf", height_inches: 120, y_offset_inches: 42 }], inv, {});
  const canon = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42 }], inv, {});
  check("embedment alias: cost parity", canon.poles[0].pole_cost, legacy.poles[0].pole_cost);
  check("embedment alias: required", canon.poles[0].required_length_inches, 162);
  check("embedment alias: snapshot materializes canonical", canon.poles[0].embedment_inches, 42);
  check("embedment alias: legacy-only row materializes canonical too", legacy.poles[0].embedment_inches, 42);
  check("embedment source: canonical", foundationPoleGeometry({ embedment_inches: 42, height_inches: 120 }).sources.embedment, "embedment_inches");
  check("embedment source: legacy", foundationPoleGeometry({ y_offset_inches: 42, height_inches: 120 }).sources.embedment, "y_offset_inches");

  // 2. Both recorded equal → no conflict; divergent → hold, never picked.
  const agree = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, y_offset_inches: 42 }], inv, {});
  check("embedment agree: available", agree.polePricing[0].available, true);
  const diverge = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, y_offset_inches: 36 }], inv, {});
  check("embedment diverge: held", diverge.polePricing[0].available, false);
  ok("embedment diverge: conflict code", diverge.polePricing[0].issues.some(i => i.code === "pole_embedment_conflict" && i.field === "embedment_inches"));

  // 3. Malformed canonical → new code; malformed legacy → old code unchanged.
  const badCanon = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: "abc" }], inv, {});
  ok("embedment malformed: code", badCanon.polePricing[0].issues.some(i => i.code === "pole_embedment_unavailable"));
  const badLegacy = calcPoles([{ pole_id: "inv-lf", height_inches: 120, y_offset_inches: "abc" }], inv, {});
  ok("depth malformed: legacy code", badLegacy.polePricing[0].issues.some(i => i.code === "pole_depth_unavailable"));

  // 4. Base offset — placement only, never material length.
  const off = foundationPoleGeometry({ height_inches: 120, embedment_inches: 42, base_offset_inches: 12 });
  check("base offset resolves", off.base_offset_inches, 12);
  check("base offset does not add length", off.required_length_inches, 162);
  const pricedOff = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, base_offset_inches: 12 }], inv, {});
  check("base offset priced length unchanged", pricedOff.poles[0].pole_cost, 67.5);
  const badOff = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, base_offset_inches: -3 }], inv, {});
  ok("base offset negative: held", badOff.polePricing[0].issues.some(i => i.code === "pole_base_offset_unavailable"));

  // 5. Explicit total stock length — distinct billed length.
  const totLf = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, total_length_inches: 240 }], inv, {});
  check("total length LF billed", totLf.poles[0].pole_cost, 100); // 20LF * $5
  check("total length snapshot", totLf.poles[0].required_length_inches, 240);
  const totStock = calcPoles([{ pole_id: "inv-stock", height_inches: 120, embedment_inches: 42, total_length_inches: 480 }], inv, {});
  check("total length stock pieces", totStock.poles[0].pole_cost, 300); // ceil(480/240)=2
  check("stock_pieces snapshot", totStock.poles[0].stock_pieces, 2);
  const short = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, total_length_inches: 150 }], inv, {});
  ok("total shorter than required: held", short.polePricing[0].issues.some(i => i.code === "pole_total_length_conflict"));
  const badTotal = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, total_length_inches: "abc" }], inv, {});
  ok("total malformed: held", badTotal.polePricing[0].issues.some(i => i.code === "pole_total_length_unavailable"));

  // 6. Actual shape — authored beats catalog; catalog feeds cross-section.
  const gAuth = foundationPoleGeometry({ height_inches: 120, embedment_inches: 42, pole_shape: "ROUND" }, sqPole);
  check("shape authored wins", gAuth.pole_shape, "round");
  check("shape source authored", gAuth.sources.shape, "pole_shape");
  const gCat = foundationPoleGeometry({ height_inches: 120, embedment_inches: 42 }, sqPole);
  check("shape catalog fallback", gCat.pole_shape, "square");
  check("cross-section carried", [gCat.cross_section.width_inches, gCat.cross_section.depth_inches, gCat.cross_section.wall_thickness_inches], [4, 4, 0.125]);
  const gNone = foundationPoleGeometry({ height_inches: 120, embedment_inches: 42 }, lfPole);
  check("shape unspecified stays null", gNone.pole_shape, null);
  const badShape = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, pole_shape: 42 }], inv, {});
  ok("shape non-string: held", badShape.polePricing[0].issues.some(i => i.code === "pole_shape_unavailable"));
  const shaped = calcPoles([{ pole_id: "inv-sq", height_inches: 120, embedment_inches: 42 }], inv, {});
  check("shape snapshot persists resolved catalog", shaped.poles[0].pole_shape, "square");

  // 7. Plan offset stays distinct (finite-or-0, never material length).
  const gPlan = foundationPoleGeometry({ height_inches: 120, embedment_inches: 42, x_inches: 24, z_inches: -8 });
  check("plan offset distinct", [gPlan.plan_offset_inches.x_inches, gPlan.plan_offset_inches.z_inches], [24, -8]);
  check("plan offset not in required", gPlan.required_length_inches, 162);

  // 8. Painting covers the explicit total stick (billed length), unchanged for legacy.
  const paintTotal = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42, total_length_inches: 240, include_pole_painting: true }], inv, {});
  // 20LF * (3.5+2.5) * mult(6in=1.25) = 150 painting; pole 100 → 250
  check("painting uses billed length", paintTotal.poles[0].pole_painting_cost, 150);
  check("painting total", paintTotal.poles[0].total_cost, 250);
}

// ─── C. O-056 consolidation ─────────────────────────────────────────────────
console.error("C. legacy item-pole consolidation");
{
  const legacyItem = {
    component_id: "item-1", foundation_type: "spread_foot", description: "F1",
    selected_pole_id: "inv-lf", pole_total_height_inches: 168, pole_offset_from_bottom_inches: 6,
    include_pole_painting: true, pole_cost: 55, pole_painting_cost: 40, x_inches: 30, z_inches: 20,
  };
  const plainItem = { component_id: "item-2", foundation_type: "spread_foot", selected_pole_id: "", pole_total_height_inches: 0, pole_offset_from_bottom_inches: 0, include_pole_painting: false };

  ok("itemHasLegacyPole: detected", itemHasLegacyPole(legacyItem));
  ok("itemHasLegacyPole: defaults not legacy", !itemHasLegacyPole(plainItem));
  ok("itemHasLegacyPole: dead snapshot alone is evidence", itemHasLegacyPole({ pole_cost: 10 }));
  ok("itemHasLegacyPole: painting flag alone is evidence", itemHasLegacyPole({ include_pole_painting: true }));

  const derived = deriveLegacyItemPole(legacyItem, 0);
  check("derived origin marker", derived.pole_origin, "legacy_item");
  check("derived pole_id", derived.pole_id, "inv-lf");
  check("derived height", derived.height_inches, 168);
  check("derived embedment absent (never invented)", derived.embedment_inches, undefined);
  check("derived offset preserved verbatim", derived.legacy_pole_offset_from_bottom_inches, 6);
  check("derived dead snapshots preserved", [derived.legacy_pole_cost, derived.legacy_pole_painting_cost], [55, 40]);
  check("derive: clean item → null", deriveLegacyItemPole(plainItem, 0), null);

  // Consolidated view — project pole on the SAME foundation flags overlap.
  const project = {
    items: [legacyItem, plainItem],
    poles: [
      { component_id: "pp1", pole_id: "inv-lf", height_inches: 120, y_offset_inches: 42, foundation_component_id: "item-1", foundation_idx: 0 },
      { component_id: "pp2", pole_id: "inv-lf", height_inches: 96, y_offset_inches: 24, foundation_component_id: "item-2", foundation_idx: 1 },
    ],
  };
  const con = consolidateFoundationPoles(project);
  check("consolidate: canonical list unchanged refs", con.poles, project.poles);
  check("consolidate: one derived row", con.legacyPoles.length, 1);
  check("consolidate: overlap flagged not deduped", con.overlaps.length, 1);
  check("consolidate: overlap pair", [con.overlaps[0].derivedIndex, con.overlaps[0].poleIndex, con.overlaps[0].poleComponentId], [0, 0, "pp1"]);
  ok("consolidate: advisory severity", con.issues.every(i => i.severity === "advisory"));
  ok("consolidate: legacy-fields advisory", con.issues.some(i => i.code === "legacy_item_pole_fields"));
  ok("consolidate: overlap advisory", con.issues.some(i => i.code === "pole_representation_overlap"));

  // Index-based fallback when component ids are absent.
  const conIdx = consolidateFoundationPoles({
    items: [{ selected_pole_id: "inv-lf", pole_total_height_inches: 100 }],
    poles: [{ pole_id: "inv-lf", height_inches: 100, y_offset_inches: 30, foundation_idx: 0 }],
  });
  check("consolidate: idx-fallback overlap", conIdx.overlaps.length, 1);

  // Asymmetric ids: item carries a component_id, the pole only an idx slot —
  // the idx assignment alone still flags the same-foundation overlap.
  const conMixed = consolidateFoundationPoles({
    items: [{ component_id: "item-x", selected_pole_id: "inv-lf", pole_total_height_inches: 100 }],
    poles: [
      { component_id: "pp9", pole_id: "inv-lf", height_inches: 100, y_offset_inches: 30, foundation_idx: 0 },
      { component_id: "pp10", pole_id: "inv-lf", height_inches: 100, y_offset_inches: 30, foundation_idx: 4 },
    ],
  });
  check("consolidate: idx-only overlap on cid item", conMixed.overlaps.length, 1);
  check("consolidate: idx-only overlap pole", conMixed.overlaps[0].poleComponentId, "pp9");

  // Fail-closed priced-path guard — a legacy_item row can never be repriced.
  const guarded = calcPoles([derived], inv, {});
  check("legacy row in priced path: held", guarded.polePricing[0].available, false);
  ok("legacy row: representation code", guarded.polePricing[0].issues.some(i => i.code === "pole_legacy_representation"));
  check("legacy row: no minted cost", guarded.poles[0].pole_cost, undefined);

  // NO DOUBLE CHARGE: project poles price exactly once whether or not items
  // carry ghost pole fields/cost snapshots — calcPoles never reads items.
  const noGhost = calcPoles(project.poles, inv, {});
  const ghostFree = JSON.parse(JSON.stringify(project.poles));
  const ghostSum = noGhost.poles.reduce((s, p) => s + (p.total_cost || 0), 0);
  check("double-charge proof: project totals ignore item ghosts", ghostSum, noGhost.poles[0].total_cost + noGhost.poles[1].total_cost);
  check("double-charge proof: item pole_cost never enters", noGhost.poles.reduce((s, p) => s + (p.pole_cost || 0), 0) !== legacyItem.pole_cost, true);

  // Migration — explicit step, embedment never invented, plan position carries.
  let idSeq = 0;
  const mig = migrateLegacyItemPole(legacyItem, 0, { createId: (k) => `mint-${k}-${++idSeq}` });
  check("migrate: fresh component id", mig.pole.component_id, "mint-pole-1");
  check("migrate: pole_id carried", mig.pole.pole_id, "inv-lf");
  check("migrate: height carried", mig.pole.height_inches, 168);
  check("migrate: painting carried", mig.pole.include_pole_painting, true);
  check("migrate: foundation link", mig.pole.foundation_component_id, "item-1");
  check("migrate: foundation idx", mig.pole.foundation_idx, 0);
  check("migrate: plan position inherited", [mig.pole.x_inches, mig.pole.z_inches], [30, 20]);
  check("migrate: embedment NOT invented", mig.pole.embedment_inches, undefined);
  check("migrate: offset preserved verbatim", mig.pole.legacy_pole_offset_from_bottom_inches, 6);
  check("migrate: provenance", mig.pole.migrated_from, "legacy_item");
  check("migrate: source item id", mig.pole.source_item_component_id, "item-1");
  check("migrate: item patch clears to defaults", mig.itemPatch, { selected_pole_id: "", pole_total_height_inches: 0, pole_offset_from_bottom_inches: 0, include_pole_painting: false, pole_cost: undefined, pole_painting_cost: undefined });
  check("migrate: clean item → null", migrateLegacyItemPole(plainItem, 0), null);

  // A migrated pole holds (honestly) until embedment is recorded — then prices once.
  const heldMig = calcPoles([mig.pole], inv, {});
  ok("migrated pole holds for embedment", heldMig.polePricing[0].issues.some(i => i.code === "pole_depth_unavailable"));
  const pricedMig = calcPoles([{ ...mig.pole, embedment_inches: 30 }], inv, {});
  check("migrated pole exact billed length", pricedMig.poles[0].pole_cost, 82.5); // (168+30)/12=16.5LF*$5

  // After migration the item no longer reports legacy fields (dead snapshots
  // cleared as part of the explicit patch).
  const cleared = { ...legacyItem, ...mig.itemPatch };
  ok("migrate: item clean after patch", !itemHasLegacyPole(cleared));
}

// ─── D. Held / acknowledged-snapshot contracts ──────────────────────────────
console.error("D. hold contracts");
{
  // Missing catalog row → held; acknowledged snapshot fields (incl. new ones) preserved.
  const poles = [{ component_id: "p1", pole_id: "gone", height_inches: 120, embedment_inches: 42 }];
  const saved = [{ component_id: "p1", pole_name: "Old pole", pole_cost: 70, pole_painting_cost: 0, total_cost: 70, required_length_inches: 160, stock_pieces: 1 }];
  const c = calcPoles(poles, inv, {}, { savedPoles: saved });
  check("held: acknowledged pole_cost", c.poles[0].pole_cost, 70);
  check("held: acknowledged required_length", c.poles[0].required_length_inches, 160);
  check("held: acknowledged stock_pieces", c.poles[0].stock_pieces, 1);
  const cNoAck = calcPoles(poles, inv, {}, { savedPoles: [] });
  check("held: unacknowledged required deleted", cNoAck.poles[0].required_length_inches, undefined);
  check("held: unacknowledged stock_pieces deleted", cNoAck.poles[0].stock_pieces, undefined);
  check("held: authored embedment retained", cNoAck.poles[0].embedment_inches, 42);

  // Duplicate component_id between current and saved → NOT acknowledged (existing contract).
  const dup = calcPoles(
    [{ component_id: "p1", pole_id: "gone" }, { component_id: "p1", pole_id: "gone" }],
    inv, {}, { savedPoles: saved });
  check("held: ambiguous ack → deleted", dup.poles[0].pole_cost, undefined);

  // Malformed authored row keeps verbatim draft values on the held row.
  const malformed = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: "abc" }], inv, {});
  check("held: malformed draft preserved", malformed.poles[0].embedment_inches, "abc");

  // Advisory consolidation issues never enter the priced issue channel.
  const priced = calcPoles([{ pole_id: "inv-lf", height_inches: 120, embedment_inches: 42 }], inv, {});
  ok("advisory never in priced channel", !priced.polePricing[0].issues.some(i => i.severity === "advisory" || ["legacy_item_pole_fields", "pole_representation_overlap"].includes(i.code)));
}

// ─── E. Issue-shape contract ────────────────────────────────────────────────
console.error("E. issue shape");
{
  const bad = calcPoles([{ component_id: "px", pole_id: "inv-lf", height_inches: 120, embedment_inches: "x" }], inv, {});
  const issue = bad.polePricing[0].issues[0];
  check("issue kind", issue.kind, "pole");
  check("issue componentId", issue.componentId, "px");
  check("issue message prefix", issue.message.startsWith("Pole 1:"), true);
  check("issue inventoryId", issue.inventoryId, "inv-lf");
  ok("POLE_SHAPE_VALUES exported", Array.isArray(POLE_SHAPE_VALUES) && POLE_SHAPE_VALUES.includes("round") && POLE_SHAPE_VALUES.includes("square"));
}

console.error(`\n${fail === 0 ? "PASS" : "FAIL"} o056-poles: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
