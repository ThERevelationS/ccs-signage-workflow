import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const DIR = ".audit-work/foundation-o004-drafts/";
const spec = JSON.parse(fs.readFileSync(DIR + "transport-spec.json", "utf8"));
const proofSpec = JSON.parse(fs.readFileSync(DIR + spec.proofSpec, "utf8"));
const APP = spec.appId, HEAD = spec.sourceHead, prefix = "o004-drafts-sandbox-";
const targets = spec.targetOrder;
// spec lists src/components/markup/projectCategorizer.js — that path exists
// neither remotely nor locally; the real file is .jsx (page imports it
// extensionless). Substitute the real path and keep the phantom asserted-absent.
const phantomPaths = ["src/components/markup/projectCategorizer.js"];
const guards = spec.protectedFiles.map((p) =>
  p === "src/components/markup/projectCategorizer.js" ? "src/components/markup/projectCategorizer.jsx" : p);
// derived build config (spec carries no build block — same shape as prior transports)
const buildEntries = targets.slice(); // both targets bundled: page + store module
const expectedBundles = buildEntries.length;
const pageEntries = buildEntries.filter((p) => p.endsWith("FoundationEstimator.jsx"));
const buildAlias = { "@": "/app/src" };
const forbiddenExternalImportPrefix = "@/";
const remoteTempPrefix = "/tmp/ccs-o004-drafts-";
const stageBase64ChunkLength = 3000;
assert.equal(proofSpec.appId, APP);
assert.equal(proofSpec.branch, spec.branch);
assert.equal(proofSpec.sourceHead, HEAD);
assert.equal(new Set([...targets, ...guards]).size, targets.length + guards.length);
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (n, v) => fs.writeFileSync(DIR + prefix + n + ".json", JSON.stringify(v, null, 2) + "\n");
const normalize = (v) => v.replace(/\r\n/g, "\n");
const apiView = (raw) => normalize(raw).replace(/\n$/, ""); // API omits exactly one trailing LF
const rawHash = (v) => createHash("sha256").update(Buffer.from(v, "utf8")).digest("hex");

// frozen lead proofs — no reruns
for (const p of proofSpec.jsonProofs) {
  const j = JSON.parse(fs.readFileSync(DIR + p.file, "utf8"));
  if (p.resultCount !== undefined) {
    assert.equal(j.results.length, p.resultCount, p.file);
    const notOk = j.results.filter((r) => r.ok !== true).length;
    if (p.mustBeAllOk || (proofSpec.allResultsMustHaveOkTrue && !p.mustNotBeAllOk))
      assert.ok(j.results.every((r) => r.ok === true), p.file);
  }
  if (p.warnings !== undefined) assert.equal(j.warnings, p.warnings, p.file);
  if (p.inputs !== undefined) assert.equal(j.inputs, p.inputs, p.file);
  if (p.externalOnly) assert.ok(Array.isArray(j) && j.every((e) => e.external === true), p.file);
}
// browser telemetry contract
const browserProof = JSON.parse(fs.readFileSync(DIR + "browser/browser-verification.json", "utf8"));
assert.deepEqual(browserProof.foreign ?? [], []);
assert.deepEqual(browserProof.consoleErrors ?? [], []);
assert.deepEqual(browserProof.pageErrors ?? [], []);

const candidates = {};
for (const p of targets) {
  const name = p.split("/").pop();
  const cf = DIR + (spec.candidateDir || "candidates/") + name;
  candidates[p] = fs.readFileSync(cf, "utf8");
  assert.equal(rawHash(candidates[p]), spec.candidateHashes[name], "candidate hash " + name);
  assert.equal(rawHash(candidates[p]), proofSpec.candidateHashes[p], "proof candidate hash " + name);
  assert.ok(spec.candidateLineEndings !== "LF" || !candidates[p].includes("\r"), "candidate LF contract " + name);
  assert.equal(candidates[p].endsWith("\n"), spec.candidateTerminalLF[name], "candidate EOF contract " + name);
}

