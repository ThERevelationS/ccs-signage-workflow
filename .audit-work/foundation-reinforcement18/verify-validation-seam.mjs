import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = ".audit-work/foundation-reinforcement18/seam-checks";
const suites = [
  { name: "basic", source: ".audit-work/foundation-reinforcement16/verify-basic-inputs.mjs",
    needle: 'const dir = ".audit-work/foundation-reinforcement16";', variable: "dir", cases: 83, result: "financial-verification.json" },
  { name: "reinforcement", source: ".audit-work/foundation-reinforcement17/verify-reinforcement-inputs.mjs",
    needle: 'const DIR = ".audit-work/foundation-reinforcement17";', variable: "DIR", cases: 111, result: "financial-verification.json" },
  { name: "model", source: ".audit-work/foundation-reinforcement18/verify-model.mjs",
    needle: 'const DIR = ".audit-work/foundation-reinforcement18";', variable: "DIR", cases: 39, result: "model-verification.json" },
];
const results = [];
for (const suite of suites) {
  const dir = `${ROOT}/${suite.name}`;
  fs.mkdirSync(dir, { recursive: true });
  if (suite.name === "basic") {
    const input = fs.readFileSync(".audit-work/foundation-reinforcement16/basic-inputs-before.json", "utf8");
    const file = `${dir}/basic-inputs-before.json`;
    if (fs.existsSync(file)) assert.equal(fs.readFileSync(file, "utf8"), input);
    else fs.writeFileSync(file, input, { flag: "wx" });
  }
  const source = fs.readFileSync(suite.source, "utf8");
  assert.equal(source.split(suite.needle).length, 2);
  const file = `${dir}/verify.mjs`;
  fs.writeFileSync(file, source.replace(suite.needle, `const ${suite.variable} = "${dir}";`));
  const run = spawnSync(process.execPath, [path.resolve(file)], { encoding: "utf8", maxBuffer: 4e6 });
  fs.writeFileSync(`${dir}/run.txt`, run.stdout + run.stderr);
  assert.equal(run.status, 0, `${suite.name}: ${run.stderr}`);
  const checked = JSON.parse(fs.readFileSync(`${dir}/${suite.result}`, "utf8")).results;
  assert.equal(checked.length, suite.cases);
  assert.ok(checked.every(row => row.ok));
  results.push({ name: suite.name, cases: checked.length, exit: run.status, output: `${dir}/${suite.result}` });
  console.log(`${suite.name}: ${checked.length}/${suite.cases}`);
}
fs.writeFileSync(`${ROOT}/summary.json`, JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
