const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const latest = require("../foundation-equipment13/remote-sync/latest-cli.cjs");

const APP = "68dfcc5e57bbbc35387da97c";
const OUT = ".audit-work/foundation-materials14";
// Optional schema, compatible displays, fail-closed guard, then calculator and page.
const paths = [
  "base44/entities/FoundationProject.jsonc",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/pages/FoundationEstimator.jsx",
];
const load = file => JSON.parse(fs.readFileSync(file, "utf8"));
const persist = (name, data) => fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
const lf = text => text.replace(/\r\n?/g, "\n");
const same = (a, b) => a === b || a + "\n" === b || b + "\n" === a;
const sha = text => crypto.createHash("sha256").update(text).digest("hex");
const baseline = new Map(["fresh-baselines", "ui-baselines"].flatMap(name => load(`${OUT}/${name}.json`).files)
  .map(row => [row.path, row.content]));
const desired = new Map(paths.map(file => {
  const text = fs.readFileSync(file, "utf8");
  const canon = (t) => JSON.stringify(JSON.parse(t), null, 2).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
  return [file, file.endsWith(".jsonc") ? canon(text) : lf(text)];
}));
const journal = fs.existsSync(`${OUT}/activation-journal.json`) ? load(`${OUT}/activation-journal.json`) : [];
const record = entry => {
  journal.push({ at: new Date().toISOString(), ...entry });
  persist("activation-journal", journal);
};
const RESUME = process.argv.includes('--resume');
const firstStart = (journal.find(e => e.event === 'preflight_verified' && e.start)?.start) || null;
const cli = (args, input) => JSON.parse(latest([...args, "--app-id", APP, "--json"], input));
const sandbox = (args, input) => cli(["sandbox", ...args, "--branch", "main"], input);
const command = (text, name) => {
  const result = sandbox(["run", text, "--timeout-ms", "120000"]);
  persist(name, result);
  assert.equal(result.exitCode, 0, `Remote verification failed: ${name}`);
  assert.equal(result.truncated, false, `Truncated evidence: ${name}`);
  return result.stdout.trim();
};
const ready = name => {
  const app = cli(["api", "fetch", "GET", `/api/apps/${APP}`]);
  persist(`app-status-${name}`, { appId: app.id, state: app.status?.state });
  assert.equal(app.id, APP);
  assert.equal(app.status?.state, "ready", "App is busy; do not write concurrently.");
};
const readback = file => {
  const result = sandbox(["read", file]);
  persist(`readback-${file.split("/").at(-1)}`, result);
  const row = result.files?.find(row => row.path === file);
  assert.equal(typeof row?.content, "string", `Missing readback: ${file}`);
  assert.ok(same(lf(row.content), desired.get(file)), `Readback differs: ${file}`);
  record({ event: "readback_verified", file, remoteLfHash: sha(lf(row.content)), desiredLfHash: sha(desired.get(file)) });
};

