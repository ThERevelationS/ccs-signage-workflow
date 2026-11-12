// P-09 export-model verifier — 4 docs, marked unverified, bundle wiring.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelExportModel.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { channelQuoteExport, channelFabricationExport, channelLayoutExport, channelInstallExport, channelExportBundle } = M;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

const takeoff = { fabricated: true, rows: [
  { category: "materials", item: "Face material (acrylic)", qty: 10, unit: "sqft", source: "computed" },
  { category: "materials", item: "Return coil", qty: 50, unit: "ft", source: "estimated" },
  { category: "electrical", item: "LED modules", qty: null, unit: "ea", source: "unresolved" },
] };
const layout = { resolvable: true, envelope: { width_inches: 100, height_inches: 18 }, letters: [{ index: 0, char: "A", x: 0, width: 20, height: 18 }], raceway: null, backer: null, illumination: "front_lit", finish_color: "red", alignment: "flush_left", spacing_inches: 4 };
const validation = { ready: false, issues: [{ field: "install_height", message: "no lift reaches", severity: "blocking" }] };

// quote: priced vs unpriced lines, optional scopes.
const q = channelQuoteExport({ description: "Main set", mode: "fabricated", takeoff, prices: { "Face material (acrylic)": 4, "Return coil": 2 }, optional_scopes: [{ key: "delivery", description: "delivery", unit_price: 90 }] });
ok(q.kind === "quote" && q.sections[0].lines.length === 2, "quote emits qty-resolved lines only");
ok(q.sections[0].lines[0].total === 40, "total = qty x price");
ok(q.unverified.length === 0, "all lines priced -> no unverified");
const q2 = channelQuoteExport({ takeoff, prices: {} });
ok(q2.unverified.length === 2, "missing prices -> unverified entries");
ok(q.optional_scopes[0].optional === true && q.optional_scopes[0].unit_price === 90, "optional scope marked + priced");

// fabrication export groups by category + flags estimated/unresolved.
const f = channelFabricationExport(takeoff);
ok(f.kind === "fabrication_takeoff" && f.sections.length === 2, "sections grouped by category");
ok(f.unverified.length === 2, "estimated + unresolved rows flagged");

// layout export serializes render model; unresolvable fails closed.
const l = channelLayoutExport(layout);
ok(l.resolvable && l.sections[0].envelope.width_inches === 100 && l.sections[0].letters[0].char === "A", "layout serializes envelope + letters");
const lBad = channelLayoutExport({ resolvable: false, issues: [{ field: "letter_height_inches", message: "required" }] });
ok(lBad.sections.length === 0 && lBad.unverified.length === 1, "unresolvable layout -> empty sections + issues");

// install export carries site + validation.
const inst = channelInstallExport({ items: [{ description: "Set 1", qty_letters: 4, is_allowance: false }], spec: { install_height_feet: 20, wall_material: "eifs" }, validation });
ok(inst.sections[0].items[0].qty_letters === 4 && inst.sections[1].wall_material === "eifs", "install lines + site facts");
ok(inst.ready === false && inst.unverified[0].severity === "blocking", "validation issues carried through");

// bundle: all four kinds, generated_from stamps.
const b = channelExportBundle({ scope: { mode: "fabricated", takeoff, optional_scopes: [] }, layout, items: [], spec: {}, validation });
ok(Object.keys(b.documents).sort().join(",") === "fabrication_takeoff,installation,layout,quote", "bundle emits all 4 documents");
ok(b.generated_from.mode === "fabricated" && b.documents.quote.mode === "fabricated", "provenance stamps flow through");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p09: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
