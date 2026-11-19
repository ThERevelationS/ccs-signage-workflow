// Mocked-boundary verification for activate-reviewed.cjs — no CLI calls.
// Stubs latest-cli transport + fs reads for the 8 file paths; exercises the 4 guard cases.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const OUT = ".audit-work/foundation-materials14";
const APP = "68dfcc5e57bbbc35387da97c";
const helper = fs.readFileSync(`${OUT}/activate-reviewed.cjs`, "utf8");
const baselines = ["fresh-baselines", "ui-baselines"].flatMap(name =>
  JSON.parse(fs.readFileSync(`${OUT}/${name}.json`, "utf8")).files);
const sourcePaths = Object.keys(JSON.parse(fs.readFileSync(`${OUT}/lead-approval.json`, "utf8")).files);
const schemaPath = sourcePaths[0];
const storedSchema = JSON.parse(fs.readFileSync(`${OUT}/readback-FoundationProject.jsonc.json`, "utf8"))
  .files.find(row => row.path === schemaPath).content;

async function runCase(name, flags, mutation, errorPattern) {
  const rows = sourcePaths.map(file => ({
    path: file,
    content: file === schemaPath ? storedSchema : baselines.find(row => row.path === file).content,
  }));
  mutation?.(rows);
  const writes = new Map();
  const messages = [];
  const fakeProcess = { argv: ["node", "activate-reviewed.cjs", ...flags], exitCode: 0 };
  const fakeFs = {
    readFileSync: (...args) => fs.readFileSync(...args),
    existsSync: (...args) => fs.existsSync(...args),
    writeFileSync: (file, value) => writes.set(file, value),
  };
  const latest = args => {
    if (args[0] === "api" && args[1] === "fetch" && args[2] === "GET") {
      assert.equal(args[3], `/api/apps/${APP}`);
      return JSON.stringify({ id: APP, status: { state: "ready" } });
    }
    assert.equal(args[0], "sandbox");
    assert.ok(args.includes(APP));
    assert.ok(args.includes("--json"));
    if (args[1] === "read") return JSON.stringify({ files: rows });
    assert.equal(args[1], "run", "Unexpected mutation command in read-only preflight");
    if (args[2] === "git status --porcelain") {
      return JSON.stringify({ exitCode: 0, truncated: false, stdout: "" });
    }
    assert.equal(args[2], "git rev-parse HEAD");
    return JSON.stringify({ exitCode: 0, truncated: false, stdout: "a".repeat(40) });
  };
  const context = vm.createContext({
    require: name => name === "node:fs" ? fakeFs
      : name.endsWith("/latest-cli.cjs") ? latest : require(name),
    process: fakeProcess,
    console: { log: (...args) => messages.push(args.join(" ")), error: error => messages.push(String(error)) },
    setTimeout,
  });
  const source = helper.replace("main().catch(error => {", "globalThis.finished = main().catch(error => {");
  assert.notEqual(source, helper, "Completion probe must attach to the real main promise");
  vm.runInContext(source, context);
  await context.finished;
  if (errorPattern) {
    assert.equal(fakeProcess.exitCode, 1, name);
    assert.match(messages.join("\n"), errorPattern, name);
  } else {
    assert.equal(fakeProcess.exitCode, 0, messages.join("\n"));
    assert.ok(messages.some(message => message.includes("Read-only preflight passed")), name);
  }
  assert.ok([...writes.keys()].every(file => file.startsWith(OUT + "/")), name);
  console.log("ok", name);
}

(async () => {
  await runCase("resume accepts only the known schema plus seven original sources", ["--resume"]);
  await runCase("resume rejects an unreviewed schema property", ["--resume"], rows => {
    rows[0].content = rows[0].content.replace('"version"', '"versionXXX"');
  }, /Resume schema text differs/);
  await runCase("resume rejects frontend drift", ["--resume"], rows => {
    rows[1].content += "\n// unreviewed";
  }, /Concurrent source drift/);
  await runCase("ordinary preflight still rejects an already-modified schema", [], null,
    /Concurrent source drift/);
  console.log("PASS activation resume guards=4; no real CLI or filesystem writes");
})().catch(error => { console.error(error); process.exitCode = 1; });