// recorded baselines: baseline/<basename> holds the `sandbox read` API view of
// the remote bytes (API omits exactly one trailing LF — remote disk files may
// carry a terminal LF the API never returns). Compare at apiView level.
const baselineDir = DIR + (proofSpec.baselineDir || "baseline/");
const recorded = {};
for (const p of [...targets, ...guards]) {
  const f = baselineDir + p.split("/").pop();
  if (fs.existsSync(f)) {
    const text = fs.readFileSync(f, "utf8");
    recorded[p] = { path: p, exists: true, hash: rawHash(text), text };
  }
}
for (const p of targets) {
  const name = p.split("/").pop();
  assert.ok(recorded[p], "no recorded baseline for target " + p);
  assert.equal(recorded[p].hash, spec.baselineHashes[name], "recorded baseline hash drift " + name);
  assert.equal(recorded[p].hash, proofSpec.baselineHashes[p], "proof baseline hash drift " + name);
}
// compare modulo EOL style + one terminal LF (API-view equivalence)
const normEq = (a, b) => apiView(normalize(a)) === apiView(normalize(b));
// guard hash references are pinned at preflight (raw FS bytes) and persisted in
// the preflight JSON — later modes load them as the reference.
function baselineFiles() {
  const pf = JSON.parse(fs.readFileSync(DIR + prefix + "preflight.json", "utf8"));
  const map = {};
  for (const p of [...targets, ...guards]) {
    const cap = pf.before.files.find((f) => f.path === p);
    assert.ok(cap, "preflight capture missing " + p);
    assert.ok(cap.exists, "preflight capture absent " + p);
    map[p] = { path: p, exists: true, hash: cap.hash };
  }
  return map;
}
// candidates have no terminal LF; remote writes may add one — classify rather
// than silently accept.
const eqCandidate = (file, p) =>
  file.text === candidates[p] ? "exact" : file.text === candidates[p] + "\n" ? "lf-added" : false;

