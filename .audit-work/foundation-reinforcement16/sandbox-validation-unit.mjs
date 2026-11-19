import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement16";
const APP = "68dfcc5e57bbbc35387da97c";
const HEAD = "6c06175812c0d5e078a2f7b23c25b4d7f7e711cb";
const helper = "src/components/estimator/foundation/foundationInputValidation.js";
// Install the combined page guard before the calculator changes its invalid-input output.
const paths = [
  helper, "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/pages/FoundationEstimator.jsx", "src/components/estimator/foundation/foundationCalc.js",
];
const normalize = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(normalize(text)).digest("hex");
const readJson = name => JSON.parse(fs.readFileSync(`${DIR}/${name}`, "utf8"));
const save = (name, data) => fs.writeFileSync(`${DIR}/${name}`, JSON.stringify(data, null, 2) + "\n");
const events = fs.existsSync(`${DIR}/activation-events.json`) ? readJson("activation-events.json") : [];
const event = (type, data) => {
  events.push({ at: new Date().toISOString(), type, ...data });
  save("activation-events.json", events);
};
function cli(args, input, artifact) {
  const result = spawnSync("npx.cmd", ["base44@latest", ...args, "--app-id", APP, "--branch", "main", "--json"], {
    shell: true, input, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 240000,
  });
  if (result.error) throw result.error;
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`CLI JSON failure (${result.status}): ${result.stderr.slice(-500)}`); }
  if (artifact) save(artifact, parsed);
  assert.equal(result.status, 0, JSON.stringify(parsed));
  if (parsed.error) throw new Error(JSON.stringify(parsed.error));
  return parsed;
}
function command(text, artifact) {
  // All commands are fixed here and only inspect source or write build output under /tmp.
  const value = cli(["sandbox", "run", JSON.stringify(text)], undefined, artifact);
  assert.equal(value.exitCode, 0, JSON.stringify(value));
  assert.equal(value.truncated, false);
  return value;
}
const baseline = readJson("fresh-validation-baselines.json");
const local = Object.fromEntries(paths.map(p => [p, normalize(fs.readFileSync(p, "utf8"))]));
const originals = Object.fromEntries(paths.filter(p => p !== helper).map(p => [
  p, normalize(baseline.files.find(f => f.path === p).content),
]));
const edits = Object.fromEntries(paths.filter(p => p !== helper).map(p => [
  p, JSON.stringify([{ old_text: originals[p], new_text: local[p], replace_all: false }]),
]));
const installed = (p, content) => {
  const value = normalize(content);
  return value === local[p] || (p === helper && value + "\n" === local[p]);
};
function compareBefore(remote, allowInstalled = false) {
  assert.equal(remote.files.length, paths.length);
  for (const p of paths) {
    const file = remote.files.find(f => f.path === p);
    assert.ok(file, p);
    if (p === helper && file.error?.code === "NOT_FOUND") continue;
    assert.equal(file.error, undefined, p);
    const content = normalize(file.content);
    if (allowInstalled && installed(p, content)) continue;
    assert.ok(p !== helper && content === originals[p], `Unexpected remote source drift: ${p}`);
  }
}
function readback(p) {
  const file = cli(["sandbox", "read", p], undefined, `readback-${p.split("/").at(-1)}.json`).files[0];
  assert.equal(file.error, undefined, p);
  assert.ok(installed(p, file.content), `Exact readback mismatch: ${p}`);
  event("exact_readback", { file: p, lfSha256: sha(file.content) });
}
const mode = process.argv[2];
if (mode === "preflight") {
  const state = command("git status --short && git rev-parse HEAD", "verified-preflight-state.json");
  assert.equal(state.stdout.trim(), HEAD);
  const remote = cli(["sandbox", "read", ...paths], undefined, "verified-preflight-source.json");
  compareBefore(remote);
  for (const p of paths.filter(p => p !== helper)) {
    cli(["sandbox", "edit", p, "--dry-run"], edits[p], `dry-run-${p.split("/").at(-1)}.json`);
  }
  save("reviewed-manifest.json", { appId: APP, branch: "main", beforeHead: HEAD, files: paths.map(p => ({ path: p, lfSha256: sha(local[p]) })) });
  console.log("Fresh source matches baseline; existing-file edits dry-run successfully.");
} else if (mode === "apply") {
  const approval = readJson("lead-approval.json");
  assert.equal(approval.accepted, true);
  const manifest = readJson("reviewed-manifest.json");
  for (const f of manifest.files) assert.equal(sha(local[f.path]), f.lfSha256, f.path);
  const before = command("git status --short && git rev-parse HEAD", "before-write-state.json");
  assert.match(before.stdout.trim(), /^[a-f0-9]{40}$/, "Remote worktree must be clean");
  const started = fs.existsSync(`${DIR}/checkpoint-before.json`);
  if (started) {
    const changed = command("git diff --name-only " + HEAD + " HEAD", "resume-scope.json");
    assert.ok(changed.stdout.trim().split("\n").filter(Boolean).every(p => paths.includes(p)), "Concurrent remote scope");
    assert.equal(readJson("checkpoint-before.json").gitCommitHash, HEAD);
  } else assert.equal(before.stdout.trim(), HEAD);
  compareBefore(cli(["sandbox", "read", ...paths], undefined, started ? "resume-source.json" : "before-write-source.json"), started);
  if (!started) {
    const restore = cli(["sandbox", "checkpoint", "--name", "Concrete-before-basic-input-validation16"], undefined, "checkpoint-before.json");
    event("restore_checkpoint", { result: restore });
  }
  for (const p of paths) {
    // Re-read immediately; never retry uncertain writes without inspecting their result.
    const current = cli(["sandbox", "read", p]).files[0];
    if (!current.error && installed(p, current.content)) {
      readback(p);
      event("already_installed_no_rewrite", { file: p });
      continue;
    }
    if (p === helper) assert.equal(current.error?.code, "NOT_FOUND");
    else assert.equal(normalize(current.content), originals[p], `Concurrent change: ${p}`);
    let failure;
    try {
      const result = p === helper
        ? cli(["sandbox", "write", p], local[p], "helper-write.json")
        : cli(["sandbox", "edit", p], edits[p], `edit-${p.split("/").at(-1)}.json`);
      event("source_write", { file: p, result });
    } catch (error) {
      failure = error;
      event("uncertain_write", { file: p, message: error.message });
    }
    readback(p);
    if (failure) event("uncertain_write_confirmed_landed", { file: p });
  }
  const after = cli(["sandbox", "read", ...paths], undefined, "exact-final-readback.json");
  for (const p of paths) assert.ok(installed(p, after.files.find(f => f.path === p).content), p);
  console.log("Four sources written with exact readbacks. Build and final checkpoint still pending.");
} else if (mode === "build") {
  const text = "./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-validation16.js --metafile=/tmp/ccs-foundation-validation16-meta.json && node -e 'const fs=require(\"fs\"),a=require(\"assert/strict\");const m=JSON.parse(fs.readFileSync(\"/tmp/ccs-foundation-validation16-meta.json\",\"utf8\"));for(const p of [\"src/pages/FoundationEstimator.jsx\",\"src/components/estimator/foundation/foundationInputValidation.js\",\"src/components/estimator/foundation/FoundationItemCard.jsx\",\"src/components/auth/EmailGate.jsx\",\"src/components/estimator/foundation/FoundationToolbar.jsx\"])a.ok(Object.hasOwn(m.inputs,p),p);console.log(\"Verified actual page, validator, card, auth and toolbar inputs\");'";
  fs.writeFileSync(`${DIR}/remote-build-command.txt`, text + "\n");
  command(text, "remote-build.json");
  console.log("Remote real-page dependency build verified.");
} else if (mode === "finish") {
  const build = readJson("remote-build.json");
  assert.equal(build.exitCode, 0);
  assert.equal(build.truncated, false);
  const remote = cli(["sandbox", "read", ...paths], undefined, "checkpoint-source-readback.json");
  for (const p of paths) assert.ok(installed(p, remote.files.find(f => f.path === p).content), p);
  const status = command("git status --short && git diff --name-only " + HEAD + " HEAD && git rev-parse HEAD", "checkpoint-git.json");
  const lines = status.stdout.trim().split("\n");
  assert.deepEqual(lines.slice(0, -1).sort(), [...paths].sort(), "Changed source scope must be exactly the reviewed four files");
  const checkpoint = cli(["sandbox", "checkpoint", "--name", "Concrete-basic-input-validation-saved-price-preservation-verified"], undefined, "checkpoint-after.json");
  const clean = command("git status --short && git rev-parse HEAD", "final-clean-state.json");
  assert.match(clean.stdout.trim(), /^[a-f0-9]{40}$/);
  save("activation-final.json", {
    appId: APP, branch: "main", head: clean.stdout.trim(), files: paths, checkpoint,
    remoteClean: true, readbackNormalization: "LF-equivalent exact content; optional final LF for new helper only", remoteBuildExit: 0,
    published: false, businessRecordsTested: false, paidAiCalls: 0,
  });
  console.log(JSON.stringify(checkpoint));
} else {
  throw new Error("Expected preflight, apply, build or finish; no action taken.");
}
