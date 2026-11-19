import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = ".audit-work/foundation-reinforcement18/";
const full = JSON.parse(fs.readFileSync(DIR + "cost-print-independent-candidate.json", "utf8"));
const conversion = "src/components/estimator/workOrderConversion.js";
const targets = full.targets.filter(file => file !== conversion);
assert.equal(targets.length, 2);
const candidate = {
  ...full, targets, heldTargets: [conversion], costCaptureHeld: true,
  files: { ...full.files, [conversion]: full.source[conversion] },
  edits: Object.fromEntries(targets.map(file => [file, full.edits[file]])),
  apiCandidateHashes: Object.fromEntries(targets.map(file => [file, full.apiCandidateHashes[file]])),
};
assert.equal(candidate.files[conversion], candidate.source[conversion]);
assert.ok(!Object.keys(candidate.edits).some(file => /workOrderConversion|entities\/|foundation\//.test(file)));
fs.writeFileSync(DIR + "print-only-candidate.json", JSON.stringify(candidate, null, 2) + "\n");
console.log("Only two existing print files may be applied; cost capture/schema/v2 remain held.");
