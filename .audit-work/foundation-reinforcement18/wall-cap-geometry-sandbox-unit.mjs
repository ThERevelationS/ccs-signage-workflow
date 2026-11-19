import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const DIR = ".audit-work/foundation-reinforcement18/";
const spec = JSON.parse(fs.readFileSync(DIR + "wall-cap-geometry-transport-spec.json", "utf8"));
const proofSpec = JSON.parse(fs.readFileSync(DIR + "wall-cap-geometry-proof-spec.json", "utf8"));
const APP = spec.appId, HEAD = spec.sourceHead, prefix = "wall-cap-geometry-sandbox-";
const targets = spec.targetOrder;
const guards = spec.protectedFiles;
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (n, v) => fs.writeFileSync(DIR + prefix + n + ".json", JSON.stringify(v, null, 2) + "\n");
const normalize = (v) => v.replace(/\r\n/g, "\n");
const apiView = (raw) => normalize(raw).replace(/\n$/, ""); // API omits exactly one trailing LF
const rawHash = (v) => createHash("sha256").update(Buffer.from(v, "utf8")).digest("hex");

// frozen lead proofs — no reruns
for (const p of proofSpec.jsonProofs) {
  const j = JSON.parse(fs.readFileSync(DIR + p.file, "utf8"));
  assert.equal(j.results.length, p.resultCount, p.file);
  assert.ok(j.results.every((r) => r.ok === true), p.file);
}
{
  const pg = JSON.parse(fs.readFileSync(DIR + proofSpec.pageProof.file, "utf8"));
  for (const [k, v] of Object.entries(proofSpec.pageProof.expected)) assert.deepEqual(pg[k], v, "pageProof." + k);
}
const logText = (f) => {
  const b = fs.readFileSync(DIR + f);
  return (b[0] === 0xff && b[1] === 0xfe ? b.toString("utf16le") : b.toString("utf8")).replace(/\0/g, "");
};
for (const { file, line } of [proofSpec.catalogLog, proofSpec.assemblyLog])
  assert.ok(logText(file).split(/\r?\n/).includes(line), file);
assert.ok(logText(proofSpec.scopedLintLog).split(/\r?\n/).includes(proofSpec.scopedLintLine));