// retry wrapper for READ-ONLY calls only (status/raw) — transient API drops
// must not abort apply. NEVER wrap sandbox edit/write/checkpoint — a
// lost-response retry could re-apply.
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
  const seed = `p=$(mktemp ${remoteTempPrefix}${label}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
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
files:${JSON.stringify([...targets, ...guards, ...phantomPaths])}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
const base={path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(buf).digest("hex")};
if(${JSON.stringify(targets)}.includes(path)){base.text=text;base.base64=buf.toString("base64");}
return base;})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`, "read");
  assert.equal(result.exitCode, 0, "raw capture failed: " + String(result.stderr || "").slice(0, 400));
  return JSON.parse(result.stdout);
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
  for (const p of phantomPaths) {
    const f = before.files.find((x) => x.path === p);
    assert.ok(!f || f.exists === false, "phantom path appeared: " + p);
  }
  for (const f of before.files) {
    if (phantomPaths.includes(f.path)) continue;
    assert.ok(f.exists, "missing remote file " + f.path);
    const rec = recorded[f.path];
    if (rec) assert.ok(normEq(f.normalized, rec.text), "recorded baseline drift " + f.path);
    if (targets.includes(f.path))
      assert.equal(rawHash(apiView(f.text)), spec.baselineHashes[f.path.split("/").pop()], "target baseline drift " + f.path);
  }
  for (const p of targets) {
    const file = before.files.find((f) => f.path === p);
    assert.equal(Buffer.from(file.text, "utf8").toString("base64"), file.base64, "utf8 roundtrip " + p);
    const read = await roRetry(() => sandbox(["read", p]));
    assert.equal(normalize(read.files[0].content), apiView(file.text), "api read " + p);
  }
  return { before, app };
}
function payload(file) {
  return JSON.stringify([{ old_text: file.text, new_text: candidates[file.path] }]);
}
function guardAll(snapshot, before, refs) {
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
    if (refs && refs[f.path]) assert.equal(f.hash, refs[f.path].hash, "reference drift " + f.path);
  }
}
function sourceRecords(snapshot, refs) {
  assert.equal(snapshot.headAfter, snapshot.head, "HEAD changed during capture");
  assert.equal(snapshot.dirtyAfter, snapshot.dirty, "worktree changed during capture");
  assert.deepEqual(snapshot.files.map(f => f.path).sort(), [...targets, ...guards, ...phantomPaths].sort());
  const files = new Map(snapshot.files.map(f => [f.path, f]));
  for (const p of phantomPaths)
    assert.equal(files.get(p)?.exists, false, "phantom path appeared " + p);
  for (const p of guards) {
    assert.equal(files.get(p)?.exists, true, "missing protected file " + p);
    assert.equal(files.get(p).hash, refs[p].hash, "protected source changed " + p);
  }
  const completed = [];
  for (const p of targets) {
    const f = files.get(p);
    assert.equal(f?.exists, true, "missing target " + p);
    assert.equal(Buffer.from(f.text, "utf8").toString("base64"), f.base64, "UTF8 roundtrip " + p);
    assert.equal(rawHash(f.text), f.hash, "target raw capture " + p);
    if (eqCandidate(f, p)) completed.push(p);
    else assert.equal(f.hash, refs[p].hash, "unrecognized target change " + p);
  }
  return completed;
}
export function assertOwnedSource(snapshot, refs, allNew = false) {
  const completed = sourceRecords(snapshot, refs);
  assert.equal(snapshot.dirty, "", "source must be committed and clean");
  assert.deepEqual([...snapshot.changed].sort(), [...completed].sort(), "unexpected changed-file scope");
  if (!completed.length) assert.equal(snapshot.head, HEAD, "unexpected baseline HEAD");
  if (allNew) assert.deepEqual([...completed].sort(), [...targets].sort(), "incomplete application");
  return completed;
}
async function settleOwnWrite(writtenPath, refs) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await roRetry(() => raw());
    sourceRecords(snapshot, refs);
    if (snapshot.dirty) {
      const paths = snapshot.dirty.split("\n").filter(Boolean).map(line => line.slice(3));
      assert.ok(paths.length && paths.every(p => p === writtenPath), "non-owned dirty files");
      assert.ok(snapshot.changed.every(p => targets.includes(p)), "non-owned committed change");
    } else {
      assertOwnedSource(snapshot, refs);
      const app = await roRetry(() => status(false));
      if (app.status?.state === "ready" && !app.pending) return snapshot;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error("Own write has not reached a clean, ready state; inspect before continuing.");
}
async function actualDependencyBuild() {
  const build = await roRetry(() => run(`const esbuild=require("/app/node_modules/esbuild");
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(buildAlias)},
outdir:${JSON.stringify(remoteTempPrefix + "actual-bundle")},write:false,metafile:true,logLevel:"silent"});
const pageOutputs=Object.entries(built.metafile.outputs).filter(([o,i])=>i.entryPoint&&i.entryPoint.endsWith("FoundationEstimator.jsx")).map(([o])=>o);
const pageInputs=pageOutputs.length===1?Object.keys(built.metafile.outputs[pageOutputs[0]].inputs):[];
const externalAt=[];
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "actual-build"));
  save("actual-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, expectedBundles);
  assert.deepEqual(meta.warnings, []); assert.deepEqual(meta.externalAt, []);
  assert.equal(meta.pageOutputs.length, pageEntries.length);
  for (const p of targets) {
    assert.equal(meta.inputs.filter((i) => i.endsWith(p)).length, 1, "input once " + p);
    if (pageEntries.length === 1) assert.equal(meta.pageInputs.filter((i) => i.endsWith(p)).length, 1, "page input once " + p);
  }
  save("actual-build-meta", meta);
  return meta;
}
async function stagedBuild() {
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync(${JSON.stringify(remoteTempPrefix)});console.log(d);`, "mkdtemp");
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
    for (let i = 0; i < b64.length; i += stageBase64ChunkLength) {
      const expectLen = Math.min(i + stageBase64ChunkLength, b64.length);
      const append = i !== 0;
      await stagedRun(
        "printf %s " + b64.slice(i, i + stageBase64ChunkLength) + " " + (append ? ">>" : ">") + " " + b64file,
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
  const build = run(`const fs=require("fs"),pp=require("path").posix;
const esbuild=require("/app/node_modules/esbuild");
const stageDir=${JSON.stringify(tmpDir)}+"/";
const overrides=${JSON.stringify(Object.fromEntries(targets.map((p)=>["/app/"+p,p.split("/").pop()])))};
const overridesLoaded={};
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify(buildEntries.map((p)=>"/app/"+p))},
bundle:true,platform:"browser",format:"esm",packages:"external",
alias:${JSON.stringify(buildAlias)},
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
for(const [o,i] of Object.entries(built.metafile.outputs))for(const imp of i.imports||[])if(imp.external&&imp.path.startsWith(${JSON.stringify(forbiddenExternalImportPrefix)}))externalAt.push({output:o,path:imp.path});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
overridesLoaded,pageOutputs,pageInputs,externalAt,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "staged-build");
  save("staged-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout);
  assert.equal(meta.ok, true); assert.equal(meta.outputs, expectedBundles);
  assert.deepEqual(meta.warnings, []);
  assert.deepEqual(meta.externalAt, []);
  assert.deepEqual(Object.keys(meta.overridesLoaded).sort(), targets.map((p) => "/app/" + p).sort());
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
  const refs = baselineFiles();
  const before = await preflight(); save("preflight", before);
  const diffs = [];
  for (const p of targets) {
    const file = before.before.files.find((f) => f.path === p);
    const r = sandbox(["edit", p, "--dry-run"], payload(file));
    assert.equal(r.applied, false, p);
    diffs.push({ path: p, result: r });
    const after = await roRetry(() => raw());
    assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
    guardAll(after, before, refs); await roRetry(() => status());
  }
  save("dry-run-diffs", diffs);
  const meta = await stagedBuild();
  const final = await roRetry(() => raw());
  assert.equal(final.head, HEAD); assert.equal(final.dirty, "");
  guardAll(final, before, refs);
  save("final-scope", final); save("final-status", await roRetry(() => status()));
  console.log("Dry-run: " + diffs.length + " whole-file edit previews applied=false; staged build " + meta.outputs + " bundles 0 warnings; no mutation.");
}
if (mode === "apply") {
  const refs = baselineFiles();
  const approval = JSON.parse(fs.readFileSync(DIR + prefix + "apply-approval.json", "utf8"));
  assert.equal(approval.authorized, true); assert.equal(approval.appId, APP);
  assert.equal(approval.branch, spec.branch); assert.equal(approval.sourceHead, HEAD);
  assert.ok(typeof approval.restoreCheckpointId === "string" && approval.restoreCheckpointId.length > 0);
  for (const p of targets) {
    const name = p.split("/").pop();
    assert.equal(approval.candidateHashes[name], proofSpec.candidateHashes[p], "approval hash " + name);
  }
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some(b => b.name === spec.branch && b.status === "active"));
  const before = { before: await roRetry(() => raw()), app: await roRetry(() => status()) };
  assertOwnedSource(before.before, refs);
  save("apply-preflight", before);
  for (const p of targets) {
    await roRetry(() => status());
    const current = await roRetry(() => raw());
    const completed = assertOwnedSource(current, refs);
    if (completed.includes(p)) continue;
    const file = current.files.find(f => f.path === p);
    let r;
    try {
      r = sandbox(["edit", p], payload(file));
      assert.equal(r.applied, true, p + " edit not applied");
    } catch (error) {
      try { save("uncertain-write", { path: p, source: await roRetry(() => raw()), app: await roRetry(() => status(false)) }); }
      catch (readError) { save("uncertain-write-read-error", { path: p, error: readError.message }); }
      throw error;
    }
    const after = await settleOwnWrite(p, refs);
    const afterFile = after.files.find((f) => f.path === p);
    const eq = eqCandidate(afterFile, p);
    assert.ok(eq, "post-edit content mismatch " + p);
    save("apply-" + p.split("/").pop(), { result: r, file: afterFile, candidateEquality: eq });
  }
  const after = await roRetry(() => raw()); assertOwnedSource(after, refs, true);
  save("apply-final-scope", after); save("apply-final-status", await roRetry(() => status()));
  console.log("Applied " + targets.length + " whole-file edits; verify remains required.");
}
if (mode === "verify") {
  const refs = baselineFiles();
  const after = await roRetry(() => raw()); assertOwnedSource(after, refs, true); await roRetry(() => status());
  const readbackEquality = {};
  for (const p of targets) {
    const file = after.files.find((f) => f.path === p);
    const eq = eqCandidate(file, p);
    assert.ok(eq, "raw readback mismatch " + p);
    readbackEquality[p] = eq;
    const read = await roRetry(() => sandbox(["read", p]));
    assert.equal(normalize(read.files[0].content), apiView(candidates[p]), "api " + p);
  }
  save("exact-raw-readback", { ...after, readbackEquality });
  const meta = await actualDependencyBuild();
  const final = await roRetry(() => raw()); assertOwnedSource(final, refs, true);
  assert.equal(final.head, after.head, "source changed during actual build");
  save("final-scope", final); save("final-status", await roRetry(() => status()));
  save("verification", { ok: true, targets, sourceHead: HEAD, verifiedHead: after.head, clean: true,
    protectedSourcesUnchanged: guards, actualDependencyBuild: meta.outputs,
    schemaChanged: false, reinforcementV2Activated: false,
    realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, " + targets.length + " targets, " + guards.length + " protected files, actual build, clean scope and ready status verified.");
}
