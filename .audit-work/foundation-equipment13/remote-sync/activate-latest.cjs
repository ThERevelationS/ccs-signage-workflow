const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const latest = require("./latest-cli.cjs");

const APP = "68dfcc5e57bbbc35387da97c";
const ROOT = ".audit-work/foundation-equipment13";
const OUT = `${ROOT}/remote-sync`;
// Install the reference guard before the calculator changes, keeping partial work fail-closed.
const paths = [
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
  "src/pages/FoundationEstimator.jsx",
];
const helper = paths[0];
const lf = value => value.replace(/\r\n?/g, "\n");
const same = (a, b) => a === b || `${a}\n` === b || a === `${b}\n`;
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const load = name => JSON.parse(fs.readFileSync(name, "utf8"));
const save = (name, value) => fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(value, null, 2));
const expected = new Map();
for (const row of load(`${ROOT}/baselines.json`).files) expected.set(row.path, row.content);
for (const [path, content] of Object.entries(load(`${ROOT}/engine-source-before.json`))) expected.set(path, content);
for (const row of load(`${ROOT}/extra-baselines-utf8.json`).files) {
  if (typeof row.content === "string") expected.set(row.path, row.content);
}
const desired = new Map(paths.map(path => [path, lf(fs.readFileSync(path, "utf8"))]));
const journal = [];
const record = value => {
  journal.push({ at: new Date().toISOString(), ...value });
  save("activation-journal-node", journal);
};
const cli = (args, input) => JSON.parse(latest([...args, "--app-id", APP, "--json"], input));
const sandbox = (args, input) => cli(["sandbox", ...args, "--branch", "main"], input);
const run = (command, name) => {
  const result = sandbox(["run", command, "--timeout-ms", "120000"]);
  save(name, result);
  assert.equal(result.exitCode, 0, `Remote command failed: ${name}`);
  assert.equal(result.truncated, false, `Truncated remote command: ${name}`);
  return result;
};
const ready = phase => {
  // App metadata only, never business records. Persist only these non-secret fields.
  const app = cli(["api", "fetch", "GET", `/api/apps/${APP}`]);
  save(`app-status-${phase}`, { appId: app.id, state: app.status?.state });
  assert.equal(app.id, APP);
  assert.equal(app.status?.state, "ready", "Another writer/build is active; stop before mutating.");
};
const readback = path => {
  const row = sandbox(["read", path]).files?.[0];
  assert.equal(row?.path, path);
  assert.equal(typeof row.content, "string", `Readback failed: ${path}`);
  assert.ok(same(lf(row.content), desired.get(path)), `Readback differs: ${path}`);
  record({ event: "readback_verified", path, remoteLfSha: sha(lf(row.content)), desiredLfSha: sha(desired.get(path)) });
};

async function main() {
  ready("preflight");
  assert.equal(run("git status --porcelain", "git-before").stdout.trim(), "", "Remote worktree must be clean.");
  const start = run("git rev-parse HEAD", "git-start").stdout.trim();
  assert.match(start, /^[a-f0-9]{40}$/);
  const fresh = sandbox(["read", ...paths]);
  save("fresh-before-node", fresh);
  assert.equal(fresh.files?.length, paths.length);
  const rows = new Map(fresh.files.map(row => [row.path, row]));
  for (const path of paths) {
    const row = rows.get(path);
    if (path === helper) {
      assert.equal(row?.error?.code, "NOT_FOUND", "New helper already exists: reconcile concurrent work.");
    } else {
      assert.equal(typeof row?.content, "string", path);
      assert.equal(typeof expected.get(path), "string", path);
      assert.ok(same(lf(row.content), lf(expected.get(path))), `Foreign drift: ${path}`);
    }
  }
  record({ event: "fresh_baselines_verified", existing: 4, helper: "NOT_FOUND", startCommit: start });
  if (!process.argv.includes("--apply")) {
    console.log("Latest CLI read-only preflight passed: app ready, clean remote, four matching baselines, helper NOT_FOUND.");
    return;
  }

  const approval = load(`${OUT}/lead-approval.json`);
  assert.equal(approval.appId, APP);
  assert.equal(approval.branch, "main");
  assert.equal(approval.verdict, "accepted");
  for (const path of paths) assert.equal(approval.files[path], sha(fs.readFileSync(path)), `Unreviewed local changes: ${path}`);
  const before = sandbox(["checkpoint", "--name", "Concrete-pre-equipment-parity-snapshot-guard"]);
  save("checkpoint-before", before);
  record({ event: "restore_checkpoint_created", checkpoint: before });

  const edits = new Map();
  for (const path of paths.filter(path => path !== helper)) {
    const payload = old => JSON.stringify([{ old_text: old, new_text: desired.get(path), replace_all: false }]);
    let old = rows.get(path).content;
    let diff;
    try { diff = sandbox(["edit", path, "--dry-run"], payload(old)); }
    catch (error) {
      const details = String(error) + String(error.stdout || "");
      if (!/old_text not found|EDIT_TEXT_NOT_FOUND/i.test(details)) throw error;
      old = lf(old).replace(/\n/g, "\r\n");
      diff = sandbox(["edit", path, "--dry-run"], payload(old));
    }
    edits.set(path, payload(old));
    save(`dryrun-${path.split("/").at(-1)}`, diff);
  }
  ready("before-writes");
  for (const path of paths) {
    try {
      const reply = path === helper
        ? sandbox(["write", path], desired.get(path))
        : sandbox(["edit", path], edits.get(path));
      record({ event: "mutation_response", path, reply });
    } catch (error) {
      record({ event: "mutation_uncertain", path, error: String(error), stdout: String(error.stdout || "") });
      readback(path); // A failed reply never justifies blindly repeating a mutation.
      continue;
    }
    readback(path);
  }
  run("./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-equipment13.js --metafile=/tmp/ccs-foundation-equipment13-meta.json", "remote-build");
  await new Promise(resolve => setTimeout(resolve, 6000));
  assert.equal(run("git status --porcelain", "git-verified").stdout.trim(), "", "Auto-commit pending or concurrent writer.");
  const changed = run(`git diff --name-only ${start} HEAD`, "git-changed").stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual([...changed].sort(), [...paths].sort(), "Unexpected concurrent changes outside the five-file unit.");
  const head = run("git rev-parse HEAD", "git-final-head").stdout.trim();
  assert.match(head, /^[a-f0-9]{40}$/);
  ready("verified");
  const after = sandbox(["checkpoint", "--name", "Concrete-equipment-parity-snapshots-handoff-guard-verified"]);
  save("checkpoint-after", after);
  ready("checkpointed");
  record({ event: "verified_checkpoint_created", checkpoint: after, commit: head });
  console.log(JSON.stringify({ appId: APP, branch: "main", sourceFiles: paths.length, commit: head, checkpoint: after }, null, 2));
}
main().catch(error => {
  record({ event: "STOP", error: String(error), stdout: String(error.stdout || "") });
  console.error(error);
  process.exitCode = 1;
});
