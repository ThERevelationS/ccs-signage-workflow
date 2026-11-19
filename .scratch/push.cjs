// Push a local scratch file to the remote sandbox via `sandbox write` stdin.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const APP = "68dfcc5e57bbbc35387da97c";
const f = process.argv[2];
if (!f) { console.error("usage: node push.cjs <path>"); process.exit(1); }
const local = path.join(__dirname, "remote", f);
const content = fs.readFileSync(local);
const out = execSync(
  `npx base44@latest sandbox write "${f}" --app-id ${APP} --branch main --overwrite --json`,
  { cwd: path.join(__dirname, ".."), input: content, maxBuffer: 50 * 1024 * 1024 }
).toString();
console.log(`pushed ${f}: ${out.trim().slice(-200)}`);
