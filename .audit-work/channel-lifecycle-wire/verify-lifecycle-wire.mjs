// P-11/P-08 UI-wire verifier — lifecycle adapter field mapping + presence
// checks that the lifecycle card and the fabrication-mode selector are
// actually mounted on the page/row/tab surfaces.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/channelLetterInstall");
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({
  entryPoints: [join(SRC, "channelProposalLifecycle.js")],
  bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent",
});
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { acceptInstallationProposal, reopenInstallationProposal, proposalLifecycleState } = M;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

// --- adapter: accept maps onto entity proposal_* fields -------------------
const draft = { id: "p1", items: [{ a: 1 }], grand_total: 1234 };
const acc = acceptInstallationProposal(draft, { accepted_by: "brett@ccs", prices: { grand_total: 1234 }, totals: { items: 1 } });
ok(acc.proposal_accepted === true, "accept -> proposal_accepted true");
ok(acc.proposal_accepted_by === "brett@ccs" && typeof acc.proposal_accepted_at === "string", "accept stamps by/at");
ok(acc.pricing_basis_snapshot?.prices?.grand_total === 1234, "pricing basis snapshot frozen");
ok(!("accepted" in acc), "no model-name leakage into entity fields");

// --- adapter: reopen requires accepted + preserves prior ------------------
const reopenNoop = reopenInstallationProposal(draft, "why");
ok(reopenNoop === null, "reopen on a draft is a no-op (null)");
const acceptedProject = { ...draft, ...acc };
const re = reopenInstallationProposal(acceptedProject, "customer changed scope");
ok(re.proposal_accepted === false && re.pricing_basis_snapshot === null, "reopen clears acceptance + snapshot");
ok(re.prior_acceptance?.accepted_by === "brett@ccs", "prior acceptance preserved as history");
ok(re.proposal_reopened_reason === "customer changed scope", "reopen reason recorded");

// --- lifecycle state helper ------------------------------------------------
ok(proposalLifecycleState(draft) === "draft", "state: draft");
ok(proposalLifecycleState(acceptedProject) === "accepted", "state: accepted");
ok(proposalLifecycleState({ ...acceptedProject, ...re }) === "reopened", "state: reopened");

// --- UI presence greps ------------------------------------------------------
const page = readFileSync(join(HERE, "../../src/pages/ChannelLetterEstimator.jsx"), "utf8");
ok(page.includes("ProposalLifecycleCard") && page.includes("onUpdateProject={updateProject}"), "page mounts ProposalLifecycleCard");
ok(page.includes("currentUser") , "page passes currentUser");

const row = readFileSync(join(SRC, "LetterPurchaseRow.jsx"), "utf8");
ok(row.includes("FABRICATION_ELIGIBLE") && row.includes("fabrication"), "row exposes purchased/fabricated selector");
const elig = row.match(/FABRICATION_ELIGIBLE = new Set\(\[([\s\S]*?)\]\)/);
ok(elig && elig[1].includes("channel_flush_mounted") && !elig[1].includes("dimensional_letters") && !/"raceway"/.test(elig[1]), "mode selector excludes dimensional + raceway");

const tab = readFileSync(join(SRC, "LettersPurchaseTab.jsx"), "utf8");
ok(tab.includes("unsetModeCount") && tab.includes("no"), "tab flags unset source modes");

// --- copy seams strip lifecycle state (P-11: a copy is a NEW draft) -------
const LIFECYCLE_FIELDS = ["proposal_accepted", "proposal_accepted_by", "proposal_accepted_at",
  "pricing_basis_snapshot", "prior_acceptance", "proposal_reopened_reason",
  "proposal_revision_n", "proposal_revisions", "proposal_locked_fields"];
