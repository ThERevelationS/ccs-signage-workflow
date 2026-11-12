// P-03 brief-model verifier — provenance merge, conflicts, scale gate.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/channelLetterInstall/channelScopeBrief.js");
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [SRC], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { CHANNEL_BRIEF_VERSION, mergeChannelBriefSources, calibrateChannelScale, channelBriefProposal } = M;

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { if (c) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name, extra); } };

const interview = { answers: { installation_height_feet: 14, mounting_substrate: "brick", installation_type: "flush_mount", letter_height_inches: 18, letter_count: 5, poor_site_access: false } };
const photo = { estimated_height_feet: 14, wall_material: "brick", recommended_install_type: "flush_mount", site_conditions: { parapet: false, poor_electrical_access: false, thick_hollow_walls: true }, confidence: "medium" };
const scope = [{ installation_type: "flush_mount", qty_letters: 5, letter_height_inches: 18, installation_height_feet: 14, wall_material: "brick" }];

// merge — agreeing sources produce one fact with provenance, no conflicts.
const m = mergeChannelBriefSources({ interview, photo, scopeItems: scope });
ok(m.version === CHANNEL_BRIEF_VERSION, "version stamped");
ok(m.conflicts.length === 0, "agreeing sources -> no conflicts", JSON.stringify(m.conflicts));
ok(m.facts.install_height_ft.values.length === 3, "three sources recorded for height");
ok(m.facts.wall_material.values.some((v) => v.origin === "photo" && v.confidence === "medium"), "photo provenance + confidence carried");

// conflicts — disagreeing sources flag every side.
const bad = mergeChannelBriefSources({ interview, photo: { ...photo, estimated_height_feet: 30 }, scopeItems: scope });
const hconf = bad.conflicts.find((c) => c.field === "install_height_ft");
ok(hconf && hconf.values.some((v) => v.origin === "photo" && v.value === 30), "height conflict names photo's value");
ok(hconf && hconf.values.some((v) => v.origin === "interview" && v.value === 14), "height conflict names interview's value");
const twoScope = mergeChannelBriefSources({ interview, scopeItems: [scope[0], { ...scope[0], qty_letters: 8 }] });
ok(twoScope.conflicts.some((c) => c.field === "qty_letters"), "two scope items disagreeing -> conflict");

// scale — known only from a real reference measurement.
ok(calibrateChannelScale({}).known === false, "no reference -> unknown");
const cal = calibrateChannelScale({ reference_object: "door", reference_inches: 84, measured_units: 210 });
ok(cal.known === true && Math.abs(cal.inches_per_unit - 0.4) < 1e-9, "reference measurement -> factor");
ok(calibrateChannelScale({ reference_inches: 0, measured_units: 100 }).known === false, "zero reference -> unknown");

// proposal — ready gate: conflicts + unaccepted-unknown scale block.
const p0 = channelBriefProposal({ interview, photo, scopeItems: scope });
ok(p0.ready === false && p0.blocking.includes("scale"), "unknown scale blocks ready without acknowledgment");
const p1 = channelBriefProposal({ interview, photo, scopeItems: scope, calibration: { reference_object: "door", reference_inches: 84, measured_units: 210 } });
ok(p1.ready === true && p1.blocking.length === 0, "calibrated scale + no conflicts -> ready");
const p2 = channelBriefProposal({ interview, photo, scopeItems: scope, scale_unverified_accepted: true });
ok(p2.ready === true, "explicit scale-unverified acceptance unblocks");
const p3 = channelBriefProposal({ interview, photo: { ...photo, estimated_height_feet: 30 }, scopeItems: scope, scale_unverified_accepted: true });
ok(p3.ready === false && p3.blocking.includes("install_height_ft"), "conflict blocks even with scale accepted");

// assumptions — wall/electrical/structural facts flag from ANY source incl interview.
const p4 = channelBriefProposal({ interview, photo, scopeItems: scope, scale_unverified_accepted: true });
ok(p4.assumptions.some((a) => a.field === "wall_material" && a.origin === "interview"), "interview wall claim flags assumption");
ok(p4.assumptions.some((a) => a.field === "thick_hollow_walls" && a.origin === "photo"), "photo site-condition flags assumption");
ok(p4.assumptions.some((a) => a.field === "parapet"), "parapet flags assumption");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p03: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