const candidates = {};
for (const p of targets) {
  const name = p.split("/").pop();
  candidates[p] = fs.readFileSync(DIR + spec.candidatePrefix + name, "utf8");
  assert.equal(rawHash(candidates[p]), proofSpec.candidateHashes[name], "candidate hash " + name);
}
const baseline = JSON.parse(fs.readFileSync(DIR + spec.baselineFile, "utf8"));
const baselineFiles = Object.fromEntries(baseline.files.map((f) => [f.path, f]));
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
const sandbox = (args, input) => command(["sandbox", ...args, "--app-id", APP, "--branch", "main"], input);
function run(code, label) {
  const seed = `p=$(mktemp /tmp/ccs-wallcap-geometry-${label}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
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
function raw() {
  const result = run(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${HEAD} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:${JSON.stringify([...targets, ...guards])}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
const base={path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(buf).digest("hex")};
if(${JSON.stringify(targets)}.includes(path)){base.text=text;base.base64=buf.toString("base64");}
return base;})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`, "read");
  assert.equal(result.exitCode, 0); return JSON.parse(result.stdout);
}
function preflight() {
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some((b) => b.name === "main" && b.status === "active"));
  const app = status(), before = raw();
  assert.equal(before.headAfter, before.head, "HEAD changed during preflight capture");
  assert.equal(before.dirtyAfter, before.dirty, "worktree changed during preflight capture");
  assert.equal(before.head, HEAD); assert.equal(before.dirty, "");
  assert.deepEqual(before.changed, []);
  for (const f of before.files) {
    const b = baselineFiles[f.path];
    assert.ok(b, "no baseline for " + f.path);
    assert.equal(f.hash, b.hash, "baseline raw hash drift " + f.path);
    assert.equal(f.normalized, b.normalized, "baseline raw text drift " + f.path);
  }
  for (const p of targets) {
    const file = before.files.find((f) => f.path === p);
    assert.equal(Buffer.from(file.text, "utf8").toString("base64"), file.base64, "utf8 roundtrip " + p);
    const read = sandbox(["read", p]);
    assert.equal(normalize(read.files[0].content), apiView(file.text), "api read " + p);
    assert.ok(!file.normalized.endsWith("\n"), "target EOF " + p);
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
    assert.equal(f.hash, b.hash, "raw hash drift " + f.path);
    if (targets.includes(f.path)) assert.equal(f.base64, b.base64, "raw base64 drift " + f.path);
  }
}
function sourceRecords(snapshot) {
  assert.equal(snapshot.headAfter, snapshot.head, "HEAD changed during capture");
  assert.equal(snapshot.dirtyAfter, snapshot.dirty, "worktree changed during capture");
  assert.deepEqual(snapshot.files.map(f => f.path).sort(), [...targets, ...guards].sort());
  const files = new Map(snapshot.files.map(f => [f.path, f]));
  for (const p of guards) {
    assert.equal(files.get(p)?.exists, true, "missing protected file " + p);
    assert.equal(files.get(p).hash, baselineFiles[p].hash, "protected source changed " + p);
  }
  const completed = [];
  for (const p of targets) {
    const f = files.get(p);
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
    const snapshot = raw();
    sourceRecords(snapshot);
    if (snapshot.dirty) {
      const paths = snapshot.dirty.split("\n").filter(Boolean).map(line => line.slice(3));
      assert.ok(paths.length && paths.every(p => p === writtenPath), "non-owned dirty files");
      assert.ok(snapshot.changed.every(p => targets.includes(p)), "non-owned committed change");
    } else {
      assertOwnedSource(snapshot);
      const app = status(false);
      if (app.status?.state === "ready" && !app.pending) return snapshot;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error("Own write has not reached a clean, ready state; inspect before continuing.");
}
async function actualDependencyBuild() {
  const build = run(`const esbuild=require("/app/node_modules/esbuild");
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(spec.buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(spec.buildAlias)},
outdir:"/tmp/ccs-wallcap-geometry-actual-bundle",write:false,metafile:true,logLevel:"silent"});
const pageOutputs=Object.entries(built.metafile.outputs).filter(([o,i])=>i.entryPoint&&i.entryPoint.endsWith("FoundationEstimator.jsx")).map(([o])=>o);
const pageInputs=pageOutputs.length===1?Object.keys(built.metafile.outputs[pageOutputs[0]].inputs):[];
const externalAt=[];
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(spec.forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "actual-build");
  save("actual-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, 3);
  assert.deepEqual(meta.warnings, []); assert.deepEqual(meta.externalAt, []);
  assert.equal(meta.pageOutputs.length, 1);
  for (const p of targets) {
    assert.equal(meta.inputs.filter((i) => i.endsWith(p)).length, 1, "input once " + p);
    assert.equal(meta.pageInputs.filter((i) => i.endsWith(p)).length, 1, "page input once " + p);
  }
  save("actual-build-meta", meta);
  return meta;
}
async function stagedBuild() {
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync("/tmp/ccs-wallcap-geometry-");console.log(d);`, "mkdtemp");
  assert.equal(mk.exitCode, 0);
  const tmpDir = mk.stdout.trim(); save("staging-dir", tmpDir);
  for (const p of targets) {
    const name = p.split("/").pop();
    const b64 = Buffer.from(candidates[p]).toString("base64");
    for (let i = 0; i < b64.length; i += 3000) {
      sandbox(["run", "printf %s " + b64.slice(i, i + 3000) + " " + (i === 0 ? ">" : ">>") + " " + tmpDir + "/" + name + ".b64", "--timeout-ms", "30000"]);
    }
    sandbox(["run", "base64 -d " + tmpDir + "/" + name + ".b64 > " + tmpDir + "/" + name + " && rm " + tmpDir + "/" + name + ".b64", "--timeout-ms", "30000"]);
  }
  const build = run(`const fs=require("fs"),pp=require("path").posix;
const esbuild=require("/app/node_modules/esbuild");
const stageDir=${JSON.stringify(tmpDir)}+"/";
const overrides=${JSON.stringify(Object.fromEntries(targets.map((p)=>["/app/"+p,p.split("/").pop()])))};
const overridesLoaded={};
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(spec.buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(spec.buildAlias)},
outdir:stageDir+"bundle",write:false,metafile:true,logLevel:"silent",
plugins:[{name:"cand",setup(b){
b.onLoad({filter:/^\\/app\\//},a=>{const name=overrides[a.path];
if(!name)return undefined;
const contents=fs.readFileSync(stageDir+name,"utf8");
overridesLoaded[a.path]={name,sha256:require("crypto").createHash("sha256").update(contents,"utf8").digest("hex")};
return {contents,resolveDir:pp.dirname(a.path),loader:a.path.endsWith(".jsx")?"jsx":"js"};});}}]});
const pageOutputs=Object.entries(built.metafile.outputs).filter(([o,i])=>i.entryPoint&&i.entryPoint.endsWith("FoundationEstimator.jsx")).map(([o])=>o);
const pageInputs=pageOutputs.length===1?Object.keys(built.metafile.outputs[pageOutputs[0]].inputs):[];
const externalAt=[];
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(spec.forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
overridesLoaded,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "staged-build");
  save("staged-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, proofSpec.actualRemoteBundleCount);
  assert.deepEqual(meta.warnings, []);
  assert.deepEqual(meta.externalAt, []);
  assert.deepEqual(Object.keys(meta.overridesLoaded).sort(), targets.map((p) => "/app/" + p).sort());
  for (const p of targets) {
    assert.equal(meta.overridesLoaded["/app/" + p].sha256, rawHash(candidates[p]), "staged sha " + p);
    assert.equal(meta.inputs.filter((i) => i.endsWith(p)).length, 1, "input once " + p);
    assert.equal(meta.pageInputs.filter((i) => i.endsWith(p)).length, 1, "page input once " + p);
  }
  assert.equal(meta.pageOutputs.length, 1, "page output count");
  save("staged-build-meta", meta);
  return meta;
}
const mode = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href ? process.argv[2] : null;
if (mode !== null) assert.ok(["preflight", "dry-run", "apply", "verify"].includes(mode), "unsupported or lead-only mode");
if (mode === "preflight") {
  const before = preflight(); save("preflight", before);
  console.log("Preflight: HEAD " + HEAD.slice(0, 8) + " clean, " + targets.length + " targets + " + guards.length + " guards raw-hash locked, ready.");
}
if (mode === "dry-run") {
  const before = preflight(); save("preflight", before);
  const diffs = [];
  for (const p of targets) {
    const file = before.before.files.find((f) => f.path === p);
    const r = sandbox(["edit", p, "--dry-run"], payload(file));
    assert.equal(r.applied, false, p);
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
    assert.equal(approval.candidateHashes[name], proofSpec.candidateHashes[name], "approval hash " + name);
  }
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some(b => b.name === "main" && b.status === "active"));
  const before = { before: raw(), app: status() };
  assertOwnedSource(before.before);
  save("apply-preflight", before);
  for (const p of targets) {
    status();
    const current = raw();
    const completed = assertOwnedSource(current);
    if (completed.includes(p)) continue;
    const file = current.files.find(f => f.path === p);
    let r;
    try {
      r = sandbox(["edit", p], payload(file));
      assert.equal(r.applied, true, p + " edit not applied");
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
  const after = raw(); assertOwnedSource(after, true);
  save("apply-final-scope", after); save("apply-final-status", status());
  console.log("Applied 3 whole-file edits; verify remains required.");
}
if (mode === "verify") {
  const after = raw(); assertOwnedSource(after, true); status();
  for (const p of targets) {
    const file = after.files.find((f) => f.path === p);
    assert.equal(file.text, candidates[p], "raw " + p);
    assert.equal(file.hash, rawHash(candidates[p]), "sha " + p);
    const read = sandbox(["read", p]);
    assert.equal(normalize(read.files[0].content), apiView(candidates[p]), "api " + p);
  }
  save("exact-raw-readback", after);
  const meta = await actualDependencyBuild();
  const final = raw(); assertOwnedSource(final, true);
  assert.equal(final.head, after.head, "source changed during actual build");
  save("final-scope", final); save("final-status", status());
  save("verification", { ok: true, targets, sourceHead: HEAD, verifiedHead: after.head, clean: true,
    protectedSourcesUnchanged: guards, actualDependencyBuild: meta.outputs,
    schemaChanged: false, reinforcementV2Activated: false,
    realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, 3 targets, 16 protected files, actual build, clean scope and ready status verified.");
}
