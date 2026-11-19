import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const HEAD = "5e3c2dbcca3757a4cce16e9c42b3950fed2029bc";
const prefix = "wall-cap-sandbox-";
const plan = JSON.parse(fs.readFileSync(DIR + "wall-cap-edit-plan.json", "utf8"));
const targets = Object.values(plan).map((entry) => entry.path);
const candidates = {};
for (const entry of Object.values(plan)) {
  const name = entry.path.split("/").pop();
  candidates[entry.path] = fs.readFileSync(DIR + "wall-cap-candidate-" + name, "utf8");
}
const priorPreflight = JSON.parse(fs.readFileSync(DIR + "wall-cap-sandbox-preflight.json", "utf8"));
const baselines = {};
for (const file of priorPreflight.before.files) {
  if (file.normalized !== undefined) baselines[file.path] = file.normalized; // raw text (crlf:false)
}
const normalize = (v) => v.replace(/\r\n/g, "\n");
const apiView = (rawText) => normalize(rawText).replace(/\n$/, ""); // API read omits exactly one trailing LF
const rawHash = (v) => createHash("sha256").update(Buffer.from(v, "utf8")).digest("hex");
// frozen offline proofs — no reruns
for (const [file, count] of [
  ["wall-cap-pricing-verification.json", 24],
  ["wall-cap-remote-candidate-pricing-verification.json", 24],
  ["wall-cap-pricing-ui-verification.json", 6],
  ["wall-cap-pricing-browser-verification.json", 8],
]) {
  const proof = JSON.parse(fs.readFileSync(DIR + file, "utf8"));
  assert.equal(proof.results.length, count, file);
  assert.ok(proof.results.every((r) => r.ok === true), file);
}
assert.equal(JSON.parse(fs.readFileSync(DIR + "wall-cap-remote-candidate-pricing-verification.json", "utf8")).candidate, true);
const logText = (name) => {
  const b = fs.readFileSync(DIR + name);
  const text = b[0] === 0xff && b[1] === 0xfe ? b.toString("utf16le") : b.toString("utf8");
  return text.replace(/\0/g, "");
};
assert.match(logText("wall-cap-pricing-catalog-with-cap-cases-final-log.txt"), /^PASS catalog-integrity passed=11 failed=0\r?$/m);
assert.match(logText("wall-cap-pricing-assembly-regression-log.txt"), /^assembly passed=28 failed=0\r?$/m);
// reconstruction proof at load — exact bytes incl EOF
for (const entry of Object.values(plan)) {
  let recon = baselines[entry.path];
  assert.ok(recon !== undefined, "missing baseline " + entry.path);
  for (const h of entry.hunks) {
    assert.ok(JSON.stringify(h).length < 4000);
    assert.equal(recon.split(h.old_text).length - 1, 1, "non-unique hunk in " + entry.path);
    recon = recon.replace(h.old_text, h.new_text);
  }
  assert.equal(recon, candidates[entry.path], "recon mismatch " + entry.path);
}
const guards = [
  "base44/shared/estimatorAiModelPolicy.js",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/pages/FoundationEstimator.jsx",
  "src/components/estimator/workOrderConversion.js",
  "base44/functions/staffEntityWrite/entry.ts",
  "base44/functions/staffDataRead/entry.ts",
  "src/components/estimator/builder/builderEntityPersistence.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
  "src/components/estimator/foundation/foundationAiReview.js",
  "src/components/estimator/foundation/AiEngineeringAssistant.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
];
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (name, value) => fs.writeFileSync(DIR + prefix + name + ".json", JSON.stringify(value, null, 2) + "\n");
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
  const seed = `p=$(mktemp /tmp/ccs-wall-cap-${label}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  return sandbox(["run", seed, "--timeout-ms", "120000"]);
}
function status() {
  const state = command(["api", "fetch", "GET", "/api/apps/" + APP]);
  assert.equal(state.id, APP); assert.equal(state.status?.state, "ready"); assert.ok(!state.git_repo_pending);
  assert.equal(state.dev_environment_enabled, false);
  return { id: state.id, status: state.status, pending: state.git_repo_pending, testDataEnabled: state.dev_environment_enabled };
}
function raw() {
  const result = run(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
console.log(JSON.stringify({head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${HEAD} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:${JSON.stringify([...targets, ...guards])}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const text=fs.readFileSync(path,"utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(text,"utf8").digest("hex")};})}));`, "read");
  assert.equal(result.exitCode, 0); return JSON.parse(result.stdout);
}
function preflight() {
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("brettheinlein1@gmail.com"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some((b) => b.name === "main" && b.status === "active"));
  const app = status(); assert.equal(app.testDataEnabled, false);
  const before = raw();
  assert.equal(before.head, HEAD); assert.equal(before.dirty, "");
  for (const entry of Object.values(plan)) {
    const file = before.files.find((f) => f.path === entry.path);
    assert.equal(file.normalized, baselines[entry.path], "baseline drift " + entry.path);
    assert.equal(file.hash, rawHash(baselines[entry.path]), "baseline raw hash " + entry.path);
  }
  return { before, app };
}
const eolFor = (before, path) => before.before.files.find((f) => f.path === path).crlf
  ? (t) => t.replace(/\n/g, "\r\n") : (t) => t;
