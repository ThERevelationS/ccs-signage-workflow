// P-06 validation-model verifier.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelValidationModel.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const { validateChannelSet } = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };
const has = (v, kind, sev) => v.issues.some((i) => i.kind === kind && (!sev || i.severity === sev));

// clean fabricated set -> ready.
const t = { rows: [{ category: "materials", item: "Face material (acrylic)", qty: 10, unit: "sqft", source: "computed" }] };
const good = validateChannelSet({ letter_height_inches: 18, fabrication: "fabricated", illumination: "unlit", install_height_feet: 10, required_crew: 2, crew_assigned: 2 },
  t, { materials: [{ name: "acrylic", applies_to: "all" }], equipment: [{ max_height_feet: 15 }], prices: { "Face material (acrylic)": 4 }, stock: { "Face material (acrylic)": 50 } });
ok(good.ready === true && good.blocking_count === 0, "clean set ready", JSON.stringify(good.issues));

// material compatibility.
const badMat = validateChannelSet({ installation_type: "raceway", illumination: "unlit" }, null, { materials: [{ name: "standoffs", applies_to_list: ["backer"] }] });
ok(has(badMat, "incompatible_material", "blocking") && badMat.ready === false, "material not applying to install type blocks");

// halo vs flush conflict.
const halo = validateChannelSet({ installation_type: "flush_mount", illumination: "halo_lit" }, null, {});
ok(has(halo, "conflict"), "halo on flush mount conflicts");

// LED data on unlit set -> warning only.
const unlit = validateChannelSet({ illumination: "unlit" }, null, { product: { led_modules_per_foot: 3 } });
ok(has(unlit, "conflict", "warning") && unlit.ready === true, "LED data on unlit warns, doesn't block");

// raceway without length.
const rw = validateChannelSet({ raceway: true, illumination: "unlit" }, null, {});
ok(has(rw, "missing", "blocking"), "raceway without length blocks");

// size exceeds stock sheet.
const big = validateChannelSet({ letter_height_inches: 30, illumination: "unlit" }, null, { product: { max_letter_height_inches: 24 } });
ok(has(big, "size_exceeds_stock", "blocking"), "oversize letter blocks");

// stock shortage vs unverified stock.
const short = validateChannelSet({ illumination: "unlit" }, { rows: [{ item: "Trim cap", qty: 60, unit: "ft" }] }, { stock: { "Trim cap": 40 } });
ok(has(short, "stock_shortage", "blocking"), "stock shortage blocks");
const unv = validateChannelSet({ illumination: "unlit" }, { rows: [{ item: "Trim cap", qty: 5, unit: "ft" }] }, { stock: {} });
ok(has(unv, "unverified_stock", "assumption") && unv.ready === true, "missing stock figure = assumption, not block");

// access: no reach vs reach.
const noReach = validateChannelSet({ illumination: "unlit", install_height_feet: 30 }, null, { equipment: [{ max_height_feet: 20 }] });
ok(has(noReach, "access_block", "blocking"), "no lift reaches -> block");
const reach = validateChannelSet({ illumination: "unlit", install_height_feet: 10 }, null, { equipment: [{ max_height_feet: 13, vertical_reach_safety_margin_feet: 2 }] });
ok(!has(reach, "access_block"), "13ft lift reaches 10ft + 2ft margin");
const noInv = validateChannelSet({ illumination: "unlit", install_height_feet: 12 }, null, { equipment: [] });
ok(has(noInv, "unverified_access", "assumption"), "no inventory -> unverified assumption");

// crew.
const crew = validateChannelSet({ illumination: "unlit", required_crew: 3, crew_assigned: 1 }, null, {});
ok(has(crew, "crew_shortage", "blocking"), "crew shortage blocks");

// electrical.
const elec = validateChannelSet({ illumination: "front_lit" }, { rows: [{ category: "electrical", item: "LED modules", qty: null, unit: "ea" }] }, {});
ok(has(elec, "electrical_unresolved", "blocking"), "unresolved electrical blocks");
const over = validateChannelSet({ illumination: "front_lit", electrical_scope: "dedicated circuit" }, { rows: [] }, { electrical: { load_watts: 500, circuit_capacity_watts: 400 } });
ok(has(over, "electrical_overload", "blocking"), "load > capacity blocks");
const litAssump = validateChannelSet({ illumination: "front_lit" }, { rows: [] }, {});
ok(has(litAssump, "assumption"), "lit without electrical_scope -> assumption");

// missing price warns.
const noPrice = validateChannelSet({ illumination: "unlit" }, { rows: [{ item: "X", qty: 3, unit: "ea" }] }, { prices: {} });
ok(has(noPrice, "missing_price", "warning") && noPrice.ready === true, "missing price warns, doesn't block");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p06: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
