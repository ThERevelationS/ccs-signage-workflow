// W-012 intake-shell verifier — contract shape, allowlisted ops, schema gate.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = async (f) => {
  const out = join(HERE, `.w-${f.split("/").pop()}.mjs`);
  await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/", f)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
};
const { channelIntakeProposal, validateChannelIntakeProposal, CHANNEL_INTAKE_OPS } = await load("channelIntakeShell.js");
const keysOut = join(HERE, ".w-keys.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/estimator/estimatorModuleKeys.js")], bundle: true, format: "esm", platform: "node", outfile: keysOut, logLevel: "silent" });
const { INTAKE_SHELL_CONTRACT } = await import(pathToFileURL(keysOut).href);

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

const brief = {
  facts: { letter_height: { values: [{ value: 24, origin: "interview", confidence: "high" }] } },
  scale: { known: true }, ready: true,
  assumptions: [{ field: "wall_material", value: "eifs", origin: "photo", reason: "unverified on site" }],
  conflicts: [{ field: "letter_count", values: [5, 6] }],
};
const scope = { resolvable: true, issues: [], scope: { mode: "fabricated", optional_scopes: [{ key: "delivery", description: "delivery" }] } };
const interview = { letter_height_inches: 24, letter_count: 5, unverified_assumptions: [{ field: "electrical_scope", reason: "not verified" }] };

// contract shape.
const p = channelIntakeProposal({ interview, brief, scope, projectRevision: 3, proposal_id: "fx" });
ok(p.module_key === "channel_letters" && p.schema_version === INTAKE_SHELL_CONTRACT.schema_version, "module_key + schema_version match contract");
for (const f of INTAKE_SHELL_CONTRACT.required_fields) {
  if (!(f in p)) { ok(false, `required field '${f}' present`); }
}
ok(true, "all contract required_fields present");

// operations: all allowlisted; facts -> set_field; assumptions -> flag; conflicts -> questions.
ok(p.operations.every((o) => CHANNEL_INTAKE_OPS.has(o.op)), "every operation in the allowlist");
ok(p.operations.some((o) => o.op === "set_field" && o.field === "letter_height_inches" && o.value === 24), "answered fact -> set_field");
ok(p.operations.some((o) => o.op === "set_field" && o.field === "fabrication_mode" && o.value === "fabricated"), "mode -> set_field");
ok(p.operations.some((o) => o.op === "set_field" && o.field === "include_delivery" && o.value === true), "optional scope -> include flag");
ok(p.operations.filter((o) => o.op === "flag_assumption").length === 2, "interview + brief assumptions -> 2 flag ops");
ok(p.questions.some((q) => q.kind === "conflict" && q.field === "letter_count"), "conflict -> follow-up question");
ok(p.evidence_refs.some((e) => e.origin === "interview" && e.confidence === "high"), "provenance in evidence_refs");
ok(p.ready === true && p.base_project_revision === 3, "ready + base revision carried");

// schema gate: accepts the emitted proposal.
const v = validateChannelIntakeProposal(p);
ok(v.valid === true, "emitted proposal passes the schema gate");

// gate rejects: non-allowlisted op, wrong module, missing field.
ok(validateChannelIntakeProposal({ ...p, operations: [{ op: "delete_entity", id: "x" }] }).valid === false, "non-allowlisted op rejected");
ok(validateChannelIntakeProposal({ ...p, module_key: "foundation" }).valid === false, "wrong module_key rejected");
const missing = { ...p }; delete missing.operations;
ok(validateChannelIntakeProposal(missing).valid === false, "missing required field rejected");
ok(validateChannelIntakeProposal(null).valid === false, "null rejected");

// not-ready brief -> proposal not ready.
const nr = channelIntakeProposal({ interview: {}, brief: { ...brief, ready: false }, scope });
ok(nr.ready === false, "unready brief -> not-ready proposal");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-w012: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
