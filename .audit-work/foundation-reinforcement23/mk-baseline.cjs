// Supplier-defaults hardening — frozen remote baseline capture (read-only).
// Captures head + dirty state + per-file sha256; full text for targets and
// reference modules (needed for bundling), hash-only for protected guards.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement23/";
const APP = "68dfcc5e57bbbc35387da97c";
const TARGETS = [
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
];
const REFERENCE = [
  "src/pages/FoundationEstimator.jsx",
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
];
const PROTECTED = [
  "src/components/estimator/foundation/FoundationToolbar.jsx",
  "src/components/estimator/foundation/FoundationSectionBanner.jsx",
  "src/components/estimator/foundation/FoundationTemplateDialog.jsx",
  "src/components/estimator/foundation/FoundationLayoutCanvas.jsx",
  "src/components/estimator/foundation/SignageCabinetsPanel.jsx",
  "src/components/estimator/foundation/LandscapeDesigner.jsx",
  "src/components/estimator/foundation/CustomerPricingPanel.jsx",
  "src/components/estimator/foundation/landscapeMaterials.js",
  "src/components/estimator/foundation/foundationAssemblyModel.js",
  "src/components/estimator/foundation/convertToBrickStone.js",
  "src/components/estimator/foundation/foundationAiReview.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
  "src/components/estimator/foundation/AiEngineeringAssistant.jsx",
  "src/components/estimator/foundation/foundationSaveSession.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationTemplateModel.js",
  "src/components/estimator/foundation/foundationLayoutModel.js",
  "src/components/estimator/builder/partSync.js",
  "src/components/estimator/builder/sourceProjectPersistence.js",
  "src/components/estimator/builder/builderEntityPersistence.js",
  "src/components/estimator/settings/moduleSettingDefaults.js",
  "src/pages/FoundationInventory.jsx",
  "src/pages/FoundationCatalog.jsx",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/LaborServiceInventory.jsonc",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...FULL, ...PROTECTED])];
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-supplier-baseline-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return JSON.parse(out.stdout);
};
const meta = remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),
hash:crypto.createHash("sha256").update(buf).digest("hex")};})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString().trim();
console.log(JSON.stringify(snapshot));`, "meta");
const full = remote(`const fs=require("fs"),crypto=require("crypto");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(JSON.stringify({files}));`, "full");
const fullByPath = Object.fromEntries(full.files.map((f) => [f.path, f]));
const files = meta.files.map((f) => {
  if (!f.exists) return f;
  const src = fullByPath[f.path];
  const base = {
    path: f.path, exists: true, crlf: f.crlf, hash: f.hash,
    role: TARGETS.includes(f.path) ? "target" : (REFERENCE.includes(f.path) ? "reference" : "protected"),
  };
  if (FULL.includes(f.path)) {
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
  }
  return base;
});
const { head, dirty, headAfter, dirtyAfter } = meta;
fs.writeFileSync(E + "supplier-defaults-baseline.json", JSON.stringify({ head, dirty, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "supplier-defaults-baseline-status.json", JSON.stringify({ head, dirty, headAfter, dirtyAfter, roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
console.log(JSON.stringify({
  head, dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  crlfFiles: files.filter((f) => f.crlf).map((f) => f.path),
  fileCount: files.length,
}, null, 1));
