import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const DIR = ".audit-work/estimator-invokellm-policy";
const APP = "68dfcc5e57bbbc35387da97c";
const HEAD = "0a01139628455aa8a0a6dac3e155513bb2d35fab";
const policy = "base44/shared/estimatorAiModelPolicy.js";
const read = name => JSON.parse(fs.readFileSync(`${DIR}/${name}`, "utf8"));
const save = (name, value) => fs.writeFileSync(`${DIR}/${name}`, JSON.stringify(value, null, 2) + "\n");
const normalize = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(normalize(text)).digest("hex");
const baseline = read("source-baseline.json").files;
const files = [policy, ...baseline.filter(f => !f.error).map(f => f.path)];
const local = Object.fromEntries(files.map(file => [file, normalize(fs.readFileSync(file, "utf8"))]));
const originals = Object.fromEntries(baseline.filter(f => !f.error).map(f => [f.path, normalize(f.content)]));
const installed = (file, text) => normalize(text) === local[file]
  || (file === policy && normalize(text) + "\n" === local[file]);
function cli(args, input, artifact) {
  const r = spawnSync("npx.cmd", ["base44@latest", ...args, "--app-id", APP, "--branch", "main", "--json"], {
    shell: true, input, encoding: "utf8", maxBuffer: 8e6, timeout: 240000,
  });
  if (r.error) throw r.error;
  const result = JSON.parse(r.stdout);
  if (artifact) save(artifact, result);
  assert.equal(r.status, 0, JSON.stringify(result));
  assert.equal(result.error, undefined);
  return result;
}
function command(text, artifact) {
  const result = cli(["sandbox", "run", JSON.stringify(text)], undefined, artifact);
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(result.truncated, false);
  return result;
}
function beforeSource(result) {
  for (const file of files) {
    const current = result.files.find(f => f.path === file);
    assert.ok(current, file);
    if (file === policy) assert.equal(current.error?.code, "NOT_FOUND", "Concurrent/new shared policy");
    else {
      assert.equal(current.error, undefined, file);
      assert.equal(normalize(current.content), originals[file], `Remote source drift: ${file}`);
    }
  }
}
function exactReadback(file, artifact) {
  const result = cli(["sandbox", "read", file], undefined, artifact).files[0];
  assert.equal(result.error, undefined, file);
  assert.ok(installed(file, result.content), `Readback mismatch: ${file}`);
}
function editBody(file) {
  const shape = JSON.parse(read("stored-source-shape.json").stdout).find(row => row.file === file);
  assert.equal(shape.normalizedSha256, sha(originals[file]), file);
  const eol = shape.crlf ? "\r\n" : "\n";
  const foundation = file.includes("/foundation/");
  const importAnchor = foundation ? 'import ReactMarkdown from "react-markdown";' : 'import { base44 } from "@/api/base44Client";';
  const relative = foundation ? "../../../../" : "../../../";
  const edits = [{
    old_text: importAnchor,
    new_text: importAnchor + eol + `import { ESTIMATOR_AI_MODEL } from "${relative}base44/shared/estimatorAiModelPolicy.js";`,
  }];
  if (file.endsWith("AddressAutocomplete.jsx")) {
    edits.push({ old_text: 'model: "gemini_3_flash"', new_text: "model: ESTIMATOR_AI_MODEL" });
  } else {
    const indent = file.includes("/vinylEstimator/") ? "    " : "        ";
    edits.push({
      old_text: "base44.integrations.Core.InvokeLLM({",
      new_text: "base44.integrations.Core.InvokeLLM({" + eol + indent + "model: ESTIMATOR_AI_MODEL,",
    });
  }
  if (!foundation) edits.push({ old_text: "import React, {", new_text: "import {" });
  for (const edit of edits) {
    assert.equal(originals[file].split(edit.old_text).length, 2, "Edit anchor must be unique: " + file);
  }
  return JSON.stringify(edits);
}
const mode = process.argv[2];
if (mode === "inspect-lines") {
  const entries = files.filter(file => file !== policy);
  const text = `node -e 'const fs=require("fs"),c=require("crypto"),r=${JSON.stringify(entries)}.map(file=>{const s=fs.readFileSync(file,"utf8"),crlf=s.split(String.fromCharCode(13,10)).length-1,lf=s.split(String.fromCharCode(10)).length-1,n=s.replaceAll(String.fromCharCode(13,10),String.fromCharCode(10));return{file,crlf,lf,normalizedSha256:c.createHash("sha256").update(n).digest("hex")};});console.log(JSON.stringify(r));'`;
  const result = command(text, "stored-source-shape.json");
  for (const row of JSON.parse(result.stdout)) {
    assert.equal(row.normalizedSha256, sha(originals[row.file]), row.file);
    assert.ok(row.crlf === 0 || row.crlf === row.lf, "Mixed stored line endings require review");
  }
  console.log(result.stdout);
} else if (mode === "preflight") {
  assert.equal(command("git status --short && git rev-parse HEAD", "preflight-state.json").stdout.trim(), HEAD);
  beforeSource(cli(["sandbox", "read", ...files], undefined, "preflight-source.json"));
  for (const file of files.filter(f => f !== policy)) {
    cli(["sandbox", "edit", file, "--dry-run"], editBody(file), `preview-${file.split("/").at(-1)}.json`);
  }
  save("reviewed-manifest.json", {
    appId: APP, branch: "main", head: HEAD,
    files: files.map(file => ({ file, sha256: sha(local[file]) })),
  });
  console.log("Fresh seven-file scope and six edit previews verified.");
} else if (mode === "apply") {
  assert.equal(read("lead-approval.json").accepted, true);
  for (const entry of read("reviewed-manifest.json").files) assert.equal(sha(local[entry.file]), entry.sha256, entry.file);
  assert.equal(command("git status --short && git rev-parse HEAD", "before-write-state.json").stdout.trim(), HEAD);
  beforeSource(cli(["sandbox", "read", ...files], undefined, "before-write-source.json"));
  cli(["sandbox", "checkpoint", "--name", "Estimator-before-InvokeLLM-Sol-model-policy"], undefined, "checkpoint-before.json");
  beforeSource(cli(["sandbox", "read", ...files], undefined, "immediate-before-write.json"));
  const events = [];
  for (const file of files) {
    try {
      const result = file === policy
        ? cli(["sandbox", "write", file], local[file], "policy-write.json")
        : cli(["sandbox", "edit", file], editBody(file), `edit-${file.split("/").at(-1)}.json`);
      events.push({ file, result });
    } catch (error) {
      events.push({ file, uncertain: true, message: error.message });
    }
    save("activation-events.json", events);
    exactReadback(file, `readback-${file.split("/").at(-1)}.json`);
  }
  console.log("Shared policy plus six existing callers applied and read back exactly.");
} else if (mode === "build") {
  const entries = files.filter(f => f !== policy);
  const flags = "--bundle --format=esm --platform=browser --jsx=automatic --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src";
  const text = "ls /tmp >/dev/null && mkdir -p /tmp/ccs-estimator-sol-policy && "
    + `./node_modules/.bin/esbuild ${entries.join(" ")} ${flags} --outdir=/tmp/ccs-estimator-sol-policy --metafile=/tmp/ccs-estimator-sol-components.json && `
    + `./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx ${flags} --outfile=/tmp/ccs-estimator-sol-page.js --metafile=/tmp/ccs-estimator-sol-page.json && `
    + `node -e 'const fs=require("fs"),a=require("assert/strict"),m=JSON.parse(fs.readFileSync("/tmp/ccs-estimator-sol-components.json","utf8")),p=JSON.parse(fs.readFileSync("/tmp/ccs-estimator-sol-page.json","utf8"));const entries=${JSON.stringify(entries)};const outputs=Object.values(m.outputs).filter(o=>o.entryPoint);a.deepEqual(outputs.map(o=>o.entryPoint).sort(),entries.slice().sort());for(const o of outputs)a.ok(o.inputs["${policy}"],o.entryPoint);for(const f of ["${policy}","src/pages/FoundationEstimator.jsx","src/components/estimator/foundation/FoundationItemCard.jsx","src/components/estimator/foundation/FoundationToolbar.jsx","src/components/auth/EmailGate.jsx"])a.ok(p.inputs[f],f);console.log("Six real caller bundles and page include canonical policy; no LLM invoked");'`;
  fs.writeFileSync(`${DIR}/remote-build-command.txt`, text + "\n");
  command(text, "remote-build.json");
  console.log("Remote six-caller and actual-page dependency bundles verified.");
} else if (mode === "preview-status") {
  const r = spawnSync("npx.cmd", [
    "base44@latest", "api", "fetch", "GET", `/api/apps/${APP}/sandbox/preview-url`,
    "--app-id", APP, "--json",
  ], { shell: true, encoding: "utf8", maxBuffer: 2e6, timeout: 240000 });
  assert.equal(r.status, 0, "Preview metadata request failed; never print its credential-bearing body.");
  const value = JSON.parse(r.stdout);
  assert.equal(typeof value.preview_url, "string");
  assert.equal(typeof value.sandbox_info?.cold_start, "boolean");
  const url = new URL(/^https?:/.test(value.preview_url) ? value.preview_url : "https://" + value.preview_url);
  const sanitized = {
    appId: APP, branch: "main", previewMetadataVerified: true, host: url.hostname,
    coldStart: value.sandbox_info.cold_start, bridgeInjected: value.bridge_injected,
    checkedAt: new Date().toISOString(), tokenPersisted: false, businessPageOpened: false,
  };
  save("preview-status.json", sanitized);
  console.log(JSON.stringify(sanitized));
} else if (mode === "finish") {
  assert.equal(read("remote-build.json").exitCode, 0);
  assert.equal(read("remote-build.json").truncated, false);
  const readback = cli(["sandbox", "read", ...files], undefined, "final-source-readback.json");
  for (const file of files) {
    const found = readback.files.find(f => f.path === file);
    assert.equal(found.error, undefined, file);
    assert.ok(installed(file, found.content), file);
  }
  const git = command("git status --short && git diff --name-only " + HEAD + " HEAD && git rev-parse HEAD", "final-git.json");
  const lines = git.stdout.trim().split("\n");
  assert.deepEqual(lines.slice(0, -1).sort(), files.slice().sort(), "Unexpected remote changes; do not checkpoint mixed work");
  const checkpoint = cli(["sandbox", "checkpoint", "--name", "Estimator-InvokeLLM-GPT61-Sol-policy-verified"], undefined, "checkpoint-after.json");
  const state = command("git status --short && git rev-parse HEAD", "final-clean-state.json");
  assert.match(state.stdout.trim(), /^[a-f0-9]{40}$/);
  save("activation-final.json", {
    appId: APP, branch: "main", head: state.stdout.trim(), checkpoint, files,
    requestedModel: "gpt_6_sol", servedModelVerified: false, realProviderCalls: 0,
    remoteBuildExit: 0, remoteClean: true, published: false, businessRecordsTested: false, paidAiCalls: 0,
  });
  console.log(JSON.stringify(checkpoint));
} else throw new Error("Expected preflight, apply, build or finish.");
