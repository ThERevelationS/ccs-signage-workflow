// P-13 (WS-P): consolidated fixture suite — pure set/proposal/material/
// quantity golden fixtures, synthetic layout + recovery, and the Builder
// linked-product ownership contract.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = async (f) => {
  const out = join(HERE, `.fx-${f.split("/").pop()}.mjs`);
  await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/", f)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
};
const takeoff = await load("channelSetTakeoff.js");
const layout = await load("channelLayoutModel.js");
const rev = await load("channelProposalRevisions.js");
const sync = await load("channelSetSync.js");
const ops = await load("channelSetOps.js");
const int = await load("channelInterviewModel.js");

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };
const row = (t, item) => t.rows.find((r) => r.item === item);

// --- Golden set fixture: deterministic BOM on a known spec, byte-stable across runs.
const GOLD = { letter_count: 6, letter_height_inches: 24, letter_depth_inches: 5, fabrication: "fabricated", illumination: "front_lit", total_perimeter_inches: 540, raceway_length_feet: 15, finish: "painted", backs: false };
const GPROD = { led_modules_per_foot: 3, led_watts_per_module: 1.2, power_supply_watts: 60, power_supply_headroom: 0.8, raceway_hardware_per_foot: 2, fasteners_per_letter: 4, assembly_hours_per_letter: 1.5, install_hours: 5 };
const g1 = takeoff.channelSetTakeoff(GOLD, GPROD);
const g2 = takeoff.channelSetTakeoff(GOLD, GPROD);
ok(JSON.stringify(g1) === JSON.stringify(g2), "golden fixture: deterministic re-run identical");
ok(row(g1, "Return coil")?.qty === 45 && row(g1, "LED modules")?.qty === 135 && row(g1, "Power supplies")?.qty === 4 && row(g1, "Mounting fasteners")?.qty === 24 && row(g1, "Assembly labor")?.qty === 9, "golden fixture: BOM values (coil 45ft, LED 135, PSU 4, fasteners 24, labor 9h)");

// --- Proposal fixture: revise -> accept -> snapshot frozen.
const pf = { id: "fx1", mode: "fabricated", qty: 6 };
const pr = rev.reviseProposal(pf, { qty: 7 });
const pa = rev.acceptProposal(pr.proposal, { accepted_by: "fx-op", prices: { A: 2 }, totals: { total: 14 } });
ok(pa.pricing_basis_snapshot.totals.total === 14 && pa.pricing_basis_snapshot.revision_n === 1, "proposal fixture: frozen basis carries totals+revision");

// --- Material/quantity edge fixtures.
const edge0 = takeoff.channelSetTakeoff({ letter_count: 0, letter_height_inches: 24, fabrication: "fabricated" }, GPROD);
ok(edge0.resolvable === false || edge0.issues.some((i) => i.kind === "missing"), "qty edge: zero count -> unresolvable/missing");
const edgeFrac = takeoff.channelSetTakeoff({ letter_count: 3, letter_height_inches: 18.5, fabrication: "fabricated", illumination: "unlit", total_perimeter_inches: 100.5 }, GPROD);
ok(row(edgeFrac, "Return coil")?.qty === 8.38, "qty edge: fractional perimeter -> 8.38ft", JSON.stringify(row(edgeFrac, "Return coil")));
const edgeHuge = takeoff.channelSetTakeoff({ letter_count: 500, letter_height_inches: 24, fabrication: "fabricated", illumination: "unlit", total_perimeter_inches: 50000 }, GPROD);
ok(row(edgeHuge, "Mounting fasteners")?.qty === 2000, "qty edge: 500-letter set computes");

// --- Synthetic layout fixture: golden positions.
const lay = layout.channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, spacing_inches: 4 });
ok(lay.letters[0].x === 0 && lay.letters[1].x === 21.5 && lay.envelope.width_inches === 39 && lay.baseline_z === 24, "synthetic layout: golden x/envelope/baseline");

// --- Recovery fixture: snapshot/restore after bulk+sync.
const sets = ops.bulkCreateSets(2, { create_install_item: true });
const sy1 = sync.syncChannelSet({ items: [], purchases: sets, mapPurchase: (p) => ({ description: p.description, qty_letters: p.qty }) });
const snap = ops.snapshotSets(sy1.items, "pre-edit");
const sy2 = sync.syncChannelSet({ items: sy1.items, purchases: [], mapPurchase: (p) => ({}) });
ok(sy2.items.length === 0, "recovery fixture: cascade emptied items");
const restored = ops.restoreSnapshot(snap);
ok(restored.length === sy1.items.length && JSON.stringify(restored) === JSON.stringify(sy1.items), "recovery fixture: snapshot restores pre-cascade state");

// --- Builder linked-product ownership fixture (O-012 contract on channel data).
const srcSet = { id: "src1", create_install_item: true, qty: 4, description: "Channel set" };
const linked = sync.syncChannelSet({ items: [], purchases: [srcSet], mapPurchase: (p) => ({ description: p.description, qty_letters: p.qty, source_letter_purchase_id: p.id }) });
ok(linked.items[0].source_letter_purchase_id === "src1", "builder fixture: item linked to source purchase");
const dup = { ...srcSet, id: "src1-copy" };
const relinked = sync.syncChannelSet({ items: linked.items, purchases: [dup], mapPurchase: (p) => ({ description: p.description, qty_letters: p.qty, source_letter_purchase_id: p.id }) });
ok(relinked.items.length === 1 && relinked.items[0].source_letter_purchase_id === "src1-copy", "builder fixture: reassigned purchase re-links, old link cascades");

// --- Interview fixture: the P-02 contract still holds on golden input.
const draft = int.channelInterviewToProjectDraft ? int.channelInterviewToProjectDraft(int.sanitizeChannelInterview({ letter_text: "SIGNS", letter_count: 5, letter_height_inches: 24, illumination: "front_lit" })) : null;
ok(draft !== null, "interview fixture: draft mapping emits");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p13: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