const extractSet = (file, name) => {
  const m = readFileSync(file, "utf8").match(new RegExp(name + "\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)"));
  // strip // comments before extracting quoted entries — apostrophes inside
  // comments would pair with the field quotes and offset the capture.
  const body = (m?.[1] || "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  return [...body.matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
};
const clientStrip = extractSet(join(HERE, "../../src/components/estimator/moduleShared/moduleProjectActions.js"), "STRIP_ON_COPY");
const serverStrip = extractSet(join(HERE, "../../base44/functions/ensureNewEstimate/entry.ts"), "COPY_PROJECT_STRIP");
ok(LIFECYCLE_FIELDS.every((f) => clientStrip.includes(f)), "client copy strips lifecycle fields");
ok(LIFECYCLE_FIELDS.every((f) => serverStrip.includes(f)), "server clone strips lifecycle fields");
// behavioral: applying the client strip to a payload with acceptance drops it.
const copied = { ...acceptedProject, project_name: "X (Copy)" };
for (const f of new Set(clientStrip)) delete copied[f];
ok(copied.proposal_accepted === undefined && copied.pricing_basis_snapshot === undefined, "copy produces a draft, not a second acceptance");

// --- P-11 hard-freeze: adapter guard helpers -------------------------------
const { isProposalAccepted, patchOnlyTouchesLifecycle } = M;
ok(isProposalAccepted(acceptedProject) === true, "isProposalAccepted: accepted true");
ok(isProposalAccepted(draft) === false && isProposalAccepted(null) === false, "isProposalAccepted: draft/null false");
ok(patchOnlyTouchesLifecycle({ proposal_accepted: true, proposal_accepted_by: "u", proposal_accepted_at: "t", pricing_basis_snapshot: {}, proposal_reopened_reason: null }), "accept patch is lifecycle-only");
ok(patchOnlyTouchesLifecycle({ proposal_accepted: false, prior_acceptance: {}, proposal_reopened_reason: "r", pricing_basis_snapshot: null }), "reopen patch is lifecycle-only");
ok(!patchOnlyTouchesLifecycle({ items: [] }), "items patch refused");
ok(!patchOnlyTouchesLifecycle({ client_name: "x" }), "client_name patch refused");
ok(!patchOnlyTouchesLifecycle({ letter_purchases: [] }), "letter_purchases patch refused");
ok(!patchOnlyTouchesLifecycle({ customer_pricing: { tier_number: 1 } }), "tier patch refused");
ok(patchOnlyTouchesLifecycle({ updated_date: "t" }), "updated_date stamp allowed");
ok(!patchOnlyTouchesLifecycle({ items: [], proposal_accepted: false }), "mixed lifecycle+content patch refused");
ok(LIFECYCLE_FIELDS.every((f) => patchOnlyTouchesLifecycle({ [f]: 1 })), "patch allowlist covers every lifecycle field");

// --- P-11 hard-freeze: page enforcement ------------------------------------
ok(page.includes("isProposalAccepted") && page.includes("patchOnlyTouchesLifecycle"), "page imports freeze helpers");
ok(page.includes("proposalFrozen") && page.includes("denyProposalMutation") && page.includes("useToast"), "page wires frozen state + denial feedback");
ok(/const updateProject = \(patch\) => \{\s*if \(proposalFrozen && !patchOnlyTouchesLifecycle\(patch\)\)/.test(page), "updateProject refuses non-lifecycle patches while frozen");
const guardedFns = ["updateItem", "addItem", "removeItem", "duplicateItem", "reorderItems", "applyAIInstallItems", "applyPhotoEstimate", "applyIntakeDraft"];
for (const fn of guardedFns) {
  const m = page.match(new RegExp("const " + fn + " = \\([^)]*\\) => \\{\\s*if \\(proposalFrozen\\) \\{ denyProposalMutation\\(\\); return; \\}"));
  ok(!!m, fn + " refuses mutations while frozen");
}
ok((page.match(/mutateProject\(\(prev\)/g) || []).length >= 2, "inline JSX handlers route through mutateProject");
ok((page.match(/if \(proposalFrozen\) return;/g) || []).length >= 3, "auto-fill effects skip frozen projects (silent)");
// load + save-stamp paths must stay unguarded raw setProject calls.
ok(page.includes("setProject({ ...blankProject(), ...existing"), "load path stays unguarded");
ok(page.includes("setProject((prev) => ({ ...prev, updated_date: persistedSource.updated_date }))"), "save stamp stays unguarded");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-lifecycle-wire: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
