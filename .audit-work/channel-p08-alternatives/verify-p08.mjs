// P-08 alternatives verifier — XOR modes, independent scopes, fail-closed.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelAlternatives.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const { channelAlternatives, resolveChannelScope } = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

const spec = { letter_count: 6, letter_height_inches: 18, illumination: "unlit", include_delivery: true, delivery_price: 90, design_price: 150 };
const set = channelAlternatives(spec, { fasteners_per_letter: 4, install_hours: 4, assembly_hours_per_letter: 1, total_perimeter_inches: 300 });

// both modes exist, each carrying its own takeoff.
ok(set.alternatives.length === 2, "purchased + fabricated alternatives");
const pur = set.alternatives.find((a) => a.key === "purchased");
const fab = set.alternatives.find((a) => a.key === "fabricated");
ok(pur.takeoff.rows.some((r) => r.item === "Purchased letter set"), "purchased takeoff = purchase line");
ok(fab.takeoff.rows.some((r) => r.item === "Face material (acrylic)") && fab.takeoff.rows.some((r) => r.item === "Assembly labor"), "fabricated takeoff = materials + assembly");

// optional scopes: included flag honored, prices carried, all listed.
ok(set.optional_scopes.length === 5, "5 optional scope kinds");
ok(set.optional_scopes.find((s) => s.key === "delivery").included === true, "delivery flagged by spec");
ok(set.optional_scopes.find((s) => s.key === "permit").included === false, "unselected scope not included");

// resolve: mode required.
const noMode = resolveChannelScope(set, {});
ok(noMode.resolvable === false && noMode.issues.some((i) => i.field === "mode"), "missing mode fails closed");

// resolve purchased + two scopes.
const sel = resolveChannelScope(set, { mode: "purchased", include: ["delivery", "design"] });
ok(sel.resolvable && sel.scope.mode === "purchased", "purchased scope resolved");
ok(sel.scope.optional_scopes.length === 2 && sel.scope.optional_scopes.every((s) => ["delivery", "design"].includes(s.key)), "only selected scopes emitted");
ok(sel.scope.takeoff === pur.takeoff, "resolved scope carries the purchased takeoff");

// fabricated mode resolves its own takeoff.
const selF = resolveChannelScope(set, { mode: "fabricated", include: [] });
ok(selF.resolvable && selF.scope.takeoff.fabricated === true, "fabricated resolves fabrication takeoff");

// unknown scope key -> issue, still resolvable.
const bad = resolveChannelScope(set, { mode: "purchased", include: ["delivery", "wings"] });
ok(bad.resolvable && bad.issues.some((i) => i.kind === "unknown_scope") && bad.scope.optional_scopes.length === 1, "unknown scope flagged + ignored");

// XOR: resolving one mode never emits the other.
ok(sel.scope.takeoff.fabricated === false && !sel.scope.takeoff.rows.some((r) => r.item === "Face material (acrylic)"), "purchased scope has no fabricated rows");

// unresolved takeoff data surfaces via takeoff issues (not hidden).
const sparse = channelAlternatives({ letter_count: 2, letter_height_inches: 12, illumination: "front_lit" }, {});
ok(sparse.alternatives.every((a) => a.takeoff.issues.some((i) => i.kind === "missing_product_data")), "missing product data surfaces in both alternatives");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p08: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
