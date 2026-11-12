// P-12 (WS-P): named-scenario matrix over the composed pipeline
// (interview/brief -> layout -> alternatives -> takeoff -> validate -> sync
// -> export -> revisions). Each P-12 scenario asserts its expected contract.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
const files = {
  takeoff: "../../src/components/channelLetterInstall/channelSetTakeoff.js",
  validate: "../../src/components/channelLetterInstall/channelValidationModel.js",
  layout: "../../src/components/channelLetterInstall/channelLayoutModel.js",
  alts: "../../src/components/channelLetterInstall/channelAlternatives.js",
  brief: "../../src/components/channelLetterInstall/channelScopeBrief.js",
  sync: "../../src/components/channelLetterInstall/channelSetSync.js",
  rev: "../../src/components/channelLetterInstall/channelProposalRevisions.js",
  ops: "../../src/components/channelLetterInstall/channelSetOps.js",
  exp: "../../src/components/channelLetterInstall/channelExportModel.js",
};
const bundle = {};
for (const [k, f] of Object.entries(files)) {
  const out = join(HERE, `.b-${k}.mjs`);
  await esbuild.build({ entryPoints: [join(HERE, f)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  bundle[k] = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
}
const { channelSetTakeoff } = bundle.takeoff;
const { validateChannelSet } = bundle.validate;
const { channelLetterSetLayout } = bundle.layout;
const { channelAlternatives, resolveChannelScope } = bundle.alts;
const { channelBriefProposal } = bundle.brief;
const { syncChannelSet } = bundle.sync;
const { reviseProposal, acceptProposal, reopenProposal } = bundle.rev;
const { bulkCreateSets, applyDimensionEntry } = bundle.ops;
const { channelExportBundle } = bundle.exp;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };
const row = (t, item) => t.rows.find((r) => r.item === item);
const P = { led_modules_per_foot: 3, led_watts_per_module: 1.2, power_supply_watts: 60, raceway_hardware_per_foot: 2, fasteners_per_letter: 4, assembly_hours_per_letter: 1.5, install_hours: 4 };

// 1. Flush channel (fabricated, front-lit, flush mount).
const flush = channelSetTakeoff({ letter_count: 5, letter_height_inches: 24, letter_depth_inches: 5, fabrication: "fabricated", illumination: "front_lit", total_perimeter_inches: 500, installation_type: "flush_mount" }, P);
ok(flush.lit && row(flush, "Face material (acrylic)")?.qty > 0 && row(flush, "LED modules")?.qty === 125, "flush channel: faces + returns + LEDs");

// 2. Halo — needs backs; halo-on-flush blocked by validation.
const halo = channelSetTakeoff({ letter_count: 5, letter_height_inches: 24, fabrication: "fabricated", illumination: "halo_lit", backs: true, total_perimeter_inches: 500 }, P);
ok(row(halo, "Back material")?.qty > 0, "halo set carries backs");
const haloFlush = validateChannelSet({ illumination: "halo_lit", installation_type: "flush_mount" }, null, {});
ok(haloFlush.ready === false, "halo on flush mount blocked");

// 3. Unlit dimensional — no electrical.
const dim = channelSetTakeoff({ letter_count: 8, letter_height_inches: 12, fabrication: "fabricated", illumination: "unlit", total_perimeter_inches: 200 }, { fasteners_per_letter: 2, install_hours: 2, assembly_hours_per_letter: 0.5 });
ok(!dim.rows.some((r) => r.category === "electrical"), "unlit dimensional: zero electrical rows");

// 4. Mixed sets — bulk + sync keep them distinct.
const sets = bulkCreateSets(2, { create_install_item: true, letter_type: "channel_flush_mounted" });
const sy = syncChannelSet({ items: [], purchases: sets, mapPurchase: (p) => ({ description: p.description, qty_letters: p.qty }) });
ok(sy.items.length === 2 && sy.items[0].source_letter_purchase_id !== sy.items[1].source_letter_purchase_id, "mixed sets: distinct linked items");

// 5. Fabrication-only — resolve fabricated, no optional scopes.
const altSet = channelAlternatives({ letter_count: 4, letter_height_inches: 18, illumination: "unlit", total_perimeter_inches: 300 }, P);
const fabOnly = resolveChannelScope(altSet, { mode: "fabricated", include: [] });
ok(fabOnly.resolvable && fabOnly.scope.optional_scopes.length === 0 && fabOnly.scope.takeoff.fabricated === true, "fabrication-only scope");

// 6. Install-only — purchased mode = purchase line + install, no fab materials.
const instOnly = resolveChannelScope(altSet, { mode: "purchased", include: [] });
ok(instOnly.scope.takeoff.rows.some((r) => r.item === "Purchased letter set") && !instOnly.scope.takeoff.rows.some((r) => r.item === "Face material (acrylic)"), "install-only: purchased line, no fab materials");

// 7. High facade — no lift reaches.
const high = validateChannelSet({ illumination: "unlit", install_height_feet: 40 }, null, { equipment: [{ max_height_feet: 30 }] });
ok(high.issues.some((i) => i.kind === "access_block" && i.severity === "blocking"), "high facade: access_block blocking");

// 8. Unknown scale — brief not ready until acknowledged.
const prop0 = channelBriefProposal({ interview: { letter_height_inches: 18 } });
ok(prop0.ready === false && prop0.blocking.includes("scale"), "unknown scale blocks ready");
const propAck = channelBriefProposal({ interview: { letter_height_inches: 18 }, scale_unverified_accepted: true });
ok(propAck.ready === true, "scale acknowledgment resolves the gate");

// 9. Lit without electrical access -> assumption.
const noElec = validateChannelSet({ illumination: "front_lit" }, { rows: [] }, {});
ok(noElec.issues.some((i) => i.kind === "assumption" && i.field === "electrical_scope"), "unknown electrical access -> assumption");

// 10. Changed counts — takeoff recomputes.
const t5 = channelSetTakeoff({ letter_count: 5, letter_height_inches: 24, fabrication: "fabricated", illumination: "unlit", total_perimeter_inches: 500 }, P);
const t9 = channelSetTakeoff({ letter_count: 9, letter_height_inches: 24, fabrication: "fabricated", illumination: "unlit", total_perimeter_inches: 500 }, P);
ok(row(t9, "Mounting fasteners")?.qty === 36 && row(t5, "Mounting fasteners")?.qty === 20, "changed count recomputes (fasteners 20->36)");

// 11. Reassigned purchase — mode switch swaps BOM shape.
ok(altSet.alternatives.find((a) => a.key === "purchased").takeoff.rows.some((r) => r.item === "Purchased letter set"), "reassigned purchase alternative exists");

// 12. Raceway change — length edit updates raceway rows.
const rwA = channelSetTakeoff({ letter_count: 4, letter_height_inches: 18, fabrication: "fabricated", illumination: "unlit", raceway_length_feet: 10, total_perimeter_inches: 300 }, P);
const rwB = channelSetTakeoff({ letter_count: 4, letter_height_inches: 18, fabrication: "fabricated", illumination: "unlit", raceway_length_feet: 22, total_perimeter_inches: 300 }, P);
ok(row(rwA, "Raceway material")?.qty === 10 && row(rwB, "Raceway material")?.qty === 22, "raceway length change re-emits qty");

// 13. Zero markup preserved (explicit 0 is not a default).
const zDim = applyDimensionEntry({}, { markup_percent: 0, letter_count: 0 });
ok(zDim.letter_count === 0, "explicit zero count preserved");
const zScope = channelAlternatives({ letter_count: 4, letter_height_inches: 18, illumination: "unlit", markup_percent: 0 }, P);
ok(zScope.alternatives[0].spec.markup_percent === 0, "zero markup carried, not defaulted");

// 14. Stale/canceled proposals — revision trail + reopen audit.
const base = { id: "pp", mode: "fabricated", qty: 5 };
const ra = reviseProposal(base, { qty: 6 });
const rb = reviseProposal(ra.proposal, { qty: 7 });
ok(rb.proposal.revision_n === 2 && rb.proposal.revisions.length === 2, "stale proposals keep revision trail");
const accd = acceptProposal(rb.proposal, { accepted_by: "op" });
const reopened = reopenProposal(accd, "canceled scope");
ok(reopened.prior_acceptance.accepted_by === "op" && reopened.accepted === false, "canceled proposal preserves acceptance history");

// 15. Linked-product ownership — dup purchase gets new link, no collision.
const owns = syncChannelSet({ items: sy.items, purchases: [...sets, { ...sets[0], id: "dup1" }], mapPurchase: (p) => ({ description: p.description, qty_letters: p.qty }) });
ok(new Set(owns.items.map((i) => i.source_letter_purchase_id)).size === owns.items.length, "linked ids unique after duplication");

// export bundle composes end-to-end without throwing.
const bundleOut = channelExportBundle({ scope: fabOnly.scope, layout: channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 18 }), items: sy.items, spec: {}, validation: null });
ok(Object.keys(bundleOut.documents).length === 4, "end-to-end export bundle emits");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p12: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