async function main() {
  ready("preflight");
  assert.equal(command("git status --porcelain", "remote-git-before"), "", "Remote edits are in progress.");
  const start = command("git rev-parse HEAD", "remote-head-before");
  assert.match(start, /^[a-f0-9]{40}$/);
  const fresh = sandbox(["read", ...paths]);
  persist("fresh-activation-before", fresh);
  assert.equal(fresh.files?.length, paths.length);
  for (const file of paths) {
    const row = fresh.files.find(row => row.path === file);
    assert.equal(typeof row?.content, "string", file);
    if (RESUME && file === paths[0]) {
      assert.ok(same(lf(row.content), desired.get(file)), `Resume schema text differs: ${file}`);
      assert.deepEqual(JSON.parse(row.content), JSON.parse(fs.readFileSync(file, 'utf8')), `Resume schema differs: ${file}`);
    } else {
      assert.ok(same(lf(row.content), lf(baseline.get(file))), `Concurrent source drift: ${file}`);
    }
  }
  record({ event: "preflight_verified", appId: APP, branch: "main", sourceFiles: paths.length, start });
  if (!process.argv.includes("--apply")) {
    console.log("Read-only preflight passed; no source or schema changes.");
    return;
  }
  const approval = load(`${OUT}/lead-approval.json`);
  assert.equal(approval.appId, APP);
  assert.equal(approval.branch, "main");
  assert.equal(approval.verdict, "accepted");
  for (const file of paths) assert.equal(sha(fs.readFileSync(file)), approval.files[file], `Unreviewed changes: ${file}`);
  for (const [file, expected] of Object.entries(load(`${OUT}/financial-core-hashes.json`))) {
    assert.equal(sha(fs.readFileSync(file)), expected, `Financial source changed: ${file}`);
  }
  if (RESUME) assert.match(firstStart || '', /^[a-f0-9]{40}$/, 'Missing original activation provenance');
  const restore = sandbox(["checkpoint", "--name", "Concrete-pre-material-binding-and-delivery-snapshot-guard"]);
  persist("material-checkpoint-before", restore);
  record({ event: "restore_checkpoint", checkpoint: restore });
  const edits = new Map();
  for (const file of paths) {
    const remoteRow = fresh.files.find(row => row.path === file);
    if (RESUME && file.endsWith(".jsonc")) {
      // Schema may already hold the canonical desired text — verify + skip its edit.
      assert.ok(same(lf(remoteRow.content), desired.get(file)), `resume schema textual mismatch: ${file}`);
      assert.deepEqual(JSON.parse(remoteRow.content), JSON.parse(fs.readFileSync(file, 'utf8')), `resume schema semantic: ${file}`);
      record({ event: 'already_verified_schema', file });
      continue;
    }
    if (RESUME) assert.ok(same(lf(remoteRow.content), lf(baseline.get(file))), `resume baseline drift: ${file}`);
    let original = remoteRow.content;
    const payload = () => JSON.stringify([{ old_text: original, new_text: desired.get(file), replace_all: false }]);
    let diff;
    try { diff = sandbox(["edit", file, "--dry-run"], payload()); }
    catch (error) {
      if (!/old_text not found|EDIT_TEXT_NOT_FOUND/i.test(String(error) + String(error.stdout || ""))) throw error;
      original = lf(original).replace(/\n/g, "\r\n");
      diff = sandbox(["edit", file, "--dry-run"], payload());
    }
    assert.ok(!diff.error, `Dry-run failed: ${file}`);
    persist(`dryrun-${file.split("/").at(-1)}`, diff);
    edits.set(file, payload());
  }
  record({ event: "all_edit_previews_saved", files: paths });
  // A separate --write gate lets the lead inspect every CLI preview before mutation.
  if (!process.argv.includes("--write")) {
    console.log("Restore checkpoint and eight edit previews saved; no source/schema writes.");
    return;
  }
  ready("before-writes");
  for (const file of paths) {
    if (RESUME && file.endsWith('.jsonc')) { readback(file); continue; }
    try { record({ event: "edit_response", file, result: sandbox(["edit", file], edits.get(file)) }); }
    catch (error) {
      record({ event: "edit_response_uncertain", file, error: String(error), stdout: String(error.stdout || "") });
    }
    // Never repeat an uncertain write; exact readback must prove what landed.
    readback(file);
  }
  command("./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-materials14.js --metafile=/tmp/ccs-foundation-materials14-meta.json", "remote-material-build");
  await new Promise(resolve => setTimeout(resolve, 6000));
  assert.equal(command("git status --porcelain", "remote-git-after"), "", "Auto-commit or another edit is pending.");
  const changed = command(`git diff --name-only ${RESUME && firstStart ? firstStart : start} HEAD`, "remote-changed-paths").split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.sort(), [...paths].sort(), "Concurrent files changed outside this unit.");
  const head = command("git rev-parse HEAD", "remote-head-after");
  ready("verified");
  const checkpoint = sandbox(["checkpoint", "--name", "Concrete-material-bindings-saved-delivery-and-handoff-guard-verified"]);
  persist("material-checkpoint-after", checkpoint);
  ready("checkpointed");
  record({ event: "verified_checkpoint", checkpoint, head, files: paths });
  console.log(JSON.stringify({ appId: APP, branch: "main", files: paths, head, checkpoint }, null, 2));
}

main().catch(error => {
  record({ event: "STOP", error: String(error), stdout: String(error.stdout || "") });
  console.error(error);
  process.exitCode = 1;
});
