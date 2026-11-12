// P-10 ops verifier — bulk/dup/mirror/substitute/template/dims/explain/kbd/snap.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelSetOps.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { bulkCreateSets, duplicateSet, substituteRow, templateFromSet, applyTemplate, applyDimensionEntry, explainCharges, moveRow, adjustQty, snapshotSets, restoreSnapshot } = M;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

// bulk create: distinct ids, indexed.
const sets = bulkCreateSets(3, { letter_height_inches: 18, description: "Base" });
ok(sets.length === 3 && new Set(sets.map((s) => s.id)).size === 3, "bulk create 3 distinct sets");
ok(sets[1].set_index === 1 && sets[2].description === "Base 3", "indexed + sequenced labels");
ok(bulkCreateSets(0).length === 0 && bulkCreateSets("x").length === 0, "bad count -> empty, no crash");

// duplicate + mirror.
const src = { id: "s1", letter_height_inches: 18, override_fields: ["qty"] };
const d = duplicateSet(src, { mirror: true });
ok(d.id !== "s1" && d.duplicated_from === "s1" && d.mirrored === true, "mirror dup = new id + lineage + flag");
const d2 = duplicateSet(src);
ok(d2.mirrored === false && d2.id !== d.id, "plain dup unmirrored, distinct id");
ok(JSON.stringify(src.override_fields) === JSON.stringify(d.override_fields) && d.override_fields !== src.override_fields, "overrides cloned not shared");

// substitution keeps qty, records audit.
const rows = [{ item: "Trim cap", qty: 50, unit: "ft" }, { item: "Other", qty: 1, unit: "ea" }];
const sub = substituteRow(rows, "Trim cap", { item: "Trim cap (black)", note: "color swap" });
ok(sub.rows[0].item === "Trim cap (black)" && sub.rows[0].qty === 50 && sub.rows[0].substituted_from === "Trim cap", "substitute swaps item, keeps qty, marks origin");
ok(sub.substitutions[0].note === "color swap", "substitution audit recorded");
ok(rows[0].item === "Trim cap", "source rows untouched (pure)");

// template round-trip strips instance fields.
const tpl = templateFromSet({ id: "s9", letter_height_inches: 24, description: "Standard 24in", source_letter_purchase_id: "x" });
ok(!("id" in tpl.fields) && !("source_letter_purchase_id" in tpl.fields) && tpl.fields.letter_height_inches === 24, "template strips instance fields");
const applied = applyTemplate(tpl, { qty: 8 });
ok(applied.letter_height_inches === 24 && applied.qty === 8 && applied.id && applied.template_ref === "Standard 24in", "apply template + overrides + fresh id + ref");

// dimension entry: malformed -> null, zero preserved.
const dims = applyDimensionEntry({}, { letter_count: "abc", letter_height_inches: "24", letter_depth_inches: 0 });
ok(dims.letter_count === null && dims.letter_height_inches === 24 && dims.letter_depth_inches === 0, "malformed->null, explicit 0 preserved");

// charge explanations.
const ex = explainCharges([{ item: "A", qty: 4, unit: "ea" }, { item: "B", qty: null, unit: "ea" }, { item: "C", qty: 2, unit: "ft" }], { A: 5, C: 3 });
ok(ex[0].total === 20 && ex[0].explanation.includes("4 ea x $5"), "priced explanation");
ok(ex[1].total === null && ex[1].explanation.includes("unresolved"), "null qty explained");
ok(ex[2].total === 6 && ex[2].explanation.includes("no unit price") === false, "priced C computes");

// keyboard ops: move + adjust pure.
const moved = moveRow([{ item: "a" }, { item: "b" }, { item: "c" }], 0, 2);
ok(moved.map((r) => r.item).join("") === "bca", "move row to end");
const adj = adjustQty([{ item: "A", qty: 4 }, { item: "B", qty: null }], "A", 1.5);
ok(adj[0].qty === 5.5 && adj[1].qty === null, "qty adjust skips null");

// snapshots recover exactly.
const snap = snapshotSets(sets, "v1");
const restored = restoreSnapshot(snap);
ok(JSON.stringify(restored) === JSON.stringify(sets) && restored !== sets, "snapshot restores equal-but-independent copy");
ok(restoreSnapshot(null) === null && restoreSnapshot({}) === null, "bad snapshot -> null, no crash");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p10: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
