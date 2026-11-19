// Re-capture for HEAD drift — same 28-file recipe as mk-baseline.cjs,
// drift flags vs the implementer's frozen baseline. Writes *-v2 artifacts.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement20/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "masonry-residuals-transport-spec.json", "utf8"));
const PRIOR_HEAD = spec.sourceHead; // diff base for the changed list
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
// same role/text+base64 conventions as mk-baseline.cjs (schema parity)
const TARGETS = [
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/pages/FoundationEstimator.jsx",
];
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
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...SPEC_TARGETS, ...SPEC_GUARDS])]; // 28, spec-authoritative
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${PRIOR_HEAD} HEAD").toString(),
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
const seed = `p=$(mktemp /tmp/ccs-masonry-baseline-v2-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
const prior = JSON.parse(fs.readFileSync(E + "masonry-residuals-baseline.json", "utf8"));
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
for (const f of snap.files) {
  const b = priorByPath[f.path];
  f.driftFromBaseline = !b || b.hash !== f.hash || b.normalized !== f.normalized;
}
const { head, dirty, changed, files, headAfter, dirtyAfter } = snap;
fs.writeFileSync(E + "masonry-residuals-baseline-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "masonry-residuals-baseline-status-v2.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role || "protected"])) }, null, 1));
const drift = files.filter((f) => f.driftFromBaseline).map((f) => f.path);
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  driftFiles: drift,
  targetDrift: drift.filter((p) => SPEC_TARGETS.includes(p)),
  guardDrift: drift.filter((p) => SPEC_GUARDS.includes(p)),
  allTargetsByteIdentical: drift.every((p) => !SPEC_TARGETS.includes(p)),
  fileCount: files.length,
}, null, 1));
