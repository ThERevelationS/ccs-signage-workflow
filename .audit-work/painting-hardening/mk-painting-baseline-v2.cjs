// Spec-authoritative baseline v2 — covers ALL effective spec paths:
// 3 targets + file-path guards + EVERY file under the 4 directory guards
// (remote walk). Implementer's baseline covered only the 3 targets.
// FULL = 3 targets (text+base64+normalized); guards hash-only.
// gzip+base64 remote output. Drift-diffed vs prior baseline.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/painting-hardening/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "painting-pricing-transport-spec.json", "utf8"));
const PRIOR_HEAD = spec.sourceHead;
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
const TARGETS = [
  "src/components/estimator/paint/paintCalc.js",
  "src/components/estimator/paint/paintPricingAvailability.js",
  "src/pages/PaintingEstimator.jsx",
];
const FULL = TARGETS.slice();
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 48 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-painting-baseline-v2-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return out; // stdout is gzip+base64; caller gunzips
};
const gun = (o) => JSON.parse(zlib.gunzipSync(Buffer.from(o.stdout.trim(), "base64")).toString("utf8"));
// expand trailing-slash dir guards via remote walk, then hash every effective path
const metaOut = gun(remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),zlib=require("zlib");
const guards=${JSON.stringify(SPEC_GUARDS)};
const expanded=[];
const walkInto=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const c=d+"/"+e.name;if(e.isDirectory())walkInto(c);else expanded.push(c);}};
for(const p of guards){if(!p.endsWith("/")){expanded.push(p);continue;}
try{walkInto(p.replace(/\\/$/,""));}catch(e){expanded.push(p);}}
const paths=[...new Set([...${JSON.stringify(SPEC_TARGETS)},...expanded])];
const out={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${PRIOR_HEAD} HEAD").toString(),
files:paths.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),
hash:crypto.createHash("sha256").update(buf).digest("hex")};})};
out.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
out.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(zlib.gzipSync(Buffer.from(JSON.stringify(out),"utf8")).toString("base64"));`, "meta"));
const fullOut = gun(remote(`const fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(zlib.gzipSync(Buffer.from(JSON.stringify({files}),"utf8")).toString("base64"));`, "full"));
const fullByPath = Object.fromEntries(fullOut.files.map((f) => [f.path, f]));
const prior = JSON.parse(fs.readFileSync(E + "painting-pricing-baseline.json", "utf8"));
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
const roleOf = (p) => TARGETS.includes(p) ? "target" : "protected";
const files = metaOut.files.map((f) => {
  if (!f.exists) {
    const b = priorByPath[f.path];
    return { ...f, role: roleOf(f.path), inPriorBaseline: !!b, driftFromBaseline: b ? b.exists !== false : false };
  }
  const src = fullByPath[f.path];
  const base = { path: f.path, exists: true, crlf: f.crlf, hash: f.hash, role: roleOf(f.path) };
  if (FULL.includes(f.path)) {
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
  }
  const b = priorByPath[f.path];
  base.inPriorBaseline = !!b;
  base.driftFromBaseline = !b ? false : (b.hash !== f.hash || (b.normalized !== undefined && base.normalized !== undefined && b.normalized !== base.normalized));
  return base;
});
const { head, dirty, changed, headAfter, dirtyAfter } = metaOut;
fs.writeFileSync(E + "painting-pricing-baseline-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "painting-pricing-baseline-v2-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path), addedVsPriorBaseline: files.filter((f) => f.inPriorBaseline === false).map((f) => f.path), dirGuards: SPEC_GUARDS.filter((p) => p.endsWith("/")), roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
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
