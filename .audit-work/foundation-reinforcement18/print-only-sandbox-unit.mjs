import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const candidate = JSON.parse(fs.readFileSync(DIR + "print-only-candidate.json", "utf8"));
const APP = candidate.appId;
const mode = process.argv[2];
assert.equal(APP, "68dfcc5e57bbbc35387da97c");
assert.equal(candidate.branch, "main");
assert.equal(candidate.targets.length, 2);
assert.ok(["dry-run", "apply", "verify", "checkpoint"].includes(mode));
const guarded = [
  "src/components/estimator/workOrderConversion.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/builder/partSync.js",
  "src/pages/FoundationEstimator.jsx",
  "base44/entities/WorkOrder.jsonc",
];
const allPaths = [...candidate.targets, ...guarded];
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const normalized = text => text.replace(/\r\n/g, "\n");
const apiNormalized = text => normalized(text).replace(/\n$/, "");
const hash = text => createHash("sha256").update(normalized(text)).digest("hex");
const save = (name, data) => fs.writeFileSync(DIR + name, JSON.stringify(data, null, 2) + "\n");
function run(args) {
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    save("print-only-sandbox-invalid-response.json", {
      kind: args.slice(0, 2), exit: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr,
    });
    throw Error("No valid CLI JSON; inspect actual sandbox source before any retry");
  }
  if (result.status !== 0) {
    save("print-only-sandbox-last-error.json", { kind: args.slice(0, 3), exit: result.status, data });
    throw Error(data.message || data.error?.message || "Sandbox command failed");
  }
  return data;
}
const sandbox = args => run(["sandbox", ...args, "--app-id", APP, "--branch", "main"]);
function program(code, name) {
  const file = "/tmp/ccs-print-only-" + name + ".cjs";
  return "printf %s " + Buffer.from(code, "utf8").toString("base64") + " | base64 -d > " + file + " && node " + file;
}
function appReady() {
  const app = run(["api", "fetch", "GET", "/api/apps/" + APP]);
  const projected = { id: app.id, status: app.status, pending: app.git_repo_pending, testDataEnabled: app.dev_environment_enabled };
  assert.equal(projected.id, APP);
  assert.equal(projected.status?.state, "ready", "Builder is not ready; do not edit/checkpoint");
  assert.ok(!projected.pending, "Source changes pending; do not edit/checkpoint");
  return projected;
}
function readRaw() {
  const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
console.log(JSON.stringify({
head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${candidate.sourceHead} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:${JSON.stringify(allPaths)}.map(path=>{
const raw=fs.readFileSync(path,"utf8"),normalized=raw.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path,crlf:raw.includes(String.fromCharCode(13,10)),normalized,hash:crypto.createHash("sha256").update(normalized).digest("hex")};})
}));`;
  const result = sandbox(["run", program(code, "read-raw")]);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout);
}
function preflight() {
  const status = appReady(), raw = readRaw();
  assert.equal(raw.head, candidate.sourceHead, "Concurrent HEAD changed; prepare a fresh candidate");
  assert.equal(raw.dirty, "", "Concurrent edits are present; do not write");
  assert.deepEqual(raw.changed, []);
  for (const file of candidate.targets) {
    const actual = raw.files.find(row => row.path === file);
    assert.equal(apiNormalized(actual.normalized), apiNormalized(candidate.source[file]), "Source drift: " + file);
  }
  const conversion = raw.files.find(row => row.path === guarded[0]);
  assert.equal(apiNormalized(conversion.normalized), apiNormalized(candidate.source[guarded[0]]), "Held conversion changed");
  const expected = Object.fromEntries(candidate.targets.map(file => {
    let content = raw.files.find(row => row.path === file).normalized;
    for (const edit of candidate.edits[file]) {
      assert.equal(content.split(edit.old_text).length - 1, 1, "Nonunique raw edit: " + file);
      content = content.replace(edit.old_text, edit.new_text);
    }
    assert.equal(apiNormalized(content), apiNormalized(candidate.files[file]));
    return [file, { normalized: content, hash: hash(content) }];
  }));
  return { status, raw, expected };
}
function editsFor(file, state) {
  const crlf = state.raw.files.find(row => row.path === file).crlf;
  const eol = text => crlf ? text.replace(/\n/g, "\r\n") : text;
  return candidate.edits[file].map(edit => ({ old_text: eol(edit.old_text), new_text: eol(edit.new_text) }));
}
function assertAfter(state, before) {
  assert.equal(state.dirty, "", "Auto-save or concurrent edits remain; wait and verify rather than overwrite");
  assert.deepEqual(state.changed.slice().sort(), candidate.targets.slice().sort(), "Only the two reviewed print files may change");
  for (const file of candidate.targets) {
    assert.equal(state.files.find(row => row.path === file).hash, before.expected[file].hash, "Exact raw readback mismatch: " + file);
  }
  for (const file of guarded) {
    assert.equal(state.files.find(row => row.path === file).hash,
      before.raw.files.find(row => row.path === file).hash, "Protected pricing/schema/editor source changed: " + file);
  }
}

if (mode === "dry-run") {
  const state = preflight();
  save("print-only-sandbox-dry-preflight.json", state);
  const results = [];
  for (const file of candidate.targets) {
    results.push({ file, result: sandbox(["edit", file, "--edits-json", JSON.stringify(editsFor(file, state)), "--dry-run"]) });
  }
  save("print-only-sandbox-dry-diffs.json", results);
  const after = readRaw();
  assert.equal(after.head, state.raw.head); assert.equal(after.dirty, "");
  assert.deepEqual(after.files.map(row => row.hash), state.raw.files.map(row => row.hash));
  console.log("Two-file dry-run passed; exact current source, clean main, no mutation.");
}
if (mode === "apply") {
  const state = preflight();
  save("print-only-sandbox-apply-preflight.json", state);
  save("print-only-sandbox-restore-checkpoint.json", sandbox(["checkpoint", "--name", "Before Print Cost Completeness Safeguards"]));
  const checked = preflight();
  assert.deepEqual(checked.raw.files.map(row => row.hash), state.raw.files.map(row => row.hash));
  const results = [];
  for (const file of candidate.targets) {
    try {
      const result = sandbox(["edit", file, "--edits-json", JSON.stringify(editsFor(file, checked))]);
      results.push({ file, result }); save("print-only-sandbox-apply-results.json", results);
    } catch (error) {
      save("print-only-sandbox-partial-readback.json", readRaw());
      throw error;
    }
  }
  console.log("Only two existing print files edited. Verification/checkpoint still required; no schema or conversion edits.");
}
if (mode === "verify") {
  const before = JSON.parse(fs.readFileSync(DIR + "print-only-sandbox-apply-preflight.json", "utf8"));
  let after = readRaw();
  for (let attempt = 0; after.dirty && attempt < 5; attempt += 1) {
    assert.ok(after.dirty.split("\n").filter(Boolean).every(line =>
      candidate.targets.some(file => line.endsWith(file))), "Concurrent edits appeared; do not interfere");
    await new Promise(resolve => setTimeout(resolve, 2000));
    after = readRaw();
  }
  assertAfter(after, before);
  save("print-only-sandbox-exact-readback.json", after);
  const readback = sandbox(["read", ...candidate.targets]);
  save("print-only-sandbox-api-readback.json", readback);
  for (const file of candidate.targets) {
    const actual = readback.files.find(row => row.path === file);
    assert.equal(apiNormalized(actual.content), apiNormalized(candidate.files[file]));
  }
  const code = `const assert=require("assert/strict"),esbuild=require("/app/node_modules/esbuild");
