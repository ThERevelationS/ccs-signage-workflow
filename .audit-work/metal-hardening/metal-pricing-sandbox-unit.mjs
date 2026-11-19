import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const DIR = ".audit-work/metal-hardening/";
const spec = JSON.parse(fs.readFileSync(DIR + "metal-pricing-transport-spec.json", "utf8"));
const proofSpec = JSON.parse(fs.readFileSync(DIR + spec.proofSpec, "utf8"));
const APP = spec.appId, HEAD = spec.sourceHead, prefix = "metal-pricing-sandbox-";
const targets = spec.targetOrder;
const guards = spec.protectedFiles;
let _guardsExpanded = null;
// protectedFiles may contain directory entries ("dir/") — expand via remote walk
function guardsSync() {
  if (_guardsExpanded) return _guardsExpanded;
  if (!guards.some((p) => p.endsWith("/"))) { _guardsExpanded = guards.slice(); return _guardsExpanded; }
  const res = run(`const fs=require("fs");const out=[];
for(const p of JSON.parse(fs.readFileSync(${JSON.stringify(pathsFile())},"utf8")).slice(${targets.length})){if(!p.endsWith("/")){out.push(p);continue;}
try{const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const c=d+"/"+e.name;e.isDirectory()?walk(c):out.push(c);}};walk(p.replace(/\\/$/,""));}catch(e){out.push(p);}}
console.log(JSON.stringify([...new Set(out)]));`, "expand-guards");
  assert.equal(res.exitCode, 0, "guard expansion failed");
  _guardsExpanded = JSON.parse(res.stdout);
  return _guardsExpanded;
}
const newRemote = new Set(spec.newRemoteFiles || []);
const isNew = (p) => newRemote.has(p);
const candHash = (map, p) => map?.[p] ?? map?.[p.split("/").pop()];
const expectedBundles = spec.buildEntries.length;
const pageEntries = spec.buildEntries.filter((p) => p.startsWith("src/pages/"));
const pageBaseNames = pageEntries.map((p) => p.split("/").pop());
assert.equal(proofSpec.appId, APP);
assert.equal(proofSpec.branch, spec.branch);
assert.equal(proofSpec.sourceHead, HEAD);
assert.ok(proofSpec.baselineFile === undefined || proofSpec.baselineFile === spec.baselineFile, "proof baselineFile mismatch");
assert.equal(new Set([...targets, ...guards]).size, targets.length + guards.length);
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (n, v) => fs.writeFileSync(DIR + prefix + n + ".json", JSON.stringify(v, null, 2) + "\n");
const normalize = (v) => v.replace(/\r\n/g, "\n");
const apiView = (raw) => normalize(raw).replace(/\n$/, ""); // API omits exactly one trailing LF
const rawHash = (v) => createHash("sha256").update(Buffer.from(v, "utf8")).digest("hex");

// entities-all genstub: every entity name in base44/entities/*.jsonc so ANY
// named import from "@/entities/all" (or "@/entities/<name>") in the candidate
// dependency graph resolves — a superset of the channel 12-export list.
// NOTE: too big to embed in a remote seed (Windows command-line limit) — it is
// staged to a remote file in chunks (stubFile()) and read back remotely.
const entityStubSource = "// stub for @/entities/all (Base44 build-time codegen, absent from sandbox FS)\n" +
  fs.readdirSync("base44/entities").filter((f) => f.endsWith(".jsonc")).map((f) => f.replace(/\.jsonc$/, ""))
    .map((n) => "export const " + n + " = {};").join("\n") + "\nexport default {};\n";

