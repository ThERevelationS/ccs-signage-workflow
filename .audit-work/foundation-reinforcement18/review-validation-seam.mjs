import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const DIR = ".audit-work/foundation-reinforcement18";
const hash = text => createHash("sha256").update(text).digest("hex");
const modelPath = "src/components/estimator/foundation/foundationReinforcementModel.js";
const validatorPath = "src/components/estimator/foundation/foundationInputValidation.js";
const geometryPath = "src/components/estimator/foundation/foundationGeometryInputs.js";
const before = JSON.parse(fs.readFileSync(`${DIR}/fresh-cost-source.json`, "utf8")).files.find(f => f.path === validatorPath);
fs.writeFileSync(`${DIR}/seam-validator-before.txt`, before.content);
fs.writeFileSync(`${DIR}/seam-validator-after.txt`, fs.readFileSync(validatorPath, "utf8"));
const diff = spawnSync("git", ["diff", "--no-index", "--no-color", "--",
  `${DIR}/seam-validator-before.txt`, `${DIR}/seam-validator-after.txt`], { encoding: "utf8" });
assert.ok(diff.status <= 1);
fs.writeFileSync(`${DIR}/seam-validator-diff.txt`, diff.stdout);
console.log(diff.stdout);
const model = fs.readFileSync(modelPath, "utf8");
const nextImport = 'import { foundationItemGeometryIssues as foundationItemInputIssues } from "./foundationGeometryInputs";';
assert.equal(model.split(nextImport).length, 2);
const original = model.replace(nextImport, 'import { foundationItemInputIssues } from "./foundationInputValidation";');
const core = JSON.parse(fs.readFileSync(`${DIR}/core-acceptance.json`, "utf8"));
assert.equal(hash(original), core.sha256, "Model changed beyond the exact one-line import redirect.");
const summary = JSON.parse(fs.readFileSync(`${DIR}/seam-checks/summary.json`, "utf8"));
assert.deepEqual(summary.results.map(row => row.cases), [83, 111, 39]);
for (const row of summary.results) {
  const result = JSON.parse(fs.readFileSync(row.output, "utf8"));
  assert.equal(result.results.length, row.cases);
  assert.ok(result.results.every(test => test.ok));
  console.log(`${row.name}: reviewed ${row.cases} passing artifact records; no test rerun.`);
}
const meta = JSON.parse(fs.readFileSync(`${DIR}/seam-page-meta.json`, "utf8"));
for (const file of [geometryPath, validatorPath, "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/auth/EmailGate.jsx", "src/components/estimator/foundation/FoundationToolbar.jsx"]) assert.ok(meta.inputs[file], file);
assert.equal(!!meta.inputs[modelPath], false);
assert.equal(!!meta.inputs["src/components/estimator/foundation/foundationReinforcementCost.js"], false);
console.log("Full model delta: ONLY one import; old source SHA reconstructed. Current page still excludes model/cost.");
if (process.argv[2] === "accept") {
  fs.writeFileSync(`${DIR}/validation-seam-acceptance.json`, JSON.stringify({
    verified: true, localOnly: true, integrated: false, remoteWrites: false,
    coreSourceSha256: core.sha256, modelSourceSha256: hash(model),
    geometrySourceSha256: hash(fs.readFileSync(geometryPath)), validatorSourceSha256: hash(fs.readFileSync(validatorPath)),
    basicCases: 83, legacyCases: 111, modelCases: 39, modelChange: "one-import-only",
    checkedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}
