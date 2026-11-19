import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const baseline = JSON.parse(fs.readFileSync(DIR + "recovery-remote-source-before.json", "utf8"));
const dependencies = JSON.parse(fs.readFileSync(DIR + "recovery-remote-dependency-source-before.json", "utf8"));
assert.equal(dependencies.files.length, 45);
assert.equal(dependencies.errors.length, 13);
assert.ok(dependencies.errors.every(file => file.error.code === "NOT_FOUND"));
const normalized = text => text.replace(/\r\n/g, "\n");
const sources = Object.fromEntries([...baseline.files, ...dependencies.files].filter(file => typeof file.content === "string")
  .map(file => [file.path, normalized(file.content)]));
const PAGE = "src/pages/FoundationEstimator.jsx";
const SERVICE = "src/components/estimator/builder/builderService.js";
const HELPER = "src/components/estimator/foundation/foundationBuilderRecovery.js";
const localPage = normalized(fs.readFileSync(PAGE, "utf8"));
const start = "  const saveContext = { ...currentEditorRef.current };";
const end = "  const handleSave = () => runSave(\"save\");";
function between(text, from, to) {
  const first = text.indexOf(from), last = text.indexOf(to, first);
  assert.ok(first >= 0 && last > first, "Missing exact candidate boundary");
  return text.slice(first, last);
}
const localSave = between(localPage, start, end);
const remoteSave = between(sources[PAGE], start, end);
assert.ok(!localSave.includes("reinforcementEditor") && !localSave.includes("ReinforcementProposal"));
const loadBlock = between(localSave, "        const recoveryAck =", "        let customerPricing =");
const recoveredBranch = between(localSave, "      if (captured.builderRecovery &&", "      if (outcome.status === \"saved\" && fullyCurrent)");
const syncBlock = between(localSave, "            liveTotal: captured.builderRecovery", "            const ackLine =");
const pageEdits = [
  {
    old_text: 'import { updateBuilderSourceProject } from "@/components/estimator/builder/sourceProjectPersistence";',
    new_text: 'import { updateBuilderSourceProject, sourcePatchMatches } from "@/components/estimator/builder/sourceProjectPersistence";\nimport { loadFoundationBuilderRecovery, verifyFoundationRecoverySource } from "@/components/estimator/foundation/foundationBuilderRecovery";',
  },
  {
    old_text: "    const existing = saveAttemptRef.current;\n    if (existing) return existing.promise;\n    if (pricingBlocked || catalogReloadRef.current) {",
    new_text: "    const existing = saveAttemptRef.current;\n    if (existing) return existing.promise;\n    if (catalogReloadRef.current) {",
  },
  {
    old_text: "      saveSource: async () => {\n        let customerPricing =",
    new_text: "      saveSource: async () => {\n" + loadBlock + "        let customerPricing =",
  },
  {
    old_text: "            sourceProject: {\n              ...savedProject, items: captured.items,",
    new_text: "            sourceProject: captured.builderRecovery ? savedProject : {\n              ...savedProject, items: captured.items,",
  },
  { old_text: "            liveTotal: captured.sectionTotal,\n          }).then((result) => {\n", new_text: syncBlock },
  {
    old_text: "          sourceSnapshot: {\n            ...captured.project, ...captured.basePayload,",
    new_text: "          sourceSnapshot: captured.builderRecovery ? captured.builderRecovery.sourceProject : {\n            ...captured.project, ...captured.basePayload,",
  },
  {
    old_text: '      if (outcome.status === "saved" && fullyCurrent) {',
    new_text: recoveredBranch + '      if (outcome.status === "saved" && fullyCurrent) {',
  },
  {
    old_text: '        setSaveError("Save failed: " + (outcome.error?.message || outcome.status));',
    new_text: '        setSaveError(outcome.error?.pricingUnavailable\n          ? "Pricing unavailable: fix highlighted design inputs or catalog selections before saving."\n          : "Save failed: " + (outcome.error?.message || outcome.status));',
  },
];
const serviceEdits = [
  {
    old_text: "export async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice }) {",
    new_text: "export async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice, expectedPendingKey }) {",
  },
  {
    old_text: "  const existingPending = pendingBuilderMutation(currentLine);\n  if (existingPending) {",
    new_text: '  const existingPending = pendingBuilderMutation(currentLine);\n  if (expectedPendingKey !== undefined && existingPending?.key !== expectedPendingKey) {\n    throw new Error("The pending Builder operation changed before recovery. Reload the estimate before continuing.");\n  }\n  if (existingPending) {',
  },
];
function apply(text, edits) {
  for (const edit of edits) {
    assert.equal(text.split(edit.old_text).length - 1, 1, "Remote edit must match uniquely: " + edit.old_text.slice(0, 100));
    text = text.replace(edit.old_text, edit.new_text);
  }
  return text;
}
const candidate = {
  ...sources,
  [PAGE]: apply(sources[PAGE], pageEdits),
  [SERVICE]: apply(sources[SERVICE], serviceEdits),
  [HELPER]: normalized(fs.readFileSync(HELPER, "utf8")),
};
assert.equal(between(candidate[PAGE], start, end), localSave, "Only the reviewed shared save path may transfer");
assert.equal(candidate[SERVICE].trimEnd(), normalized(fs.readFileSync(SERVICE, "utf8")).trimEnd());
assert.ok(!candidate[PAGE].includes("useFoundationReinforcementEditor"));
assert.ok(!candidate[PAGE].includes("FoundationReinforcementProposalPanel"));
assert.equal(candidate["src/components/estimator/foundation/foundationCalc.js"], sources["src/components/estimator/foundation/foundationCalc.js"]);
assert.equal(candidate["src/components/estimator/builder/partSync.js"], sources["src/components/estimator/builder/partSync.js"]);
const hashes = Object.fromEntries(Object.entries(sources).map(([file, content]) => [file, createHash("sha256").update(content).digest("hex")]));
fs.writeFileSync(DIR + "recovery-remote-candidate-source.json", JSON.stringify({ sources: candidate, baselineHashes: hashes,
  edits: { [PAGE]: pageEdits, [SERVICE]: serviceEdits }, newFiles: [HELPER],
  sourceHead: "fa3b174d70482c8f4e5329ee0e9acf28ec287a50", reinforcementV2Activated: false }, null, 2) + "\n");
for (const [file, name] of [[PAGE, "page"], [SERVICE, "service"]]) {
  fs.writeFileSync(DIR + `recovery-remote-${name}-before.js`, sources[file]);
  fs.writeFileSync(DIR + `recovery-remote-${name}-candidate.js`, candidate[file]);
}
console.log("Prepared remote-derived three-file recovery candidate; legacy calculation/Part sync unchanged, v2 absent.");
