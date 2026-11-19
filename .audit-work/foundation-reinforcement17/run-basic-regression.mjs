import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = fs.readFileSync(".audit-work/foundation-reinforcement16/verify-basic-inputs.mjs", "utf8");
const needle = 'const dir = ".audit-work/foundation-reinforcement16";';
assert.ok(source.includes(needle));
const out = ".audit-work/foundation-reinforcement17/basic-regression";
fs.mkdirSync(out, { recursive: true });
const frozen = fs.readFileSync(".audit-work/foundation-reinforcement16/basic-inputs-before.json", "utf8");
if (fs.existsSync(`${out}/basic-inputs-before.json`)) {
  assert.equal(fs.readFileSync(`${out}/basic-inputs-before.json`, "utf8"), frozen);
} else fs.writeFileSync(`${out}/basic-inputs-before.json`, frozen, { flag: "wx" });
fs.writeFileSync(`${out}/verify-basic-inputs.mjs`, source.replace(needle, `const dir = "${out}";`));
await import(pathToFileURL(path.resolve(`${out}/verify-basic-inputs.mjs`)));
