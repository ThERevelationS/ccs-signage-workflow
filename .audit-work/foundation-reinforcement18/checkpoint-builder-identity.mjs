import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DIR = ".audit-work/foundation-reinforcement18/";
const FILE = "src/components/estimator/builder/builderService.js";
const FLAGS = ["--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json"];
const CLI = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const BEFORE_HEAD = "4899e67917b06e29bddf69a5db825f45fca72718";
const normalize = value => value.replace(/\r\n/g, "\n");
const before = normalize(fs.readFileSync(DIR + "builder-identity-beforeRemote-builderService.js", "utf8"));
const pairs = [
  [`  const currentLine = (estimate.line_items || []).find(
    (item) => item.builder_product_id === line.builder_product_id || item.project_id === line.project_id
  ) || line;`,
  `  // Source-only hints omit the Builder ID; two absent IDs are not an identity.
  const currentLine = (estimate.line_items || []).find(
    (item) => item.module_key === line.module_key && (
      (line.builder_product_id && item.builder_product_id === line.builder_product_id)
      || (line.project_id && item.project_id === line.project_id)
    )
  ) || line;`],
  [`  const builder = ensured.builderProduct;
  if (builder && !ensured.partSyncInputs) {`,
  `  const builder = ensured.builderProduct;
  const matchesCurrentLine = (item) => item.module_key === currentLine.module_key && (
    (builder?.id && item.builder_product_id === builder.id)
    || (currentLine.project_id && item.project_id === currentLine.project_id)
  );
  if (builder && !ensured.partSyncInputs) {`],
  [`      const preMarkerLine = (preMarkerEstimate.line_items || []).find((item) =>
        item.builder_product_id === builder.id || (currentLine.project_id && item.project_id === currentLine.project_id)
      );`,
  `      const preMarkerLine = (preMarkerEstimate.line_items || []).find(matchesCurrentLine);`],
  [`      const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);`,
  `      const markedLine = (markedEstimate?.line_items || []).find(matchesCurrentLine);`],
  [`    if (item.project_id !== currentLine.project_id && item.builder_product_id !== builder?.id) return item;`,
  `    if (!matchesCurrentLine(item)) return item;`],
  [`  return savedLines.find((item) => item.project_id === currentLine.project_id) || currentLine;`,
  `  return savedLines.find(matchesCurrentLine) || currentLine;`],
];
let expected = before;
for (const [oldText, newText] of pairs) {
  assert.equal(expected.split(oldText).length, 2, "Every intended edit must match exactly once");
  expected = expected.replace(oldText, newText);
}
assert.equal(normalize(fs.readFileSync(FILE, "utf8")), expected, "Local source changed beyond the reviewed six text edits");
function call(args, evidence) {
  const result = spawnSync(process.execPath, [CLI, "base44@latest", ...args, ...FLAGS], {
    timeout: 120000, encoding: "buffer", maxBuffer: 3 * 1024 * 1024,
  });
  fs.writeFileSync(DIR + evidence + ".json", result.stdout || Buffer.alloc(0), { flag: "wx" });
  fs.writeFileSync(DIR + evidence + ".stderr.txt", result.stderr || Buffer.alloc(0), { flag: "wx" });
  assert.equal(result.status, 0, `${evidence} failed; inspect current source before retrying any write`);
  return JSON.parse(result.stdout.toString("utf8"));
}
function read(evidence) {
  const result = call(["sandbox", "read", FILE], evidence);
  assert.equal(result.files.length, 1); assert.equal(result.files[0].path, FILE);
  assert.ok(!result.files[0].error && !result.files[0].truncated);
  return normalize(result.files[0].content);
}
function cleanHead(evidence, requiredHead) {
  const result = call(["sandbox", "run", "GIT_OPTIONAL_LOCKS=0 git status --porcelain=v1 && git rev-parse HEAD", "--timeout-ms", "30000"], evidence);
  assert.equal(result.exitCode, 0); assert.equal(result.truncated, false);
  assert.match(result.stdout.trim(), /^[a-f0-9]{40}$/, "Remote pending changes: stop without editing");
  if (requiredHead) assert.equal(result.stdout.trim(), requiredHead, "Remote HEAD changed: reconcile before editing");
  return result.stdout.trim();
}
const edits = pairs.map(([old_text, new_text]) => ({ old_text, new_text, replace_all: false }));
if (process.argv.includes("--apply")) {
  cleanHead("builder-identity-apply-preflight-git", BEFORE_HEAD);
  assert.equal(read("builder-identity-apply-preflight-source"), before);
  console.log(JSON.stringify(call(["sandbox", "checkpoint", "--name", "Restore Before Foundation Builder Line Identity Guard"], "builder-identity-restore-checkpoint")));
  cleanHead("builder-identity-after-restore-git", BEFORE_HEAD);
  assert.equal(read("builder-identity-after-restore-source"), before);
  console.log(JSON.stringify(call(["sandbox", "edit", FILE, "--edits-json", JSON.stringify(edits)], "builder-identity-remote-edit")));
  assert.equal(read("builder-identity-edited-readback"), expected);
  console.log("Only the reviewed Builder identity edits read back exactly; remote build and final checkpoint pending.");
} else if (process.argv.includes("--finalize")) {
  const verified = JSON.parse(fs.readFileSync(DIR + "builder-identity-postbuild-git.json", "utf8"));
  assert.equal(verified.exitCode, 0); assert.equal(verified.truncated, false);
  const head = verified.stdout.trim();
  assert.match(head, /^[a-f0-9]{40}$/);
  cleanHead("builder-identity-final-preflight-git", head);
  assert.equal(read("builder-identity-final-preflight-source"), expected);
  const checkpoint = call(["sandbox", "checkpoint", "--name", "Foundation Builder Line Identity Guard Verified"], "builder-identity-verified-checkpoint");
  assert.equal(checkpoint.gitCommitHash, head);
  assert.equal(read("builder-identity-final-readback"), expected);
  cleanHead("builder-identity-final-after-git", head);
  console.log(JSON.stringify(checkpoint));
} else {
  cleanHead("builder-identity-dry-preflight-git", BEFORE_HEAD);
  assert.equal(read("builder-identity-dry-preflight-source"), before);
  fs.writeFileSync(DIR + "builder-identity-expected-remote-builderService.js", expected, { flag: "wx" });
  console.log(JSON.stringify(call(["sandbox", "edit", FILE, "--edits-json", JSON.stringify(edits), "--dry-run"], "builder-identity-dry-run")));
}
