import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const TARGET = "src/components/estimator/builder/builderEntityPersistence.js";
const HEAD = "a78d9b057084f3692a22297d00cbf2ca7463aa7c";
const prefix = "catalog-update-readback-";
const source = JSON.parse(fs.readFileSync(DIR + "catalog-persistence-current-source.json", "utf8"))
  .files.find(file => file.path === TARGET).content;
const candidate = fs.readFileSync(DIR + "catalog-update-readback-candidate.js", "utf8");
const edit = {
  old_text: "      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);\n      return saved;",
  new_text: `      if (!saved) throw new Error(\`\${label} was updated but could not be re-read.\`);
      if (!fieldNames.every((fieldName) => sameValue(saved[fieldName], desired[fieldName]))) {
        throw new Error(\`\${label} was updated but its stored values do not match this save. Reload and review the record before retrying.\`);
      }
      return saved;`,
};
const normalize = value => value.replace(/\r\n/g, "\n");
const api = value => normalize(value).replace(/\n$/, "");
const hash = value => createHash("sha256").update(normalize(value)).digest("hex");
assert.equal(normalize(source).split(edit.old_text).length - 1, 1);
assert.equal(api(candidate), api(normalize(source).replace(edit.old_text, edit.new_text)));
const proof = JSON.parse(fs.readFileSync(DIR + "catalog-update-readback-candidate-verification.json", "utf8"));
assert.equal(proof.results.length, 10); assert.ok(proof.results.every(result => result.ok));
const guards = [
  "base44/functions/staffEntityWrite/entry.ts",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/workOrderConversion.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/pages/FoundationEstimator.jsx",
  "src/pages/FoundationInventory.jsx",
  "src/components/masterInventory/FoundationMaterialDialog.jsx",
  "src/components/masterInventory/inventoryPersistence.js",
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
const sandbox = args => command(["sandbox", ...args, "--app-id", APP, "--branch", "main"]);
function run(code, label) {
  const file = "/tmp/ccs-catalog-update-readback-" + label + ".cjs";
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
files:${JSON.stringify([TARGET, ...guards])}.map(path=>{const text=fs.readFileSync(path,"utf8"),
normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path,crlf:text.includes(String.fromCharCode(13,10)),normalized,
hash:crypto.createHash("sha256").update(normalized).digest("hex")};})}));`, "read");
  assert.equal(result.exitCode, 0); return JSON.parse(result.stdout);
}
function preflight() {
  const app = status(), before = raw();
  assert.equal(before.head, HEAD); assert.equal(before.dirty, ""); assert.deepEqual(before.changed, []);
  const current = before.files.find(file => file.path === TARGET);
  assert.equal(api(current.normalized), api(source));
  const expected = current.normalized.replace(edit.old_text, edit.new_text);
  assert.equal(api(expected), api(candidate));
  return { before, app, expectedHash: hash(expected) };
}
function assertAfter(after, before) {
  assert.equal(after.dirty, ""); assert.deepEqual(after.changed, [TARGET]);
  assert.equal(after.files.find(file => file.path === TARGET).hash, before.expectedHash);
  for (const path of guards) assert.equal(after.files.find(file => file.path === path).hash,
    before.before.files.find(file => file.path === path).hash, "Protected source changed: " + path);
}
function payload(before) {
  const crlf = before.before.files.find(file => file.path === TARGET).crlf;
  const eol = text => crlf ? text.replace(/\n/g, "\r\n") : text;
  return [{ old_text: eol(edit.old_text), new_text: eol(edit.new_text) }];
}
const mode = process.argv[2];
assert.ok(["dry-run", "apply", "verify", "checkpoint"].includes(mode));
if (mode === "dry-run") {
  const before = preflight(); save("dry-preflight", before);
  save("dry-diff", sandbox(["edit", TARGET, "--edits-json", JSON.stringify(payload(before)), "--dry-run"]));
  const after = raw();
  assert.equal(after.head, HEAD); assert.equal(after.dirty, "");
  assert.deepEqual(after.files.map(file => file.hash), before.before.files.map(file => file.hash));
  console.log("One-file, three-added-line dry-run verified without mutation.");
}
if (mode === "apply") {
  const before = preflight(); save("apply-preflight", before);
  save("restore-checkpoint", sandbox(["checkpoint", "--name", "Before Catalog Update Readback Guard"]));
  assert.deepEqual(preflight().before.files.map(file => file.hash), before.before.files.map(file => file.hash));
  try { save("apply-result", sandbox(["edit", TARGET, "--edits-json", JSON.stringify(payload(before))])); }
  catch (error) { save("failed-edit-actual-state", raw()); throw error; }
  console.log("One reviewed helper updated; raw/API/build/scope verification remains required.");
}
if (mode === "verify") {
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  let after = raw();
  for (let i = 0; after.dirty && i < 5; i += 1) {
    assert.ok(after.dirty.split("\n").filter(Boolean).every(line => line.endsWith(TARGET)));
    await new Promise(resolve => setTimeout(resolve, 2000)); after = raw();
  }
  assertAfter(after, before); save("exact-raw-readback", after);
  const readback = sandbox(["read", TARGET]); save("api-readback", readback);
  assert.equal(api(readback.files[0].content), api(candidate));
  const build = run(`const esbuild=require("/app/node_modules/esbuild"),assert=require("assert/strict");
(async()=>{const built=await esbuild.build({entryPoints:${JSON.stringify([TARGET,
    "src/components/masterInventory/FoundationMaterialDialog.jsx", "src/pages/FoundationInventory.jsx"])},
bundle:true,platform:"browser",format:"esm",packages:"external",alias:{"@":"/app/src"},
outdir:"/tmp/ccs-catalog-update-readback-bundle",write:false,metafile:true,logLevel:"silent"});
assert.ok(Object.keys(built.metafile.inputs).includes(${JSON.stringify(TARGET)}));
console.log(JSON.stringify({ok:true,inputs:Object.keys(built.metafile.inputs),outputs:built.outputFiles.length,
warnings:built.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));})()
.catch(error=>{console.error(error.stack);process.exitCode=1;});`, "build");
  save("remote-build", build); assert.equal(build.exitCode, 0); assert.equal(JSON.parse(build.stdout).ok, true);
  const final = raw(); assertAfter(final, before); save("final-scope", final);
  const app = status(); save("final-status", app);
  save("verification", { ok: true, target: TARGET, sourceHead: HEAD, verifiedHead: final.head,
    exactHash: before.expectedHash, protectedSourcesUnchanged: guards, clean: true,
    remoteConsumerDependencyBuild: true, offlineReadbackCases: 10, existingBuilderPersistenceCases: 8,
    schemaChanged: false, catalogMetadataActivated: false, reinforcementV2Activated: false,
    realStorageVerified: false, realAuthenticationVerified: false });
  console.log("Exact readback, three consumer bundles, ten protected files, clean one-file scope and ready status verified.");
}
if (mode === "checkpoint") {
  const proof = JSON.parse(fs.readFileSync(DIR + prefix + "verification.json", "utf8")); assert.equal(proof.ok, true);
  const before = JSON.parse(fs.readFileSync(DIR + prefix + "apply-preflight.json", "utf8"));
  assertAfter(raw(), before); status();
  const checkpoint = sandbox(["checkpoint", "--name", "Catalog Update Readback Guard Verified"]);
  save("final-checkpoint", checkpoint);
  const after = raw(); assertAfter(after, before);
  save("after-checkpoint-scope", after); save("after-checkpoint-status", status());
  console.log(JSON.stringify(checkpoint));
}