function assertAfter(after, before) {
  assert.equal(after.dirty, "");
  assert.deepEqual(after.changed.slice().sort(), targets.slice().sort());
  for (const entry of Object.values(plan)) {
    const file = after.files.find((f) => f.path === entry.path);
    assert.equal(file.normalized, candidates[entry.path], "target raw text " + entry.path);
    assert.equal(file.hash, rawHash(candidates[entry.path]), "target raw hash " + entry.path);
  }
  for (const g of guards) {
    assert.equal(after.files.find((f) => f.path === g).hash,
      before.before.files.find((f) => f.path === g).hash, "Protected source changed: " + g);
  }
}
async function dependencyBuild() {
  // stage the 4 frozen candidates under a unique /tmp dir, then build actual
  // consumer entries with a file-namespace onLoad override at the 4 resolved
  // absolute paths; all other deps resolve from the real /app tree.
  const mk = run(`const fs=require("fs");const d=fs.mkdtempSync("/tmp/ccs-wallcap-");console.log(d);`, "mkdtemp");
  assert.equal(mk.exitCode, 0);
  const tmpDir = mk.stdout.trim(); save("staging-dir", tmpDir);
  for (const entry of Object.values(plan)) {
    const name = entry.path.split("/").pop();
    const b64 = Buffer.from(candidates[entry.path]).toString("base64");
    for (let i = 0; i < b64.length; i += 3000) {
      const chunk = b64.slice(i, i + 3000);
      sandbox(["run", "printf %s " + chunk + " " + (i === 0 ? ">" : ">>") + " " + tmpDir + "/" + name + ".b64", "--timeout-ms", "30000"]);
    }
    sandbox(["run", "base64 -d " + tmpDir + "/" + name + ".b64 > " + tmpDir + "/" + name + " && rm " + tmpDir + "/" + name + ".b64", "--timeout-ms", "30000"]);
  }
  const build = run(`const fs=require("fs"),pp=require("path").posix;
const esbuild=require("/app/node_modules/esbuild");
const stageDir=${JSON.stringify(tmpDir)}+"/";
const overrides=${JSON.stringify(Object.fromEntries(Object.values(plan).map(e=>["/app/"+e.path,e.path.split("/").pop()])))};
const overridesLoaded={};
(async()=>{const built=await esbuild.build({entryPoints:[
"/app/${Object.values(plan)[0].path}","/app/${Object.values(plan)[1].path}","/app/src/pages/FoundationEstimator.jsx"],
bundle:true,platform:"browser",format:"esm",packages:"external",
outdir:"/tmp/ccs-wall-cap-bundle",write:false,metafile:true,logLevel:"silent",
plugins:[{name:"cand",setup(b){
b.onLoad({filter:/^\\/app\\//},a=>{const name=overrides[a.path];
if(!name)return undefined;
const contents=fs.readFileSync(stageDir+name,"utf8");
overridesLoaded[a.path]={name,sha256:require("crypto").createHash("sha256").update(contents,"utf8").digest("hex")};
return {contents,resolveDir:pp.dirname(a.path),loader:a.path.endsWith(".jsx")?"jsx":"js"};});}}]});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
overridesLoaded,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "build");
  save("remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout); assert.equal(meta.ok, true); assert.equal(meta.outputs, 3);
  assert.deepEqual(meta.warnings, []);
  const expected = Object.values(plan).map((e) => "/app/" + e.path).sort();
  assert.deepEqual(Object.keys(meta.overridesLoaded).sort(), expected);
  for (const entry of Object.values(plan)) {
    assert.equal(meta.overridesLoaded["/app/" + entry.path].sha256, rawHash(candidates[entry.path]),
      "staged candidate hash " + entry.path);
    assert.ok(meta.inputs.some((i) => i.endsWith(entry.path)), "build input " + entry.path);
  }
  assert.ok(meta.inputs.some((i) => i.endsWith("src/pages/FoundationEstimator.jsx")), "page input");
  save("remote-build-meta", meta);
  const after = raw(); assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
  return meta;
}
const mode = process.argv[2];
assert.ok(["preflight", "dry-run", "apply", "verify", "checkpoint"].includes(mode));
if (mode === "preflight") {
  const before = preflight(); save("preflight", before);
  console.log("Preflight: HEAD clean, " + Object.keys(plan).length + " targets match frozen baselines, " + guards.length + " guards hashed, ready.");
}
if (mode === "dry-run") {
  const before = preflight(); save("preflight", before);
  const diffs = [];
  for (const entry of Object.values(plan)) {
    const eol = eolFor(before, entry.path);
    for (const [i, h] of entry.hunks.entries()) {
      const r = sandbox(["edit", entry.path, "--edits-json", JSON.stringify([{ old_text: eol(h.old_text), new_text: eol(h.new_text) }]), "--dry-run"]);
      assert.equal(r.applied, false, entry.path + " hunk " + i);
      diffs.push({ path: entry.path, hunk: i, result: r });
    }
  }
  save("dry-run-diffs", diffs);
  const buildMeta = await dependencyBuild();
  const after = raw();
  assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
  assert.deepEqual(after.files.map((f) => f.hash), before.before.files.map((f) => f.hash));
  console.log("Dry-run: " + diffs.length + " edit previews applied=false; /tmp dependency build " + buildMeta.outputs + " bundles; no mutation.");
}
function guardChecker(snapshot, before, frames) {
  for (const entry of Object.values(plan)) {
    const file = snapshot.files.find((f) => f.path === entry.path);
    assert.equal(file.normalized, frames[entry.path], "frame drift " + entry.path);
    assert.equal(file.hash, rawHash(frames[entry.path]), "frame raw hash " + entry.path);
  }
  for (const g of guards) {
    assert.equal(snapshot.files.find((f) => f.path === g).hash,
      before.before.files.find((f) => f.path === g).hash, "Guard drift: " + g);
  }
  const allowed = new Set(targets);
  for (const changedPath of snapshot.changed) assert.ok(allowed.has(changedPath), "unrelated changed path: " + changedPath);
  for (const dirtyLine of snapshot.dirty.split("\n").filter(Boolean)) {
    const dirtyPath = dirtyLine.slice(3);
    assert.ok([...allowed].some((t) => dirtyPath.endsWith(t)), "unrelated dirty path: " + dirtyPath);
  }
}
async function actualDependencyBuild() {
  const build = run(`const esbuild=require("/app/node_modules/esbuild");
(async()=>{const built=await esbuild.build({entryPoints:[
"/app/${Object.values(plan)[0].path}","/app/${Object.values(plan)[1].path}","/app/src/pages/FoundationEstimator.jsx"],
bundle:true,platform:"browser",format:"esm",packages:"external",
outdir:"/tmp/ccs-wall-cap-actual-bundle",write:false,metafile:true,logLevel:"silent"});
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "actual-build");
  save("actual-remote-build", build); assert.equal(build.exitCode, 0);
  const meta = JSON.parse(build.stdout); assert.equal(meta.ok, true); assert.equal(meta.outputs, 3);
  assert.deepEqual(meta.warnings, []);
  for (const entry of Object.values(plan)) assert.ok(meta.inputs.some((i) => i.endsWith(entry.path)), "actual build input " + entry.path);
  assert.ok(meta.inputs.some((i) => i.endsWith("src/pages/FoundationEstimator.jsx")), "actual page input");
  save("actual-remote-build-meta", meta);
  return meta;
}
if (mode === "apply") {
  const before = preflight(); save("apply-preflight", before);
  save("restore-checkpoint", sandbox(["checkpoint", "--name", "Before Wall Cap Saved-Pricing Guard"]));
  assert.deepEqual(preflight().before.files.map((f) => f.hash), before.before.files.map((f) => f.hash));
  const expectedFrames = Object.fromEntries(Object.values(plan).map((e) => [e.path, baselines[e.path]]));
  try {
    for (const entry of Object.values(plan)) {
      const eol = eolFor(before, entry.path);
      for (const [i, h] of entry.hunks.entries()) {
        let pre = raw();
        for (let w = 0; pre.dirty && w < 5; w += 1) {
          guardChecker(pre, before, expectedFrames);
          await new Promise((r) => setTimeout(r, 2000)); pre = raw();
        }
        guardChecker(pre, before, expectedFrames);
        status();
        assert.equal(pre.files.find((f) => f.path === entry.path).normalized.split(h.old_text).length - 1, 1, entry.path + " hunk " + i);
        const result = sandbox(["edit", entry.path, "--edits-json", JSON.stringify([{ old_text: eol(h.old_text), new_text: eol(h.new_text) }])]);
        assert.equal(result.applied, true, entry.path + " hunk " + i + " not applied");
        expectedFrames[entry.path] = expectedFrames[entry.path].replace(h.old_text, h.new_text);
        const post = raw();
        guardChecker(post, before, expectedFrames);
        save("apply-" + entry.path.split("/").pop() + "-" + i, { result, frames: expectedFrames });
      }
    }
  } catch (error) { save("failed-edit-actual-state", raw()); throw error; }
  console.log("Applied " + Object.values(plan).reduce((n, e) => n + e.hunks.length, 0) + " ordered hunks across " + Object.keys(plan).length + " targets; verify remains required.");
}
if (mode === "verify") {
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  let after = raw();
  for (let i = 0; after.dirty && i < 5; i += 1) {
    assert.ok(after.dirty.split("\n").filter(Boolean).every((l) => targets.some((t) => l.endsWith(t))));
    await new Promise((r) => setTimeout(r, 2000)); after = raw();
  }
  assertAfter(after, before); save("exact-raw-readback", after);
  for (const entry of Object.values(plan)) {
    const read = sandbox(["read", entry.path]);
    assert.equal(normalize(read.files[0].content), apiView(candidates[entry.path]), "API readback " + entry.path);
  }
  save("api-readbacks", "ok");
  const actualMeta = await actualDependencyBuild();
  const mid = raw(); assertAfter(mid, before);
  const final = raw(); assertAfter(final, before); save("final-scope", final);
  const app = status(); save("final-status", app);
  save("verification", { ok: true, targets, sourceHead: HEAD, verifiedHead: final.head, clean: true,
    protectedSourcesUnchanged: guards, offlineProofsFrozen: [24, 24, 6, 11, 28, 8],
    sourceKind: "actual", actualDependencyBuild: actualMeta.outputs,
    schemaChanged: false, reinforcementV2Activated: false,
    realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, " + targets.length + " targets, " + guards.length + " protected files, clean scope and ready status verified.");
}
if (mode === "checkpoint") {
  const proof = JSON.parse(fs.readFileSync(DIR + prefix + "verification.json", "utf8")); assert.equal(proof.ok, true);
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  assert.equal(raw().head, proof.verifiedHead, "HEAD drifted since verification");
  assertAfter(raw(), before); status();
  const checkpoint = sandbox(["checkpoint", "--name", "Wall Cap Saved-Pricing Guard Verified"]);
  save("final-checkpoint", checkpoint);
  const after = raw(); assertAfter(after, before);
  save("after-checkpoint-scope", after); save("after-checkpoint-status", status());
  console.log(JSON.stringify(checkpoint));
}
