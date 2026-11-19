// Spec-authoritative baseline v2 for laser hardening — recaptures ALL
// effective spec paths at the CURRENT remote head: 2 targets + file guards +
// every file under the dir guards (remote walk). FULL text only for existing
// targets; the rest is hash-only drift coverage. Read-only remote git ops.
//
// brick v2 lesson (carried forward): never post-process captured text on
// Windows (a CP1252 re-decode mangled brick v2's text/normalized fields —
// base64+hash stayed correct). This writes remote-captured values verbatim and
// self-verifies sha256(base64) === hash.
//
// Drift is reported on two bases:
//   driftVsV1   — raw-byte sha changed since the implementer (v1) baseline
//   semanticV1  — for targets, normalized current text === v1 implementer
//                 baseline text AND raw hash === v1 hash. THIS is the
//                 proceed/stop gate ("byte-identical vs implementer baseline").
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/laser-hardening/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "laser-pricing-transport-spec.json", "utf8"));
const PRIOR_HEAD = spec.sourceHead;
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
const TARGETS = [
  "src/components/estimator/laser/laserPricingAvailability.js",
  "src/pages/LaserEstimator.jsx",
];
const FULL = TARGETS.filter((t) => !spec.newRemoteFiles.includes(t));
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 48 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-laser-baseline-v2-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return out;
};
const gun = (o) => JSON.parse(zlib.gunzipSync(Buffer.from(o.stdout.trim(), "base64")).toString("utf8"));
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
const st=fs.statSync(path);
if(st.isDirectory())return {path,exists:true,isDirectory:true};
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
const priorV1 = JSON.parse(fs.readFileSync(E + "laser-pricing-baseline.json", "utf8"));
const v1ByPath = Object.fromEntries(priorV1.files.map((f) => [f.path, f]));
const roleOf = (p) => TARGETS.includes(p) ? "target" : "protected";
const integrity = [];
const files = metaOut.files.map((f) => {
  const v1 = v1ByPath[f.path];
  if (!f.exists || f.isDirectory) {
    return { path: f.path, exists: f.exists, isDirectory: f.isDirectory || undefined, role: roleOf(f.path),
      inV1Baseline: !!v1, driftVsV1: v1 ? (v1.exists !== f.exists) : true };
  }
  const base = { path: f.path, exists: true, crlf: f.crlf, hash: f.hash, role: roleOf(f.path) };
  if (FULL.includes(f.path)) {
    const src = fullByPath[f.path];
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
    // self-integrity: base64 must round-trip to the same bytes hash + text
    const dec = Buffer.from(src?.base64 ?? "", "base64");
    const decSha = crypto.createHash("sha256").update(dec).digest("hex");
    if (decSha !== f.hash || dec.toString("utf8") !== src.text)
      integrity.push({ path: f.path, decSha, hash: f.hash, textMatch: dec.toString("utf8") === src.text });
    // implementer (v1) captured the api-view = LF-normalized text + raw hash
    base.semanticMatchV1 = v1 ? (v1.text !== undefined ? base.normalized === v1.text : undefined) : undefined;
    base.byteMatchV1 = v1?.hash !== undefined ? f.hash === v1.hash : undefined;
  }
  base.inV1Baseline = !!v1;
  base.driftVsV1 = !v1 ? true : (v1.exists !== true || v1.hash !== f.hash);
  return base;
});
const { head, dirty, changed, headAfter, dirtyAfter } = metaOut;
fs.writeFileSync(E + "laser-pricing-baseline-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "laser-pricing-baseline-v2-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, driftVsV1: files.filter((f) => f.driftVsV1).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
const drift = files.filter((f) => f.driftVsV1).map((f) => f.path);
const targetSemantic = TARGETS.map((p) => {
  const f = files.find((x) => x.path === p);
  if (spec.newRemoteFiles.includes(p)) return { path: p, ok: f.exists === false, note: "new-remote must stay absent" };
  return { path: p, ok: f.exists === true && !f.isDirectory && f.semanticMatchV1 === true && f.byteMatchV1 === true, semanticMatchV1: f.semanticMatchV1, byteMatchV1: f.byteMatchV1 };
});
const targetStop = targetSemantic.filter((t) => !t.ok);
const dirGuardFiles = files.filter((f) => f.isDirectory).map((f) => f.path);
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  dirGuardFilesPassedAsFiles: dirGuardFiles,
  driftVsV1: drift,
  targetByteDriftVsV1: drift.filter((p) => SPEC_TARGETS.includes(p)),
  targetSemantic,
  allTargetsSemanticallyIdenticalToV1: targetStop.length === 0,
  integrityFailures: integrity,
  fileCount: files.length,
}, null, 1));
if (targetStop.length > 0 || integrity.length > 0 || dirGuardFiles.length > 0) process.exit(3);
