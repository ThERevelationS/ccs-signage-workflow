import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const TARGET = "base44/functions/staffEntityWrite/entry.ts";
const sourceHead = "ff1958c2ad823ce83caadb91797c8ec9f01e8d47";
const source = JSON.parse(fs.readFileSync(DIR + "schema-gate-current-source.json", "utf8"))
  .files.find(file => file.path === TARGET).content.replace(/\r\n/g, "\n");
const candidate = fs.readFileSync(DIR + "catalog-gateway-candidate-entry.ts", "utf8").replace(/\r\n/g, "\n");
const edits = [
  { old_text: "  FoundationProject: new Set(['create', 'updateMany']),",
    new_text: "  FoundationProject: new Set(['create', 'updateMany']),\n  FoundationInventory: new Set(['create', 'updateMany', 'deleteMany'])," },
  { old_text: "const ADMIN_ONLY_WRITE = new Set([", new_text: "const ADMIN_ONLY_WRITE = new Set([\n  'FoundationInventory'," },
  { old_text: "    const id = String(body?.id || '').trim();", new_text: `    if (entityName === 'FoundationInventory' && op === 'deleteMany') {
      const query = body?.query;
      if (!query || typeof query !== 'object' || Array.isArray(query)
        || typeof query.id !== 'string' || !query.id.trim()
        || typeof query.updated_date !== 'string' || !query.updated_date.trim()
        || (body?.id !== undefined && body.id !== query.id)) {
        throw bad('A Foundation catalog conditional delete requires matching string id and updated_date anchors.');
      }
    }
    const catalogDeleteId = entityName === 'FoundationInventory' && op === 'deleteMany' ? body?.query?.id : '';
    const id = String(body?.id || catalogDeleteId || '').trim();` },
];
let expectedApi = source;
for (const edit of edits) {
  assert.equal(expectedApi.split(edit.old_text).length - 1, 1);
  expectedApi = expectedApi.replace(edit.old_text, edit.new_text);
}
const normalize = text => text.replace(/\r\n/g, "\n");
const api = text => normalize(text).replace(/\n$/, "");
assert.equal(api(candidate), api(expectedApi), "Candidate contains changes outside the exact three reviewed edits");
const proof = JSON.parse(fs.readFileSync(DIR + "foundation-catalog-gateway-candidate-verification.json", "utf8"));
assert.equal(proof.results.length, 10); assert.ok(proof.results.every(row => row.ok));
const guarded = [
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/workOrderConversion.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/pages/FoundationEstimator.jsx",
  "src/components/staff/staffEntities.js",
  "base44/functions/staffDataRead/entry.ts",
];
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const save = (name, value) => fs.writeFileSync(DIR + name, JSON.stringify(value, null, 2) + "\n");
const hash = text => createHash("sha256").update(normalize(text)).digest("hex");
function command(args) {
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    save("catalog-gateway-invalid-cli-response.json", { kind: args.slice(0, 2), exit: result.status,
      error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
    throw Error("Invalid CLI JSON; inspect remote state before any retry");
  }
  if (result.status !== 0) {
    save("catalog-gateway-cli-error.json", { kind: args.slice(0, 2), exit: result.status, data });
    throw Error(data.message || data.error?.message || "Base44 CLI failed");
  }
  return data;
}
const sandbox = args => command(["sandbox", ...args, "--app-id", APP, "--branch", "main"]);
function program(code, name) {
  const file = "/tmp/ccs-catalog-gateway-" + name + ".cjs";
  return "printf %s " + Buffer.from(code, "utf8").toString("base64") + " | base64 -d > " + file + " && node " + file;
}
function ready() {
  const app = command(["api", "fetch", "GET", "/api/apps/" + APP]);
  const state = { id: app.id, status: app.status, pending: app.git_repo_pending, testDataEnabled: app.dev_environment_enabled };
  assert.equal(state.id, APP); assert.equal(state.status?.state, "ready"); assert.ok(!state.pending);
  return state;
}
function rawRead() {
  const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
console.log(JSON.stringify({
head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${sourceHead} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:${JSON.stringify([TARGET, ...guarded])}.map(path=>{
const text=fs.readFileSync(path,"utf8"),normalized=text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path,crlf:text.includes(String.fromCharCode(13,10)),normalized,hash:crypto.createHash("sha256").update(normalized).digest("hex")};})}));`;
  const result = sandbox(["run", program(code, "read")]);
  assert.equal(result.exitCode, 0); return JSON.parse(result.stdout);
}
function preflight() {
  const state = ready(), raw = rawRead();
  assert.equal(raw.head, sourceHead, "Concurrent HEAD changed; stop and review");
  assert.equal(raw.dirty, ""); assert.deepEqual(raw.changed, []);
  const actual = raw.files.find(file => file.path === TARGET);
  assert.equal(api(actual.normalized), api(source), "Gateway source changed");
  let expected = actual.normalized;
  for (const edit of edits) {
    assert.equal(expected.split(edit.old_text).length - 1, 1);
    expected = expected.replace(edit.old_text, edit.new_text);
  }
  assert.equal(api(expected), api(candidate));
  return { state, raw, expected, expectedHash: hash(expected) };
}
function payload(before) {
  const crlf = before.raw.files.find(file => file.path === TARGET).crlf;
  const eol = text => crlf ? text.replace(/\n/g, "\r\n") : text;
  return edits.map(edit => ({ old_text: eol(edit.old_text), new_text: eol(edit.new_text) }));
}
function assertAfter(after, before) {
  assert.equal(after.dirty, "");
  assert.deepEqual(after.changed, [TARGET], "Only the reviewed gateway file may change");
  assert.equal(after.files.find(file => file.path === TARGET).hash, before.expectedHash);
  for (const file of guarded) {
    assert.equal(after.files.find(row => row.path === file).hash,
      before.raw.files.find(row => row.path === file).hash, "Protected source changed: " + file);
  }
}
const mode = process.argv[2];
assert.ok(["dry-run", "apply", "verify", "checkpoint"].includes(mode));
if (mode === "dry-run") {
  const before = preflight();
  save("catalog-gateway-dry-preflight.json", before);
  save("catalog-gateway-dry-diff.json", sandbox(["edit", TARGET, "--edits-json", JSON.stringify(payload(before)), "--dry-run"]));
  const after = rawRead();
  assert.equal(after.head, before.raw.head); assert.equal(after.dirty, "");
  assert.deepEqual(after.files.map(file => file.hash), before.raw.files.map(file => file.hash));
  console.log("Exact three-hunk, one-file dry-run verified; no source mutation.");
}
if (mode === "apply") {
  const before = preflight();
  save("catalog-gateway-apply-preflight.json", before);
  save("catalog-gateway-restore-checkpoint.json", sandbox(["checkpoint", "--name", "Before Foundation Catalog Admin Gateway Repair"]));
  const afterRestore = preflight();
  assert.deepEqual(afterRestore.raw.files.map(file => file.hash), before.raw.files.map(file => file.hash));
  try {
    save("catalog-gateway-apply-result.json", sandbox(["edit", TARGET, "--edits-json", JSON.stringify(payload(before))]));
  } catch (error) {
    save("catalog-gateway-failed-edit-actual-state.json", rawRead());
    throw error;
  }
  console.log("One existing gateway file edited; exact readback/build/status/checkpoint remain required.");
}
if (mode === "verify") {
  const before = JSON.parse(fs.readFileSync(DIR + "catalog-gateway-apply-preflight.json", "utf8"));
  let after = rawRead();
  for (let attempt = 0; after.dirty && attempt < 5; attempt += 1) {
    assert.ok(after.dirty.split("\n").filter(Boolean).every(line => line.endsWith(TARGET)), "Concurrent edits appeared");
    await new Promise(resolve => setTimeout(resolve, 2000));
    after = rawRead();
  }
  assertAfter(after, before);
  save("catalog-gateway-exact-raw-readback.json", after);
  const readback = sandbox(["read", TARGET]);
  save("catalog-gateway-api-readback.json", readback);
  assert.equal(api(readback.files[0].content), api(candidate));
  const code = `const assert=require("assert/strict"),esbuild=require("/app/node_modules/esbuild");
(async()=>{const result=await esbuild.build({
entryPoints:[${JSON.stringify(TARGET)}],bundle:true,platform:"neutral",format:"esm",
packages:"external",external:["npm:*","https://*"],outdir:"/tmp/ccs-catalog-gateway-build",write:false,
metafile:true,logLevel:"silent"});
const inputs=Object.keys(result.metafile.inputs);
for(const file of ${JSON.stringify([TARGET, "base44/shared/signShopSession.ts", "base44/shared/entityRateLimitRetry.ts"])})
assert.ok(inputs.includes(file),"Actual backend dependency missing: "+file);
assert.ok(!inputs.some(file=>/foundationReinforcement|FoundationEstimator/.test(file)));
console.log(JSON.stringify({ok:true,inputs,outputs:result.outputFiles.length,
warnings:result.warnings.map(w=>({text:w.text,file:w.location?.file,line:w.location?.line}))}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});`;
  const buildResult = sandbox(["run", program(code, "compile"), "--timeout-ms", "120000"]);
  save("catalog-gateway-remote-build.json", buildResult);
  assert.equal(buildResult.exitCode, 0);
  const build = JSON.parse(buildResult.stdout);
  assert.equal(build.ok, true);
  const final = rawRead(); assertAfter(final, before);
  save("catalog-gateway-final-scope.json", final);
  const state = ready(); save("catalog-gateway-final-status.json", state);
  save("catalog-gateway-verification.json", {
    ok: true, target: TARGET, sourceHead, verifiedHead: final.head, exactHash: before.expectedHash,
    protectedSourcesUnchanged: guarded, clean: true, remoteDependencyBuild: true,
    offlineRoleAndCASCases: 10, realStorageVerified: false, realAuthenticationVerified: false,
    schemaChanged: false, catalogMetadataActivated: false, reinforcementV2Activated: false,
    warnings: build.warnings,
  });
  console.log("Exact raw/API readback, one-file scope, protected schemas/pricing, actual remote dependency build and ready status verified.");
}
if (mode === "checkpoint") {
  const proof = JSON.parse(fs.readFileSync(DIR + "catalog-gateway-verification.json", "utf8"));
  assert.equal(proof.ok, true);
  const before = JSON.parse(fs.readFileSync(DIR + "catalog-gateway-apply-preflight.json", "utf8"));
  assertAfter(rawRead(), before); ready();
  const checkpoint = sandbox(["checkpoint", "--name", "Foundation Catalog Admin CAS Gateway Verified"]);
  save("catalog-gateway-final-checkpoint.json", checkpoint);
  const after = rawRead(); assertAfter(after, before);
  save("catalog-gateway-after-checkpoint-scope.json", after);
  save("catalog-gateway-after-checkpoint-status.json", ready());
  console.log(JSON.stringify(checkpoint));
}