(async()=>{const result=await esbuild.build({
entryPoints:${JSON.stringify(candidate.targets)},bundle:true,platform:"browser",format:"esm",
outdir:"/tmp/ccs-print-only-verified",write:false,metafile:true,logLevel:"silent"});
const inputs=Object.keys(result.metafile.inputs);
for(const file of ${JSON.stringify(candidate.targets)})assert.ok(inputs.includes(file),"Actual remote target was not compiled: "+file);
assert.ok(inputs.includes("src/components/jobs/printTemplates/templates/_shared.js"));
assert.ok(!inputs.some(file=>/base44Client|node_modules\\/@base44\\/|foundationReinforcement|foundationCalc/.test(file)));
console.log(JSON.stringify({ok:true,inputs,outputFiles:result.outputFiles.length}));})().catch(error=>{console.error(error.stack);process.exitCode=1;});`;
  const built = sandbox(["run", program(code, "bundle"), "--timeout-ms", "120000"]);
  save("print-only-sandbox-build.json", built);
  assert.equal(built.exitCode, 0);
  assert.equal(JSON.parse(built.stdout).ok, true);
  const finalState = readRaw();
  assertAfter(finalState, before);
  const status = appReady();
  save("print-only-sandbox-final-scope.json", finalState);
  save("print-only-sandbox-final-status.json", status);
  save("print-only-sandbox-verification.json", {
    ok: true, targets: candidate.targets, sourceHead: candidate.sourceHead, verifiedHead: finalState.head,
    exactHashes: Object.fromEntries(candidate.targets.map(file => [file, finalState.files.find(row => row.path === file).hash])),
    protectedSourcesUnchanged: guarded, clean: true, actualRemoteBundle: true,
    costCaptureHeld: true, schemaChanged: false, reinforcementV2Activated: false,
    realStorageVerified: false, backendAuthorizationVerified: false,
  });
  console.log("Exact readback, actual remote dependency bundle, clean two-file scope and app ready verified.");
}
if (mode === "checkpoint") {
  const checked = JSON.parse(fs.readFileSync(DIR + "print-only-sandbox-verification.json", "utf8"));
  assert.equal(checked.ok, true);
  const before = JSON.parse(fs.readFileSync(DIR + "print-only-sandbox-apply-preflight.json", "utf8"));
  assertAfter(readRaw(), before); appReady();
  const checkpoint = sandbox(["checkpoint", "--name", "Print Frozen Cost Completeness Verified"]);
  save("print-only-sandbox-final-checkpoint.json", checkpoint);
  const after = readRaw(); assertAfter(after, before);
  save("print-only-sandbox-after-checkpoint-scope.json", after);
  save("print-only-sandbox-after-checkpoint-status.json", appReady());
  console.log(JSON.stringify(checkpoint));
}
