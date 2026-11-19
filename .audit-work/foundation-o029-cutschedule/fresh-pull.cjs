const { execFileSync } = require("child_process");
const NPX = process.platform === "win32" ? "cmd.exe" : "npx";
const NPX_PRE = process.platform === "win32" ? ["/c", "npx"] : [];
const fs = require("fs");
const APP = "68dfcc5e57bbbc35387da97c";
const TREE = ".audit-work/foundation-o029-cutschedule/candidate-tree-src";
const OUT = ".audit-work/foundation-o029-cutschedule/remote-fresh";
fs.mkdirSync(OUT, { recursive: true });
const files = [
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/foundationReinforcementBOMRows.js",
  "src/components/estimator/foundation/foundationReinforcementProjection.js",
  "src/components/estimator/foundation/foundationReinforcementProposal.js",
  "src/components/masterInventory/foundationFieldSchema.js",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/foundationReinforcementEditorSession.js",
  "src/components/estimator/foundation/foundationReinforcementCutSchedule.js",
  "src/components/estimator/foundation/foundationReparentModel.js",
  "src/components/estimator/foundation/foundationRuleRegistry.js",
];
for (const f of files) {
  const name = f.replace(/\//g, "__");
  try {
    const out = execFileSync(NPX, [...NPX_PRE, "base44@latest", "sandbox", "read", f,
      "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 90000 });
    const parsed = JSON.parse(out.slice(out.indexOf("{")));
    const rec = (parsed.files || []).find(r => r.path === f) || parsed.files?.[0];
    if (!rec || rec.content === undefined) { console.log(`${f}: EMPTY-OR-MISSING`); continue; }
    fs.writeFileSync(`${OUT}/${name}`, rec.content);
    const local = `${TREE}/${f.replace(/^src\//, "")}`;
    if (!fs.existsSync(local)) { console.log(`${f}: remote-exists, absent-in-candidate (${rec.content.length}b)`); continue; }
    console.log(`${f}: ${fs.readFileSync(local, "utf8") === rec.content ? "IDENTICAL" : "DIFFERS"} (${rec.content.length}b remote / ${fs.statSync(local).size}b cand)`);
  } catch (e) {
    const msg = String(e.stdout || e.message || "").slice(0, 160).replace(/\s+/g, " ");
    console.log(`${f}: READ-FAILED ${msg}`);
  }
}
