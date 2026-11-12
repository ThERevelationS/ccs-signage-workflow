// P-11 revision-lifecycle verifier — copy/template/lock/revise/undo/accept/reopen.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelProposalRevisions.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { copyProposal, templateProposal, lockProposal, unlockProposal, reviseProposal, undoRevision, acceptProposal, reopenProposal } = M;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

const base = { id: "p1", mode: "fabricated", spec: { letter_count: 5 }, qty: 5, description: "Set" };

// complete copy: new id, lineage, acceptance stripped, deep clone.
const acc = acceptProposal(base, { accepted_by: "op", prices: { a: 1 } });
const cp = copyProposal(acc);
ok(cp.id !== "p1" && cp.copied_from === "p1" && cp.accepted === false && cp.pricing_basis_snapshot === null, "copy = new draft with lineage, no acceptance");
cp.spec.letter_count = 99;
ok(base.spec.letter_count === 5, "copy is deep — source untouched");

// template drops identity.
const tpl = templateProposal({ ...base, customer_id: "c1", customer_name: "Bob", project_id: "pr" });
ok(tpl.is_template === true && !("customer_id" in tpl) && !("project_id" in tpl), "template strips customer/project identity");

// locks refuse locked edits only.
const locked = lockProposal(base, ["qty"]);
ok(locked.locked_fields.includes("qty"), "field locked");
const r = reviseProposal(locked, { qty: 9, description: "New desc" });
ok(r.refused.includes("qty") && r.applied.includes("description"), "locked refused, free applied");
ok(r.proposal.qty === 5 && r.proposal.description === "New desc" && r.proposal.revision_n === 1, "partial revise, revision stamped");
const un = unlockProposal(locked, ["qty"]);
ok(!un.locked_fields.includes("qty"), "unlock releases field");

// undo restores prior snapshot, keeps trail.
const undone = undoRevision(r.proposal);
ok(undone.description === "Set" && (undone.revisions || []).length === 0 && undone.revision_n === 1, "undo restores snapshot, keeps revision counter");

// acceptance: frozen + pricing snapshot + revise refused.
ok(acc.accepted === true && acc.pricing_basis_snapshot !== null, "acceptance stamps snapshot");
ok(acc.pricing_basis_snapshot.prices.a === 1 && acc.pricing_basis_snapshot.mode === "fabricated", "snapshot captures basis");
const rAcc = reviseProposal(acc, { qty: 7 });
ok(rAcc.refused.length === 1 && rAcc.reason.includes("frozen") && rAcc.proposal.qty === 5, "accepted proposal refuses edits");

// reopen: editable again, history preserved.
const ro = reopenProposal(acc, "client change");
ok(ro.accepted === false && ro.prior_acceptance.accepted_by === "op" && ro.prior_acceptance.pricing_basis_snapshot !== null, "reopen keeps prior acceptance as history");
ok(ro.reopened_reason === "client change", "reopen reason recorded");
const rRo = reviseProposal(ro, { qty: 7 });
ok(rRo.applied.length === 1 && rRo.proposal.qty === 7, "reopened proposal editable");
ok(reopenProposal(base, "x").accepted !== false, "reopen on non-accepted is a no-op");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p11: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
