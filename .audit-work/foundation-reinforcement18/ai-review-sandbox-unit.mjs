import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const UI = "src/components/estimator/foundation/AiEngineeringAssistant.jsx";
const HELPER = "src/components/estimator/foundation/foundationAiReview.js";
const HEAD = "509de5f66dee6c34f0e044efce0338558243e53d";
const prefix = "ai-review-";
const uiBefore = JSON.parse(fs.readFileSync(DIR + "ai-review-current-source.json", "utf8"))
  .files.find(file => file.path === UI).content;
const uiCandidate = fs.readFileSync(DIR + "ai-review-candidate-AiEngineeringAssistant.jsx", "utf8");
const helperCandidate = fs.readFileSync(DIR + "ai-review-candidate-helper.js", "utf8");
const hunks = JSON.parse(fs.readFileSync(DIR + "ai-review-ui-hunks.json", "utf8"));
const freeze = JSON.parse(fs.readFileSync(DIR + "ai-review-candidate-freeze.json", "utf8"));
const normalize = value => value.replace(/\r\n/g, "\n");
const api = value => normalize(value).replace(/\n$/, "");
const hash = value => createHash("sha256").update(normalize(value)).digest("hex");
assert.equal(api(uiBefore).length, 3874);
// frozen candidates must match the accepted local sources byte-for-byte
const localUi = normalize(fs.readFileSync("src/components/estimator/foundation/AiEngineeringAssistant.jsx", "utf8"));
const localHelper = normalize(fs.readFileSync("src/components/estimator/foundation/foundationAiReview.js", "utf8"));
assert.equal(hash(localUi), freeze.ui.sha); assert.equal(hash(uiCandidate), freeze.ui.sha);
assert.equal(hash(localHelper), freeze.helper.sha); assert.equal(hash(helperCandidate), freeze.helper.sha);
// hunk set: unique, non-overlapping, ordered, reconstructs the exact candidate
{
  let cursor = 0;
  for (const h of hunks) {
    assert.ok(JSON.stringify(h).length < 4000);
    const at = api(uiBefore).indexOf(h.old_text, cursor);
    assert.ok(at >= cursor); cursor = at + h.old_text.length;
    assert.equal(api(uiBefore).split(h.old_text).length - 1, 1);
  }
  let recon = api(uiBefore); for (const h of hunks) recon = recon.replace(h.old_text, h.new_text);
  assert.equal(recon, api(uiCandidate));
}
// frozen offline proofs (no reruns): 14 pure helper, 15 UI, 10 native browser
for (const [file, count] of [
  ["foundation-ai-review-verification.json", 14],
  ["foundation-ai-review-ui-verification.json", 15],
  ["foundation-ai-review-browser-verification.json", 10],
]) {
  const proof = JSON.parse(fs.readFileSync(DIR + file, "utf8"));
  const results = proof.results || proof.cases || proof;
  assert.equal(results.length, count, file);
  assert.ok(results.every(r => r.ok === true), file);
}
const guards = [
  "base44/shared/estimatorAiModelPolicy.js",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/pages/FoundationEstimator.jsx",
  "src/components/estimator/workOrderConversion.js",
  "base44/functions/staffEntityWrite/entry.ts",
  "base44/functions/staffDataRead/entry.ts",
  "src/components/estimator/builder/builderEntityPersistence.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
];
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (name, value) => fs.writeFileSync(DIR + prefix + name + ".json", JSON.stringify(value, null, 2) + "\n");
function command(args) {
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    save("invalid-cli-response", { kind: args.slice(0, 2), exit: result.status, error: result.error?.message,
      stdout: result.stdout, stderr: result.stderr });
    throw Error("Invalid CLI response; inspect actual state before retrying.");
  }
  if (result.status !== 0) {
    save("cli-error", { kind: args.slice(0, 2), exit: result.status, data });
    throw Error(typeof data.error === "string" ? data.error : data.error?.message || "Base44 CLI failed");
  }
  return data;
}
function sandbox(args, input) {
  const opts = input === undefined ? {} : { input };
  const result = spawnSync(process.execPath, [cli, "base44@latest", "sandbox", ...args, "--app-id", APP, "--branch", "main", "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024, ...opts,
  });
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    save("invalid-cli-response", { kind: args.slice(0, 2), exit: result.status, error: result.error?.message,
      stdout: result.stdout, stderr: result.stderr });
    throw Error("Invalid CLI response; inspect actual state before retrying.");
  }
  if (result.status !== 0) {
    save("cli-error", { kind: args.slice(0, 2), exit: result.status, data });
    throw Error(typeof data.error === "string" ? data.error : data.error?.message || "Base44 CLI failed");
  }
  return data;
}
function run(code, label) {
  const file = "/tmp/ccs-ai-review-" + label + ".cjs";
  return sandbox(["run", "printf %s " + Buffer.from(code).toString("base64") + " | base64 -d > " + file + " && node " + file,
    "--timeout-ms", "120000"]);
}
function status() {
  const state = command(["api", "fetch", "GET", "/api/apps/" + APP]);
  assert.equal(state.id, APP); assert.equal(state.status?.state, "ready"); assert.ok(!state.git_repo_pending);
  return { id: state.id, status: state.status, pending: state.git_repo_pending, testDataEnabled: state.dev_environment_enabled };
}
function raw() {
  const result = run(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
console.log(JSON.stringify({head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${HEAD} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:${JSON.stringify([UI, HELPER, ...guards])}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const text=fs.readFileSync(path,"utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(normalized).digest("hex")};})}));`, "read");
  assert.equal(result.exitCode, 0); return JSON.parse(result.stdout);
}
function preflight() {
  const who = command(["whoami"]); assert.ok(String(who.output || "").includes("@"));
  const branches = command(["branches", "list", "--app-id", APP]);
  assert.ok((branches.branches || []).some(b => b.name === "main" && b.status === "active"));
  const app = status(), before = raw();
  assert.equal(before.head, HEAD); assert.equal(before.dirty, "");
  const ui = before.files.find(file => file.path === UI);
  assert.equal(api(ui.normalized), api(uiBefore));
  const helper = before.files.find(file => file.path === HELPER);
  assert.equal(helper.exists, false);
  return { before, app, expectedUiHash: hash(uiCandidate), expectedHelperHash: hash(helperCandidate) };
}
function assertAfter(after, before) {
  assert.equal(after.dirty, "");
  assert.deepEqual(after.changed.slice().sort(), [HELPER, UI].sort());
  assert.equal(after.files.find(file => file.path === UI).hash, before.expectedUiHash);
  assert.equal(after.files.find(file => file.path === HELPER).hash, before.expectedHelperHash);
  for (const path of guards) assert.equal(after.files.find(file => file.path === path).hash,
    before.before.files.find(file => file.path === path).hash, "Protected source changed: " + path);
}
const mode = process.argv[2];
assert.ok(["dry-run", "apply", "finish-newline", "verify", "checkpoint"].includes(mode));
if (mode === "dry-run") {
  const before = preflight(); save("dry-preflight", before);
  const crlf = before.before.files.find(file => file.path === UI).crlf;
  const eol = text => crlf ? text.replace(/\n/g, "\r\n") : text;
  const diffs = hunks.map((h, i) => {
    const r = sandbox(["edit", UI, "--edits-json", JSON.stringify([{ old_text: eol(h.old_text), new_text: eol(h.new_text) }]), "--dry-run"]);
    assert.equal(r.applied, false, "hunk " + i + " must dry-run only");
    return r;
  });
  save("dry-diff", diffs);
  save("dry-helper-diff", { path: HELPER, bytes: helperCandidate.length, hash: hash(helperCandidate),
    added: helperCandidate.split("\n").length + " lines (new file)" });
  const after = raw();
  assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
  assert.deepEqual(after.files.map(file => file.hash), before.before.files.map(file => file.hash));
  console.log("Two-target dry-run: " + hunks.length + " actual CLI edit previews applied=false; new helper staged locally only; no mutation.");
}
if (mode === "apply") {
  const before = preflight(); save("apply-preflight", before);
  save("restore-checkpoint", sandbox(["checkpoint", "--name", "Before Foundation AI Preliminary Review"]));
  assert.deepEqual(preflight().before.files.map(file => file.hash), before.before.files.map(file => file.hash));
  try { save("write-helper", sandbox(["write", HELPER], helperCandidate)); }
  catch (error) { save("failed-write-actual-state", raw()); throw error; }
  const afterHelper = raw();
  assert.equal(afterHelper.files.find(file => file.path === HELPER).hash, before.expectedHelperHash);
  const helperRead = sandbox(["read", HELPER]); save("helper-api-readback", helperRead);
  assert.equal(api(helperRead.files[0].content), api(helperCandidate));
  const crlfApply = before.before.files.find(file => file.path === UI).crlf;
  const eolApply = text => crlfApply ? text.replace(/\n/g, "\r\n") : text;
  let expectedUi = before.before.files.find(file => file.path === UI).normalized;
  try {
    for (const [i, h] of hunks.entries()) {
      const pre = raw();
      const preUi = pre.files.find(file => file.path === UI);
      assert.equal(preUi.normalized, expectedUi, "UI changed before hunk " + i);
      assert.equal(pre.files.find(file => file.path === HELPER).hash, before.expectedHelperHash);
      for (const g of guards) assert.equal(pre.files.find(file => file.path === g).hash,
        before.before.files.find(file => file.path === g).hash, "Guard changed before hunk " + i + ": " + g);
      assert.equal(preUi.normalized.split(h.old_text).length - 1, 1, "hunk " + i + " anchor not unique");
      save("edit-hunk-" + i, sandbox(["edit", UI, "--edits-json", JSON.stringify([{ old_text: eolApply(h.old_text), new_text: eolApply(h.new_text) }])]));
      const post = raw();
      const postUi = post.files.find(file => file.path === UI).normalized;
      const expected = preUi.normalized.replace(h.old_text, h.new_text);
      assert.equal(postUi, expected, "hunk " + i + " intermediate mismatch");
      expectedUi = expected;
      for (const g of guards) assert.equal(post.files.find(file => file.path === g).hash,
        pre.files.find(file => file.path === g).hash, "Guard drift mid-apply: " + g);
    }
  } catch (error) { save("failed-edit-actual-state", raw()); throw error; }
  console.log("New helper written + " + hunks.length + " ordered UI edits applied; raw/API/build/scope verification remains required.");
}
if (mode === "finish-newline") {
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  const current = raw(), ui = current.files.find(file => file.path === UI);
  assert.equal(current.dirty, "");
  assert.deepEqual(current.changed.slice().sort(), [HELPER, UI].sort());
  assert.equal(ui.normalized, normalize(uiCandidate).replace(/\n$/, ""));
  assert.equal(current.files.find(file => file.path === HELPER).hash, before.expectedHelperHash);
  for (const g of guards) assert.equal(current.files.find(file => file.path === g).hash,
    before.before.files.find(file => file.path === g).hash);
  status();
  const tail = "    </div>\n  );\n}";
  assert.ok(ui.normalized.endsWith(tail)); assert.equal(ui.normalized.split(tail).length - 1, 1);
  const eol = text => ui.crlf ? text.replace(/\n/g, "\r\n") : text;
  save("finish-newline-edit", sandbox(["edit", UI, "--edits-json", JSON.stringify([
    { old_text: eol(tail), new_text: eol(tail + "\n") },
  ])]));
  const after = raw();
  assert.equal(after.files.find(file => file.path === UI).hash, before.expectedUiHash);
  assert.equal(after.files.find(file => file.path === HELPER).hash, before.expectedHelperHash);
  for (const g of guards) assert.equal(after.files.find(file => file.path === g).hash,
    before.before.files.find(file => file.path === g).hash);
  save("finish-newline-state", after);
  console.log("One trailing newline restored; both exact candidate hashes and all twelve guards verified.");
}
if (mode === "verify") {
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  let after = raw();
  for (let i = 0; after.dirty && i < 5; i += 1) {
    assert.ok(after.dirty.split("\n").filter(Boolean).every(line => line.endsWith(UI) || line.endsWith(HELPER)));
    await new Promise(resolve => setTimeout(resolve, 2000)); after = raw();
  }
  assertAfter(after, before); save("exact-raw-readback", after);
  const uiRead = sandbox(["read", UI]); save("api-readback-ui", uiRead);
  assert.equal(api(uiRead.files[0].content), api(uiCandidate));
  const helperRead = sandbox(["read", HELPER]); save("api-readback-helper", helperRead);
  assert.equal(api(helperRead.files[0].content), api(helperCandidate));
  const build = run(`const esbuild=require("/app/node_modules/esbuild"),assert=require("assert/strict");
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify([HELPER, UI,
    "src/pages/FoundationEstimator.jsx"])},
bundle:true,platform:"browser",format:"esm",packages:"external",alias:{"@":"/app/src"},
outdir:"/tmp/ccs-ai-review-bundle",write:false,metafile:true,logLevel:"silent"});
assert.ok(Object.keys(built.metafile.inputs).includes(${JSON.stringify(HELPER)}));
assert.ok(Object.keys(built.metafile.inputs).includes(${JSON.stringify(UI)}));
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "build");
  save("remote-build", build); assert.equal(build.exitCode, 0); assert.equal(JSON.parse(build.stdout).ok, true);
  const final = raw(); assertAfter(final, before); save("final-scope", final);
  const app = status(); save("final-status", app);
  save("verification", { ok: true, targets: [HELPER, UI], sourceHead: HEAD, verifiedHead: final.head,
    exactUiHash: before.expectedUiHash, exactHelperHash: before.expectedHelperHash,
    protectedSourcesUnchanged: guards, clean: true,
    remoteConsumerDependencyBuild: true, offlineProofsFrozen: [14, 15, 10],
    schemaChanged: false, reinforcementV2Activated: false,
    realAiCallVerified: false, realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, three consumer bundles, twelve protected files, clean two-file scope and ready status verified.");
}
if (mode === "checkpoint") {
  const proof = JSON.parse(fs.readFileSync(DIR + prefix + "verification.json", "utf8")); assert.equal(proof.ok, true);
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  assertAfter(raw(), before); status();
  const checkpoint = sandbox(["checkpoint", "--name", "Foundation AI Preliminary Review Guard Verified"]);
  save("final-checkpoint", checkpoint);
  const after = raw(); assertAfter(after, before);
  save("after-checkpoint-scope", after); save("after-checkpoint-status", status());
  console.log(JSON.stringify(checkpoint));
}
