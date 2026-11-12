// P-02 interview-model verifier — pure asserts for channelInterviewModel.
// Run: node .audit-work/channel-p02-interview/verify-p02.mjs  (also remote)
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/channelLetterInstall/channelInterviewModel.js");
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [SRC], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const {
  CHANNEL_INTERVIEW_VERSION, CHANNEL_INTERVIEW_FIELDS,
  sanitizeChannelInterview, channelInterviewIssues, channelInterviewToProjectDraft,
} = M;

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { if (c) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name, extra); } };

// P-02 named-fact coverage — every fact the row requires has an interview field.
const keys = new Set(CHANNEL_INTERVIEW_FIELDS.map((f) => f.key));
const NAMED = ["letter_text", "font_name", "artwork_ref", "letter_count", "letter_height_inches", "letter_depth_inches", "letter_type", "faces_included", "returns_included", "backs_included", "illumination", "finish_color", "mounting_substrate", "raceway_length_feet", "backer_panel", "installation_height_feet", "poor_site_access", "electrical_scope", "electrical_access", "install_environment", "site_address"];
ok(NAMED.every((k) => keys.has(k)), "all P-02 named facts have fields", NAMED.filter((k) => !keys.has(k)).join(","));

// sanitize — unknown stays null, never a default.
const s = sanitizeChannelInterview({});
ok(s.version === CHANNEL_INTERVIEW_VERSION, "version stamped");
ok(Object.values(s.answers).every((v) => v === null), "blank interview -> all null not defaults");
const s2 = sanitizeChannelInterview({ letter_count: "abc", letter_height_inches: 24, installation_type: "bogus", illumination: "halo_lit", letter_count2: 5 });
ok(s2.answers.letter_count === null, "malformed integer -> null");
ok(s2.answers.letter_height_inches === 24, "number coerced");
ok(s2.answers.installation_type === null, "out-of-vocab enum -> null");
ok(s2.answers.illumination === "halo_lit", "valid enum kept");

// issues — required missing on blank.
const miss = channelInterviewIssues(s.answers);
ok(miss.filter((i) => i.kind === "missing").length === CHANNEL_INTERVIEW_FIELDS.filter((f) => f.required).length, "all required fields report missing");

// conflicts
const a = { letter_text: "SIGNS", letter_count: 10, letter_height_inches: 24, letter_type: "channel_flush_mounted", illumination: "front_lit", installation_type: "flush_mount", mounting_substrate: "eifs", install_environment: "exterior", installation_height_feet: 12, electrical_access: "verified" };
let iss = channelInterviewIssues(a);
ok(iss.some((i) => i.kind === "conflict" && i.field === "letter_count"), "text/count mismatch is a conflict");
a.letter_count = 5; iss = channelInterviewIssues(a);
ok(!iss.some((i) => i.kind === "conflict" && i.field === "letter_count"), "matching count clears conflict");
a.installation_type = "raceway"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.field === "raceway_length_feet" && i.kind === "conflict"), "raceway type needs length");
a.raceway_length_feet = 40; iss = channelInterviewIssues(a);
ok(!iss.some((i) => i.field === "raceway_length_feet"), "length clears raceway conflict");
a.installation_type = "flush_mount"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.field === "raceway_length_feet" && i.kind === "conflict"), "length on non-raceway conflicts");
a.raceway_length_feet = null; a.electrical_access = "none"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.field === "electrical_access" && i.kind === "conflict"), "lit + no power is a conflict");
a.illumination = "unlit"; a.installation_type = "halo_lit"; a.electrical_access = "verified"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.field === "illumination" && i.kind === "conflict"), "unlit + halo type conflicts");
a.illumination = "halo_lit"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.kind === "unverified_assumption" && i.field === "mounting_substrate"), "substrate answer flags assumption");
a.mounting_substrate = "unknown"; a.electrical_access = "unknown"; iss = channelInterviewIssues(a);
ok(iss.some((i) => i.field === "electrical_access" && i.kind === "unverified_assumption"), "unknown electrical -> explicit allowance flag");

// draft mapping — answered facts land on real entity fields, nothing else.
const full = sanitizeChannelInterview({
  letter_text: "HELLO", font_name: "Helvetica", letter_count: 5, letter_height_inches: 18, letter_depth_inches: 4,
  letter_type: "channel_flush_mounted", faces_included: true, returns_included: true, illumination: "front_lit",
  finish_color: "red", installation_type: "flush_mount", mounting_substrate: "brick",
  installation_height_feet: 14, install_environment: "exterior", site_address: "123 Main",
  electrical_access: "poor", electrical_scope: "dedicated 20A circuit", after_hours: true,
}).answers;
const draft = channelInterviewToProjectDraft(full);
ok(draft.interview_version === CHANNEL_INTERVIEW_VERSION, "draft version stamped");
ok(draft.install_environment === "exterior" && draft.site_address === "123 Main", "project-mapped fields land");
const it = draft.items[0];
ok(it.qty_letters === 5 && it.letter_height_inches === 18 && it.installation_type === "flush_mount", "item-mapped fields land");
ok(it.wall_material === "brick" && it.poor_electrical_access === true, "substrate + poor electrical mapped");
ok(it.after_hours_weekend === true && it.installation_height_feet === 14, "access + height mapped");
ok(it.description.includes("HELLO") && it.letter_type === "channel_flush_mounted", "content facts feed description/type");
ok(it.electrical_scope_notes === "dedicated 20A circuit", "electrical scope notes carried");
ok(Array.isArray(draft.unverified_assumptions) && draft.unverified_assumptions.includes("mounting_substrate"), "assumption list attached");
// unknown facts stay absent — no fabricated fields on the draft.
const sparse = channelInterviewToProjectDraft(sanitizeChannelInterview({ letter_count: 3, installation_type: "flush_mount" }).answers);
ok(sparse.items[0].qty_letters === 3 && sparse.items[0].letter_height_inches === undefined && sparse.site_address === undefined, "unanswered facts absent not defaulted");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p02: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
