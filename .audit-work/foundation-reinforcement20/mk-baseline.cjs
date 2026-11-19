// Masonry residual-input hardening — fresh baseline at HEAD 1e999632.
// Same role/text+base64 conventions as the -19 mk-pole-baseline recipe.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement20/";
const APP = "68dfcc5e57bbbc35387da97c";
const EXPECTED_HEAD = "1e99963215ce57335366551cbbcaf700a9f8bcad";

// Candidate targets for this unit (files we will produce hardened versions of).
const TARGETS = [
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/pages/FoundationEstimator.jsx",
];
// Reference: full text needed for frozen-source bundles + conventions.
const REFERENCE = [
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
];
// Protected/guard files — hash-only (must remain byte-identical after transport).
const PROTECTED = [
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "base44/shared/estimatorAiModelPolicy.js",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/workOrderConversion.js",
  "base44/functions/staffEntityWrite/entry.ts",
  "base44/functions/staffDataRead/entry.ts",
  "src/components/estimator/builder/builderEntityPersistence.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
  "src/components/estimator/foundation/foundationAiReview.js",
  "src/components/estimator/foundation/AiEngineeringAssistant.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...TARGETS, ...REFERENCE, ...PROTECTED])];

const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
const base={path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(buf).digest("hex"),
role:${JSON.stringify(TARGETS)}.includes(path)?"target":(${JSON.stringify(REFERENCE)}.includes(path)?"reference":"protected")};
if(${JSON.stringify(FULL)}.includes(path)){base.text=text;base.base64=buf.toString("base64");}
return base;})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`;
const seed = `p=$(mktemp /tmp/ccs-masonry-baseline-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
const { head, dirty, files, headAfter, dirtyAfter } = snap;
fs.writeFileSync(E + "masonry-residuals-baseline.json", JSON.stringify({ head, dirty, files, headAfter, dirtyAfter }, null, 1));
const report = {
  head, expectedHead: EXPECTED_HEAD, headMatches: head === EXPECTED_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  roles: Object.fromEntries(files.map((f) => [f.path, f.role])),
  hashes: Object.fromEntries(files.map((f) => [f.path, f.hash])),
  fileCount: files.length,
};
fs.writeFileSync(E + "masonry-residuals-baseline-status.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
