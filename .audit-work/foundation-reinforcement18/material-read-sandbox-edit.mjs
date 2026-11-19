import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = "68dfcc5e57bbbc35387da97c";
const BRANCH = "main";
const HEAD = "119b00d5dd943c348b89f53697b613fa16dea0d9";
const FILE = "src/components/estimator/estimateConversionService.js";
const DIR = ".audit-work/foundation-reinforcement18/";
const BEFORE = DIR + "estimateConversionService-before-material-read-guard.js";
const NPX = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
assert.ok(fs.existsSync(NPX), "The existing Node installation must provide npx-cli.js.");
const normalize = text => text.replace(/\r\n/g, "\n");
const stage = process.argv[2];
assert.ok(["dry-run", "apply", "restore-checkpoint", "verified-checkpoint"].includes(stage));
const cli = (args, name, input) => {
  const result = spawnSync(process.execPath,
    [NPX, "base44@latest", "sandbox", ...args, "--app-id", APP, "--branch", BRANCH, "--json"],
    { input, encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 120000 });
  fs.writeFileSync(DIR + name + ".json", result.stdout || Buffer.alloc(0));
  fs.writeFileSync(DIR + name + ".stderr.txt", result.stderr || Buffer.alloc(0));
  assert.equal(result.status, 0, `${name} did not return success; inspect the captured response before any retry.`);
  return JSON.parse(result.stdout.toString("utf8"));
};
const before = normalize(fs.readFileSync(BEFORE, "utf8"));
const after = normalize(fs.readFileSync(FILE, "utf8"));
assert.notEqual(before, after, "The reviewed local repair must be present.");
const inspect = "git status --porcelain=v1 && git rev-parse HEAD" +
  (stage === "verified-checkpoint" ? ` && git diff --name-only ${HEAD} HEAD` : "");
const meta = cli(["run", inspect],
  "material-read-" + stage + "-git");
assert.equal(meta.exitCode, 0);
assert.equal(meta.truncated, false);
const lines = meta.stdout.trim().split(/\r?\n/);
if (stage !== "verified-checkpoint") {
  assert.deepEqual(lines, [HEAD], "Remote worktree/HEAD changed; stop for a new concurrency review.");
} else {
  assert.equal(lines.length, 2, "Remote changes are pending or other files changed; do not checkpoint.");
  assert.match(lines[0], /^[0-9a-f]{40}$/);
  assert.equal(lines[1], FILE, "Another sandbox writer changed files; do not checkpoint this unit.");
}
const read = cli(["read", FILE], "material-read-" + stage + "-source");
assert.equal(read.files.length, 1);
assert.equal(read.files[0].path, FILE);
assert.equal(read.files[0].truncated, false);
assert.equal(normalize(read.files[0].content), stage === "verified-checkpoint" ? after : before,
  "Remote source differs from the reviewed baseline; no edit/checkpoint is allowed.");
if (stage === "restore-checkpoint" || stage === "verified-checkpoint") {
  const name = stage === "restore-checkpoint"
    ? "Before estimator material-read safeguards"
    : "Estimator materials fail-closed pagination verified";
  const result = cli(["checkpoint", "--name", name], "material-read-" + stage);
  console.log(JSON.stringify(result));
} else {
  // The complete old text acts as a file-level CAS; the resulting diff is only the reviewed four hunks.
  const edits = [{ old_text: before, new_text: after }];
  fs.writeFileSync(DIR + "material-read-edit-payload.json", JSON.stringify(edits) + "\n");
  const args = ["edit", FILE, ...(stage === "dry-run" ? ["--dry-run"] : [])];
  const result = cli(args, "material-read-" + stage, Buffer.from(JSON.stringify(edits), "utf8"));
  console.log(JSON.stringify(result));
}