// frozen lead proofs — no reruns
const proofCounts = (j) => {
  const c = [];
  if (Array.isArray(j?.results)) c.push(j.results.length);
  if (typeof j?.passed === "number") c.push(j.passed);
  if (Array.isArray(j?.defects)) c.push(j.defects.length);
  if (typeof j?.scenarios === "number") c.push(j.scenarios);
  if (Array.isArray(j?.scenarios)) c.push(j.scenarios.length);
  if (typeof j?.checks === "number") c.push(j.checks);
  if (Array.isArray(j?.checks)) c.push(j.checks.length);
  if (j?.candidateHashes && typeof j.candidateHashes === "object") c.push(Object.keys(j.candidateHashes).length);
  if (j?.loaded && typeof j.loaded === "object") c.push(Object.keys(j.loaded).length);
  if (Array.isArray(j?.inputs)) c.push(j.inputs.length);
  if (typeof j?.inputs === "number") c.push(j.inputs);
  if (Array.isArray(j)) c.push(j.length);
  c.push(Object.keys(j).length);
  return c;
};
const isCleanLintMap = (j) => j && typeof j === "object" && !Array.isArray(j) && Object.keys(j).length > 0
  && Object.values(j).every((r) => r && typeof r === "object" && "errors" in r && "warnings" in r);
for (const p of proofSpec.jsonProofs) {
  // metal spec lists non-JSON documentary evidence (.md decisions, .diff)
  // alongside JSON proofs — those get an existence/non-empty assert only.
  let j;
  try { j = JSON.parse(fs.readFileSync(DIR + p.file, "utf8")); }
  catch { assert.ok(fs.statSync(DIR + p.file).size > 0, p.file + " empty evidence file"); continue; }
  if (typeof p.resultCount === "number") assert.ok(proofCounts(j).includes(p.resultCount), p.file + " expected count " + p.resultCount + " not in " + proofCounts(j).join(","));
  if (typeof j?.failed === "number") assert.equal(j.failed, 0, p.file + " failed>0");
  if (typeof j?.result === "string") assert.equal(j.result, "PASS", p.file + " result");
  if (Array.isArray(j?.results)) {
    const notOk = j.results.filter((r) => r.ok !== true).length;
    const ok = j.results.length - notOk;
    if (p.mustNotBeAllOk) {
      assert.ok(notOk > 0, p.file + " must not be all ok");
      if (p.expectedFailuresAgainstPreHardeningSource !== undefined)
        assert.equal(notOk, p.expectedFailuresAgainstPreHardeningSource, p.file + " failure count");
      if (p.expectedCompatibilityPasses !== undefined)
        assert.equal(ok, p.expectedCompatibilityPasses, p.file + " compatibility passes");
    }
    if (p.mustBeAllOk || (proofSpec.allResultsMustHaveOkTrue && !p.mustNotBeAllOk))
      assert.ok(j.results.every((r) => r.ok === true), p.file);
  }
  if (isCleanLintMap(j))
    assert.ok(Object.values(j).every((r) => (r.errors || 0) === 0 && (r.warnings || 0) === 0), p.file + " lint not clean");
  if (p.warnings !== undefined) assert.equal(j.warnings, p.warnings, p.file);
  if (p.inputs !== undefined) assert.equal(j.inputs, p.inputs, p.file);
  if (p.externalOnly) assert.ok(Array.isArray(j) && j.every((e) => e.external === true), p.file);
}
const logText = (f) => {
  const b = fs.readFileSync(DIR + f);
  return (b[0] === 0xff && b[1] === 0xfe ? b.toString("utf16le") : b.toString("utf8")).replace(/\0/g, "");
};
if (proofSpec.esbuildParseChecks) {
  assert.equal(proofSpec.scopedLintLogs.length, proofSpec.esbuildParseChecks.count);
  assert.equal(proofSpec.esbuildParseChecks.allPassed, true);
}
for (const { file, line } of proofSpec.scopedLintLogs || []) {
  const content = logText(file);
  if (content === "" || content.split(/\r?\n/).includes(line)) continue; // empty log or matching line = pass
  let lintMapClean = false;
  try { const j = JSON.parse(content); lintMapClean = (isCleanLintMap(j) && Object.values(j).every((r) => (r.errors || 0) === 0 && (r.warnings || 0) === 0)) || (typeof j?.errors === "number" && typeof j?.warnings === "number" && j.errors === 0 && j.warnings === 0); } catch {}
  assert.ok(lintMapClean, file + " lint evidence missing " + JSON.stringify(line));
}

