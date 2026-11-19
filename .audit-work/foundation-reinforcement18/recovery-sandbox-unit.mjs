import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const candidate = JSON.parse(fs.readFileSync(DIR + "recovery-remote-candidate-source.json", "utf8"));
const mode = process.argv[2];
assert.ok(["dry-run", "apply", "resume", "inspect", "verify-checks", "checkpoint"].includes(mode));
const targets = [...Object.keys(candidate.edits), ...candidate.newFiles];
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const normalized = text => text.replace(/\r\n/g, "\n");
const hash = text => createHash("sha256").update(normalized(text)).digest("hex");
const program = (code, name) => {
  const file = "/tmp/ccs-recovery-" + name + ".cjs";
  return "printf %s " + Buffer.from(code, "utf8").toString("base64") + " | base64 -d > " + file + " && node " + file;
};
function run(args, input) {
  const opts = { timeout: 180000, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 };
  if (input !== undefined) opts.input = input;
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], opts);
  let data;
  try { data = JSON.parse(result.stdout); } catch {
    fs.writeFileSync(DIR + "recovery-sandbox-invalid-response.json", JSON.stringify({
      commandType: args.slice(0, 2), status: result.status, signal: result.signal,
      error: result.error ? { code: result.error.code, message: result.error.message } : null,
      stdout: args[0] === "sandbox" && args[1] === "run" ? result.stdout : null,
      stderr: result.stderr,
    }, null, 2) + "\n");
    throw Error("CLI returned no valid JSON; stop before any retry");
  }
  if (result.status !== 0) {
    const error = Object.assign(Error(data.message || data.error?.message || "Sandbox command failed"), { response: data });
    fs.writeFileSync(DIR + "recovery-sandbox-last-command-error.json", JSON.stringify({ args: args.slice(0, 3), exit: result.status, response: data }, null, 2) + "\n");
    throw error;
  }
  return data;
}
const sandbox = (args, input) => run(["sandbox", ...args, "--app-id", APP, "--branch", "main"], input);
const save = (name, data) => fs.writeFileSync(DIR + name, JSON.stringify(data, null, 2) + "\n");
function appReady() {
  const app = run(["api", "fetch", "GET", "/api/apps/" + APP]);
  assert.equal(app.id, APP); assert.equal(app.status?.state, "ready", "Builder is not ready; do not edit");
  assert.ok(!app.git_repo_pending, "App source is pending; do not edit");
  return { id: app.id, status: app.status, devEnvironmentEnabled: app.dev_environment_enabled, lastGitCommit: app.last_git_commit_hash };
}
function rawFiles(files) {
  const code = `const fs=require("fs"),crypto=require("crypto");console.log(JSON.stringify(${JSON.stringify(files)}.map(p=>{
const s=fs.readFileSync(p,"utf8").split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
return {path:p,length:s.length,hash:crypto.createHash("sha256").update(s).digest("hex"),finalLF:s.endsWith(String.fromCharCode(10))};})));`;
  const result = sandbox(["run", program(code, "raw-readback")]);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout);
}
function preflight({ resume = false } = {}) {
  const status = appReady();
  const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const paths=${JSON.stringify(Object.keys(candidate.edits))};
console.log(JSON.stringify({head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString().trim(),
helperExists:fs.existsSync(${JSON.stringify(candidate.newFiles[0])}),
changedPaths:cp.execSync("git diff --name-only ${candidate.sourceHead} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
files:paths.map(p=>{const s=fs.readFileSync(p,"utf8");return {path:p,crlf:s.includes(String.fromCharCode(13,10)),hash:crypto.createHash("sha256").update(s.split(String.fromCharCode(13,10)).join(String.fromCharCode(10))).digest("hex")};})}));`;
  const result = sandbox(["run", program(code, "preflight")]);
  assert.equal(result.exitCode, 0);
  const state = JSON.parse(result.stdout);
  assert.equal(state.dirty, "", "Concurrent or pending edits; do not write");
  if (resume) {
    assert.equal(state.helperExists, true);
    assert.deepEqual(state.changedPaths, candidate.newFiles, "Only our incomplete helper may differ");
    const restore = JSON.parse(fs.readFileSync(DIR + "recovery-sandbox-restore-checkpoint.json", "utf8"));
    assert.equal(restore.gitCommitHash, candidate.sourceHead);
    const helper = sandbox(["read", candidate.newFiles[0]]).files?.[0];
    const firstLine = candidate.sources[candidate.newFiles[0]].split("\n")[0];
    assert.equal(helper?.path, candidate.newFiles[0]);
    const full = candidate.sources[candidate.newFiles[0]];
    const stored = rawFiles(candidate.newFiles)[0];
    state.helperComplete = stored.hash === hash(full);
    if (!state.helperComplete) {
      assert.equal(helper.content, firstLine, "Incomplete helper changed; do not overwrite concurrent work");
      assert.equal(stored.hash, hash(firstLine));
    }
  } else {
    assert.equal(state.head, candidate.sourceHead, "Remote source drifted; rebuild candidate first");
    assert.equal(state.helperExists, false, "New helper already exists; inspect concurrent work");
  }
  for (const file of state.files) assert.equal(file.hash, candidate.baselineHashes[file.path], "Remote file drift: " + file.path);
  const listing = sandbox(["ls", "src/components/estimator/foundation", "--max-depth", "1"]);
  assert.ok(Array.isArray(listing.entries), "Foundation parent directory must exist");
  save(resume ? "recovery-sandbox-resume-pre-edit.json" : "recovery-sandbox-pre-edit.json", { status, ...state });
  return state;
}
function editsFor(file, state) {
  const crlf = state.files.find(item => item.path === file).crlf;
  const format = text => crlf ? text.replace(/\n/g, "\r\n") : text;
  return candidate.edits[file].map(edit => ({ old_text: format(edit.old_text), new_text: format(edit.new_text), replace_all: false }));
}
function checkRead(file) {
  return rawFiles([file])[0].hash === hash(candidate.sources[file]);
}
function writeOnce(file, operation) {
  try { return operation(); }
  catch (error) {
    // A transport timeout can occur after storage accepted the write.
    if (checkRead(file)) return { file, verifiedAfterTransportError: true };
    throw error;
  }
}
if (mode === "inspect") {
  const files = rawFiles(targets);
  save("recovery-after-helper-raw-readback.json", { files });
  console.log(JSON.stringify(files));
} else if (mode === "dry-run") {
  const state = preflight();
  for (const file of Object.keys(candidate.edits)) {
    const result = sandbox(["edit", file, "--edits-json", JSON.stringify(editsFor(file, state)), "--dry-run"]);
    save("recovery-sandbox-" + (file.includes("/pages/") ? "page" : "service") + "-dry-run.json", result);
    console.log(JSON.stringify(result));
  }
} else if (mode === "apply" || mode === "resume") {
  const state = preflight({ resume: mode === "resume" });
  if (mode === "apply") {
    const restore = sandbox(["checkpoint", "--name", "Restore Before Foundation Saved Sync Recovery"]);
    save("recovery-sandbox-restore-checkpoint.json", restore); console.log("RESTORE", JSON.stringify(restore));
  }
  const results = [];
  for (const file of candidate.newFiles) {
    if (mode === "resume" && state.helperComplete) {
      results.push({ file, alreadyCompleteAndRawHashVerified: true });
      continue;
    }
    if (mode === "resume") {
      const edits = [{ old_text: candidate.sources[file].split("\n")[0], new_text: candidate.sources[file], replace_all: false }];
      const preview = sandbox(["edit", file, "--edits-json", JSON.stringify(edits), "--dry-run"]);
      save("recovery-sandbox-helper-repair-dry-run.json", preview);
      assert.equal(preview.applied, false);
      results.push(writeOnce(file, () => sandbox(["edit", file, "--edits-json", JSON.stringify(edits)])));
    } else results.push(writeOnce(file, () => sandbox(["write", file], candidate.sources[file])));
    assert.ok(checkRead(file), "New helper readback mismatch; stop");
  }
  for (const file of [...Object.keys(candidate.edits)].reverse()) {
    results.push(writeOnce(file, () => sandbox(["edit", file, "--edits-json", JSON.stringify(editsFor(file, state))])));
    assert.ok(checkRead(file), "Edited source readback mismatch; stop");
  }
  save("recovery-sandbox-apply-results.json", { appId: APP, branch: "main", files: targets, results });
  console.log("Three focused files applied and read back exactly; no pricing-engine/schema writes.");
} else {
  const engineFiles = ["src/components/estimator/foundation/foundationCalc.js", "src/components/estimator/builder/partSync.js"];
  const read = sandbox(["read", ...targets, ...engineFiles]);
  for (const file of [...targets, ...engineFiles]) {
    const found = read.files?.find(item => item.path === file);
    assert.equal(typeof found?.content, "string", "Missing readback: " + file);
    assert.equal(normalized(found.content).replace(/\n$/, ""), candidate.sources[file].replace(/\n$/, ""), "Source readback mismatch: " + file);
  }
  for (const file of rawFiles([...targets, ...engineFiles])) {
    assert.equal(file.hash, hash(candidate.sources[file.path]), "Raw source hash mismatch: " + file.path);
  }
  save("recovery-sandbox-final-readback.json", { files: read.files.map(file => ({ path: file.path, exact: true })), reinforcementV2Activated: false });
  const buildCode = `const fs=require("fs"),esbuild=require(require.resolve("esbuild",{paths:[process.cwd()]}));const result=esbuild.buildSync({
entryPoints:["src/pages/FoundationEstimator.jsx"],outfile:"/tmp/ccs-foundation-recovery-verified.js",
bundle:true,platform:"browser",format:"esm",jsx:"automatic",packages:"external",alias:{"@":process.cwd()+"/src"},metafile:true});
for(const p of ${JSON.stringify(targets)})if(!result.metafile.inputs[p])throw Error("Missing actual source "+p);
fs.writeFileSync("/tmp/ccs-foundation-recovery-meta.json",JSON.stringify(result.metafile));
console.log("Actual sandbox Foundation dependency graph compiled; all three repair files included.");`;
  if (mode === "verify-checks") {
    const build = sandbox(["run", program(buildCode, "build"), "--timeout-ms", "120000"]);
    save("recovery-sandbox-build.json", build); assert.equal(build.exitCode, 0, "Remote build failed");
  } else {
    const build = JSON.parse(fs.readFileSync(DIR + "recovery-sandbox-build.json", "utf8"));
    assert.equal(build.exitCode, 0, "Verified remote build evidence is required");
  }
  const inspectCode = `const cp=require("child_process");console.log(JSON.stringify({
head:cp.execSync("git rev-parse HEAD").toString().trim(),dirty:cp.execSync("git status --porcelain").toString().trim(),
paths:cp.execSync("git diff --name-only ${candidate.sourceHead} HEAD").toString().trim().split(String.fromCharCode(10)).filter(Boolean),
stat:cp.execSync("git diff --stat ${candidate.sourceHead} HEAD").toString()}));`;
  const git = sandbox(["run", "sleep 7 && " + program(inspectCode, "scope")]);
  assert.equal(git.exitCode, 0); const scope = JSON.parse(git.stdout);
  assert.equal(scope.dirty, "", "Changes still saving or concurrent work present");
  assert.deepEqual([...scope.paths].sort(), [...targets].sort(), "Remote changed-file scope mismatch");
  save("recovery-sandbox-final-scope.json", scope);
  save("recovery-sandbox-final-status.json", appReady());
  if (mode === "checkpoint") {
    const checkpoint = sandbox(["checkpoint", "--name", "Foundation Saved Sync Recovery Verified"]);
    save("recovery-sandbox-final-checkpoint.json", checkpoint);
    console.log("VERIFIED", JSON.stringify({ appId: APP, branch: "main", scope, checkpoint, reinforcementV2Activated: false }));
  } else console.log("Checks complete; no final checkpoint created.", JSON.stringify(scope));
}
