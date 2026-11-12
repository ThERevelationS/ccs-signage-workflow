// P-05 takeoff-model verifier — deterministic rows, fail-closed product data.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelSetTakeoff.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const { CHANNEL_TAKEOFF_VERSION, channelSetTakeoff } = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };
const row = (t, item) => t.rows.find((r) => r.item === item);

// fail-closed: no count/height.
const none = channelSetTakeoff({});
ok(none.resolvable === false && none.issues.some((i) => i.kind === "missing"), "missing count/height -> unresolvable");

// purchased set: one purchase line, no fab materials.
const pur = channelSetTakeoff({ letter_count: 10, letter_height_inches: 18, letter_type: "purchased", illumination: "unlit", fasteners_per_letter: undefined });
ok(pur.resolvable && pur.fabricated === false, "purchased set resolvable");
ok(row(pur, "Purchased letter set")?.qty === 10, "purchased letters row = count");
ok(!row(pur, "Face material (acrylic)"), "no face row for purchased set");

// fabricated, full product data — every row computed.
const fab = channelSetTakeoff(
  { letter_count: 5, letter_height_inches: 24, letter_depth_inches: 5, fabrication: "fabricated", illumination: "front_lit", total_perimeter_inches: 600, fasteners_per_letter: undefined, backs: true, raceway_length_feet: 20, finish: "painted", finish_color: "red" },
  { led_modules_per_foot: 3, led_watts_per_module: 1.2, power_supply_watts: 60, power_supply_headroom: 0.8, raceway_hardware_per_foot: 2, fasteners_per_letter: 4, assembly_hours_per_letter: 1.5, install_hours: 6 },
);
ok(fab.version === CHANNEL_TAKEOFF_VERSION && fab.fabricated && fab.lit, "fabricated+lit flags");
ok(row(fab, "Face material (acrylic)")?.qty > 0 && row(fab, "Face material (acrylic)")?.source === "computed", "face sqft computed");
ok(row(fab, "Return coil")?.qty === 50 && row(fab, "Return coil")?.source === "computed", "return coil = authored perimeter 600in/12", JSON.stringify(row(fab, "Return coil")));
ok(row(fab, "Trim cap")?.qty === 50, "trim follows perimeter");
ok(row(fab, "Back material")?.qty > 0, "backs present when requested");
ok(row(fab, "LED modules")?.qty === 150 && row(fab, "LED modules")?.source === "computed", "LED = 3/ft x 50ft", JSON.stringify(row(fab, "LED modules")));
ok(row(fab, "Power supplies")?.qty === 4, "supplies = ceil(150*1.2 / (60*0.8)) = ceil(3.75)", JSON.stringify(row(fab, "Power supplies")));
ok(row(fab, "Raceway material")?.qty === 20 && row(fab, "Raceway hardware")?.qty === 40, "raceway + hardware rows");
ok(row(fab, "Mounting fasteners")?.qty === 20, "fasteners = 4 x 5");
ok(row(fab, "Paint coverage")?.qty > 0, "paint sqft row");
ok(row(fab, "Assembly labor")?.qty === 7.5 && row(fab, "Installation labor")?.qty === 6, "labor hours computed");
ok(fab.issues.filter((i) => i.kind === "missing_product_data").length === 0, "no missing-data issues with full product spec");

// estimated perimeter flagged when not authored.
const est = channelSetTakeoff({ letter_count: 4, letter_height_inches: 24, fabrication: "fabricated", illumination: "unlit" }, { fasteners_per_letter: 2, install_hours: 3, assembly_hours_per_letter: 1 });
ok(row(est, "Return coil")?.source === "estimated", "unauthored perimeter -> estimated source");
ok(est.issues.some((i) => i.kind === "assumption" && i.field === "total_perimeter_inches"), "estimated perimeter flags assumption");

// missing LED data -> null qty + issue, never a guess.
const noLed = channelSetTakeoff({ letter_count: 4, letter_height_inches: 24, illumination: "front_lit", letter_type: "purchased" }, { install_hours: 2, fasteners_per_letter: 2 });
ok(row(noLed, "LED modules")?.qty === null && noLed.issues.some((i) => i.field === "led_modules_per_foot"), "missing LED spec -> null qty + issue");
ok(row(noLed, "Power supplies")?.qty === null, "supplies unresolved without specs");
ok(!noLed.rows.some((r) => r.item === "LED modules" && r.qty !== null), "no minted LED qty");

// unlit set emits no electrical rows at all.
const unlit = channelSetTakeoff({ letter_count: 3, letter_height_inches: 12, fabrication: "fabricated", illumination: "unlit" }, { fasteners_per_letter: 2, install_hours: 1, assembly_hours_per_letter: 1, total_perimeter_inches: 120 });
ok(!unlit.rows.some((r) => r.category === "electrical"), "unlit -> zero electrical rows");

// backer dims missing -> null sqft + issue.
const bk = channelSetTakeoff({ letter_count: 2, letter_height_inches: 12, backer_panel: true, letter_type: "purchased", illumination: "unlit" }, { fasteners_per_letter: 2, install_hours: 1 });
ok(row(bk, "Backer panel")?.qty === null && bk.issues.some((i) => i.field === "backer dimensions"), "backer missing dims -> unresolved");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p05: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
