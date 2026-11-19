// Cabinets/landscape/clone-guard — v2 baseline capture for HEAD 58755f09
// (post supplier-defaults -23 transport). Single remote run: head + dirty +
// full text + sha256 for every in-scope file. Read-only.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement22/";
const APP = "68dfcc5e57bbbc35387da97c";
const TARGETS = [
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/components/estimator/foundation/landscapeMaterials.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/SignageCabinetsPanel.jsx",
  "src/components/estimator/foundation/LandscapeDesigner.jsx",
  "src/components/estimator/foundation/foundationAssemblyModel.js",
  "src/pages/FoundationEstimator.jsx",
];
const REFERENCE = [
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
  // page-harness dependency sources re-pinned at the new head as guards
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationSaveSession.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationTemplateModel.js",
  "src/components/estimator/foundation/foundationLayoutModel.js",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const out={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
files:${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,text,hash:crypto.createHash("sha256").update(buf).digest("hex"),
role:${JSON.stringify(Object.fromEntries([...TARGETS.map(t=>[t,"target"]),...REFERENCE.map(r=>[r,"reference"])]))}[path]};})};
out.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
out.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(out));`;
const seed = `p=$(mktemp /tmp/ccs-cabland-baseline-v2-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
fs.writeFileSync(E + "cabinets-landscape-baseline-v2.json", JSON.stringify(snap, null, 1));
fs.writeFileSync(E + "cabinets-landscape-baseline-v2-status.json", JSON.stringify({
  head: snap.head, dirtyClean: snap.dirty === "", headStable: snap.headAfter === snap.head,
  dirtyAfterClean: snap.dirtyAfter === "",
  missing: snap.files.filter((f) => !f.exists).map((f) => f.path),
  count: snap.files.length,
  roles: Object.fromEntries(snap.files.map((f) => [f.path, f.role])),
}, null, 1));
console.log(JSON.stringify({
  head: snap.head, headStable: snap.headAfter === snap.head,
  dirtyClean: snap.dirty === "", dirtyAfterClean: snap.dirtyAfter === "",
  missing: snap.files.filter((f) => !f.exists).map((f) => f.path),
  count: snap.files.length,
}, null, 1));
