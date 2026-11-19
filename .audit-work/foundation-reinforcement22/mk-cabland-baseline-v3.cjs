// Spec-authoritative baseline v3 — covers ALL 50 spec paths (7 targets + 43
// guards); implementer's baseline-v2 lacks the 23 hash-only guards. Same
// role/text conventions as mk-baseline-v2.cjs (text+hash for FULL set, hash-only
// for pure guards) + normalized added for FULL. Drift-diffed vs prior baseline.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement22/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "cabinets-landscape-transport-spec.json", "utf8"));
const PRIOR_HEAD = spec.sourceHead;
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
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
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationSaveSession.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationTemplateModel.js",
  "src/components/estimator/foundation/foundationLayoutModel.js",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...SPEC_TARGETS, ...SPEC_GUARDS])]; // spec-authoritative
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-cabland-baseline-v3-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return JSON.parse(out.stdout);
};
const meta = remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const out={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${PRIOR_HEAD} HEAD").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),
hash:crypto.createHash("sha256").update(buf).digest("hex"),
role:${JSON.stringify(Object.fromEntries([...TARGETS.map(t=>[t,"target"]),...REFERENCE.map(r=>[r,"reference"])]))}[path]||"protected"};})};
out.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
out.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(out));`, "meta");
const full = remote(`const fs=require("fs"),crypto=require("crypto");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(JSON.stringify({files}));`, "full");
const fullByPath = Object.fromEntries(full.files.map((f) => [f.path, f]));
const prior = JSON.parse(fs.readFileSync(E + "cabinets-landscape-baseline-v2.json", "utf8"));
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
const files = meta.files.map((f) => {
  if (!f.exists) return f;
  const src = fullByPath[f.path];
  const base = { path: f.path, exists: true, crlf: f.crlf, hash: f.hash, role: f.role };
  if (FULL.includes(f.path)) {
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
  }
  const b = priorByPath[f.path];
  base.inPriorBaseline = !!b;
  base.driftFromBaseline = !b ? false : (b.hash !== f.hash || (b.normalized !== undefined && base.normalized !== undefined && b.normalized !== base.normalized));
  return base;
});
const { head, dirty, changed, headAfter, dirtyAfter } = meta;
fs.writeFileSync(E + "cabinets-landscape-baseline-v3.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "cabinets-landscape-baseline-v3-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path), addedVsPriorBaseline: files.filter((f) => f.inPriorBaseline === false).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
const drift = files.filter((f) => f.driftFromBaseline).map((f) => f.path);
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  addedVsPriorBaseline: files.filter((f) => f.inPriorBaseline === false).map((f) => f.path),
  driftFiles: drift,
  targetDrift: drift.filter((p) => SPEC_TARGETS.includes(p)),
  guardDrift: drift.filter((p) => SPEC_GUARDS.includes(p)),
  allTargetsByteIdentical: drift.every((p) => !SPEC_TARGETS.includes(p)),
  fileCount: files.length,
}, null, 1));
