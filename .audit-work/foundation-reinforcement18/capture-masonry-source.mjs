import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const dir = ".audit-work/foundation-reinforcement18/";
const spec = JSON.parse(fs.readFileSync(dir + "masonry-material-transport-spec.json", "utf8"));
const output = dir + spec.baselineFile;
assert.ok(!fs.existsSync(output), "Baseline already captured; do not replace its source of truth.");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
function command(args) {
  const result = spawnSync(process.execPath, [cli, "base44@latest", ...args, "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function status() {
  const s = command(["api", "fetch", "GET", "/api/apps/" + spec.appId]);
  assert.equal(s.id, spec.appId);
  assert.equal(s.status?.state, "ready");
  assert.ok(!s.git_repo_pending);
  assert.equal(s.dev_environment_enabled, false);
  return { id: s.id, status: s.status, pending: s.git_repo_pending, testDataEnabled: s.dev_environment_enabled };
}
const before = status();
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${spec.sourceHead} HEAD").toString().trim().split("\\n").filter(Boolean),
files:${JSON.stringify([...spec.targetOrder, ...spec.protectedFiles])}.map(path=>{
const buf=fs.readFileSync(path),text=buf.toString("utf8");
const file={path,exists:true,normalized:text.replace(/\\r\\n/g,"\\n"),
hash:crypto.createHash("sha256").update(buf).digest("hex")};
if(${JSON.stringify(spec.targetOrder)}.includes(path)){file.text=text;file.base64=buf.toString("base64");}
return file;})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`;
const script = `p=$(mktemp /tmp/ccs-masonry-material-baseline-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const response = command(["sandbox", "run", script, "--timeout-ms", "120000", "--app-id", spec.appId, "--branch", spec.branch]);
assert.equal(response.exitCode, 0);
const snapshot = JSON.parse(response.stdout);
assert.equal(snapshot.head, spec.sourceHead);
assert.equal(snapshot.headAfter, snapshot.head);
assert.equal(snapshot.dirty, "");
assert.equal(snapshot.dirtyAfter, "");
assert.deepEqual(snapshot.changed, []);
assert.equal(snapshot.files.length, 21);
const old = JSON.parse(fs.readFileSync(dir + "wall-cap-geometry-sandbox-final-scope.json", "utf8"));
const physical = JSON.parse(fs.readFileSync(dir + "wall-cap-physical-source.json", "utf8"));
const apiView = raw => raw.replace(/\r\n/g, "\n").replace(/\n$/, "");
for (const file of snapshot.files) {
  const prior = old.files.find(f => f.path === file.path);
  if (prior) assert.equal(file.hash, prior.hash, "unexpected drift " + file.path);
  else {
    const priorApi = physical.files.find(f => f.path === file.path);
    assert.ok(priorApi, "unknown baseline source " + file.path);
    assert.equal(apiView(file.text), priorApi.content.replace(/\r\n/g, "\n"), file.path);
  }
  if (spec.targetOrder.includes(file.path)) {
    assert.equal(Buffer.from(file.text).toString("base64"), file.base64, "raw UTF8 roundtrip " + file.path);
    assert.equal(createHash("sha256").update(Buffer.from(file.base64, "base64")).digest("hex"), file.hash);
  }
}
const after = status();
fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + "\n");
fs.writeFileSync(dir + "masonry-material-baseline-status.json", JSON.stringify({ before, after }, null, 2));
console.log(`Captured ${snapshot.files.length} exact source records at ${snapshot.head}; clean, ready, test data disabled.`);
