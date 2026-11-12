// P-04 layout-model verifier — envelope/spacing/alignment/mounting/fail-closed.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/channelLetterInstall/channelLayoutModel.js");
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [SRC], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { CHANNEL_LAYOUT_VERSION, channelLetterSetLayout } = M;

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { if (c) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name, extra); } };

// fail-closed: no height -> unresolvable, not a guess.
const none = channelLetterSetLayout({ letter_text: "ABC" });
ok(none.resolvable === false && none.envelope === null, "missing height -> unresolvable");
ok(none.issues.some((i) => i.field === "letter_height_inches"), "missing height named");

// envelope + positions: 4 letters h=24 -> width est 18" each, spacing 4".
const lay = channelLetterSetLayout({ letter_text: "SIGN", letter_height_inches: 24, spacing_inches: 4, illumination: "front_lit", finish_color: "red" });
ok(lay.version === CHANNEL_LAYOUT_VERSION && lay.resolvable === true, "resolvable layout");
ok(lay.letters.length === 4 && lay.letters[0].width === 17.5, "per-letter width via height ratio (24*0.72->17.5)");
ok(lay.letters[1].x === 21.5, "spacing applied", String(lay.letters[1].x));
ok(lay.envelope.width_inches === 82 && lay.envelope.height_inches === 24, "envelope = 4*17.5+3*4", JSON.stringify(lay.envelope));
ok(lay.illumination === "front_lit" && lay.finish_color === "red", "concept + finish carried");

// count-vs-text conflict surfaces.
const conf = channelLetterSetLayout({ letter_text: "SIGN", letter_count: 7, letter_height_inches: 24 });
ok(conf.issues.some((i) => i.kind === "conflict" && i.field === "letter_count"), "count/text conflict surfaces");

// alignment on a wider run.
const ctr = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, spacing_inches: 4, alignment: "center", run_width_inches: 100 });
ok(ctr.letters[0].x === 30.5, "center aligns (100-39)/2", String(ctr.letters[0].x));
const rt = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, spacing_inches: 4, alignment: "right", run_width_inches: 100 });
ok(rt.letters[0].x === 61, "right aligns to 100-39", String(rt.letters[0].x));
const dst = channelLetterSetLayout({ letter_text: "ABC", letter_height_inches: 24, spacing_inches: 4, alignment: "distributed", run_width_inches: 100 });
ok(Math.abs(dst.spacing_inches - 23.75) < 1e-9, "distributed stretches gap (100-52.5)/2", String(dst.spacing_inches));
ok(Math.abs(dst.envelope.width_inches - 100) < 1e-9, "distributed fills run");

// mounting rects.
const rw = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, raceway_length_feet: 8 });
ok(rw.raceway && rw.raceway.width_inches === 96 && rw.raceway.behind === true, "raceway rect from feet");
const bk = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, backer_panel: true });
ok(bk.backer && bk.backer.width_inches === bk.envelope.width_inches, "backer spans envelope");
const noMount = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24 });
ok(noMount.raceway === null && noMount.backer === null, "no mount -> no rects");

// artwork refs carry verbatim.
const art = channelLetterSetLayout({ letter_text: "AB", letter_height_inches: 24, artwork_front_ref: "logo-front.pdf", artwork_back_ref: "halo-back.png" });
ok(art.artwork_front_ref === "logo-front.pdf" && art.artwork_back_ref === "halo-back.png", "front/back artwork refs carried");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p04: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
