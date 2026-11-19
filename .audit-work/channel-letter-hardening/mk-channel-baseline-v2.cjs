// Spec-authoritative baseline v2 — covers ALL effective spec paths:
// 17 targets (text+base64+normalized) + 71 literal protected guards (hash-only).
// gzip+base64 remote output. Drift-diffed vs implementer remoteBaselineHashes
// (apiView-hash basis: normalize CRLF->LF + strip ONE trailing LF).
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/channel-letter-hardening/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "channel-pricing-transport-spec.json", "utf8"));
const proof = JSON.parse(fs.readFileSync(E + "channel-pricing-proof-spec.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync(E + spec.candidateManifest, "utf8"));
const PRIOR_HEAD = spec.sourceHead;
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
const FULL = SPEC_TARGETS.slice();
const implHashes = proof.remoteBaselineHashes || {}; // implementer capture basis: sha256(apiView(raw))
const apiHash = (raw) => crypto.createHash("sha256").update(raw.split("\r\n").join("\n").replace(/\n$/, ""), "utf8").digest("hex");
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 48 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-channel-baseline-v2-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return out;
};
const gun = (o) => JSON.parse(zlib.gunzipSync(Buffer.from(o.stdout.trim(), "base64")).toString("utf8"));
// stage the effective path list remotely (avoids embedding ~6KB JSON in the seed —
// Windows spawn command-line limit). Guards expand inside the remote script anyway;
// only the RAW spec guards are sent here via a chunked temp file.
const stagePaths = (arr, tag) => {
  const b64 = Buffer.from(JSON.stringify(arr)).toString("base64");
  const mk = remote(`const fs=require("fs");const d=fs.mkdtempSync("/tmp/ccs-channel-baseline-v2-${tag}-");console.log(d);`, `mk-${tag}`);
  const dir = mk.stdout.trim();
  for (let i = 0; i < b64.length; i += 3000) {
    run(["sandbox", "run", "printf %s " + b64.slice(i, i + 3000) + " " + (i === 0 ? ">" : ">>") + " " + dir + "/list.b64", "--timeout-ms", "30000", "--app-id", APP, "--branch", "main"]);
  }
  run(["sandbox", "run", "base64 -d " + dir + "/list.b64 > " + dir + "/list.json && rm " + dir + "/list.b64", "--timeout-ms", "30000", "--app-id", APP, "--branch", "main"]);
  return dir + "/list.json";
};
const listFile = stagePaths([...SPEC_TARGETS, ...SPEC_GUARDS], "paths");
const metaOut = gun(remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),zlib=require("zlib");
const all=JSON.parse(fs.readFileSync(${JSON.stringify(listFile)},"utf8"));
const guards=all.slice(${SPEC_TARGETS.length});
const expanded=[];
const walkInto=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const c=d+"/"+e.name;if(e.isDirectory())walkInto(c);else expanded.push(c);}};
for(const p of guards){if(!p.endsWith("/")){expanded.push(p);continue;}
try{walkInto(p.replace(/\\/$/,""));}catch(e){expanded.push(p);}}
const paths=[...new Set([...all.slice(0,${SPEC_TARGETS.length}),...expanded])];
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
const fullOut = gun(remote(`const fs=require("fs"),zlib=require("zlib");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(zlib.gzipSync(Buffer.from(JSON.stringify({files}),"utf8")).toString("base64"));`, "full"));
const fullByPath = Object.fromEntries(fullOut.files.map((f) => [f.path, f]));
const roleOf = (p) => SPEC_TARGETS.includes(p) ? "target" : "protected";
const files = metaOut.files.map((f) => {
  const base = { path: f.path, exists: f.exists, role: roleOf(f.path) };
  if (!f.exists) {
    const impl = manifest[f.path];
    base.inPriorBaseline = impl ? impl.existsOnRemote : false;
    base.driftFromBaseline = impl ? impl.existsOnRemote === true : false;
    return base;
  }
  base.crlf = f.crlf; base.hash = f.hash;
  const src = fullByPath[f.path];
  if (FULL.includes(f.path)) {
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
    const impl = implHashes[f.path] ?? manifest[f.path]?.remoteSha256 ?? null;
    base.implementerHash = impl;
    base.inPriorBaseline = impl !== null;
    base.driftFromBaseline = impl !== null ? apiHash(src?.text ?? "") !== impl : false;
  } else {
    base.inPriorBaseline = false; base.driftFromBaseline = false;
  }
  return base;
});
const { head, dirty, changed, headAfter, dirtyAfter } = metaOut;
fs.writeFileSync(E + "channel-pricing-baseline-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "channel-pricing-baseline-v2-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
const drift = files.filter((f) => f.driftFromBaseline).map((f) => f.path);
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  driftFiles: drift,
  targetDrift: drift.filter((p) => SPEC_TARGETS.includes(p)),
  allTargetsByteIdentical: drift.every((p) => !SPEC_TARGETS.includes(p)),
  fileCount: files.length,
}, null, 1));
