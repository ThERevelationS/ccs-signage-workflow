const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement19/";
const APP = "68dfcc5e57bbbc35387da97c";
const OUTLINE_HEAD = "e0b019af2"; // landed outline unit; 2 later commits touched only timeclock
// same 22 paths as the -18 outline baseline + FoundationPolesPanel.jsx (23 total)
const prior = JSON.parse(fs.readFileSync(".audit-work/foundation-reinforcement18/masonry-outline-continuation-source.json", "utf8"));
const paths = prior.files.map((f) => f.path);
for (const extra of [
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/poleCalculator.js",
]) {
  if (!paths.includes(extra)) paths.push(extra);
}
// candidate targets get text+base64; convention-reference files also get text+base64 for local study
const TARGETS = [
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
];
const REFERENCE = [
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/pages/FoundationEstimator.jsx",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${OUTLINE_HEAD} HEAD").toString(),
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
const seed = `p=$(mktemp /tmp/ccs-pole-baseline-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
// drift flags vs the -18 v1 baseline (hash + normalized must BOTH match for byte-identical)
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
for (const f of snap.files) {
  const b = priorByPath[f.path];
  f.driftFromR18Baseline = !b || b.hash !== f.hash || b.normalized !== f.normalized;
}
const { head, dirty, changed, files, headAfter, dirtyAfter } = snap;
fs.writeFileSync(E + "pole-pricing-baseline.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "pole-pricing-baseline-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromR18Baseline).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role || "protected"])) }, null, 1));
const report = {
  head, outlineHeadWas: OUTLINE_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSinceOutline: changed.trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  driftFromR18: files.filter((f) => f.driftFromR18Baseline).map((f) => f.path),
  fileCount: files.length,
  targets: TARGETS,
};
console.log(JSON.stringify(report, null, 1));
