const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const APP = "68dfcc5e57bbbc35387da97c";
const ROOT = ".audit-work/foundation-catalog-pricing11";
const OUT = `${ROOT}/remote-sync`;
// Direct CLI entry avoids the documented Windows sandbox-run quoting failure.
const CLI = "C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/6b34a5aeb6ed42d9/node_modules/base44/bin/run.js";
const HELPER = "src/components/estimator/foundation/foundationCatalogIntegrity.js";
const CALC = "src/components/estimator/foundation/foundationCalc.js";
const PAGE = "src/pages/FoundationEstimator.jsx";
const baseline = JSON.parse(fs.readFileSync(`${ROOT}/baselines.json`, "utf8")).files;
const paths = [HELPER, CALC, PAGE, ...baseline.map(f => f.path).filter(p => p !== CALC && p !== PAGE)];
const lf = s => s.replace(/\r\n?/g, "\n");
const equivalent = (a, b) => a === b || a === `${b}\n` || `${a}\n` === b;
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const journal = [];
const record = value => {
  journal.push({ at: new Date().toISOString(), ...value });
  fs.writeFileSync(`${OUT}/activation-journal.json`, JSON.stringify(journal, null, 2));
};
const cli = (args, input) => {
  const raw = execFileSync(process.execPath, [CLI, ...args, "--app-id", APP, "--json"], {
    input, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
};
const sandbox = (args, input) => cli(["sandbox", ...args, "--branch", "main"], input);
const run = command => {
  const result = sandbox(["run", command, "--timeout-ms", "120000"]);
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(result.truncated, false);
  return result;
};
const appReady = phase => {
  const app = cli(["api", "fetch", "GET", `/api/apps/${APP}`]);
  const evidence = { at: new Date().toISOString(), appId: app.id, status: app.status };
  fs.writeFileSync(`${OUT}/app-status-${phase}.json`, JSON.stringify(evidence, null, 2));
  assert.equal(app.id, APP);
  assert.equal(app.status?.state, "ready", "Builder/app must be ready; no mutation while busy.");
};
const readAll = () => {
  const result = sandbox(["read", ...paths]);
  assert.equal(result.files?.length, paths.length);
  return new Map(result.files.map(f => [f.path, f]));
};
const desired = new Map(paths.map(p => [p, lf(fs.readFileSync(p, "utf8"))]));
const readback = path => {
  const row = sandbox(["read", path]).files?.[0];
  assert.equal(typeof row?.content, "string", `Readback failed: ${path}`);
  assert.ok(equivalent(lf(row.content), desired.get(path)), `Readback differs: ${path}`);
  record({ event: "readback_verified", path, remoteLfSha: sha(lf(row.content)), localLfSha: sha(desired.get(path)) });
};

async function main() {
  appReady("preflight");
  const git = run("git status --porcelain");
  assert.equal(git.stdout.trim(), "", "Remote worktree is not clean.");
  const fresh = readAll();
  fs.writeFileSync(`${OUT}/fresh-before.json`, JSON.stringify([...fresh.values()], null, 2));
  for (const old of baseline) {
    const row = fresh.get(old.path);
    assert.equal(typeof row?.content, "string", old.path);
    assert.ok(equivalent(lf(row.content), lf(old.content)), `Foreign drift: ${old.path}`);
  }
  assert.equal(fresh.get(HELPER)?.error?.code, "NOT_FOUND", "New helper must explicitly be NOT_FOUND.");
  record({ event: "fresh_baselines_verified", existing: baseline.length, helper: "NOT_FOUND" });
  if (!process.argv.includes("--apply")) {
    console.log("Read-only preflight passed. No writes or checkpoints.");
    return;
  }
  const approval = JSON.parse(fs.readFileSync(`${OUT}/lead-approval.json`, "utf8"));
  assert.equal(approval.appId, APP);
  assert.equal(approval.branch, "main");
  assert.equal(approval.verdict, "accepted");
  for (const path of paths) assert.equal(approval.files[path], sha(fs.readFileSync(path)), `Unreviewed local edit: ${path}`);
  const checkpoint = sandbox(["checkpoint", "--name", "Concrete-pre-catalog-snapshot-pricing-guard"]);
  fs.writeFileSync(`${OUT}/checkpoint-before.json`, JSON.stringify(checkpoint, null, 2));
  record({ event: "restore_checkpoint_created", checkpoint });
  const plans = new Map();
  for (const path of paths.filter(p => p !== HELPER)) {
    const make = old => JSON.stringify([{ old_text: old, new_text: desired.get(path), replace_all: false }]);
    let old = fresh.get(path).content;
    let diff;
    try { diff = sandbox(["edit", path, "--dry-run"], make(old)); }
    catch (error) {
      const detail = String(error) + String(error.stdout || "");
      if (!/old_text not found|EDIT_TEXT_NOT_FOUND/i.test(detail)) throw error;
      old = lf(old).replace(/\n/g, "\r\n");
      diff = sandbox(["edit", path, "--dry-run"], make(old));
    }
    plans.set(path, make(old));
    fs.writeFileSync(`${OUT}/dryrun-${path.split("/").at(-1)}.json`, JSON.stringify(diff, null, 2));
  }
  for (const path of paths) {
    try {
      const result = path === HELPER
        ? sandbox(["write", path], desired.get(path))
        : sandbox(["edit", path], plans.get(path));
      record({ event: "mutation_response", path, result });
    } catch (error) {
      // Never resend an ambiguous write. Only continue if its exact body landed.
      record({ event: "mutation_uncertain", path, error: String(error), stdout: String(error.stdout || "") });
      readback(path);
      continue;
    }
    readback(path);
  }
  const build = run("./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-catalog-pricing11.js --metafile=/tmp/ccs-foundation-catalog-pricing11-meta.json");
  fs.writeFileSync(`${OUT}/remote-build.json`, JSON.stringify(build, null, 2));
  await new Promise(resolve => setTimeout(resolve, 6000));
  const verifiedGit = run("git status --porcelain && git log -1 --format=%H");
  assert.match(verifiedGit.stdout.trim(), /^[a-f0-9]{40}$/);
  fs.writeFileSync(`${OUT}/remote-git.json`, JSON.stringify(verifiedGit, null, 2));
  appReady("verified");
  const final = sandbox(["checkpoint", "--name", "Concrete-catalog-snapshots-handoff-guard-verified"]);
  fs.writeFileSync(`${OUT}/checkpoint-after.json`, JSON.stringify(final, null, 2));
  appReady("checkpointed");
  record({ event: "verified_checkpoint_created", checkpoint: final });
  console.log(JSON.stringify({ appId: APP, branch: "main", sourceFiles: paths.length, checkpoint: final }, null, 2));
}
main().catch(error => {
  record({ event: "STOP", error: String(error), stdout: String(error.stdout || "") });
  console.error(error);
  process.exitCode = 1;
});
