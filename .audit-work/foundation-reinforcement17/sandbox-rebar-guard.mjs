import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const DIR = ".audit-work/foundation-reinforcement17";
const APP = "68dfcc5e57bbbc35387da97c";
const HEAD = "0727ffe5a7e7c9fdccbfd9998b61a6094ae2b2af";
const file = "src/components/estimator/foundation/foundationInputValidation.js";
const normalize = text => text.replace(/\r\n/g, "\n");
const hash = text => createHash("sha256").update(normalize(text)).digest("hex");
const read = name => JSON.parse(fs.readFileSync(`${DIR}/${name}`, "utf8"));
const save = (name, value) => fs.writeFileSync(`${DIR}/${name}`, JSON.stringify(value, null, 2) + "\n");
const original = normalize(read("guard-baseline.json").files.find(f => f.path === file).content);
const local = normalize(fs.readFileSync(file, "utf8"));
const body = JSON.stringify([{ old_text: original, new_text: local, replace_all: false }]);
function cli(args, input, artifact) {
  const result = spawnSync("npx.cmd", ["base44@latest", ...args, "--app-id", APP, "--branch", "main", "--json"], {
    shell: true, input, encoding: "utf8", maxBuffer: 8e6, timeout: 240000,
  });
  if (result.error) throw result.error;
  const value = JSON.parse(result.stdout);
  if (artifact) save(artifact, value);
  assert.equal(result.status, 0, JSON.stringify(value));
  assert.equal(value.error, undefined);
  return value;
}
function command(text, artifact) {
  const result = cli(["sandbox", "run", JSON.stringify(text)], undefined, artifact);
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(result.truncated, false);
  return result;
}
function source(artifact) {
  const result = cli(["sandbox", "read", file], undefined, artifact).files[0];
  assert.equal(result.error, undefined);
  return normalize(result.content);
}
const mode = process.argv[2];
if (mode === "preflight") {
  assert.equal(command("git status --short && git rev-parse HEAD", "preflight-state.json").stdout.trim(), HEAD);
  assert.equal(source("preflight-source.json"), original);
  cli(["sandbox", "edit", file, "--dry-run"], body, "edit-preview.json");
  save("reviewed-manifest.json", { appId: APP, branch: "main", beforeHead: HEAD, file, localSha256: hash(local) });
  console.log("Fresh one-file baseline and edit preview verified.");
} else if (mode === "apply") {
  const approval = read("lead-approval.json");
  assert.equal(approval.accepted, true);
  assert.equal(hash(local), read("reviewed-manifest.json").localSha256);
  assert.equal(command("git status --short && git rev-parse HEAD", "before-write-state.json").stdout.trim(), HEAD);
  assert.equal(source("before-write-source.json"), original);
  cli(["sandbox", "checkpoint", "--name", "Concrete-before-active-reinforcement-input-guard17"], undefined, "checkpoint-before.json");
  assert.equal(source("immediate-before-write.json"), original);
  try {
    cli(["sandbox", "edit", file], body, "source-edit.json");
  } catch (error) {
    save("uncertain-write.json", { message: error.message });
  }
  assert.equal(source("source-readback.json"), local, "Do not retry an uncertain write without inspecting content");
  console.log("One existing helper edited and exact LF-equivalent readback verified.");
} else if (mode === "build") {
  const text = "./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-rebar17.js --metafile=/tmp/ccs-foundation-rebar17-meta.json && node -e 'const fs=require(\"fs\"),a=require(\"assert/strict\"),m=JSON.parse(fs.readFileSync(\"/tmp/ccs-foundation-rebar17-meta.json\",\"utf8\"));for(const p of [\"src/pages/FoundationEstimator.jsx\",\"src/components/estimator/foundation/foundationInputValidation.js\",\"src/components/estimator/foundation/FoundationItemCard.jsx\",\"src/components/estimator/foundation/FoundationToolbar.jsx\",\"src/components/auth/EmailGate.jsx\"])a.ok(m.inputs[p],p);console.log(\"Verified actual page, rebar guard, card, toolbar and auth\");'";
  fs.writeFileSync(`${DIR}/remote-build-command.txt`, text + "\n");
  command(text, "remote-build.json");
  console.log("Remote actual-page dependency bundle verified.");
} else if (mode === "finish") {
  assert.equal(read("remote-build.json").exitCode, 0);
  assert.equal(read("remote-build.json").truncated, false);
  assert.equal(source("final-source-readback.json"), local);
  const git = command("git status --short && git diff --name-only " + HEAD + " HEAD && git rev-parse HEAD", "final-git.json");
  const lines = git.stdout.trim().split("\n");
  assert.deepEqual(lines.slice(0, -1), [file]);
  const checkpoint = cli(["sandbox", "checkpoint", "--name", "Concrete-active-reinforcement-input-guard-verified"], undefined, "checkpoint-after.json");
  const clean = command("git status --short && git rev-parse HEAD", "final-clean-state.json");
  assert.match(clean.stdout.trim(), /^[a-f0-9]{40}$/);
  save("activation-final.json", {
    appId: APP, branch: "main", head: clean.stdout.trim(), checkpoint, files: [file],
    remoteClean: true, remoteBuildExit: 0, published: false, businessRecordsTested: false, paidAiCalls: 0,
  });
  console.log(JSON.stringify(checkpoint));
} else throw new Error("Expected preflight, apply, build or finish.");
