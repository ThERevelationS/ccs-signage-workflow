const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const OLD_HEAD = "e5228929119b889d6bfdd7c39537afca5af896d3";
const EXPECTED_HEAD_PREFIX = "61b74657a"; // per task brief; actual may have moved again
const TARGETS = [
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
];
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
// same 22 paths, same order, as the v1 baseline
const prior = JSON.parse(fs.readFileSync(E + "masonry-outline-continuation-source.json", "utf8"));
const paths = prior.files.map((f) => f.path);
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
// remote capture: one Node program, raw()-style (fs readFileSync + sha256 + normalized + crlf;
// text+base64 only for the 3 targets). changed = diff of OLD_HEAD..HEAD.
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${OLD_HEAD} HEAD").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
const base={path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(buf).digest("hex")};
if(${JSON.stringify(TARGETS)}.includes(path)){base.text=text;base.base64=buf.toString("base64");}
return base;})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`;
const seed = `p=$(mktemp /tmp/ccs-masonry-outline-capture-v2-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
// merge drift flags vs v1 baseline (hash + normalized must BOTH match for byte-identical)
for (const f of snap.files) {
  const b = priorByPath[f.path];
  f.driftFromBaseline = !b || b.hash !== f.hash || b.normalized !== f.normalized;
}
let app = "FAIL";
try {
  const s = JSON.parse(run(["api", "fetch", "GET", `/api/apps/${APP}`]).stdout);
  app = { id: s.id, name: s.name, status: s.status?.state, git_repo_pending: s.git_repo_pending, dev_environment_enabled: s.dev_environment_enabled };
} catch (e) {}
const { head, dirty, changed, files, headAfter, dirtyAfter } = snap;
fs.writeFileSync(E + "masonry-outline-continuation-source-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "masonry-outline-continuation-status-v2.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, app, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path) }, null, 1));
// assert report
const changedList = changed.trim().split("\n").filter(Boolean);
const drift = files.filter((f) => f.driftFromBaseline).map((f) => f.path);
const report = {
  head, headMatchesExpected: head.startsWith(EXPECTED_HEAD_PREFIX),
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedVsOldHead: changedList,
  changedIsOnlyQuickClock: changedList.length === 1 && changedList[0] === "src/components/timeclock/QuickClockSection.jsx",
  driftFiles: drift, allFilesByteIdentical: drift.length === 0, app,
};
console.log(JSON.stringify(report, null, 1));
