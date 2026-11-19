const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const APP = "68dfcc5e57bbbc35387da97c";
const TREE = ".audit-work/foundation-phaseb3/candidate-tree-src";
const OUT = ".audit-work/foundation-o029-cutschedule/remote-check";
const files = [
  "src/components/estimator/foundation/foundationReinforcementProjection.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/foundationReinforcementBOMRows.js",
  "src/components/estimator/foundation/foundationReinforcementProposal.js",
  "src/components/estimator/foundation/foundationReinforcementModel.js",
  "src/components/estimator/foundation/foundationReinforcementSupport.js",
  "src/components/estimator/foundation/foundationReinforcementCost.js",
  "src/components/estimator/foundation/foundationReinforcementItemProjection.js",
  "src/components/estimator/foundation/foundationGeometryInputs.js",
  "src/components/estimator/foundation/foundationReinforcementPartDescriptors.js",
  "src/components/masterInventory/foundationFieldSchema.js",
  "src/components/estimator/foundation/foundationReinforcementCutSchedule.js",
];
for (const f of files) {
  const name = f.replace(/[\/]/g, "__");
  try {
    const out = execFileSync("npx", ["base44@latest", "sandbox", "read", f,
      "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 60000 });
    const parsed = JSON.parse(out.slice(out.indexOf("{")));
    const rec = (parsed.files || []).find(r => r.path === f) || parsed.files?.[0];
    if (!rec || rec.content === undefined) { console.log(`${f}: EMPTY-OR-MISSING (${out.slice(0,120)})`); continue; }
    fs.writeFileSync(`${OUT}/${name}`, rec.content);
    const local = `${TREE}/${f.replace(/^src\//, "")}`;
    if (!fs.existsSync(local)) { console.log(`${f}: remote-exists, ABSENT-in-tree (${rec.content.length} bytes)`); continue; }
    const same = fs.readFileSync(local, "utf8") === rec.content;
    console.log(`${f}: ${same ? "IDENTICAL" : "DIFFERS"} (${rec.content.length} bytes)`);
  } catch (e) {
    const msg = String(e.stdout || e.message || "").slice(0, 200).replace(/\s+/g, " ");
    console.log(`${f}: READ-FAILED ${msg}`);
  }
}
