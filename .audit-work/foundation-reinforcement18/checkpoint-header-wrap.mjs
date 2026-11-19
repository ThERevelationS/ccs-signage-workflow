import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DIR = ".audit-work/foundation-reinforcement18/";
const FILE = "src/components/estimator/foundation/FoundationItemCard.jsx";
const ID = "68dfcc5e57bbbc35387da97c";
const FLAGS = ["--app-id", ID, "--branch", "main", "--json"];
const CLI = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const HEAD = process.argv.includes("--finalize")
  ? "4899e67917b06e29bddf69a5db825f45fca72718" : "b18e63d4493e188488ccc4db5d2b9ae38edf7792";
const before = JSON.parse(fs.readFileSync(DIR + "header-wrap-remote-before.json", "utf8")).files[0].content;
const oldText = 'className="flex items-start justify-between gap-3 mb-3"';
const newText = 'className="flex flex-wrap items-start justify-between gap-3 mb-3"';
assert.equal(before.split(oldText).length, 2);
const expected = before.replace(oldText, newText);
const normalize = value => value.replace(/\r\n/g, "\n");
function call(args, evidence, sandbox = true) {
  const result = spawnSync(process.execPath, [CLI, "base44@latest", ...args, ...(sandbox ? FLAGS : [])], {
    timeout: 120000, encoding: "buffer", maxBuffer: 3 * 1024 * 1024,
  });
  fs.writeFileSync(DIR + evidence + ".json", result.stdout || Buffer.alloc(0));
  fs.writeFileSync(DIR + evidence + ".stderr.txt", result.stderr || Buffer.alloc(0));
  assert.equal(result.status, 0, `${evidence} failed; inspect readback before retrying any write.`);
  return JSON.parse(result.stdout.toString("utf8"));
}
function read(evidence) {
  const result = call(["sandbox", "read", FILE], evidence);
  assert.equal(result.files.length, 1);
  const file = result.files[0];
  assert.ok(!file.error && !file.truncated);
  return file.content;
}
function cleanHead(evidence) {
  const result = call(["sandbox", "run", "git status --porcelain=v1 && git rev-parse HEAD", "--timeout-ms", "30000"], evidence);
  assert.equal(result.exitCode, 0); assert.equal(result.truncated, false);
  assert.equal(result.stdout.trim(), HEAD, "Remote worktree or HEAD changed: stop without editing.");
}
if (process.argv.includes("--finalize")) {
  cleanHead("header-wrap-final-checkpoint-before-git");
  assert.equal(normalize(read("header-wrap-final-checkpoint-before-source")), normalize(expected));
  const checkpoint = call(["sandbox", "checkpoint", "--name", "Foundation Mobile Header Wrap Verified"], "header-wrap-verified-checkpoint");
  assert.equal(checkpoint.gitCommitHash, HEAD);
  assert.equal(normalize(read("header-wrap-final-checkpoint-readback")), normalize(expected));
  cleanHead("header-wrap-final-checkpoint-after-git");
  console.log(JSON.stringify(checkpoint, null, 2));
} else if (!process.argv.includes("--apply")) {
  cleanHead("header-wrap-remote-dry-preflight");
  assert.equal(normalize(read("header-wrap-remote-dry-source")), normalize(before));
  fs.writeFileSync(DIR + "header-wrap-expected-remote-FoundationItemCard.jsx", expected);
  const result = call(["sandbox", "edit", FILE, "--edits-json", JSON.stringify([
    { old_text: oldText, new_text: newText, replace_all: false },
  ]), "--dry-run"], "header-wrap-remote-dry-run");
  console.log(JSON.stringify(result, null, 2));
} else {
  cleanHead("header-wrap-remote-apply-preflight");
  assert.equal(normalize(read("header-wrap-remote-apply-source")), normalize(before));
  console.log(JSON.stringify(call(["sandbox", "checkpoint", "--name", "Restore Before Foundation Mobile Header Wrap"], "header-wrap-restore-checkpoint")));
  cleanHead("header-wrap-remote-after-restore-git");
  assert.equal(normalize(read("header-wrap-remote-after-restore-source")), normalize(before));
  console.log(JSON.stringify(call(["sandbox", "edit", FILE, "--edits-json", JSON.stringify([
    { old_text: oldText, new_text: newText, replace_all: false },
  ])], "header-wrap-remote-edit")));
  assert.equal(normalize(read("header-wrap-remote-edited-readback")), normalize(expected));
  console.log("Exact single-class readback verified. Remote dependency build and final checkpoint are still pending.");
}