const candManifest = spec.candidateManifest ? JSON.parse(fs.readFileSync(DIR + spec.candidateManifest, "utf8")) : null;
const candidates = {};
for (const p of targets) {
  const name = p.split("/").pop();
  const cf = DIR + (proofSpec.candidateFiles?.[name] ?? proofSpec.candidateFiles?.[p] ?? candManifest?.[p]?.candidateFile ?? candManifest?.[name]?.candidateFile ?? spec.candidatePrefix + name);
  candidates[p] = fs.readFileSync(cf, "utf8");
  assert.equal(rawHash(candidates[p]), candHash(spec.candidateHashes, p), "candidate hash " + name);
  assert.equal(rawHash(candidates[p]), candHash(proofSpec.candidateHashes, p), "proof candidate hash " + name);
  const eolExpect = spec.candidateLineEndingsByFile?.[p] ?? spec.candidateLineEndings;
  assert.ok(eolExpect !== "LF" || !candidates[p].includes("\r"), "candidate LF contract " + name);
  assert.ok(eolExpect !== "CRLF" || candidates[p].includes("\r"), "candidate CRLF contract " + name);
  const termExpect = spec.candidateTerminalLF?.[p] ?? spec.candidateTerminalLF?.[name];
  assert.equal(candidates[p].endsWith("\n"), termExpect, "candidate EOF contract " + name);
}
const baseline = JSON.parse(fs.readFileSync(DIR + spec.baselineFile, "utf8"));
const baselineFiles = Object.fromEntries(baseline.files.map((f) => [f.path, f]));
// retry wrapper for READ-ONLY calls only (status/raw) — transient API drops
// ("terminated", "fetch failed", short auth-broker gaps) must not abort apply.
// NEVER wrap sandbox edit/write/checkpoint — a lost-response retry could re-apply.
async function roRetry(fn) {
  let last;
  for (let a = 0; a < 8; a++) {
    try { return fn(); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 4000 * (a + 1))); }
  }
  throw last;
}
function command(args, input) {
  const opts = input === undefined ? {} : { input };
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, ...opts,
  });
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    save("invalid-cli-response", { kind: args.slice(0, 3), exit: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
    throw Error("Invalid CLI response; inspect actual state before retrying.");
  }
  if (result.status !== 0) {
    save("cli-error", { kind: args.slice(0, 3), exit: result.status, data });
    throw Error(typeof data.error === "string" ? data.error : data.error?.message || "Base44 CLI failed");
  }
  return data;
}
const sandbox = (args, input) => command(["sandbox", ...args, "--app-id", APP, "--branch", spec.branch], input);
function run(code, label) {
  const seed = `p=$(mktemp ${spec.remoteTempPrefix}${label}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  return sandbox(["run", seed, "--timeout-ms", "120000"]);
}
function status(requireReady = true) {
  const s = command(["api", "fetch", "GET", "/api/apps/" + APP]);
  assert.equal(s.id, APP);
  if (requireReady) {
    assert.equal(s.status?.state, "ready"); assert.ok(!s.git_repo_pending);
  }
  assert.equal(s.dev_environment_enabled, false);
  return { id: s.id, status: s.status, pending: s.git_repo_pending, testDataEnabled: s.dev_environment_enabled };
}
// spec paths exceed the Windows spawn arg limit when embedded in the remote
// seed — stage the raw path list once, remote reads it back.
let _pathsFile = null;
function pathsFile() {
  if (_pathsFile) return _pathsFile;
  const b64 = Buffer.from(JSON.stringify([...targets, ...guards])).toString("base64");
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync(${JSON.stringify(spec.remoteTempPrefix)} + "paths-");console.log(d);`, "mkpaths");
  assert.equal(mk.exitCode, 0, "paths staging mkdtemp failed");
  const dir = mk.stdout.trim();
  const CH = spec.stageBase64ChunkLength || 3000;
  for (let i = 0; i < b64.length; i += CH) {
    const w = sandbox(["run", "printf %s " + b64.slice(i, i + CH) + " " + (i === 0 ? ">" : ">>") + " " + dir + "/list.b64", "--timeout-ms", "30000"]);
    assert.equal(w.exitCode, 0, "paths staging chunk failed");
  }
  const d = sandbox(["run", "base64 -d " + dir + "/list.b64 > " + dir + "/list.json && rm " + dir + "/list.b64", "--timeout-ms", "30000"]);
  assert.equal(d.exitCode, 0, "paths staging decode failed");
  _pathsFile = dir + "/list.json";
  return _pathsFile;
}
// stage the entity stub remotely in chunks (same pattern as pathsFile)
let _stubFile = null;
function stubFile() {
  if (_stubFile) return _stubFile;
  const b64 = Buffer.from(entityStubSource).toString("base64");
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync(${JSON.stringify(spec.remoteTempPrefix)} + "stub-");console.log(d);`, "mkstub");
  assert.equal(mk.exitCode, 0, "stub staging mkdtemp failed");
  const dir = mk.stdout.trim();
  const CH = spec.stageBase64ChunkLength || 3000;
  for (let i = 0; i < b64.length; i += CH) {
    const w = sandbox(["run", "printf %s " + b64.slice(i, i + CH) + " " + (i === 0 ? ">" : ">>") + " " + dir + "/stub.b64", "--timeout-ms", "30000"]);
    assert.equal(w.exitCode, 0, "stub staging chunk failed");
  }
  const d = sandbox(["run", "base64 -d " + dir + "/stub.b64 > " + dir + "/stub.js && rm " + dir + "/stub.b64", "--timeout-ms", "30000"]);
  assert.equal(d.exitCode, 0, "stub staging decode failed");
  _stubFile = dir + "/stub.js";
  return _stubFile;
}
function raw() {
  const result = run(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),zlib=require("zlib");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${HEAD} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean)};
const _all=JSON.parse(fs.readFileSync(${JSON.stringify(pathsFile())},"utf8"));
const _paths=_all.slice(0,${targets.length});
const _walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const c=d+"/"+e.name;if(e.isDirectory())_walk(c);else _paths.push(c);}};
for(const p of _all.slice(${targets.length})){if(!p.endsWith("/")){_paths.push(p);continue;}
try{_walk(p.replace(/\\/$/,""));}catch(e){_paths.push(p);}}
snapshot.files=[...new Set(_paths)].map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
const base={path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(buf).digest("hex")};
if(_all.slice(0,${targets.length}).includes(path)){base.text=text;base.base64=buf.toString("base64");}
return base;});
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(zlib.gzipSync(Buffer.from(JSON.stringify(snapshot),"utf8")).toString("base64"));`, "read");
  assert.equal(result.exitCode, 0); return JSON.parse(zlib.gunzipSync(Buffer.from(result.stdout.trim(), "base64")).toString("utf8"));
}
async function preflight() {
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some((b) => b.name === spec.branch && b.status === "active"));
  const app = await roRetry(() => status()), before = await roRetry(() => raw());
  assert.equal(before.headAfter, before.head, "HEAD changed during preflight capture");
  assert.equal(before.dirtyAfter, before.dirty, "worktree changed during preflight capture");
  assert.equal(before.head, HEAD); assert.equal(before.dirty, "");
  assert.deepEqual(before.changed, []);
  for (const f of before.files) {
    const b = baselineFiles[f.path];
    assert.ok(b, "no baseline for " + f.path);
    assert.equal(f.hash, b.hash, "baseline raw hash drift " + f.path);
    if (b.normalized !== undefined) assert.equal(f.normalized, b.normalized, "baseline raw text drift " + f.path);
  }
  for (const p of targets) {
    const file = before.files.find((f) => f.path === p);
    if (!file.exists) {
      assert.ok(isNew(p), "unexpected absent target " + p);
      continue; // new remote file — nothing to read back pre-apply
    }
    assert.equal(Buffer.from(file.text, "utf8").toString("base64"), file.base64, "utf8 roundtrip " + p);
    const read = await roRetry(() => sandbox(["read", p]));
    assert.equal(normalize(read.files[0].content), apiView(file.text), "api read " + p);
  }
  return { before, app };
}
function payload(file) {
  return JSON.stringify([{ old_text: file.text, new_text: candidates[file.path] }]);
}
function guardAll(snapshot, before) {
  assert.equal(snapshot.headAfter, snapshot.head, "HEAD changed during capture");
  assert.equal(snapshot.dirtyAfter, snapshot.dirty, "worktree changed during capture");
  assert.equal(snapshot.head, before.before?.head ?? before.head, "HEAD changed during read-only checks");
  assert.equal(snapshot.dirty, "", "read-only checks left a dirty tree");
  assert.deepEqual(snapshot.changed, before.before?.changed ?? before.changed, "read-only changed-file drift");
  const prior = before.before ? before.before.files : before.files;
  for (const f of snapshot.files) {
    const b = prior.find((x) => x.path === f.path);
    if (b && b.exists === false && isNew(f.path)) continue; // expected new-remote target
    assert.equal(f.hash, b.hash, "raw hash drift " + f.path);
    if (targets.includes(f.path)) assert.equal(f.base64, b.base64, "raw base64 drift " + f.path);
  }
}
function sourceRecords(snapshot) {
  assert.equal(snapshot.headAfter, snapshot.head, "HEAD changed during capture");
  assert.equal(snapshot.dirtyAfter, snapshot.dirty, "worktree changed during capture");
  assert.deepEqual(snapshot.files.map(f => f.path).sort(), [...targets, ...guardsSync()].sort());
  const files = new Map(snapshot.files.map(f => [f.path, f]));
  for (const p of guardsSync()) {
    assert.equal(files.get(p)?.exists, true, "missing protected file " + p);
    assert.equal(files.get(p).hash, baselineFiles[p].hash, "protected source changed " + p);
  }
  const completed = [];
  for (const p of targets) {
    const f = files.get(p);
    if (!f || f.exists === false) {
      assert.ok(isNew(p) && baselineFiles[p] && baselineFiles[p].exists === false, "unexpected missing target " + p);
      continue; // new remote file absent pre-apply — not completed, not drift
    }
    assert.equal(f?.exists, true, "missing target " + p);
    assert.equal(Buffer.from(f.text, "utf8").toString("base64"), f.base64, "UTF8 roundtrip " + p);
    assert.equal(rawHash(f.text), f.hash, "target raw capture " + p);
    if (f.hash === rawHash(candidates[p])) completed.push(p);
    else assert.equal(f.hash, baselineFiles[p].hash, "unrecognized target change " + p);
  }
  return completed;
}
export function assertOwnedSource(snapshot, allNew = false) {
  const completed = sourceRecords(snapshot);
  assert.equal(snapshot.dirty, "", "source must be committed and clean");
  assert.deepEqual([...snapshot.changed].sort(), [...completed].sort(), "unexpected changed-file scope");
  if (!completed.length) assert.equal(snapshot.head, HEAD, "unexpected baseline HEAD");
  if (allNew) assert.deepEqual([...completed].sort(), [...targets].sort(), "incomplete application");
  return completed;
}
async function settleOwnWrite(writtenPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await roRetry(() => raw());
    sourceRecords(snapshot);
    if (snapshot.dirty) {
      const paths = snapshot.dirty.split("\n").filter(Boolean).map(line => line.slice(3));
      assert.ok(paths.length && paths.every(p => p === writtenPath), "non-owned dirty files");
      assert.ok(snapshot.changed.every(p => targets.includes(p)), "non-owned committed change");
    } else {
      assertOwnedSource(snapshot);
      const app = await roRetry(() => status(false));
      if (app.status?.state === "ready" && !app.pending) return snapshot;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error("Own write has not reached a clean, ready state; inspect before continuing.");
}
async function actualDependencyBuild() {
  const build = await roRetry(() => run(`const esbuild=require("/app/node_modules/esbuild");
const entityStub=require("fs").readFileSync(${JSON.stringify(stubFile())},"utf8");
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(spec.buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(spec.buildAlias)},
outdir:${JSON.stringify(spec.remoteTempPrefix + "actual-bundle")},write:false,metafile:true,logLevel:"silent",
plugins:[{name:"genstub",setup(b){
b.onResolve({filter:/^@\\/entities\\//},a=>({path:a.path,namespace:"genstub"}));
b.onLoad({filter:/./,namespace:"genstub"},a=>({contents:entityStub,loader:"js"}));}}]});
const pageOutputs=Object.entries(built.metafile.outputs).filter(([o,i])=>i.entryPoint&&${JSON.stringify(pageBaseNames)}.some(n=>i.entryPoint.endsWith(n))).map(([o])=>o);
const pageInputs=pageOutputs.length===1?Object.keys(built.metafile.outputs[pageOutputs[0]].inputs):[];
const externalAt=[];
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(spec.forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "actual-build"));
  save("actual-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, expectedBundles);
  const actualTargetWarnings = meta.warnings.filter((w) => targets.some((p) => (w.file || "").endsWith(p)));
  assert.deepEqual(actualTargetWarnings, []); assert.deepEqual(meta.externalAt, []);
  assert.equal(meta.pageOutputs.length, pageEntries.length);
  for (const p of targets) {
    assert.equal(meta.inputs.filter((i) => i.endsWith(p)).length, 1, "input once " + p);
    if (pageEntries.length === 1) assert.equal(meta.pageInputs.filter((i) => i.endsWith(p)).length, 1, "page input once " + p);
  }
  save("actual-build-meta", meta);
  return meta;
}
async function stagedBuild() {
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync(${JSON.stringify(spec.remoteTempPrefix)});console.log(d);`, "mkdtemp");
  assert.equal(mk.exitCode, 0);
  const tmpDir = mk.stdout.trim(); save("staging-dir", tmpDir);
  // transient "fetch failed" tolerance: after a failed staging call, verify the
  // remote file size — the chunk may have landed anyway. ">>" appends retry only
  // when the size proves it did NOT land; otherwise abort (fresh tmpDir next run).
  const remoteLen = (file) => {
    for (let a = 0; a < 4; a++) {
      try {
        const r = sandbox(["run", "wc -c < " + file + " 2>/dev/null || true", "--timeout-ms", "30000"]);
        if (r.exitCode === 0) return parseInt(String(r.stdout).trim(), 10) || 0;
      } catch {}
    }
    return -1;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stagedRun = async (cmd, file, expectLen, canRetry) => {
    for (let a = 0; a < 5; a++) {
      try {
        const w = sandbox(["run", cmd, "--timeout-ms", "30000"]);
        if (w.exitCode === 0) return;
        throw Error("stage exit " + w.exitCode + " " + String(w.stderr || "").slice(0, 160));
      } catch (e) {
        if (!file) { if (a === 4) throw e; await sleep(1200 * (a + 1)); continue; }
        const cur = remoteLen(file);
        if (cur === expectLen) return;                 // landed despite the error
        if (a === 4 || !canRetry(cur)) throw e;        // unknown/corrupt → abort
        await sleep(1200 * (a + 1));
      }
    }
  };
  for (const p of targets) {
    const name = p.split("/").pop();
    const b64 = Buffer.from(candidates[p]).toString("base64");
    const b64file = tmpDir + "/" + name + ".b64";
    for (let i = 0; i < b64.length; i += spec.stageBase64ChunkLength) {
      const expectLen = Math.min(i + spec.stageBase64ChunkLength, b64.length);
      const append = i !== 0;
      await stagedRun(
        "printf %s " + b64.slice(i, i + spec.stageBase64ChunkLength) + " " + (append ? ">>" : ">") + " " + b64file,
        b64file, expectLen,
        (cur) => cur === i || !append);               // ">" restarts cleanly; ">>" only if chunk absent
    }
    const outFile = tmpDir + "/" + name;
    const bytes = Buffer.from(candidates[p], "utf8").length;
    await stagedRun(
      "if [ -f " + b64file + " ]; then base64 -d " + b64file + " > " + outFile + " && rm " + b64file + "; fi",
      outFile, bytes,
      (cur) => cur === 0);                             // retry only if output absent
  }
  // copy the pre-staged stub for @/entities/all into the staging dir —
  // a Base44 build-time codegen module absent from the sandbox FS but
  // imported by guard-file deps in the bundle graph
  const stubBytes = Buffer.from(entityStubSource, "utf8").length;
  await stagedRun("cp " + stubFile() + " " + tmpDir + "/entities-all-stub.js",
    tmpDir + "/entities-all-stub.js", stubBytes, (cur) => cur === 0);
  const build = run(`const fs=require("fs"),pp=require("path").posix;
const esbuild=require("/app/node_modules/esbuild");
const stageDir=${JSON.stringify(tmpDir)}+"/";
const overrides=${JSON.stringify(Object.fromEntries([...targets.map((p)=>["/app/"+p,p.split("/").pop()]),["/app/src/entities/all.js","entities-all-stub.js"]]))};
const overridesLoaded={};
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(spec.buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(spec.buildAlias)},
outdir:stageDir+"bundle",write:false,metafile:true,logLevel:"silent",
plugins:[{name:"cand",setup(b){
const aliasMap=${JSON.stringify(spec.buildAlias)};
const resolveCand=(p)=>{
for(const [k,v] of Object.entries(aliasMap))if(p===k||p.startsWith(k+"/"))p=v+p.slice(k.length);
for(const e of["",".js",".jsx",".ts",".tsx",".mjs",".json",".jsonc"]){const c=p+e;if(overrides[c])return c;}
return undefined;};
b.onResolve({filter:/^\\.{1,2}\\//},a=>{const c=resolveCand(pp.normalize(pp.join(a.resolveDir||"/app",a.path)));return c?{path:c}:undefined;});
b.onResolve({filter:/^(\\/app\\/|@\\/)/},a=>{const c=resolveCand(a.path);return c?{path:c}:undefined;});
b.onLoad({filter:/^\\/app\\//},a=>{const name=overrides[a.path];
if(!name)return undefined;
const contents=fs.readFileSync(stageDir+name,"utf8");
overridesLoaded[a.path]={name,sha256:require("crypto").createHash("sha256").update(contents,"utf8").digest("hex")};
return {contents,resolveDir:pp.dirname(a.path),loader:a.path.endsWith(".jsx")?"jsx":"js"};});}}]});
const pageOutputs=Object.entries(built.metafile.outputs).filter(([o,i])=>i.entryPoint&&${JSON.stringify(pageBaseNames)}.some(n=>i.entryPoint.endsWith(n))).map(([o])=>o);
const pageInputs=pageOutputs.length===1?Object.keys(built.metafile.outputs[pageOutputs[0]].inputs):[];
const externalAt=[];
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(spec.forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
overridesLoaded,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "staged-build");
  save("staged-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, expectedBundles);
  const targetWarnings = meta.warnings.filter((w) => targets.some((p) => (w.file || "").endsWith(p)));
  assert.deepEqual(targetWarnings, []);
  assert.deepEqual(meta.externalAt, []);
  const loadedTargetKeys = Object.keys(meta.overridesLoaded).filter((k) => k !== "/app/src/entities/all.js");
  assert.deepEqual(loadedTargetKeys.sort(), targets.map((p) => "/app/" + p).sort());
  for (const p of targets) {
    assert.equal(meta.overridesLoaded["/app/" + p].sha256, rawHash(candidates[p]), "staged sha " + p);
    assert.equal(meta.inputs.filter((i) => i.endsWith(p)).length, 1, "input once " + p);
    if (pageEntries.length === 1) assert.equal(meta.pageInputs.filter((i) => i.endsWith(p)).length, 1, "page input once " + p);
  }
  assert.equal(meta.pageOutputs.length, pageEntries.length, "page output count");
  save("staged-build-meta", meta);
  return meta;
}
const mode = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href ? process.argv[2] : null;
if (mode !== null) assert.ok(["preflight", "dry-run", "apply", "verify"].includes(mode), "unsupported or lead-only mode");
if (mode === "preflight") {
  const before = await preflight(); save("preflight", before);
  console.log("Preflight: HEAD " + HEAD.slice(0, 8) + " clean, " + targets.length + " targets + " + guards.length + " guards raw-hash locked, ready.");
}
if (mode === "dry-run") {
  const before = await preflight(); save("preflight", before);
  const diffs = [];
  for (const p of targets) {
    const file = before.before.files.find((f) => f.path === p);
    let r;
    if (!file.exists && isNew(p)) {
      try {
        r = sandbox(["edit", p, "--dry-run"], JSON.stringify([{ old_text: "", new_text: candidates[p] }]));
        if (r.applied !== false) r = { applied: false, note: "new remote file — sandbox write preview", result: r };
      } catch (e) {
        r = { applied: false, note: "new remote file — sandbox write preview only", error: String(e.message || e).slice(0, 300) };
      }
      assert.equal(r.applied, false, p);
    } else {
      r = sandbox(["edit", p, "--dry-run"], payload(file));
      assert.equal(r.applied, false, p);
    }
    diffs.push({ path: p, result: r });
    const after = raw();
    assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
    guardAll(after, before); status();
  }
  save("dry-run-diffs", diffs);
  const meta = await stagedBuild();
  const final = raw();
  assert.equal(final.head, HEAD); assert.equal(final.dirty, "");
  guardAll(final, before);
  save("final-scope", final); save("final-status", status());
  console.log("Dry-run: " + diffs.length + " whole-file edit previews applied=false; staged build " + meta.outputs + " bundles 0 warnings; no mutation.");
}
if (mode === "apply") {
  const approval = JSON.parse(fs.readFileSync(DIR + prefix + "apply-approval.json", "utf8"));
  assert.equal(approval.authorized, true); assert.equal(approval.appId, APP);
  assert.equal(approval.branch, spec.branch); assert.equal(approval.sourceHead, HEAD);
  assert.ok(typeof approval.restoreCheckpointId === "string" && approval.restoreCheckpointId.length > 0);
  for (const p of targets) {
    const name = p.split("/").pop();
    assert.equal(approval.candidateHashes[name], candHash(proofSpec.candidateHashes, p), "approval hash " + name);
  }
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some(b => b.name === spec.branch && b.status === "active"));
  const before = { before: await roRetry(() => raw()), app: await roRetry(() => status()) };
  assertOwnedSource(before.before);
  save("apply-preflight", before);
  for (const p of targets) {
    await roRetry(() => status());
    const current = await roRetry(() => raw());
    const completed = assertOwnedSource(current);
    if (completed.includes(p)) continue;
    const file = current.files.find(f => f.path === p);
    let r;
    try {
      if (isNew(p) && (!file || file.exists === false)) {
        r = sandbox(["write", p], candidates[p]); // new remote file — write, no --overwrite (fails if it unexpectedly exists)
      } else {
        r = sandbox(["edit", p], payload(file));
        assert.equal(r.applied, true, p + " edit not applied");
      }
    } catch (error) {
      try { save("uncertain-write", { path: p, source: raw(), app: status(false) }); }
      catch (readError) { save("uncertain-write-read-error", { path: p, error: readError.message }); }
      throw error;
    }
    const after = await settleOwnWrite(p);
    const afterFile = after.files.find((f) => f.path === p);
    assert.equal(afterFile.text, candidates[p], "post-edit " + p);
    assert.equal(afterFile.hash, rawHash(candidates[p]), "post-edit sha " + p);
    save("apply-" + p.split("/").pop(), { result: r, file: afterFile });
  }
  const after = await roRetry(() => raw()); assertOwnedSource(after, true);
  save("apply-final-scope", after); save("apply-final-status", await roRetry(() => status()));
  console.log("Applied " + targets.length + " whole-file edits; verify remains required.");
}
if (mode === "verify") {
  const after = await roRetry(() => raw()); assertOwnedSource(after, true); await roRetry(() => status());
  for (const p of targets) {
    const file = after.files.find((f) => f.path === p);
    assert.equal(file.text, candidates[p], "raw " + p);
    assert.equal(file.hash, rawHash(candidates[p]), "sha " + p);
    const read = await roRetry(() => sandbox(["read", p]));
    assert.equal(normalize(read.files[0].content), apiView(candidates[p]), "api " + p);
  }
  save("exact-raw-readback", after);
  const meta = await actualDependencyBuild();
  const final = await roRetry(() => raw()); assertOwnedSource(final, true);
  assert.equal(final.head, after.head, "source changed during actual build");
  save("final-scope", final); save("final-status", await roRetry(() => status()));
  save("verification", { ok: true, targets, sourceHead: HEAD, verifiedHead: after.head, clean: true,
    protectedSourcesUnchanged: guardsSync(), actualDependencyBuild: meta.outputs,
    schemaChanged: false, reinforcementV2Activated: false,
    realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, " + targets.length + " targets, " + guards.length + " protected files, actual build, clean scope and ready status verified.");
}
